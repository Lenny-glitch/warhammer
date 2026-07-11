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
const { loadPatches } = require('./apply-patches');

const OUT_DIR = path.join(__dirname, '../output');
const UNMAPPED_PATH = path.join(OUT_DIR, '_unmapped_keywords.txt');
const MAPPING_REVIEW_PATH = path.join(OUT_DIR, 'mapping-review.txt');

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
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'critThreshold', op: 'cap', value: parseParam(raw) }],
  }),
  'accurate-x': raw => ({
    idSuffix: `accurate${slugParam(raw)}`, name: raw,
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'retainNormal', op: 'add', value: parseParam(raw) }],
  }),
  // Lossy approximation: the real rule bypasses defence dice entirely and
  // inflicts x flat damage per retained crit; BON-1's schema has no "bypass
  // resolution" effect shape yet, so this is modeled as "+x crit damage"
  // instead. Flagged in the review report, not a hidden guess.
  'devastating-x': raw => ({
    idSuffix: `devastating${slugParam(raw)}`, name: raw,
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'dmgCrit', op: 'add', value: parseParam(raw) }],
    approximate: true,
  }),
  // PIPE-H1 item 5: appliesTo:"target" per BON-1c's own spec — this effect
  // reduces the DEFENDER's dice, not the attacker's. The engine currently
  // routes by stat name alone (defDice is unambiguous — deliberate, kept),
  // but the data should match its own schema doc regardless.
  'piercing-x': raw => {
    const isCrits = /crits/i.test(raw);
    return {
      idSuffix: `piercing${slugParam(raw)}${isCrits ? '-crits' : ''}`, name: raw,
      activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
      trigger: 'onAttack', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
      effects: [{
        type: 'mod', stat: 'defDice', op: 'add', value: -parseParam(raw), appliesTo: 'target',
        ...(isCrits ? { when: 'critScored' } : {}),
      }],
    };
  },
  'blast-x': raw => ({
    idSuffix: 'blast', name: 'Blast',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'blast' }],
  }),
  'torrent-x': raw => ({
    idSuffix: 'torrent', name: 'Torrent',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'torrent' }],
  }),
  balanced: raw => ({
    idSuffix: 'balanced', name: 'Balanced',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'rerollOne', op: 'add', value: 1 }],
  }),
  // Approximation: reroll-all-of-one-result collapses to the same
  // "rerollAll" stat as Relentless's full reroll — the "only one result
  // value" nuance is lost. Same tradeoff class as Devastating above.
  ceaseless: raw => ({
    idSuffix: 'ceaseless', name: 'Ceaseless',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'rerollAll', op: 'add', value: 1 }],
    approximate: true,
  }),
  relentless: raw => ({
    idSuffix: 'relentless', name: 'Relentless',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'rerollAll', op: 'add', value: 1 }],
  }),
  saturate: raw => ({
    idSuffix: 'saturate', name: 'Saturate',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'enemy', range: null, filter: [] },
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
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'silent' }],
  }),
  // Seek ignores terrain for visibility/targeting but NOT the cover save —
  // that's exactly what ignoreObscured (not ignoreCover) means.
  seek: raw => ({
    idSuffix: 'seek', name: raw,
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'ignoreObscured' }],
    approximate: /light/i.test(raw), // "Seek Light" only affects Light terrain; nuance lost
  }),
  punishing: raw => ({
    idSuffix: 'punishing', name: 'Punishing',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'retainNormal', op: 'add', value: 1, when: 'critScored' }],
  }),
  // BON-1c Fix 2: true convert — gain a crit AND lose a normal, same `when`.
  // (Was a single +1 retainCrit "approximate" mod; that only added a crit
  // without spending the normal it's supposed to come from.)
  rending: raw => ({
    idSuffix: 'rending', name: 'Rending',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [
      { type: 'mod', stat: 'retainCrit', op: 'add', value: 1, when: 'critScored' },
      { type: 'mod', stat: 'retainNormal', op: 'add', value: -1, when: 'critScored' },
    ],
  }),
  // BON-1c Fix 3: remapped from a `mod apl` effect to a `condition` — a mod
  // effect only lives for the one resolveStats call it's part of, so it can
  // never actually follow the target into ITS next activation without state
  // tracking (which is BON-3, same as markerlight). appliesTo:"target"
  // since Stun is applied to whoever this operative is shooting, not the
  // shooter.
  stun: raw => ({
    idSuffix: 'stun', name: 'Stun',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'untilEndOfActivation', scope: { target: 'enemy', range: null, filter: [] },
    effects: [{
      type: 'condition', condition: 'stunned', stacks: 1, max: 1,
      when: 'critScored', appliesTo: 'target',
    }],
  }),
  // BON-1c Fix 2: true convert, gated on the opposite condition (fires when
  // NO crit has been retained yet, instead of when one has) — see rending.
  severe: raw => ({
    idSuffix: 'severe', name: 'Severe',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [
      { type: 'mod', stat: 'retainCrit', op: 'add', value: 1, when: 'noCritScored' },
      { type: 'mod', stat: 'retainNormal', op: 'add', value: -1, when: 'noCritScored' },
    ],
  }),
  // BON-1b Decision 2: procedural/targeting-eligibility rules, same
  // pass-through shape as blast/torrent/silent — engines that implement the
  // flag act on it, everyone else safely ignores it.
  brutal: raw => ({
    idSuffix: 'brutal', name: 'Brutal',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'brutal' }],
  }),
  shock: raw => ({
    idSuffix: 'shock', name: 'Shock',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'shock' }],
  }),
  hot: raw => ({
    idSuffix: 'hot', name: 'Hot',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onAttack', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'hot' }],
  }),
  // Cross-glossary borrow (BON-1b item 3): KT weapons carry PSYCHIC in the
  // raw WR text but KT's own .gst never formalized it as a sharedRule —
  // parse-kt.js falls back to the 40k glossary's "psychic" entry to resolve
  // the id, so this map needs its own entry too (see KEYWORD_W40K_MAP for
  // the native 40k version — same id, same flag, separate bonus objects
  // since they carry different `system` values).
  psychic: raw => ({
    idSuffix: 'psychic', name: 'Psychic',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'always', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'psychic' }],
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
  // BON-1b Decision 1: range-conditional damage/attacks increase. Melta's
  // "Damage characteristic is increased" applies uniformly — 40k has one
  // Damage stat, not KT's normal/crit split — so both abstract stats get the
  // bump rather than guessing which one the glossary text "really" means.
  melta: raw => ({
    idSuffix: `melta${slugParam(raw)}`, name: raw,
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [
      { type: 'mod', stat: 'dmgNormal', op: 'add', value: parseParam(raw), when: 'halfRange' },
      { type: 'mod', stat: 'dmgCrit', op: 'add', value: parseParam(raw), when: 'halfRange' },
    ],
  }),
  'rapid-fire': raw => ({
    idSuffix: `rapid-fire${slugParam(raw)}`, name: raw,
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'atkDice', op: 'add', value: parseParam(raw), when: 'halfRange' }],
  }),
  // BON-1b Decision 2: procedural/targeting-eligibility rules — same
  // pass-through shape as heavy/lone-operative/fights-first above.
  assault: raw => ({
    idSuffix: 'assault', name: 'Assault',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'always', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'assault' }],
    newFlag: true,
  }),
  pistol: raw => ({
    idSuffix: 'pistol', name: 'Pistol',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'always', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'pistol' }],
    newFlag: true,
  }),
  precision: raw => ({
    idSuffix: 'precision', name: 'Precision',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onShoot', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'precision' }],
    newFlag: true,
  }),
  hazardous: raw => ({
    idSuffix: 'hazardous', name: 'Hazardous',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'always', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'hazardous' }],
    newFlag: true,
  }),
  'extra-attacks': raw => ({
    idSuffix: 'extra-attacks', name: 'Extra Attacks',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'onFight', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'extraAttacks' }],
    newFlag: true,
  }),
  // Native 40k PSYCHIC (see KEYWORD_KT_MAP's psychic entry for the
  // cross-glossary-borrowed KT counterpart — same id, separate systems).
  psychic: raw => ({
    idSuffix: 'psychic', name: 'Psychic',
    activation: 'passive', cost: FREE_PASSIVE, usage: 'unlimited',
    trigger: 'always', duration: 'instant', scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'flag', flag: 'psychic' }],
  }),
};

// Rules deliberately left unmapped, with the reason — surfaced in the report
// so "unmapped" doesn't read as "forgotten."
const KNOWN_UNMAPPED_REASONS = {
  // KT
  'limited-x': "weapon-fire-count limit is a weapon property, not a bonus effect — doesn't fit the effects schema",
  // 40k — deferred to BON-4 per BON-1b Decision 3: real vocab gap, v1 stat
  // vocab has no separate "wound" stat from "hit" (KT has no two-step
  // hit/wound sequence, so the vocab was never built for it). Decide the
  // vocab when the 40k engine actually reads bonuses; recompile is cheap.
  leader: 'attached-unit/wound-allocation structural rule, not a modifier',
  'twin-linked': "modifies the Wound roll specifically; v1 stat vocab has no separate 'wound' stat from 'hit' — deferred to BON-4",
  anti: 'same hit/wound-split gap as twin-linked — deferred to BON-4',
  'sustained-hits': 'same hit/wound-split gap as twin-linked — deferred to BON-4',
  lance: 'same hit/wound-split gap as twin-linked (modifies Wound roll on charge) — deferred to BON-4',
  'feel-no-pain': 'parametric extra defensive roll after saves; no matching stat, and collapsing to a flag would lose the x+ threshold',
  scouts: 'deployment-phase rule, out of combat-modifier scope',
  infiltrators: 'deployment-phase rule, out of combat-modifier scope',
  'deep-strike': 'deployment-phase rule, out of combat-modifier scope',
  'deadly-demise': 'explosion-on-death rule, not a combat modifier',
  'super-heavy-walker': 'unit-type/profile rule, not a modifier',
  hover: 'unit-type/movement-profile rule, not a modifier',
  'firing-deck': 'transport/embark mechanic, structural not a modifier',
  // Deferred indefinitely per BON-1b Decision 3 — weapon fire-count is a
  // weapon PROPERTY, not a bonus effect. Parser/schema work on the weapon
  // object if ever handled, not the bonus catalog.
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
      // PIPE-H1 item 4: template-generated from the same describeEffect/
      // describeBonusEffects machinery mapping-review.txt already uses —
      // can't drift from the actual compiled effects because it's derived
      // from them, not hand-written. The KT readout still generates its
      // own text from name+effects for display (kept, canonical there);
      // this just stops the catalog field itself from lying to any other
      // consumer.
      description: describeBonusEffects(built).map(row => row.text).join(' '),
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

// ── Plain-English rendering for mapping-review.txt ─────────────────────────
// Auto-derived from the effect structure (not hand-written per bonus) so it
// can't drift from the actual compiled effects — regenerate on every
// compile, per the addendum brief.

const STAT_ENGLISH = {
  critThreshold: 'the crit threshold',
  defDice: 'defence dice count',
  retainNormal: 'retained normal successes',
  retainCrit: 'retained critical successes',
  rerollOne: 'the one-die reroll allowance',
  rerollAll: 'the reroll-all allowance',
  dmgNormal: 'normal damage',
  dmgCrit: 'critical damage',
  atkDice: 'attack dice count',
  apl: 'APL',
  hit: "the attacker's Hit roll",
};

const WHEN_ENGLISH = {
  critScored: 'only if a critical success was scored',
  noCritScored: 'only if no critical success has been scored yet',
  halfRange: 'only within half the weapon\'s range',
};

// Per-condition-id plain-English overrides (BON-1c Fix 3) — "stunned"'s
// player-facing text names a stat (-1 APL) and a resolution phase (BON-3)
// that aren't derivable from the schema fields (stacks/max/when), so this is
// the dictated text from the brief itself, not a guess.
const CONDITION_ENGLISH = {
  stunned: 'On a crit, the target is stunned (-1 APL, resolved in BON-3).',
};

function describeEffect(effect) {
  const whenClause = effect.when && effect.when !== 'always' ? ` (${WHEN_ENGLISH[effect.when] || `only when: ${effect.when}`})` : '';
  const targetClause = effect.appliesTo === 'target' ? ' [applies to target]' : '';
  if (effect.type === 'flag') return `Marks the attack/weapon with the "${effect.flag}" flag${whenClause}${targetClause}.`;
  if (effect.type === 'condition') {
    if (CONDITION_ENGLISH[effect.condition]) return CONDITION_ENGLISH[effect.condition];
    return `Applies ${effect.stacks} stack(s) of the "${effect.condition}" condition (max ${effect.max})${whenClause}${targetClause}.`;
  }
  if (effect.type === 'mod') {
    const stat = STAT_ENGLISH[effect.stat] || effect.stat;
    if (effect.op === 'cap') return `Guarantees ${stat} is at least as good as ${effect.value}${whenClause}${targetClause}.`;
    if (effect.op === 'improve') return `Improves ${stat} by ${effect.value}${whenClause}${targetClause}.`;
    if (effect.op === 'set') return `Sets ${stat} to ${effect.value}${whenClause}${targetClause}.`;
    const sign = effect.value >= 0 ? '+' : '';
    return `${sign}${effect.value} to ${stat}${whenClause}${targetClause}.`;
  }
  return JSON.stringify(effect);
}

// BON-1c Fix 2: a bonus whose effects are exactly {retainCrit add +1} +
// {retainNormal add -1} on the same `when` is a true "convert one normal
// success to a critical success" — described as one line (the player
// contract), not two separate +/- lines that would read as unrelated.
function isConvertPair(effects) {
  if (effects.length !== 2) return false;
  const crit = effects.find(e => e.type === 'mod' && e.stat === 'retainCrit' && e.op === 'add' && e.value === 1);
  const normal = effects.find(e => e.type === 'mod' && e.stat === 'retainNormal' && e.op === 'add' && e.value === -1);
  return Boolean(crit && normal && crit.when === normal.when);
}

// Groups a bonus's effects into review rows: a detected convert-pair
// collapses to one combined row; everything else is one row per effect.
function describeBonusEffects(bonus) {
  if (isConvertPair(bonus.effects)) {
    const when = bonus.effects[0].when;
    const whenClause = when && when !== 'always' ? ` (${WHEN_ENGLISH[when] || `only when: ${when}`})` : '';
    return [{
      raw: bonus.effects,
      text: `Converts one normal success to a critical success${whenClause}.`,
    }];
  }
  return bonus.effects.map(effect => ({ raw: effect, text: describeEffect(effect) }));
}

function writeMappingReview(fullCatalog) {
  const lines = [];
  lines.push('mapping-review.txt — human-readable keyword → bonus mapping');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('Regenerated on every compile-keywords.js run — do not hand-edit.');
  lines.push('');
  lines.push(`${fullCatalog.size} catalog entries.`);
  lines.push('');

  const patches = loadPatches();
  lines.push(`── PATCHES (parsers/patches.json — hand-corrections, applied at parse time) ──`);
  lines.push('');
  if (patches.length) {
    for (const p of patches) {
      lines.push(`${p.system} / ${p.faction} / ${p.unit} — ${p.field} = ${JSON.stringify(p.value)}`);
      lines.push(`  reason: ${p.reason}`);
    }
  } else {
    lines.push('(none)');
  }
  lines.push('');

  const bySystem = { 'kill-team': [], 'warhammer-40k': [] };
  for (const b of fullCatalog.values()) (bySystem[b.system] = bySystem[b.system] || []).push(b);

  for (const system of Object.keys(bySystem)) {
    const entries = bySystem[system].sort((a, b) => a.name.localeCompare(b.name));
    if (!entries.length) continue;
    lines.push(`── ${system} (${entries.length}) ──────────────────────────────`);
    for (const b of entries) {
      lines.push(`${b.name}  [${b.id}]${b.approximate ? '  (approximate)' : ''}`);
      for (const row of describeBonusEffects(b)) {
        lines.push(`  ${JSON.stringify(row.raw)}`);
        lines.push(`    → ${row.text}`);
      }
    }
    lines.push('');
  }

  lines.push('── DEFERRED register (BON-1b Decision 3 — no action, revisit only as noted) ──');
  lines.push('');
  lines.push('Twin-linked, Sustained Hits, Anti-, Lance → BON-4.');
  lines.push('  Real vocab gap: 40k\'s hit/wound split needs wound-side stats KT never');
  lines.push('  needed. Decide the vocab when the 40k engine actually reads bonuses.');
  lines.push('  Recompile is cheap; nothing is lost by waiting.');
  lines.push('');
  lines.push('Limited x, One Shot → deferred indefinitely.');
  lines.push('  Weapon fire-count is a weapon PROPERTY, not a bonus effect. If handled');
  lines.push('  ever, it\'s parser/schema work on the weapon object, not the catalog.');
  lines.push('');
  lines.push('All bespoke named abilities in the unresolved list (Soulstrike, Headtaker,');
  lines.push('Blaze, Toxic, Riposte, Poison, etc.) → stay as raw display strings on the');
  lines.push('weapon. Working as designed. No action, ever, unless a specific one gets');
  lines.push('hand-authored as a bonus later.');
  lines.push('');
  lines.push('── Re-audit classifications (BON-1b Decision 4, closing item) ──');
  lines.push('');
  lines.push('"Torrent 0\\"" — REAL RULE, not a data error. A local per-file rule exists');
  lines.push('  (e.g. Celestian Insidiants\' Sanctifier weapon) with its own description:');
  lines.push('  "means you cannot select secondary targets, but this weapon still has the');
  lines.push('  Torrent weapon rule for all other rules purposes." Deliberately left');
  lines.push('  unresolved rather than pattern-matched to the generic Torrent x mapping —');
  lines.push('  mapping it to the generic rule would grant secondary targets it explicitly');
  lines.push('  does not have. Source marking is inconsistent (sometimes starred as custom,');
  lines.push('  sometimes not) but the rule itself is real and correctly excluded.');
  lines.push('');
  lines.push('"Custom" — DATA ARTIFACT, not a rule. This is the star-stripped display form');
  lines.push('  of "Custom*" (Phobos Strike Team), a per-unit bespoke-ability placeholder.');
  lines.push('  Correctly unresolved; nothing to fix.');
  lines.push('');
  lines.push('── Recorded simplifications (BON-1c — no action, do not "fix") ──');
  lines.push('');
  lines.push('Ceaseless = Relentless. Both compile to {rerollAll add +1}; card-distinct');
  lines.push('  rules, deliberately collapsed to the same bonus. Descriptions match the');
  lines.push('  shipped effects, not the flavor-text distinction between the two cards.');
  lines.push('');
  lines.push('Distance-variant Devastating (e.g. "1\\" Devastating 3") maps to flat');
  lines.push('  Devastating x — the splash-radius part of the rule (hit everything within');
  lines.push('  that distance of the primary target too) is dropped. Legibility-first: the');
  lines.push('  crit-damage number a player sees is correct, the area-effect nuance isn\'t');
  lines.push('  modeled in v1.');

  fs.writeFileSync(MAPPING_REVIEW_PATH, lines.join('\n') + '\n');
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
  writeMappingReview(fullCatalog);

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
  console.log(`Mapping review written: ${MAPPING_REVIEW_PATH}`);
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
