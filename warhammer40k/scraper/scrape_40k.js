#!/usr/bin/env node
/**
 * Phase 14 — Wahapedia 40K Datasheet Scraper
 *
 * Usage: node scrape_40k.js
 * Output: scraped-data/wh40k-astra-militarum.json
 *         scraped-data/wh40k-craftworlds-eldar.json
 *         scraped-data/scrape-report.txt
 *
 * Runs from WSL terminal. No Firebase. No credentials. Review output before writing to Firebase.
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const FACTIONS = [
  {
    internalId: 'astra-militarum',
    name:       'Astra Militarum',
    url:        'https://wahapedia.ru/wh40k10ed/factions/astra-militarum/datasheets.html',
    outFile:    'wh40k-astra-militarum.json',
    colorClass: 'dsColorAM',
  },
  {
    internalId: 'craftworlds-eldar',
    name:       'Craftworlds Eldar',
    url:        'https://wahapedia.ru/wh40k10ed/factions/aeldari/datasheets.html',
    outFile:    'wh40k-craftworlds-eldar.json',
    colorClass: 'dsColorEL',
  },
];

const OUT_DIR     = path.join(__dirname, '..', 'scraped-data');
const REPORT_FILE = path.join(OUT_DIR, 'scrape-report.txt');

// ─── HTTP fetch ───────────────────────────────────────────────────────────────

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 40k-scraper/1.0)' },
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

/** Strip all HTML tags, collapse whitespace */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#8960;/g, '⌀').replace(/\s+/g, ' ').trim();
}

/** Extract all regex matches */
function matchAll(str, re) {
  return [...str.matchAll(re)];
}

// ─── Unit section splitter ────────────────────────────────────────────────────

/**
 * Split the full datasheets.html into individual unit sections.
 * Each unit is delimited by: <a name="Unit-Name"></a><div class="dsOuterFrame datasheet ...">
 * Returns [{id, name, html}]
 */
function splitUnits(html) {
  const units = [];

  // Find all unit anchors and their positions
  const anchorRe = /<a name="([A-Za-z][A-Za-z0-9'\-]{2,80})"><\/a>\s*<div class="dsOuterFrame datasheet/g;
  const matches  = matchAll(html, anchorRe);

  for (let i = 0; i < matches.length; i++) {
    const m     = matches[i];
    const start = m.index;
    const end   = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const slug  = m[1]; // e.g. "Cadian-Castellan"

    // Convert slug to display name: "Cadian-Castellan" → "Cadian Castellan"
    // Handle apostrophes: "Gaunt-s-Ghosts" → "Gaunt's Ghosts"
    const name = slug
      .replace(/-s-/g, "'s ")     // possessives
      .replace(/-s$/,  "'s")
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    units.push({ id: slug, name, html: html.slice(start, end) });
  }

  return units;
}

// ─── Stat extraction ──────────────────────────────────────────────────────────

/**
 * Extract M/T/Sv/W/Ld/OC stats.
 * Some units have multiple stat rows (e.g. Guardian Defenders with Heavy Weapon Platform).
 * Returns array of stat objects (usually length 1, sometimes 2).
 */
function extractStats(unitHtml) {
  // Find all dsProfileWrap blocks (each is one model type's stats)
  const profileRe = /<div[^>]*class="[^"]*dsProfileWrap[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*(?=<div|<\/div)/g;

  // Wahapedia uses Sv/Ld; Firebase schema uses SV/LD — normalise here
  const statKeyMap = { M: 'M', T: 'T', Sv: 'SV', W: 'W', Ld: 'LD', OC: 'OC' };
  const statNames  = ['M', 'T', 'Sv', 'W', 'Ld', 'OC'];
  const profiles   = [];

  // Simple approach: find all dsCharName/dsCharValue pairs in order
  const nameRe  = /class="dsCharName">([^<]+)<\/div>/g;
  const valueRe = /class="dsCharValue[^"]*">([^<]+)<\/div>/g;

  const names  = matchAll(unitHtml, nameRe).map(m => m[1].trim());
  const values = matchAll(unitHtml, valueRe).map(m => m[1].trim());

  // Group into stat blocks of 6
  const blocks = [];
  let i = 0, j = 0;

  while (i < names.length && j < values.length) {
    if (names[i] === 'M') {
      const block = {};
      let count = 0;
      while (count < 6 && i < names.length && j < values.length) {
        block[statKeyMap[names[i]] || names[i]] = values[j];
        i++; j++; count++;
      }
      if (Object.keys(block).length >= 4) blocks.push(block);
    } else {
      i++; j++;
    }
  }

  // If no clean blocks found, do a flat extraction
  if (blocks.length === 0 && names.length >= 6 && values.length >= 6) {
    const block = {};
    statNames.forEach((n, idx) => {
      if (names[idx] === n) block[n] = values[idx];
    });
    if (Object.keys(block).length >= 4) blocks.push(block);
  }

  return blocks;
}

/**
 * Check for invulnerable save in unit HTML.
 * Returns number or null (e.g. 5 for "5+ INVULNERABLE SAVE").
 */
function extractInvulSave(unitHtml) {
  const m = unitHtml.match(/(\d)\+\s*INVULNERABLE\s*SAVE/i);
  return m ? parseInt(m[1]) : null;
}

// ─── Weapon extraction ────────────────────────────────────────────────────────

/**
 * Parse a weapon table (ranged or melee) from a unit's HTML.
 * Each weapon is in a <tbody class="bkg"> block.
 * The data row (not the mobile long row) contains:
 *   td (empty) | td.wTable2_short (name+keywords) | td>div.ct (range) | td>div.ct (A) |
 *   td>div.ct (BS/WS) | td>div.ct (S) | td>div.ct (AP) | td>div.ct (D)
 */
function extractWeapons(tableHtml, type) {
  const weapons = [];
  const tbodyRe = /<tbody class="bkg">([\s\S]*?)<\/tbody>/g;

  for (const tbodyMatch of matchAll(tableHtml, tbodyRe)) {
    const tbody = tbodyMatch[1];

    // Find the data row — the one with wTable2_short (not wTable2_long)
    const dataRowRe = /<tr(?![^>]*wTable2_long)[^>]*>([\s\S]*?)<\/tr>/g;
    const dataRows  = matchAll(tbody, dataRowRe);

    for (const rowMatch of dataRows) {
      const row = rowMatch[1];

      // Get weapon name from wTable2_short cell
      const nameCell = row.match(/class="wTable2_short[^"]*"[^>]*>([\s\S]*?)<\/td>/);
      if (!nameCell) continue;

      const nameHtml = nameCell[1];
      // Weapon name = text before keyword spans
      const rawName = stripTags(nameHtml);

      // Extract weapon keywords (span.tt.kwbu inside kwb2 spans)
      const kwSpans = matchAll(nameHtml, /<span class="kwb2[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/span>/g);
      const keywords = kwSpans.map(m => stripTags(m[1]).toUpperCase().replace(/\s+/g, ' ').trim()).filter(Boolean);

      // Clean weapon name: remove keyword text
      let name = rawName;
      keywords.forEach(kw => { name = name.replace(new RegExp(kw, 'i'), '').trim(); });
      name = name.replace(/\s+/g, ' ').trim().replace(/\s*[–-]\s*$/, '').trim();
      if (!name) continue;

      // Get stat values from div.ct cells (in order: range, A, BS/WS, S, AP, D)
      const ctVals = matchAll(row, /<div class="ct[^"]*">([^<]*)<\/div>/g).map(m => m[1].trim());
      if (ctVals.length < 6) continue;

      const [rangeStr, attacksStr, skillStr, strengthStr, apStr, damageStr] = ctVals;

      // "Melee" range string is the authoritative indicator — override caller's type
      const isMelee = rangeStr === 'Melee';
      const rangeIn = isMelee || rangeStr === 'N/A' ? 0 : (parseInt(rangeStr) || 0);
      const resolvedType = isMelee ? 'melee' : type;

      let attacks = attacksStr;
      try { attacks = parseInt(attacksStr); if (isNaN(attacks)) attacks = attacksStr; } catch(_) {}

      let skill = skillStr === 'N/A' ? 0 : (parseInt(skillStr) || 0);

      let strength = parseInt(strengthStr) || 0;
      let ap       = parseInt(apStr) || 0;

      let damage = damageStr;
      try { damage = parseInt(damageStr); if (isNaN(damage)) damage = damageStr; } catch(_) {}

      weapons.push({
        id:       toKebab(name),
        name,
        range:    rangeIn,
        attacks,
        skill,
        S:        strength,
        AP:       ap,
        D:        damage,
        type: resolvedType,
        keywords,
      });
    }
  }

  return weapons;
}

function extractAllWeapons(unitHtml) {
  // Find ranged weapons table
  const rangedTableRe = /<table class="wTable"[^>]*>([\s\S]*?)<\/table>/g;
  const tables = matchAll(unitHtml, rangedTableRe);

  const ranged = [];
  const melee  = [];

  for (const tableMatch of tables) {
    const tableHtml = tableMatch[1];
    // Determine type by presence of header
    if (/RANGED WEAPONS/i.test(tableHtml) || /class="dsRangedIcon"/.test(tableHtml)) {
      ranged.push(...extractWeapons(tableHtml, 'ranged'));
    } else if (/MELEE WEAPONS/i.test(tableHtml) || /class="dsMeleeIcon"/.test(tableHtml)) {
      melee.push(...extractWeapons(tableHtml, 'melee'));
    }
  }

  return { ranged, melee };
}

// ─── Points extraction ────────────────────────────────────────────────────────

/**
 * Extract points. Returns [{models, points}] (array for variable-size units).
 */
function extractPoints(unitHtml) {
  const results = [];

  // Find all PriceTag divs with their adjacent model-count cells
  // They appear in: <td>N models</td><td><div class="PriceTag">P</div></td>
  const rowRe = /<tr[^>]*>\s*<td[^>]*>([^<]*models?[^<]*)<\/td>\s*<td[^>]*>\s*<div class="PriceTag">(\d+)<\/div>/gi;
  for (const m of matchAll(unitHtml, rowRe)) {
    const modelsText = stripTags(m[1]).trim();
    const pts        = parseInt(m[2]);
    results.push({ models: modelsText, points: pts });
  }

  // Fallback: just grab bare PriceTags
  if (results.length === 0) {
    const tagRe = /<div class="PriceTag">(\d+)<\/div>/g;
    for (const m of matchAll(unitHtml, tagRe)) {
      results.push({ models: null, points: parseInt(m[1]) });
    }
  }

  return results;
}

// ─── Keywords extraction ──────────────────────────────────────────────────────

/**
 * Find balanced outer <span class="tooltipk..."> contents.
 * A lazy regex stops at the first inner </span>; this walks the string instead.
 */
function extractBalancedTooltipkSpans(html) {
  const results = [];
  let i = 0;

  while (i < html.length) {
    // Find next tooltipk span opening
    const openIdx = html.indexOf('<span class="tooltipk', i);
    if (openIdx < 0) break;

    // Find the end of the opening tag
    const tagEnd = html.indexOf('>', openIdx);
    if (tagEnd < 0) break;

    // Walk forward counting <span opens and </span closes until balanced
    let depth = 1;
    let j = tagEnd + 1;
    while (j < html.length && depth > 0) {
      const nextOpen  = html.indexOf('<span', j);
      const nextClose = html.indexOf('</span>', j);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth++;
        j = nextOpen + 5;
      } else {
        depth--;
        if (depth === 0) {
          const inner = html.slice(tagEnd + 1, nextClose);
          const text  = stripTags(inner).replace(/\s+/g, ' ').trim().toUpperCase();
          if (text && !text.includes('KEYWORDS')) results.push(text);
          j = nextClose + 7;
        } else {
          j = nextClose + 7;
        }
      }
    }
    i = tagEnd + 1;
  }

  return [...new Set(results)];
}

/** Parse tooltipk parent spans into keyword strings from a block of HTML. */
function parseKeywordSpans(html) {
  const kws = extractBalancedTooltipkSpans(html);
  if (kws.length > 0) return kws;

  // Fallback: individual kwb kwbu spans
  return [...new Set(
    matchAll(html, /<span class="kwb kwbu">([^<]+)<\/span>/g)
      .map(m => m[1].trim().toUpperCase())
      .filter(Boolean)
  )];
}

function extractKeywords(unitHtml) {
  // Wahapedia layout: dsLeftСolKW = unit keywords, dsRightСolKW = faction keywords
  // Note: "С" in class names is Cyrillic — match both to be safe
  const leftMatch  = unitHtml.match(/class="dsLeft[СC]olKW"[^>]*>([\s\S]*?)<\/div>/);
  const rightMatch = unitHtml.match(/class="dsRight[СC]olKW"[^>]*>([\s\S]*?)<\/div>/);

  if (leftMatch) return parseKeywordSpans(leftMatch[1]);

  // Fallback: find "KEYWORDS:" and stop at "FACTION KEYWORDS:"
  const kwIdx = unitHtml.indexOf('KEYWORDS:');
  if (kwIdx < 0) return [];
  const fkIdx = unitHtml.indexOf('FACTION KEYWORDS:', kwIdx);
  const kwHtml = unitHtml.slice(kwIdx, fkIdx > kwIdx ? fkIdx : kwIdx + 800);
  return parseKeywordSpans(kwHtml);
}

function extractFactionKeywords(unitHtml) {
  const rightMatch = unitHtml.match(/class="dsRight[СC]olKW"[^>]*>([\s\S]*?)<\/div>/);
  if (rightMatch) return parseKeywordSpans(rightMatch[1]);

  // Fallback: find "FACTION KEYWORDS:"
  const fkIdx = unitHtml.indexOf('FACTION KEYWORDS:');
  if (fkIdx < 0) return [];
  const fkHtml = unitHtml.slice(fkIdx, fkIdx + 400);
  return parseKeywordSpans(fkHtml);
}

// ─── Composition extraction ───────────────────────────────────────────────────

function extractComposition(unitHtml) {
  const idx = unitHtml.indexOf('UNIT COMPOSITION');
  if (idx < 0) return null;
  const chunk = unitHtml.slice(idx, idx + 2000);
  // Get text up to WARGEAR OPTIONS or KEYWORDS
  const endIdx = chunk.search(/WARGEAR OPTIONS|WARGEAR ABILITIES|KEYWORDS/);
  const compHtml = chunk.slice(0, endIdx > 0 ? endIdx : 800);
  return stripTags(compHtml).replace(/^UNIT COMPOSITION\s*/, '').trim();
}

function extractSquadSize(unitHtml) {
  // Find model counts from PriceTag rows
  const rowRe = /(\d+)\s+models?/gi;
  const sizes = matchAll(unitHtml, rowRe).map(m => parseInt(m[1])).filter(n => n > 0);

  if (sizes.length === 0) return { min: 1, max: 1 };
  if (sizes.length === 1) return { min: sizes[0], max: sizes[0] };
  return { min: Math.min(...sizes), max: Math.max(...sizes) };
}

// ─── Category + flags ─────────────────────────────────────────────────────────

function extractCategory(keywords) {
  const kws = keywords.join(' ').toUpperCase();
  if (kws.includes('VEHICLE') || kws.includes('WALKER') || kws.includes('TITANIC')) return 'vehicle';
  if (kws.includes('CHARACTER')) return 'character';
  if (kws.includes('BEAST'))     return 'beast';
  if (kws.includes('MONSTER'))   return 'monster';
  return 'infantry';
}

function extractBaseRadius(unitHtml) {
  // Look for base size in mm, e.g. "⌀28.5mm" or "(28.5mm)"
  const m = unitHtml.match(/[⌀(](\d+(?:\.\d+)?)\s*mm[)⌀]/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) / 2 / 25.4 * 100) / 100;
}

function extractWargearOptions(unitHtml) {
  const idx = unitHtml.indexOf('WARGEAR OPTIONS');
  if (idx < 0) return [];
  const chunk = unitHtml.slice(idx, idx + 3000);
  const endIdx = chunk.search(/KEYWORDS|FACTION KEYWORDS|LED BY|STRATAGEMS|<\/div>\s*<\/div>\s*<\/div>/);
  const wgHtml = chunk.slice(0, endIdx > 0 ? endIdx : 1500);
  const text = stripTags(wgHtml).replace(/^WARGEAR OPTIONS\s*/, '').trim();
  return text ? [text] : [];
}

// ─── Default loadout helpers ──────────────────────────────────────────────────

function buildDefaultLoadout(ranged, melee, composition) {
  // For now: one "model" type using first ranged and first melee weapon
  const loadout = {};
  if (ranged.length > 0) loadout.ranged = ranged[0].id;
  if (melee.length  > 0) loadout.melee  = melee[0].id;
  return loadout ? { model: loadout } : {};
}

// ─── ID helpers ───────────────────────────────────────────────────────────────

function toKebab(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Parse one unit ───────────────────────────────────────────────────────────

function parseUnit(slug, name, unitHtml, factionId) {
  const warnings = [];

  const statBlocks      = extractStats(unitHtml);
  const invulSave       = extractInvulSave(unitHtml);
  const { ranged, melee } = extractAllWeapons(unitHtml);
  const pointsData      = extractPoints(unitHtml);
  const keywords        = extractKeywords(unitHtml);
  const factionKeywords = extractFactionKeywords(unitHtml);
  const composition     = extractComposition(unitHtml);
  const squadSize   = extractSquadSize(unitHtml);
  const category    = extractCategory(keywords);
  const baseRadius  = extractBaseRadius(unitHtml);
  const wargear     = extractWargearOptions(unitHtml);

  // Primary stats (first block)
  const stats = statBlocks[0] || null;
  if (!stats) warnings.push('stats not parsed');
  if (invulSave && stats) stats.invulSave = invulSave;

  // Points — prefer smallest entry (min model count)
  const points = pointsData.length > 0 ? pointsData[0].points : null;
  if (points === null) warnings.push('points not found');

  if (ranged.length === 0 && melee.length === 0) warnings.push('no weapons parsed');

  // Build weapon map (deduplicate ids)
  const weapons = {};
  const allWeapons = [...ranged, ...melee];
  const seenIds = {};
  allWeapons.forEach(w => {
    let id = w.id;
    if (seenIds[id]) { id = id + '-' + (++seenIds[id]); } else { seenIds[id] = 1; }
    weapons[id] = { name: w.name, range: w.range, attacks: w.attacks, skill: w.skill, S: w.S, AP: w.AP, D: w.D, type: w.type, keywords: w.keywords };
  });

  return {
    id:             toKebab(name),
    wahapediaSlug:  slug,
    name,
    faction:        factionId,
    gameSystem:     'warhammer-40k',
    category,
    points,
    pointsTable:    pointsData,
    stats,
    baseRadius:     baseRadius || 0.5,
    squadSize,
    weapons,
    defaultLoadout: buildDefaultLoadout(ranged, melee, composition),
    wargearOptions: wargear,
    keywords,
    factionKeywords,
    isCharacter:    keywords.some(k => k.toUpperCase() === 'CHARACTER'),
    isPsyker:       keywords.some(k => k.toUpperCase() === 'PSYKER'),
    isVehicle:      category === 'vehicle',
    explodes:       null,
    composition,
    _warnings:      warnings.length > 0 ? warnings : undefined,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report = [];
  report.push('Phase 14 Scrape Report');
  report.push('======================');
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

    const unitSections = splitUnits(html);
    report.push(`Units found: ${unitSections.length}`);
    console.log(`  Units found: ${unitSections.length}`);

    const units      = {};
    const warnings   = {};
    let   noStats    = 0;
    let   noWeapons  = 0;
    let   noPoints   = 0;
    let   parseErrors = [];

    for (const { id, name, html: unitHtml } of unitSections) {
      try {
        const unit = parseUnit(id, name, unitHtml, faction.internalId);
        units[unit.id] = unit;

        if (unit._warnings) {
          warnings[unit.name] = unit._warnings;
          if (unit._warnings.includes('stats not parsed'))  noStats++;
          if (unit._warnings.includes('no weapons parsed')) noWeapons++;
          if (unit._warnings.includes('points not found'))  noPoints++;
        }
      } catch (e) {
        parseErrors.push(`${name}: ${e.message}`);
        console.error(`  ERROR parsing ${name}:`, e.message);
      }
    }

    // Write output
    const outPath = path.join(OUT_DIR, faction.outFile);
    fs.writeFileSync(outPath, JSON.stringify({ faction: faction.internalId, units }, null, 2));
    console.log(`  Written: ${faction.outFile}`);

    report.push(`Units parsed: ${Object.keys(units).length}`);
    report.push(`Points missing: ${noPoints}`);
    report.push(`Stats missing: ${noStats}`);
    report.push(`Weapons missing: ${noWeapons}`);
    report.push(`Parse errors: ${parseErrors.length}`);

    if (parseErrors.length > 0) {
      report.push('Parse errors:');
      parseErrors.forEach(e => report.push('  - ' + e));
    }

    if (Object.keys(warnings).length > 0) {
      report.push('Warnings per unit:');
      Object.entries(warnings).forEach(([name, ws]) =>
        report.push(`  ${name}: ${ws.join(', ')}`)
      );
    }

    report.push('');
  }

  fs.writeFileSync(REPORT_FILE, report.join('\n'));
  console.log(`\nReport written: ${REPORT_FILE}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
