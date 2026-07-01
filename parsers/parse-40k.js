#!/usr/bin/env node
// parse-40k.js — parse BSData 40k Library .cat files into structured JSON

const fs   = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const W40K_DIR  = path.join(process.env.HOME, 'projects/bsdata-40k');
const OUT_DIR   = path.join(__dirname, '../output');
const GLOSSARY_PATH = path.join(OUT_DIR, 'rules-glossary-40k.json');

// ── Faction config ─────────────────────────────────────────────────────────────
// Library cat filename fragment → Firebase slug
const FACTIONS = [
  { file: 'Imperium - Astra Militarum - Library.cat', slug: 'astra-militarum', name: 'Astra Militarum' },
  { file: 'Aeldari - Aeldari Library.cat',            slug: 'craftworlds-eldar', name: 'Craftworlds Eldar' },
];

const PARSER_OPTS = {
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  textNodeName:        '#text',
  isArray: (name) => [
    'selectionEntry', 'selectionEntryGroup', 'entryLink', 'infoLink',
    'profile', 'characteristic', 'categoryLink', 'categoryEntry',
    'constraint', 'alias', 'rule', 'modifier', 'condition',
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

// ── Shared map builder ─────────────────────────────────────────────────────────

function buildSharedMaps(cat) {
  const byId = {};
  for (const e of asArray(cat.sharedSelectionEntries?.selectionEntry)) {
    byId[attrStr(e, '@_id')] = e;
  }
  for (const e of asArray(cat.selectionEntries?.selectionEntry)) {
    byId[attrStr(e, '@_id')] = e;
  }
  // sharedSelectionEntryGroups
  for (const g of asArray(cat.sharedSelectionEntryGroups?.selectionEntryGroup)) {
    byId[attrStr(g, '@_id')] = g;
  }

  const sharedProfiles = {};
  for (const p of asArray(cat.sharedProfiles?.profile)) {
    sharedProfiles[attrStr(p, '@_id')] = p;
  }

  return { byId, sharedProfiles };
}

// ── Keyword / weapon rule parser ───────────────────────────────────────────────

function parseWeaponKeywords(kwString, glossary) {
  if (!kwString || kwString.trim() === '-') return [];
  return kwString.split(',').map(token => {
    const clean = token.trim();
    if (!clean) return null;

    const cleanLower = clean.toLowerCase();

    // Build candidate forms to try matching against glossary:
    // 1. Exact: "Rapid Fire 1", "Ignores Cover"
    // 2. Strip trailing numeric param: "Rapid Fire 1" → "Rapid Fire"
    // 3. Strip trailing numeric+plus: "Anti-Infantry 3+" → strip back to "Anti-Infantry" (unlikely to match) or prefix
    // 4. KT-style x-replacement: "Rapid Fire 1" → "Rapid Fire x" (for gst rules named with x)
    // 5. Anti- prefix: "Anti-Infantry 3+" → "Anti-"
    const stripped    = clean.replace(/\s+\d+\+?$/, '').trim();       // "Rapid Fire 1" → "Rapid Fire"
    const parametricX = clean.replace(/\b(\d+\+?)$/, 'x').trim();    // KT fallback
    const antiPrefix  = clean.replace(/-[^-]+$/, '-').trim();         // "Anti-Infantry 3+" → "Anti-"

    const normalize = s => s.toLowerCase().replace(/-/g, ' ');
    const candidates = [cleanLower];
    if (stripped !== clean) candidates.push(stripped.toLowerCase());
    if (parametricX !== clean) candidates.push(parametricX.toLowerCase());
    if (antiPrefix !== clean && antiPrefix.endsWith('-')) candidates.push(antiPrefix.toLowerCase());

    const match = glossary.find(r => {
      const nameLower    = r.name.toLowerCase();
      const nameNorm     = normalize(r.name);
      const aliasesLower = r.aliases.map(a => a.toLowerCase());
      const aliasesNorm  = r.aliases.map(a => normalize(a));
      return candidates.some(c =>
        nameLower === c || aliasesLower.includes(c) ||
        nameNorm === normalize(c) || aliasesNorm.some(a => a === normalize(c))
      );
    });

    return {
      raw:     clean,
      id:      match ? match.id : null,
      name:    match ? match.name : clean,
      custom:  false,
      unknown: !match,
    };
  }).filter(Boolean);
}

// ── Stat extraction ────────────────────────────────────────────────────────────

function extractUnitStats(modelEntry, sharedProfiles) {
  // First: infoLink type="profile" → Unit profile in sharedProfiles
  for (const link of asArray(modelEntry.infoLinks?.infoLink)) {
    if (attrStr(link, '@_type') !== 'profile') continue;
    const p = sharedProfiles[attrStr(link, '@_targetId')];
    if (!p || attrStr(p, '@_typeName') !== 'Unit') continue;
    const chars = {};
    for (const c of asArray(p.characteristics?.characteristic)) {
      chars[attrStr(c, '@_name')] = charText(c);
    }
    if (chars.M || chars.T) return chars;
  }
  // Fallback: inline profile with typeName="Unit"
  for (const p of asArray(modelEntry.profiles?.profile)) {
    if (attrStr(p, '@_typeName') !== 'Unit') continue;
    const chars = {};
    for (const c of asArray(p.characteristics?.characteristic)) {
      chars[attrStr(c, '@_name')] = charText(c);
    }
    if (chars.M || chars.T) return chars;
  }
  return null;
}

// ── Weapon extraction ──────────────────────────────────────────────────────────

function buildWeapon(profile, glossary, isDefault) {
  const typeName = attrStr(profile, '@_typeName');
  const isRanged = typeName === 'Ranged Weapons';
  const isMelee  = typeName === 'Melee Weapons';
  if (!isRanged && !isMelee) return null;

  const name = attrStr(profile, '@_name').replace(/^[➤►▶]\s*/, '').trim();
  const chars = {};
  for (const c of asArray(profile.characteristics?.characteristic)) {
    chars[attrStr(c, '@_name')] = charText(c);
  }

  const kwString = chars.Keywords || '';
  const keywords = parseWeaponKeywords(kwString, glossary);

  const profiles = isRanged
    ? { Range: chars.Range || '', A: chars.A || '', BS: chars.BS || '', S: chars.S || '', AP: chars.AP || '', D: chars.D || '' }
    : { Range: 'Melee',         A: chars.A || '', WS: chars.WS || '', S: chars.S || '', AP: chars.AP || '', D: chars.D || '' };

  return {
    id:       slugify(name),
    name,
    type:     isRanged ? 'ranged' : 'melee',
    isDefault,
    profiles,
    keywords,
  };
}

function extractWeaponsFromEntry(entry, glossary, isDefault) {
  const weapons = [];
  for (const p of asArray(entry.profiles?.profile)) {
    const w = buildWeapon(p, glossary, isDefault);
    if (w) weapons.push(w);
  }
  return weapons;
}

// Resolve an entryLink (weapon or group) into weapons
function resolveLink(link, byId, glossary, isDefault) {
  const type     = attrStr(link, '@_type');
  const targetId = attrStr(link, '@_targetId');
  const target   = byId[targetId];
  if (!target) return [];

  if (type === 'selectionEntry') {
    return extractWeaponsFromEntry(target, glossary, isDefault);
  }
  if (type === 'selectionEntryGroup') {
    // All options inside the group — they become a loadout slot
    const options = [];
    for (const e of asArray(target.selectionEntries?.selectionEntry)) {
      options.push(...extractWeaponsFromEntry(e, glossary, false));
    }
    for (const el of asArray(target.entryLinks?.entryLink)) {
      options.push(...resolveLink(el, byId, glossary, false));
    }
    return options;
  }
  return [];
}

// Collect all weapons from a model entry, traversing both entryLinks and inline selectionEntries
function collectWeapons(modelEntry, byId, glossary) {
  const weapons = [];
  const seen    = new Set();

  function addWeapon(w) {
    if (!w || seen.has(w.id)) return;
    seen.add(w.id);
    weapons.push(w);
  }

  // Inline selectionEntries on the model (e.g. Aeldari pattern: weapon as inline upgrade)
  for (const se of asArray(modelEntry.selectionEntries?.selectionEntry)) {
    for (const w of extractWeaponsFromEntry(se, glossary, true)) {
      addWeapon(w);
    }
  }

  // Via entryLinks (e.g. AM pattern: shared weapon entries)
  for (const link of asArray(modelEntry.entryLinks?.entryLink)) {
    const constraints = asArray(link.constraints?.constraint);
    const isDefault   = constraints.some(c =>
      attrStr(c, '@_type') === 'min' && Number(attrStr(c, '@_value')) >= 1
    );
    for (const w of resolveLink(link, byId, glossary, isDefault)) {
      addWeapon(w);
    }
  }

  return weapons;
}

// ── Ability extraction ─────────────────────────────────────────────────────────

function collectAbilities(unitEntry, sharedProfiles) {
  const abilities = [];
  const seen      = new Set();

  function addAbility(name, description) {
    if (!name || seen.has(name)) return;
    seen.add(name);
    abilities.push({ name, description });
  }

  // Inline profiles typeName="Abilities"
  for (const p of asArray(unitEntry.profiles?.profile)) {
    if (attrStr(p, '@_typeName') !== 'Abilities') continue;
    const chars = {};
    for (const c of asArray(p.characteristics?.characteristic)) {
      chars[attrStr(c, '@_name')] = charText(c);
    }
    addAbility(attrStr(p, '@_name'), chars.Description || chars.Ability || '');
  }

  // infoLinks type="profile" → shared Abilities profiles
  for (const link of asArray(unitEntry.infoLinks?.infoLink)) {
    if (attrStr(link, '@_type') !== 'profile') continue;
    const p = sharedProfiles[attrStr(link, '@_targetId')];
    if (!p || attrStr(p, '@_typeName') !== 'Abilities') continue;
    const chars = {};
    for (const c of asArray(p.characteristics?.characteristic)) {
      chars[attrStr(c, '@_name')] = charText(c);
    }
    addAbility(attrStr(p, '@_name'), chars.Description || chars.Ability || '');
  }

  return abilities;
}

// ── Points extraction ──────────────────────────────────────────────────────────

function extractPoints(unitEntry) {
  const basePts = asArray(unitEntry.costs?.cost)
    .find(c => attrStr(c, '@_name') === 'pts');
  if (!basePts) return { points: null, _pointsNote: null };

  const base = Number(attrStr(basePts, '@_value'));

  // Check for size-based modifier (second size tier)
  const altPts = asArray(unitEntry.modifiers?.modifier).find(m =>
    attrStr(m, '@_type') === 'set' &&
    attrStr(m, '@_field') === attrStr(basePts, '@_typeId')
  );

  if (altPts) {
    return {
      points: base,
      _pointsNote: `Base ${base}pts. Additional size option: ${attrStr(altPts, '@_value')}pts`,
    };
  }

  return { points: base, _pointsNote: null };
}

// ── Keyword extraction ─────────────────────────────────────────────────────────

// Skip BSData internal category names
const SKIP_CATEGORIES = new Set([
  'Configuration', 'Warlord Trait', 'Epic Hero', 'Stratagems',
  'Crusade', 'Crusade Requisition', 'Crusade Agenda',
  'Crusade Relic', 'Battle Honours', 'Crusade Forces',
  'Crusade Relics', 'Warlord Traits', 'Battle Trait',
  'Blackstone Fortress', 'Underworlds', 'Necromunda',
]);

function extractKeywords(unitEntry) {
  return asArray(unitEntry.categoryLinks?.categoryLink)
    .map(cl => attrStr(cl, '@_name').trim())
    .filter(n => n && !SKIP_CATEGORIES.has(n) && !n.startsWith('Faction:') && !n.startsWith('Crusade'));
}

// ── First model in composition ─────────────────────────────────────────────────

// DFS through the unit's entire composition tree to find the first model entry.
// BSData 40k has at least three nesting patterns — this handles all of them.
function findPrimaryModel(unitEntry, byId, _depth) {
  const depth = _depth || 0;
  if (depth > 6) return null; // guard against infinite recursion

  // Direct model children (e.g. Guardian Defenders pattern)
  for (const se of asArray(unitEntry.selectionEntries?.selectionEntry)) {
    if (attrStr(se, '@_type') === 'model') return se;
  }

  // Via selectionEntryGroups
  for (const grp of asArray(unitEntry.selectionEntryGroups?.selectionEntryGroup)) {
    // Direct model in group's selectionEntries (Armoured Sentinels pattern)
    for (const se of asArray(grp.selectionEntries?.selectionEntry)) {
      if (attrStr(se, '@_type') === 'model') return se;
    }
    // Recurse into upgrade children that may contain deeper groups/links
    for (const se of asArray(grp.selectionEntries?.selectionEntry)) {
      const found = findPrimaryModel(se, byId, depth + 1);
      if (found) return found;
    }
    // Direct entryLinks on the group (some factions)
    for (const link of asArray(grp.entryLinks?.entryLink)) {
      if (attrStr(link, '@_type') !== 'selectionEntry') continue;
      const target = byId[attrStr(link, '@_targetId')];
      if (target && attrStr(target, '@_type') === 'model') return target;
    }
  }

  // Via direct entryLinks on this node (Cadian Shock Troops pattern — entryLink → shared model)
  for (const link of asArray(unitEntry.entryLinks?.entryLink)) {
    if (attrStr(link, '@_type') !== 'selectionEntry') continue;
    const target = byId[attrStr(link, '@_targetId')];
    if (target && attrStr(target, '@_type') === 'model') return target;
  }

  return null;
}

// Recursively collect all model entries in the unit's composition tree.
// Also traverses sharedSelectionEntryGroup links to find model variants
// that hold alternate weapons (e.g. "Shock Trooper w/ Plasma Gun").
function findAllModels(unitEntry, byId, _seen, _depth) {
  const seen   = _seen  || new Set();
  const depth  = _depth || 0;
  const models = [];
  if (depth > 8) return models;

  function addModel(m) {
    const id = attrStr(m, '@_id');
    if (seen.has(id)) return;
    seen.add(id);
    models.push(m);
  }

  function recurseNode(node) {
    models.push(...findAllModels(node, byId, seen, depth + 1));
  }

  // Direct model selectionEntries
  for (const se of asArray(unitEntry.selectionEntries?.selectionEntry)) {
    if (attrStr(se, '@_type') === 'model') addModel(se);
    else recurseNode(se);
  }

  // Through inline selectionEntryGroups
  for (const grp of asArray(unitEntry.selectionEntryGroups?.selectionEntryGroup)) {
    for (const se of asArray(grp.selectionEntries?.selectionEntry)) {
      if (attrStr(se, '@_type') === 'model') addModel(se);
      else recurseNode(se);
    }
    for (const link of asArray(grp.entryLinks?.entryLink)) {
      const linkType = attrStr(link, '@_type');
      const target   = byId[attrStr(link, '@_targetId')];
      if (!target) continue;
      if (linkType === 'selectionEntry') {
        if (attrStr(target, '@_type') === 'model') addModel(target);
      } else if (linkType === 'selectionEntryGroup') {
        for (const se of asArray(target.selectionEntries?.selectionEntry)) {
          if (attrStr(se, '@_type') === 'model') addModel(se);
          else recurseNode(se);
        }
      }
    }
  }

  // Through entryLinks — both selectionEntry (model) and selectionEntryGroup (group of model variants)
  for (const link of asArray(unitEntry.entryLinks?.entryLink)) {
    const linkType = attrStr(link, '@_type');
    const target   = byId[attrStr(link, '@_targetId')];
    if (!target) continue;

    if (linkType === 'selectionEntry') {
      if (attrStr(target, '@_type') === 'model') addModel(target);
    } else if (linkType === 'selectionEntryGroup') {
      // Shared group containing model variant options (e.g. special weapon variants)
      for (const se of asArray(target.selectionEntries?.selectionEntry)) {
        if (attrStr(se, '@_type') === 'model') addModel(se);
        else recurseNode(se);
      }
    }
  }

  return models;
}

// ── Main unit parser ───────────────────────────────────────────────────────────

function parseUnit(unitEntry, byId, sharedProfiles, glossary, factionSlug) {
  const name = attrStr(unitEntry, '@_name');

  // Stats — from first model's Unit profile
  const primaryModel = findPrimaryModel(unitEntry, byId);
  let stats = null;
  if (primaryModel) {
    const rawStats = extractUnitStats(primaryModel, sharedProfiles);
    if (rawStats) {
      stats = {
        M:  rawStats.M  || '',
        T:  rawStats.T  || '',
        SV: rawStats.SV || '',
        W:  rawStats.W  || '',
        LD: rawStats.LD || '',
        OC: rawStats.OC || '',
      };
    }
  }

  // Weapons — aggregate across all model variants, dedup by id
  const allModels = findAllModels(unitEntry, byId);
  const weaponMap = new Map();
  for (const model of allModels) {
    for (const w of collectWeapons(model, byId, glossary)) {
      if (!weaponMap.has(w.id)) weaponMap.set(w.id, w);
    }
  }
  const weapons = [...weaponMap.values()];

  // Points
  const { points, _pointsNote } = extractPoints(unitEntry);

  // Keywords
  const keywords = extractKeywords(unitEntry);

  // Abilities
  const abilities = collectAbilities(unitEntry, sharedProfiles);

  // Category flags
  const kwSet = new Set(keywords.map(k => k.toUpperCase()));
  const isCharacter = kwSet.has('CHARACTER');
  const isVehicle   = kwSet.has('VEHICLE') || kwSet.has('MONSTER');
  const isPsyker    = kwSet.has('PSYKER');

  const unit = {
    id:      slugify(name),
    name,
    faction: factionSlug,
    stats,
    points,
    weapons,
    abilities,
    keywords,
    isCharacter,
    isVehicle,
    isPsyker,
  };

  if (_pointsNote) unit._pointsNote = _pointsNote;

  return unit;
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (!fs.existsSync(GLOSSARY_PATH)) {
    console.error('ERROR: run extract-glossary.js first to generate rules-glossary-40k.json');
    process.exit(1);
  }
  const glossary = JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf8'));

  for (const faction of FACTIONS) {
    const catPath = path.join(W40K_DIR, faction.file);
    if (!fs.existsSync(catPath)) {
      console.warn(`  WARN: not found — ${faction.file}`);
      continue;
    }

    console.log(`Parsing: ${faction.name}`);
    const xml    = fs.readFileSync(catPath, 'utf8');
    const parser = new XMLParser(PARSER_OPTS);
    const doc    = parser.parse(xml);
    const cat    = doc.catalogue;

    if (!cat) {
      console.error(`  ERROR: could not parse ${faction.file}`);
      continue;
    }

    const { byId, sharedProfiles } = buildSharedMaps(cat);
    // Library cats store everything in sharedSelectionEntries, not selectionEntries
    const allEntries = [
      ...asArray(cat.selectionEntries?.selectionEntry),
      ...asArray(cat.sharedSelectionEntries?.selectionEntry),
    ];
    const unitEntries = allEntries.filter(e => attrStr(e, '@_type') === 'unit');

    const units    = [];
    const warnings = [];

    for (const entry of unitEntries) {
      const unit = parseUnit(entry, byId, sharedProfiles, glossary, faction.slug);
      if (!unit.stats) {
        warnings.push(`No stats for "${unit.name}"`);
      }
      units.push(unit);
    }

    const output = {
      id:     faction.slug,
      name:   faction.name,
      system: 'warhammer-40k',
      units,
    };

    const outPath = path.join(OUT_DIR, `40k-${faction.slug}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

    if (warnings.length) {
      console.log(`  warnings: ${warnings.join('; ')}`);
    }

    // Unknown keywords report
    const unknowns = new Set();
    for (const u of units) {
      for (const w of u.weapons) {
        for (const k of w.keywords) {
          if (k.unknown) unknowns.add(k.raw);
        }
      }
    }
    if (unknowns.size) {
      console.log(`  unknown weapon keywords: ${[...unknowns].slice(0, 10).join(', ')}${unknowns.size > 10 ? '...' : ''}`);
    }

    console.log(`  → 40k-${faction.slug}.json  (${units.length} units, ${units.filter(u => !u.stats).length} missing stats)`);
  }
}

main();
