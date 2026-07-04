#!/usr/bin/env node
// parse-kt.js — parse BSData 2024 Kill Team .cat files into structured JSON

const fs   = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { loadPatches, applyPatches } = require('./apply-patches');

const KT_DIR  = path.join(process.env.HOME, 'projects/bsdata-killteam');
const OUT_DIR = path.join(__dirname, '../output');
const GLOSSARY_PATH = path.join(OUT_DIR, 'rules-glossary-kt.json');
// Cross-glossary fallback (BON-1b item 3): a few real, universal weapon
// rules (e.g. PSYCHIC) show up in KT source data but were never formalized
// as a KT sharedRule — only the 40k .gst defines them. When the KT glossary
// has no match, fall back to the 40k glossary before giving up.
const W40K_GLOSSARY_PATH = path.join(OUT_DIR, 'rules-glossary-40k.json');

// ── Faction slug lookup ────────────────────────────────────────────────────────
// cat name (from "2024 - {name}.cat") → Firebase faction slug
// Existing slugs kept exactly as established in roster scraper.
const FACTION_SLUG = {
  'Angels of Death':        'angels-of-death',
  'Battleclade':            'battleclade',
  'Blades of Khaine':       'blades-of-khaine',
  'Blooded':                'blooded',
  'Brood Brothers':         'brood-brothers',
  'Canoptek Circle':        'canoptek-circle',
  'Celestian Insidiants':   'celestian-insidiants',
  'Chaos Cult':             'chaos-cult',
  'Corsair Voidscarred':    'corsair-voidscarred',
  'Death Korps':            'death-korps',
  'Deathwatch':             'deathwatch',
  'Elucidian Starstriders': 'elucidian-starstriders',
  'Exaction Squad':         'exaction-squad',
  'Farstalker Kinband':     'farstalker-kinband',
  'Fellgor Ravagers':       'fellgor-ravagers',
  'Gellerpox Infected':     'gellerpox-infected',
  'Goremonger':             'goremonger',
  'Hand of the Archon':     'hand-of-the-archon',       // existing
  'Hearthkyn Salvagers':    'hearthkyn-salvagers',
  'Hernkyn Yaegirs':        'hernkyn-yaegirs',
  'Hierotek Circle':        'hierotek-circle',
  'Hunter Clade':           'hunter-clade',
  'Imperial Navy Breachers':'imperial-navy-breachers',
  'Inquisitorial Agents':   'inquisitorial-agents',
  'Kasrkin':                'kasrkin',                  // existing
  'Kommandos':              'ork-kommandos',             // existing
  'Legionaries':            'legionary',                 // existing (singular)
  'Mandrakes':              'mandrakes',
  'Murderwing':             'murderwing',
  'Nemesis Claw':           'nemesis-claw',
  'Non-player Operatives':  null,                        // skip
  'Novitiates':             'novitiates',
  'Pathfinders':            'tau-pathfinders',           // existing
  'Phobos Strike Team':     'phobos-strike-team',
  'Plague Marines':         'plague-marines',
  'Ratling':                'ratlings',
  'Raveners':               'raveners',
  'Sanctifier':             'sanctifier',
  'Scout Squad':            'scout-squad',
  'Strike Force Variel':    'strike-force-variel',
  'Tempestus Aquilons':     'tempestus-aquilons',
  'Vespid Stingwings':      'vespid-stingwings',
  'Void-dancer Troupe':     'void-dancer-troupe',        // existing
  'Warpcoven':              'warpcoven',
  'Wolf Scouts':            'wolf-scouts',
  'Wrecka Krew':            'wrecka-krew',
  'Wyrmblade':              'wyrmblade',
  'XV26 Battlesuits':       'xv26-battlesuits',
};

// Structural BSData categories — not game keywords
const SKIP_KEYWORDS = new Set([
  'Operative', 'Leader', 'Configuration', 'Reference',
]);

const PARSER_OPTS = {
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  textNodeName:        '#text',
  isArray: (name) => [
    'selectionEntry', 'selectionEntryGroup', 'entryLink', 'infoLink',
    'profile', 'characteristic', 'categoryLink', 'categoryEntry',
    'constraint', 'alias', 'rule', 'modifier',
  ].includes(name),
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function asArray(x) { return Array.isArray(x) ? x : (x ? [x] : []); }

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function attrStr(node, attr) {
  const v = node && node[attr];
  return v !== undefined && v !== null ? String(v) : '';
}

function charText(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  const t = node['#text'];
  return t !== null && t !== undefined ? String(t) : '';
}

// Build a map from id → node for all sharedSelectionEntries and sharedProfiles
function buildSharedMaps(catalogue) {
  const byId = {};

  // Collect from both sharedSelectionEntries and top-level selectionEntries
  for (const entry of [
    ...asArray(catalogue.sharedSelectionEntries?.selectionEntry),
    ...asArray(catalogue.selectionEntries?.selectionEntry),
  ]) {
    byId[attrStr(entry, '@_id')] = entry;
  }

  const sharedProfiles = {};
  for (const p of asArray(catalogue.sharedProfiles?.profile)) {
    sharedProfiles[attrStr(p, '@_id')] = p;
  }
  return { byId, sharedProfiles };
}

// ── Weapon rule parser ─────────────────────────────────────────────────────────

function extractRange(wrString) {
  if (!wrString) return null;
  const m = wrString.match(/\bRange (\d+)"/);
  return m ? m[1] + '"' : null;
}

// Candidate forms tried against a glossary, in order: exact, trailing-number
// parametric ("Lethal 5+"→"Lethal x+", "Piercing 2"→"Piercing x"), the same
// with an embedded "Crits" qualifier stripped first ("Piercing Crits 2" →
// "Piercing 2" → "Piercing x" — Piercing Crits x was never authored as its
// own literal alias, only "Piercing Crits 1" was, so every other Crits value
// fell through the old single-shape parametric fallback), a leading-distance
// qualifier stripped ('1" Devastating 3' → "Devastating 3" — Devastating's
// documented area-effect variant), and a missing space before a glued
// trailing number ("Piercing1" → "Piercing 1" — the old fallback's `\b`
// anchor never fires between two word characters, so a glued number was
// silently never converted).
function buildCandidates(clean) {
  const numeric           = clean.replace(/\b(\d+\+?)$/, 'x');
  const critsStripped     = clean.replace(/\bCrits\s+/i, '');
  const critsNumeric      = critsStripped.replace(/\b(\d+\+?)$/, 'x');
  const distanceStripped  = clean.replace(/^\d+"\s+/, '');
  const deglued           = clean.replace(/([A-Za-z])(\d)/, '$1 $2');
  const degluedNumeric    = deglued.replace(/\b(\d+\+?)$/, 'x');

  return [...new Set([clean, numeric, critsStripped, critsNumeric, distanceStripped, deglued, degluedNumeric])];
}

function normalizeForMatch(s) {
  // \s matches Unicode whitespace incl. U+00A0 (non-breaking space) — at
  // least one real BSData line uses an NBSP where every other line uses a
  // plain space ("Heavy (Reposition only)"), which fails a literal
  // string-equality check even though it's visually identical.
  return s.toLowerCase().replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function matchAgainstGlossaries(clean, glossaries) {
  const candidates = buildCandidates(clean).map(normalizeForMatch);
  for (const glossary of glossaries) {
    const match = glossary.find(r => {
      const nameNorm   = normalizeForMatch(r.name);
      const aliasNorms = r.aliases.map(normalizeForMatch);
      return candidates.some(c => c === nameNorm || aliasNorms.includes(c));
    });
    if (match) return match;
  }
  return null;
}

// A handful of KT source lines are missing a comma between two rules
// ("Brutal Severe" for "Brutal, Severe"; "Blast 1\" Heavy (Reposition only)"
// for "Blast 1\", Heavy (Reposition only)") — genuine upstream data typos,
// not something to guess generally. Recovered only when a single split
// point exists where BOTH halves independently and exactly match a known
// glossary entry.
function trySplitCompound(clean, glossaries) {
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] !== ' ') continue;
    const left  = clean.slice(0, i).trim();
    const right = clean.slice(i + 1).trim();
    if (!left || !right) continue;
    const leftMatch = matchAgainstGlossaries(left, glossaries);
    if (!leftMatch) continue;
    const rightMatch = matchAgainstGlossaries(right, glossaries);
    if (!rightMatch) continue;
    return [{ text: left, match: leftMatch }, { text: right, match: rightMatch }];
  }
  return null;
}

function parseWeaponRules(wrString, glossary, crossGlossary) {
  if (!wrString || wrString.trim() === '-') return [];
  const glossaries = [glossary, crossGlossary].filter(Boolean);

  return wrString.split(', ').flatMap(token => {
    let clean = token.trim();

    // Markdown bold wrapping ("**PSYCHIC**") is formatting, not the trailing
    // "*" custom-rule marker below (which is asymmetric — only ever
    // trailing, never doubled or leading). Unwrap it first so the old
    // single-star-strip doesn't mangle it into "**PSYCHIC*".
    const bold = clean.match(/^\*\*(.+)\*\*$/);
    if (bold) clean = bold[1];

    // A couple of bespoke local rules carry a stray trailing straight quote
    // in the source data ("Twin Torrent'", "Wreathed'") — a data artifact,
    // not part of the rule name.
    clean = clean.replace(/'+$/, '');

    const isCustom = clean.endsWith('*');
    clean = clean.replace(/\*$/, '').trim();

    if (/^Range \d+"?$/.test(clean)) return []; // pulled into rng field

    const direct = matchAgainstGlossaries(clean, glossaries);
    if (direct) {
      return [{ raw: clean, id: direct.id, name: direct.name, custom: isCustom, unknown: false }];
    }

    if (!isCustom) {
      // Own glossary only, deliberately — the cross-glossary fallback exists
      // for whole-token universal concepts (PSYCHIC), not split recovery.
      // Allowing it here let a bad early split point (e.g. "Blast" alone
      // cross-matching 40k's bare "Blast" flag before "Blast 1\"" got a
      // chance to match KT's own "blast-x" as one unit) win over the
      // correct split.
      const split = trySplitCompound(clean, [glossary]);
      if (split) {
        return split.map(({ text, match }) => ({
          raw: text, id: match.id, name: match.name, custom: false, unknown: false,
        }));
      }
    }

    return [{ raw: clean, id: null, name: clean, custom: isCustom, unknown: !isCustom }];
  });
}

// ── Weapon extraction ──────────────────────────────────────────────────────────

function weaponProfilesFromEntry(entry) {
  return asArray(entry?.profiles?.profile)
    .filter(p => attrStr(p, '@_typeName') === 'Weapons');
}

function buildWeapon(profile, glossary, crossGlossary) {
  const rawName = attrStr(profile, '@_name');
  const isRanged = rawName.startsWith('⌖');
  const isMelee  = rawName.startsWith('⚔');
  if (!isRanged && !isMelee) return null;

  const type      = isRanged ? 'ranged' : 'melee';
  const cleanName = rawName.replace(/^[⌖⚔]\s*/, '').trim();

  const chars = {};
  for (const c of asArray(profile.characteristics?.characteristic)) {
    chars[attrStr(c, '@_name')] = charText(c);
  }

  const wrString = chars.WR || '-';
  const rng      = isRanged ? extractRange(wrString) : null;
  const keywords = parseWeaponRules(wrString, glossary, crossGlossary);

  return {
    id:       slugify(cleanName),
    name:     cleanName,
    type,
    isDefault: false,
    rng,
    profiles: {
      ATK: chars.ATK || '',
      HIT: chars.HIT || '',
      DMG: chars.DMG || '',
    },
    keywords,
  };
}

function collectWeapons(modelEntry, sharedById, glossary, crossGlossary) {
  const weapons = [];

  function extractFromEntry(entry) {
    for (const p of weaponProfilesFromEntry(entry)) {
      const w = buildWeapon(p, glossary, crossGlossary);
      if (w) weapons.push(w);
    }
  }

  // Inline selectionEntries (weapon upgrades defined directly)
  for (const e of asArray(modelEntry.selectionEntries?.selectionEntry)) {
    extractFromEntry(e);
  }

  // selectionEntryGroups (e.g. "choose one weapon")
  for (const grp of asArray(modelEntry.selectionEntryGroups?.selectionEntryGroup)) {
    for (const e of asArray(grp.selectionEntries?.selectionEntry)) {
      extractFromEntry(e);
    }
  }

  // entryLinks → resolve from sharedById
  for (const link of asArray(modelEntry.entryLinks?.entryLink)) {
    if (attrStr(link, '@_type') === 'selectionEntry') {
      const target = sharedById[attrStr(link, '@_targetId')];
      if (target) extractFromEntry(target);
    }
    if (attrStr(link, '@_type') === 'selectionEntryGroup') {
      const target = sharedById[attrStr(link, '@_targetId')];
      if (target) {
        for (const e of asArray(target.selectionEntries?.selectionEntry)) {
          extractFromEntry(e);
        }
      }
    }
  }

  // Mark first of each type as default
  let firstRanged = true, firstMelee = true;
  for (const w of weapons) {
    if (w.type === 'ranged' && firstRanged) { w.isDefault = true; firstRanged = false; }
    if (w.type === 'melee'  && firstMelee)  { w.isDefault = true; firstMelee  = false; }
  }

  // Deduplicate by id (same shared weapon linked multiple times)
  const seen = new Set();
  return weapons.filter(w => {
    if (seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  });
}

// ── Ability extraction ─────────────────────────────────────────────────────────

function collectAbilities(modelEntry) {
  const abilities = [];
  for (const p of asArray(modelEntry.profiles?.profile)) {
    const typeName = attrStr(p, '@_typeName');
    if (typeName !== 'Abilities' && typeName !== 'Unique Actions') continue;
    const name = attrStr(p, '@_name');
    const chars = {};
    for (const c of asArray(p.characteristics?.characteristic)) {
      chars[attrStr(c, '@_name')] = charText(c);
    }
    const description = chars.Ability || chars['Unique Action'] || '';
    if (name) abilities.push({ name, description });
  }
  return abilities;
}

// ── Stat extraction ────────────────────────────────────────────────────────────

function extractStats(modelEntry, sharedProfiles) {
  // Check inline profiles first
  for (const p of asArray(modelEntry.profiles?.profile)) {
    if (attrStr(p, '@_typeName') !== 'Operative') continue;
    const chars = {};
    for (const c of asArray(p.characteristics?.characteristic)) {
      chars[attrStr(c, '@_name')] = charText(c);
    }
    return {
      APL:    chars.APL    || '',
      Move:   chars.Move   || '',
      DF:     '3',
      Save:   chars.Save   || '',
      Wounds: chars.Wounds || '',
    };
  }
  // Fall back to infoLink type="profile" referencing a shared Operative profile
  if (sharedProfiles) {
    for (const link of asArray(modelEntry.infoLinks?.infoLink)) {
      if (attrStr(link, '@_type') !== 'profile') continue;
      const p = sharedProfiles[attrStr(link, '@_targetId')];
      if (!p || attrStr(p, '@_typeName') !== 'Operative') continue;
      const chars = {};
      for (const c of asArray(p.characteristics?.characteristic)) {
        chars[attrStr(c, '@_name')] = charText(c);
      }
      return {
        APL:    chars.APL    || '',
        Move:   chars.Move   || '',
        DF:     '3',
        Save:   chars.Save   || '',
        Wounds: chars.Wounds || '',
      };
    }
  }
  return null;
}

// ── Keyword extraction ─────────────────────────────────────────────────────────

function extractKeywords(modelEntry) {
  return asArray(modelEntry.categoryLinks?.categoryLink)
    .filter(cl => !SKIP_KEYWORDS.has(attrStr(cl, '@_name')))
    .map(cl => attrStr(cl, '@_name').toUpperCase())
    .filter(Boolean);
}

// ── Composition rules ──────────────────────────────────────────────────────────

function extractComposition(catalogue) {
  const force = asArray(catalogue.forceEntries?.forceEntry)[0];
  if (!force) return null;

  let totalMin = null, totalMax = null;

  for (const cl of asArray(force.categoryLinks?.categoryLink)) {
    if (attrStr(cl, '@_name') !== 'Operative') continue;
    for (const c of asArray(cl.constraints?.constraint)) {
      const val = Number(attrStr(c, '@_value'));
      if (attrStr(c, '@_type') === 'min') totalMin = val;
      if (attrStr(c, '@_type') === 'max') totalMax = val;
    }
  }

  // Per-model limits: constraints scoped to the forceEntry id
  const forceId = attrStr(force, '@_id');
  const perModel = [];

  for (const entry of asArray(catalogue.selectionEntries?.selectionEntry)) {
    if (attrStr(entry, '@_type') !== 'model') continue;
    for (const c of asArray(entry.constraints?.constraint)) {
      if (attrStr(c, '@_scope') !== forceId) continue;
      const val = Number(attrStr(c, '@_value'));
      if (attrStr(c, '@_type') === 'max') {
        perModel.push({ role: attrStr(entry, '@_name'), max: val });
      }
    }
  }

  return {
    totalOperatives: { min: totalMin, max: totalMax },
    perModelLimits:  perModel,
  };
}

// ── Main parse ─────────────────────────────────────────────────────────────────

function parseCat(catPath, glossary, crossGlossary) {
  const xml    = fs.readFileSync(catPath, 'utf8');
  const parser = new XMLParser(PARSER_OPTS);
  const doc    = parser.parse(xml);
  const cat    = doc.catalogue;
  if (!cat) return null;

  const catName = attrStr(cat, '@_name');
  const slug    = FACTION_SLUG[catName];
  if (slug === null) {
    console.log(`  SKIP: ${catName} (non-playable)`);
    return null;
  }
  if (slug === undefined) {
    console.warn(`  WARN: no slug for "${catName}" — skipping`);
    return null;
  }

  const { byId, sharedProfiles } = buildSharedMaps(cat);
  const operatives = [];
  const warnings  = [];

  // Operatives may be in selectionEntries OR sharedSelectionEntries depending on faction
  const allModelEntries = [
    ...asArray(cat.selectionEntries?.selectionEntry),
    ...asArray(cat.sharedSelectionEntries?.selectionEntry),
  ].filter(e => attrStr(e, '@_type') === 'model');

  for (const entry of allModelEntries) {
    const name  = attrStr(entry, '@_name');
    const stats = extractStats(entry, sharedProfiles);
    if (!stats) {
      warnings.push(`No stats for "${name}"`);
      continue;
    }

    const weapons   = collectWeapons(entry, byId, glossary, crossGlossary);
    const abilities = collectAbilities(entry);
    const keywords  = extractKeywords(entry);

    const role = deriveRole(name, catName);

    operatives.push({
      id:        slugify(role),
      name,
      role,
      stats,
      weapons,
      abilities,
      keywords,
    });
  }

  const composition = extractComposition(cat);

  if (warnings.length) {
    console.log(`  warnings: ${warnings.join('; ')}`);
  }

  return {
    id:          slug,
    name:        catName,
    system:      'kill-team',
    operatives,
    composition,
  };
}

// Derive the operative's role from its name by stripping team-name prefix/suffix
function deriveRole(opName, catName) {
  // Try stripping catName (singular) from op name prefix or suffix
  const singular = catName.replace(/s$/, '');
  if (opName.startsWith(singular + ' ')) return opName.slice(singular.length + 1).trim();
  if (opName.endsWith(' ' + singular))   return opName.slice(0, -(singular.length + 1)).trim();
  // Try stripping the full catName
  if (opName.startsWith(catName + ' ')) return opName.slice(catName.length + 1).trim();
  if (opName.endsWith(' ' + catName))   return opName.slice(0, -(catName.length + 1)).trim();
  return opName;
}

function main() {
  if (!fs.existsSync(GLOSSARY_PATH)) {
    console.error('Glossary not found — run "npm run glossary" first');
    process.exit(1);
  }
  const glossary = JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf8'));
  const crossGlossary = fs.existsSync(W40K_GLOSSARY_PATH)
    ? JSON.parse(fs.readFileSync(W40K_GLOSSARY_PATH, 'utf8'))
    : [];
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const catFiles = fs.readdirSync(KT_DIR)
    .filter(f => f.startsWith('2024 - ') && f.endsWith('.cat'))
    .map(f => path.join(KT_DIR, f));

  console.log(`Found ${catFiles.length} 2024 faction files\n`);

  const patches = loadPatches();
  const patchesApplied = [];
  const results = [];

  for (const catPath of catFiles) {
    const catName = path.basename(catPath).replace(/^2024 - /, '').replace(/\.cat$/, '');
    console.log(`Parsing: ${catName}`);

    try {
      const faction = parseCat(catPath, glossary, crossGlossary);
      if (!faction) continue;

      // Fails loud (throws, aborting the whole run) if a patch no longer
      // matches a unit — see apply-patches.js.
      const applied = applyPatches(faction, patches, 'operatives');
      if (applied.length) {
        patchesApplied.push(...applied);
        for (const p of applied) console.log(`  patch: ${p.unit}.${p.field} = ${JSON.stringify(p.value)} (${p.reason})`);
      }

      const outFile = path.join(OUT_DIR, `kt-${faction.id}.json`);
      fs.writeFileSync(outFile, JSON.stringify(faction, null, 2));
      console.log(`  → kt-${faction.id}.json  (${faction.operatives.length} operatives)`);
      results.push({ slug: faction.id, name: faction.name, operatives: faction.operatives.length });
    } catch (err) {
      // A patch that no longer matches a unit must fail the whole run, not
      // just this one faction — per-file parse errors are recoverable
      // (other factions still parse fine), a dangling correction isn't.
      if (err.message.startsWith('patches.json entry')) {
        console.error(`\nFATAL: ${err.message}`);
        process.exit(1);
      }
      console.error(`  ERROR: ${err.message}`);
    }
  }

  if (patches.length) {
    const targetedFactions = new Set(patches.map(p => p.faction)).size;
    console.log(`\nPatches applied: ${patchesApplied.length} of ${patches.length} (across ${targetedFactions} faction(s) targeted)`);
  }

  console.log('\n── Summary ──────────────────────────────────────────────────');
  console.log('Slug table for Nox review:\n');
  console.log('Cat name                    → Slug                         Operatives');
  console.log('─'.repeat(70));
  for (const r of results) {
    console.log(
      r.name.padEnd(30) + '→ ' + r.slug.padEnd(32) + r.operatives
    );
  }
  console.log(`\nTotal factions parsed: ${results.length}`);
}

main();
