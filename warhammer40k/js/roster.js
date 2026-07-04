window.RosterLoader = (() => {
  const cache = {};  // { factionId: { unitId: unitDef } }

  const FACTION_MAP = {
    guard: 'astra-militarum',
    eldar: 'craftworlds-eldar',
  };

  function parseStat(val) {
    return parseInt(String(val == null ? 0 : val)) || 0;
  }

  async function fetchRoster(rosterId) {
    const snap = await window.db.ref('rosters/' + rosterId).once('value');
    if (!snap.exists()) throw new Error('Roster not found.');
    return snap.val();
  }

  async function loadFactionData(factionId) {
    if (cache[factionId]) return;
    const snap = await window.db.ref('gameData/warhammer-40k/' + factionId).once('value');
    cache[factionId] = snap.val() || {};
  }

  function getUnitDef(factionId, unitId) {
    return (cache[factionId] || {})[unitId] || null;
  }

  function buildUnitsFromRoster(roster, playerFaction, boardHeight) {
    const units    = {};
    const factionId = FACTION_MAP[playerFaction];
    const bH       = boardHeight || 60;
    const isGuard  = playerFaction === 'guard';
    const SPACING  = 2;

    const rosterUnitList = Array.isArray(roster.units)
      ? roster.units
      : Object.values(roster.units || {});

    for (const rosterUnit of rosterUnitList) {
      const { instanceId, unitId, unitName, modelCount } = rosterUnit;
      if (!instanceId || !unitId) continue;
      const def   = getUnitDef(factionId, unitId);
      const count = modelCount || 1;
      const cols  = Math.min(count, 5);
      const w     = def && def.stats ? Math.max(1, parseStat(def.stats.W)) : 1;

      for (let i = 0; i < count; i++) {
        const id  = `${playerFaction}_${instanceId}_${i}`;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x   = 6 + col * SPACING;
        const y   = isGuard ? (2 + row * SPACING) : (bH - 3 - row * SPACING);

        units[id] = {
          id,
          faction:   playerFaction,
          factionId,
          unitId,
          unitGroup: `${playerFaction}_${instanceId}`,
          label:     unitName || (def ? def.name : unitId),
          type:      unitId,   // kept for legacy UNIT_STATS fallbacks
          x, y,
          wounds:    w,
          maxWounds: w,
          alive:          true,
          movedThisTurn:  false,
          shotThisTurn:   false,
          chargedThisTurn:false,
          foughtThisTurn: false,
        };
      }
    }

    return units;
  }

  return { fetchRoster, loadFactionData, getUnitDef, buildUnitsFromRoster, FACTION_MAP, parseStat };
})();

// Global shorthand used by shooting.js, state.js, game.js
window.getRosterUnitDef = (factionId, unitId) => window.RosterLoader.getUnitDef(factionId, unitId);
