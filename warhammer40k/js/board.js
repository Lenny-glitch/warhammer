window.Board = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  let drag    = null;
  let docMove = null;
  let docUp   = null;

  // 40K-BLOOD-FX: last-known {wounds, alive} per unit id, used to detect a
  // wound/kill purely from state deltas (same pattern game.js's
  // lastShotKey already uses for the shot tracer) — never a local click,
  // so both clients independently see the identical Firebase write and
  // play the identical effect. Starts empty on every fresh page load; a
  // unit with no prior snapshot (first render after join/reload, OR a
  // squad that just deployed) is seeded silently with no effect, so
  // rejoining mid-game never replays every historical hit.
  let lastKnownHealth = {};

  // ---- SVG helpers ----

  function svgEl(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, String(v)));
    return e;
  }

  function clearEl(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function toSVG(svg, cx, cy) {
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  // ---- Pan/Zoom (MOBILE-2-40K) ----
  //
  // viewBox mutation ONLY — never a CSS transform on the SVG. Every
  // coordinate the game engine reads (drag positions, LOS, range,
  // toSVG() itself) stays in real board units regardless of zoom level;
  // pan/zoom is purely a local rendering concern, no game state, no
  // Firebase writes, and nothing the other player's client ever sees.
  //
  // Hand-rolled rather than a library: no build step in this project (a
  // dependency still means vendoring a file, so there's no integration-
  // cost win over hand-rolling), and general-purpose pan/zoom libraries
  // (panzoom, svg-pan-zoom, etc.) default to CSS-transform-based
  // implementations internally — exactly what this brief forbids for
  // coordinate-math-must-stay-untouched reasons, so using one would mean
  // fighting its own defaults rather than being handed anything for
  // free. viewBox pan/zoom is well-understood, small math, kept in this
  // one section rather than spread across the file.
  //
  // State persists per board SIZE across re-renders (render() rebuilds
  // the whole SVG element from scratch on every single Firebase update —
  // resetting to a fresh element would otherwise silently reset the
  // player's zoom/pan on every opponent action). Keyed by {bW,bH}; a
  // differently-sized board (different game) starts fresh at default.
  let viewBoxState = null; // { bW, bH, scale, cx, cy } | null

  const MIN_SCALE = 1; // fully zoomed out = the whole board (today's default view)
  const SMALLEST_TOKEN_DIAMETER = 1.0; // board units — "small" tier (0.5 radius), the worst case that must reach 44px

  function defaultViewBoxState(bW, bH) {
    return { bW, bH, scale: MIN_SCALE, cx: bW / 2, cy: bH / 2 };
  }

  function getViewBoxState(bW, bH) {
    if (!viewBoxState || viewBoxState.bW !== bW || viewBoxState.bH !== bH) {
      viewBoxState = defaultViewBoxState(bW, bH);
    }
    return viewBoxState;
  }

  // Dynamic max zoom — never a hardcoded number (the brief is explicit:
  // board dimensions vary 44x30 to 44x90, and a fixed cap is either too
  // shallow on big maps or pointlessly deep on small ones). Computed from
  // the SVG's actual on-screen size right now, so it also self-corrects
  // across an orientation change/resize.
  function computeMaxScale(svg, bW, bH) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return MIN_SCALE * 4; // not laid out yet — conservative fallback, corrected next render
    const defaultPxPerUnit = Math.min(rect.width / bW, rect.height / bH);
    const neededPxPerUnit  = 44 / SMALLEST_TOKEN_DIAMETER;
    return Math.max(MIN_SCALE, neededPxPerUnit / defaultPxPerUnit);
  }

  function viewBoxRect(state) {
    const w = state.bW / state.scale;
    const h = state.bH / state.scale;
    return { x: state.cx - w / 2, y: state.cy - h / 2, w, h };
  }

  function clampState(state, maxScale) {
    const scale = Math.max(MIN_SCALE, Math.min(maxScale, state.scale));
    const w = state.bW / scale, h = state.bH / scale;
    const minCx = w / 2, maxCx = state.bW - w / 2;
    const minCy = h / 2, maxCy = state.bH - h / 2;
    const cx = minCx > maxCx ? state.bW / 2 : Math.max(minCx, Math.min(maxCx, state.cx));
    const cy = minCy > maxCy ? state.bH / 2 : Math.max(minCy, Math.min(maxCy, state.cy));
    return { bW: state.bW, bH: state.bH, scale, cx, cy };
  }

  function applyViewBox(svg, state) {
    const r = viewBoxRect(state);
    svg.setAttribute('viewBox', `${r.x} ${r.y} ${r.w} ${r.h}`);
  }

  // Zoom by `factor` (>1 = in, <1 = out) holding board-space point
  // (bx,by) visually fixed — the "zoom centers on the gesture" requirement.
  function zoomAt(state, factor, bx, by, maxScale) {
    const newScale = state.scale * factor;
    const ratio = state.scale / newScale;
    const newCx = bx + (state.cx - bx) * ratio;
    const newCy = by + (state.cy - by) * ratio;
    return clampState({ bW: state.bW, bH: state.bH, scale: newScale, cx: newCx, cy: newCy }, maxScale);
  }

  function panByBoardDelta(state, dxBoard, dyBoard, maxScale) {
    return clampState({ ...state, cx: state.cx - dxBoard, cy: state.cy - dyBoard }, maxScale);
  }

  // Clamp tx/ty to within `max` inches of fx/fy along the same vector
  function clampVec(fx, fy, tx, ty, max) {
    const dx = tx - fx, dy = ty - fy;
    const d  = Math.hypot(dx, dy);
    if (d === 0 || d <= max) return { x: tx, y: ty };
    return { x: fx + (dx / d) * max, y: fy + (dy / d) * max };
  }

  function snapToGrid(x, y, bW, bH) {
    bW = bW || 44; bH = bH || 60;
    return {
      x: Math.max(0, Math.min(bW, Math.round(x / 2) * 2)),
      y: Math.max(0, Math.min(bH, Math.round(y / 2) * 2))
    };
  }

  // Movement allowance from gameData stats, falling back to UNIT_STATS
  function getUnitMove(unit) {
    if (!unit) return 6;
    const def = (unit.factionId && window.getRosterUnitDef)
      ? window.getRosterUnitDef(unit.factionId, unit.unitId) : null;
    if (def && def.stats && def.stats.M) return parseInt(String(def.stats.M)) || 6;
    return ((window.UNIT_STATS || {})[unit.type] || {}).move || 6;
  }

  // ---- Coherency ----

  // Returns set of unit IDs that satisfy coherency within their group.
  // Rule: each model needs ≥1 neighbour within 2" (≥2 if group size ≥7).
  // Single-model units are always in coherency — rule does not apply.
  function calcCoherency(groupModels, positions) {
    if (groupModels.length <= 1) {
      const ok = new Set();
      groupModels.forEach(u => ok.add(u.id));
      return ok;
    }
    const required = groupModels.length >= 7 ? 2 : 1;
    const ok = new Set();
    groupModels.forEach(a => {
      const pa = positions[a.id] || { x: a.x, y: a.y };
      const ra = ((window.UNIT_STATS || {})[a.type] || {}).baseRadius || 0.5;
      let count = 0;
      groupModels.forEach(b => {
        if (b.id === a.id) return;
        const pb = positions[b.id] || { x: b.x, y: b.y };
        const rb = ((window.UNIT_STATS || {})[b.type] || {}).baseRadius || 0.5;
        // base-edge-to-base-edge ≤ 2"
        if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= 2 + ra + rb) count++;
      });
      if (count >= required) ok.add(a.id);
    });
    return ok;
  }

  // ---- Coherency zones ----

  function drawCoherencyZones(parent, groupModels, positions, coherencyOk) {
    groupModels.forEach(u => {
      const pos   = positions[u.id] || { x: u.x, y: u.y };
      const ok    = coherencyOk.has(u.id);
      const color = ok ? '74,154,90' : '160,32,32';
      parent.appendChild(svgEl('circle', {
        cx: pos.x, cy: pos.y, r: 2,
        fill:         `rgba(${color},0.06)`,
        stroke:       `rgba(${color},0.35)`,
        'stroke-width': 0.15,
        'stroke-dasharray': '0.6 0.35'
      }));
    });
  }

  // ---- LOS lines (shooting phase visualisation) ----

  function drawLOSLines(parent, units, shooterGroup, terrain) {
    const all           = Object.values(units).filter(u => u.alive);
    const shooterModels = all.filter(u => u.unitGroup === shooterGroup);
    if (!shooterModels.length) return;

    const shooterFaction = shooterModels[0].faction;

    shooterModels.forEach(sm => {
      const range = ((window.UNIT_STATS || {})[sm.type]?.weapon?.range) || 0;

      all.forEach(tm => {
        if (tm.faction === shooterFaction) return;
        if (Math.hypot(sm.x - tm.x, sm.y - tm.y) > range) return;

        const result = window.Shooting.rayResult(sm.x, sm.y, tm.x, tm.y, terrain);
        if (result === 'blocked') return;

        const isCover = result === 'cover';
        parent.appendChild(svgEl('line', {
          x1: sm.x, y1: sm.y, x2: tm.x, y2: tm.y,
          stroke:            isCover ? 'rgba(201,168,76,0.35)' : 'rgba(74,154,90,0.35)',
          'stroke-width':    0.12,
          'stroke-dasharray': isCover ? '0.4 0.3' : 'none',
          'stroke-linecap':  'round',
        }));
      });
    });
  }

  // ---- Board layers ----

  function buildDefs(svg) {
    const defs   = svgEl('defs');

    // W40K-UX2 item 2: diagonal hatch for "YOUR ZONE" — a pattern reads as
    // "this is a marked-off area" at a glance in a way a flat tint alone
    // doesn't, per the brief's own "tint/hatch your half" wording.
    const hatch = svgEl('pattern', {
      id: 'my-zone-hatch', width: 2, height: 2,
      patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
    });
    hatch.appendChild(svgEl('rect', { width: 2, height: 2, fill: 'rgba(201,168,76,0.05)' }));
    hatch.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 2, stroke: 'rgba(201,168,76,0.35)', 'stroke-width': 0.35 }));
    defs.appendChild(hatch);

    const filter = svgEl('filter', { id: 'sel-glow', x: '-80%', y: '-80%', width: '260%', height: '260%' });
    [
      ['feGaussianBlur', { in: 'SourceAlpha', stdDeviation: '0.45', result: 'blur' }],
      ['feFlood',        { 'flood-color': '#c9a84c', result: 'color' }],
      ['feComposite',    { in: 'color', in2: 'blur', operator: 'in', result: 'glow' }],
    ].forEach(([tag, a]) => filter.appendChild(svgEl(tag, a)));
    const merge = svgEl('feMerge');
    ['glow', 'SourceGraphic'].forEach(n => {
      const node = svgEl('feMergeNode'); node.setAttribute('in', n); merge.appendChild(node);
    });
    filter.appendChild(merge);
    defs.appendChild(filter);
    svg.appendChild(defs);
  }

  // MOBILE-2-40K item 4: the ONE source of truth for grid square size —
  // the scale indicator reads this same constant rather than a second,
  // independently-hardcoded "2". Verified against source: this is a flat
  // constant, not derived per board size, so — divergence from the
  // brief's own expectation — "1 square = X inches" does NOT actually
  // vary across combat-patrol/incursion/strike-force; all three just
  // differ in how many squares fit, not square size. Still sourced from
  // this real constant rather than assumed, in case that ever changes.
  const GRID_SQUARE_INCHES = 2;

  function drawGrid(parent, bW, bH) {
    bW = bW || 44; bH = bH || 60;
    const g = svgEl('g');
    for (let x = 0; x <= bW; x += GRID_SQUARE_INCHES) {
      g.appendChild(svgEl('line', { x1: x, y1: 0, x2: x, y2: bH, stroke: 'rgba(255,255,255,0.04)', 'stroke-width': 0.12 }));
    }
    for (let y = 0; y <= bH; y += GRID_SQUARE_INCHES) {
      g.appendChild(svgEl('line', { x1: 0, y1: y, x2: bW, y2: y, stroke: 'rgba(255,255,255,0.04)', 'stroke-width': 0.12 }));
    }
    g.appendChild(svgEl('line', {
      x1: 0, y1: bH / 2, x2: bW, y2: bH / 2,
      stroke: 'rgba(255,255,255,0.12)', 'stroke-width': 0.2, 'stroke-dasharray': '1 1'
    }));
    parent.appendChild(g);
  }

  const TERRAIN_TIER_FILL   = { rough: '#1e1a10', chestHigh: '#141e12', tall: '#0e1018' };
  const TERRAIN_TIER_STROKE = { rough: '#5a4830', chestHigh: '#3a5028', tall: '#30384a' };

  function terrainGhostFill(tier) {
    if (tier === 'rough')     return 'rgba(90,72,48,0.55)';
    if (tier === 'chestHigh') return 'rgba(48,80,40,0.55)';
    return 'rgba(40,48,80,0.55)';
  }
  function terrainGhostStroke(tier) {
    return TERRAIN_TIER_STROKE[tier] || '#4a3820';
  }

  function drawTerrain(parent, terrain) {
    Object.entries(terrain || {}).forEach(([key, tier]) => {
      const [gx, gy] = key.split(',').map(Number);
      parent.appendChild(svgEl('rect', {
        x: gx, y: gy, width: 1, height: 1,
        fill:   TERRAIN_TIER_FILL[tier]   || '#1e1a10',
        stroke: TERRAIN_TIER_STROKE[tier] || '#4a3820',
        'stroke-width': 0.05
      }));
    });
  }

  const ABBREV = { infantry: 'G', sergeant: 'Sgt', guardian: 'E' };

  // W40K-UX2 item 1: VISUAL token size only — never read by calcCoherency,
  // range, or LOS math (those keep UNIT_STATS's plain baseRadius default;
  // changing them would shift real gameplay outcomes, which the brief puts
  // out of scope). Checked directly: gameData's own `baseRadius` field is
  // uniformly 0.5 for every real unit in the flat pool, vehicles and
  // titanic units included — there's no per-unit mm data to read, so this
  // derives a coarse tier from the unit's own keywords instead, exactly as
  // the brief allows when real base-size data doesn't exist. Priority
  // order matters (TITANIC beats VEHICLE, e.g. a Titanic walker) — checked
  // most-extreme-first.
  const SIZE_TIER_RADIUS = { titanic: 1.4, large: 0.95, medium: 0.7, small: 0.5 };
  function getTokenVisualRadius(u) {
    const def = (u.factionId && window.getRosterUnitDef)
      ? window.getRosterUnitDef(u.factionId, u.unitId) : null;
    const kw = new Set((def && def.keywords) || []);
    let tier = 'small';
    if (kw.has('TITANIC')) tier = 'titanic';
    else if (kw.has('VEHICLE') || kw.has('MONSTER') || kw.has('WALKER') || kw.has('FORTIFICATION')) tier = 'large';
    else if (kw.has('MOUNTED') || kw.has('ARTILLERY')) tier = 'medium';
    return SIZE_TIER_RADIUS[tier];
  }

  // 40K-BLOOD-FX: pure state-diff, no drawing — collects {x,y,kind,
  // intensity} for any unit whose wounds dropped or who just died since
  // the LAST time this render loop saw it. Reacts only to real
  // `u.wounds`/`u.alive` (the actual Firebase-synced fields), never a
  // client-local `pending` drag overlay, so it can't fire from a purely
  // local action and both clients compute the identical result from the
  // identical synced state. Damage magnitude (prev - current, or
  // whatever was left at the moment of death) is cheap to derive from
  // the snapshot already being kept, so intensity scales with it rather
  // than being flat.
  function collectHitFX(u, x, y, sink) {
    const prev = lastKnownHealth[u.id];
    lastKnownHealth[u.id] = { wounds: u.wounds, alive: u.alive };
    if (!prev) return; // no prior snapshot — first sight of this unit, don't fire
    if (prev.alive && !u.alive) {
      sink.push({ x, y, kind: 'kill', intensity: Math.max(1, prev.wounds) });
    } else if (u.alive && u.wounds < prev.wounds) {
      sink.push({ x, y, kind: 'wound', intensity: prev.wounds - u.wounds });
    }
  }

  function drawUnits(parent, units, opts) {
    const { activeGroup, pending, snapshots, coherencyOk,
            shooterGroup, validTargetGroups, selectedTargetGroup,
            highlightGroup, allocationGroup, allocationSelected,
            battleShockedGroups } = opts;
    const allModels = Object.values(units);

    const inShootMode  = !!shooterGroup;
    const showCoherency = activeGroup && coherencyOk;

    // Collected during the loop below, played AFTER every token is drawn
    // so the effect always paints on top regardless of unit draw order
    // (appending mid-loop could land a hit flash underneath a
    // later-drawn token).
    const hitFxTriggers = [];

    allModels.forEach(u => {
      // W40K-UX1 item 1: readable name for the hover tooltip — roster-built
      // units carry their own `label` (see roster.js's buildUnitsFromRoster);
      // legacy dev-preset units (units.js's buildInitialUnits) have none, so
      // fall back to the same guard_squad/eldar_squad names game.js's
      // groupLabel() uses, then the type string itself (still more readable
      // than a raw id).
      const unitLabel = u.label
        || (u.unitGroup === 'guard_squad' ? 'Infantry Squad' : null)
        || (u.unitGroup === 'eldar_squad' ? 'Guardian Defenders' : null)
        || u.type;

      // Destroyed token — generic, works for any model type
      if (!u.alive) {
        collectHitFX(u, u.x, u.y, hitFxTriggers);
        const r = getTokenVisualRadius(u);
        const g = svgEl('g', { 'data-unit-id': u.id, 'data-unit-group': u.unitGroup, class: 'token-hoverable' });
        g.style.opacity = '0.38';
        const title = svgEl('title', {});
        title.textContent = `${unitLabel} — destroyed`;
        g.appendChild(title);
        g.appendChild(svgEl('circle', { cx: u.x, cy: u.y, r, fill: '#1a1a1a', stroke: '#444', 'stroke-width': 0.2 }));
        const skull = svgEl('text', {
          x: u.x, y: u.y + r * 0.38,
          'text-anchor': 'middle', 'font-size': r * 0.95,
          'font-family': 'sans-serif', fill: '#555'
        });
        skull.textContent = '☠';
        g.appendChild(skull);
        parent.appendChild(g);
        return;
      }
      const isGuard  = u.faction === 'guard';
      const inActive = u.unitGroup === activeGroup;
      const fill     = isGuard ? '#8a9a5b' : '#4a8fb5';
      const stroke   = isGuard ? '#c8d4a0' : '#a0c8e8';
      const abbrev   = ABBREV[u.type] || u.type[0].toUpperCase();
      const r        = getTokenVisualRadius(u);

      // Effective position: pending override → Firebase
      const pos = (pending && pending[u.id]) ? pending[u.id] : { x: u.x, y: u.y };
      collectHitFX(u, pos.x, pos.y, hitFxTriggers);

      const g = svgEl('g', { 'data-unit-id': u.id, 'data-unit-group': u.unitGroup, class: 'token-hoverable' });
      const title = svgEl('title', {});
      title.textContent = `${unitLabel} — ${u.wounds}/${u.maxWounds}W`;
      g.appendChild(title);

      if (inShootMode) {
        const isShooter      = u.unitGroup === shooterGroup;
        const isValidTarget  = validTargetGroups && validTargetGroups.has(u.unitGroup);
        const isSelected     = u.unitGroup === selectedTargetGroup;
        if (!isShooter && !isValidTarget) g.style.opacity = '0.25';
        if (isValidTarget && !isSelected)  g.style.cursor = 'crosshair';
        if (isSelected)                    g.style.cursor = 'crosshair';
      } else {
        // Dim other-group tokens while a unit is active
        if (activeGroup && !inActive) g.style.opacity = '0.45';
        if (inActive) g.style.cursor = 'grab';
        // Charge targeting: show crosshair on valid targets (no shooterGroup in charge mode)
        if (!activeGroup && validTargetGroups && validTargetGroups.has(u.unitGroup)) {
          g.style.cursor = 'crosshair';
        }
      }

      // Invisible hit area — larger than visible token to ease clicking (visible circle is r=0.5, hit area r=0.7)
      g.appendChild(svgEl('circle', {
        cx: pos.x, cy: pos.y, r: Math.max(r, 0.7),
        fill: 'rgba(0,0,0,0)', stroke: 'none'
      }));
      g.appendChild(svgEl('circle', {
        cx: pos.x, cy: pos.y, r,
        fill: fill + '40', stroke,
        'stroke-width': r * 0.24,
        class: 'token-circle'
      }));

      // Health sector — missing wounds as red pie wedge inside token
      // Starts at 12 o'clock, grows clockwise. Drawn before text so text stays readable on top.
      // Inner radius (r*0.82) keeps sector well inside the token, clear of the perimeter coherency dot.
      if (u.wounds < u.maxWounds) {
        const missing = (u.maxWounds - u.wounds) / u.maxWounds;
        const ri      = r * 0.82;
        const sa      = -Math.PI / 2;                     // 12 o'clock
        const ea      = sa + (2 * Math.PI * missing);
        const x1      = (pos.x + ri * Math.cos(sa)).toFixed(3);
        const y1      = (pos.y + ri * Math.sin(sa)).toFixed(3);
        const x2      = (pos.x + ri * Math.cos(ea)).toFixed(3);
        const y2      = (pos.y + ri * Math.sin(ea)).toFixed(3);
        const la      = missing > 0.5 ? 1 : 0;
        const d       = `M ${pos.x} ${pos.y} L ${x1} ${y1} A ${ri} ${ri} 0 ${la} 1 ${x2} ${y2} Z`;
        g.appendChild(svgEl('path', { d, fill: 'rgba(180,30,30,0.6)', stroke: 'none' }));
      }

      const label = svgEl('text', {
        x: pos.x, y: pos.y + r * 0.4,
        'text-anchor': 'middle', fill: stroke,
        'font-size': r * 0.9,
        'font-family': 'sans-serif', 'font-weight': 700
      });
      label.textContent = abbrev;
      g.appendChild(label);

      // 40K-INFO-LEGIBILITY item 1: the health sector above only ever draws
      // MISSING wounds as a red wedge — at full health that's correctly a
      // 0° wedge, i.e. nothing, so a 13-wound Leman Russ and a 1-wound
      // trooper looked identical until the first hit landed. That sector
      // alone can never fix this even with its gate removed: a percentage
      // (0% missing) can't distinguish absolute magnitude at full health.
      // Reusing the same technique as the `abbrev` label above (a plain
      // always-drawn text, not a new widget) to show the actual wounds
      // count/max — visible to BOTH players (this whole render path has no
      // per-viewer branching), same tooltip numbers already carried, just
      // no longer hover-only. Damaged state reuses the wedge's own red so
      // the two signals read as one system, not two competing ones.
      const woundsLabel = svgEl('text', {
        x: pos.x, y: pos.y + r * 1.9,
        'text-anchor': 'middle',
        fill: u.wounds < u.maxWounds ? 'rgba(220,70,70,0.95)' : stroke,
        'font-size': Math.max(r * 0.55, 0.32),
        'font-family': 'sans-serif', 'font-weight': 700
      });
      woundsLabel.textContent = `${u.wounds}/${u.maxWounds}`;
      g.appendChild(woundsLabel);

      // Passive card-highlight ring (gold, non-interactive)
      if (highlightGroup && u.unitGroup === highlightGroup) {
        g.insertBefore(svgEl('circle', {
          cx: pos.x, cy: pos.y, r: r * 1.28,
          fill: 'none', stroke: 'rgba(201,168,76,0.55)', 'stroke-width': 0.18
        }), g.firstChild);
      }

      // Battle-shocked ring — orange dashed border, persists until cleared next Command Phase
      if (battleShockedGroups && battleShockedGroups.has(u.unitGroup)) {
        g.insertBefore(svgEl('circle', {
          cx: pos.x, cy: pos.y, r: r * 1.5,
          fill: 'none',
          stroke: 'rgba(220,110,0,0.82)',
          'stroke-width': 0.28,
          'stroke-dasharray': '0.35 0.25'
        }), g.firstChild);
      }

      // Casualty allocation ring — amber (unselected) or red (selected for removal)
      if (allocationGroup && u.unitGroup === allocationGroup) {
        const isChosen = allocationSelected && allocationSelected.has(u.id);
        g.insertBefore(svgEl('circle', {
          cx: pos.x, cy: pos.y, r: r * 1.45,
          fill:               isChosen ? 'rgba(232,64,64,0.1)' : 'none',
          stroke:             isChosen ? '#e84040' : 'rgba(201,168,76,0.5)',
          'stroke-width':     isChosen ? 0.3 : 0.18,
          'stroke-dasharray': isChosen ? '0.4 0.15' : '0.5 0.3',
        }), g.firstChild);
        g.style.cursor = 'pointer';
      }

      // Target rings for shooting and charge targeting (drawn behind everything else via insertBefore)
      if (validTargetGroups && validTargetGroups.has(u.unitGroup)) {
        const isSelected = u.unitGroup === selectedTargetGroup;
        g.insertBefore(svgEl('circle', {
          cx: pos.x, cy: pos.y, r: r * 1.45,
          fill: 'none',
          stroke: isSelected ? '#e84040' : '#c9a84c',
          'stroke-width': 0.2,
          'stroke-dasharray': isSelected ? '0.5 0.2' : '0.6 0.35',
          opacity: 0.85
        }), g.firstChild);
      }

      // Coherency dot (top-left of token, on the perimeter — drawn after sector so it's always visible)
      if (showCoherency && inActive) {
        const cohOk  = coherencyOk.has(u.id);
        const dotCol = cohOk ? '#4a9a5a' : '#a02020';
        g.appendChild(svgEl('circle', {
          cx: pos.x - r * 0.73, cy: pos.y - r * 0.73, r: r * 0.29,
          fill: dotCol, stroke: cohOk ? '#6aba7a' : '#c03030', 'stroke-width': r * 0.12
        }));
      }

      // Ghost at snapshot position while dragging this specific model
      if (snapshots && snapshots[u.id] && inActive) {
        const sp = snapshots[u.id];
        const hasMoved = pending && pending[u.id] &&
          (pending[u.id].x !== sp.x || pending[u.id].y !== sp.y);
        if (hasMoved) {
          g.appendChild(svgEl('circle', {
            cx: sp.x, cy: sp.y, r: r * 0.7,
            fill: 'none', stroke: stroke + '40', 'stroke-width': 0.18,
            'stroke-dasharray': '0.5 0.3'
          }));
        }
      }

      parent.appendChild(g);
    });

    // Play collected hit/kill effects AFTER every token is drawn, so a
    // flash always paints on top regardless of unit draw order.
    if (window.HitFX && hitFxTriggers.length) {
      hitFxTriggers.forEach(t => window.HitFX.play(parent, t.x, t.y, { kind: t.kind, intensity: t.intensity }));
    }
  }

  // ---- Terrain collision ----

  // True if a circle at (cx,cy) with radius r overlaps a rect (strictly inside, not just touching edge)
  function circleOverlapsRect(cx, cy, r, rect) {
    const nearX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
    const nearY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
    return Math.hypot(cx - nearX, cy - nearY) < r;
  }

  function circleOverlapsCircle(ax, ay, ar, bx, by, br) {
    return Math.hypot(ax - bx, ay - by) < ar + br;
  }

  // Check a circle against the per-square terrain map. Only checks squares in the model's bounding box.
  function modelOverlapsTerrain(cx, cy, r, terrain) {
    const minGX = Math.floor(cx - r);
    const maxGX = Math.floor(cx + r);
    const minGY = Math.floor(cy - r);
    const maxGY = Math.floor(cy + r);
    for (let gx = minGX; gx <= maxGX; gx++) {
      for (let gy = minGY; gy <= maxGY; gy++) {
        if (!terrain[`${gx},${gy}`]) continue;
        if (circleOverlapsRect(cx, cy, r, { x: gx, y: gy, width: 1, height: 1 })) return true;
      }
    }
    return false;
  }

  // ---- LOS preview (drag) ----

  function countVisibleEnemies(fromX, fromY, enemies, terrain, weaponRange) {
    let count = 0;
    for (const e of enemies) {
      if (Math.hypot(e.x - fromX, e.y - fromY) > weaponRange) continue;
      if (window.Shooting.rayResult(fromX, fromY, e.x, e.y, terrain) !== 'blocked') count++;
    }
    return count;
  }

  function updateLOSLabel(labelG, x, y, count) {
    clearEl(labelG);
    // Anchor top-right of model, clamped to SVG bounds
    const lx = Math.min(41.5, x + 1.5);
    const ly = Math.max(1.2,  y - 1.7);
    const color = count > 0 ? '#c9a84c' : '#555';
    labelG.appendChild(svgEl('rect', {
      x: lx - 0.2, y: ly - 0.75, width: 4.6, height: 1.0,
      fill: 'rgba(11,18,9,0.85)', rx: 0.25
    }));
    const txt = svgEl('text', {
      x: lx + 2.1, y: ly + 0.06,
      'text-anchor': 'middle', fill: color,
      'font-size': 0.82, 'font-family': 'sans-serif', 'font-weight': 700
    });
    txt.textContent = `${count} visible`;
    labelG.appendChild(txt);
  }

  // ---- Shot tracer ----

  function playTracer(boardWrap, x1, y1, x2, y2) {
    const svg = boardWrap && boardWrap.querySelector('svg.board-svg');
    if (!svg) return;
    const line = svgEl('line', {
      x1, y1, x2, y2,
      stroke: '#e8c840', 'stroke-width': 0.25,
      class: 'tracer-line', 'pointer-events': 'none'
    });
    svg.appendChild(line);
    line.addEventListener('animationend', () => line.remove());
  }

  // ---- Measurement arrow ----

  function updateArrow(overlay, x0, y0, x1, y1) {
    clearEl(overlay);
    const dist = Math.hypot(x1 - x0, y1 - y0);
    if (dist < 0.05) return;

    overlay.appendChild(svgEl('line', {
      x1: x0, y1: y0, x2: x1, y2: y1,
      stroke: '#c9a84c', 'stroke-width': 0.22, 'stroke-dasharray': '0.7 0.35'
    }));
    overlay.appendChild(svgEl('circle', { cx: x0, cy: y0, r: 0.28, fill: '#c9a84c' }));

    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    overlay.appendChild(svgEl('rect', {
      x: mx - 1.6, y: my - 1.05, width: 3.2, height: 1.45,
      fill: '#0b1209', rx: 0.3, opacity: 0.88
    }));
    const txt = svgEl('text', {
      x: mx, y: my + 0.28,
      'text-anchor': 'middle', fill: '#c9a84c',
      'font-size': 1.1, 'font-family': 'sans-serif', 'font-weight': 700
    });
    txt.textContent = dist.toFixed(1) + '"';
    overlay.appendChild(txt);
  }

  // ---- Drag interaction ----

  function setupInteraction(svg, units, opts) {
    if (!opts) return;

    const bW = opts.bW || 44;
    const bH = opts.bH || 60;

    const { activeGroup, snapshots, pending, onModelMoved,
            validTargetGroups, onTargetSelected, terrain,
            allocationGroup, onModelToggled } = opts;

    // ---- Pan/Zoom gestures (MOBILE-2-40K) ----
    // Always wired, in every phase/mode — this is a SEPARATE listener set
    // from the mode-specific ones below, not a replacement, and the two
    // are designed not to fight: one-finger-on-a-token is left alone
    // entirely here (movement's own pointerdown already owns that, and
    // simply returns early if the target isn't a token it cares about),
    // and one-finger-on-empty-board only starts a pan for TOUCH input —
    // desktop's left button is untouched everywhere (movement drag,
    // terrain paint, deployment click, casualty/target click all still
    // fire exactly as before) precisely so none of those regress.
    // Pinch (2 fingers) has no collision with anything in this app and is
    // always available. Terrain paint is the one deliberate exception:
    // one-finger-drag-on-empty-board already means "paint" there, so
    // one-finger pan is disabled while paint mode is armed (matches the
    // brief's own suggested resolution) — pinch-zoom still works.
    {
      const paintModeActive = !!(opts.terrainPlacement && opts.onTerrainStroke);
      const activePointers  = new Map(); // pointerId -> {x,y}
      let pinchPrev = null;              // { dist, midX, midY } | null
      let panState  = null;              // { pointerId, lastX, lastY } | null

      const currentMaxScale = () => computeMaxScale(svg, bW, bH);

      svg.addEventListener('pointerdown', e => {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 2) {
          panState = null; // a pinch starting always wins over a single-finger pan
          const pts  = [...activePointers.values()];
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          pinchPrev  = { dist, midX: (pts[0].x + pts[1].x) / 2, midY: (pts[0].y + pts[1].y) / 2 };
          e.preventDefault();
          return;
        }
        if (activePointers.size > 2) return; // ignore a 3rd+ finger entirely

        if (e.pointerType === 'mouse') {
          if (e.button === 1) { // middle-drag = desktop pan (brief: pick one, report which)
            panState = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
            e.preventDefault();
          }
          return; // left/right button: untouched, existing mode-specific handlers own it
        }

        // Touch (or pen): one finger on EMPTY board pans, unless paint mode
        // has first claim on empty-board drags.
        const onToken = !!e.target.closest('[data-unit-id]');
        if (!paintModeActive && !onToken) {
          panState = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
        }
      });

      svg.addEventListener('pointermove', e => {
        if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size >= 2 && pinchPrev) {
          const pts  = [...activePointers.values()].slice(0, 2);
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
          if (dist > 0 && pinchPrev.dist > 0) {
            const factor = dist / pinchPrev.dist;
            const state  = getViewBoxState(bW, bH);
            // Both midpoints converted through the SAME (current, not-yet-
            // updated) viewBox — their difference is a valid board-space
            // delta regardless of the scale change also happening this frame.
            const oldMid = toSVG(svg, pinchPrev.midX, pinchPrev.midY);
            const newMid = toSVG(svg, midX, midY);
            let next = zoomAt(state, factor, oldMid.x, oldMid.y, currentMaxScale());
            next = clampState({ ...next, cx: next.cx - (newMid.x - oldMid.x), cy: next.cy - (newMid.y - oldMid.y) }, currentMaxScale());
            viewBoxState = next;
            applyViewBox(svg, next);
          }
          pinchPrev = { dist, midX, midY };
          e.preventDefault();
          return;
        }

        if (panState && e.pointerId === panState.pointerId) {
          const dxScreen = e.clientX - panState.lastX;
          const dyScreen = e.clientY - panState.lastY;
          panState.lastX = e.clientX;
          panState.lastY = e.clientY;
          const rect  = svg.getBoundingClientRect();
          const state = getViewBoxState(bW, bH);
          const pxPerUnit = Math.min(rect.width / bW, rect.height / bH) * state.scale;
          if (pxPerUnit > 0) {
            const next = panByBoardDelta(state, dxScreen / pxPerUnit, dyScreen / pxPerUnit, currentMaxScale());
            viewBoxState = next;
            applyViewBox(svg, next);
          }
          e.preventDefault();
        }
      });

      const releasePointer = e => {
        activePointers.delete(e.pointerId);
        if (activePointers.size < 2) pinchPrev = null;
        if (panState && e.pointerId === panState.pointerId) panState = null;
      };
      svg.addEventListener('pointerup',     releasePointer);
      svg.addEventListener('pointercancel', releasePointer);

      // Desktop: wheel = zoom, centered on the cursor, must not scroll the page.
      svg.addEventListener('wheel', e => {
        e.preventDefault();
        const state   = getViewBoxState(bW, bH);
        const boardPt = toSVG(svg, e.clientX, e.clientY);
        const factor  = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const next = zoomAt(state, factor, boardPt.x, boardPt.y, currentMaxScale());
        viewBoxState = next;
        applyViewBox(svg, next);
      }, { passive: false });
    }

    // Terrain placement: paint-mode — hover shows 1×1 ghost, drag paints/erases squares.
    // Batch fires opts.onTerrainStroke(paints, erases) on mouseup for a single Firebase write.
    if (opts.terrainPlacement && opts.onTerrainStroke) {
      const { tier, existingTerrain, terrainOwner: tOwner, myFaction, budgetRemaining } = opts.terrainPlacement;
      const TMAP    = { rough: 1, chestHigh: 2, tall: 3 };
      const MARGIN  = 1;

      function snapSq(mx, my) {
        return {
          gx: Math.max(MARGIN, Math.min(bW - MARGIN, Math.floor(mx))),
          gy: Math.max(MARGIN, Math.min(bH - MARGIN, Math.floor(my)))
        };
      }
      function sqKey(gx, gy) { return `${gx},${gy}`; }
      function enemyOwned(gx, gy) {
        const owner = (tOwner || {})[sqKey(gx, gy)];
        return owner && owner !== myFaction;
      }
      // Net cost to paint this square given existing state (refunds own tile being replaced).
      function netCost(gx, gy) {
        const key = sqKey(gx, gy);
        const oldTier = (existingTerrain || {})[key];
        const oldCost = oldTier && (tOwner || {})[key] === myFaction ? (TMAP[oldTier] || 0) : 0;
        return (TMAP[tier] || 0) - oldCost;
      }

      let painting   = false;
      let paintMode  = true;           // true = paint, false = erase
      let sPaints    = new Map();      // key → tier (squares added this stroke)
      let sErases    = new Set();      // keys removed this stroke
      let sNetCost   = 0;
      let lastGX     = -1, lastGY = -1;

      const ghost = svgEl('rect', {
        width: 1, height: 1,
        fill: terrainGhostFill(tier), stroke: terrainGhostStroke(tier),
        'stroke-width': 0.12, 'stroke-dasharray': '0.25 0.15',
        opacity: 0, 'pointer-events': 'none'
      });
      svg.appendChild(ghost);

      function applySquare(gx, gy) {
        if (enemyOwned(gx, gy)) return;
        const key = sqKey(gx, gy);
        if (paintMode) {
          if (sPaints.has(key)) return;
          const cost = netCost(gx, gy);
          if (sNetCost + cost > budgetRemaining) return;
          sPaints.set(key, tier);
          sErases.delete(key);
          sNetCost += cost;
        } else {
          if (sErases.has(key)) return;
          const oldTier = (existingTerrain || {})[key];
          const refund  = oldTier && (tOwner || {})[key] === myFaction ? (TMAP[oldTier] || 0) : 0;
          sErases.add(key);
          sPaints.delete(key);
          sNetCost -= refund;
        }
      }

      // MOBILE-1-40K item 2: pointer events (mouse+touch+pen, one path) —
      // REPLACES the mouse* listeners below, doesn't run alongside them.
      svg.addEventListener('pointermove', e => {
        const pos = toSVG(svg, e.clientX, e.clientY);
        const { gx, gy } = snapSq(pos.x, pos.y);
        ghost.setAttribute('x', gx);
        ghost.setAttribute('y', gy);
        ghost.setAttribute('opacity', '0.65');

        const blocked = enemyOwned(gx, gy);
        const overBudget = paintMode && !blocked && sNetCost + netCost(gx, gy) > budgetRemaining;
        if (blocked || overBudget) {
          ghost.setAttribute('fill',   'rgba(180,30,30,0.3)');
          ghost.setAttribute('stroke', '#e84040');
          svg.style.cursor = 'not-allowed';
        } else {
          ghost.setAttribute('fill',   terrainGhostFill(tier));
          ghost.setAttribute('stroke', terrainGhostStroke(tier));
          svg.style.cursor = 'crosshair';
        }

        if (painting && (gx !== lastGX || gy !== lastGY)) {
          lastGX = gx; lastGY = gy;
          applySquare(gx, gy);
        }
      });

      svg.addEventListener('pointerleave', () => {
        ghost.setAttribute('opacity', '0');
        svg.style.cursor = '';
      });

      function commitStroke() {
        if (!painting) return;
        painting = false;
        const paints = [...sPaints.entries()].map(([k, t]) => {
          const [x, y] = k.split(',').map(Number);
          return { x, y, tier: t };
        });
        const erases = [...sErases].map(k => {
          const [x, y] = k.split(',').map(Number);
          return { x, y };
        });
        sPaints   = new Map();
        sErases   = new Set();
        sNetCost  = 0;
        if (paints.length || erases.length) opts.onTerrainStroke(paints, erases);
      }

      svg.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        // Pointer capture: this listener is scoped to the SVG element (not
        // document, unlike the movement drag above), so without capture a
        // fast finger-drag that strays outside the SVG's bounds mid-stroke
        // would silently stop delivering pointermove/pointerup here.
        svg.setPointerCapture(e.pointerId);
        const pos = toSVG(svg, e.clientX, e.clientY);
        const { gx, gy } = snapSq(pos.x, pos.y);
        const key     = sqKey(gx, gy);
        const ownTile = (tOwner || {})[key] === myFaction;
        painting  = true;
        paintMode = !ownTile;
        sPaints   = new Map();
        sErases   = new Set();
        sNetCost  = 0;
        lastGX = gx; lastGY = gy;
        if (!enemyOwned(gx, gy)) applySquare(gx, gy);
        document.addEventListener('pointerup', commitStroke, { once: true });
      });

      svg.addEventListener('pointerup', commitStroke);
    }

    // Deployment placement: ghost cluster follows mouse, click to place
    if (opts.deployPlacement && opts.onDeployPlaced) {
      const { faction, models, zone } = opts.deployPlacement;
      if (!models || models.length === 0) {
        console.warn('[deploy] deployPlacement.models is empty — nothing to place');
        return;
      }
      const SPACING    = 2;
      const R          = 0.5;
      const tallTerrain = {};
      Object.entries(terrain || {}).forEach(([k, t]) => { if (t === 'tall') tallTerrain[k] = t; });
      const count  = models.length;
      const cols   = Math.ceil(Math.sqrt(count));
      const nRows  = Math.ceil(count / cols);

      // BUG-40K-BOARD-BATCH item 2: deployValid had zone-bounds and terrain
      // checks but nothing against OTHER already-deployed models — a click
      // could drop a whole new cluster right on top of an existing unit.
      // Movement already has a real model-vs-model collision rule
      // (circleOverlapsCircle, used in the pointerdown drag handler below);
      // reused here rather than inventing a second, different rule. Only
      // already-deployed models are in `units` (this function's own param)
      // at this point (the caller passes `{ ...game, units: deployedUnits }`
      // through to setupInteraction — see game.js's renderDeployment), so
      // nothing needs excluding for "my own group" the way movement's
      // sync-drag does.
      const otherModels = Object.values(units || {})
        .filter(u => u.alive)
        .map(u => ({ x: u.x, y: u.y, r: ((window.UNIT_STATS || {})[u.type] || {}).baseRadius || 0.5 }));

      function computeCluster(cx, cy) {
        return models.map((m, i) => ({
          x: cx + ((i % cols) - (cols - 1) / 2) * SPACING,
          y: cy + (Math.floor(i / cols) - (nRows - 1) / 2) * SPACING
        }));
      }

      function deployValid(cx, cy) {
        const pos = computeCluster(cx, cy);
        if (pos.some(p => p.y - R < zone.yMin || p.y + R > zone.yMax)) return false;
        if (pos.some(p => p.x - R < 0 || p.x + R > bW)) return false;
        if (pos.some(p => modelOverlapsTerrain(p.x, p.y, R, tallTerrain))) return false;
        if (pos.some(p => otherModels.some(o => circleOverlapsCircle(p.x, p.y, R, o.x, o.y, o.r)))) return false;
        return true;
      }

      const isGuard     = faction === 'guard';
      const ghostFill   = isGuard ? 'rgba(138,154,91,0.45)'  : 'rgba(74,143,181,0.45)';
      const ghostStroke = isGuard ? '#c8d4a0' : '#a0c8e8';
      const badFill     = 'rgba(180,30,30,0.3)';
      const badStroke   = '#e84040';

      const ghosts = models.map(m => {
        const r = getTokenVisualRadius(m);
        const g = svgEl('circle', {
          r, fill: ghostFill, stroke: ghostStroke,
          'stroke-width': 0.2, 'stroke-dasharray': '0.5 0.3',
          opacity: 0, 'pointer-events': 'none'
        });
        svg.appendChild(g);
        return g;
      });

      let placing = false;

      svg.addEventListener('mousemove', e => {
        const pos     = toSVG(svg, e.clientX, e.clientY);
        const cluster = computeCluster(pos.x, pos.y);
        const valid   = deployValid(pos.x, pos.y);
        ghosts.forEach((g, i) => {
          g.setAttribute('cx', cluster[i].x);
          g.setAttribute('cy', cluster[i].y);
          g.setAttribute('opacity', '0.7');
          g.setAttribute('fill',   valid ? ghostFill  : badFill);
          g.setAttribute('stroke', valid ? ghostStroke : badStroke);
        });
        svg.style.cursor = valid ? 'crosshair' : 'not-allowed';
      });

      svg.addEventListener('mouseleave', () => {
        ghosts.forEach(g => g.setAttribute('opacity', '0'));
        svg.style.cursor = '';
      });

      svg.addEventListener('click', e => {
        if (placing) return;
        const pos = toSVG(svg, e.clientX, e.clientY);
        if (deployValid(pos.x, pos.y)) {
          placing = true;
          opts.onDeployPlaced(pos.x, pos.y);
        } else {
          console.log('[deploy] click blocked: pos', pos.x.toFixed(1), pos.y.toFixed(1),
            'zone', zone.yMin, '–', zone.yMax);
        }
      });
    }

    // Casualty allocation: click a model in the group to toggle selection.
    // BUG-40K-CASUALTY-LOCK root cause: e.target is only the TOPMOST element
    // at that pixel. Dead models keep their board position (skull icon, no
    // enlarged hit-area but still paint-hit-testable) and models from other
    // groups routinely end up within the 0.7" hit-radius of each other (melee
    // engagement range is ~1", well inside 2x0.7) — whichever token happens
    // to paint later in DOM order silently swallows the click, and a plain
    // .closest() lookup never looks past it. elementsFromPoint returns every
    // element stacked at that pixel in paint order, so this walks the whole
    // stack for the first eligible (alive, in-group) token instead of only
    // ever considering the topmost one.
    if (onModelToggled && allocationGroup) {
      svg.addEventListener('mousedown', e => {
        const stack = document.elementsFromPoint(e.clientX, e.clientY);
        const hit = stack
          .map(el => el.closest && el.closest('[data-unit-id]'))
          .find(tokenG => {
            if (!tokenG) return false;
            const unit = units[tokenG.dataset.unitId];
            return unit && unit.unitGroup === allocationGroup && unit.alive;
          });
        if (!hit) return;
        e.preventDefault();
        onModelToggled(hit.dataset.unitId);
      });
    }

    // Target-click for shooting and charge targeting (fires on mousedown; no
    // drag needed). BUG-40K-BOARD-BATCH item 1: same z-stack walk as the
    // casualty-allocation handler above (BUG-40K-CASUALTY-LOCK) — a plain
    // .closest() only sees the topmost token at that pixel, so a valid
    // target sitting behind an ineligible token (out of range, wrong
    // faction, a corpse) could never be clicked. elementsFromPoint walks
    // the whole stack for the first token whose group is actually valid.
    if (onTargetSelected && validTargetGroups && validTargetGroups.size > 0) {
      svg.addEventListener('mousedown', e => {
        const stack = document.elementsFromPoint(e.clientX, e.clientY);
        const hit = stack
          .map(el => el.closest && el.closest('[data-unit-group]'))
          .find(tokenG => tokenG && validTargetGroups.has(tokenG.dataset.unitGroup));
        if (!hit) return;
        e.preventDefault();
        onTargetSelected(hit.dataset.unitGroup);
      });
    }

    if (!activeGroup) return;

    // MOBILE-1-40K item 2: pointerdown/move/up instead of mouse* — pointer
    // events fire for mouse, touch, and pen through the SAME code path, so
    // desktop keeps working unchanged through these same handlers. This is
    // a REPLACE, not an add-alongside: the old mousedown listener below is
    // gone entirely, not left running next to this one (both firing on a
    // real touch tap would double-write to Firebase — a desync risk this
    // project treats as non-negotiable).
    svg.addEventListener('pointerdown', e => {
      const tokenG = e.target.closest('[data-unit-id]');
      if (!tokenG) return;

      const unitId = tokenG.dataset.unitId;
      const unit   = units[unitId];
      if (!unit || unit.unitGroup !== activeGroup || !unit.alive) return;

      e.preventDefault();

      const _rangedWs   = window.Shooting ? window.Shooting.getAllRangedWeapons(unit) : [];
      const weaponRange = _rangedWs.length
        ? Math.max(..._rangedWs.map(w => w.range || 0))
        : (((window.UNIT_STATS || {})[unit.type] || {}).weapon || {}).range || 0;
      const overlay     = svg.querySelector('#drag-overlay');

      // Clamp origin is ALWAYS the snapshot (start-of-activation) position
      const origin = snapshots[unitId] || { x: unit.x, y: unit.y };

      // Current display position (pending if already moved this activation)
      const curPos     = (pending && pending[unitId]) ? pending[unitId] : { x: unit.x, y: unit.y };
      const baseRadius = getTokenVisualRadius(unit);

      // Shift+drag = move whole group in sync; plain drag = move this model only
      const syncGroup = e.shiftKey;

      const groupMembers = syncGroup
        ? Object.values(units)
            .filter(u => u.alive && u.unitGroup === activeGroup)
            .map(u => {
              const disp = (pending && pending[u.id]) ? pending[u.id] : { x: u.x, y: u.y };
              const snap = snapshots[u.id] || { x: u.x, y: u.y };
              return { id: u.id, displayX: disp.x, displayY: disp.y, snapX: snap.x, snapY: snap.y };
            })
        : [{ id: unitId, displayX: curPos.x, displayY: curPos.y, snapX: origin.x, snapY: origin.y }];

      // Move cap: in sync mode, cap by slowest model; in solo mode, cap by this model's M
      const moveMax = opts.moveMaxOverride !== undefined
        ? opts.moveMaxOverride
        : syncGroup
          ? Math.min(...groupMembers.map(m => getUnitMove(units[m.id])))
          : getUnitMove(unit);

      tokenG.style.cursor = 'grabbing';
      const tokenCircle = tokenG.querySelector('.token-circle');
      if (tokenCircle) {
        tokenCircle.setAttribute('stroke-width', String((baseRadius * 0.4).toFixed(2)));
        tokenCircle.setAttribute('filter', 'url(#sel-glow)');
      }

      // LOS preview label — appended to SVG root so it isn't transform-shifted with the token
      const losLabel     = svgEl('g');
      const enemies      = Object.values(units).filter(u => u.faction !== unit.faction && u.alive);
      const terrainFr    = terrain || {};
      const tallTerrain  = {};
      Object.entries(terrainFr).forEach(([k, t]) => { if (t === 'tall') tallTerrain[k] = t; });
      const normalStroke = unit.faction === 'guard' ? '#c8d4a0' : '#a0c8e8';
      svg.appendChild(losLabel);

      // In sync mode, group members don't block each other; in solo mode, all other alive models block
      const otherModels = Object.values(units)
        .filter(u => u.alive && (syncGroup ? u.unitGroup !== activeGroup : u.id !== unitId))
        .map(u => {
          const p = (pending && pending[u.id]) ? pending[u.id] : { x: u.x, y: u.y };
          return { x: p.x, y: p.y, r: ((window.UNIT_STATS || {})[u.type] || {}).baseRadius || 0.5 };
        });

      drag = {
        unitId, unit, moveMax, origin, tokenG, overlay, svg,
        startDisplayX: curPos.x, startDisplayY: curPos.y,
        curX: curPos.x, curY: curPos.y,
        moved: false, blocked: false, onModelMoved,
        losLabel, enemies, terrain: terrainFr, weaponRange,
        tallTerrain, baseRadius, normalStroke, otherModels, groupMembers,
        pointerId: e.pointerId, syncGroup
      };

      // MOBILE-2-40K: pointerId-scoped — a second concurrent pointer
      // (pinch-zoom's second finger, now that 2-finger gestures are a
      // real thing this app supports) must not feed into an in-progress
      // single-token drag. Latent gap before pinch existed: nothing ever
      // had a second live pointer during a drag, so this never mattered.
      docMove = ev => {
        if (!drag || ev.pointerId !== drag.pointerId) return;
        const pos     = toSVG(drag.svg, ev.clientX, ev.clientY);
        // Clamp from the snapshot origin, not the current display position
        const clamped = clampVec(drag.origin.x, drag.origin.y, pos.x, pos.y, drag.moveMax);
        drag.curX  = clamped.x;
        drag.curY  = clamped.y;
        drag.moved = true;

        const dx = clamped.x - drag.origin.x;
        const dy = clamped.y - drag.origin.y;

        // Collision check across every group member at their new positions
        const isBlocked = drag.groupMembers.some(m => {
          const nx = m.snapX + dx;
          const ny = m.snapY + dy;
          return modelOverlapsTerrain(nx, ny, drag.baseRadius, drag.tallTerrain)
            || drag.otherModels.some(o => circleOverlapsCircle(nx, ny, drag.baseRadius, o.x, o.y, o.r));
        });
        drag.blocked = isBlocked;
        const tc = drag.tokenG.querySelector('.token-circle');
        if (tc) tc.setAttribute('stroke', isBlocked ? '#e84040' : drag.normalStroke);

        // Move all group members in sync with the same delta
        drag.groupMembers.forEach(m => {
          const el = drag.svg.querySelector(`[data-unit-id="${m.id}"]`);
          if (el) el.setAttribute('transform',
            `translate(${m.snapX + dx - m.displayX},${m.snapY + dy - m.displayY})`);
        });
        updateArrow(drag.overlay, drag.origin.x, drag.origin.y, clamped.x, clamped.y);

        // Live LOS preview label (from the dragged model's new position)
        if (drag.enemies.length && drag.weaponRange > 0) {
          const count = countVisibleEnemies(clamped.x, clamped.y, drag.enemies, drag.terrain, drag.weaponRange);
          updateLOSLabel(drag.losLabel, clamped.x, clamped.y, count);
        }
      };

      docUp = ev => {
        if (drag && ev && ev.pointerId !== drag.pointerId) return; // a second pointer lifting shouldn't end this drag
        document.removeEventListener('pointermove', docMove);
        document.removeEventListener('pointerup',   docUp);
        if (!drag) return;

        const d = drag;
        drag = null;

        clearEl(d.overlay);
        if (d.losLabel && d.losLabel.parentNode) d.losLabel.parentNode.removeChild(d.losLabel);

        // Clear transforms from all group members
        d.groupMembers.forEach(m => {
          const el = d.svg.querySelector(`[data-unit-id="${m.id}"]`);
          if (el) el.removeAttribute('transform');
        });
        d.tokenG.style.cursor = 'grab';

        if (d.moved) {
          const dx = d.curX - d.origin.x;
          const dy = d.curY - d.origin.y;
          const allPositions = {};

          if (d.blocked) {
            // Entire group snaps back to their display-start positions
            d.groupMembers.forEach(m => { allPositions[m.id] = { x: m.displayX, y: m.displayY }; });
          } else {
            d.groupMembers.forEach(m => {
              const final = snapToGrid(m.snapX + dx, m.snapY + dy, bW, bH);
              // Re-check at snapped position for each member
              const snapBlocked = d.otherModels.some(
                o => circleOverlapsCircle(final.x, final.y, d.baseRadius, o.x, o.y, o.r)
              );
              allPositions[m.id] = snapBlocked ? { x: m.displayX, y: m.displayY } : final;
            });
          }
          // BUG-40K-BOARD-BATCH item 3: pass along whether THIS drag was a
          // shift-held sync (whole-group-in-lockstep) move or a plain solo
          // (single-model) one — the confirm handler needs to know so it
          // can tell "individual placement" apart from "formation move."
          d.onModelMoved(d.unitId, allPositions[d.unitId].x, allPositions[d.unitId].y, allPositions, d.syncGroup);
        } else {
          const c = d.tokenG.querySelector('.token-circle');
          if (c) {
            c.setAttribute('stroke-width', String((d.baseRadius * 0.24).toFixed(2)));
            c.removeAttribute('filter');
          }
        }
      };

      document.addEventListener('pointermove', docMove);
      document.addEventListener('pointerup',   docUp);
    });
  }

  // ---- Public render ----

  function render(game, container, opts = {}) {
    if (drag) {
      document.removeEventListener('pointermove', docMove);
      document.removeEventListener('pointerup',   docUp);
      drag = null;
    }

    const bW    = game.boardWidth  || 44;
    const bH    = game.boardHeight || 60;
    const zoneH = Math.round(bH * 0.2);

    container.innerHTML = '';

    // MOBILE-2-40K: render() rebuilds this element from scratch on every
    // Firebase update, so the current zoom/pan has to be read back from
    // the persisted module-level state rather than always starting at
    // "whole board" — otherwise the opponent's next action would reset
    // the player's zoom.
    const vb = viewBoxRect(getViewBoxState(bW, bH));
    const svg = svgEl('svg', {
      viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
      class: 'board-svg',
      preserveAspectRatio: 'xMidYMid meet'
    });

    buildDefs(svg);

    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: bW, height: bH, fill: '#0b1209' }));

    // W40K-UX2 item 2: always from the VIEWER's own perspective (opts.myFaction),
    // not whoever's currently active — brother's report ("I put my terrain on
    // your side") was a which-half-is-mine problem, not a whose-turn problem,
    // so this stays constant across turns within terrain/deployment instead of
    // flipping to match the active player like the old deployZone-only
    // highlight did.
    const zoneRects = { guard: { yMin: 0, yMax: zoneH }, eldar: { yMin: bH - zoneH, yMax: bH } };
    if (opts.myFaction) {
      const other = zoneRects[opts.myFaction === 'guard' ? 'eldar' : 'guard'];
      const mine  = zoneRects[opts.myFaction];

      // Opponent's half: grayed / de-emphasized
      svg.appendChild(svgEl('rect', {
        x: 0, y: other.yMin, width: bW, height: other.yMax - other.yMin,
        fill: 'rgba(110,110,110,0.06)'
      }));

      // My half: hatched + tinted + labeled
      svg.appendChild(svgEl('rect', {
        x: 0, y: mine.yMin, width: bW, height: mine.yMax - mine.yMin,
        fill: 'url(#my-zone-hatch)'
      }));
      svg.appendChild(svgEl('rect', {
        x: 0, y: mine.yMin, width: bW, height: mine.yMax - mine.yMin,
        fill: 'none', stroke: 'rgba(201,168,76,0.55)', 'stroke-width': 0.25
      }));
      const label = svgEl('text', {
        x: bW / 2, y: mine.yMin + zoneH / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': Math.min(zoneH * 0.28, 1.6), 'font-family': 'sans-serif', 'font-weight': 700,
        'letter-spacing': '0.05em', fill: 'rgba(201,168,76,0.4)'
      });
      label.textContent = 'YOUR ZONE';
      svg.appendChild(label);
    } else {
      // No viewer perspective supplied (e.g. spectator/legacy call site) —
      // fall back to the old always-both-shown static tint rather than
      // showing neither zone at all.
      svg.appendChild(svgEl('rect', { x: 0, y: 0,        width: bW, height: zoneH, fill: 'rgba(138,154,91,0.07)' }));
      svg.appendChild(svgEl('rect', { x: 0, y: bH-zoneH, width: bW, height: zoneH, fill: 'rgba(74,143,181,0.07)' }));
    }

    if (opts.deployZone) {
      const { yMin, yMax } = opts.deployZone;
      const fac    = opts.deployZoneFaction || 'guard';
      const fill   = fac === 'guard' ? 'rgba(138,154,91,0.13)' : 'rgba(74,143,181,0.13)';
      const stroke = fac === 'guard' ? 'rgba(200,212,160,0.5)'  : 'rgba(160,200,232,0.5)';
      svg.appendChild(svgEl('rect', {
        x: 0, y: yMin, width: bW, height: yMax - yMin,
        fill, stroke, 'stroke-width': 0.3, 'stroke-dasharray': '1.2 0.6'
      }));
    }

    drawGrid(svg, bW, bH);
    drawTerrain(svg, game.terrain || {});

    // Compute coherency before drawing (needs pending positions)
    let coherencyOk = null;
    if (opts.activeGroup) {
      const allUnits  = Object.values(game.units || {}).filter(u => u.alive);
      const groupMdls = allUnits.filter(u => u.unitGroup === opts.activeGroup);
      if (groupMdls.length > 1) {
        const positions = {};
        groupMdls.forEach(u => {
          positions[u.id] = (opts.pending && opts.pending[u.id]) ? opts.pending[u.id] : { x: u.x, y: u.y };
        });
        coherencyOk = calcCoherency(groupMdls, positions);
        drawCoherencyZones(svg, groupMdls, positions, coherencyOk);
      }
    }

    if (opts.shooterGroup) {
      drawLOSLines(svg, game.units || {}, opts.shooterGroup, game.terrain || {});
    }

    drawUnits(svg, game.units || {}, {
      activeGroup:         opts.activeGroup          || null,
      pending:             opts.pending              || {},
      snapshots:           opts.snapshots            || {},
      coherencyOk,
      shooterGroup:        opts.shooterGroup         || null,
      validTargetGroups:   opts.validTargetGroups    || null,
      selectedTargetGroup: opts.selectedTargetGroup  || null,
      highlightGroup:      opts.highlightGroup       || null,
      allocationGroup:     opts.allocationGroup      || null,
      allocationSelected:  opts.allocationSelected   || null,
      battleShockedGroups: opts.battleShockedGroups  || null,
    });

    svg.appendChild(svgEl('g', { id: 'drag-overlay' }));
    svg.appendChild(svgEl('rect', {
      x: 0, y: 0, width: bW, height: bH,
      fill: 'none', stroke: '#3a3836', 'stroke-width': 0.4
    }));

    container.appendChild(svg);

    // MOBILE-2-40K item 4: persistent, unobtrusive scale readout — plain
    // HTML overlay, not an SVG element, so its on-screen size stays
    // constant regardless of the current zoom level (an SVG text element
    // would need its own counter-scaling to avoid growing/shrinking with
    // every pinch). Rebuilt every render along with everything else in
    // this container.
    const scaleLabel = document.createElement('div');
    scaleLabel.className = 'board-scale-indicator';
    scaleLabel.textContent = `1 square = ${GRID_SQUARE_INCHES}"`;
    container.appendChild(scaleLabel);

    setupInteraction(svg, game.units || {}, { ...opts, terrain: game.terrain || {}, bW, bH });
  }

  return { render, calcCoherency, playTracer };
})();
