/*
 * Realtime Database schema — games/{gameId}
 *
 * {
 *   id: string,
 *   createdAt: Timestamp,
 *   status: "waiting" | "active" | "complete",
 *
 *   players: {
 *     guard: { name, token, cp, joined },
 *     eldar: { name, token, cp, joined }
 *   },
 *
 *   turn: {
 *     number: number,
 *     activePlayer: "guard" | "eldar",
 *     phase: "command"|"movement"|"shooting"|"charge"|"fight"|"morale"
 *   },
 *
 *   units: {
 *     [unitId]: {
 *       id, faction, type, unitGroup, label,
 *       x, y,              // position in inches (x: 0–44, y: 0–60)
 *       wounds, maxWounds, alive,
 *       movedThisTurn, shotThisTurn, foughtThisTurn
 *     }
 *   },
 *
 *   terrain:      { "x,y": "rough"|"chestHigh"|"tall" },  // per-square map; key = top-left corner
   terrainOwner: { "x,y": "guard"|"eldar" },            // which faction painted each square
   terrainDone:  { guard: bool, eldar: bool },          // per-player "Done with Terrain" confirmation (BUG-40K-PREGAME item 1) — phase advances once both are true. Simultaneous placement, not turn-alternating; painting itself is gated by budget/enemyOwned in board.js, not by turn.
 *
 *   startingStrength: {
 *     [groupId]: { models: number, wounds: number }  // set at game creation; used for Battle-shock threshold
 *   },
 *
 *   battleShocked: {
 *     [groupId]: true   // present and true while shocked; cleared at start of that player's next Command Phase
 *   } | null,
 *
 *   lastTurnReplay: {
 *     turn: number,
 *     moves:   [{ unitId, fromX, fromY, toX, toY }],
 *     shots:   [{ fromUnitId, toUnitId, hitRoll, woundRoll, saveRoll, damage, hit, wound, saved }],
 *     charges: [{ unitId, targetId, roll2d6, success, distanceInches }],
 *     fights:  [{ attackerId, defenderId, hitRoll, woundRoll, saveRoll, damage }]
 *   } | null
 * }
 */

window.GAME_PRESETS = {
  'combat-patrol': { boardWidth: 44, boardHeight: 30, terrainBudget: 10, pointsLimit:  500 },
  'incursion':     { boardWidth: 44, boardHeight: 60, terrainBudget: 20, pointsLimit: 1000 },
  'strike-force':  { boardWidth: 44, boardHeight: 90, terrainBudget: 30, pointsLimit: 2000 },
};

window.GameState = (() => {
  function generateGameId() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  function generateToken() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  // BUG-40K-PREGAME items 2+3: `guard`/`eldar` are now pure POSITIONAL
  // slots (creator always `guard`-slot/north, joiner always `eldar`-slot/
  // south) — NOT army-faction identity. The actual army each player plays
  // is derived from their ROSTER's own `meta.factionId`/`factionName`
  // (the export already knows this — no separate faction picker needed,
  // and both players can bring the same army). `players[slot].factionId`/
  // `.factionName` store this for display; `RosterLoader.FACTION_MAP` is
  // no longer used to GUESS a faction from the slot anywhere in this
  // function — see roster.js's `buildUnitsFromRoster`, which now reads
  // `roster.meta.factionId` directly for the same reason.
  async function createGame(playerName, devMode, gameSize, rosterId, devRosterId) {
    const gameId    = generateGameId();
    const token     = generateToken();
    const mySlot    = 'guard';
    const otherSlot = 'eldar';
    const preset = window.GAME_PRESETS[gameSize] || window.GAME_PRESETS['incursion'];
    const resolvedSize = window.GAME_PRESETS[gameSize] ? gameSize : 'incursion';

    const roster = await window.RosterLoader.fetchRoster(rosterId);
    const myFactionId   = roster.meta.factionId;
    const myFactionName = roster.meta.factionName || myFactionId;
    await window.RosterLoader.loadFactionData(myFactionId);
    const myUnits = window.RosterLoader.buildUnitsFromRoster(roster, mySlot, preset.boardHeight);

    const players = {
      guard: { name: '', token: '', cp: 0, joined: false, rosterId: '', factionId: '', factionName: '' },
      eldar: { name: '', token: '', cp: 0, joined: false, rosterId: '', factionId: '', factionName: '' },
    };
    players[mySlot] = { name: playerName, token, cp: 0, joined: true, rosterId, factionId: myFactionId, factionName: myFactionName };

    let allUnits = { ...myUnits };
    const undeployedGroups = { guard: null, eldar: null };
    const startingStrength = {};

    const myGroups = [];
    Object.values(myUnits).forEach(u => {
      if (!myGroups.includes(u.unitGroup)) myGroups.push(u.unitGroup);
      if (!startingStrength[u.unitGroup]) startingStrength[u.unitGroup] = { models: 0, wounds: 0 };
      startingStrength[u.unitGroup].models += 1;
      startingStrength[u.unitGroup].wounds += u.maxWounds;
    });
    undeployedGroups[mySlot] = myGroups.length > 0 ? myGroups : null;

    if (devMode && devRosterId) {
      const otherRoster = await window.RosterLoader.fetchRoster(devRosterId);
      const otherFactionId   = otherRoster.meta.factionId;
      const otherFactionName = otherRoster.meta.factionName || otherFactionId;
      await window.RosterLoader.loadFactionData(otherFactionId);
      const otherUnits = window.RosterLoader.buildUnitsFromRoster(otherRoster, otherSlot, preset.boardHeight);
      Object.assign(allUnits, otherUnits);
      players[otherSlot] = { name: 'Player 2 (Dev)', token: generateToken(), cp: 0, joined: true, rosterId: devRosterId, factionId: otherFactionId, factionName: otherFactionName };
      const otherGroups = [];
      Object.values(otherUnits).forEach(u => {
        if (!otherGroups.includes(u.unitGroup)) otherGroups.push(u.unitGroup);
        if (!startingStrength[u.unitGroup]) startingStrength[u.unitGroup] = { models: 0, wounds: 0 };
        startingStrength[u.unitGroup].models += 1;
        startingStrength[u.unitGroup].wounds += u.maxWounds;
      });
      undeployedGroups[otherSlot] = otherGroups.length > 0 ? otherGroups : null;
    }

    const doc = {
      id: gameId,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      status: devMode ? 'active' : 'waiting',
      players,
      turn: { number: 1, activePlayer: 'guard', phase: 'terrain' },
      gameSize:      resolvedSize,
      boardWidth:    preset.boardWidth,
      boardHeight:   preset.boardHeight,
      terrainBudget: preset.terrainBudget,
      pointsLimit:   preset.pointsLimit,
      units: allUnits,
      terrain: resolvedSize === 'incursion' ? window.buildDefaultTerrain() : {},
      terrainOwner: {},
      terrainDone: { guard: false, eldar: false }, // BUG-40K-PREGAME item 1: simultaneous placement, not turn-alternating
      undeployedGroups,
      startingStrength,
      lastTurnReplay: null,
    };

    await window.db.ref('games/' + gameId).set(doc);

    localStorage.setItem(`w40k_faction_${gameId}`, mySlot);
    localStorage.setItem(`w40k_token_${gameId}`, token);
    if (devMode) localStorage.setItem(`w40k_dev_${gameId}`, '1');

    return { gameId, faction: mySlot, factionName: myFactionName, token };
  }

  async function joinGame(gameId, playerName, rosterId) {
    const ref = window.db.ref('games/' + gameId);
    const snap = await ref.once('value');

    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.val();
    if (game.status !== 'waiting') throw new Error('This game has already started.');

    // BUG-40K-PREGAME items 2+3: `faction` here is the open POSITIONAL
    // slot, not an army choice — the joiner's actual army comes from
    // their own roster's meta, same as createGame. Can be the same army
    // the creator picked; nothing here assumes otherwise.
    const faction = game.players.guard.joined ? 'eldar' : 'guard';
    const token   = generateToken();

    const roster = await window.RosterLoader.fetchRoster(rosterId);
    const myFactionId   = roster.meta.factionId;
    const myFactionName = roster.meta.factionName || myFactionId;
    await window.RosterLoader.loadFactionData(myFactionId);
    const myUnits = window.RosterLoader.buildUnitsFromRoster(roster, faction, game.boardHeight || 60);

    const unitsUpdate   = {};
    const groupIds      = [];
    const ssUpdate      = {};

    Object.entries(myUnits).forEach(([id, u]) => {
      unitsUpdate[`units/${id}`] = u;
      if (!groupIds.includes(u.unitGroup)) groupIds.push(u.unitGroup);
      if (!ssUpdate[u.unitGroup]) ssUpdate[u.unitGroup] = { models: 0, wounds: 0 };
      ssUpdate[u.unitGroup].models += 1;
      ssUpdate[u.unitGroup].wounds += u.maxWounds;
    });

    const existingSS = game.startingStrength || {};
    const mergedSS   = { ...existingSS, ...ssUpdate };

    await ref.update({
      status: 'active',
      [`players/${faction}/name`]:        playerName,
      [`players/${faction}/token`]:       token,
      [`players/${faction}/joined`]:      true,
      [`players/${faction}/rosterId`]:    rosterId,
      [`players/${faction}/factionId`]:   myFactionId,
      [`players/${faction}/factionName`]: myFactionName,
      [`undeployedGroups/${faction}`]: groupIds.length > 0 ? groupIds : null,
      startingStrength: mergedSS,
      ...unitsUpdate,
    });

    localStorage.setItem(`w40k_faction_${gameId}`, faction);
    localStorage.setItem(`w40k_token_${gameId}`, token);

    return { faction, token };
  }

  function subscribeToGame(gameId, callback) {
    const ref = window.db.ref('games/' + gameId);
    const handler = snap => callback(snap.exists() ? snap.val() : null);
    ref.on('value', handler);
    return () => ref.off('value', handler);
  }

  function getLocalFaction(gameId) {
    return localStorage.getItem(`w40k_faction_${gameId}`);
  }

  function setLocalFaction(gameId, faction) {
    localStorage.setItem(`w40k_faction_${gameId}`, faction);
  }

  function isDevSession(gameId) {
    return localStorage.getItem(`w40k_dev_${gameId}`) === '1';
  }

  const PHASES = ['command', 'movement', 'shooting', 'charge', 'fight', 'morale'];

  // positions: { [unitId]: { x, y } } — all models in the confirmed unit group
  async function confirmUnitMove(gameId, positions) {
    const update = {};
    Object.entries(positions).forEach(([unitId, pos]) => {
      update[`units/${unitId}/x`]             = pos.x;
      update[`units/${unitId}/y`]             = pos.y;
      update[`units/${unitId}/movedThisTurn`] = true;
    });
    await window.db.ref('games/' + gameId).update(update);
  }

  async function advancePhase(gameId, currentTurn) {
    const idx = PHASES.indexOf(currentTurn.phase);
    let next;

    if (idx < PHASES.length - 1) {
      next = { ...currentTurn, phase: PHASES[idx + 1] };
    } else if (currentTurn.activePlayer === 'guard') {
      next = { ...currentTurn, phase: 'command', activePlayer: 'eldar' };
    } else {
      next = { number: currentTurn.number + 1, activePlayer: 'guard', phase: 'command' };
    }

    // Battle-shock step runs at the start of every Command Phase.
    // Roll 2D6 vs Ld for each of the active player's groups that are below half starting strength.
    if (next.phase === 'command') {
      const [unitsSnap, ssSnap] = await Promise.all([
        window.db.ref('games/' + gameId + '/units').once('value'),
        window.db.ref('games/' + gameId + '/startingStrength').once('value')
      ]);
      const allUnits = unitsSnap.val() || {};
      const ss       = ssSnap.val() || {};

      const myGroups = [...new Set(
        Object.values(allUnits)
          .filter(u => u.faction === next.activePlayer)
          .map(u => u.unitGroup)
      )];

      const bsLog       = {};
      const shockUpdate = {};

      // Clear any battleShocked flags from this faction's previous Command Phase
      myGroups.forEach(gId => { shockUpdate[`battleShocked/${gId}`] = null; });

      myGroups.forEach(gId => {
        const groupUnits  = Object.values(allUnits).filter(u => u.unitGroup === gId && u.alive);
        const startModels = ss[gId]?.models;
        if (!startModels || groupUnits.length === 0) return;

        // Strictly less than half — at exactly half a unit is NOT below half-strength
        if (groupUnits.length < startModels / 2) {
          // Use highest Ld in the group (10th ed: unit uses its own Ld characteristic; sergeant leads)
          const maxLd = Math.max(...groupUnits.map(u => {
            const def = (window.getRosterUnitDef && u.factionId)
              ? window.getRosterUnitDef(u.factionId, u.unitId) : null;
            if (def && def.stats && def.stats.LD) return parseInt(def.stats.LD) || 7;
            return (window.UNIT_STATS || {})[u.type]?.ld || 7;
          }));
          const d1    = Math.floor(Math.random() * 6) + 1;
          const d2    = Math.floor(Math.random() * 6) + 1;
          const total = d1 + d2;
          const passed = total >= maxLd;
          bsLog[gId] = { d1, d2, total, ld: maxLd, passed };
          if (!passed) shockUpdate[`battleShocked/${gId}`] = true;
        }
      });

      const update = {
        turn: { ...next, battleShockLog: Object.keys(bsLog).length > 0 ? bsLog : null },
        ...shockUpdate
      };
      await window.db.ref('games/' + gameId).update(update);
      return;
    }

    // Fight phase: compute which groups are in engagement range and build the fight queue.
    // Both players fight, so reset foughtThisTurn for all models (not just activePlayer).
    if (next.phase === 'fight') {
      const snap = await window.db.ref('games/' + gameId + '/units').once('value');
      const allUnits = snap.val() || {};

      const groupInfo = {};
      Object.values(allUnits).forEach(u => {
        if (!groupInfo[u.unitGroup]) groupInfo[u.unitGroup] = { faction: u.faction, charged: false };
        if (u.chargedThisTurn) groupInfo[u.unitGroup].charged = true;
      });

      const eligibleGroups = Object.keys(groupInfo).filter(gId => {
        const myFac  = groupInfo[gId].faction;
        const mine   = Object.values(allUnits).filter(u => u.unitGroup === gId && u.alive);
        const theirs = Object.values(allUnits).filter(u => u.faction !== myFac && u.alive);
        return mine.some(m => theirs.some(e => {
          const r1 = ((window.UNIT_STATS || {})[m.type] || {}).baseRadius || 0.5;
          const r2 = ((window.UNIT_STATS || {})[e.type] || {}).baseRadius || 0.5;
          return Math.hypot(m.x - e.x, m.y - e.y) <= 1 + r1 + r2;
        }));
      });

      // Charged groups fight first; rest follow
      const charged    = eligibleGroups.filter(gId =>  groupInfo[gId].charged);
      const nonCharged = eligibleGroups.filter(gId => !groupInfo[gId].charged);
      const fightQueue = [...charged, ...nonCharged].map(gId => ({ groupId: gId, faction: groupInfo[gId].faction }));

      const update = { turn: { ...next, fightQueue: fightQueue.length > 0 ? fightQueue : null } };
      Object.keys(allUnits).forEach(unitId => { update[`units/${unitId}/foughtThisTurn`] = false; });
      await window.db.ref('games/' + gameId).update(update);
      return;
    }

    // movement: reset movedThisTurn; shooting: reset shotThisTurn; charge: reset chargedThisTurn
    const PHASE_FLAGS = { movement: 'movedThisTurn', shooting: 'shotThisTurn', charge: 'chargedThisTurn' };
    if (PHASE_FLAGS[next.phase]) {
      const flag  = PHASE_FLAGS[next.phase];
      const snap  = await window.db.ref('games/' + gameId + '/units').once('value');
      const units = snap.val() || {};
      const update = { turn: next };
      Object.entries(units).forEach(([unitId, unit]) => {
        if (unit.faction === next.activePlayer) update[`units/${unitId}/${flag}`] = false;
      });
      await window.db.ref('games/' + gameId).update(update);
    } else {
      await window.db.ref('games/' + gameId + '/turn').set(next);
    }
  }

  // Successful charge: write final positions and mark chargedThisTurn for the charging group.
  async function confirmCharge(gameId, chargerGroupId, positions) {
    const update = {};
    Object.entries(positions).forEach(([unitId, pos]) => {
      update[`units/${unitId}/x`]              = pos.x;
      update[`units/${unitId}/y`]              = pos.y;
      update[`units/${unitId}/chargedThisTurn`] = true;
    });
    await window.db.ref('games/' + gameId).update(update);
  }

  // Failed charge: mark chargedThisTurn so the unit can't try again (no position change).
  async function failCharge(gameId, chargerGroupId, currentUnits) {
    const update = {};
    Object.values(currentUnits)
      .filter(u => u.unitGroup === chargerGroupId)
      .forEach(u => { update[`units/${u.id}/chargedThisTurn`] = true; });
    await window.db.ref('games/' + gameId).update(update);
  }

  // Resolve a melee fight: write dice results, foughtThisTurn, deferred casualties, pop fightQueue.
  // currentFightQueue: the normalized array read from game.turn.fightQueue.
  async function confirmMeleeAttack(gameId, fighterIds, casualties, deferred, clearPendingGroup, currentFightQueue, currentUnits, meleeEntry) {
    const update = {};
    if (meleeEntry) {
      const logKey = window.db.ref().push().key;
      update[`turn/shotLog/${logKey}`] = meleeEntry;
    }
    fighterIds.forEach(id => { update[`units/${id}/foughtThisTurn`] = true; });
    Object.entries(casualties).forEach(([id, c]) => {
      update[`units/${id}/wounds`] = c.woundsLeft;
      update[`units/${id}/alive`]  = c.alive;
    });
    if (clearPendingGroup) update[`pendingCasualties/${clearPendingGroup}`] = null;
    if (deferred) {
      for (const [groupId, count] of Object.entries(deferred)) {
        const snap     = await window.db.ref(`games/${gameId}/pendingCasualties/${groupId}`).once('value');
        const existing = snap.val() || 0;
        update[`pendingCasualties/${groupId}`] = existing + count;
      }
    }
    // Pop front of fight queue
    const remaining = (currentFightQueue || []).slice(1);
    update['turn/fightQueue'] = remaining.length > 0 ? remaining : null;
    // Annihilation check (same logic as confirmUnitShoot)
    const immediateDead = Object.keys(casualties).filter(id => !casualties[id].alive);
    if (currentUnits && immediateDead.length > 0) {
      const merged = { ...currentUnits };
      Object.entries(casualties).forEach(([id, c]) => { merged[id] = { ...merged[id], wounds: c.woundsLeft, alive: c.alive }; });
      const alive = { guard: 0, eldar: 0 };
      Object.values(merged).forEach(u => { if (u.alive) alive[u.faction]++; });
      if (alive.guard === 0 || alive.eldar === 0) {
        const deadFac = (currentUnits[fighterIds[0]] || {}).faction;
        const winner = (alive.guard === 0 && alive.eldar === 0) ? (deadFac === 'guard' ? 'eldar' : 'guard')
                     : (alive.guard === 0 ? 'eldar' : 'guard');
        update['gameOver'] = { winner, reason: 'annihilation' };
      }
    }
    await window.db.ref('games/' + gameId).update(update);
  }

  // shooterIds: array of unit IDs in the shooting group
  // casualties: { [unitId]: { woundsLeft, alive } } from Shooting.resolveAttacks
  // shotEntry: { shooterGroup, targetGroup, rolls, summary } — appended to turn/shotLog
  // currentUnits: snapshot of all units at the time of confirmation (avoids extra read)
  // deferred: { [groupId]: N } | null — add N to pendingCasualties for group (partial hit, no immediate removal)
  // clearPendingGroup: string | null — set pendingCasualties/[groupId] to null (wipe clears prior pending)
  async function confirmUnitShoot(gameId, shooterIds, casualties, shotEntry, currentUnits, deferred, clearPendingGroup) {
    const update = {};
    if (shotEntry) {
      const logKey = window.db.ref().push().key;
      update[`turn/shotLog/${logKey}`] = shotEntry;
    }
    shooterIds.forEach(id => { update[`units/${id}/shotThisTurn`] = true; });
    Object.entries(casualties).forEach(([id, c]) => {
      update[`units/${id}/wounds`] = c.woundsLeft;
      update[`units/${id}/alive`]  = c.alive;
    });

    if (clearPendingGroup) {
      update[`pendingCasualties/${clearPendingGroup}`] = null;
    }
    if (deferred) {
      for (const [groupId, count] of Object.entries(deferred)) {
        const snap     = await window.db.ref(`games/${gameId}/pendingCasualties/${groupId}`).once('value');
        const existing = snap.val() || 0;
        update[`pendingCasualties/${groupId}`] = existing + count;
      }
    }

    // Annihilation check: only on immediate deaths (deferred casualties don't count yet)
    const immediateDead = Object.keys(casualties).filter(id => !casualties[id].alive);
    if (currentUnits && immediateDead.length > 0) {
      const merged = { ...currentUnits };
      Object.entries(casualties).forEach(([id, c]) => {
        merged[id] = { ...merged[id], wounds: c.woundsLeft, alive: c.alive };
      });
      const alive = { guard: 0, eldar: 0 };
      Object.values(merged).forEach(u => { if (u.alive) alive[u.faction]++; });
      if (alive.guard === 0 || alive.eldar === 0) {
        let winner;
        if (alive.guard === 0 && alive.eldar === 0) {
          winner = (merged[shooterIds[0]] || {}).faction || 'guard';
        } else {
          winner = alive.guard === 0 ? 'eldar' : 'guard';
        }
        update['gameOver'] = { winner, reason: 'annihilation' };
      }
    }

    await window.db.ref('games/' + gameId).update(update);
  }

  // groupId: the unit group being allocated
  // deadUnitIds: model IDs the defender selected for removal
  // currentUnits: snapshot of all units before allocation
  async function allocateCasualties(gameId, groupId, deadUnitIds, currentUnits) {
    const update = {};
    deadUnitIds.forEach(id => {
      update[`units/${id}/alive`]  = false;
      update[`units/${id}/wounds`] = 0;
    });
    update[`pendingCasualties/${groupId}`] = null;

    if (currentUnits && deadUnitIds.length > 0) {
      const merged = { ...currentUnits };
      deadUnitIds.forEach(id => { merged[id] = { ...merged[id], wounds: 0, alive: false }; });
      const alive = { guard: 0, eldar: 0 };
      Object.values(merged).forEach(u => { if (u.alive) alive[u.faction]++; });
      if (alive.guard === 0 || alive.eldar === 0) {
        const deadFaction = (currentUnits[deadUnitIds[0]] || {}).faction;
        let winner;
        if (alive.guard === 0 && alive.eldar === 0) {
          winner = deadFaction === 'guard' ? 'eldar' : 'guard';
        } else {
          winner = alive.guard === 0 ? 'eldar' : 'guard';
        }
        update['gameOver'] = { winner, reason: 'annihilation' };
      }
    }

    await window.db.ref('games/' + gameId).update(update);
  }

  async function rollInitiative(gameId, faction, roll) {
    await window.db.ref('games/' + gameId + '/initiative/' + faction + 'Roll').set(roll);
  }

  async function clearInitiativeRolls(gameId) {
    await window.db.ref('games/' + gameId + '/initiative').update({ guardRoll: null, eldarRoll: null });
  }

  async function chooseInitiative(gameId, chosenFaction) {
    await window.db.ref('games/' + gameId).update({
      'turn/phase':        'command',
      'turn/activePlayer': chosenFaction,
      'initiative':        null
    });
  }

  // Paint or erase terrain squares. Both maps written atomically so terrain/terrainOwner never desync.
  // paints: [{ x, y, tier }] — squares to set (or repaint with new tier)
  // erases: [{ x, y }]       — squares to remove
  // Both players can call this at any time during the terrain phase —
  // BUG-40K-PREGAME item 1 replaced turn-alternation with simultaneous
  // placement; board.js already gated painting by budget/enemyOwned per
  // faction, not by turn, so no change needed there.
  async function writeTerrain(gameId, paints, erases, faction) {
    const update = {};
    paints.forEach(({ x, y, tier }) => {
      update[`terrain/${x},${y}`]      = tier;
      update[`terrainOwner/${x},${y}`] = faction;
    });
    erases.forEach(({ x, y }) => {
      update[`terrain/${x},${y}`]      = null;
      update[`terrainOwner/${x},${y}`] = null;
    });
    if (Object.keys(update).length) {
      await window.db.ref('games/' + gameId).update(update);
    }
  }

  // BUG-40K-PREGAME item 1: replaces passTerrainTurn's alternating hand-off
  // (the source of the "endless pass-turn cycle" bug — whichever player
  // still had budget left after the other reached 0 had no way to end the
  // phase except by manually re-passing back and forth). A player confirms
  // done at any time, regardless of remaining budget; phase advances to
  // deployment once BOTH have confirmed. Read-then-write (not atomic) —
  // consistent with this app's existing no-auth, open-rules trust model;
  // a genuine simultaneous double-click race here just means both writes
  // land and the second one's "both done" check also passes, same result.
  async function confirmTerrainDone(gameId, faction) {
    const snap = await window.db.ref(`games/${gameId}/terrainDone`).once('value');
    const done = { ...(snap.val() || {}), [faction]: true };
    const update = { [`terrainDone/${faction}`]: true };
    if (done.guard && done.eldar) {
      update['turn/phase']        = 'deployment';
      update['turn/activePlayer'] = 'guard';
    }
    await window.db.ref('games/' + gameId).update(update);
  }

  // Deploys one unit group: writes final model positions, removes group from the queue,
  // then either passes to the other player or ends the phase (transition to initiative).
  async function deployGroup(gameId, faction, groupId, unitPositions, nextPlayer) {
    const snap = await window.db.ref(`games/${gameId}/undeployedGroups/${faction}`).once('value');
    const raw  = snap.val();
    const current   = Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []);
    const remaining = current.filter(g => g !== groupId);

    const update = {};
    Object.entries(unitPositions).forEach(([unitId, pos]) => {
      update[`units/${unitId}/x`] = pos.x;
      update[`units/${unitId}/y`] = pos.y;
    });
    if (nextPlayer) {
      update[`undeployedGroups/${faction}`] = remaining.length > 0 ? remaining : null;
      update['turn/activePlayer'] = nextPlayer;
    } else {
      update['undeployedGroups'] = null;
      update['turn/phase']    = 'initiative';
      update['initiative']    = { guardRoll: null, eldarRoll: null };
    }
    await window.db.ref('games/' + gameId).update(update);
  }

  // Skip deployment turn — active player has nothing left to place.
  async function passDeploymentTurn(gameId, nextPlayer) {
    const update = {};
    if (nextPlayer) {
      update['turn/activePlayer'] = nextPlayer;
    } else {
      update['turn/phase']    = 'initiative';
      update['initiative']    = { guardRoll: null, eldarRoll: null };
      update['undeployedGroups'] = null;
    }
    await window.db.ref('games/' + gameId).update(update);
  }

  async function devApplyPreset(gameId, update) {
    await window.db.ref('games/' + gameId).update(update);
  }

  return { createGame, joinGame, subscribeToGame, getLocalFaction, setLocalFaction, isDevSession, advancePhase, confirmUnitMove, confirmUnitShoot, allocateCasualties, rollInitiative, clearInitiativeRolls, chooseInitiative, writeTerrain, confirmTerrainDone, deployGroup, passDeploymentTurn, confirmCharge, failCharge, confirmMeleeAttack, devApplyPreset };
})();
