// baseRadius: 0.5" for all types (Guard 25mm base ≈ 0.5" radius; Eldar 28.5mm ≈ 0.55" — rounded to 0.5")
window.UNIT_STATS = {
  infantry: {
    label: 'Guardsman',
    faction: 'guard',
    move: 6, ws: 4, bs: 4, s: 3, t: 3, w: 1, a: 1, ld: 6, sv: 5,
    toughness: 3, save: 5, baseRadius: 0.5,
    weapon:      { name: 'Lasgun',              range: 24, attacks: 1, bs: 4, strength: 3, ap:  0, damage: 1 },
    meleeWeapon: { name: 'Close Combat Weapon', range:  0, attacks: 1, ws: 4, strength: 3, ap:  0, damage: 1 }
  },
  sergeant: {
    label: 'Sergeant',
    faction: 'guard',
    move: 6, ws: 4, bs: 4, s: 3, t: 3, w: 1, a: 3, ld: 7, sv: 5,
    toughness: 3, save: 5, baseRadius: 0.5,
    weapon:      { name: 'Laspistol', range: 12, attacks: 1, bs: 4, strength: 3, ap: 0, damage: 1 },
    meleeWeapon: { name: 'Chainsword', range: 0, attacks: 3, ws: 4, strength: 3, ap: 0, damage: 1 }
  },
  guardian: {
    label: 'Guardian',
    faction: 'eldar',
    move: 7, ws: 3, bs: 3, s: 3, t: 3, w: 1, a: 1, ld: 7, sv: 4,
    toughness: 3, save: 4, baseRadius: 0.5,
    weapon:      { name: 'Shuriken Catapult',   range: 18, attacks: 2, bs: 3, strength: 4, ap: -1, damage: 1 },
    meleeWeapon: { name: 'Close Combat Weapon', range:  0, attacks: 1, ws: 3, strength: 3, ap:  0, damage: 1 }
  }
};

// Board: 44" wide (x: 0–44) × 60" tall (y: 0–60)
// Guard deploys near top (low y), Eldar near bottom (high y)
// Terrain stored as { "x,y": tier } — each key is a 1"×1" square's top-left corner.
function buildDefaultTerrain() {
  const map = {};
  const zones = [
    { x: 8,  y: 16, w: 10, h: 6 },
    { x: 26, y: 16, w: 10, h: 6 },
    { x: 8,  y: 38, w: 10, h: 6 },
    { x: 26, y: 38, w: 10, h: 6 },
  ];
  zones.forEach(z => {
    for (let gx = z.x; gx < z.x + z.w; gx++)
      for (let gy = z.y; gy < z.y + z.h; gy++)
        map[`${gx},${gy}`] = 'tall';
  });
  return map;
}
window.buildDefaultTerrain = buildDefaultTerrain;
window.DEFAULT_TERRAIN = buildDefaultTerrain();

function makeUnit(id, type, faction, unitGroup, x, y) {
  const s = window.UNIT_STATS[type];
  return {
    id, faction, type, unitGroup, label: s.label,
    x, y,
    wounds: s.w, maxWounds: s.w,
    alive: true,
    movedThisTurn: false, shotThisTurn: false, chargedThisTurn: false, foughtThisTurn: false
  };
}

function buildInitialUnits() {
  const units = {};

  // TEMP: reduced to 2 models each for testing — restore to full squad size before real play
  // Guard: 1 sergeant (chainsword/laspistol) + 1 infantry (lasgun) — exercises mixed-weapon-profile logic
  units['guard_0']   = makeUnit('guard_0',   'infantry',  'guard', 'guard_squad', 17, 5);
  units['guard_sgt'] = makeUnit('guard_sgt', 'sergeant',  'guard', 'guard_squad', 22, 5);

  // TEMP: reduced to 2 models each for testing — restore to full squad size before real play
  // Eldar: 2 Guardian Defenders
  units['eldar_0'] = makeUnit('eldar_0', 'guardian', 'eldar', 'eldar_squad', 17, 55);
  units['eldar_1'] = makeUnit('eldar_1', 'guardian', 'eldar', 'eldar_squad', 22, 55);

  return units;
}

window.buildInitialUnits = buildInitialUnits;
