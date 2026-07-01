#!/usr/bin/env node
// parse-kt.js — parse BSData 2024 Kill Team .cat files into structured JSON

const fs   = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const KT_DIR  = path.join(process.env.HOME, 'projects/bsdata-killteam');
const OUT_DIR = path.join(__dirname, '../output');
const GLOSSARY_PATH = path.join(OUT_DIR, 'rules-glossary-kt.json');

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

function parseWeaponRules(wrString, glossary) {
  if (!wrString || wrString.trim() === '-') return [];
  return wrString.split(', ').map(token => {
    const clean = token.trim().replace(/\*$/, '');
    if (/^Range \d+"?$/.test(clean)) return null; // pulled into rng field

    const isCustom = token.trim().endsWith('*');
    // Parametric fallback: "Limited 1" → try matching rule named "Limited x"
    const parametric = clean.replace(/\b(\d+\+?)$/, 'x').replace(/\b(\d+")$/, 'x"');
    const match = glossary.find(r =>
      r.name === clean ||
      r.aliases.includes(clean) ||
      r.aliases.map(a => a.replace(/\*\*/g, '')).includes(clean) ||
      (parametric !== clean && (r.name === parametric || r.aliases.includes(parametric)))
    );

    return {
      raw:     clean,
      id:      match ? match.id : null,
      name:    match ? match.name : clean,
      custom:  isCustom,
      unknown: !match && !isCustom,
    };
  }).filter(Boolean);
}

// ── Weapon extraction ──────────────────────────────────────────────────────────

function weaponProfilesFromEntry(entry) {
  return asArray(entry?.profiles?.profile)
    .filter(p => attrStr(p, '@_typeName') === 'Weapons');
}

function buildWeapon(profile, glossary) {
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
  const keywords = parseWeaponRules(wrString, glossary);

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

function collectWeapons(modelEntry, sharedById, glossary) {
  const weapons = [];

  function extractFromEntry(entry) {
    for (const p of weaponProfilesFromEntry(entry)) {
      const w = buildWeapon(p, glossary);
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

function parseCat(catPath, glossary) {
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

    const weapons   = collectWeapons(entry, byId, glossary);
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
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const catFiles = fs.readdirSync(KT_DIR)
    .filter(f => f.startsWith('2024 - ') && f.endsWith('.cat'))
    .map(f => path.join(KT_DIR, f));

  console.log(`Found ${catFiles.length} 2024 faction files\n`);

  const results = [];

  for (const catPath of catFiles) {
    const catName = path.basename(catPath).replace(/^2024 - /, '').replace(/\.cat$/, '');
    console.log(`Parsing: ${catName}`);

    try {
      const faction = parseCat(catPath, glossary);
      if (!faction) continue;

      const outFile = path.join(OUT_DIR, `kt-${faction.id}.json`);
      fs.writeFileSync(outFile, JSON.stringify(faction, null, 2));
      console.log(`  → kt-${faction.id}.json  (${faction.operatives.length} operatives)`);
      results.push({ slug: faction.id, name: faction.name, operatives: faction.operatives.length });
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
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
