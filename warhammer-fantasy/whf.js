'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const SPACING      = 22;            // px, model token centre-to-centre
const MODEL_R      = 10;            // model circle radius px
const BOARD_W      = 1200;
const BOARD_H      = 900;
const NS           = 'http://www.w3.org/2000/svg';
const INCHES_TO_PX = 1200 / 72;    // 16.67px per inch
const WHEEL_DEG    = 10;            // degrees per arrow-key press during wheel

// Known RAW deviation: frontCorners() uses model slot centres as pivot points,
// not outer model edges. Arc distance is underestimated by ~MODEL_R (~0.6" on
// a 5-wide unit). Accepted simplification — noted in WHF_DEVLOG.md WHF-2 section.

function inchesToPx(inches) { return inches * INCHES_TO_PX; }

// ── Core geometry ──────────────────────────────────────────────────────────
//
// modelPosition converts a formation slot (row, col) to absolute SVG coords.
// unit.position = SVG coords of front-left slot (row=0, col=0)
// unit.facing   = degrees CW from north: 0=north, 90=east, 270=west
// row=0 = front rank; col=0 = left flank from unit's perspective

function modelPosition(unit, row, col) {
  const lx  = col * SPACING;
  const ly  = row * SPACING;
  const rad = (unit.facing * Math.PI) / 180;
  return {
    x: unit.position.x + lx * Math.cos(rad) - ly * Math.sin(rad),
    y: unit.position.y + lx * Math.sin(rad) + ly * Math.cos(rad),
  };
}

// ── Geometry self-test ─────────────────────────────────────────────────────
(function testModelPosition() {
  const near = (a, b) => Math.abs(a - b) < 0.001;
  const u0   = { position: { x: 100, y: 100 }, facing: 0   };
  const u90  = { position: { x: 100, y: 100 }, facing: 90  };
  const u45  = { position: { x: 100, y: 100 }, facing: 45  };
  const s45  = Math.sin(Math.PI / 4);

  const cases = [
    [u0,  0, 0,  100,                 100,                '0° origin'],
    [u0,  0, 1,  100 + SPACING,       100,                '0° col→+X'],
    [u0,  1, 0,  100,                 100 + SPACING,      '0° row→+Y'],
    [u90, 0, 1,  100,                 100 + SPACING,      '90° col→+Y'],
    [u90, 1, 0,  100 - SPACING,       100,                '90° row→−X'],
    [u45, 0, 1,  100 + SPACING * s45, 100 + SPACING * s45, '45° col'],
    [u45, 1, 0,  100 - SPACING * s45, 100 + SPACING * s45, '45° row'],
  ];

  let ok = true;
  cases.forEach(([unit, row, col, ex, ey, label]) => {
    const p = modelPosition(unit, row, col);
    if (!near(p.x, ex) || !near(p.y, ey)) {
      console.error(`[WHF] modelPosition FAIL — ${label}:`,
        `got (${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
        `expected (${ex.toFixed(3)}, ${ey.toFixed(3)})`);
      ok = false;
    }
  });
  if (ok) console.log('[WHF] modelPosition OK — 7 cases passed');
})();

// ── Movement geometry ──────────────────────────────────────────────────────

function facingVector(unit) {
  const rad = (unit.facing * Math.PI) / 180;
  return { x: Math.sin(rad), y: -Math.cos(rad) };
}

// World-space positions of the two front-corner model slots.
function frontCorners(unit) {
  return {
    left:  modelPosition(unit, 0, 0),
    right: modelPosition(unit, 0, unit.rankWidth - 1),
  };
}

// Returns a new unit moved forward by `inches`. Does NOT handle backward
// tracking — caller is responsible for backwardInches.
function moveUnitForward(unit, inches) {
  const d = inchesToPx(inches);
  const v = facingVector(unit);
  return {
    ...unit,
    position: { x: unit.position.x + v.x * d, y: unit.position.y + v.y * d },
    movementUsed: unit.movementUsed + inches,
  };
}

// When pivoting around the right front corner, compute new unit.position
// (front-left corner) so that the right corner stays fixed.
function calculateNewPositionFromRightPivot(unit, rightPivot, newFacingDeg) {
  const width = (unit.rankWidth - 1) * SPACING;
  const rad   = (newFacingDeg * Math.PI) / 180;
  return {
    x: rightPivot.x - width * Math.cos(rad),
    y: rightPivot.y - width * Math.sin(rad),
  };
}

// Pivot the unit around one front corner by angleDeltaDeg.
// Returns a new unit object, or null if M allowance exceeded.
function wheelUnit(unit, pivotSide, angleDeltaDeg) {
  const corners    = frontCorners(unit);
  const pivot      = corners[pivotSide];
  const newFacing  = ((unit.facing + angleDeltaDeg) % 360 + 360) % 360;

  const arcInches = wheelArcInches(unit, angleDeltaDeg);

  if (unit.movementUsed + arcInches > parseFloat(unit.stats.M)) return null;

  const newPosition = pivotSide === 'left'
    ? pivot
    : calculateNewPositionFromRightPivot(unit, pivot, newFacing);

  return {
    ...unit,
    facing:       newFacing,
    position:     newPosition,
    movementUsed: unit.movementUsed + arcInches,
  };
}

// Rebuild model row/col assignments for current rankWidth.
function reassignModels(unit) {
  return {
    ...unit,
    models: unit.models.map((m, i) => ({
      ...m,
      row: Math.floor(i / unit.rankWidth),
      col: i % unit.rankWidth,
    })),
  };
}

// Redress formation in place: keep front-centre fixed, change rankWidth.
// Costs full movement.
function reformUnit(unit, newRankWidth) {
  const oldCentreOffset = (unit.rankWidth - 1) / 2 * SPACING;
  const newCentreOffset = (newRankWidth  - 1) / 2 * SPACING;
  const delta = oldCentreOffset - newCentreOffset;
  const rad   = (unit.facing * Math.PI) / 180;
  return reassignModels({
    ...unit,
    rankWidth:    newRankWidth,
    position: {
      x: unit.position.x + delta * Math.cos(rad),
      y: unit.position.y + delta * Math.sin(rad),
    },
    movementUsed: parseFloat(unit.stats.M),
    hasReformed:  true,
  });
}

// Returns true if any alive model in movingUnit is within 1" (edge-to-edge)
// of any alive enemy model. threshold = 1" in px + 2 model radii.
function violates1InchRule(movingUnit, allUnits) {
  const threshold = inchesToPx(1) + 2 * MODEL_R;
  const enemies = allUnits.filter(
    u => u.instanceId !== movingUnit.instanceId && u.factionId !== movingUnit.factionId
  );
  for (const enemy of enemies) {
    for (const mm of movingUnit.models.filter(m => m.alive)) {
      const mp = modelPosition(movingUnit, mm.row, mm.col);
      for (const em of enemy.models.filter(m => m.alive)) {
        const ep = modelPosition(enemy, em.row, em.col);
        const dx = mp.x - ep.x;
        const dy = mp.y - ep.y;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) return true;
      }
    }
  }
  return false;
}

// ── Charge geometry (WHF-3) ──────────────────────────────────────────────
//
// Pivot-arc / reach: "can this footprint, after pivoting, reach and align
// toward a target within a distance budget?" Deliberately generic — takes a
// footprint (position/facing/rankWidth/models, same shape WHF-1/2 already
// use) and a target footprint, returns whether/how far. No WHF-only
// assumptions beyond what modelPosition()/frontCorners() already encode.
// Portable to 40k vehicle turning later: swap in a vehicle's own
// front-corner footprint and this still answers the same question.
//
// Interface: chargeReach(charger, targetUnit, maxInches) -> {
//   reachable, inchesNeeded, finalFacing, contactPoint
// }

function pxDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Degrees CW from north (matches unit.facing) of the ray fromPoint->toPoint.
function angleToPoint(fromPoint, toPoint) {
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  return ((Math.atan2(dx, -dy) * 180 / Math.PI) % 360 + 360) % 360;
}

function shortestAngleDelta(fromDeg, toDeg) {
  let d = (toDeg - fromDeg) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// Arc length (inches) to wheel by angleDeltaDeg, pivoting on a front corner.
// Same per-degree cost wheelUnit() already uses — factored out so charge
// reach can budget it without duplicating the formula.
function wheelArcInches(unit, angleDeltaDeg) {
  const radius = (unit.rankWidth - 1) * SPACING; // front-corner to front-corner, px
  const arcPx  = Math.abs(angleDeltaDeg * Math.PI / 180) * radius;
  return arcPx / INCHES_TO_PX;
}

// Oriented-rectangle approximation of a unit's footprint, in world space.
// halfW/halfD pad to model edges (+MODEL_R) — same slot-centre
// simplification frontCorners() already accepts.
function unitFootprint(unit) {
  const numRanks = Math.ceil(unit.models.length / unit.rankWidth);
  const halfW = (unit.rankWidth - 1) / 2 * SPACING + MODEL_R;
  const halfD = (numRanks - 1)   / 2 * SPACING + MODEL_R;
  const rad = unit.facing * Math.PI / 180;
  const right    = { x: Math.cos(rad),  y: Math.sin(rad) };
  const backward = { x: -Math.sin(rad), y: Math.cos(rad) };
  const localCX = (unit.rankWidth - 1) / 2 * SPACING;
  const localCY = (numRanks - 1)   / 2 * SPACING;
  const centre = {
    x: unit.position.x + localCX * right.x + localCY * backward.x,
    y: unit.position.y + localCX * right.y + localCY * backward.y,
  };
  return { centre, halfW, halfD, right, backward };
}

// Nearest point on a unit's footprint boundary to an external point.
function nearestFootprintPoint(unit, fromPoint) {
  const fp = unitFootprint(unit);
  const dx = fromPoint.x - fp.centre.x, dy = fromPoint.y - fp.centre.y;
  const u  = dx * fp.right.x    + dy * fp.right.y;
  const v  = dx * fp.backward.x + dy * fp.backward.y;
  const uc = Math.max(-fp.halfW, Math.min(fp.halfW, u));
  const vc = Math.max(-fp.halfD, Math.min(fp.halfD, v));
  return {
    x: fp.centre.x + uc * fp.right.x + vc * fp.backward.x,
    y: fp.centre.y + uc * fp.right.y + vc * fp.backward.y,
  };
}

function chargeReach(charger, targetUnit, maxInches) {
  const contactPoint  = nearestFootprintPoint(targetUnit, charger.position);
  const desiredFacing = angleToPoint(charger.position, contactPoint);
  const angleDelta    = shortestAngleDelta(charger.facing, desiredFacing);
  const wheelCost     = wheelArcInches(charger, angleDelta);
  const straightCost  = pxDistance(charger.position, contactPoint) / INCHES_TO_PX;
  const inchesNeeded  = wheelCost + straightCost;
  return {
    reachable: inchesNeeded <= maxInches,
    inchesNeeded,
    finalFacing: desiredFacing,
    contactPoint,
  };
}

// ── Dice ──────────────────────────────────────────────────────────────────
function rollD6()  { return 1 + Math.floor(Math.random() * 6); }
function roll2D6() { return rollD6() + rollD6(); }

function testLeadership(ldValue) {
  const roll = roll2D6();
  const target = parseInt(ldValue, 10);
  return { roll, target, passed: roll <= target };
}

// ── Charge helpers ────────────────────────────────────────────────────────
function isUnitAlive(unit) { return unit.models.some(m => m.alive); }

function killUnit(unit) {
  return { ...unit, models: unit.models.map(m => ({ ...m, alive: false })) };
}

function enemiesOf(unit, allUnits) {
  return allUnits.filter(u => u.factionId !== unit.factionId && isUnitAlive(u));
}

function friendliesOf(unit, allUnits) {
  return allUnits.filter(
    u => u.factionId === unit.factionId && u.instanceId !== unit.instanceId && isUnitAlive(u)
  );
}

function pointToSegmentDistance(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

// Straight-line flee move directly away from awayFromPoint. Off-board =
// destroyed (a fleeing unit that would leave the table is removed as a
// casualty) — RAW recalled from training knowledge, not verified against
// 8th.whfb.app; same caveat as the unverified character stats (see DEVLOG).
function fleeMove(target, awayFromPoint) {
  const fleeRoll   = roll2D6();
  const fleeInches = fleeRoll;
  const dirDeg     = angleToPoint(awayFromPoint, target.position);
  const v          = facingVector({ facing: dirDeg });
  const d          = inchesToPx(fleeInches);
  const toPos      = { x: target.position.x + v.x * d, y: target.position.y + v.y * d };
  const offBoard   = toPos.x < 0 || toPos.x > BOARD_W || toPos.y < 0 || toPos.y > BOARD_H;
  return { fleeRoll, fleeInches, fromPos: { ...target.position }, toPos, facing: dirDeg, offBoard };
}

// Friendly units whose footprint the flee path (fromPos->toPos) passes near
// enough to trigger a Panic test. Footprint-radius distance check, not a
// precise segment/polygon intersection — consistent with the project's
// existing geometric simplifications (see frontCorners()).
function friendliesInFleePath(fleeingUnit, fromPos, toPos, allUnits) {
  return friendliesOf(fleeingUnit, allUnits).filter(f => {
    const fp = unitFootprint(f);
    const threshold = Math.max(fp.halfW, fp.halfD) + inchesToPx(1);
    return pointToSegmentDistance(fp.centre, fromPos, toPos) < threshold;
  });
}

// ── Shooting resolver (WHF-4a) ───────────────────────────────────────────
//
// RAW verified against 8th.whfb.app before building (this brief's own text
// had it wrong on two points — see DEVLOG): to-hit chart is `7 - BS`; S-vs-T
// wound chart is `clamp(4 - (S - T), 2, 6)`; armour save modifier is -1 per
// point of Strength from 4 upward; ward saves are never modified by
// Strength; a natural 1 always fails to-hit/to-wound/save rolls; casualties
// come off the REAR rank (not the rank closest to the firer, despite what
// the brief said — RAW is explicit this is a gameplay-legibility rule, not
// narrative-literal). "7+ to hit/wound/save" RAW is a chained reroll (roll a
// 6, then reroll against a second threshold); simplified here to a flat
// auto-fail — consistent with this project's "legible over rules-exact"
// standing priority and the precedent WHF-3 already set for edge cases like
// "There's Too Many of Them".

function svToNumber(sv) {
  if (!sv || sv === '-') return null;
  return parseInt(sv, 10);
}

function toHitTarget(bs) { return 7 - bs; }
function toWoundTarget(strength, toughness) {
  return Math.max(2, Math.min(6, 4 - (strength - toughness)));
}
// -1 to a save's target number per point of Strength from 4 upward (RAW:
// "An attack of Strength 4 inflicts a save modifier of -1, with the
// modifier growing a point higher for each additional point of Strength").
function armourPenetration(strength) { return strength >= 4 ? strength - 3 : 0; }

// target > 6 is the RAW "7+" case, simplified to auto-fail (see header
// note). A natural 1 always fails regardless of target number.
function rollAgainstTarget(target) {
  if (target > 6) return { roll: null, success: false, impossible: true };
  const roll = rollD6();
  return { roll, success: roll !== 1 && roll >= target, impossible: false };
}

// Casualties come off the rear rank (RAW, verified — see header note).
// Within the rearmost rank still holding models, remove from the flanks
// inward first (generalises RAW's "single-rank units lose models equally
// from both ends" to the multi-rank case).
function removeCasualties(unit, count) {
  const centreCol = (unit.rankWidth - 1) / 2;
  const candidates = unit.models
    .filter(m => m.alive)
    .sort((a, b) => (b.row - a.row) || (Math.abs(b.col - centreCol) - Math.abs(a.col - centreCol)));
  const killIds = new Set(candidates.slice(0, count).map(m => m.modelId));
  return { ...unit, models: unit.models.map(m => killIds.has(m.modelId) ? { ...m, alive: false } : m) };
}

// Clean input/output contract, callable from either the Shooting phase's own
// UI or Charge's standAndShoot branch (WHF-3's interface requirement:
// casualties must land before chargeReach's contact resolution runs, not
// just be wired to a Shooting-phase button). No UI/dice-display coupling —
// caller renders `log`.
//
// situational: { longRange, moved, standAndShoot } — booleans the CALLER
// resolves from context (distance, movement-phase snapshot, reaction type),
// since this function doesn't know which phase/flow invoked it.
//
// Resolver integration (KT BON-2 shape): builds attackProfile/defenseProfile
// baseStats, runs them through BonusResolver.resolveStats, rolls against the
// resolved numbers. WHF has no bonus catalog wired up yet (BON-1 reserved
// the schema; nothing populated it — see DEVLOG "BON-1" section), so
// activeBonuses here are locally-built situational modifiers rather than a
// loaded catalog. Same effect shape either way — wiring in a real catalog
// later is a data change, not a resolver-call-site change.
function resolveShot(shooter, target, situational) {
  const weapon = shooter.weapons.find(w => w.type === 'ranged');
  if (!weapon) {
    return { log: [`${shooter.name} has no ranged weapon — no shot fired`], updatedTarget: target, hits: 0, wounds: 0, unsaved: 0 };
  }

  const bs    = parseInt(shooter.stats.BS, 10);
  const shots = shooter.models.filter(m => m.alive && m.row <= 1).length; // Fire in Two Ranks (RAW default in 8th)
  const ctx   = { trigger: 'onShoot', round: 0 };

  const hitMods = [];
  if (situational.longRange)     hitMods.push({ id: 'long-range',       effects: [{ type: 'mod', stat: 'hit', op: 'add', value: 1 }] });
  if (situational.moved)         hitMods.push({ id: 'moved-and-fired',  effects: [{ type: 'mod', stat: 'hit', op: 'add', value: 1 }] });
  if (situational.standAndShoot) hitMods.push({ id: 'stand-and-shoot',  effects: [{ type: 'mod', stat: 'hit', op: 'add', value: 1 }] });

  const attack = BonusResolver.resolveStats(
    { hit: toHitTarget(bs), strength: weapon.strength, shots }, hitMods, ctx
  ).stats;

  const penetration = armourPenetration(attack.strength);
  const baseSave     = svToNumber(target.stats.Sv);
  const saveMods = penetration > 0
    ? [{ id: 'strength-penetration', effects: [{ type: 'mod', stat: 'save', op: 'add', value: penetration }] }]
    : [];
  const defense = BonusResolver.resolveStats(
    { save: baseSave === null ? 99 : baseSave, wardSave: svToNumber(target.stats.wardSave) ?? 99, toughness: parseInt(target.stats.T, 10) },
    saveMods, ctx
  ).stats;

  const woundTarget = toWoundTarget(attack.strength, defense.toughness);

  const log = [`${shooter.name} fires ${weapon.name} — ${shots} shot${shots === 1 ? '' : 's'} at ${target.name}`];
  let hits = 0, wounds = 0, unsaved = 0;
  for (let i = 0; i < shots; i++) {
    if (!rollAgainstTarget(attack.hit).success) continue;
    hits++;
    if (!rollAgainstTarget(woundTarget).success) continue;
    wounds++;
    if (rollAgainstTarget(defense.save).success) continue;
    if (rollAgainstTarget(defense.wardSave).success) continue;
    unsaved++;
  }

  log.push(
    `${hits}/${shots} hit, ${wounds}/${hits} wound, ${unsaved} unsaved ` +
    `(to-hit ${attack.hit}+, to-wound ${woundTarget}+, save ${baseSave === null ? 'none' : defense.save + '+'})`
  );

  const updatedTarget = unsaved > 0 ? removeCasualties(target, unsaved) : target;
  if (unsaved > 0) log.push(`${target.name} loses ${unsaved} model${unsaved === 1 ? '' : 's'} (rear rank)`);

  return { log, updatedTarget, hits, wounds, unsaved };
}

// ── Game state ─────────────────────────────────────────────────────────────
const state = {
  units:                 [],
  selected:              null,
  phase:                 'movement',
  activePlayer:          'player1',
  movementPhaseComplete: false,
  chargeReactions:       {}, // targetInstanceId -> 'hold'|'standAndShoot'|'flee', cleared each movement phase
};

// ── Movement interaction state ─────────────────────────────────────────────
let moveGhost      = null; // { unit, type:"move"|"wheel"|"reform" }
let moveMode       = null; // null|"move"|"wheel-pick"|"wheel"|"reform"
let wheelPivotSide = null;
let reformRankWidth = 0;

// ── Charge interaction state (WHF-3) ────────────────────────────────────────
// { chargerId, targetIds, stage, reactionQueue, fledTargetId, outcome, log }
// stage: 'select-targets' -> 'awaiting-reaction' -> ['redirect-prompt' ->
//        'redirect-pick'] -> 'ready-to-roll' -> 'resolved'
let chargeFlow = null;

// ── Shooting interaction state (WHF-4a) ─────────────────────────────────────
// { shooterId, targetId, stage, log }
// stage: 'select-target' -> 'ready-to-roll' -> 'resolved'
let shootFlow = null;

// ── Faction palettes ───────────────────────────────────────────────────────
const PALETTES = {
  empire: {
    fill:      'var(--empire-red)',
    champFill: '#a82020',
    stroke:    '#5a0e0e',
    arrow:     'var(--empire-gold)',
  },
  bretonnia: {
    fill:      'var(--bretonnia-blue)',
    champFill: '#2a4d8f',
    stroke:    '#0e2040',
    arrow:     'var(--bretonnia-gold)',
  },
};

// ── Test unit construction ─────────────────────────────────────────────────
function buildModels(instanceId, count, rankWidth) {
  return Array.from({ length: count }, (_, i) => ({
    modelId:          `${instanceId}-m${i}`,
    row:              Math.floor(i / rankWidth),
    col:              i % rankWidth,
    alive:            true,
    wounds:           1,
    maxWounds:        1,
    weapons:          [],
    isChampion:       i === 0,
    isMusician:       false,
    isStandardBearer: false,
  }));
}

function movementDefaults() {
  return {
    movementUsed: 0, backwardInches: 0, hasReformed: false, hasMoved: false,
    phaseDone: false, hasCharged: false, fleeing: false,
  };
}

function initTestUnits() {
  state.units.push({
    instanceId:   'unit-001',
    unitId:       'state-troops',
    factionId:    'the-empire',
    name:         'Halberdiers',
    factionLabel: 'The Empire',
    category:     'Core Infantry',
    position:     { x: 460, y: 376 },
    facing:       90,
    rankWidth:    5,
    palette:      'empire',
    stats: { M: '4"', WS: '3', BS: '3', S: '3', T: '3', W: '1', I: '3', A: '1', Ld: '7', Sv: '5+' },
    weapons: [
      { name: 'Halberd',     type: 'melee', desc: 'S+1' },
      { name: 'Hand weapon', type: 'melee', desc: '' },
    ],
    abilities: [],
    models: buildModels('unit-001', 20, 5),
    ...movementDefaults(),
    engaged: false, // WHF-4a.1: deliberately NOT part of movementDefaults() —
    // engaged persists across the movementDefaults() reset at end of
    // Movement phase (only WHF-5/Close Combat resolution should ever
    // clear it, and that doesn't exist yet).
  });

  // Sv 2+ is the army book default for KotR (full plate + shield).
  // The 1+ achievable with barding + magic item is handled by the roster system.
  state.units.push({
    instanceId:   'unit-002',
    unitId:       'knights-of-the-realm',
    factionId:    'bretonnia',
    name:         'Knights of the Realm',
    factionLabel: 'Bretonnia',
    category:     'Core Cavalry',
    position:     { x: 740, y: 442 },
    facing:       270,
    rankWidth:    3,
    palette:      'bretonnia',
    stats: { M: '7"', WS: '4', BS: '3', S: '4', T: '3', W: '1', I: '4', A: '1', Ld: '8', Sv: '2+' },
    weapons: [
      { name: 'Lance',       type: 'melee', desc: '+2S on charge, Lance Formation' },
      { name: 'Hand weapon', type: 'melee', desc: '' },
    ],
    abilities: ['Blessing of the Lady', 'Knightly Vow', 'Lance Formation'],
    models: buildModels('unit-002', 9, 3),
    ...movementDefaults(),
    engaged: false, // WHF-4a.1: deliberately NOT part of movementDefaults() —
    // engaged persists across the movementDefaults() reset at end of
    // Movement phase (only WHF-5/Close Combat resolution should ever
    // clear it, and that doesn't exist yet).
  });

  // WHF-4a direct-fire test units. Stat lines are the standard Handgunner /
  // Peasant Bowman troop profile (BS3 rank-and-file, matching the source
  // pattern already verified for General/Captain in Phase 1). Weapon
  // profiles (Handgun: R24" S4 Armour Piercing + Move or Fire; Bow: R24" S3,
  // no special rules) are recalled from training knowledge, NOT
  // source-quoted — 8th.whfb.app's weapon-profile subpages 404'd during
  // WHF-4a's verify-first pass. Flagged the same way Phase 1 flagged
  // General/Captain before those were later confirmed; unblock by checking
  // the weapon page directly next time someone's on this brief.
  state.units.push({
    instanceId:   'unit-003',
    unitId:       'handgunners',
    factionId:    'the-empire',
    name:         'Handgunners',
    factionLabel: 'The Empire',
    category:     'Core Infantry',
    position:     { x: 460, y: 300 },
    facing:       90,
    rankWidth:    5,
    palette:      'empire',
    stats: { M: '4"', WS: '3', BS: '3', S: '3', T: '3', W: '1', I: '3', A: '1', Ld: '7', Sv: '-' },
    weapons: [
      { name: 'Handgun', type: 'ranged', desc: '24", S4, Armour Piercing, Move or Fire',
        range: 24, strength: 4, rules: ['armourPiercing', 'moveOrFire'] },
      { name: 'Hand weapon', type: 'melee', desc: '' },
    ],
    abilities: [],
    models: buildModels('unit-003', 10, 5),
    ...movementDefaults(),
    engaged: false, // WHF-4a.1: deliberately NOT part of movementDefaults() —
    // engaged persists across the movementDefaults() reset at end of
    // Movement phase (only WHF-5/Close Combat resolution should ever
    // clear it, and that doesn't exist yet).
  });

  state.units.push({
    instanceId:   'unit-004',
    unitId:       'peasant-bowmen',
    factionId:    'bretonnia',
    name:         'Peasant Bowmen',
    factionLabel: 'Bretonnia',
    category:     'Core Infantry',
    position:     { x: 740, y: 520 },
    facing:       270,
    rankWidth:    5,
    palette:      'bretonnia',
    stats: { M: '4"', WS: '2', BS: '3', S: '3', T: '3', W: '1', I: '3', A: '1', Ld: '5', Sv: '-' },
    weapons: [
      { name: 'Bow', type: 'ranged', desc: '24", S3', range: 24, strength: 3, rules: [] },
      { name: 'Hand weapon', type: 'melee', desc: '' },
    ],
    abilities: ["Peasant's Duty"],
    models: buildModels('unit-004', 10, 5),
    ...movementDefaults(),
    engaged: false, // WHF-4a.1: deliberately NOT part of movementDefaults() —
    // engaged persists across the movementDefaults() reset at end of
    // Movement phase (only WHF-5/Close Combat resolution should ever
    // clear it, and that doesn't exist yet).
  });
}

// ── SVG helpers ────────────────────────────────────────────────────────────
function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Phase tracker ──────────────────────────────────────────────────────────
function renderPhaseTracker() {
  document.querySelectorAll('.phase-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.phase === state.phase);
  });
  const btn = document.getElementById('btn-end-phase');
  if (btn) btn.textContent = `End ${PHASE_LABELS[state.phase]} Phase →`;
}

// ── Grid ──────────────────────────────────────────────────────────────────
function renderGrid() {
  const layer = document.getElementById('grid-layer');
  const step  = 88;
  for (let x = step; x < BOARD_W; x += step) {
    layer.appendChild(svgEl('line', {
      x1: x, y1: 0, x2: x, y2: BOARD_H,
      stroke: 'var(--grid-line)', 'stroke-width': '0.8',
    }));
  }
  for (let y = step; y < BOARD_H; y += step) {
    layer.appendChild(svgEl('line', {
      x1: 0, y1: y, x2: BOARD_W, y2: y,
      stroke: 'var(--grid-line)', 'stroke-width': '0.8',
    }));
  }
}

// ── Render ────────────────────────────────────────────────────────────────
function renderBoard() {
  // Real units
  const layer = document.getElementById('units-layer');
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  state.units.forEach(u => renderUnit(layer, u, false));

  // Ghost preview
  const ghostLayer = document.getElementById('ghost-layer');
  while (ghostLayer.firstChild) ghostLayer.removeChild(ghostLayer.firstChild);
  if (moveGhost) renderUnit(ghostLayer, moveGhost.unit, true);

  // Pivot diamonds overlay (wheel-pick mode only)
  const overlayLayer = document.getElementById('overlay-layer');
  while (overlayLayer.firstChild) overlayLayer.removeChild(overlayLayer.firstChild);
  if (moveMode === 'wheel-pick') {
    const sel = getSelectedUnit();
    if (sel) renderPivotDiamonds(overlayLayer, sel);
  }
  if (chargeFlow && chargeFlow.stage === 'select-targets') {
    renderChargeTargetHighlights(overlayLayer);
  }
  if (shootFlow && shootFlow.stage === 'select-target') {
    renderShootTargetHighlights(overlayLayer);
  }
}

// Highlight rings on units the current shooter can legally target — same
// visual pattern as renderChargeTargetHighlights.
function renderShootTargetHighlights(layer) {
  const shooter = state.units.find(u => u.instanceId === shootFlow.shooterId);
  if (!shooter) return;
  validShootTargets(shooter).forEach(t => {
    const fp     = unitFootprint(t);
    const picked = shootFlow.targetId === t.instanceId;
    layer.appendChild(svgEl('circle', {
      cx: fp.centre.x.toFixed(2), cy: fp.centre.y.toFixed(2),
      r:  Math.max(fp.halfW, fp.halfD) + 4,
      fill: 'none',
      stroke: picked ? 'var(--empire-gold)' : 'var(--selected-ring)',
      'stroke-width': picked ? '3' : '2',
      'stroke-dasharray': picked ? '' : '4 3',
      'pointer-events': 'none',
    }));
  });
}

// Highlight rings on units the current charger can legally target. Filled
// gold ring = picked; dashed ring = in reach but not yet picked.
function renderChargeTargetHighlights(layer) {
  const charger = state.units.find(u => u.instanceId === chargeFlow.chargerId);
  if (!charger) return;
  validChargeTargets(charger).forEach(t => {
    const fp     = unitFootprint(t);
    const picked = chargeFlow.targetIds.includes(t.instanceId);
    layer.appendChild(svgEl('circle', {
      cx: fp.centre.x.toFixed(2), cy: fp.centre.y.toFixed(2),
      r:  Math.max(fp.halfW, fp.halfD) + 4,
      fill: 'none',
      stroke: picked ? 'var(--empire-gold)' : 'var(--selected-ring)',
      'stroke-width': picked ? '3' : '2',
      'stroke-dasharray': picked ? '' : '4 3',
      'pointer-events': 'none',
    }));
  });
}

function renderUnit(layer, unit, isGhost) {
  const isSelected = !isGhost && state.selected === unit.instanceId;
  const pal        = PALETTES[unit.palette] || PALETTES.empire;
  const numRanks   = Math.ceil(unit.models.length / unit.rankWidth);
  const frontCX    = (unit.rankWidth - 1) / 2;

  const g = svgEl('g', { class: isGhost ? 'unit ghost-unit' : 'unit', 'data-unit-id': unit.instanceId });

  if (isGhost) {
    g.setAttribute('opacity', '0.4');
  } else if (unit.phaseDone) {
    g.setAttribute('opacity', '0.5');
  }

  const modelsToRender = isGhost
    ? unit.models.filter(m => m.alive)
    : unit.models;

  modelsToRender.forEach(model => {
    const pos    = modelPosition(unit, model.row, model.col);
    const isDead = !model.alive;
    const fill   = isDead           ? 'var(--dead-model)'
                 : model.isChampion ? pal.champFill
                 : pal.fill;
    const stroke = isDead     ? 'var(--border-dark)'
                 : isSelected ? 'var(--selected-ring)'
                 : pal.stroke;

    g.appendChild(svgEl('circle', {
      class:           isDead ? 'model dead' : 'model',
      'data-model-id': model.modelId,
      'data-unit-id':  unit.instanceId,
      cx:              pos.x.toFixed(2),
      cy:              pos.y.toFixed(2),
      r:               MODEL_R,
      fill,
      stroke,
      'stroke-width':  isSelected && !isDead ? '2.5' : '1.5',
      opacity:         isDead ? '0.28' : '1',
      style:           isGhost ? '' : 'cursor:pointer',
    }));

    if (model.isChampion && !isDead) {
      g.appendChild(svgEl('circle', {
        cx: pos.x.toFixed(2), cy: pos.y.toFixed(2), r: '3',
        fill: 'var(--text-bright)', 'pointer-events': 'none',
      }));
    }
  });

  // Facing arrow — shown for both real and ghost units
  const arrowPos = modelPosition(unit, -1.0, frontCX);
  const ax = arrowPos.x, ay = arrowPos.y;
  const ah = 10, aw = 7;
  g.appendChild(svgEl('polygon', {
    class:   'facing-arrow',
    points:  `${ax},${ay - ah} ${ax - aw},${ay + ah * 0.5} ${ax + aw},${ay + ah * 0.5}`,
    fill:    pal.arrow,
    stroke:  pal.stroke,
    'stroke-width': '1',
    transform: `rotate(${unit.facing}, ${ax}, ${ay})`,
    'pointer-events': 'none',
  }));

  // Unit label — real units only, shows movement used if any
  if (!isGhost) {
    const aliveCount = unit.models.filter(m => m.alive).length;
    const usedStr    = unit.movementUsed > 0 ? ` [${unit.movementUsed.toFixed(1)}"]` : '';
    const engagedStr = unit.engaged ? ' [ENGAGED]' : ''; // WHF-4a.1 legibility
    const labelPos   = modelPosition(unit, numRanks + 0.3, frontCX);
    const label = svgEl('text', {
      class: unit.engaged ? 'unit-label unit-label-engaged' : 'unit-label',
      x: labelPos.x.toFixed(2), y: labelPos.y.toFixed(2),
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'pointer-events': 'none',
    });
    label.textContent = `${unit.name} (${aliveCount})${usedStr}${engagedStr}`;
    g.appendChild(label);
  }

  if (!isGhost) {
    g.addEventListener('click', e => {
      e.stopPropagation();
      if (chargeFlow) {
        if (chargeFlow.stage === 'select-targets' && validTargetIdsForFlow().includes(unit.instanceId)) {
          toggleChargeTarget(unit.instanceId);
        }
        return;
      }
      if (shootFlow) {
        if (shootFlow.stage === 'select-target' && validShootTargetIdsForFlow().includes(unit.instanceId)) {
          pickShootTarget(unit.instanceId);
        }
        return;
      }
      selectUnit(unit.instanceId);
    });
  }

  layer.appendChild(g);
}

// Clickable gold diamonds at front corners for pivot selection.
function renderPivotDiamonds(layer, unit) {
  const corners = frontCorners(unit);
  ['left', 'right'].forEach(side => {
    const pos  = corners[side];
    const size = 9;
    const diamond = svgEl('polygon', {
      'data-pivot-side': side,
      points: [
        `${pos.x},${pos.y - size}`,
        `${pos.x + size},${pos.y}`,
        `${pos.x},${pos.y + size}`,
        `${pos.x - size},${pos.y}`,
      ].join(' '),
      fill:    'var(--empire-gold)',
      stroke:  'var(--bg-dark)',
      'stroke-width': '2',
      style: 'cursor:pointer',
    });
    diamond.addEventListener('click', e => { e.stopPropagation(); pickWheelPivot(side); });
    layer.appendChild(diamond);
  });
}

// ── Ghost ──────────────────────────────────────────────────────────────────
function showGhost(ghostUnit, type) {
  moveGhost = { unit: ghostUnit, type };
  renderBoard();
}

function clearGhost() {
  moveGhost = null;
  renderBoard();
}

function flashGhostViolation() {
  const gl = document.getElementById('ghost-layer');
  gl.classList.remove('ghost-violation');
  void gl.offsetWidth; // force reflow to restart animation
  gl.classList.add('ghost-violation');
  setTimeout(() => gl.classList.remove('ghost-violation'), 600);
}

// ── Hint bar ───────────────────────────────────────────────────────────────
const HINT_DEFAULT = 'Click unit to inspect · Right-click model to remove · Esc to deselect';

function flashHint(msg, duration = 2000) {
  const bar = document.getElementById('hint-bar');
  bar.textContent = msg;
  setTimeout(() => { bar.textContent = HINT_DEFAULT; }, duration);
}

// ── Selection ──────────────────────────────────────────────────────────────
function getSelectedUnit() {
  return state.units.find(u => u.instanceId === state.selected) || null;
}

function selectUnit(instanceId) {
  if (moveGhost || moveMode || chargeFlow || shootFlow) return; // block switching units during active action
  if (state.selected === instanceId) { deselectAll(); return; }
  state.selected = instanceId;
  renderBoard();
  const unit = getSelectedUnit();
  if (unit) showPanel(unit);
}

function deselectAll() {
  if (moveGhost || moveMode) cancelGhost();
  if (chargeFlow) cancelChargeFlow();
  if (shootFlow) cancelShootFlow();
  state.selected = null;
  renderBoard();
  hidePanel();
}

// ── Dead model toggle ──────────────────────────────────────────────────────
function toggleModelDead(unitId, modelId) {
  const unit  = state.units.find(u => u.instanceId === unitId);
  if (!unit) return;
  const model = unit.models.find(m => m.modelId === modelId);
  if (!model) return;
  model.alive = !model.alive;
  renderBoard();
  if (state.selected === unitId) showPanel(unit);
}

// ── Movement actions ───────────────────────────────────────────────────────
function enterMoveMode() {
  const unit = getSelectedUnit();
  if (!unit || unit.hasReformed || unit.phaseDone || chargeFlow) return;
  moveMode = 'move';
  showGhost({ ...unit }, 'move');
  showPanel(unit);
}

function enterWheelPickMode() {
  const unit = getSelectedUnit();
  if (!unit || unit.hasReformed || unit.phaseDone || chargeFlow) return;
  moveMode = 'wheel-pick';
  wheelPivotSide = null;
  renderBoard();
  showPanel(unit);
}

function pickWheelPivot(side) {
  const unit = getSelectedUnit();
  if (!unit) return;
  wheelPivotSide = side;
  moveMode = 'wheel';
  showGhost({ ...unit }, 'wheel');
  showPanel(unit);
}

function enterReformMode() {
  const unit = getSelectedUnit();
  if (!unit || unit.hasMoved || unit.hasReformed || unit.phaseDone || chargeFlow) return;
  reformRankWidth = unit.rankWidth;
  moveMode = 'reform';
  showGhost(reformUnit(unit, reformRankWidth), 'reform');
  showPanel(unit);
}

function adjustReformWidth(unit, delta) {
  const newWidth = Math.max(1, Math.min(unit.models.length, reformRankWidth + delta));
  if (newWidth === reformRankWidth) return;
  reformRankWidth = newWidth;
  showGhost(reformUnit(unit, reformRankWidth), 'reform');
  showPanel(unit);
}

function commitGhost() {
  if (!moveGhost) return;
  const ghost = moveGhost.unit;
  const type  = moveGhost.type;

  if (violates1InchRule(ghost, state.units)) {
    flashGhostViolation();
    flashHint('Too close to enemy (1" rule) — move rejected', 2500);
    return;
  }

  const idx = state.units.findIndex(u => u.instanceId === state.selected);
  if (idx === -1) return;

  // Reform ghost already carries hasReformed:true; move/wheel need hasMoved:true
  state.units[idx] = type !== 'reform'
    ? { ...ghost, hasMoved: true }
    : ghost;

  clearGhost();
  moveMode = null;
  wheelPivotSide = null;
  showPanel(state.units[idx]);
}

function cancelGhost() {
  clearGhost();
  moveMode = null;
  wheelPivotSide = null;
  const unit = getSelectedUnit();
  if (unit) showPanel(unit);
}

function doneUnit() {
  const unit = getSelectedUnit();
  if (!unit || chargeFlow) return;
  cancelGhost();
  const idx = state.units.findIndex(u => u.instanceId === state.selected);
  if (idx !== -1) state.units[idx] = { ...state.units[idx], phaseDone: true };
  deselectAll();
  updateEndPhaseButton();
}

// ── Charge flow (WHF-3) ─────────────────────────────────────────────────────
// Sequential declare -> react -> [redirect] -> roll cycle for one charging
// unit at a time. Charges are NOT gated ahead of other units' remaining
// moves this phase — WHF-2 built one flat "movement" phase, not RAW's four
// Movement sub-phases (Start/Charge/Compulsory/Remaining), and building a
// real sequencer is explicitly out of scope for this brief (WHF_PROJECT_PLAN
// scopes it as its own later infra piece). Practical effect: nothing stops a
// player from moving other units first and declaring a charge afterward,
// which RAW wouldn't allow. That's the exact test case the future sequencer
// needs to close — see DEVLOG.

function maxChargeReach(unit) {
  return parseFloat(unit.stats.M) + 12; // outer bound before the 2D6 roll happens
}

function validChargeTargets(charger) {
  const budget = maxChargeReach(charger);
  return enemiesOf(charger, state.units).filter(t => chargeReach(charger, t, budget).reachable);
}

// No terrain/line-of-sight model exists anywhere in the app yet, so charge
// legality here is reach-only (no LoS raycast to skip against). Garrisoned
// units aren't representable either (no buildings) — that RAW branch is
// skipped entirely rather than stubbed.
function enterChargeDeclare() {
  const unit = getSelectedUnit();
  if (!unit || unit.hasMoved || unit.hasReformed || unit.hasCharged || unit.phaseDone || unit.fleeing) return;
  if (!validChargeTargets(unit).length) { flashHint('No enemy unit in charge reach'); return; }
  chargeFlow = { chargerId: unit.instanceId, targetIds: [], stage: 'select-targets', log: [] };
  renderBoard();
  showPanel(unit);
}

function validTargetIdsForFlow() {
  if (!chargeFlow) return [];
  const charger = state.units.find(u => u.instanceId === chargeFlow.chargerId);
  return validChargeTargets(charger).map(t => t.instanceId);
}

function toggleChargeTarget(targetId) {
  if (!chargeFlow || chargeFlow.stage !== 'select-targets') return;
  const i = chargeFlow.targetIds.indexOf(targetId);
  if (i >= 0) chargeFlow.targetIds.splice(i, 1);
  else if (chargeFlow.targetIds.length < 2) chargeFlow.targetIds.push(targetId);
  renderBoard();
  showPanel(getSelectedUnit());
}

function cancelChargeFlow() {
  chargeFlow = null;
  const unit = getSelectedUnit();
  renderBoard();
  if (unit) showPanel(unit);
}

// Targets that already have a locked-in reaction this phase ("Multiple
// charges on one target" — that unit reacts once, its reaction applies to
// all chargers) or that are already fleeing (handled as "charging a
// fleeing enemy" at roll time instead) skip the reaction prompt.
function confirmChargeTargets() {
  if (!chargeFlow || !chargeFlow.targetIds.length) return;
  const queue = chargeFlow.targetIds.filter(id => {
    const t = state.units.find(u => u.instanceId === id);
    return t && !t.fleeing && !(id in state.chargeReactions);
  });
  chargeFlow.reactionQueue = queue;
  chargeFlow.stage = queue.length ? 'awaiting-reaction' : 'ready-to-roll';
  state.selected = queue.length ? queue[0] : chargeFlow.chargerId;
  renderBoard();
  showPanel(getSelectedUnit());
}

// RAW: "a Stand and Shoot reaction can only be declared if... the unit has
// missile weapons... and the range to the enemy is greater than the
// charging unit's Move characteristic." Returns a reason string when
// disallowed (WHF-4a.1: surfaced in the UI — a greyed button with no
// explanation reads as broken, not as RAW working correctly) or null when
// the reaction is legal.
function standAndShootBlockReason(target, charger) {
  // WHF-4a.1: already engaged (from a prior charge this game) can't shoot
  // at all, reaction or not — same blanket prohibition validShootTargets()
  // enforces for normal declared shots.
  if (target.engaged) return 'engaged in combat';
  const weapon = target.weapons.find(w => w.type === 'ranged');
  if (!weapon) return 'no ranged weapon';
  const distance = pxDistance(target.position, charger.position) / INCHES_TO_PX;
  if (distance <= parseFloat(charger.stats.M)) return 'too close to react';
  return null;
}

function chooseReaction(targetId, reaction) {
  if (!chargeFlow || chargeFlow.stage !== 'awaiting-reaction') return;
  const target  = state.units.find(u => u.instanceId === targetId);
  const charger = state.units.find(u => u.instanceId === chargeFlow.chargerId);
  if (!target || !charger) return;

  state.chargeReactions[targetId] = reaction;
  chargeFlow.log.push(`${target.name}: ${reaction}`);

  if (reaction === 'flee') {
    const move = fleeMove(target, charger.position);
    const passedThrough = friendliesInFleePath(target, move.fromPos, move.toPos, state.units);
    let updated = {
      ...target,
      position:  move.offBoard ? move.fromPos : move.toPos,
      facing:    move.facing,
      fleeing:   true,
      phaseDone: true, // no further actions this phase once fleeing
    };
    if (move.offBoard) updated = killUnit(updated);
    state.units[state.units.findIndex(u => u.instanceId === targetId)] = updated;
    chargeFlow.log.push(
      `${target.name} flees ${move.fleeInches}" (roll ${move.fleeRoll})` +
      (move.offBoard ? ' — off the table, destroyed' : '')
    );

    passedThrough.forEach(f => {
      const ld = testLeadership(f.stats.Ld);
      chargeFlow.log.push(
        `Panic test, ${f.name}: rolled ${ld.roll} vs Ld ${ld.target} — ${ld.passed ? 'holds' : 'panics, also flees'}`
      );
      if (!ld.passed) {
        const fMove = fleeMove(f, charger.position);
        let fUpdated = {
          ...f,
          position:  fMove.offBoard ? fMove.fromPos : fMove.toPos,
          facing:    fMove.facing,
          fleeing:   true,
          phaseDone: true,
        };
        if (fMove.offBoard) fUpdated = killUnit(fUpdated);
        state.units[state.units.findIndex(u => u.instanceId === f.instanceId)] = fUpdated;
      }
    });

    chargeFlow.fledTargetId = targetId;
  } else if (reaction === 'standAndShoot') {
    // WHF-4a: resolveShot() is the same function the Shooting phase's own
    // UI calls — closes the debt WHF-3 left open. Casualties land here,
    // before rollChargeMove()'s contact/failed-charge resolution runs (it
    // re-fetches the charger fresh from state.units, so the reduced model
    // count is picked up automatically).
    const weapon = target.weapons.find(w => w.type === 'ranged');
    if (!weapon) {
      chargeFlow.log.push(`${target.name} has no ranged weapon — Stand and Shoot fizzles`);
    } else {
      const distance = pxDistance(target.position, charger.position) / INCHES_TO_PX;
      const result = resolveShot(target, charger, {
        longRange: distance > weapon.range / 2,
        moved: false,
        standAndShoot: true,
      });
      result.log.forEach(l => chargeFlow.log.push(l));
      state.units[state.units.findIndex(u => u.instanceId === charger.instanceId)] = result.updatedTarget;
      if (!isUnitAlive(result.updatedTarget)) {
        chargeFlow.log.push(`${charger.name} destroyed by Stand and Shoot before making contact!`);
      }
    }
  }

  chargeFlow.reactionQueue = chargeFlow.reactionQueue.filter(id => id !== targetId);
  if (chargeFlow.reactionQueue.length) {
    state.selected = chargeFlow.reactionQueue[0];
  } else if (chargeFlow.fledTargetId && chargeFlow.targetIds.length === 1) {
    chargeFlow.stage = 'redirect-prompt';
    state.selected = chargeFlow.chargerId;
  } else {
    chargeFlow.stage = 'ready-to-roll';
    state.selected = chargeFlow.chargerId;
  }
  updateEndPhaseButton();
  renderBoard();
  showPanel(getSelectedUnit());
}

function declineRedirect() {
  if (!chargeFlow || chargeFlow.stage !== 'redirect-prompt') return;
  chargeFlow.stage = 'ready-to-roll';
  showPanel(getSelectedUnit());
}

function attemptRedirect() {
  if (!chargeFlow || chargeFlow.stage !== 'redirect-prompt') return;
  const charger = state.units.find(u => u.instanceId === chargeFlow.chargerId);
  const ld = testLeadership(charger.stats.Ld);
  chargeFlow.log.push(`Redirect Ld test: rolled ${ld.roll} vs Ld ${ld.target} — ${ld.passed ? 'passed' : 'failed'}`);
  if (!ld.passed) {
    chargeFlow.stage = 'ready-to-roll';
    showPanel(getSelectedUnit());
    return;
  }
  const alternatives = validChargeTargets(charger).filter(t => t.instanceId !== chargeFlow.fledTargetId);
  if (!alternatives.length) {
    chargeFlow.log.push('No other legal target — charge continues against the fled unit');
    chargeFlow.stage = 'ready-to-roll';
    showPanel(getSelectedUnit());
    return;
  }
  chargeFlow.stage = 'redirect-pick';
  showPanel(getSelectedUnit());
}

function pickRedirectTarget(targetId) {
  if (!chargeFlow || chargeFlow.stage !== 'redirect-pick') return;
  chargeFlow.targetIds   = [targetId];
  chargeFlow.fledTargetId = null;
  chargeFlow.stage = 'ready-to-roll';
  showPanel(getSelectedUnit());
}

// Multi-target ("There's Too Many of Them!") is approximated: the governing
// target is whichever declared target needs the most reach, and satisfying
// it is treated as satisfying all of them. Full simultaneous multi-body
// contact geometry is out of scope here — see DEVLOG.
function rollChargeMove() {
  if (!chargeFlow || chargeFlow.stage !== 'ready-to-roll') return;
  const idx     = state.units.findIndex(u => u.instanceId === chargeFlow.chargerId);
  const charger = state.units[idx];
  const M       = parseFloat(charger.stats.M);
  const roll    = roll2D6();
  const budget  = M + roll;

  const targets = chargeFlow.targetIds
    .map(id => state.units.find(u => u.instanceId === id))
    .filter(Boolean);
  const results = targets
    .map(t => ({ t, reach: chargeReach(charger, t, budget) }))
    .sort((a, b) => b.reach.inchesNeeded - a.reach.inchesNeeded);
  const { t: primaryTarget, reach } = results[0];

  chargeFlow.log.push(
    `Charge roll: ${roll} (+ M ${M}" = ${budget}") vs ${reach.inchesNeeded.toFixed(1)}" needed`
  );

  let updated, outcome;
  if (primaryTarget.fleeing) {
    if (reach.reachable) {
      outcome = 'caught';
      state.units[state.units.findIndex(u => u.instanceId === primaryTarget.instanceId)] =
        killUnit(state.units.find(u => u.instanceId === primaryTarget.instanceId));
      updated = { ...charger, facing: reach.finalFacing, movementUsed: M, hasMoved: true, hasCharged: true };
      chargeFlow.log.push(`${primaryTarget.name} caught and destroyed`);
    } else {
      outcome = 'not-caught';
      const moved = moveUnitForward({ ...charger, facing: reach.finalFacing, movementUsed: 0 }, Math.min(roll, M));
      updated = { ...moved, hasMoved: true, hasCharged: true };
      chargeFlow.log.push(`${primaryTarget.name} outdistances the charge — not caught`);
    }
  } else if (reach.reachable) {
    outcome = 'contact';
    updated = {
      ...charger,
      facing:       reach.finalFacing,
      position:     reach.contactPoint,
      movementUsed: reach.inchesNeeded,
      hasMoved:     true,
      hasCharged:   true,
      engaged:      true,
    };
    // WHF-4a.1: contact engages BOTH units, not just the charger — the
    // charger's own hasCharged only ever blocked it from shooting
    // incidentally ("already moved"), and the defender got no state
    // change at all, so it stayed a fully legal shooter/target through
    // the whole rest of the turn. No WHF-5 (Close Combat) yet to clear
    // this, so it's accepted as a persistent lock until that exists —
    // see engaged's own comment at declaration.
    state.units[state.units.findIndex(u => u.instanceId === primaryTarget.instanceId)] =
      { ...primaryTarget, engaged: true };
  } else {
    outcome = 'failed';
    const moved = moveUnitForward({ ...charger, facing: reach.finalFacing, movementUsed: 0 }, roll);
    updated = { ...moved, hasMoved: true, hasCharged: true };
    chargeFlow.log.push('Failed charge — no combat, unit advances the rolled distance only');
  }

  state.units[idx] = updated;
  chargeFlow.stage   = 'resolved';
  chargeFlow.outcome = outcome;
  state.selected = chargeFlow.chargerId;
  renderBoard();
  showPanel(getSelectedUnit());
}

function finishChargeFlow() {
  if (!chargeFlow) return;
  const idx = state.units.findIndex(u => u.instanceId === chargeFlow.chargerId);
  if (idx !== -1) state.units[idx] = { ...state.units[idx], phaseDone: true };
  chargeFlow = null;
  deselectAll();
  updateEndPhaseButton();
}

// ── Shooting flow (WHF-4a) ──────────────────────────────────────────────────
// Declare-target -> roll -> resolved, one shooting unit at a time — same
// sequential single-panel pattern the Charge flow already established.

function validShootTargets(shooter) {
  const weapon = shooter.weapons.find(w => w.type === 'ranged');
  if (!weapon) return [];
  // WHF-4a.1, RAW confirmed (8th.whfb.app/shooting/shooting-into-combat):
  // "Models are not permitted to shoot at enemies that are engaged in
  // close combat... too much danger of hitting a friend." Blanket
  // prohibition, no exception modeled here (template war machines have a
  // narrow accidental-hit carve-out in RAW; out of scope for this app,
  // which has no template weapons yet — WHF-4b).
  return enemiesOf(shooter, state.units)
    .filter(t => !t.engaged)
    .filter(t => pxDistance(shooter.position, t.position) / INCHES_TO_PX <= weapon.range);
}

function validShootTargetIdsForFlow() {
  if (!shootFlow) return [];
  const shooter = state.units.find(u => u.instanceId === shootFlow.shooterId);
  return validShootTargets(shooter).map(t => t.instanceId);
}

function enterShootDeclare() {
  const unit = getSelectedUnit();
  if (!unit || unit.phaseDone || chargeFlow) return;
  if (!validShootTargets(unit).length) { flashHint('No enemy unit in range'); return; }
  shootFlow = { shooterId: unit.instanceId, targetId: null, stage: 'select-target', log: [] };
  renderBoard();
  showPanel(unit);
}

function pickShootTarget(targetId) {
  if (!shootFlow || shootFlow.stage !== 'select-target') return;
  shootFlow.targetId = targetId;
  shootFlow.stage = 'ready-to-roll';
  renderBoard();
  showPanel(getSelectedUnit());
}

function rollShoot() {
  if (!shootFlow || shootFlow.stage !== 'ready-to-roll') return;
  const shooter  = state.units.find(u => u.instanceId === shootFlow.shooterId);
  const target   = state.units.find(u => u.instanceId === shootFlow.targetId);
  const weapon   = shooter.weapons.find(w => w.type === 'ranged');
  const distance = pxDistance(shooter.position, target.position) / INCHES_TO_PX;

  const result = resolveShot(shooter, target, {
    longRange: distance > weapon.range / 2,
    moved:     shooter.shootingPenalty > 0,
    standAndShoot: false,
  });

  state.units[state.units.findIndex(u => u.instanceId === target.instanceId)] = result.updatedTarget;
  shootFlow.log = result.log;
  shootFlow.stage = 'resolved';
  renderBoard();
  showPanel(getSelectedUnit());
}

function finishShootFlow() {
  if (!shootFlow) return;
  const idx = state.units.findIndex(u => u.instanceId === shootFlow.shooterId);
  if (idx !== -1) state.units[idx] = { ...state.units[idx], phaseDone: true };
  shootFlow = null;
  deselectAll();
  updateEndPhaseButton();
}

function cancelShootFlow() {
  shootFlow = null;
  const unit = getSelectedUnit();
  renderBoard();
  if (unit) showPanel(unit);
}

function holdFire() {
  const unit = getSelectedUnit();
  if (!unit || unit.phaseDone) return;
  const idx = state.units.findIndex(u => u.instanceId === unit.instanceId);
  state.units[idx] = { ...state.units[idx], phaseDone: true };
  deselectAll();
  updateEndPhaseButton();
}

// ── Phase advance ────────────────────────────────────────────────────────
const PHASE_ORDER  = ['movement', 'magic', 'shooting', 'combat', 'end'];
const PHASE_LABELS = { movement: 'Movement', magic: 'Magic', shooting: 'Shooting', combat: 'Combat', end: 'Turn' };
// Phases gated on every unit finishing its action before the bar shows;
// magic/combat/end have no per-unit action implemented yet (WHF-5+), so
// their bar is always available.
const GATED_PHASES = new Set(['movement', 'shooting']);

function endPhase() {
  const leaving = state.phase;
  const next    = PHASE_ORDER[(PHASE_ORDER.indexOf(leaving) + 1) % PHASE_ORDER.length];

  if (leaving === 'movement') {
    // Snapshot shooting eligibility BEFORE movementDefaults() wipes the
    // per-phase flags it's derived from (hasReformed/hasCharged/hasMoved
    // reset here, ready for next turn's movement phase).
    state.units.forEach(u => {
      // engaged (WHF-4a.1) is checked separately, not folded into this
      // OR chain, on purpose — hasCharged/hasReformed/fleeing all reset
      // every movement phase via movementDefaults() below, but engaged
      // must keep blocking shooting turn after turn until WHF-5 exists
      // to clear it. If it were only caught here via hasCharged's
      // incidental overlap, it would silently stop blocking the very
      // next turn once hasCharged reset.
      u.shootingBlocked  = u.hasReformed || u.hasCharged || u.fleeing || u.engaged;
      u.shootingPenalty  = u.hasMoved ? 1 : 0;
    });
    chargeFlow = null;
    state.chargeReactions = {};
    state.units.forEach(u => Object.assign(u, movementDefaults()));
  }
  if (leaving === 'shooting') shootFlow = null;

  state.phase = next;

  if (next === 'movement') {
    state.units.forEach(u => { u.phaseDone = false; });
  }
  if (next === 'shooting') {
    // Units with nothing to do this phase (no ranged weapon, blocked by
    // their movement-phase action, or a Move-or-Fire weapon that moved)
    // skip straight to done so the phase-complete bar isn't stuck waiting.
    state.units.forEach(u => {
      const weapon = u.weapons.find(w => w.type === 'ranged');
      const moveOrFireBlocked = weapon && weapon.rules && weapon.rules.includes('moveOrFire') && u.shootingPenalty > 0;
      if (u.shootingBlocked || !weapon || moveOrFireBlocked) u.phaseDone = true;
    });
  }

  renderPhaseTracker();
  updateEndPhaseButton();
  renderBoard();
  if (next === 'magic')  flashHint('Magic phase — not yet implemented, skip ahead');
  if (next === 'combat') flashHint('Combat phase — not yet implemented (WHF-5)');
}

function updateEndPhaseButton() {
  const bar = document.getElementById('end-phase-bar');
  const visible = !GATED_PHASES.has(state.phase) || state.units.every(u => u.phaseDone);
  bar.classList.toggle('visible', visible);
}

// ── Arrow-key handlers ─────────────────────────────────────────────────────
function handleMoveKey(direction) {
  if (!moveGhost) return;
  const unit = getSelectedUnit();
  if (!unit) return;
  const ghost     = moveGhost.unit;
  const M         = parseFloat(unit.stats.M);
  const remaining = M - ghost.movementUsed;
  if (remaining <= 0) { flashHint('No movement remaining'); return; }

  let newGhost;
  if (direction > 0) {
    const step = Math.min(1, remaining);
    newGhost = moveUnitForward(ghost, step);
  } else {
    const halfM   = M / 2;
    const maxBack = Math.min(0.5, remaining, halfM - ghost.backwardInches);
    if (maxBack <= 0) { flashHint(`Backward limit reached (max ${halfM.toFixed(1)}")`); return; }
    const d = inchesToPx(maxBack);
    const v = facingVector(ghost);
    newGhost = {
      ...ghost,
      position: { x: ghost.position.x - v.x * d, y: ghost.position.y - v.y * d },
      movementUsed:   ghost.movementUsed   + maxBack,
      backwardInches: ghost.backwardInches + maxBack,
    };
  }

  showGhost(newGhost, 'move');
  showPanel(unit);
}

function handleWheelKey(angleDeltaDeg) {
  if (!moveGhost) return;
  const newGhost = wheelUnit(moveGhost.unit, wheelPivotSide, angleDeltaDeg);
  if (!newGhost) { flashHint('Wheel limit — M allowance exhausted'); return; }
  showGhost(newGhost, 'wheel');
  showPanel(getSelectedUnit());
}

// ── Movement panel HTML ─────────────────────────────────────────────────────
function buildMovementSection(unit) {
  if (state.phase !== 'movement') return '';
  if (chargeFlow) return buildChargeSection(unit);
  const M    = parseFloat(unit.stats.M);
  const used = moveGhost ? moveGhost.unit.movementUsed : unit.movementUsed;

  if (unit.phaseDone) {
    return `<div class="panel-section">
      <div class="panel-section-title">Movement</div>
      <div class="panel-row panel-done">Movement complete (${unit.movementUsed.toFixed(1)}" used)</div>
    </div>`;
  }

  if (unit.fleeing) {
    return `<div class="panel-section">
      <div class="panel-section-title">Movement</div>
      <div class="panel-row panel-done">Fleeing — no further actions this phase</div>
    </div>`;
  }

  if (moveMode === null) {
    const canMove   = !unit.hasReformed && !unit.hasCharged;
    const canReform = !unit.hasMoved && !unit.hasReformed;
    const canCharge = !unit.hasMoved && !unit.hasReformed && !unit.hasCharged;
    const remaining = (M - unit.movementUsed).toFixed(1);
    const movedNote   = unit.hasMoved   ? '<div class="panel-row dim">Moved this turn — reform unavailable</div>' : '';
    const reformedNote = unit.hasReformed ? '<div class="panel-row dim">Reformed — no remaining move</div>' : '';
    const chargedNote = unit.hasCharged ? '<div class="panel-row dim">Charged this phase</div>' : '';
    return `<div class="panel-section">
      <div class="panel-section-title">Movement</div>
      <div class="panel-row">Allowance: ${M}" &nbsp;|&nbsp; Used: ${unit.movementUsed.toFixed(1)}" &nbsp;|&nbsp; Left: ${remaining}"</div>
      ${movedNote}${reformedNote}${chargedNote}
      <div class="move-btns">
        <button class="move-btn" id="btn-move" ${canMove ? '' : 'disabled'}>Move</button>
        <button class="move-btn" id="btn-wheel" ${canMove ? '' : 'disabled'}>Wheel</button>
        <button class="move-btn" id="btn-reform" ${canReform ? '' : 'disabled'}>Reform</button>
        <button class="move-btn" id="btn-charge" ${canCharge ? '' : 'disabled'}>Charge</button>
      </div>
      <button class="move-btn done-btn" id="btn-done">Done — End unit move</button>
    </div>`;
  }

  const remaining = (M - used).toFixed(1);

  if (moveMode === 'move') {
    const backUsed = moveGhost ? moveGhost.unit.backwardInches.toFixed(1) : '0.0';
    const halfM    = (M / 2).toFixed(1);
    return `<div class="panel-section">
      <div class="panel-section-title">Moving</div>
      <div class="panel-row">↑ forward 1" per press &nbsp; ↓ backward 0.5" per press</div>
      <div class="panel-row">Remaining: ${remaining}" &nbsp;|&nbsp; Backward: ${backUsed}" / ${halfM}" max</div>
      <div class="move-btns">
        <button class="move-btn" id="btn-commit">Confirm (Enter)</button>
        <button class="move-btn" id="btn-cancel">Cancel (Esc)</button>
      </div>
    </div>`;
  }

  if (moveMode === 'wheel-pick') {
    return `<div class="panel-section">
      <div class="panel-section-title">Wheel — Select Pivot</div>
      <div class="panel-row">Click a gold diamond on the board</div>
      <div class="move-btns">
        <button class="move-btn" id="btn-cancel">Cancel (Esc)</button>
      </div>
    </div>`;
  }

  if (moveMode === 'wheel') {
    return `<div class="panel-section">
      <div class="panel-section-title">Wheeling (${wheelPivotSide} pivot)</div>
      <div class="panel-row">← / → to rotate (${WHEEL_DEG}° per press)</div>
      <div class="panel-row">Remaining: ${remaining}"</div>
      <div class="move-btns">
        <button class="move-btn" id="btn-commit">Confirm (Enter)</button>
        <button class="move-btn" id="btn-cancel">Cancel (Esc)</button>
      </div>
    </div>`;
  }

  if (moveMode === 'reform') {
    const max = unit.models.length;
    return `<div class="panel-section">
      <div class="panel-section-title">Reform (costs full move)</div>
      <div class="rw-control">
        <span class="rw-label">Rank width:</span>
        <button class="move-btn rw-btn" id="rw-minus">−</button>
        <span class="rw-value">${reformRankWidth}</span>
        <button class="move-btn rw-btn" id="rw-plus">+</button>
        <span class="rw-label">&nbsp;(1–${max})</span>
      </div>
      <div class="move-btns">
        <button class="move-btn" id="btn-commit">Confirm (Enter)</button>
        <button class="move-btn" id="btn-cancel">Cancel (Esc)</button>
      </div>
    </div>`;
  }

  return '';
}

// Panel content for the active charge flow. Which branch renders depends on
// both chargeFlow.stage AND whether `unit` (the panel currently shown) is
// the charger or the reacting/redirect-relevant unit — state.selected is
// steered to the relevant unit at each stage transition so the right prompt
// surfaces automatically in this single-panel, hotseat-local UI.
function buildChargeSection(unit) {
  const charger = state.units.find(u => u.instanceId === chargeFlow.chargerId);
  const logHtml = chargeFlow.log.length
    ? `<ul class="panel-list">${chargeFlow.log.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>`
    : '';

  if (chargeFlow.stage === 'select-targets') {
    if (unit.instanceId !== chargeFlow.chargerId) {
      return `<div class="panel-section">
        <div class="panel-row dim">Charge in progress — click a highlighted enemy unit on the board.</div>
      </div>`;
    }
    const picked = chargeFlow.targetIds
      .map(id => state.units.find(u => u.instanceId === id)?.name)
      .filter(Boolean);
    return `<div class="panel-section">
      <div class="panel-section-title">Declare Charge</div>
      <div class="panel-row">Click a highlighted enemy unit to target (up to 2 — "There's Too Many of Them!")</div>
      <div class="panel-row">Targeted: ${picked.length ? escHtml(picked.join(', ')) : '(none yet)'}</div>
      <div class="move-btns">
        <button class="move-btn" id="btn-charge-confirm" ${chargeFlow.targetIds.length ? '' : 'disabled'}>Confirm targets</button>
        <button class="move-btn" id="btn-charge-cancel">Cancel (Esc)</button>
      </div>
    </div>`;
  }

  if (chargeFlow.stage === 'awaiting-reaction') {
    const reactingId = chargeFlow.reactionQueue[0];
    if (unit.instanceId !== reactingId) {
      const reactingName = state.units.find(u => u.instanceId === reactingId)?.name || 'target';
      return `<div class="panel-section">
        <div class="panel-row dim">Waiting on ${escHtml(reactingName)}'s charge reaction.</div>
        ${logHtml}
      </div>`;
    }
    const blockReason = standAndShootBlockReason(unit, charger);
    const shootNote = blockReason
      ? `<div class="panel-row dim">Stand and Shoot unavailable — ${escHtml(blockReason)}</div>` : '';
    return `<div class="panel-section">
      <div class="panel-section-title">Charge Reaction — ${escHtml(charger.name)} charges ${escHtml(unit.name)}</div>
      <div class="move-btns">
        <button class="move-btn" id="btn-react-hold">Hold</button>
        <button class="move-btn" id="btn-react-shoot" ${blockReason ? 'disabled' : ''} title="${blockReason ? escHtml(blockReason) : ''}">Stand and Shoot</button>
        <button class="move-btn" id="btn-react-flee">Flee!</button>
      </div>
      ${shootNote}
      ${logHtml}
    </div>`;
  }

  if (chargeFlow.stage === 'redirect-prompt') {
    if (unit.instanceId !== chargeFlow.chargerId) return '';
    return `<div class="panel-section">
      <div class="panel-section-title">Redirect?</div>
      <div class="panel-row">Target fled. Test Leadership to redirect to another legal target?</div>
      <div class="move-btns">
        <button class="move-btn" id="btn-redirect-yes">Test to redirect</button>
        <button class="move-btn" id="btn-redirect-no">Continue against fled target</button>
      </div>
      ${logHtml}
    </div>`;
  }

  if (chargeFlow.stage === 'redirect-pick') {
    if (unit.instanceId !== chargeFlow.chargerId) return '';
    const alts = validChargeTargets(charger).filter(t => t.instanceId !== chargeFlow.fledTargetId);
    const items = alts
      .map(t => `<li><button class="move-btn redirect-pick-btn" data-target-id="${t.instanceId}">${escHtml(t.name)}</button></li>`)
      .join('');
    return `<div class="panel-section">
      <div class="panel-section-title">Redirect — pick new target</div>
      <ul class="panel-list">${items}</ul>
      ${logHtml}
    </div>`;
  }

  if (chargeFlow.stage === 'ready-to-roll') {
    if (unit.instanceId !== chargeFlow.chargerId) return '';
    if (!isUnitAlive(charger)) {
      return `<div class="panel-section">
        <div class="panel-section-title">Charge Cancelled — ${escHtml(charger.name)} destroyed</div>
        ${logHtml}
        <div class="move-btns">
          <button class="move-btn" id="btn-charge-done">Continue</button>
        </div>
      </div>`;
    }
    return `<div class="panel-section">
      <div class="panel-section-title">Roll Charge</div>
      <div class="move-btns">
        <button class="move-btn" id="btn-charge-roll">Roll 2D6 and move</button>
      </div>
      ${logHtml}
    </div>`;
  }

  if (chargeFlow.stage === 'resolved') {
    if (unit.instanceId !== chargeFlow.chargerId) return '';
    return `<div class="panel-section">
      <div class="panel-section-title">Charge Resolved — ${escHtml(chargeFlow.outcome)}</div>
      ${logHtml}
      <div class="move-btns">
        <button class="move-btn" id="btn-charge-done">Continue</button>
      </div>
    </div>`;
  }

  return '';
}

// ── Shooting panel HTML (WHF-4a) ────────────────────────────────────────────
function buildShootingSection(unit) {
  if (state.phase !== 'shooting') return '';
  if (shootFlow) return buildShootFlowSection(unit);

  const weapon = unit.weapons.find(w => w.type === 'ranged');
  const moveOrFireBlocked = weapon && weapon.rules && weapon.rules.includes('moveOrFire') && unit.shootingPenalty > 0;

  if (unit.phaseDone) {
    const reason = unit.engaged      ? 'ENGAGED — locked in combat, cannot shoot'
      : unit.shootingBlocked ? 'blocked — charged, reformed, or fled this turn'
      : !weapon             ? 'no ranged weapon'
      : moveOrFireBlocked   ? 'Move or Fire — moved this turn, cannot shoot'
      : 'complete';
    return `<div class="panel-section">
      <div class="panel-section-title">Shooting</div>
      <div class="panel-row panel-done">${escHtml(reason)}</div>
    </div>`;
  }

  const penaltyNote = unit.shootingPenalty > 0
    ? '<div class="panel-row dim">Moved this turn — -1 to hit</div>' : '';
  return `<div class="panel-section">
    <div class="panel-section-title">Shooting</div>
    <div class="panel-row">${escHtml(weapon.name)} — range ${weapon.range}", S${weapon.strength}</div>
    ${penaltyNote}
    <div class="move-btns">
      <button class="move-btn" id="btn-shoot-declare">Choose Target</button>
      <button class="move-btn" id="btn-shoot-hold">Hold Fire</button>
    </div>
  </div>`;
}

function buildShootFlowSection(unit) {
  const shooter = state.units.find(u => u.instanceId === shootFlow.shooterId);
  if (!shooter || unit.instanceId !== shooter.instanceId) {
    return `<div class="panel-section">
      <div class="panel-row dim">Shooting in progress — click a highlighted enemy unit on the board.</div>
    </div>`;
  }
  const logHtml = shootFlow.log.length
    ? `<ul class="panel-list">${shootFlow.log.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>` : '';

  if (shootFlow.stage === 'select-target') {
    return `<div class="panel-section">
      <div class="panel-section-title">Choose Target</div>
      <div class="panel-row">Click a highlighted enemy unit in range</div>
      <div class="move-btns"><button class="move-btn" id="btn-shoot-cancel">Cancel (Esc)</button></div>
    </div>`;
  }
  if (shootFlow.stage === 'ready-to-roll') {
    const target = state.units.find(u => u.instanceId === shootFlow.targetId);
    return `<div class="panel-section">
      <div class="panel-section-title">Fire at ${escHtml(target.name)}</div>
      <div class="move-btns">
        <button class="move-btn" id="btn-shoot-roll">Roll shots</button>
        <button class="move-btn" id="btn-shoot-cancel">Cancel (Esc)</button>
      </div>
    </div>`;
  }
  if (shootFlow.stage === 'resolved') {
    return `<div class="panel-section">
      <div class="panel-section-title">Shot Resolved</div>
      ${logHtml}
      <div class="move-btns"><button class="move-btn" id="btn-shoot-done">Continue</button></div>
    </div>`;
  }
  return '';
}

function attachShootingListeners(unit) {
  const q = id => document.getElementById(id);
  q('btn-shoot-declare')?.addEventListener('click', enterShootDeclare);
  q('btn-shoot-hold')?.addEventListener('click', holdFire);
  q('btn-shoot-cancel')?.addEventListener('click', cancelShootFlow);
  q('btn-shoot-roll')?.addEventListener('click', rollShoot);
  q('btn-shoot-done')?.addEventListener('click', finishShootFlow);
}

function attachMovementListeners(unit) {
  const q = id => document.getElementById(id);
  q('btn-move')?.addEventListener('click', enterMoveMode);
  q('btn-wheel')?.addEventListener('click', enterWheelPickMode);
  q('btn-reform')?.addEventListener('click', enterReformMode);
  q('btn-charge')?.addEventListener('click', enterChargeDeclare);
  q('btn-done')?.addEventListener('click', doneUnit);
  q('btn-commit')?.addEventListener('click', commitGhost);
  q('btn-cancel')?.addEventListener('click', cancelGhost);
  q('rw-minus')?.addEventListener('click', () => adjustReformWidth(unit, -1));
  q('rw-plus')?.addEventListener('click',  () => adjustReformWidth(unit,  1));

  q('btn-charge-confirm')?.addEventListener('click', confirmChargeTargets);
  q('btn-charge-cancel')?.addEventListener('click', cancelChargeFlow);
  q('btn-react-hold')?.addEventListener('click',  () => chooseReaction(unit.instanceId, 'hold'));
  q('btn-react-shoot')?.addEventListener('click', () => chooseReaction(unit.instanceId, 'standAndShoot'));
  q('btn-react-flee')?.addEventListener('click',  () => chooseReaction(unit.instanceId, 'flee'));
  q('btn-redirect-yes')?.addEventListener('click', attemptRedirect);
  q('btn-redirect-no')?.addEventListener('click',  declineRedirect);
  q('btn-charge-roll')?.addEventListener('click', rollChargeMove);
  q('btn-charge-done')?.addEventListener('click', finishChargeFlow);
  document.querySelectorAll('.redirect-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => pickRedirectTarget(btn.dataset.targetId));
  });
}

// ── Stat panel ─────────────────────────────────────────────────────────────
function showPanel(unit) {
  const panel   = document.getElementById('stat-panel');
  const content = document.getElementById('panel-content');
  const alive    = unit.models.filter(m => m.alive).length;
  const total    = unit.models.length;
  const numRanks = Math.ceil(total / unit.rankWidth);
  const s        = unit.stats;

  const weaponItems = unit.weapons.map(w =>
    `<li>${escHtml(w.name)}${w.desc
      ? ` <span class="panel-sub">(${escHtml(w.type)}, ${escHtml(w.desc)})</span>`
      : ` <span class="panel-sub">(${escHtml(w.type)})</span>`}</li>`
  ).join('');

  const abilityItems = unit.abilities.length
    ? unit.abilities.map(a => `<li>${escHtml(a)}</li>`).join('')
    : '<li class="panel-none">None</li>';

  content.innerHTML = `
    <div class="panel-header">
      <div class="panel-name">${escHtml(unit.name)}</div>
      <div class="panel-faction">${escHtml(unit.factionLabel)} — ${escHtml(unit.category)}</div>
      ${unit.engaged ? '<div class="panel-engaged-badge">Engaged</div>' : ''}
    </div>
    <div class="panel-section">
      <table class="stat-table">
        <tr>
          <th>M</th><th>WS</th><th>BS</th><th>S</th><th>T</th><th>W</th><th>I</th>
        </tr>
        <tr>
          <td>${escHtml(s.M)}</td><td>${escHtml(s.WS)}</td><td>${escHtml(s.BS)}</td>
          <td>${escHtml(s.S)}</td><td>${escHtml(s.T)}</td><td>${escHtml(s.W)}</td>
          <td>${escHtml(s.I)}</td>
        </tr>
        <tr class="stat-row-lower">
          <th>A</th><th>Ld</th><th>Sv</th><td colspan="4"></td>
        </tr>
        <tr>
          <td>${escHtml(s.A)}</td><td>${escHtml(s.Ld)}</td><td>${escHtml(s.Sv)}</td>
          <td colspan="4"></td>
        </tr>
      </table>
    </div>
    <div class="panel-section">
      <div class="panel-row">Models: <strong>${alive}</strong> alive / ${total} total</div>
      <div class="panel-row">Ranks: ${numRanks} × ${unit.rankWidth}</div>
    </div>
    <div class="panel-section">
      <div class="panel-section-title">Weapons</div>
      <ul class="panel-list">${weaponItems}</ul>
    </div>
    <div class="panel-section">
      <div class="panel-section-title">Special Rules</div>
      <ul class="panel-list">${abilityItems}</ul>
    </div>
    ${buildMovementSection(unit)}
    ${buildShootingSection(unit)}
  `;

  panel.classList.add('panel-open');

  if (state.phase === 'movement') attachMovementListeners(unit);
  if (state.phase === 'shooting') attachShootingListeners(unit);
}

function hidePanel() {
  document.getElementById('stat-panel').classList.remove('panel-open');
}

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
  initTestUnits();
  renderGrid();
  renderBoard();
  renderPhaseTracker();

  document.getElementById('btn-end-phase').addEventListener('click', endPhase);

  document.getElementById('board').addEventListener('contextmenu', e => {
    e.preventDefault();
    const target = e.target.closest('[data-model-id]');
    if (!target) return;
    toggleModelDead(target.dataset.unitId, target.dataset.modelId);
  });

  document.getElementById('board').addEventListener('click', e => {
    if (e.target.id === 'board' || e.target.id === 'board-bg') deselectAll();
  });

  // Context-aware keyboard handling
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (moveGhost || moveMode) { cancelGhost(); return; }
      if (chargeFlow) { cancelChargeFlow(); return; }
      if (shootFlow) { cancelShootFlow(); return; }
      deselectAll();
      return;
    }

    if (e.key === 'Enter' && moveGhost) {
      e.preventDefault();
      commitGhost();
      return;
    }

    if (moveMode === 'move') {
      if (e.key === 'ArrowUp')   { e.preventDefault(); handleMoveKey(1);  return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); handleMoveKey(-1); return; }
    }

    if (moveMode === 'wheel') {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); handleWheelKey(-WHEEL_DEG); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); handleWheelKey( WHEEL_DEG); return; }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
