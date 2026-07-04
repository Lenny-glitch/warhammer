// bonus-resolver.test.js — plain node script, no framework.
// Run: node shared/bonus-resolver.test.js

const assert = require('assert');
const { resolveStats, eligibleBonuses, validateBonus } = require('./bonus-resolver');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${e.message}`);
    process.exitCode = 1;
  }
}

function bonus(overrides) {
  return {
    id: 'test-bonus', name: 'Test Bonus', system: 'kill-team', faction: null,
    source: 'keyword', activation: 'passive', cost: { type: 'free', amount: 0 },
    usage: 'unlimited', trigger: 'onShoot', duration: 'instant',
    scope: { target: 'self', range: null, filter: [] },
    effects: [{ type: 'mod', stat: 'critThreshold', op: 'cap', value: 5 }],
    ...overrides,
  };
}

console.log('resolveStats — op ordering');

test('a stat receiving all four ops applies set -> add -> improve -> cap, in that fixed order', () => {
  // base 10, non-roll-target stat (higher is better) so improve == add.
  // If ops ran in array order (cap, improve, add, set) instead of the fixed
  // order, the result would differ.
  const b = bonus({
    id: 'kitchen-sink',
    effects: [
      { type: 'mod', stat: 'atkDice', op: 'cap', value: 3 },     // last: max(x, 3)
      { type: 'mod', stat: 'atkDice', op: 'improve', value: 1 }, // third: +1 (non-roll-target)
      { type: 'mod', stat: 'atkDice', op: 'add', value: 2 },     // second: +2
      { type: 'mod', stat: 'atkDice', op: 'set', value: 1 },     // first: =1
    ],
  });
  const { stats } = resolveStats({ atkDice: 10 }, [b], { trigger: 'onShoot' });
  // set -> 1, add -> 1+2=3, improve -> 3+1=4, cap -> max(4,3)=4
  assert.strictEqual(stats.atkDice, 4);
});

test('cap non-stacking: two Lethal-style caps, best wins (no double effect)', () => {
  const b1 = bonus({ id: 'lethal-5', effects: [{ type: 'mod', stat: 'critThreshold', op: 'cap', value: 5 }] });
  const b2 = bonus({ id: 'lethal-5-again', effects: [{ type: 'mod', stat: 'critThreshold', op: 'cap', value: 5 }] });
  const { stats } = resolveStats({ critThreshold: 6 }, [b1, b2], { trigger: 'onShoot' });
  assert.strictEqual(stats.critThreshold, 5, 'two identical caps should still land on 5, not stack past it');
});

test('add + cap interaction: additive bonus cannot cross the cap', () => {
  // critThreshold is roll-target (lower = better). Base 6 (worst case).
  // A Lethal 5+ cap guarantees "at least as good as 5". If a +2 add ran
  // AFTER the cap, it would push the guaranteed value back to 7 (worse than
  // promised) — the fixed add-then-cap order prevents that.
  const b = bonus({
    id: 'lethal-plus-debuff',
    effects: [
      { type: 'mod', stat: 'critThreshold', op: 'cap', value: 5 },
      { type: 'mod', stat: 'critThreshold', op: 'add', value: 2 },
    ],
  });
  const { stats } = resolveStats({ critThreshold: 6 }, [b], { trigger: 'onShoot' });
  // add: 6+2=8, cap: min(8,5)=5 — the cap's guarantee survives the add.
  assert.strictEqual(stats.critThreshold, 5);
});

test('improve direction on roll-target stats: hit 4+ improved by 1 becomes 3+ (numeric decrease)', () => {
  const b = bonus({ id: 'plus-one-to-hit', effects: [{ type: 'mod', stat: 'hit', op: 'improve', value: 1 }] });
  const { stats } = resolveStats({ hit: 4 }, [b], { trigger: 'onShoot' });
  assert.strictEqual(stats.hit, 3);
});

test('improve direction on non-roll-target stats: increases the number', () => {
  const b = bonus({ id: 'plus-one-dice', effects: [{ type: 'mod', stat: 'retainNormal', op: 'improve', value: 1 }] });
  const { stats } = resolveStats({ retainNormal: 0 }, [b], { trigger: 'onShoot' });
  assert.strictEqual(stats.retainNormal, 1);
});

console.log('resolveStats — flags and conditions');

test('flag passthrough of unknown flags', () => {
  const b = bonus({ id: 'mystery-flag', effects: [{ type: 'flag', flag: 'someFutureFlagNoOneHasHeardOf' }] });
  const { flags } = resolveStats({}, [b], { trigger: 'onShoot' });
  assert.deepStrictEqual(flags, ['someFutureFlagNoOneHasHeardOf']);
});

test('condition effects accepted and surfaced, no state kept across calls', () => {
  const b = bonus({ id: 'markerlight-token', effects: [{ type: 'condition', condition: 'markerlight', stacks: 1, max: 4 }] });
  const r1 = resolveStats({}, [b], { trigger: 'onShoot' });
  assert.strictEqual(r1.conditions.length, 1);
  assert.deepStrictEqual(r1.conditions[0], { bonusId: 'markerlight-token', condition: 'markerlight', stacks: 1, max: 4, appliesTo: 'actor' });
  // a fresh call with no prior knowledge produces the same single entry —
  // the resolver never accumulates state between calls.
  const r2 = resolveStats({}, [b], { trigger: 'onShoot' });
  assert.strictEqual(r2.conditions.length, 1);
});

test('conditional (`when`) effect applies when the matching fact is present', () => {
  const b = bonus({
    id: 'piercing-crits-1',
    effects: [{ type: 'mod', stat: 'defDice', op: 'add', value: -1, when: 'critScored' }],
  });
  const { stats } = resolveStats({ defDice: 3 }, [b], { trigger: 'onShoot', facts: ['critScored'] });
  assert.strictEqual(stats.defDice, 2);
});

test('conditional (`when`) effect does NOT apply without the matching fact', () => {
  const b = bonus({
    id: 'piercing-crits-1',
    effects: [{ type: 'mod', stat: 'defDice', op: 'add', value: -1, when: 'critScored' }],
  });
  const { stats } = resolveStats({ defDice: 3 }, [b], { trigger: 'onShoot', facts: [] });
  assert.strictEqual(stats.defDice, 3);
});

// BON-1b Decision 1: "when" vocab additions (halfRange, noCritScored). The
// mechanism (effectApplies checking context.facts) is already generic — no
// resolver code changed — so these just prove the two new values work like
// critScored does.
test('when: "halfRange" applies with the fact present (Melta-style)', () => {
  const b = bonus({
    id: 'melta-2',
    effects: [{ type: 'mod', stat: 'dmgNormal', op: 'add', value: 2, when: 'halfRange' }],
  });
  const { stats } = resolveStats({ dmgNormal: 4 }, [b], { trigger: 'onShoot', facts: ['halfRange'] });
  assert.strictEqual(stats.dmgNormal, 6);
});

test('when: "halfRange" does NOT apply without the fact', () => {
  const b = bonus({
    id: 'melta-2',
    effects: [{ type: 'mod', stat: 'dmgNormal', op: 'add', value: 2, when: 'halfRange' }],
  });
  const { stats } = resolveStats({ dmgNormal: 4 }, [b], { trigger: 'onShoot', facts: [] });
  assert.strictEqual(stats.dmgNormal, 4);
});

test('when: "noCritScored" applies with the fact present (Severe-style)', () => {
  const b = bonus({
    id: 'severe',
    effects: [{ type: 'mod', stat: 'retainNormal', op: 'add', value: 1, when: 'noCritScored' }],
  });
  const { stats } = resolveStats({ retainNormal: 0 }, [b], { trigger: 'onShoot', facts: ['noCritScored'] });
  assert.strictEqual(stats.retainNormal, 1);
});

test('when: "noCritScored" does NOT apply without the fact', () => {
  const b = bonus({
    id: 'severe',
    effects: [{ type: 'mod', stat: 'retainNormal', op: 'add', value: 1, when: 'noCritScored' }],
  });
  const { stats } = resolveStats({ retainNormal: 0 }, [b], { trigger: 'onShoot', facts: ['critScored'] });
  assert.strictEqual(stats.retainNormal, 0);
});

console.log('appliesTo (BON-1c Fix 1)');

test('appliesTo defaults to "actor" and is inert to resolveStats — default behavior unchanged', () => {
  const b = bonus({ id: 'actor-directed', effects: [{ type: 'mod', stat: 'atkDice', op: 'add', value: 1 }] });
  const { stats, applied } = resolveStats({ atkDice: 3 }, [b], { trigger: 'onShoot' });
  assert.strictEqual(stats.atkDice, 4);
  assert.strictEqual(applied[0].effect.appliesTo, undefined, 'no appliesTo on the effect means no appliesTo on the applied record either');
});

test('appliesTo: "target" still applies its arithmetic to whatever baseStats the caller passed in', () => {
  // resolveStats is single-sided and agnostic to appliesTo (BON-1c Fix 1
  // decision) — a real engine calls resolveStats once per side and only
  // feeds target-directed effects into the call using the target's
  // baseStats. This test proves the field doesn't break that call or get
  // silently dropped, not that resolveStats does the routing itself.
  const b = bonus({
    id: 'piercing-1',
    effects: [{ type: 'mod', stat: 'defDice', op: 'add', value: -1, appliesTo: 'target' }],
  });
  const { stats, applied } = resolveStats({ defDice: 3 }, [b], { trigger: 'onShoot' });
  assert.strictEqual(stats.defDice, 2);
  assert.strictEqual(applied[0].effect.appliesTo, 'target');
});

test('appliesTo: "target" on a condition effect is carried through onto the conditions entry', () => {
  const b = bonus({
    id: 'stun',
    effects: [{ type: 'condition', condition: 'stunned', stacks: 1, max: 1, when: 'critScored', appliesTo: 'target' }],
  });
  const { conditions } = resolveStats({}, [b], { trigger: 'onShoot', facts: ['critScored'] });
  assert.strictEqual(conditions.length, 1);
  assert.strictEqual(conditions[0].appliesTo, 'target');
});

test('condition effect with no appliesTo defaults to "actor" on the conditions entry', () => {
  const b = bonus({
    id: 'markerlight-token',
    effects: [{ type: 'condition', condition: 'markerlight', stacks: 1, max: 4 }],
  });
  const { conditions } = resolveStats({}, [b], { trigger: 'onShoot' });
  assert.strictEqual(conditions[0].appliesTo, 'actor');
});

test('validateBonus accepts appliesTo: "actor" | "target", rejects unknown values', () => {
  const good = bonus({ effects: [{ type: 'mod', stat: 'hit', op: 'add', value: 1, appliesTo: 'target' }] });
  assert.strictEqual(validateBonus(good).valid, true);

  const bad = bonus({ effects: [{ type: 'mod', stat: 'hit', op: 'add', value: 1, appliesTo: 'enemy' }] });
  const { valid, errors } = validateBonus(bad);
  assert.strictEqual(valid, false);
  assert.ok(errors.some(e => e.includes('appliesTo')));
});

console.log('eligibleBonuses — gating');

test('oncePerGame gating excludes a bonus already used this game', () => {
  const b = bonus({ id: 'once-per-game-thing', usage: 'oncePerGame' });
  const elig = eligibleBonuses([b], { trigger: 'onShoot', usedThisGame: ['once-per-game-thing'] });
  assert.strictEqual(elig.length, 0);
});

test('oncePerRound gating allows a bonus not yet used this round', () => {
  const b = bonus({ id: 'once-per-round-thing', usage: 'oncePerRound' });
  const elig = eligibleBonuses([b], { trigger: 'onShoot', usedThisRound: [] });
  assert.strictEqual(elig.length, 1);
});

test('aura range + keyword filter, including "!" exclusion', () => {
  const aura = bonus({
    id: 'bonded-aura',
    trigger: 'onShoot',
    scope: { target: 'ally', range: 3, filter: ['!DRONE'] },
  });
  // within range, not a DRONE -> eligible
  const elig1 = eligibleBonuses([aura], {
    trigger: 'onShoot',
    actor: { keywords: [] },
    target: { keywords: ['PATHFINDER'] },
    positions: { actor: { x: 0, y: 0 }, target: { x: 2, y: 0 } },
  });
  assert.strictEqual(elig1.length, 1);

  // within range, but IS a DRONE -> excluded by "!DRONE" filter
  const elig2 = eligibleBonuses([aura], {
    trigger: 'onShoot',
    actor: { keywords: [] },
    target: { keywords: ['PATHFINDER', 'DRONE'] },
    positions: { actor: { x: 0, y: 0 }, target: { x: 2, y: 0 } },
  });
  assert.strictEqual(elig2.length, 0);

  // out of range -> excluded regardless of keywords
  const elig3 = eligibleBonuses([aura], {
    trigger: 'onShoot',
    actor: { keywords: [] },
    target: { keywords: ['PATHFINDER'] },
    positions: { actor: { x: 0, y: 0 }, target: { x: 10, y: 0 } },
  });
  assert.strictEqual(elig3.length, 0);
});

console.log('validateBonus');

test('passive-with-cost is rejected', () => {
  const b = bonus({ activation: 'passive', cost: { type: 'cp', amount: 1 } });
  const { valid, errors } = validateBonus(b);
  assert.strictEqual(valid, false);
  assert.ok(errors.some(e => e.includes('passive bonuses must have cost.type "free"')));
});

test('active-with-cp-cost is accepted', () => {
  const b = bonus({ activation: 'active', cost: { type: 'cp', amount: 1 } });
  const { valid } = validateBonus(b);
  assert.strictEqual(valid, true);
});

test('well-formed passive/free bonus is accepted', () => {
  const { valid, errors } = validateBonus(bonus());
  assert.strictEqual(valid, true, `expected valid, got errors: ${JSON.stringify(errors)}`);
});

console.log(`\n${passed} passed${process.exitCode ? ', see FAIL lines above' : ''}`);
