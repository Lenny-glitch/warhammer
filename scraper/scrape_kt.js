#!/usr/bin/env node
/**
 * Kill Team Wahapedia Scraper
 *
 * Usage: node scraper/scrape_kt.js
 * Output: scraped-data/kt-{faction}.json
 *         scraped-data/kt-scrape-report.txt
 *
 * Fetches Kill Team operative datasheets from Wahapedia.
 * Review output JSON before running write_firebase_kt.js.
 *
 * Scraped stat schema matches the roster app's unit model:
 *   stats: { APL, MOVE, DF, SAVE, WOUNDS }
 *   weapons: [{ id, name, type, isDefault, profiles: { ATK, HIT, DMG, WR } }]
 *
 * DF is always "3" — Wahapedia KT3 pages do not list it as a variable stat.
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const FACTIONS = [
  {
    internalId: 'ork-kommandos',
    name:       'Ork Kommandos',
    url:        'https://wahapedia.ru/kill-team3/kill-teams/kommandos/',
    outFile:    'kt-ork-kommandos.json',
    roleStrip:  { from: 'start', text: 'Kommando ' },
  },
  {
    internalId: 'tau-pathfinders',
    name:       'Tau Pathfinders',
    url:        'https://wahapedia.ru/kill-team3/kill-teams/pathfinders/',
    outFile:    'kt-tau-pathfinders.json',
    // Drones don't carry the suffix — roleStrip only runs when it matches
    roleStrip:  { from: 'end', text: ' Pathfinder' },
  },
  {
    internalId: 'void-dancer-troupe',
    name:       'Void-dancer Troupe',
    url:        'https://wahapedia.ru/kill-team3/kill-teams/void-dancer-troupe/',
    outFile:    'kt-void-dancer-troupe.json',
    roleStrip:  null,
  },
  {
    internalId: 'legionary',
    name:       'Legionary',
    url:        'https://wahapedia.ru/kill-team3/kill-teams/legionary/',
    outFile:    'kt-legionary.json',
    roleStrip:  { from: 'start', text: 'Legionary ' },
  },
  {
    internalId: 'kasrkin',
    name:       'Kasrkin',
    url:        'https://wahapedia.ru/kill-team3/kill-teams/kasrkin/',
    outFile:    'kt-kasrkin.json',
    roleStrip:  { from: 'start', text: 'Kasrkin ' },
  },
  {
    internalId: 'hand-of-the-archon',
    name:       'Hand of the Archon',
    url:        'https://wahapedia.ru/kill-team3/kill-teams/hand-of-the-archon/',
    outFile:    'kt-hand-of-the-archon.json',
    // All operatives are "Kabalite X" → role "X"
    roleStrip:  { from: 'start', text: 'Kabalite ' },
  },
];

const SCRAPER_DIR = __dirname;
const OUT_DIR     = path.join(SCRAPER_DIR, '..', 'scraped-data');
const REPORT_FILE = path.join(OUT_DIR, 'kt-scrape-report.txt');

// ─── HTTP fetch ───────────────────────────────────────────────────────────────

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; kt-scraper/1.0)' },
      timeout: 30000,
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAll(str, re) {
  return [...str.matchAll(re)];
}

function toKebab(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Operative section splitter ───────────────────────────────────────────────

/**
 * Split page HTML into per-operative sections.
 * Each operative is wrapped in <a name="..."></a> followed by
 * <div class="pagebreak"> or directly <div class="dsOuterFrame">.
 * Non-operative anchors (Books, Datacards, section headers) are filtered out.
 */
function splitOperatives(html) {
  const operatives = [];

  // Match anchor + immediately following pagebreak/dsOuterFrame div
  const anchorRe = /<a name="([A-Za-z][A-Za-z0-9'\-]{2,80})"><\/a>\s*(?:<div[^>]*>)*\s*<div class="dsOuterFrame"/g;
  const matches  = matchAll(html, anchorRe);

  // Known non-operative anchors to skip
  const SKIP_ANCHORS = new Set([
    'Books', 'Datacards', 'Operatives', 'Ploys', 'Equipment',
    'Strategic-Ploys', 'Tactical-Ploys', 'Tac-Ops', 'Spec-Ops',
  ]);

  for (let i = 0; i < matches.length; i++) {
    const m    = matches[i];
    const slug = m[1];
    if (SKIP_ANCHORS.has(slug)) continue;

    const start = m.index;
    const end   = i + 1 < matches.length ? matches[i + 1].index : html.length;
    operatives.push({ slug, html: html.slice(start, end) });
  }

  return operatives;
}

// ─── Name extraction ──────────────────────────────────────────────────────────

/**
 * Extract display name from <h3 class="pTable_h3"><div>NAME</div></h3>.
 * Takes first match (the non-mobile version).
 */
function extractName(opHtml) {
  const m = opHtml.match(/class="pTable_h3"><div>([^<]+)/);
  if (!m) return null;
  return stripTags(m[1]).trim();
}

/**
 * Derive "role" from display name by stripping a configured faction word.
 *   { from: 'start', text: 'Kommando ' } → strip leading "Kommando "
 *   { from: 'end',   text: ' Pathfinder' } → strip trailing " Pathfinder"
 */
function deriveRole(name, roleStrip) {
  if (!roleStrip || !roleStrip.text) return name;
  if (roleStrip.from === 'start' && name.startsWith(roleStrip.text)) {
    return name.slice(roleStrip.text.length);
  }
  if (roleStrip.from === 'end' && name.endsWith(roleStrip.text)) {
    return name.slice(0, -roleStrip.text.length);
  }
  return name;
}

// ─── Stats extraction ─────────────────────────────────────────────────────────

/**
 * Extract stats from the pHeaderRow table.
 * Returns { APL, MOVE, DF, SAVE, WOUNDS } — DF always "3" (not on page).
 *
 * HTML structure per stat:
 *   <td class="pCell...">STATNAME<div class="dsStat"><img...>VALUE[<span class="dsPlus">+</span>]</div></td>
 */
function extractStats(opHtml) {
  const stats  = { APL: null, MOVE: null, DF: '3', SAVE: null, WOUNDS: null };
  const pCellRe = /class="pCell[^"]*">([A-Z']+)<div class="dsStat"><img[^>]+>([^<]*(?:<span class="dsPlus">\+<\/span>)?)/g;

  for (const m of matchAll(opHtml, pCellRe)) {
    const key = m[1].trim();
    // Reconstruct value: raw text + '+' if dsPlus span present
    let val = m[2].replace(/<span class="dsPlus">\+<\/span>/, '+').trim();
    // Strip any leftover tags
    val = stripTags(val);
    if (key === 'APL')    stats.APL    = val;
    if (key === 'MOVE')   stats.MOVE   = val;
    if (key === 'SAVE')   stats.SAVE   = val;
    if (key === 'WOUNDS') stats.WOUNDS = val;
  }

  return stats;
}

// ─── Weapons extraction ───────────────────────────────────────────────────────

/**
 * Parse weapons from the wTable / tbody.bkg structure.
 *
 * Each weapon occupies one <tbody class="bkg ..."> block containing:
 *   - Long row (wTable2_long): weapon type icon (wsDataRanged / wsDataMelee) + name
 *   - Short row: name again, then ATK / HIT / DMG in <div class="ct">, then WR text
 */
function extractWeapons(opHtml) {
  const weapons = [];

  // Find the weapon table
  const tableMatch = opHtml.match(/<div class="wtOuterFrame">[\s\S]*?<table class="wTable"/);
  if (!tableMatch) return weapons;

  // Get just the weapon table section (up to the abilities/keywords section)
  const tableStart = opHtml.indexOf('<div class="wtOuterFrame">');
  const tableEnd   = opHtml.indexOf('<div class="wtOuterFrame Columns2">', tableStart);
  const tableHtml  = tableEnd > tableStart
    ? opHtml.slice(tableStart, tableEnd)
    : opHtml.slice(tableStart, tableStart + 10000);

  // Live Wahapedia uses class=" bkg" (leading space); MHT used "bkg bkg0"
  const tbodyRe = /<tbody[^>]*class="[^"]*bkg[^"]*"[^>]*>([\s\S]*?)<\/tbody>/g;

  for (const tbodyMatch of matchAll(tableHtml, tbodyRe)) {
    const tbody = tbodyMatch[1];

    // Determine type from long row icon class
    const isRanged = /wsDataRanged/.test(tbody);
    const isMelee  = /wsDataMelee/.test(tbody);
    if (!isRanged && !isMelee) continue;

    const type = isRanged ? 'ranged' : 'melee';

    // Find the data row — identified by the presence of wTable2_short (name cell).
    // The long header row uses wTable2_long but no wTable2_short.
    // The short data row has both: wTable2_long (empty spacer) + wTable2_short (name + stats).
    const shortRowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    const rows = matchAll(tbody, shortRowRe);

    for (const rowMatch of rows) {
      const row = rowMatch[0];
      // Short row has wTable2_short; long row does not
      if (!row.includes('wTable2_short')) continue;

      // Weapon name: from wTable2_short cell with <span>
      const nameM = row.match(/class="wTable2_short pad2626"><span[^>]*>([\s\S]*?)<\/span>/);
      if (!nameM) continue;
      const name = stripTags(nameM[1]).trim();
      if (!name) continue;

      // ATK, HIT, DMG from ct divs (in order)
      const ctVals = matchAll(row, /<div class="ct pad2626">([^<]*)<\/div>/g).map(m => m[1].trim());
      if (ctVals.length < 3) continue;

      const [atk, hit, dmg] = ctVals;

      // WR: from wTable1_short span (the mobile version, same content as long)
      const wrShortM = row.match(/class="wTable1_short pad2626"[^>]*>([\s\S]*?)<\/td>/);
      const wrRaw    = wrShortM ? stripTags(wrShortM[1]).trim() : '';
      const wr       = wrRaw === '-' ? '' : wrRaw;

      weapons.push({
        id:   toKebab(name),
        name,
        type,
        isDefault: false,  // set after parsing all weapons (first = default)
        profiles: { ATK: atk, HIT: hit, DMG: dmg, WR: wr },
      });
    }
  }

  // Mark the first weapon of each type as default
  const seenRanged = false;
  const seenMelee  = false;
  let firstRanged  = true;
  let firstMelee   = true;

  for (const w of weapons) {
    if (w.type === 'ranged' && firstRanged) {
      w.isDefault  = true;
      firstRanged  = false;
    }
    if (w.type === 'melee' && firstMelee) {
      w.isDefault  = true;
      firstMelee   = false;
    }
  }

  // Deduplicate weapon IDs
  const seen = {};
  for (const w of weapons) {
    if (seen[w.id]) {
      seen[w.id]++;
      w.id = w.id + '-' + seen[w.id];
    } else {
      seen[w.id] = 1;
    }
  }

  return weapons;
}

// ─── Abilities extraction ─────────────────────────────────────────────────────

/**
 * Extract abilities from the Columns2 section (after weapon table).
 * Two formats:
 *   Action: <div class="stratWrapper..."><h3 class="h_actions_ds">NAME<span>AP</span></h3>
 *              <div><div class="actionEffect">DESC</div>...</div></div>
 *   Passive: <span class="redfont">NAME</span><b>: </b>DESC
 */
function extractAbilities(opHtml) {
  const abilities = [];

  // Find the abilities section (Columns2 div after the weapon table)
  const abStart = opHtml.indexOf('<div class="wtOuterFrame Columns2">');
  if (abStart < 0) return abilities;

  // End at the keywords table
  const abEnd = opHtml.indexOf('<table class="dsKeywords"', abStart);
  const abHtml = abEnd > abStart
    ? opHtml.slice(abStart, abEnd)
    : opHtml.slice(abStart, abStart + 8000);

  // Action abilities
  const actionRe = /<div class="stratWrapper[^"]*"[^>]*>([\s\S]*?)<div class="a_indent"><\/div>/g;
  for (const m of matchAll(abHtml, actionRe)) {
    const block = m[1];

    const nameM = block.match(/class="h_actions_ds">([^<]+)<span>([^<]+)<\/span>/);
    if (!nameM) continue;
    const abilityName = stripTags(nameM[1]).trim();
    const apCost      = stripTags(nameM[2]).trim();

    const effectM = block.match(/<div class="actionEffect">([\s\S]*?)<\/div>/);
    const effect  = effectM ? stripTags(effectM[1]).trim() : '';

    const condM = block.match(/<div class="actionConditions">([\s\S]*?)<\/div>/);
    const cond  = condM ? stripTags(condM[1]).trim() : '';

    abilities.push({
      name:        abilityName,
      type:        'action',
      apCost,
      description: cond ? `${effect} ${cond}`.trim() : effect,
    });
  }

  // Passive abilities: <span class="redfont">NAME</span><b>: </b>DESCRIPTION
  const passiveRe = /<span class="redfont">([^<]+)<\/span><b>:\s*<\/b>([\s\S]*?)(?=<span class="redfont">|<div class="stratWrapper|<table class="dsKeywords|<\/div>)/g;
  for (const m of matchAll(abHtml, passiveRe)) {
    const abilityName = stripTags(m[1]).trim();
    const desc        = stripTags(m[2]).trim();
    if (!abilityName) continue;
    abilities.push({
      name:        abilityName,
      type:        'passive',
      description: desc,
    });
  }

  return abilities;
}

// ─── Keywords extraction ──────────────────────────────────────────────────────

/**
 * Extract keywords from <span class="dsKeywordData">...</span>.
 * Returns array of uppercase keyword strings.
 */
function extractKeywords(opHtml) {
  const m = opHtml.match(/class="dsKeywordData"[^>]*>([\s\S]*?)<\/span>\s*<\/div>/);
  if (!m) return [];
  return stripTags(m[1])
    .split(',')
    .map(k => k.trim().toUpperCase())
    .filter(Boolean);
}

// ─── Base size ────────────────────────────────────────────────────────────────

function extractBaseSize(opHtml) {
  const m = opHtml.match(/⌀(\d+(?:\.\d+)?)\s*mm/);
  return m ? `⌀${m[1]}mm` : null;
}

// ─── Parse one operative ──────────────────────────────────────────────────────

function parseOperative(slug, opHtml, faction) {
  const warnings = [];

  const name = extractName(opHtml);
  if (!name) {
    warnings.push('name not found');
    return null;
  }

  const role     = deriveRole(name, faction.roleStrip);
  const stats    = extractStats(opHtml);
  const weapons  = extractWeapons(opHtml);
  const abilities = extractAbilities(opHtml);
  const keywords = extractKeywords(opHtml);
  const baseSize = extractBaseSize(opHtml);
  const id       = toKebab(role);

  if (!stats.APL)    warnings.push('APL not found');
  if (!stats.MOVE)   warnings.push('MOVE not found');
  if (!stats.SAVE)   warnings.push('SAVE not found');
  if (!stats.WOUNDS) warnings.push('WOUNDS not found');
  if (weapons.length === 0) warnings.push('no weapons found');

  return {
    id,
    name,
    gameSystem:  'kill-team',
    faction:     faction.name,
    factionId:   faction.internalId,
    role,
    points:      null,  // KT3 uses count-based selection, not points
    countsAs:    1,     // override manually for special operatives (MB3 Recon Drone = 2, Bomb Squig = 0.5)
    stats: {
      APL:    stats.APL    || '',
      MOVE:   stats.MOVE   || '',
      DF:     '3',  // universal default — Wahapedia KT3 pages don't list this
      SAVE:   stats.SAVE   || '',
      WOUNDS: stats.WOUNDS || '',
    },
    weapons,
    abilities,
    keywords,
    baseSize:    baseSize || null,
    source:      'scraper',  // 'scraper' | 'user' — lets the app distinguish AI-generated vs human-authored records
    notes:       '',
    _wahapediaSlug: slug,
    _warnings:   warnings.length > 0 ? warnings : undefined,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report = [];
  report.push('Kill Team Scrape Report');
  report.push('=======================');
  report.push(`Date: ${new Date().toISOString()}`);
  report.push('');

  for (const faction of FACTIONS) {
    report.push(`## ${faction.name}`);
    report.push(`URL: ${faction.url}`);
    console.log(`\nFetching ${faction.name}...`);

    let html;
    try {
      html = await fetch(faction.url);
    } catch (e) {
      report.push(`ERROR: fetch failed — ${e.message}`);
      console.error('  Failed:', e.message);
      continue;
    }

    report.push(`Page size: ${(html.length / 1024).toFixed(0)} KB`);
    console.log(`  Got ${(html.length / 1024).toFixed(0)} KB`);

    const opSections = splitOperatives(html);
    report.push(`Operative sections found: ${opSections.length}`);
    console.log(`  Sections found: ${opSections.length}`);

    const operatives   = {};
    const warnings     = {};
    const parseErrors  = [];
    let   noStats      = 0;
    let   noWeapons    = 0;

    for (const { slug, html: opHtml } of opSections) {
      try {
        const op = parseOperative(slug, opHtml, faction);
        if (!op) { parseErrors.push(`${slug}: parseOperative returned null`); continue; }

        // Handle duplicate IDs (e.g., multiple Player operatives)
        let id = op.id;
        if (operatives[id]) {
          let n = 2;
          while (operatives[`${id}-${n}`]) n++;
          id = `${id}-${n}`;
          op.id = id;
        }

        operatives[id] = op;

        if (op._warnings) {
          warnings[op.name] = op._warnings;
          if (op._warnings.some(w => w.includes('not found') && !w.includes('MOVE')))
            noStats++;
          if (op._warnings.some(w => w.includes('no weapons')))
            noWeapons++;
        }
      } catch (e) {
        parseErrors.push(`${slug}: ${e.message}`);
        console.error(`  ERROR parsing ${slug}:`, e.message);
      }
    }

    const outPath = path.join(OUT_DIR, faction.outFile);
    fs.writeFileSync(outPath, JSON.stringify({ faction: faction.internalId, operatives }, null, 2));
    console.log(`  Written: ${faction.outFile}`);

    report.push(`Operatives parsed: ${Object.keys(operatives).length}`);
    report.push(`Stats missing: ${noStats}`);
    report.push(`Weapons missing: ${noWeapons}`);
    report.push(`Parse errors: ${parseErrors.length}`);

    if (parseErrors.length > 0) {
      report.push('Parse errors:');
      parseErrors.forEach(e => report.push('  - ' + e));
    }
    if (Object.keys(warnings).length > 0) {
      report.push('Warnings:');
      Object.entries(warnings).forEach(([n, ws]) =>
        report.push(`  ${n}: ${ws.join(', ')}`)
      );
    }
    report.push('');
  }

  fs.writeFileSync(REPORT_FILE, report.join('\n'));
  console.log(`\nReport: ${REPORT_FILE}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
