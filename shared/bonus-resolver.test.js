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
  assert.deepStrictEqual(r1.conditions[0], { bonusId: 'markerlight-token', condition: 'markerlight', stacks: 1, max: 4 });
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
