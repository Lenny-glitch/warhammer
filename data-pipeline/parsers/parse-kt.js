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

// ROSTER_VAL_ALL: a few factions mark their Leader-equivalent operative(s)
// with a faction-specific categoryLink name instead of BSData's generic
// "Leader" link. Only add an alias here when the source itself proves it —
// confirmed directly for Warpcoven: no generic "Leader" categoryLink exists
// anywhere in its .cat, but all 3 "Sorcerer of X" operatives (its only
// psyker/leader-eligible profiles) carry their own "Sorcerer" categoryLink.
// Deliberately NOT used to paper over a faction with no structural leader
// marker at all (e.g. Strike Force Variel — left as a real, reported gap).
const LEADER_CATEGORY_ALIASES = { Warpcoven: 'Sorcerer' };

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

  // CAT-AUDIT: entryLinks of type="selectionEntryGroup" can target a
  // selectionEntryGroup that's itself top-level/shared (e.g. Void-dancer
  // Troupe's "Pistol"/"Melee weapon" groups, referenced by both Lead
  // Player and Player), not nested inside a selectionEntry. Those group
  // ids were never indexed, so every entryLink pointing at one silently
  // resolved to nothing. IDs are unique regardless of node kind, so this
  // shares the one byId map rather than needing a separate lookup.
  for (const grp of [
    ...asArray(catalogue.sharedSelectionEntryGroups?.selectionEntryGroup),
    ...asArray(catalogue.selectionEntryGroups?.selectionEntryGroup),
  ]) {
    byId[attrStr(grp, '@_id')] = grp;
  }

  const sharedProfiles = {};
  for (const p of asArray(catalogue.sharedProfiles?.profile)) {
    sharedProfiles[attrStr(p, '@_id')] = p;
  }
  return { byId, sharedProfiles };
}

// ── Weapon rule parser ─────────────────────────────────────────────────────────

// PIPE-H1 item 1: one real upstream data typo found in a full 48-faction
// sweep — Wyrmblade's "Master-crafted autopistol" prints "Rang 8"" (missing
// the 'e') instead of "Range 8"". Everything else that came up in the sweep
// as range-shaped text ("Torrent 1\"", "Blast 2\"", "1\" Devastating 1")
// is a genuinely different rule with its own inch value, not a range
// miss — confirmed by checking each pattern name-by-name, not assumed.
function extractRange(wrString) {
  if (!wrString) return null;
  const m = wrString.match(/\bRange (\d+)"/) || wrString.match(/\bRang (\d+)"/);
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

function buildWeapon(profile, glossary, crossGlossary, groupNameHint) {
  const rawName = attrStr(profile, '@_name').trim();
  let isRanged = rawName.startsWith('⌖');
  let isMelee  = rawName.startsWith('⚔');

  const chars = {};
  for (const c of asArray(profile.characteristics?.characteristic)) {
    chars[attrStr(c, '@_name')] = charText(c);
  }

  // CAT-AUDIT: ~34 KT 2024 Weapons profiles (Fists, Combat blade, Meltagun
  // in several factions, Phosphor blaster, etc.) ship with no ⌖/⚔ glyph at
  // all anywhere in the raw .cat — a real, widespread BSData source gap
  // (confirmed file-by-file), not a name-collision and not isolated to one
  // unit. Previously these silently returned null and vanished, producing
  // fully-unarmed operatives. Infer type instead of dropping the weapon:
  // an embedded "Range N" in WR is the strongest signal (every glyphed
  // ranged weapon's own WR text has one — also catches the pre-existing
  // "Rang 8"" typo case extractRange() already handles below); falling
  // back to the enclosing weapon-choice group's own name (BSData names
  // some "Ranged Weapon") catches "Phosphor blaster", the one case with
  // neither a glyph nor a stated range (that weapon's missing range value
  // is a separate BSData gap, not fixed here — inventing the number would
  // violate "never invent weapon stats"). Defaults to melee otherwise,
  // which is also every remaining case's correct real-world classification
  // (Fists, Combat blade, Gun butts, Cult knife, ... are all genuinely
  // melee weapons with no range to state).
  if (!isRanged && !isMelee) {
    const wr = chars.WR || '';
    if (/\bRang?e\s+\d/i.test(wr)) {
      isRanged = true;
    } else if (groupNameHint && /ranged/i.test(groupNameHint)) {
      isRanged = true;
    } else {
      isMelee = true;
    }
  }

  const cleanName = rawName.replace(/^[⌖⚔]\s*/, '').trim();

  // CAT-AUDIT: Novitiates' "Neural whips" ships BOTH profiles glyphed ⌖
  // (ranged) even though one is explicitly named "... (melee)" — confirmed
  // by sweeping every "(melee)"/"(ranged)"-suffixed weapon pair in the
  // 2024 catalogues (13 pairs total): this is the only one where the
  // glyph disagrees with the weapon's own stated name, so it's a single
  // upstream typo, not an ambiguous convention. The explicit suffix is the
  // more specific signal (it exists solely to disambiguate a dual-profile
  // weapon) and wins when the two disagree.
  if (/\(melee\)$/i.test(cleanName))  { isRanged = false; isMelee = true; }
  if (/\(ranged\)$/i.test(cleanName)) { isRanged = true;  isMelee = false; }

  const type      = isRanged ? 'ranged' : 'melee';

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

  // PIPE-H1 item 1: self-recursive. A weapon-upgrade selectionEntry can
  // nest its OWN selectionEntryGroups one level deeper (e.g. Wyrmblade's
  // "Pistol and Melee Weapon" -> group "Pistol" -> "Bolt pistol"/
  // "Master-crafted autopistol") — a flat one-level walk never reaches
  // that branch, so those weapons were entirely invisible (not just
  // missing rng — this was found while chasing the rng gap, but it's a
  // strictly bigger miss: the weapon object never existed at all).
  // Recursive so any further nesting is handled too, not just this one
  // observed depth.
  // CAT-AUDIT: entryLinks can appear at ANY depth, not just directly on
  // modelEntry — a group's options are sometimes entryLinks straight to a
  // shared weapon (e.g. Angels of Death's "Melee Weapon" group links
  // "Chainsword"/"Power fist"/... by id, no inline <selectionEntries> at
  // all), and a "combo" upgrade entry like Death Korps's "Boltgun;
  // bayonet" has no <profiles> of its own, only nested entryLinks to the
  // real Boltgun and Bayonet entries. The old code only resolved entryLinks
  // sitting directly on modelEntry, so both shapes silently produced zero
  // weapons. extractFromEntry/extractFromLink now recurse into each other
  // so entryLinks resolve wherever they occur.
  function extractFromEntry(entry, groupName) {
    for (const p of weaponProfilesFromEntry(entry)) {
      const w = buildWeapon(p, glossary, crossGlossary, groupName);
      if (w) weapons.push(w);
    }
    for (const grp of asArray(entry.selectionEntryGroups?.selectionEntryGroup)) {
      const nestedGroupName = attrStr(grp, '@_name') || groupName;
      for (const e of asArray(grp.selectionEntries?.selectionEntry)) {
        extractFromEntry(e, nestedGroupName);
      }
      for (const link of asArray(grp.entryLinks?.entryLink)) {
        extractFromLink(link, nestedGroupName);
      }
    }
    for (const e of asArray(entry.selectionEntries?.selectionEntry)) {
      extractFromEntry(e, groupName);
    }
    for (const link of asArray(entry.entryLinks?.entryLink)) {
      extractFromLink(link, groupName);
    }
  }

  function extractFromLink(link, groupName) {
    const target = sharedById[attrStr(link, '@_targetId')];
    if (!target) return;
    if (attrStr(link, '@_type') === 'selectionEntry') {
      extractFromEntry(target, groupName);
    } else if (attrStr(link, '@_type') === 'selectionEntryGroup') {
      const nestedGroupName = attrStr(target, '@_name') || groupName;
      for (const e of asArray(target.selectionEntries?.selectionEntry)) {
        extractFromEntry(e, nestedGroupName);
      }
      for (const l of asArray(target.entryLinks?.entryLink)) {
        extractFromLink(l, nestedGroupName);
      }
    }
  }

  extractFromEntry(modelEntry, null);

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

function extractComposition(catalogue, catName, leaderRoles) {
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

  // ROSTER-VAL: was `catalogue.selectionEntries` only — the same
  // selectionEntries-vs-sharedSelectionEntries split CAT-AUDIT found for
  // weapon extraction applies here too, so this now walks the identical
  // set the main operative loop does (allModelEntries).
  const modelEntries = [
    ...asArray(catalogue.selectionEntries?.selectionEntry),
    ...asArray(catalogue.sharedSelectionEntries?.selectionEntry),
  ].filter(e => attrStr(e, '@_type') === 'model');

  for (const entry of modelEntries) {
    for (const c of asArray(entry.constraints?.constraint)) {
      if (attrStr(c, '@_scope') !== forceId) continue;
      const val = Number(attrStr(c, '@_value'));
      if (attrStr(c, '@_type') === 'max') {
        // ROSTER-VAL: was the raw un-stripped selectionEntry name (e.g.
        // "Shas'Ui Pathfinder") — every operative's own `role` field is
        // the deriveRole()-stripped form ("Shas'Ui"), so this never
        // matched anything once it reached _checkLegality's `op.role ===
        // r.unitRole` check. Same transform, same call, as the main loop.
        perModel.push({ role: deriveRole(attrStr(entry, '@_name'), catName), max: val });
      }
    }
  }

  // ROSTER-VAL: roster's _checkLegality() consumes {totalOperatives,
  // rules:[{type,unitRole|unitRoles,count,description}]} — built here so
  // upload.js can write compositionRules straight through with no
  // reshaping. perModelLimits stays alongside for inspection/debugging;
  // `rules` is the one actually meant for roster to read.
  const rules = perModel.map(p => ({
    type: 'max', unitRole: p.role, count: p.max,
    description: `Max ${p.max} ${p.role}`,
  }));
  if (leaderRoles && leaderRoles.length) {
    rules.push({
      type: 'required', unitRoles: [...new Set(leaderRoles)], count: 1,
      description: 'Requires a Leader',
    });
  }

  return {
    totalOperatives: { min: totalMin, max: totalMax },
    perModelLimits:  perModel,
    rules,
  };
}

// ── Main parse ─────────────────────────────────────────────────────────────────

function parseCat(cat, glossary, crossGlossary, globalById) {
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

  const { sharedProfiles } = buildSharedMaps(cat);
  const operatives = [];
  const warnings  = [];
  // ROSTER-VAL: which derived roles carry BSData's own "Leader" categoryLink
  // — collected here (where `role` is already computed) rather than
  // re-deriving it inside extractComposition, so there's exactly one
  // source of truth for "operative name -> role" in this file.
  const leaderRoles = [];

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

    const weapons   = collectWeapons(entry, globalById, glossary, crossGlossary);
    const abilities = collectAbilities(entry);
    const keywords  = extractKeywords(entry);

    const role = deriveRole(name, catName);

    // ROSTER-VAL: "Leader" is filtered out of `keywords` by SKIP_KEYWORDS
    // (it's a structural BSData category, not a game keyword) — this
    // reads the same categoryLinks in parallel to keep that filter
    // untouched while still surfacing which role(s) can lead, for
    // composition-rule derivation below.
    // ROSTER_VAL_ALL: LEADER_CATEGORY_ALIASES covers factions using a
    // faction-specific name for this same structural link (see its comment).
    const leaderCategoryName = LEADER_CATEGORY_ALIASES[catName] || 'Leader';
    const isLeader = asArray(entry.categoryLinks?.categoryLink)
      .some(cl => attrStr(cl, '@_name') === leaderCategoryName);
    if (isLeader) leaderRoles.push(role);

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

  const composition = extractComposition(cat, catName, leaderRoles);

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

  // CAT-AUDIT: two-pass. Some catalogues (e.g. "Inquisitorial Agents",
  // which explicitly declares <catalogueLinks> to Kasrkin/Death Korps/
  // Exaction Squad/Imperial Navy Breachers) reference weapon
  // selectionEntries by id that are only ever DEFINED in one of those
  // OTHER files, not their own. A per-file sharedById map can never
  // resolve those entryLinks, so every operative built purely from
  // cross-catalogue links (most of Inquisitorial Agents' 56) came out
  // with zero weapons. Parse every catalogue's XML first, then merge
  // every file's own shared-entry map into one global registry before
  // extracting any weapons. IDs are globally-unique GUIDs in this
  // dataset (confirmed: merging produced zero overwritten keys across
  // all 47 files), so this can only ever resolve an entryLink's already-
  // explicit targetId — it can't introduce an ambiguous match.
  const xmlParser = new XMLParser(PARSER_OPTS);
  const catDocs = catFiles
    .map(catPath => ({ catPath, cat: xmlParser.parse(fs.readFileSync(catPath, 'utf8')).catalogue }))
    .filter(d => d.cat);

  const globalById = {};
  let overwrites = 0;
  for (const { cat } of catDocs) {
    for (const [id, entry] of Object.entries(buildSharedMaps(cat).byId)) {
      if (globalById[id]) overwrites++;
      globalById[id] = entry;
    }
  }
  if (overwrites) {
    console.warn(`  WARN: ${overwrites} duplicate selectionEntry id(s) across catalogues — global registry may be unreliable`);
  }

  const patches = loadPatches();
  const patchesApplied = [];
  const results = [];

  for (const { catPath, cat } of catDocs) {
    const catName = path.basename(catPath).replace(/^2024 - /, '').replace(/\.cat$/, '');
    console.log(`Parsing: ${catName}`);

    try {
      const faction = parseCat(cat, glossary, crossGlossary, globalById);
      if (!faction) continue;

      // Fails loud (throws, aborting the whole run) if a patch no longer
      // matches a unit — see apply-patches.js.
      const applied = applyPatches(faction, patches, 'operatives');
      if (applied.length) {
        patchesApplied.push(...applied);
        for (const p of applied) {
          const target = p.scope === 'faction' ? 'composition' : p.unit;
          console.log(`  patch: ${target}.${p.field} = ${JSON.stringify(p.value)} (${p.reason})`);
        }
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
