window.Game = (() => {
  let unsubscribe   = null;
  let currentGameId = null;
  let localFaction  = null;

  // Movement phase client-side state
  // null | { mode: 'queue' } | { mode: 'active', groupId, snapshots, pending }
  let moveState = null;

  // Shooting phase client-side state
  // null | { mode: 'queue' }
  //      | { mode: 'targeting', groupId, validTargets: [{groupId, cover}] }
  //      | { mode: 'resolved',  groupId, targetGroupId, cover, result }
  let shootState = null;

  // Unit card panel state (client-only)
  let cardState = { expanded: null, highlighted: null };

  // Last-seen shot log key — used to detect new shots for tracer animation
  let lastShotKey = null;

  // Prevents double-write when both clients detect an initiative tie simultaneously
  let tieRerollPending = false;

  // Casualty allocation client state (Command Phase, deferred wounds)
  let allocationState = null; // null | { groupId, selected: Set<unitId> }

  // Terrain placement client state (terrain phase)
  let terrainState   = null;  // null | { tier: 'rough' | 'chestHigh' | 'tall' }
  let terrainPlacing = false; // debounce: prevents double-fire while Firebase write is in flight

  // Deployment phase client state
  let deployPlacing = false;  // debounce: prevents double-fire while Firebase write is in flight

  // Cache of unitGroup → human label, populated from u.label during render()
  let groupLabelCache = {};

  // Charge phase client state
  // null | { mode: 'queue' }
  //      | { mode: 'targeting', groupId, chargeTargets: [{groupId, minGap}] }
  //      | { mode: 'rolled', groupId, targetGroupId, d1, d2, roll, minGap, success }
  //      | { mode: 'moving', groupId, targetGroupId, roll, snapshots, pending }
  let chargeState = null;

  // Fight phase client state
  // null | { mode: 'queue' } | { mode: 'resolved', groupId, targetGroupId, estimate }
  let fightState = null;

  // ---- Dev quick-start presets ----
  const DEV_PRESETS = (() => {
    // Known unit IDs and positions from buildInitialUnits()
    const G_INIT = [
      ['guard_0',11,5],['guard_1',14,5],['guard_2',17,5],['guard_3',20,5],['guard_4',23,5],
      ['guard_5',12.5,8.5],['guard_6',15.5,8.5],['guard_7',18.5,8.5],['guard_8',21.5,8.5],['guard_9',24.5,8.5],
      ['guard_sgt',27,5]
    ];
    const E_INIT = [
      ['eldar_0',17,55],['eldar_1',20,55],['eldar_2',23,55],['eldar_3',26,55],['eldar_4',29,55],
      ['eldar_5',18.5,51.5],['eldar_6',21.5,51.5],['eldar_7',24.5,51.5],['eldar_8',27.5,51.5],['eldar_9',30.5,51.5]
    ];
    // Mid-board engagement: Guard below their terrain, Eldar above theirs
    const G_ENG = [
      ['guard_0',15,24],['guard_1',18,24],['guard_2',21,24],['guard_3',24,24],['guard_4',27,24],
      ['guard_5',15,27],['guard_6',18,27],['guard_7',21,27],['guard_8',24,27],['guard_9',27,27],
      ['guard_sgt',21,22]
    ];
    const E_ENG = [
      ['eldar_0',15,44],['eldar_1',18,44],['eldar_2',21,44],['eldar_3',24,44],['eldar_4',27,44],
      ['eldar_5',15,47],['eldar_6',18,47],['eldar_7',21,47],['eldar_8',24,47],['eldar_9',27,47]
    ];
    const ALL_G = G_INIT.map(([id]) => id);
    const ALL_E = E_INIT.map(([id]) => id);

    function uField(id, x, y, alive) {
      return {
        [`units/${id}/x`]: x,                [`units/${id}/y`]: y,
        [`units/${id}/alive`]: alive,         [`units/${id}/wounds`]: alive ? 1 : 0,
        [`units/${id}/movedThisTurn`]: false,  [`units/${id}/shotThisTurn`]: false,
        [`units/${id}/chargedThisTurn`]: false, [`units/${id}/foughtThisTurn`]: false,
      };
    }
    function posUpdate(positions, aliveIds) {
      const alive = new Set(aliveIds);
      return positions.reduce((acc, [id, x, y]) => Object.assign(acc, uField(id, x, y, alive.has(id))), {});
    }
    const tn = (n, p, ph) => ({ 'turn/number': n, 'turn/activePlayer': p, 'turn/phase': ph, 'turn/shotLog': null, 'pendingCasualties': null, 'terrain': window.DEFAULT_TERRAIN, 'terrainOwner': null });

    return [
      {
        key: 'fresh',
        label: 'T1 · Fresh',
        desc: 'Turn 1, Command Phase — both squads at deployment, full strength',
        update() { return { ...tn(1,'guard','command'), ...posUpdate(G_INIT,ALL_G), ...posUpdate(E_INIT,ALL_E) }; }
      },
      {
        key: 'engaged',
        label: 'T2 · Engaged',
        desc: 'Turn 2, Shooting Phase — mid-board, full strength, models in range',
        update() { return { ...tn(2,'guard','shooting'), ...posUpdate(G_ENG,ALL_G), ...posUpdate(E_ENG,ALL_E) }; }
      },
      {
        key: 'half',
        label: 'T2 · Half Str',
        desc: 'Turn 2, Shooting Phase — Guard 6/11, Eldar 5/10, mid-board',
        update() {
          return {
            ...tn(2,'guard','shooting'),
            ...posUpdate(G_ENG, ['guard_0','guard_1','guard_2','guard_3','guard_4','guard_sgt']),
            ...posUpdate(E_ENG, ['eldar_0','eldar_1','eldar_2','eldar_3','eldar_4'])
          };
        }
      },
      {
        key: 'charge',
        label: 'T2 · Charge',
        desc: 'Turn 2, Charge Phase — units ~5" apart in open center, ready to charge',
        update() {
          const G_CH = [
            ['guard_0',15,26],['guard_1',18,26],['guard_2',21,26],['guard_3',24,26],['guard_4',27,26],
            ['guard_5',15,29],['guard_6',18,29],['guard_7',21,29],['guard_8',24,29],['guard_9',27,29],
            ['guard_sgt',21,24]
          ];
          const E_CH = [
            ['eldar_0',15,31],['eldar_1',18,31],['eldar_2',21,31],['eldar_3',24,31],['eldar_4',27,31],
            ['eldar_5',15,34],['eldar_6',18,34],['eldar_7',21,34],['eldar_8',24,34],['eldar_9',27,34]
          ];
          return {
            ...tn(2,'guard','charge'),
            ...posUpdate(G_CH, G_CH.map(([id]) => id)),
            ...posUpdate(E_CH, E_CH.map(([id]) => id))
          };
        }
      },
      {
        key: 'laststand',
        label: 'T3 · Last Stand',
        desc: 'Turn 3, Shooting Phase — Guard 2/11, Eldar 1/10, near center',
        update() {
          const survG = [['guard_0',18,32],['guard_sgt',22,32]];
          const survE = [['eldar_0',20,36]];
          const deadG = G_ENG.filter(([id]) => id !== 'guard_0' && id !== 'guard_sgt');
          const deadE = E_ENG.filter(([id]) => id !== 'eldar_0');
          return {
            ...tn(3,'guard','shooting'),
            ...posUpdate(survG, ['guard_0','guard_sgt']),
            ...posUpdate(deadG, []),
            ...posUpdate(survE, ['eldar_0']),
            ...posUpdate(deadE, []),
          };
        }
      },
    ];
  })();

  const PHASE_LABELS = {
    command:  'Command Phase',
    movement: 'Movement Phase',
    shooting: 'Shooting Phase',
    charge:   'Charge Phase',
    fight:    'Fight Phase',
    morale:   'Morale Phase'
  };

  const PHASE_INSTRUCTIONS = {
    command:  'Each player gains 1 Command Point. (Orders/stratagems are Phase 3 — CP is tracked only.)',
    movement: 'Select a unit to move.',
    shooting: 'Each unit may shoot at one enemy unit within range and line of sight.',
    charge:   'Declare charges against enemy units within 12". Roll 2d6 — must meet or beat distance.',
    fight:    'Units in Engagement Range (1") fight. Attacker hits first, then defender.',
    morale:   'Units that lost models this turn take a Morale test: roll d6, add losses, compare to Ld.'
  };

  async function init(gameId, faction) {
    currentGameId = gameId;
    localFaction  = faction;
    moveState         = null;
    shootState        = null;
    cardState         = { expanded: null, highlighted: null };
    lastShotKey       = null;
    tieRerollPending  = false;
    allocationState   = null;
    terrainState      = null;
    terrainPlacing    = false;
    deployPlacing     = false;
    chargeState       = null;
    fightState        = null;
    groupLabelCache   = {};
    showScreen('game');

    // Pre-load faction gameData so unit cards and attack pipeline have stats immediately
    try {
      const snap    = await window.db.ref('games/' + gameId + '/players').once('value');
      const players = snap.val() || {};
      await Promise.all(
        Object.keys(players).map(fac => {
          const factionId = window.RosterLoader.FACTION_MAP[fac];
          return factionId ? window.RosterLoader.loadFactionData(factionId) : Promise.resolve();
        })
      );
    } catch (_) {}

    if (unsubscribe) unsubscribe();
    unsubscribe = window.GameState.subscribeToGame(gameId, game => {
      if (game) render(game);
    });
  }

  // ---- Movement phase helpers ----

  // All distinct unit groups for the active faction that haven't moved yet
  function unmovedeGroups(units, faction) {
    const seen = new Set();
    const groups = [];
    Object.values(units).forEach(u => {
      if (u.faction !== faction || u.movedThisTurn || !u.alive) return;
      if (!seen.has(u.unitGroup)) {
        seen.add(u.unitGroup);
        groups.push(u.unitGroup);
      }
    });
    return groups;
  }

  // W40K-UX2 item 3: groups the active player has already moved this
  // Movement phase — the undo candidates. Mirrors unmovedeGroups' shape
  // (inverted condition) rather than deriving one from the other, since
  // "moved" here means "every alive model in the group has movedThisTurn"
  // (a group can't be half-moved — confirmUnitMove writes the flag for
  // every model in the positions map at once).
  function movedGroups(units, faction) {
    const seen = new Set();
    const groups = [];
    Object.values(units).forEach(u => {
      if (u.faction !== faction || !u.movedThisTurn || !u.alive) return;
      if (!seen.has(u.unitGroup)) {
        seen.add(u.unitGroup);
        groups.push(u.unitGroup);
      }
    });
    return groups;
  }

  // MOBILE-1-40K item 1b: at phone size, side panels are hidden by default
  // (see styles.css's mobile breakpoint) — these toggle buttons open one
  // as an overlay drawer instead of permanently eating board width. Shared
  // across all three phase renderers (terrain/deployment/main turn loop)
  // rather than each building its own — same toggle behavior everywhere.
  function mobilePanelTogglesHTML() {
    return `
      <span class="mobile-panel-toggles">
        <button class="mobile-panel-toggle-btn" data-toggle-panel="left"  title="Show left panel">&#8249;</button>
        <button class="mobile-panel-toggle-btn" data-toggle-panel="right" title="Show right panel">&#8250;</button>
      </span>`;
  }

  function bindMobilePanelToggles() {
    document.querySelectorAll('[data-toggle-panel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = document.querySelector(`.side-panel-${btn.dataset.togglePanel}`);
        if (panel) panel.classList.toggle('mobile-panel-open');
      });
    });
  }

  // Human-readable label for a unit group
  function groupLabel(groupId) {
    if (groupLabelCache[groupId]) return groupLabelCache[groupId];
    if (groupId === 'guard_squad') return 'Infantry Squad';
    if (groupId === 'eldar_squad') return 'Guardian Defenders';
    return groupId;
  }

  // W40K-UX1 item 2: turns a structured actionLog record into English —
  // the only place that does, per KT-3 item 4's same reasoning (grows into
  // replay/catch-up later without touching every write site). Unknown
  // record types render as null rather than guessing a sentence for a
  // shape this function hasn't been taught yet.
  function describeActionLogEntry(entry) {
    if (entry.type === 'deploy') {
      return `${entry.playerName || 'Someone'} deploys ${entry.unitLabel || 'a unit'}`;
    }
    return null;
  }

  function actionLogHTML(actionLog) {
    const entries = Object.values(actionLog || {})
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      .map(describeActionLogEntry)
      .filter(Boolean);
    if (!entries.length) return `<div class="side-panel-empty">No actions yet</div>`;
    return `<div class="log-panel-list">${entries.map(line =>
      `<div class="log-panel-line">${escHtml(line)}</div>`
    ).reverse().join('')}</div>`;
  }

  function activateGroup(groupId, units) {
    const snapshots = {};
    Object.values(units).forEach(u => {
      if (u.unitGroup === groupId && u.alive) {
        snapshots[u.id] = { x: u.x, y: u.y };
      }
    });
    moveState = { mode: 'active', groupId, snapshots, pending: {} };
  }

  // ---- Shooting phase helpers ----

  function unShotGroups(units, faction) {
    const seen = new Set();
    const groups = [];
    Object.values(units).forEach(u => {
      if (u.faction !== faction || u.shotThisTurn || !u.alive) return;
      if (!seen.has(u.unitGroup)) { seen.add(u.unitGroup); groups.push(u.unitGroup); }
    });
    return groups;
  }

  function activateShooterGroup(groupId, units, terrain) {
    const validTargets = window.Shooting.findValidTargets(groupId, units, terrain);
    shootState = { mode: 'targeting', groupId, validTargets };
  }

  function buildShootBoardOpts(game) {
    if (!shootState || shootState.mode === 'queue') return {};
    const validTargetGroups = new Set((shootState.validTargets || []).map(t => t.groupId));
    return {
      shooterGroup:      shootState.groupId,
      validTargetGroups,
      selectedTargetGroup: shootState.mode === 'resolved' ? shootState.targetGroupId : null,
      onTargetSelected: (groupId) => {
        if (shootState.mode !== 'targeting') return;
        const tgt = shootState.validTargets.find(t => t.groupId === groupId);
        if (!tgt) return;
        const estimate = window.Shooting.estimateAttacks(
          shootState.groupId, game.units, groupId, tgt.cover, game.terrain || {}
        );
        shootState = { mode: 'resolved', groupId: shootState.groupId, targetGroupId: groupId, cover: tgt.cover, estimate };
        renderBoard(game, buildShootBoardOpts(game));
        rerenderShootBar(game, game.units, game.turn,
          window.GameState.isDevSession(currentGameId),
          window.GameState.isDevSession(currentGameId) || localFaction === game.turn.activePlayer);
      }
    };
  }

  function buildChargeBoardOpts(game) {
    if (!chargeState || chargeState.mode === 'queue') return {};
    if (chargeState.mode === 'targeting') {
      const validTargetGroups = new Set((chargeState.chargeTargets || []).map(ct => ct.groupId));
      if (validTargetGroups.size === 0) return {};
      return {
        validTargetGroups,
        onTargetSelected: (targetGroupId) => {
          if (chargeState.mode !== 'targeting') return;
          const ct = (chargeState.chargeTargets || []).find(c => c.groupId === targetGroupId);
          if (!ct) return;
          const d1 = Math.ceil(Math.random() * 6);
          const d2 = Math.ceil(Math.random() * 6);
          const roll = d1 + d2;
          const success = roll >= Math.max(0, ct.minGap - 1);
          const snapshots = {};
          const pending = {};
          Object.values(game.units || {}).forEach(u => {
            if (u.unitGroup === chargeState.groupId && u.alive) snapshots[u.id] = { x: u.x, y: u.y };
          });
          chargeState = { mode: 'rolled', groupId: chargeState.groupId, targetGroupId, d1, d2, roll, minGap: ct.minGap, success, snapshots, pending };
          renderBoard(game, buildChargeBoardOpts(game));
          rerenderChargeBar(game, game.units, game.turn,
            window.GameState.isDevSession(currentGameId),
            window.GameState.isDevSession(currentGameId) || localFaction === game.turn.activePlayer);
        }
      };
    }
    if (chargeState.mode === 'rolled' && chargeState.success) {
      return {
        activeGroup:     chargeState.groupId,
        snapshots:       chargeState.snapshots || {},
        pending:         chargeState.pending   || {},
        moveMaxOverride: chargeState.roll,
        onModelMoved: (unitId, x, y) => {
          if (!chargeState.pending) chargeState.pending = {};
          chargeState.pending[unitId] = { x, y };
          renderBoard(game);
        }
      };
    }
    return {};
  }

  // ---- Charge phase helpers ----

  // Groups belonging to faction that haven't declared a charge yet this phase
  function unchargedGroups(units, faction) {
    const seen = new Set();
    const groups = [];
    Object.values(units).forEach(u => {
      if (u.faction !== faction || u.chargedThisTurn || !u.alive) return;
      if (!seen.has(u.unitGroup)) { seen.add(u.unitGroup); groups.push(u.unitGroup); }
    });
    return groups;
  }

  // ---- Fight phase helpers ----

  // Normalize Firebase array/object → JS array
  function normalizeFightQueue(fq) {
    if (!fq) return [];
    return Array.isArray(fq) ? fq : Object.values(fq);
  }

  // ---- Shot log & dice helpers ----

  // Firebase push-keys are lexicographically time-ordered — sort gives chronological order
  function getShotLogEntries(shotLog) {
    if (!shotLog) return [];
    return Object.keys(shotLog).sort().map(k => shotLog[k]);
  }

  // Returns an inline SVG string of a d6 pip face (size × size px)
  function dieFaceSVG(value, size) {
    size = size || 16;
    const PIP_LAYOUTS = {
      1: [[0.5, 0.5]],
      2: [[0.28, 0.28], [0.72, 0.72]],
      3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
      4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
      5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
      6: [[0.28, 0.2], [0.72, 0.2], [0.28, 0.5], [0.72, 0.5], [0.28, 0.8], [0.72, 0.8]]
    };
    const r    = (size * 0.09).toFixed(1);
    const pips = (PIP_LAYOUTS[value] || PIP_LAYOUTS[1]).map(([x, y]) =>
      `<circle cx="${(x*size).toFixed(1)}" cy="${(y*size).toFixed(1)}" r="${r}" fill="currentColor"/>`
    ).join('');
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" `+
           `style="display:inline-block;vertical-align:middle;background:var(--bg);`+
           `border:1px solid var(--border);border-radius:2px;margin:0 1px;`+
           `color:var(--text)" aria-label="${value}">${pips}</svg>`;
  }

  // ---- Panel HTML builders ----

  function unitCardsHTML(units, faction) {
    const groups = {};
    Object.values(units).forEach(u => {
      if (u.faction !== faction) return;
      if (!groups[u.unitGroup]) {
        groups[u.unitGroup] = { type: u.type, factionId: u.factionId, unitId: u.unitId, alive: 0, total: 0 };
      }
      groups[u.unitGroup].total++;
      if (u.alive) groups[u.unitGroup].alive++;
    });

    return Object.entries(groups).map(([gId, info]) => {
      const def  = (info.factionId && window.getRosterUnitDef)
        ? window.getRosterUnitDef(info.factionId, info.unitId) : null;
      const leg  = (window.UNIT_STATS || {})[info.type] || {};
      const dst  = def && def.stats ? def.stats : null;
      const allRangedWeapons = def && def.weapons
        ? Object.values(def.weapons).filter(w => w.type === 'ranged') : [];
      const rw   = allRangedWeapons[0] || null;
      const lw   = leg.weapon || {};

      const M  = dst ? dst.M  : (leg.move      ? leg.move + '"'  : '?');
      const T  = dst ? dst.T  : (leg.toughness || '?');
      const SV = dst ? dst.SV : (leg.save      ? leg.save + '+'  : '?');
      const W  = dst ? dst.W  : (leg.w         || '?');
      const LD = dst ? dst.LD : (leg.ld        ? leg.ld + '+'    : '?');
      const OC = dst ? (dst.OC || '2') : '2';

      const isExp    = cardState.expanded === gId;
      const isHl     = cardState.highlighted === gId;
      const cardCls  = `unit-card ${faction}-card${isHl ? ' highlighted' : ''}`;
      const deadCount = info.total - info.alive;

      const compactStats = `
        <div class="stat-row">
          <span class="stat-cell">M<span>${escHtml(String(M))}</span></span>
          <span class="stat-cell">T<span>${escHtml(String(T))}</span></span>
          <span class="stat-cell">Sv<span>${escHtml(String(SV))}</span></span>
          <span class="stat-cell">W<span>${escHtml(String(W))}</span></span>
        </div>`;

      function weaponRow(w) {
        const wName  = w ? w.name                            : (lw.name     || '?');
        const wRange = w ? w.range + '"'                     : (lw.range    ? lw.range + '"' : '?');
        const wAtk   = w ? String(w.attacks)                 : String(lw.attacks || '?');
        const wBS    = w ? w.skill + '+'                     : (lw.bs       ? lw.bs + '+'   : '?');
        const wS     = w ? w.S                               : (lw.strength || '?');
        const wAP    = w ? (w.AP === 0 ? '0' : '-' + w.AP)  : (lw.ap      !== undefined ? lw.ap : '0');
        const wD     = w ? String(w.D)                       : String(lw.damage || '?');
        return `
          <div class="expand-label">${escHtml(wName)}</div>
          <div class="stat-row">
            <span class="stat-cell">Rng<span>${escHtml(String(wRange))}</span></span>
            <span class="stat-cell">A<span>${escHtml(wAtk)}</span></span>
            <span class="stat-cell">BS<span>${escHtml(String(wBS))}</span></span>
            <span class="stat-cell">S<span>${escHtml(String(wS))}</span></span>
            <span class="stat-cell">AP<span>${escHtml(String(wAP))}</span></span>
            <span class="stat-cell">D<span>${escHtml(wD)}</span></span>
          </div>`;
      }

      const weaponsHTML = allRangedWeapons.length
        ? allRangedWeapons.map(w => weaponRow(w)).join('')
        : weaponRow(null);

      const expandedSection = isExp ? `
        <div class="unit-card-expanded">
          ${weaponsHTML}
          <div class="stat-row" style="margin-top:0.3rem;">
            <span class="stat-cell">Ld<span>${escHtml(String(LD))}</span></span>
            <span class="stat-cell">OC<span>${escHtml(String(OC))}</span></span>
          </div>
        </div>` : '';

      return `
        <div class="${cardCls}" data-card-group="${escHtml(gId)}">
          <div class="unit-card-name">${escHtml(groupLabel(gId))}</div>
          <div class="unit-card-count">
            <span class="alive">${info.alive}</span>/<span>${info.total}</span> models
            ${deadCount ? `<span class="dead"> · ${deadCount} lost</span>` : ''}
          </div>
          ${compactStats}
          ${expandedSection}
        </div>`;
    }).join('');
  }

  function diceLogHTML(shotLog) {
    const entries = getShotLogEntries(shotLog);
    if (!entries.length) {
      return `<div class="dice-log-empty">No shots this turn</div>`;
    }
    return [...entries].reverse().map(entry => {
      const shooterLabel = escHtml(groupLabel(entry.shooterGroup || ''));
      const targetLabel  = escHtml(groupLabel(entry.targetGroup  || ''));
      const isMelee = entry.type === 'melee';
      const rollLines    = (entry.rolls || []).map(r => {
        const hitStat = r.bs ?? r.ws;  // shooting uses bs, melee uses ws
        if (!r.hit) {
          return `<div class="roll-line">${dieFaceSVG(r.hitRoll)} `+
                 `<span class="roll-outcome-miss">Miss</span> (needed ${hitStat}+)</div>`;
        }
        if (!r.wound) {
          return `<div class="roll-line">${dieFaceSVG(r.hitRoll)} `+
                 `<span class="roll-outcome-hit">Hit</span> · `+
                 `${dieFaceSVG(r.woundRoll)} `+
                 `<span class="roll-outcome-miss">No wound</span> (needed ${r.wndThr}+)</div>`;
        }
        if (r.saved) {
          return `<div class="roll-line">${dieFaceSVG(r.hitRoll)} `+
                 `<span class="roll-outcome-hit">Hit</span> · `+
                 `${dieFaceSVG(r.woundRoll)} `+
                 `<span class="roll-outcome-wound">Wound</span> · `+
                 `${dieFaceSVG(r.saveRoll)} `+
                 `<span class="roll-outcome-save">Saved</span> (needed ${r.modSave}+)</div>`;
        }
        return `<div class="roll-line">${dieFaceSVG(r.hitRoll)} `+
               `<span class="roll-outcome-hit">Hit</span> · `+
               `${dieFaceSVG(r.woundRoll)} `+
               `<span class="roll-outcome-wound">Wound</span> · `+
               `${dieFaceSVG(r.saveRoll)} `+
               `<span class="roll-outcome-unsave">Unsaved</span> (${r.damage} dmg)</div>`;
      }).join('');

      const summaryLines = (entry.summary || []).map(l =>
        `<div>${escHtml(l)}</div>`
      ).join('');

      const weaponBreakdown = (entry.weaponResults && entry.weaponResults.length > 1)
        ? entry.weaponResults.map(wr =>
            `<div class="dice-weapon-line">${escHtml(wr.name)}: `+
            `${wr.attacks}A → ${wr.hits} hit${wr.hits!==1?'s':''}, `+
            `${wr.wounds} wound${wr.wounds!==1?'s':''}, `+
            `${wr.unsaved} unsaved</div>`
          ).join('')
        : '';

      return `
        <div class="dice-entry">
          <div class="dice-entry-header">
            ${isMelee ? '<span style="color:rgba(220,110,0,0.9);font-size:0.65rem;">⚔ MELEE</span> ' : ''}<strong>${shooterLabel}</strong> → <strong>${targetLabel}</strong>
          </div>
          ${weaponBreakdown}
          ${weaponBreakdown ? '' : rollLines}
          <div class="dice-entry-summary">${summaryLines}</div>
        </div>`;
    }).join('');
  }

  function battleShockLogHTML(bsLog) {
    if (!bsLog) return '';
    const entries = Object.entries(bsLog);
    if (!entries.length) return '';
    const rows = entries.map(([groupId, r]) => {
      const outcome = r.passed
        ? `<span class="roll-outcome-hit">Pass</span>`
        : `<span class="roll-outcome-wound">Battle-shocked!</span>`;
      return `<div class="roll-line">${dieFaceSVG(r.d1)}${dieFaceSVG(r.d2)}`+
             ` = ${r.total} vs Ld ${r.ld} · ${outcome}`+
             ` <span style="color:var(--text-dim);font-size:0.7rem;">(${escHtml(groupLabel(groupId))})</span></div>`;
    });
    return `<div class="dice-entry" style="margin-top:0.4rem;">`+
           `<div class="dice-entry-header">Battle-shock Tests</div>${rows.join('')}</div>`;
  }

  // ---- Casualty allocation helpers ----

  // Returns [{groupId, count}] for groups belonging to `faction` with pending casualties
  function getPendingCasGroups(game, faction) {
    const pending = game.pendingCasualties;
    if (!pending) return [];
    const units = game.units || {};
    return Object.entries(pending)
      .filter(([, count]) => count > 0)
      .filter(([groupId]) => {
        const sample = Object.values(units).find(u => u.unitGroup === groupId);
        return sample && sample.faction === faction;
      })
      .map(([groupId, count]) => ({ groupId, count }));
  }

  function buildAllocationBarContent(group, aliveModels, isAutoWipe) {
    const name  = escHtml(groupLabel(group.groupId));
    const count = group.count;
    const header = `
      <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.35rem;">
        Casualty Allocation — <strong style="color:var(--text);">${name}</strong>
      </p>`;
    if (isAutoWipe) {
      return header + `
        <p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:0.6rem;">
          ${count} unsaved wound${count !== 1 ? 's' : ''} — entire unit wiped out.
        </p>
        <button class="btn btn-primary" id="btn-confirm-allocation">Remove All Models</button>`;
    }
    return header + `
      <p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:0.6rem;">
        Select <strong>${count}</strong> model${count !== 1 ? 's' : ''} to remove from the board.
        (<span id="allocation-selected-count">0</span>/${count} selected)
      </p>
      <button class="btn btn-primary" id="btn-confirm-allocation" disabled>Confirm Removal</button>`;
  }

  // ---- Phase-bar HTML builders ----

  function movementQueueHTML(queueGroups, movedGroupIds) {
    const queueSection = queueGroups.length === 0
      ? `<p style="font-size:0.82rem;color:var(--text-dim);margin-bottom:0.75rem;">All units have moved.</p>`
      : `
        <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.6rem;">Select a unit to move</p>
        <div>${queueGroups.map(g =>
          `<button class="btn btn-gold" data-group="${escHtml(g)}" style="margin-right:0.5rem;margin-bottom:0.6rem;">${escHtml(groupLabel(g))}</button>`
        ).join('')}</div>`;

    // W40K-UX2 item 3: one-level undo per already-moved group, ported from
    // WHF-5m's phase-start-snapshot pattern. Only ever this Movement phase's
    // own moves — nothing here survives advancePhase (movementSnapshot is
    // overwritten fresh next time this player enters Movement).
    const undoSection = (movedGroupIds && movedGroupIds.length) ? `
      <div style="margin-top:0.75rem;padding-top:0.6rem;border-top:1px solid var(--border);">
        <p style="font-size:0.62rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.4rem;">Already moved — undo?</p>
        <div>${movedGroupIds.map(g =>
          `<button class="btn btn-ghost" data-undo-move-group="${escHtml(g)}" style="margin-right:0.5rem;margin-bottom:0.6rem;">Undo ${escHtml(groupLabel(g))}</button>`
        ).join('')}</div>
      </div>` : '';

    return queueSection + undoSection;
  }

  function shootingQueueHTML(queue, shotLogEntries) {
    const last    = shotLogEntries && shotLogEntries.length ? shotLogEntries[shotLogEntries.length - 1] : null;
    const logHtml = last ? `
      <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.5rem;border-left:2px solid rgba(255,255,255,0.12);padding-left:0.5rem;">
        ${(last.summary || []).map(l => `<div>${escHtml(l)}</div>`).join('')}
      </div>` : '';
    if (!queue.length) {
      return logHtml + `<p style="font-size:0.82rem;color:var(--text-dim);margin-bottom:0.75rem;">All units have shot.</p>`;
    }
    const btns = queue.map(g =>
      `<button class="btn btn-gold" data-shoot-group="${escHtml(g)}" style="margin-right:0.5rem;margin-bottom:0.6rem;">${escHtml(groupLabel(g))}</button>`
    ).join('');
    return logHtml + `
      <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.6rem;">Select a unit to shoot</p>
      <div>${btns}</div>`;
  }

  function shootingTargetingHTML(groupId, validTargets, units, terrain) {
    const hasTargets = validTargets.length > 0;
    const coverNote  = validTargets.some(t => t.cover) ? ' (some targets have cover)' : '';
    const noTargetsReason = !hasTargets && window.Shooting.explainNoTargets
      ? window.Shooting.explainNoTargets(groupId, units, terrain || {})
      : null;
    return `
      <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.35rem;">
        Shooting — <strong style="color:var(--text);">${escHtml(groupLabel(groupId))}</strong>
      </p>
      <p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:0.6rem;">
        ${hasTargets
          ? `Select a target on the board. Amber rings = valid targets${coverNote}.`
          : escHtml(noTargetsReason || 'No valid targets in range or line of sight.')}
      </p>`;
  }

  function shootingResolvedHTML(groupId, targetGroupId, estimate) {
    const r = n => Math.round(n);
    const lines = [
      `~${r(estimate.hits)} hits · ~${r(estimate.wounds)} wounds · ~${r(estimate.unsaved)} unsaved`,
      estimate.hasCover ? 'Cover save bonus: +1 to save' : null,
      `~${estimate.models.toFixed(1)} models removed`,
      '(statistical estimate — confirm to roll dice)'
    ].filter(Boolean).map(l => `<div>${escHtml(l)}</div>`).join('');
    return `
      <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.35rem;">
        Shooting — <strong style="color:var(--text);">${escHtml(groupLabel(groupId))}</strong>
        → <strong style="color:#e84040;">${escHtml(groupLabel(targetGroupId))}</strong>
      </p>
      <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:0.6rem;border-left:2px solid rgba(201,168,76,0.4);padding-left:0.5rem;">
        ${lines}
      </div>`;
  }

  function movementActiveHTML(groupId) {
    return `
      <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.35rem;">
        Moving — <strong style="color:var(--text);">${escHtml(groupLabel(groupId))}</strong>
      </p>
      <p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:0.6rem;">
        Drag individual models. Each model can be re-placed freely before confirming.
      </p>`;
  }

  // ---- Charge phase HTML builders ----

  function chargeQueueHTML(queueGroups) {
    if (!queueGroups.length) {
      return `<p style="font-size:0.82rem;color:var(--text-dim);margin-bottom:0.75rem;">All units have charged (or declined).</p>`;
    }
    const btns = queueGroups.map(g =>
      `<button class="btn btn-gold" data-charge-group="${escHtml(g)}" style="margin-right:0.5rem;margin-bottom:0.6rem;">${escHtml(groupLabel(g))}</button>`
    ).join('');
    return `
      <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.6rem;">Select a unit to charge</p>
      <div>${btns}</div>`;
  }

  function chargeTargetingHTML(groupId, chargeTargets) {
    return `
      <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.35rem;">
        Charge — <strong style="color:var(--text);">${escHtml(groupLabel(groupId))}</strong>
      </p>
      <p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:0.6rem;">
        ${chargeTargets.length
          ? 'Select a charge target on the board.'
          : 'No valid charge targets within 12" with line of sight.'}
      </p>`;
  }

  function chargeRolledHTML(groupId, targetGroupId, d1, d2, roll, minGap, success) {
    const needed = Math.max(0, minGap - 1);
    return `
      <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.35rem;">
        Charge — <strong style="color:var(--text);">${escHtml(groupLabel(groupId))}</strong>
        → <strong style="color:#e84040;">${escHtml(groupLabel(targetGroupId))}</strong>
      </p>
      <div style="margin-bottom:0.6rem;">
        ${dieFaceSVG(d1, 28)}${dieFaceSVG(d2, 28)}
        <span style="font-size:1rem;font-weight:700;margin-left:0.5rem;">${roll}"</span>
        <span style="font-size:0.8rem;color:var(--text-dim);margin-left:0.5rem;">vs ${needed.toFixed(1)}" needed</span>
        &nbsp;
        ${success
          ? `<span class="roll-outcome-hit" style="font-size:0.9rem;">Charge succeeds!</span>`
          : `<span class="roll-outcome-wound" style="font-size:0.9rem;">Charge failed.</span>`}
      </div>`;
  }

  function chargeMoveHTML(groupId, roll) {
    return `
      <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.35rem;">
        Charging — <strong style="color:var(--text);">${escHtml(groupLabel(groupId))}</strong>
        <span style="font-weight:400;color:var(--text-dim);">(${roll}" max)</span>
      </p>
      <p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:0.6rem;">
        Drag models into Engagement Range (1") of the target. At least one model must end within 1".
      </p>`;
  }

  // ---- Fight phase HTML builders ----

  function fightResolvedHTML(groupId, targetGroupId, result) {
    const rollLines = (result.rolls || []).map(r => {
      const hitStat = r.ws ?? r.bs;
      if (!r.hit) {
        return `<div class="roll-line">${dieFaceSVG(r.hitRoll)} `+
               `<span class="roll-outcome-miss">Miss</span> (needed ${hitStat}+)</div>`;
      }
      if (!r.wound) {
        return `<div class="roll-line">${dieFaceSVG(r.hitRoll)} `+
               `<span class="roll-outcome-hit">Hit</span> · `+
               `${dieFaceSVG(r.woundRoll)} `+
               `<span class="roll-outcome-miss">No wound</span> (needed ${r.wndThr}+)</div>`;
      }
      if (r.saved) {
        return `<div class="roll-line">${dieFaceSVG(r.hitRoll)} `+
               `<span class="roll-outcome-hit">Hit</span> · `+
               `${dieFaceSVG(r.woundRoll)} `+
               `<span class="roll-outcome-wound">Wound</span> · `+
               `${dieFaceSVG(r.saveRoll)} `+
               `<span class="roll-outcome-save">Saved</span> (needed ${r.modSave}+)</div>`;
      }
      return `<div class="roll-line">${dieFaceSVG(r.hitRoll)} `+
             `<span class="roll-outcome-hit">Hit</span> · `+
             `${dieFaceSVG(r.woundRoll)} `+
             `<span class="roll-outcome-wound">Wound</span> · `+
             `${dieFaceSVG(r.saveRoll)} `+
             `<span class="roll-outcome-unsave">Unsaved</span> (${r.damage} dmg)</div>`;
    }).join('');
    const summaryLines = (result.summary || []).map(l => `<div>${escHtml(l)}</div>`).join('');
    return `
      <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.35rem;">
        Fight — <strong style="color:var(--text);">${escHtml(groupLabel(groupId))}</strong>
        → <strong style="color:#e84040;">${escHtml(groupLabel(targetGroupId))}</strong>
      </p>
      <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:0.6rem;border-left:2px solid rgba(201,168,76,0.4);padding-left:0.5rem;">
        ${rollLines}
        <div style="margin-top:0.3rem;">${summaryLines}</div>
      </div>`;
  }

  // ---- Render ----

  const FACTION_NAMES = { guard: 'Astra Militarum', eldar: 'Craftworld Eldar' };

  const TERRAIN_COSTS  = { rough: 1, chestHigh: 2, tall: 3 };
  const TERRAIN_LABELS = { rough: 'Rough', chestHigh: 'Chest-High', tall: 'Tall' };
  const TERRAIN_FX     = { rough: 'No LOS effect · passable', chestHigh: 'Cover save · passable', tall: 'Blocks LOS · impassable' };

  function getDeployZones(boardHeight) {
    const bH    = boardHeight || 60;
    const zoneH = Math.round(bH * 0.2);
    return {
      guard: { yMin: 0,        yMax: zoneH },
      eldar: { yMin: bH-zoneH, yMax: bH    }
    };
  }

  // BUG-40K-PREGAME item 1: SIMULTANEOUS terrain placement, not turn-
  // alternating. Both players paint at once against their own budget
  // (board.js already gates painting by budget/enemyOwned per faction,
  // never by turn — no change needed there). Each player explicitly
  // confirms "Done with Terrain" whenever they choose (with or without
  // spending their whole budget); the phase advances once BOTH have
  // confirmed (game.turnDone, written by confirmTerrainDone). Replaces the
  // old alternating Pass-Turn flow, which could leave the player who
  // still had budget stuck re-passing back and forth once the other
  // player ran out — there was no way to just END the phase without one
  // more full round-trip through whoever was currently "active".
  function renderTerrain(game) {
    const { terrain, terrainBudget, players } = game;
    const terrainOwner = game.terrainOwner || {};
    const terrainDone   = game.terrainDone || { guard: false, eldar: false };
    const isDev        = window.GameState.isDevSession(currentGameId);
    const myFac        = localFaction;
    const otherFac     = myFac === 'guard' ? 'eldar' : 'guard';
    const budget       = terrainBudget || 6;

    // Budget computed on-the-fly from terrainOwner — single source of truth, no terrainSpent field.
    const mySpent = Object.entries(terrainOwner)
      .filter(([, f]) => f === myFac)
      .reduce((sum, [k]) => sum + (TERRAIN_COSTS[(terrain || {})[k]] || 0), 0);
    const otherSpent = Object.entries(terrainOwner)
      .filter(([, f]) => f === otherFac)
      .reduce((sum, [k]) => sum + (TERRAIN_COSTS[(terrain || {})[k]] || 0), 0);

    const myRemain    = budget - mySpent;
    const minCost     = 1;
    const guardName   = players.guard.name || 'Guard';
    const eldarName   = players.eldar.name || 'Eldar';
    const otherName   = otherFac === 'guard' ? guardName : eldarName;
    const iAmDone     = !!terrainDone[myFac];
    const otherDone   = !!terrainDone[otherFac];

    // Init/preserve tier selection
    if (!terrainState) {
      const affordable = ['tall','chestHigh','rough'].filter(t => TERRAIN_COSTS[t] <= myRemain);
      terrainState = { tier: affordable[0] || 'tall' };
    }

    // Phase bar — a player who's confirmed Done sees the OTHER's remaining
    // state, not a pass-turn prompt (item 1's explicit requirement); both
    // players otherwise always see their own paint controls, simultaneously.
    let phaseBarContent;
    if (iAmDone) {
      phaseBarContent = `<p class="phase-card-body">Done — waiting for ${escHtml(otherName)}
        (${otherSpent}/${budget} pt${budget !== 1 ? 's' : ''} placed${otherDone ? ', done' : ''})…</p>`;
    } else {
      const tierBtns = ['rough','chestHigh','tall'].map(t => {
        const cost  = TERRAIN_COSTS[t];
        const isSel = terrainState.tier === t;
        const disabled = cost > myRemain ? 'disabled' : '';
        return `<button class="terrain-tier-btn${isSel ? ' selected' : ''}" data-tier="${t}" ${disabled}>
          <span class="terrain-tier-name">${TERRAIN_LABELS[t]}</span>
          <span class="terrain-tier-cost">${cost} pt${cost !== 1 ? 's' : ''}/sq</span>
          <span class="terrain-tier-effect">${TERRAIN_FX[t]}</span>
        </button>`;
      }).join('');
      const outOfBudgetNote = myRemain < minCost
        ? `<p style="font-size:0.72rem;color:var(--gold);margin-top:0.35rem;">Out of budget — click Done with Terrain when ready.</p>` : '';

      // W40K-UX2 item 2 bonus: warn, don't block, if any of MY OWN painted
      // squares fall in the opponent's deployment zone — the exact mistake
      // the brother's report described. Recomputed every render (not a
      // one-shot stroke check), so it stays accurate through erases too.
      const bH2   = game.boardHeight || 60;
      const zoneH2 = Math.round(bH2 * 0.2);
      const inOtherZone = (yKey) => myFac === 'guard' ? yKey >= bH2 - zoneH2 : yKey < zoneH2;
      const wrongZoneCount = Object.entries(terrainOwner)
        .filter(([key, f]) => f === myFac && inOtherZone(Number(key.split(',')[1])))
        .length;
      const wrongZoneWarning = wrongZoneCount > 0
        ? `<p style="font-size:0.72rem;color:var(--red-bright, #a02020);margin-top:0.35rem;">
             ⚠ ${wrongZoneCount} of your square${wrongZoneCount !== 1 ? 's are' : ' is'} in the OPPONENT's deployment zone.
           </p>` : '';

      phaseBarContent = `
        <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.5rem;">
          Select tier · paint squares on the board · both players place at once
        </p>
        <div class="terrain-tier-row">${tierBtns}</div>
        <p style="font-size:0.75rem;color:var(--text-dim);margin-top:0.5rem;">
          ${myRemain} pt${myRemain !== 1 ? 's' : ''} remaining
        </p>
        ${outOfBudgetNote}
        ${wrongZoneWarning}
        <div style="margin-top:0.5rem;">
          <button class="btn btn-primary" id="btn-done-terrain">Done with Terrain</button>
        </div>`;
    }

    // Count squares per faction for the sidebar
    const guardSquares = Object.values(terrainOwner).filter(f => f === 'guard').length;
    const eldarSquares = Object.values(terrainOwner).filter(f => f === 'eldar').length;

    const budgetBar = (name, spent, total, f) => `
      <div class="terrain-budget-row">
        <div style="display:flex;justify-content:space-between;">
          <span style="font-size:0.78rem;color:var(--text-dim);">${escHtml(name)}</span>
          <span class="terrain-pts${spent >= total ? ' terrain-pts-done' : ''}">${spent}/${total}</span>
        </div>
        <div class="terrain-budget-bar">
          <div class="terrain-budget-fill ${f}-fill" style="width:${Math.min(100,(spent/total)*100).toFixed(1)}%"></div>
        </div>
      </div>`;

    document.getElementById('game-content').innerHTML = `
      <div class="game-topbar">
        <span class="game-topbar-title">Pre-Game</span>
        <span class="topbar-sep">·</span>
        <span class="phase-badge">Terrain Placement</span>
        <span class="game-topbar-spacer"></span>
        ${mobilePanelTogglesHTML()}
        ${isDev ? `<button class="btn btn-ghost" id="btn-switch" style="margin-left:0.5rem;font-size:0.65rem;padding:0.2rem 0.6rem;">Switch → ${myFac === 'guard' ? 'Eldar' : 'Guard'}</button>` : ''}
      </div>

      <div class="game-main">
        <div class="side-panel side-panel-left">
          <div class="side-panel-title">Budget</div>
          ${budgetBar(guardName, myFac === 'guard' ? mySpent : otherSpent, budget, 'guard')}
          ${budgetBar(eldarName, myFac === 'eldar' ? mySpent : otherSpent, budget, 'eldar')}
          <div style="margin-top:1.25rem;">
            <div class="side-panel-title">Placed</div>
            <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:0.2rem;">${escHtml(guardName)}: ${guardSquares} sq</div>
            <div style="font-size:0.78rem;color:var(--text-dim);">${escHtml(eldarName)}: ${eldarSquares} sq</div>
          </div>
        </div>

        <div id="board-wrap" class="board-wrap"></div>

        <div class="side-panel side-panel-right">
          <div class="side-panel-title">Tier Guide</div>
          <div class="terrain-guide-row"><span class="terrain-guide-pip tier-rough"></span>Rough<span class="terrain-guide-pts">1 pt/sq</span></div>
          <div class="terrain-guide-row"><span class="terrain-guide-pip tier-chesthigh"></span>Chest-High<span class="terrain-guide-pts">2 pts/sq</span></div>
          <div class="terrain-guide-row"><span class="terrain-guide-pip tier-tall"></span>Tall<span class="terrain-guide-pts">3 pts/sq</span></div>
          <div style="margin-top:1rem;font-size:0.68rem;color:var(--text-dim);">
            <div style="margin-bottom:0.35rem;">R — no LOS effect, passable</div>
            <div style="margin-bottom:0.35rem;">C — cover save, passable</div>
            <div>T — blocks LOS, impassable</div>
          </div>
          <div style="margin-top:0.75rem;font-size:0.65rem;color:var(--text-muted);">Click: erase own square · Drag: paint multiple</div>
        </div>
      </div>

      <div class="phase-bar">
        <div class="phase-card" style="max-width:640px;width:100%;">
          <div class="phase-card-label">
            ${isDev ? `Dev · Viewing as ${myFac}` : `You are ${myFac}`}
            ${iAmDone ? ' · <strong>Done</strong>' : ''}
          </div>
          ${phaseBarContent}
        </div>
      </div>
      ${isDev ? `
        <div class="dev-panel">
          <span class="dev-panel-label">⚡ DEV</span>
          <div class="dev-preset-row">
            ${DEV_PRESETS.map(p =>
              `<button class="dev-preset-btn" data-preset="${p.key}" title="${escHtml(p.desc)}">${escHtml(p.label)}</button>`
            ).join('')}
          </div>
        </div>` : ''}
    `;

    // Build board opts — extracted so tier-change can rebuild without duplication.
    function buildBoardOpts() {
      if (iAmDone || myRemain < minCost) return { myFaction: myFac };
      return {
        myFaction: myFac,
        terrainPlacement: {
          tier:            terrainState.tier,
          existingTerrain: terrain || {},
          terrainOwner,
          myFaction:       myFac,
          budgetRemaining: myRemain
        },
        onTerrainStroke: async (paints, erases) => {
          if (terrainPlacing) return;
          terrainPlacing = true;
          try {
            await window.GameState.writeTerrain(currentGameId, paints, erases, myFac);
          } finally {
            terrainPlacing = false;
          }
        }
      };
    }

    // Render board without units (pre-deployment)
    window.Board.render({ ...game, units: {} }, document.getElementById('board-wrap'), buildBoardOpts());

    bindMobilePanelToggles();

    // Listeners
    if (isDev) {
      const sw = document.getElementById('btn-switch');
      if (sw) sw.addEventListener('click', switchPerspective);
      document.querySelectorAll('.dev-preset-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const preset = DEV_PRESETS.find(p => p.key === btn.dataset.preset);
          if (!preset) return;
          btn.disabled = true;
          lastShotKey = null;
          try { await window.GameState.devApplyPreset(currentGameId, preset.update()); }
          finally { btn.disabled = false; }
        });
      });
    }

    if (!iAmDone) {
      // Tier selector — re-render board section only (ghost color update)
      document.querySelectorAll('[data-tier]:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
          terrainState.tier = btn.dataset.tier;
          document.querySelectorAll('[data-tier]').forEach(b =>
            b.classList.toggle('selected', b.dataset.tier === terrainState.tier));
          window.Board.render({ ...game, units: {} }, document.getElementById('board-wrap'), buildBoardOpts());
        });
      });

      // Done with Terrain button — confirms this player is finished;
      // phase advances once BOTH players have confirmed (see
      // confirmTerrainDone). Available any time, budget spent or not.
      const doneBtn = document.getElementById('btn-done-terrain');
      if (doneBtn) doneBtn.addEventListener('click', async () => {
        doneBtn.disabled = true;
        doneBtn.innerHTML = '<span class="spinner"></span>';
        try {
          await window.GameState.confirmTerrainDone(currentGameId, myFac);
        } finally {
          doneBtn.disabled = false;
          doneBtn.textContent = 'Done with Terrain';
        }
      });
    }
  }

  function renderDeployment(game) {
    const { undeployedGroups, players, turn, units } = game;
    const isDev    = window.GameState.isDevSession(currentGameId);
    // In dev mode, always follow the active player so both sides can be placed without switching.
    // Fall back to localStorage in case localFaction wasn't set (e.g. page-reload race).
    const myFac    = isDev ? turn.activePlayer : (localFaction || window.GameState.getLocalFaction(currentGameId));
    const otherFac = myFac === 'guard' ? 'eldar' : 'guard';
    const iAmActive = isDev || turn.activePlayer === myFac;
    const guardName  = players.guard.name || 'Guard';
    const eldarName  = players.eldar.name || 'Eldar';
    const activeName = turn.activePlayer === 'guard' ? guardName : eldarName;

    function getRawGroups(fac) {
      const raw = (undeployedGroups || {})[fac];
      if (!raw) return [];
      return (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean);
    }

    const myUndeployed    = getRawGroups(myFac);
    const otherUndeployed = getRawGroups(otherFac);

    // Auto-skip: active player (me in dev mode) has nothing left to deploy
    if (iAmActive && myUndeployed.length === 0) {
      const nextPlayer = otherUndeployed.length > 0 ? otherFac : null;
      window.GameState.passDeploymentTurn(currentGameId, nextPlayer);
      return;
    }

    // Only render deployed units on the board (hide undeployed groups)
    const allUndeployed = new Set([...getRawGroups('guard'), ...getRawGroups('eldar')]);
    const deployedUnits = {};
    Object.entries(units || {}).forEach(([id, u]) => {
      if (!allUndeployed.has(u.unitGroup)) deployedUnits[id] = u;
    });

    const activeGroupId     = iAmActive ? myUndeployed[0] : null;
    const activeGroupModels = activeGroupId
      ? Object.values(units || {}).filter(u => u.unitGroup === activeGroupId && u.alive)
      : [];
    const deployZones = getDeployZones(game.boardHeight);
    const myZone = deployZones[myFac];
    const zoneH  = Math.round((game.boardHeight || 60) * 0.2);

    const guardRawGroups = getRawGroups('guard');
    const eldarRawGroups = getRawGroups('eldar');
    const guardTotal = new Set(Object.values(units || {}).filter(u => u.faction === 'guard').map(u => u.unitGroup)).size;
    const eldarTotal = new Set(Object.values(units || {}).filter(u => u.faction === 'eldar').map(u => u.unitGroup)).size;

    const deployBar = (fac, name, undeployedCount, total) => {
      const deployed = total - undeployedCount;
      const pct = total > 0 ? (deployed / total * 100).toFixed(1) : '100';
      const done = undeployedCount === 0;
      return `
        <div class="terrain-budget-row">
          <div style="display:flex;justify-content:space-between;">
            <span style="font-size:0.78rem;color:var(--text-dim);">${escHtml(name)}</span>
            <span class="terrain-pts${done ? ' terrain-pts-done' : ''}">${deployed}/${total}</span>
          </div>
          <div class="terrain-budget-bar">
            <div class="terrain-budget-fill ${fac}-fill" style="width:${pct}%"></div>
          </div>
        </div>`;
    };

    // W40K-UX2 item 3: one-level deployment undo. Only valid while nothing
    // has happened since MY OWN last deploy — game.lastDeploy gets
    // overwritten by every deployGroup call (mine or the opponent's), so a
    // faction mismatch here just means "too late," not an error. Scoped
    // deliberately to the deployment phase's own UI: if my last placement
    // was the one that ended the phase, there's no undo affordance once
    // Initiative renders instead — matching the brief's "do not allow undo
    // after any action with opponent-visible side effects" (initiative
    // rolls can start immediately once that screen is up).
    const canUndoDeploy = game.lastDeploy && game.lastDeploy.faction === myFac;
    const undoDeployBtn = canUndoDeploy
      ? `<button class="btn btn-ghost" id="btn-undo-deploy" style="margin-top:0.5rem;">
           Undo — ${escHtml(game.lastDeploy.unitLabel || 'last placement')}
         </button>` : '';

    let phaseBarContent;
    if (!iAmActive) {
      phaseBarContent = `<p class="phase-card-body">Waiting for ${escHtml(activeName)} to deploy…</p>${undoDeployBtn}`;
    } else {
      phaseBarContent = `
        <p style="font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:0.5rem;">
          Deploying — <strong style="color:var(--text);">${escHtml(groupLabel(activeGroupId))}</strong>
        </p>
        <p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:0.5rem;">
          Click within your highlighted deployment zone to place the unit.
          Models auto-arrange in a cluster around the clicked point.
        </p>
        ${undoDeployBtn}`;
    }

    document.getElementById('game-content').innerHTML = `
      <div class="game-topbar">
        <span class="game-topbar-title">Pre-Game</span>
        <span class="topbar-sep">·</span>
        <span class="phase-badge">Deployment</span>
        <span class="game-topbar-spacer"></span>
        ${mobilePanelTogglesHTML()}
      </div>

      <div class="game-main">
        <div class="side-panel side-panel-left">
          <div class="side-panel-title">Deployment</div>
          ${deployBar('guard', guardName, guardRawGroups.length, guardTotal)}
          ${deployBar('eldar', eldarName, eldarRawGroups.length, eldarTotal)}
          <div style="margin-top:1.25rem;">
            <div class="side-panel-title">Zones</div>
            <div class="deploy-zone-row"><span class="deploy-zone-pip guard-zone-pip"></span>${escHtml(guardName)}: top ${zoneH}"</div>
            <div class="deploy-zone-row"><span class="deploy-zone-pip eldar-zone-pip"></span>${escHtml(eldarName)}: bottom ${zoneH}"</div>
          </div>
          <div style="margin-top:1.25rem;">
            <div class="side-panel-title">Log</div>
            ${actionLogHTML(game.actionLog)}
          </div>
        </div>

        <div id="board-wrap" class="board-wrap"></div>

        <div class="side-panel side-panel-right">
          <div class="side-panel-title">Units</div>
          ${unitCardsHTML(units || {}, myFac)}
        </div>
      </div>

      <div class="phase-bar">
        <div class="phase-card" style="max-width:640px;width:100%;">
          <div class="phase-card-label">
            ${isDev ? `Dev · Deploying as ${myFac}` : `You are ${myFac}`}
            ${iAmActive ? ' · <strong>Your turn</strong>' : ''}
          </div>
          ${phaseBarContent}
        </div>
      </div>
      ${isDev ? `
        <div class="dev-panel">
          <span class="dev-panel-label">⚡ DEV</span>
          <div class="dev-preset-row">
            ${DEV_PRESETS.map(p =>
              `<button class="dev-preset-btn" data-preset="${p.key}" title="${escHtml(p.desc)}">${escHtml(p.label)}</button>`
            ).join('')}
          </div>
        </div>` : ''}
    `;

    const boardOpts = iAmActive && activeGroupId ? {
      myFaction:         myFac,
      deployZone:        myZone,
      deployZoneFaction: myFac,
      deployPlacement:   { faction: myFac, models: activeGroupModels, zone: myZone },
      onDeployPlaced: async (cx, cy) => {
        if (deployPlacing) return;
        deployPlacing = true;

        const count  = activeGroupModels.length;
        const cols   = Math.ceil(Math.sqrt(count));
        const nRows  = Math.ceil(count / cols);
        const SPACING = 2;

        const unitPositions = {};
        activeGroupModels.forEach((m, i) => {
          unitPositions[m.id] = {
            x: parseFloat((cx + ((i % cols) - (cols - 1) / 2) * SPACING).toFixed(2)),
            y: parseFloat((cy + (Math.floor(i / cols) - (nRows - 1) / 2) * SPACING).toFixed(2))
          };
        });

        const myRemaining    = myUndeployed.length - 1;
        const otherRemaining = otherUndeployed.length;
        const nextPlayer     = (myRemaining === 0 && otherRemaining === 0) ? null : otherFac;

        const deployerName = myFac === 'guard' ? guardName : eldarName;
        const deployedLabel = (activeGroupModels[0] && activeGroupModels[0].label) || groupLabel(activeGroupId);

        try {
          await window.GameState.deployGroup(currentGameId, myFac, activeGroupId, unitPositions, nextPlayer, deployerName, deployedLabel);
        } catch (err) {
          console.error('[deploy] Firebase write failed:', err);
          deployPlacing = false;
        } finally {
          deployPlacing = false;
        }
      }
    } : {
      myFaction:         myFac,
      deployZone:        iAmActive ? myZone : deployZones[turn.activePlayer],
      deployZoneFaction: iAmActive ? myFac  : turn.activePlayer
    };

    window.Board.render({ ...game, units: deployedUnits }, document.getElementById('board-wrap'), boardOpts);

    bindMobilePanelToggles();

    const undoDeployBtnEl = document.getElementById('btn-undo-deploy');
    if (undoDeployBtnEl) {
      undoDeployBtnEl.addEventListener('click', async () => {
        undoDeployBtnEl.disabled = true;
        undoDeployBtnEl.innerHTML = '<span class="spinner"></span>';
        try { await window.GameState.undoDeployment(currentGameId, myFac); }
        finally { undoDeployBtnEl.disabled = false; }
      });
    }

    if (isDev) {
      document.querySelectorAll('.dev-preset-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const preset = DEV_PRESETS.find(p => p.key === btn.dataset.preset);
          if (!preset) return;
          btn.disabled = true;
          lastShotKey = null;
          try { await window.GameState.devApplyPreset(currentGameId, preset.update()); }
          finally { btn.disabled = false; }
        });
      });
    }
  }

  function renderInitiative(game) {
    const { initiative, players } = game;
    const ini      = initiative || { guardRoll: null, eldarRoll: null };
    const isDev    = window.GameState.isDevSession(currentGameId);
    const guardName = players.guard.name || 'Guard';
    const eldarName = players.eldar.name || 'Eldar';
    // BUG-40K-PREGAME item 2: army name comes from what each player
    // actually brought (players.{slot}.factionName), not a guaranteed-
    // unique guess by slot — both can be the same army.
    const guardArmy = players.guard.factionName || FACTION_NAMES.guard;
    const eldarArmy = players.eldar.factionName || FACTION_NAMES.eldar;

    const bothRolled = ini.guardRoll !== null && ini.eldarRoll !== null;
    const isTie      = bothRolled && ini.guardRoll === ini.eldarRoll;
    const winner     = bothRolled && !isTie ? (ini.guardRoll > ini.eldarRoll ? 'guard' : 'eldar') : null;
    const iAmWinner  = winner === localFaction;

    if (isTie && !tieRerollPending) {
      tieRerollPending = true;
      setTimeout(() => {
        tieRerollPending = false;
        window.GameState.clearInitiativeRolls(currentGameId);
      }, 1500);
    }

    const SIZE = 56;
    const emptyDie = `<div class="initiative-die-empty"></div>`;
    const guardDieHTML = ini.guardRoll !== null ? dieFaceSVG(ini.guardRoll, SIZE) : emptyDie;
    const eldarDieHTML = ini.eldarRoll !== null ? dieFaceSVG(ini.eldarRoll, SIZE) : emptyDie;

    let actionHTML = '';
    if (isTie) {
      actionHTML = `<p class="initiative-status">Tie! Rerolling…</p>`;
    } else if (bothRolled && (iAmWinner || isDev)) {
      const winName = winner === 'guard' ? guardName : eldarName;
      actionHTML = `
        <p class="initiative-status">${escHtml(winName)} wins the roll-off.</p>
        <div class="initiative-choice-row">
          <button class="btn btn-primary" id="btn-go-first">Go First</button>
          <button class="btn btn-ghost"   id="btn-go-second">Go Second</button>
        </div>`;
    } else if (bothRolled && !iAmWinner) {
      const winName = winner === 'guard' ? guardName : eldarName;
      actionHTML = `<p class="initiative-status">${escHtml(winName)} wins — waiting for them to choose…</p>`;
    } else if (!isDev) {
      const myRoll    = ini[localFaction + 'Roll'];
      const otherName = localFaction === 'guard' ? eldarName : guardName;
      if (myRoll === null) {
        actionHTML = `<button class="btn btn-primary" id="btn-roll-initiative">Roll for Initiative</button>`;
      } else {
        actionHTML = `<p class="initiative-status">Waiting for ${escHtml(otherName)} to roll…</p>`;
      }
    }

    const devRowHTML = isDev ? `
      <div class="initiative-dev-row">
        <span class="dev-panel-label" style="font-size:0.65rem;">⚡ DEV</span>
        ${ini.guardRoll === null
          ? `<button class="dev-preset-btn" id="btn-dev-roll-guard">Roll Guard</button>`
          : `<span style="font-size:0.72rem;color:var(--text-dim);">Guard rolled ${ini.guardRoll}</span>`}
        ${ini.eldarRoll === null
          ? `<button class="dev-preset-btn" id="btn-dev-roll-eldar">Roll Eldar</button>`
          : `<span style="font-size:0.72rem;color:var(--text-dim);">Eldar rolled ${ini.eldarRoll}</span>`}
      </div>` : '';

    document.getElementById('game-content').innerHTML = `
      <div class="initiative-screen">
        <div class="initiative-eyebrow">Pre-Game · Turn 1</div>
        <div class="initiative-title">Roll for Initiative</div>
        <div class="initiative-dice-row">
          <div class="initiative-player">
            <div class="initiative-player-name guard-name">${escHtml(guardName)}</div>
            <div class="initiative-die">${guardDieHTML}</div>
            <div class="initiative-faction-label">${escHtml(guardArmy)}</div>
          </div>
          <div class="initiative-vs">vs</div>
          <div class="initiative-player">
            <div class="initiative-player-name eldar-name">${escHtml(eldarName)}</div>
            <div class="initiative-die">${eldarDieHTML}</div>
            <div class="initiative-faction-label">${escHtml(eldarArmy)}</div>
          </div>
        </div>
        <div class="initiative-actions">
          ${actionHTML}
        </div>
        ${devRowHTML}
      </div>
    `;

    const rollBtn = document.getElementById('btn-roll-initiative');
    if (rollBtn) rollBtn.addEventListener('click', async () => {
      rollBtn.disabled = true;
      await window.GameState.rollInitiative(currentGameId, localFaction, Math.ceil(Math.random() * 6));
    });

    if (isDev) {
      const dg = document.getElementById('btn-dev-roll-guard');
      if (dg) dg.addEventListener('click', async () => {
        dg.disabled = true;
        await window.GameState.rollInitiative(currentGameId, 'guard', Math.ceil(Math.random() * 6));
      });
      const de = document.getElementById('btn-dev-roll-eldar');
      if (de) de.addEventListener('click', async () => {
        de.disabled = true;
        await window.GameState.rollInitiative(currentGameId, 'eldar', Math.ceil(Math.random() * 6));
      });
    }

    const goFirst = document.getElementById('btn-go-first');
    if (goFirst) goFirst.addEventListener('click', async () => {
      goFirst.disabled = true;
      await window.GameState.chooseInitiative(currentGameId, winner);
    });

    const goSecond = document.getElementById('btn-go-second');
    if (goSecond) goSecond.addEventListener('click', async () => {
      goSecond.disabled = true;
      await window.GameState.chooseInitiative(currentGameId, winner === 'guard' ? 'eldar' : 'guard');
    });
  }

  function renderGameOver(game) {
    const { winner, reason } = game.gameOver;
    const units   = game.units || {};
    const loser   = winner === 'guard' ? 'eldar' : 'guard';
    // BUG-40K-PREGAME item 2: player NAME is the real disambiguator now —
    // both players' army name (FACTION_NAMES-by-slot) can be identical in
    // a same-faction game, so lead with who actually won, not which slot.
    const winPlayer = game.players[winner] || {};
    const losPlayer = game.players[loser]  || {};
    const winName = winPlayer.name || FACTION_NAMES[winner] || winner;
    const losName = losPlayer.name || FACTION_NAMES[loser]  || loser;
    const winnerAlive = Object.values(units).filter(u => u.faction === winner && u.alive).length;

    // Stop listening — game is over
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }

    document.getElementById('game-content').innerHTML = `
      <div class="game-over-screen">
        <div class="game-over-eyebrow">${reason === 'annihilation' ? 'Annihilation' : 'Game Over'}</div>
        <div class="game-over-title">${escHtml(winName)}</div>
        <div class="game-over-subtitle">Victory</div>
        <div class="game-over-detail">${escHtml(losName)} has been eliminated.<br>${winnerAlive} model${winnerAlive !== 1 ? 's' : ''} remaining.</div>
        <a href="/" class="btn btn-primary game-over-btn">Return to Lobby</a>
      </div>
    `;
  }

  function render(game) {
    // Populate groupLabel cache from unit labels (roster-backed games)
    Object.values(game.units || {}).forEach(u => {
      if (u.label && u.unitGroup) groupLabelCache[u.unitGroup] = u.label;
    });

    if (game.gameOver) { renderGameOver(game); return; }
    if (game.turn.phase === 'terrain')    { renderTerrain(game);     return; }
    if (game.turn.phase === 'deployment') { renderDeployment(game);  return; }
    if (game.turn.phase === 'initiative') { renderInitiative(game);  return; }

    const { turn, players, units } = game;
    const isDev      = window.GameState.isDevSession(currentGameId);
    const isActive   = isDev || localFaction === turn.activePlayer;
    const guardName  = players.guard.name || 'Guard';
    const eldarName  = players.eldar.name || 'Eldar';
    const activeName = turn.activePlayer === 'guard' ? guardName : eldarName;
    const phaseLabel = PHASE_LABELS[turn.phase] || turn.phase;
    // BUG-40K-PREGAME item 2: army label comes from what was actually
    // brought (players.{slot}.factionName) — can be identical for both
    // slots in a same-faction game, so the player-strip's NAME line (just
    // below) is the real disambiguator, not this label.
    const guardArmy  = players.guard.factionName || FACTION_NAMES.guard;
    const eldarArmy  = players.eldar.factionName || FACTION_NAMES.eldar;

    const guardAlive = Object.values(units).filter(u => u.faction === 'guard' && u.alive).length;
    const eldarAlive = Object.values(units).filter(u => u.faction === 'eldar' && u.alive).length;

    // Sync moveState to game phase changes
    const inMovement = turn.phase === 'movement' && isActive;
    if (!inMovement) {
      moveState = null;
    } else if (!moveState) {
      moveState = { mode: 'queue' };
    }
    if (moveState && moveState.mode === 'active') {
      const groupMoved = Object.values(units)
        .filter(u => u.unitGroup === moveState.groupId && u.alive)
        .every(u => u.movedThisTurn);
      if (groupMoved) moveState = { mode: 'queue' };
    }

    // Sync shootState to game phase changes
    const inShooting = turn.phase === 'shooting' && isActive;
    if (!inShooting) {
      shootState = null;
    } else if (!shootState) {
      shootState = { mode: 'queue' };
    }
    // If confirmed shot landed in Firebase, return to queue
    if (shootState && shootState.mode !== 'queue' && shootState.groupId) {
      const groupShot = Object.values(units)
        .filter(u => u.unitGroup === shootState.groupId && u.alive)
        .every(u => u.shotThisTurn);
      if (groupShot) shootState = { mode: 'queue' };
    }
    // Auto-activate when only one unit remains
    if (shootState && shootState.mode === 'queue') {
      const q = unShotGroups(units, turn.activePlayer);
      if (q.length === 1) activateShooterGroup(q[0], units, game.terrain || {});
    }

    // Sync chargeState
    const inCharge = turn.phase === 'charge' && isActive;
    if (!inCharge) {
      chargeState = null;
    } else if (!chargeState) {
      chargeState = { mode: 'queue' };
    }
    // If a unit's charge completed in Firebase, return to queue
    if (chargeState && chargeState.mode === 'rolled') {
      const groupCharged = Object.values(units)
        .filter(u => u.unitGroup === chargeState.groupId && u.alive)
        .every(u => u.chargedThisTurn);
      if (groupCharged) chargeState = { mode: 'queue' };
    }

    // Sync fightState — fight phase involves both players via fightQueue
    const inFight = turn.phase === 'fight';
    const fightQueue = normalizeFightQueue(turn.fightQueue);
    const currentFightEntry = fightQueue[0] || null;
    const isFightActive = isDev || (currentFightEntry && localFaction === currentFightEntry.faction);
    if (!inFight) {
      fightState = null;
    } else if (fightState && fightState.mode === 'resolved') {
      // If this group's fight landed in Firebase, return to queue
      const foughtAll = Object.values(units)
        .filter(u => u.unitGroup === fightState.groupId && u.alive)
        .every(u => u.foughtThisTurn);
      if (foughtAll) fightState = { mode: 'queue' };
    } else if (!fightState) {
      fightState = { mode: 'queue' };
    }

    // Deferred casualty allocation — Command Phase only
    const allocationFaction = isDev ? turn.activePlayer : localFaction;
    const pendingGroups     = getPendingCasGroups(game, allocationFaction);
    const inAllocation      = turn.phase === 'command' && isActive && pendingGroups.length > 0;
    if (inAllocation) {
      const pg = pendingGroups[0];
      if (!allocationState || allocationState.groupId !== pg.groupId) {
        allocationState = { groupId: pg.groupId, selected: new Set() };
      }
    } else {
      allocationState = null;
    }

    // Phase bar inner content
    let phaseBarContent;
    if (inMovement) {
      const queue  = unmovedeGroups(units, turn.activePlayer);
      const moved  = movedGroups(units, turn.activePlayer);
      const endBtn = `<button class="btn btn-primary" id="btn-end-phase" style="margin-top:0.5rem;">End Phase</button>`;
      if (moveState.mode === 'queue') {
        phaseBarContent = movementQueueHTML(queue, moved) + endBtn;
      } else {
        phaseBarContent = movementActiveHTML(moveState.groupId) +
          `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-confirm-move">Confirm Movement</button>
            <button class="btn btn-ghost"   id="btn-cancel-move">Cancel</button>
          </div>`;
      }
    } else if (inShooting) {
      const queue  = unShotGroups(units, turn.activePlayer);
      const endBtn = `<button class="btn btn-primary" id="btn-end-phase" style="margin-top:0.5rem;">End Phase</button>`;
      if (shootState.mode === 'queue') {
        phaseBarContent = shootingQueueHTML(queue, getShotLogEntries(turn.shotLog)) + endBtn;
      } else if (shootState.mode === 'targeting') {
        const hasTargets = shootState.validTargets.length > 0;
        phaseBarContent = shootingTargetingHTML(shootState.groupId, shootState.validTargets, units, game.terrain) +
          `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            ${hasTargets ? '' : `<button class="btn btn-primary" id="btn-skip-shoot">Skip Shooting</button>`}
            <button class="btn btn-ghost" id="btn-cancel-shoot">Cancel</button>
          </div>`;
      } else {
        phaseBarContent = shootingResolvedHTML(shootState.groupId, shootState.targetGroupId, shootState.estimate) +
          `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-confirm-shoot">Confirm Shooting</button>
          </div>`;
      }
    } else if (inCharge && chargeState) {
      const endBtn = `<button class="btn btn-primary" id="btn-end-phase" style="margin-top:0.5rem;">End Phase</button>`;
      if (chargeState.mode === 'queue') {
        const q = unchargedGroups(units, turn.activePlayer);
        phaseBarContent = chargeQueueHTML(q) + endBtn;
      } else if (chargeState.mode === 'targeting') {
        phaseBarContent = chargeTargetingHTML(chargeState.groupId, chargeState.chargeTargets) +
          `<button class="btn btn-ghost" id="btn-cancel-charge" style="margin-top:0.4rem;">Cancel</button>`;
      } else if (chargeState.mode === 'rolled') {
        const { groupId, targetGroupId, d1, d2, roll, minGap, success } = chargeState;
        if (success) {
          phaseBarContent = chargeRolledHTML(groupId, targetGroupId, d1, d2, roll, minGap, true) +
            chargeMoveHTML(groupId, roll) +
            `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
              <button class="btn btn-primary" id="btn-confirm-charge">Confirm Charge Move</button>
              <button class="btn btn-ghost"   id="btn-cancel-charge">Cancel</button>
            </div>`;
        } else {
          phaseBarContent = chargeRolledHTML(groupId, targetGroupId, d1, d2, roll, minGap, false) +
            `<button class="btn btn-primary" id="btn-charge-failed-ok" style="margin-top:0.4rem;">OK</button>`;
        }
      } else {
        phaseBarContent = `<div class="phase-card-body">${PHASE_INSTRUCTIONS.charge}</div>${endBtn}`;
      }
    } else if (inFight) {
      if (!currentFightEntry) {
        // Queue is empty — all fighters done; activePlayer sees End Phase
        const endBtn = isActive
          ? `<div class="phase-card-action"><button class="btn btn-primary" id="btn-end-phase">End Phase</button></div>`
          : '';
        phaseBarContent = `<div class="phase-card-body">All eligible units have fought. Fight Phase over.</div>${endBtn}`;
      } else if (!isFightActive) {
        const facName = currentFightEntry.faction === 'guard' ? (players.guard.name || 'Guard') : (players.eldar.name || 'Eldar');
        phaseBarContent = `<div class="phase-card-body">Waiting for ${escHtml(facName)} to fight with ${escHtml(groupLabel(currentFightEntry.groupId))}…</div>`;
      } else if (fightState && fightState.mode === 'queue') {
        // Auto-select target: first enemy group in engagement range
        const { groupId, faction } = currentFightEntry;
        const myModels    = Object.values(units).filter(u => u.unitGroup === groupId && u.alive);
        const enemyModels = Object.values(units).filter(u => u.faction !== faction && u.alive);
        const inRange = gId => {
          const em = enemyModels.filter(e => e.unitGroup === gId);
          return myModels.some(m => em.some(e => {
            const r1 = ((window.UNIT_STATS || {})[m.type] || {}).baseRadius || 0.5;
            const r2 = ((window.UNIT_STATS || {})[e.type] || {}).baseRadius || 0.5;
            return Math.hypot(m.x - e.x, m.y - e.y) <= 1 + r1 + r2;
          }));
        };
        const validTargets = [...new Set(enemyModels.map(e => e.unitGroup))].filter(inRange);
        if (validTargets.length === 0) {
          // Shouldn't happen — skip by auto-confirming empty fight
          phaseBarContent = `<div class="phase-card-body">No enemies in Engagement Range for ${escHtml(groupLabel(groupId))}.</div>
            <button class="btn btn-primary" id="btn-skip-fight" style="margin-top:0.4rem;">Skip</button>`;
        } else {
          const tgtGroupId = validTargets[0];
          const result = window.Shooting.resolveMeleeAttacks(groupId, units, tgtGroupId);
          fightState = { mode: 'resolved', groupId, targetGroupId: tgtGroupId, result };
          phaseBarContent = fightResolvedHTML(groupId, tgtGroupId, result) +
            `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
              <button class="btn btn-primary" id="btn-confirm-fight">Confirm Fight</button>
            </div>`;
        }
      } else if (fightState && fightState.mode === 'resolved') {
        phaseBarContent = fightResolvedHTML(fightState.groupId, fightState.targetGroupId, fightState.result) +
          `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-confirm-fight">Confirm Fight</button>
          </div>`;
      } else {
        phaseBarContent = `<div class="phase-card-body">${PHASE_INSTRUCTIONS.fight}</div>`;
      }
    } else if (inAllocation && allocationState) {
      const pg          = pendingGroups[0];
      const aliveInGroup = Object.values(units).filter(u => u.unitGroup === pg.groupId && u.alive);
      const isAutoWipe  = pg.count >= aliveInGroup.length;
      phaseBarContent   = buildAllocationBarContent(pg, aliveInGroup, isAutoWipe);
    } else {
      // Non-active or other phases — show most recent shot summary if present
      const _lastEntry   = getShotLogEntries(turn.shotLog).slice(-1)[0];
      const lastShotHtml = _lastEntry ? `
        <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.5rem;border-left:2px solid rgba(255,255,255,0.12);padding-left:0.5rem;">
          ${(_lastEntry.summary || []).map(l => `<div>${escHtml(l)}</div>`).join('')}
        </div>` : '';
      const instruction = isActive
        ? PHASE_INSTRUCTIONS[turn.phase]
        : `Waiting for ${escHtml(activeName)} to complete the ${phaseLabel}…`;
      const endBtn = isActive
        ? `<div class="phase-card-action"><button class="btn btn-primary" id="btn-end-phase">End Phase</button></div>`
        : '';
      const bsHtml = turn.phase === 'command' ? battleShockLogHTML(turn.battleShockLog) : '';
      phaseBarContent = `<div class="phase-card-body">${instruction}</div>${bsHtml}${lastShotHtml}${endBtn}`;
    }

    document.getElementById('game-content').innerHTML = `
      <div class="game-topbar">
        <span class="game-topbar-title">Turn ${turn.number}</span>
        <span class="topbar-sep">·</span>
        <span style="font-size:0.75rem;color:var(--text-dim);">${escHtml(activeName)}</span>
        <span class="topbar-sep">·</span>
        <span class="phase-badge">${phaseLabel}</span>
        <span class="game-topbar-spacer"></span>
        <span class="cp-display">Guard CP: <span class="cp-value">${players.guard.cp}</span></span>
        <span class="cp-display" style="margin-left:0.75rem;">Eldar CP: <span class="cp-value">${players.eldar.cp}</span></span>
        ${mobilePanelTogglesHTML()}
        ${isDev ? `<button class="btn btn-ghost" id="btn-switch" style="margin-left:0.5rem;font-size:0.65rem;padding:0.2rem 0.6rem;">Switch → ${localFaction === 'guard' ? 'Eldar' : 'Guard'}</button>` : ''}
      </div>

      <div class="player-strips">
        <div class="player-strip guard-strip ${turn.activePlayer === 'guard' ? 'active-player' : ''}">
          <div class="faction-label">${escHtml(guardArmy)}</div>
          <div class="player-name">${escHtml(guardName)}</div>
          <div class="player-cp">${guardAlive} models · CP ${players.guard.cp}</div>
        </div>
        <div class="player-strip eldar-strip ${turn.activePlayer === 'eldar' ? 'active-player' : ''}">
          <div class="faction-label">${escHtml(eldarArmy)}</div>
          <div class="player-name">${escHtml(eldarName)}</div>
          <div class="player-cp">${eldarAlive} models · CP ${players.eldar.cp}</div>
        </div>
      </div>

      <div class="game-main">
        <div class="side-panel side-panel-left" id="panel-units">
          <div class="side-panel-title">Units</div>
          ${unitCardsHTML(units, localFaction)}
        </div>
        <div id="board-wrap" class="board-wrap"></div>
        <div class="side-panel side-panel-right" id="panel-dice">
          <div class="side-panel-title">Dice Log — Turn ${turn.number}</div>
          <div class="dice-log-scroll">
            ${diceLogHTML(turn.shotLog)}
          </div>
        </div>
      </div>
      <div class="phase-bar">
        <div class="phase-card" style="max-width:640px;width:100%;">
          <div class="phase-card-label">
            ${isDev ? `Dev · Viewing as ${localFaction}` : `You are ${localFaction}`}
            ${isActive ? ' · <strong>Your turn</strong>' : ''}
          </div>
          ${phaseBarContent}
        </div>
      </div>
      ${isDev ? `
        <div class="dev-panel">
          <span class="dev-panel-label">⚡ DEV</span>
          <div class="dev-preset-row">
            ${DEV_PRESETS.map(p =>
              `<button class="dev-preset-btn" data-preset="${p.key}" title="${escHtml(p.desc)}">${escHtml(p.label)}</button>`
            ).join('')}
          </div>
        </div>` : ''}
    `;

    // Board render options
    let boardOpts = {};
    if (moveState && moveState.mode === 'active') {
      boardOpts = {
        activeGroup:  moveState.groupId,
        snapshots:    moveState.snapshots,
        pending:      moveState.pending,
        onModelMoved: (unitId, x, y, allPositions) => {
          if (allPositions) Object.assign(moveState.pending, allPositions);
          else moveState.pending[unitId] = { x, y };
          renderBoard(game);
        }
      };
    } else if (inShooting && shootState && shootState.mode !== 'queue') {
      boardOpts = buildShootBoardOpts(game);
    } else if (inAllocation && allocationState) {
      const pg          = pendingGroups[0];
      const aliveInGroup = Object.values(units).filter(u => u.unitGroup === pg.groupId && u.alive);
      const isAutoWipe  = pg.count >= aliveInGroup.length;
      const onToggle    = isAutoWipe ? null : (uid) => {
        if (allocationState.selected.has(uid)) {
          allocationState.selected.delete(uid);
        } else if (allocationState.selected.size < pg.count) {
          allocationState.selected.add(uid);
        }
        renderBoard(game, {
          allocationGroup:    allocationState.groupId,
          allocationSelected: allocationState.selected,
          onModelToggled:     onToggle
        });
        const c = document.getElementById('allocation-selected-count');
        if (c) c.textContent = allocationState.selected.size;
        const b = document.getElementById('btn-confirm-allocation');
        if (b) b.disabled = allocationState.selected.size !== pg.count;
      };
      boardOpts = {
        allocationGroup:    allocationState.groupId,
        allocationSelected: allocationState.selected,
        onModelToggled:     onToggle
      };
    } else if (inCharge && chargeState) {
      boardOpts = buildChargeBoardOpts(game);
    }
    if (cardState.highlighted) boardOpts.highlightGroup = cardState.highlighted;

    renderBoard(game, boardOpts);

    // Shot tracer: detect new shotLog entry and animate a line from shooter → target
    if (turn.shotLog) {
      const keys      = Object.keys(turn.shotLog).sort();
      const newestKey = keys[keys.length - 1];
      if (newestKey && newestKey !== lastShotKey) {
        lastShotKey = newestKey;
        const entry    = turn.shotLog[newestKey];
        const allU     = Object.values(units);
        const shooters = allU.filter(u => u.unitGroup === entry.shooterGroup && u.alive);
        const targets  = allU.filter(u => u.unitGroup === entry.targetGroup);
        if (shooters.length && targets.length) {
          const cx = arr => arr.reduce((s, u) => s + u.x, 0) / arr.length;
          const cy = arr => arr.reduce((s, u) => s + u.y, 0) / arr.length;
          window.Board.playTracer(
            document.getElementById('board-wrap'),
            cx(shooters), cy(shooters),
            cx(targets),  cy(targets)
          );
        }
      }
    }

    bindMobilePanelToggles();
    attachListeners(game, units, turn, isDev, isActive, inMovement, inShooting, inCharge, inFight, isFightActive, currentFightEntry);
  }

  function renderBoard(game, extraOpts) {
    const el = document.getElementById('board-wrap');
    if (!el) return;
    let opts = extraOpts;
    if (opts === undefined) {
      if (moveState && moveState.mode === 'active') {
        opts = {
          activeGroup:  moveState.groupId,
          snapshots:    moveState.snapshots,
          pending:      moveState.pending,
          onModelMoved: (unitId, x, y, allPositions) => {
            if (allPositions) Object.assign(moveState.pending, allPositions);
            else moveState.pending[unitId] = { x, y };
            renderBoard(game);
          }
        };
      } else if (shootState && shootState.mode !== 'queue') {
        opts = buildShootBoardOpts(game);
      } else if (chargeState && chargeState.mode !== 'queue') {
        opts = buildChargeBoardOpts(game);
      } else {
        opts = {};
      }
    }
    if (cardState.highlighted) opts = { ...opts, highlightGroup: cardState.highlighted };
    const shocked = game.battleShocked;
    if (shocked) {
      const shockedSet = new Set(Object.keys(shocked).filter(k => shocked[k]));
      if (shockedSet.size > 0) opts = { ...opts, battleShockedGroups: shockedSet };
    }
    window.Board.render(game, el, opts);
  }

  function attachListeners(game, units, turn, isDev, isActive, inMovement, inShooting, inCharge, inFight, isFightActive, currentFightEntry) {
    if (isDev) {
      const sw = document.getElementById('btn-switch');
      if (sw) sw.addEventListener('click', switchPerspective);

      document.querySelectorAll('.dev-preset-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const preset = DEV_PRESETS.find(p => p.key === btn.dataset.preset);
          if (!preset) return;
          btn.disabled = true;
          lastShotKey = null;
          try {
            await window.GameState.devApplyPreset(currentGameId, preset.update());
          } finally {
            btn.disabled = false;
          }
        });
      });
    }

    if (inShooting && shootState) {
      if (shootState.mode === 'queue') {
        document.querySelectorAll('[data-shoot-group]').forEach(btn => {
          btn.addEventListener('click', () => {
            activateShooterGroup(btn.dataset.shootGroup, units, game.terrain || {});
            renderBoard(game, buildShootBoardOpts(game));
            rerenderShootBar(game, units, turn, isDev, isActive);
          });
        });
      } else if (shootState.mode === 'targeting') {
        const skipBtn   = document.getElementById('btn-skip-shoot');
        const cancelBtn = document.getElementById('btn-cancel-shoot');
        if (skipBtn) skipBtn.addEventListener('click', async () => {
          skipBtn.disabled = true;
          skipBtn.innerHTML = '<span class="spinner"></span>';
          const shooterIds = Object.values(units)
            .filter(u => u.unitGroup === shootState.groupId && u.alive).map(u => u.id);
          try {
            await window.GameState.confirmUnitShoot(currentGameId, shooterIds, {}, null, units);
          } catch (_) { rerenderShootBar(game, units, turn, isDev, isActive); }
        });
        if (cancelBtn) cancelBtn.addEventListener('click', () => {
          shootState = { mode: 'queue' };
          renderBoard(game, {});
          rerenderShootBar(game, units, turn, isDev, isActive);
        });
      } else if (shootState.mode === 'resolved') {
        const confirmBtn = document.getElementById('btn-confirm-shoot');
        if (confirmBtn) confirmBtn.addEventListener('click', async () => {
          confirmBtn.disabled = true;
          confirmBtn.innerHTML = '<span class="spinner"></span>';
          const shooterIds = Object.values(units)
            .filter(u => u.unitGroup === shootState.groupId && u.alive).map(u => u.id);
          // Dice roll happens here — the only place real randomness is introduced
          const result = window.Shooting.resolveAttacks(
            shootState.groupId, units, shootState.targetGroupId, shootState.cover, game.terrain || {}
          );

          // Wipe vs deferred: compare dead count to effective alive (alive − existing pending)
          const tgtGrpId        = shootState.targetGroupId;
          const aliveInTarget   = Object.values(units).filter(u => u.unitGroup === tgtGrpId && u.alive);
          const existingPending = ((game.pendingCasualties || {})[tgtGrpId]) || 0;
          const effectiveAlive  = aliveInTarget.length - existingPending;
          const deadCount       = Object.values(result.casualties).filter(c => !c.alive).length;
          const isWipe          = deadCount >= effectiveAlive;

          let finalCasualties, deferred, clearPendingGroup;
          if (isWipe && aliveInTarget.length > 0) {
            // Mark ALL alive models dead (covers pending + newly killed)
            finalCasualties   = {};
            aliveInTarget.forEach(u => { finalCasualties[u.id] = { woundsLeft: 0, alive: false }; });
            deferred          = null;
            clearPendingGroup = existingPending > 0 ? tgtGrpId : null;
          } else if (deadCount > 0) {
            finalCasualties   = {};
            deferred          = { [tgtGrpId]: deadCount };
            clearPendingGroup = null;
          } else {
            finalCasualties   = result.casualties;
            deferred          = null;
            clearPendingGroup = null;
          }

          const shotEntry = {
            shooterGroup: shootState.groupId,
            targetGroup:  tgtGrpId,
            rolls:        result.rolls,
            summary:      result.summary
          };
          try {
            await window.GameState.confirmUnitShoot(
              currentGameId, shooterIds, finalCasualties, shotEntry, units, deferred, clearPendingGroup
            );
          } catch (_) {
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Shooting'; }
          }
        });
      }
    }

    if (inMovement && moveState) {
      if (moveState.mode === 'queue') {
        // Unit-select buttons
        document.querySelectorAll('[data-group]').forEach(btn => {
          btn.addEventListener('click', () => {
            activateGroup(btn.dataset.group, units);
            // Auto-render board immediately with active group
            renderBoard(game, {
              activeGroup:  moveState.groupId,
              snapshots:    moveState.snapshots,
              pending:      moveState.pending,
              onModelMoved: (unitId, x, y, allPositions) => {
                if (allPositions) Object.assign(moveState.pending, allPositions);
                else moveState.pending[unitId] = { x, y };
                renderBoard(game);
              }
            });
            // Re-render phase bar without full DOM reset
            rerenderPhaseBar(game, units, turn, isDev, isActive);
          });
        });

        // W40K-UX2 item 3: undo an already-moved group back into the queue.
        document.querySelectorAll('[data-undo-move-group]').forEach(btn => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try { await window.GameState.undoMove(currentGameId, btn.dataset.undoMoveGroup); }
            finally { btn.disabled = false; }
          });
        });
      } else if (moveState.mode === 'active') {
        const confirmBtn = document.getElementById('btn-confirm-move');
        const cancelBtn  = document.getElementById('btn-cancel-move');

        if (confirmBtn) {
          confirmBtn.addEventListener('click', async () => {
            // Build final positions: pending override → original Firebase position
            const rawPositions = {};
            const groupModels = [];
            Object.values(units).forEach(u => {
              if (u.unitGroup === moveState.groupId && u.alive) {
                rawPositions[u.id] = moveState.pending[u.id] || { x: u.x, y: u.y };
                groupModels.push(u);
              }
            });

            // W40K-UX2 item 4: auto-arrange into a clean grid on confirm,
            // centered on the centroid of wherever the player actually
            // dragged the models — keeps the direction/intent of the move,
            // just cleans up per-model overlaps/gaps ("a squatter should
            // look like a squad, not a scatter"). Same spacing/grid formula
            // deployment already uses (board.js's onDeployPlaced), applied
            // here on confirm instead of on every intermediate drag frame —
            // single-model groups are trivially already "arranged," so this
            // only matters for groupModels.length > 1.
            let positions = rawPositions;
            if (groupModels.length > 1) {
              const cx = groupModels.reduce((s, u) => s + rawPositions[u.id].x, 0) / groupModels.length;
              const cy = groupModels.reduce((s, u) => s + rawPositions[u.id].y, 0) / groupModels.length;
              const SPACING = 2;
              const cols  = Math.ceil(Math.sqrt(groupModels.length));
              const nRows = Math.ceil(groupModels.length / cols);
              const bW = game.boardWidth  || 44;
              const bH = game.boardHeight || 60;
              const arranged = {};
              groupModels.forEach((u, i) => {
                const x = cx + ((i % cols) - (cols - 1) / 2) * SPACING;
                const y = cy + (Math.floor(i / cols) - (nRows - 1) / 2) * SPACING;
                arranged[u.id] = {
                  x: parseFloat(Math.max(0, Math.min(bW, x)).toFixed(2)),
                  y: parseFloat(Math.max(0, Math.min(bH, y)).toFixed(2)),
                };
              });
              positions = arranged;
            }

            const coherencyOk = window.Board.calcCoherency(groupModels, positions);
            const hasRed = groupModels.length > 1 && groupModels.some(u => !coherencyOk.has(u.id));

            if (hasRed) {
              // Swap buttons for inline confirmation prompt
              const btnRow = confirmBtn.closest('div');
              btnRow.innerHTML = `
                <span style="font-size:0.8rem;color:var(--warning, #e8a838);align-self:center;">
                  This unit isn't in coherency. Confirm anyway?
                </span>
                <button class="btn btn-primary" id="btn-confirm-move-yes">Confirm</button>
                <button class="btn btn-ghost"   id="btn-confirm-move-no">Cancel</button>
              `;
              document.getElementById('btn-confirm-move-yes').addEventListener('click', async () => {
                const yesBtn = document.getElementById('btn-confirm-move-yes');
                if (yesBtn) { yesBtn.disabled = true; yesBtn.innerHTML = '<span class="spinner"></span>'; }
                try {
                  await window.GameState.confirmUnitMove(currentGameId, positions);
                } catch (_) {
                  rerenderPhaseBar(game, units, turn, isDev, isActive);
                }
              });
              document.getElementById('btn-confirm-move-no').addEventListener('click', () => {
                rerenderPhaseBar(game, units, turn, isDev, isActive);
              });
              return;
            }

            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="spinner"></span>';
            try {
              await window.GameState.confirmUnitMove(currentGameId, positions);
              // Firebase subscription will fire and re-render, transitioning back to queue
            } catch (_) {
              if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Movement'; }
            }
          });
        }

        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => {
            moveState = { mode: 'queue' };
            rerenderPhaseBar(game, units, turn, isDev, isActive);
            renderBoard(game, {});
          });
        }
      }
    }

    // Deferred casualty allocation confirm
    const allocBtn = document.getElementById('btn-confirm-allocation');
    if (allocBtn && allocationState) {
      allocBtn.addEventListener('click', async () => {
        allocBtn.disabled = true;
        allocBtn.innerHTML = '<span class="spinner"></span>';
        const { groupId }    = allocationState;
        const allocFaction   = isDev ? turn.activePlayer : localFaction;
        const pg             = getPendingCasGroups(game, allocFaction).find(g => g.groupId === groupId);
        if (!pg) return;
        const aliveInGroup   = Object.values(units).filter(u => u.unitGroup === groupId && u.alive);
        const isAutoWipe     = pg.count >= aliveInGroup.length;
        const deadIds        = isAutoWipe ? aliveInGroup.map(u => u.id) : [...allocationState.selected];
        try {
          await window.GameState.allocateCasualties(currentGameId, groupId, deadIds, units);
          allocationState = null;
        } catch (_) {
          if (allocBtn) { allocBtn.disabled = false; allocBtn.textContent = isAutoWipe ? 'Remove All Models' : 'Confirm Removal'; }
        }
      });
    }

    // Charge phase buttons
    if (inCharge && chargeState) {
      if (chargeState.mode === 'queue') {
        document.querySelectorAll('[data-charge-group]').forEach(btn => {
          btn.addEventListener('click', () => {
            const groupId = btn.dataset.chargeGroup;
            const chargeTargets = window.Shooting.findChargeTargets(groupId, units, game.terrain || {});
            chargeState = { mode: 'targeting', groupId, chargeTargets };
            renderBoard(game, buildChargeBoardOpts(game));
            rerenderChargeBar(game, units, turn, isDev, isActive);
          });
        });
      } else if (chargeState.mode === 'targeting') {
        const cancelBtn = document.getElementById('btn-cancel-charge');
        if (cancelBtn) cancelBtn.addEventListener('click', () => {
          chargeState = { mode: 'queue' };
          renderBoard(game, {});
          rerenderChargeBar(game, units, turn, isDev, isActive);
        });
      } else if (chargeState.mode === 'rolled') {
        const cancelBtn = document.getElementById('btn-cancel-charge');
        if (cancelBtn) cancelBtn.addEventListener('click', () => {
          chargeState = { mode: 'queue' };
          renderBoard(game, {});
          rerenderChargeBar(game, units, turn, isDev, isActive);
        });
        if (chargeState.success) {
          const confirmBtn = document.getElementById('btn-confirm-charge');
          if (confirmBtn) confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="spinner"></span>';
            const positions = {};
            Object.values(units).forEach(u => {
              if (u.unitGroup === chargeState.groupId && u.alive) {
                positions[u.id] = (chargeState.pending || {})[u.id] || { x: u.x, y: u.y };
              }
            });
            try {
              await window.GameState.confirmCharge(currentGameId, chargeState.groupId, positions);
            } catch (_) {
              if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Charge Move'; }
            }
          });
        } else {
          const okBtn = document.getElementById('btn-charge-failed-ok');
          if (okBtn) okBtn.addEventListener('click', async () => {
            okBtn.disabled = true;
            okBtn.innerHTML = '<span class="spinner"></span>';
            try {
              await window.GameState.failCharge(currentGameId, chargeState.groupId, units);
            } catch (_) {
              if (okBtn) { okBtn.disabled = false; okBtn.textContent = 'OK'; }
            }
          });
        }
      }
    }

    // Fight phase buttons
    if (inFight && isFightActive && fightState && fightState.mode === 'resolved') {
      const confirmFightBtn = document.getElementById('btn-confirm-fight');
      if (confirmFightBtn) confirmFightBtn.addEventListener('click', async () => {
        confirmFightBtn.disabled = true;
        confirmFightBtn.innerHTML = '<span class="spinner"></span>';
        const { groupId, targetGroupId, result } = fightState;

        const aliveInTarget   = Object.values(units).filter(u => u.unitGroup === targetGroupId && u.alive);
        const existingPending = ((game.pendingCasualties || {})[targetGroupId]) || 0;
        const effectiveAlive  = aliveInTarget.length - existingPending;
        const deadCount       = Object.values(result.casualties).filter(c => !c.alive).length;
        const isWipe          = deadCount >= effectiveAlive;

        let finalCasualties, deferred, clearPendingGroup;
        if (isWipe && aliveInTarget.length > 0) {
          finalCasualties   = {};
          aliveInTarget.forEach(u => { finalCasualties[u.id] = { woundsLeft: 0, alive: false }; });
          deferred          = null;
          clearPendingGroup = existingPending > 0 ? targetGroupId : null;
        } else if (deadCount > 0) {
          finalCasualties   = {};
          deferred          = { [targetGroupId]: deadCount };
          clearPendingGroup = null;
        } else {
          finalCasualties   = result.casualties;
          deferred          = null;
          clearPendingGroup = null;
        }

        const meleeEntry = {
          shooterGroup: groupId,
          targetGroup:  targetGroupId,
          rolls:        result.rolls,
          summary:      result.summary,
          type:         'melee'
        };
        const fighterIds = Object.values(units)
          .filter(u => u.unitGroup === groupId && u.alive).map(u => u.id);
        try {
          await window.GameState.confirmMeleeAttack(
            currentGameId, fighterIds, finalCasualties, deferred, clearPendingGroup,
            normalizeFightQueue(turn.fightQueue), units, meleeEntry
          );
        } catch (_) {
          if (confirmFightBtn) { confirmFightBtn.disabled = false; confirmFightBtn.textContent = 'Confirm Fight'; }
        }
      });
    }
    if (inFight && isFightActive && currentFightEntry) {
      const skipFightBtn = document.getElementById('btn-skip-fight');
      if (skipFightBtn) skipFightBtn.addEventListener('click', async () => {
        skipFightBtn.disabled = true;
        skipFightBtn.innerHTML = '<span class="spinner"></span>';
        const { groupId } = currentFightEntry;
        const fighterIds = Object.values(units)
          .filter(u => u.unitGroup === groupId && u.alive).map(u => u.id);
        try {
          await window.GameState.confirmMeleeAttack(
            currentGameId, fighterIds, {}, null, null,
            normalizeFightQueue(turn.fightQueue), units, null
          );
        } catch (_) {
          if (skipFightBtn) { skipFightBtn.disabled = false; skipFightBtn.textContent = 'Skip'; }
        }
      });
    }

    // End Phase button (queue mode or non-movement phases)
    const endBtn = document.getElementById('btn-end-phase');
    if (endBtn) {
      endBtn.addEventListener('click', () => handleEndPhase(game));
    }

    // Unit card panel — delegated listener so partial re-renders don't stack duplicates
    const cardPanel = document.getElementById('panel-units');
    if (cardPanel && !cardPanel.dataset.cardDelegated) {
      cardPanel.dataset.cardDelegated = '1';
      cardPanel.addEventListener('click', e => {
        const card = e.target.closest('[data-card-group]');
        if (!card) return;
        const gId = card.dataset.cardGroup;
        cardState.expanded    = cardState.expanded    === gId ? null : gId;
        cardState.highlighted = cardState.highlighted === gId ? null : gId;
        cardPanel.innerHTML = `<div class="side-panel-title">Units</div>` + unitCardsHTML(game.units || {}, localFaction);
        renderBoard(game);
      });
    }
  }

  // Partial re-render: only update phase-bar content without rebuilding the whole DOM
  function rerenderPhaseBar(game, units, turn, isDev, isActive) {
    const queue = unmovedeGroups(units, turn.activePlayer);
    const moved = movedGroups(units, turn.activePlayer);
    const endBtn = `<button class="btn btn-primary" id="btn-end-phase" style="margin-top:0.5rem;">End Phase</button>`;
    let html;
    if (moveState.mode === 'queue') {
      html = movementQueueHTML(queue, moved) + endBtn;
    } else {
      html = movementActiveHTML(moveState.groupId) +
        `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button class="btn btn-primary" id="btn-confirm-move">Confirm Movement</button>
          <button class="btn btn-ghost"   id="btn-cancel-move">Cancel</button>
        </div>`;
    }
    const card = document.querySelector('.phase-bar .phase-card');
    if (card) {
      // Preserve label row, replace content after it
      const label = card.querySelector('.phase-card-label');
      card.innerHTML = '';
      if (label) card.appendChild(label);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      while (tmp.firstChild) card.appendChild(tmp.firstChild);
    }
    attachListeners(game, units, turn, isDev, isActive, true);
  }

  function rerenderShootBar(game, units, turn, isDev, isActive) {
    const queue  = unShotGroups(units, turn.activePlayer);
    const endBtn = `<button class="btn btn-primary" id="btn-end-phase" style="margin-top:0.5rem;">End Phase</button>`;
    let html;
    if (shootState.mode === 'queue') {
      html = shootingQueueHTML(queue, getShotLogEntries(turn.shotLog)) + endBtn;
    } else if (shootState.mode === 'targeting') {
      const hasTargets = shootState.validTargets.length > 0;
      html = shootingTargetingHTML(shootState.groupId, shootState.validTargets, units, game.terrain) +
        `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          ${hasTargets ? '' : `<button class="btn btn-primary" id="btn-skip-shoot">Skip Shooting</button>`}
          <button class="btn btn-ghost" id="btn-cancel-shoot">Cancel</button>
        </div>`;
    } else {
      html = shootingResolvedHTML(shootState.groupId, shootState.targetGroupId, shootState.estimate) +
        `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button class="btn btn-primary" id="btn-confirm-shoot">Confirm Shooting</button>
        </div>`;
    }
    const card = document.querySelector('.phase-bar .phase-card');
    if (card) {
      const label = card.querySelector('.phase-card-label');
      card.innerHTML = '';
      if (label) card.appendChild(label);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      while (tmp.firstChild) card.appendChild(tmp.firstChild);
    }
    attachListeners(game, units, turn, isDev, isActive, false, true);
  }

  function rerenderChargeBar(game, units, turn, isDev, isActive) {
    const endBtn = `<button class="btn btn-primary" id="btn-end-phase" style="margin-top:0.5rem;">End Phase</button>`;
    let html;
    if (!chargeState || chargeState.mode === 'queue') {
      html = chargeQueueHTML(unchargedGroups(units, turn.activePlayer)) + endBtn;
    } else if (chargeState.mode === 'targeting') {
      html = chargeTargetingHTML(chargeState.groupId, chargeState.chargeTargets) +
        `<button class="btn btn-ghost" id="btn-cancel-charge" style="margin-top:0.4rem;">Cancel</button>`;
    } else if (chargeState.mode === 'rolled') {
      const { groupId, targetGroupId, d1, d2, roll, minGap, success } = chargeState;
      if (success) {
        html = chargeRolledHTML(groupId, targetGroupId, d1, d2, roll, minGap, true) +
          chargeMoveHTML(groupId, roll) +
          `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-confirm-charge">Confirm Charge Move</button>
            <button class="btn btn-ghost"   id="btn-cancel-charge">Cancel</button>
          </div>`;
      } else {
        html = chargeRolledHTML(groupId, targetGroupId, d1, d2, roll, minGap, false) +
          `<button class="btn btn-primary" id="btn-charge-failed-ok" style="margin-top:0.4rem;">OK</button>`;
      }
    } else {
      html = endBtn;
    }
    const card = document.querySelector('.phase-bar .phase-card');
    if (card) {
      const label = card.querySelector('.phase-card-label');
      card.innerHTML = '';
      if (label) card.appendChild(label);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      while (tmp.firstChild) card.appendChild(tmp.firstChild);
    }
    attachListeners(game, units, turn, isDev, isActive, false, false, true, false);
  }

  async function handleEndPhase(game) {
    const btn = document.getElementById('btn-end-phase');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    moveState   = null;
    shootState  = null;
    chargeState = null;
    fightState  = null;
    try {
      await window.GameState.advancePhase(currentGameId, game.turn);
    } catch (_) {
      const b = document.getElementById('btn-end-phase');
      if (b) { b.disabled = false; b.textContent = 'End Phase'; }
    }
  }

  function switchPerspective() {
    const next = localFaction === 'guard' ? 'eldar' : 'guard';
    window.GameState.setLocalFaction(currentGameId, next);
    localFaction = next;
    window.db.ref('games/' + currentGameId).once('value')
      .then(snap => { if (snap.exists()) render(snap.val()); });
  }

  function destroy() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    moveState        = null;
    shootState       = null;
    chargeState      = null;
    fightState       = null;
    cardState        = { expanded: null, highlighted: null };
    lastShotKey      = null;
    tieRerollPending = false;
    allocationState  = null;
    terrainState     = null;
    terrainPlacing   = false;
    deployPlacing    = false;
    groupLabelCache  = {};
  }

  return { init, destroy };
})();
