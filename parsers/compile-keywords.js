#!/usr/bin/env node
// compile-keywords.js — BON-1 Part 2: maps weapon keyword strings to bonus
// objects and writes a `bonuses` array onto each weapon in the parsed
// faction output JSON, alongside the existing `keywords` array (kept for
// display — the engine never parses that prose).
//
// KEYWORD_KT_MAP / KEYWORD_W40K_MAP are keyed by glossary rule id (the same
// ids weapon.keywords[].id already resolved to during parsing) — reviewable,
// correctable, same philosophy as the FACTION_SLUG table in parse-kt.js.
// A glossary rule with no entry here is not guessed at: its weapons keep
// the raw keyword only, and it's written to output/_unmapped_keywords.txt.

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../output');
const UNMAPPED_PATH = path.join(OUT_DIR, '_unmapped_keywords.txt');

function parseParam(raw) {
  const m = raw.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function slugParam(raw) {
  const n = parseParam(raw);
  return n === null ? '' : `-${n}`;
}

const FREE_PASSIVE = { type: 'free', amount: 0 };

// ── KT weapon rules (output/rules-glossary-kt.json ids) ────────────────────
const KEYWORD_KT_MAP = {
  'lethal-xplus': raw => ({
    idSuffix: `lethal${slugParam(raw)}`, name: raw,
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'critThreshold', op: 'cap', value: parseParam(raw) }],
  }),
  'accurate-x': raw => ({
    idSuffix: `accurate${slugParam(raw)}`, name: raw,
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'retainNormal', op: 'add', value: parseParam(raw) }],
  }),
  // Lossy approximation: the real rule bypasses defence dice entirely and
  // inflicts x flat damage per retained crit; BON-1's schema has no "bypass
  // resolution" effect shape yet, so this is modeled as "+x crit damage"
  // instead. Flagged in the review report, not a hidden guess.
  'devastating-x': raw => ({
    idSuffix: `devastating${slugParam(raw)}`, name: raw,
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'dmgCrit', op: 'add', value: parseParam(raw) }],
    approximate: true,
  }),
  'piercing-x': raw => {
    const isCrits = /crits/i.test(raw);
    return {
      idSuffix: `piercing${slugParam(raw)}${isCrits ? '-crits' : ''}`, name: raw,
      activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
      trigger: 'onShoot', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
      effects: [{
        type: 'mod', stat: 'defDice', op: 'add', value: -parseParam(raw),
        ...(isCrits ? { when: 'critScored' } : {}),
      }],
    };
  },
  'blast-x': raw => ({
    idSuffix: 'blast', name: 'Blast',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'blast' }],
  }),
  'torrent-x': raw => ({
    idSuffix: 'torrent', name: 'Torrent',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'torrent' }],
  }),
  balanced: raw => ({
    idSuffix: 'balanced', name: 'Balanced',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'rerollOne', op: 'add', value: 1 }],
  }),
  // Approximation: reroll-all-of-one-result collapses to the same
  // "rerollAll" stat as Relentless's full reroll — the "only one result
  // value" nuance is lost. Same tradeoff class as Devastating above.
  ceaseless: raw => ({
    idSuffix: 'ceaseless', name: 'Ceaseless',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'rerollAll', op: 'add', value: 1 }],
    approximate: true,
  }),
  relentless: raw => ({
    idSuffix: 'relentless', name: 'Relentless',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'rerollAll', op: 'add', value: 1 }],
  }),
  saturate: raw => ({
    idSuffix: 'saturate', name: 'Saturate',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'ignoreCover' }],
  }),
  heavy: raw => ({
    idSuffix: 'heavy', name: 'Heavy',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'always', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'heavy' }],
  }),
  silent: raw => ({
    idSuffix: 'silent', name: 'Silent',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'silent' }],
  }),
  // Seek ignores terrain for visibility/targeting but NOT the cover save —
  // that's exactly what ignoreObscured (not ignoreCover) means.
  seek: raw => ({
    idSuffix: 'seek', name: raw,
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'ignoreObscured' }],
    approximate: /light/i.test(raw), // "Seek Light" only affects Light terrain; nuance lost
  }),
  punishing: raw => ({
    idSuffix: 'punishing', name: 'Punishing',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'retainNormal', op: 'add', value: 1, when: 'critScored' }],
  }),
  // Approximation: "convert a normal success to a crit" modeled as "+1
  // retainCrit conditioned on already having a crit" — close in spirit,
  // not a literal conversion (BON-1 has no "convert" effect shape).
  rending: raw => ({
    idSuffix: 'rending', name: 'Rending',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'retainCrit', op: 'add', value: 1, when: 'critScored' }],
    approximate: true,
  }),
  // Approximation: duration should be "until end of the target's NEXT
  // activation"; untilEndOfActivation is the closest v1 enum value.
  stun: raw => ({
    idSuffix: 'stun', name: 'Stun',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'untilEndOfActivation', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'apl', op: 'add', value: -1, when: 'critScored' }],
    approximate: true,
  }),
};

// ── 40k weapon rules (output/rules-glossary-40k.json ids) ───────────────────
const KEYWORD_W40K_MAP = {
  'ignores-cover': raw => ({
    idSuffix: 'ignores-cover', name: 'Ignores Cover',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'ignoreCover' }],
  }),
  'indirect-fire': raw => ({
    idSuffix: 'indirect-fire', name: 'Indirect Fire',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'indirect' }],
    approximate: true, // flag only — the hit penalty/cover-grant math is engine work
  }),
  blast: raw => ({
    idSuffix: 'blast', name: 'Blast',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'blast' }],
  }),
  torrent: raw => ({
    idSuffix: 'torrent', name: 'Torrent',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'torrent' }],
  }),
  heavy: raw => ({
    idSuffix: 'heavy', name: 'Heavy',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'always', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'heavy' }],
  }),
  // New flags, not in the BONUS_ENGINE_BRIEF v1 flag list — minted here
  // because the rule is genuinely boolean-shaped and the schema's own
  // safety net ("unknown flags pass through untouched") is designed for
  // exactly this: engines that don't know the flag ignore it safely.
  'devastating-wounds': raw => ({
    idSuffix: 'devastating-wounds', name: 'Devastating Wounds',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'devastatingWounds' }],
    newFlag: true,
  }),
  'lethal-hits': raw => ({
    idSuffix: 'lethal-hits', name: 'Lethal Hits',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'lethalHits' }],
    newFlag: true,
  }),
  'lone-operative': raw => ({
    idSuffix: 'lone-operative', name: 'Lone Operative',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'always', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'loneOperative' }],
    newFlag: true,
  }),
  'fights-first': raw => ({
    idSuffix: 'fights-first', name: 'Fights First',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onFight', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'fightsFirst' }],
    newFlag: true,
  }),
  // "-1 to the attacker's Hit roll" against this unit == the attacker's
  // effective hit threshold gets worse by 1 -> add +1 (roll-target: higher
  // is worse), scoped to whoever is attacking this bonus's owner.
  stealth: raw => ({
    idSuffix: 'stealth', name: 'Stealth',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onDefend', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'hit', op: 'add', value: 1 }],
  }),
};

// Rules deliberately left unmapped, with the reason — surfaced in the report
// so "unmapped" doesn't read as "forgotten."
const KNOWN_UNMAPPED_REASONS = {
  // KT
  brutal: 'restricts blocking to crits-only; no partial-block flag exists (noBlock means no blocking at all, which would misrepresent the rule)',
  hot: 'self-damage-on-use risk; no matching stat or flag in v1 vocab',
  'limited-x': "weapon-fire-count limit is a weapon property, not a bonus effect — doesn't fit the effects schema",
  shock: "targets the defender's dice pool conditioned on the attacker's crit; too specific for the current when/scope vocab without guessing",
  severe: 'needs a "no crit scored" condition; `when` vocab currently only defines critScored (added for Piercing Crits) — extending it further was not authorized for this pass',
  // 40k
  pistol: 'targeting-eligibility rule (can shoot while engaged), not a stat/flag modifier',
  hazardous: 'self-damage-test mechanic; same gap as KT\'s Hot',
  leader: 'attached-unit/wound-allocation structural rule, not a modifier',
  assault: 'targeting-eligibility rule (can shoot after Advancing)',
  'extra-attacks': 'attack-sequencing/composition rule, not a stat modifier',
  'twin-linked': "modifies the Wound roll specifically; v1 stat vocab has no separate 'wound' stat from 'hit' (KT has no two-step hit/wound sequence, so the vocab was never built for it) — needs a vocab decision, not a guess",
  anti: 'same hit/wound-split gap as twin-linked',
  'sustained-hits': 'same hit/wound-split gap as twin-linked',
  melta: 'range-conditional (within half range); would need a "when" fact like halfRange that was not authorized for this pass',
  'rapid-fire': 'same range-conditional gap as melta',
  'feel-no-pain': 'parametric extra defensive roll after saves; no matching stat, and collapsing to a flag would lose the x+ threshold',
  precision: 'attack-allocation targeting rule, not a stat modifier',
  lance: 'same hit/wound-split gap as twin-linked (modifies Wound roll on charge)',
  scouts: 'deployment-phase rule, out of combat-modifier scope',
  infiltrators: 'deployment-phase rule, out of combat-modifier scope',
  'deep-strike': 'deployment-phase rule, out of combat-modifier scope',
  'deadly-demise': 'explosion-on-death rule, not a combat modifier',
  'super-heavy-walker': 'unit-type/profile rule, not a modifier',
  hover: 'unit-type/movement-profile rule, not a modifier',
  psychic: 'keyword tag gating other rules, no mechanical effect itself',
  'firing-deck': 'transport/embark mechanic, structural not a modifier',
  'one-shot': "weapon-fire-count limit — same gap as KT's Limited",
  crucible: 'mission/scenario-specific rule, out of BON-1 scope',
};

function compileWeaponBonuses(weapon, system, map) {
  const bonuses = [];
  for (const kw of weapon.keywords || []) {
    if (!kw.id) continue; // unresolved against the glossary entirely — not our problem here, parse-time already flags it as unknown
    const builder = map[kw.id];
    if (!builder) continue; // handled by the unmapped report
    const built = builder(kw.raw);
    bonuses.push({
      id: `${built.idSuffix}`,
      name: built.name,
      description: 'Flavor/reference text only. Engine never reads this.',
      system,
      faction: null,
      source: 'keyword',
      activation: built.activation,
      cost: built.cost,
      usage: built.usage,
      trigger: built.trigger,
      duration: built.duration,
      scope: built.scope,
      effects: built.effects,
    });
  }
  return bonuses;
}

function processFile(file, system, map) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const seen = {}; // ruleId -> count
  const unmapped = {}; // ruleId -> { name, count }
  const unresolved = {}; // raw text that never even matched the glossary -> count
  const catalog = new Map(); // bonusId -> bonus object (deduped)

  const units = data.operatives || data.units || [];
  for (const unit of units) {
    for (const weapon of unit.weapons || []) {
      for (const kw of weapon.keywords || []) {
        if (!kw.id) {
          unresolved[kw.raw] = (unresolved[kw.raw] || 0) + 1;
          continue;
        }
        seen[kw.id] = (seen[kw.id] || 0) + 1;
        if (!map[kw.id]) {
          unmapped[kw.id] = { name: kw.name, count: (unmapped[kw.id]?.count || 0) + 1 };
        }
      }
      const bonuses = compileWeaponBonuses(weapon, system, map);
      weapon.bonuses = bonuses; // keep existing `keywords` array untouched, add alongside
      // Dedup key includes system: KT and 40k independently mint ids like
      // "blast"/"torrent"/"heavy" and they are NOT the same bonus definition
      // even though the id string matches — colliding on bare id would
      // silently drop one system's version from the aggregated catalog.
      for (const b of bonuses) catalog.set(`${b.system}:${b.id}`, b);
    }
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  return { seen, unmapped, unresolved, catalog };
}

function main() {
  const ktFiles = fs.readdirSync(OUT_DIR).filter(f => f.startsWith('kt-') && f.endsWith('.json'));
  const w40kFiles = ['40k-astra-militarum.json', '40k-craftworlds-eldar.json'].filter(f => fs.existsSync(path.join(OUT_DIR, f)));

  const totals = { seen: {}, unmapped: {}, unresolved: {} };
  const fullCatalog = new Map();
  let filesProcessed = 0;

  for (const f of ktFiles) {
    const { seen, unmapped, unresolved, catalog } = processFile(path.join(OUT_DIR, f), 'kill-team', KEYWORD_KT_MAP);
    filesProcessed++;
    mergeCounts(totals.seen, seen);
    mergeUnmapped(totals.unmapped, unmapped);
    mergeCounts(totals.unresolved, unresolved);
    for (const [key, b] of catalog) fullCatalog.set(key, b);
  }
  for (const f of w40kFiles) {
    const { seen, unmapped, unresolved, catalog } = processFile(path.join(OUT_DIR, f), 'warhammer-40k', KEYWORD_W40K_MAP);
    filesProcessed++;
    mergeCounts(totals.seen, seen);
    mergeUnmapped(totals.unmapped, unmapped);
    mergeCounts(totals.unresolved, unresolved);
    for (const [key, b] of catalog) fullCatalog.set(key, b);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'bonuses-catalog.json'), JSON.stringify([...fullCatalog.values()], null, 2) + '\n');

  const totalSeen = Object.values(totals.seen).reduce((a, b) => a + b, 0);
  const totalUnmappedInstances = Object.values(totals.unmapped).reduce((a, b) => a + b.count, 0);
  const mappedInstances = totalSeen - totalUnmappedInstances;

  const lines = [];
  lines.push('compile-keywords.js — unmapped keyword report');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Files processed: ${filesProcessed} (${ktFiles.length} KT factions, ${w40kFiles.length} 40k factions)`);
  lines.push(`Total keyword instances seen: ${totalSeen}`);
  lines.push(`Mapped: ${mappedInstances}`);
  lines.push(`Unmapped (known rule, no mapping table entry): ${totalUnmappedInstances}`);
  const totalUnresolved = Object.values(totals.unresolved).reduce((a, b) => a + b, 0);
  lines.push(`Unresolved (didn't even match a glossary rule at parse time): ${totalUnresolved}`);
  lines.push('');
  lines.push('── Unmapped rules (grouped) ─────────────────────────────');
  for (const [id, { name, count }] of Object.entries(totals.unmapped).sort((a, b) => b[1].count - a[1].count)) {
    const reason = KNOWN_UNMAPPED_REASONS[id] || '(no reason recorded — check the mapping table)';
    lines.push(`${name} [${id}] — ${count} instance(s)`);
    lines.push(`  reason: ${reason}`);
  }
  if (totalUnresolved > 0) {
    lines.push('');
    lines.push('── Unresolved raw strings (never matched a glossary rule) ──');
    for (const [raw, count] of Object.entries(totals.unresolved).sort((a, b) => b[1] - a[1])) {
      lines.push(`"${raw}" — ${count} instance(s)`);
    }
  }
  fs.writeFileSync(UNMAPPED_PATH, lines.join('\n') + '\n');

  console.log(`Files processed: ${filesProcessed}`);
  console.log(`Total keyword instances seen: ${totalSeen}`);
  console.log(`Mapped: ${mappedInstances}`);
  console.log(`Unmapped: ${totalUnmappedInstances} (${Object.keys(totals.unmapped).length} distinct rules)`);
  console.log(`Unresolved raw strings: ${totalUnresolved}`);
  console.log(`Catalog entries (deduped bonus definitions): ${fullCatalog.size}`);
  console.log(`Report written: ${UNMAPPED_PATH}`);
  console.log(`Catalog written: ${path.join(OUT_DIR, 'bonuses-catalog.json')}`);
}

function mergeCounts(target, source) {
  for (const [k, v] of Object.entries(source)) target[k] = (target[k] || 0) + v;
}
function mergeUnmapped(target, source) {
  for (const [k, v] of Object.entries(source)) {
    target[k] = target[k] || { name: v.name, count: 0 };
    target[k].count += v.count;
  }
}

main();
