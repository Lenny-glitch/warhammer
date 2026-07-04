window.Board = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  let drag    = null;
  let docMove = null;
  let docUp   = null;

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

  function drawGrid(parent, bW, bH) {
    bW = bW || 44; bH = bH || 60;
    const g = svgEl('g');
    for (let x = 0; x <= bW; x += 2) {
      g.appendChild(svgEl('line', { x1: x, y1: 0, x2: x, y2: bH, stroke: 'rgba(255,255,255,0.04)', 'stroke-width': 0.12 }));
    }
    for (let y = 0; y <= bH; y += 2) {
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

  function drawUnits(parent, units, opts) {
    const { activeGroup, pending, snapshots, coherencyOk,
            shooterGroup, validTargetGroups, selectedTargetGroup,
            highlightGroup, allocationGroup, allocationSelected,
            battleShockedGroups } = opts;
    const allModels = Object.values(units);

    const inShootMode  = !!shooterGroup;
    const showCoherency = activeGroup && coherencyOk;

    allModels.forEach(u => {
      // Destroyed token — generic, works for any model type
      if (!u.alive) {
        const r = ((window.UNIT_STATS || {})[u.type] || {}).baseRadius || 0.5;
        const g = svgEl('g', { 'data-unit-id': u.id, 'data-unit-group': u.unitGroup });
        g.style.opacity = '0.38';
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
      const r        = ((window.UNIT_STATS || {})[u.type] || {}).baseRadius || 0.5;

      // Effective position: pending override → Firebase
      const pos = (pending && pending[u.id]) ? pending[u.id] : { x: u.x, y: u.y };

      const g = svgEl('g', { 'data-unit-id': u.id, 'data-unit-group': u.unitGroup });

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

      svg.addEventListener('mousemove', e => {
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

      svg.addEventListener('mouseleave', () => {
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

      svg.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
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
        document.addEventListener('mouseup', commitStroke, { once: true });
      });

      svg.addEventListener('mouseup', commitStroke);
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
        return true;
      }

      const isGuard     = faction === 'guard';
      const ghostFill   = isGuard ? 'rgba(138,154,91,0.45)'  : 'rgba(74,143,181,0.45)';
      const ghostStroke = isGuard ? '#c8d4a0' : '#a0c8e8';
      const badFill     = 'rgba(180,30,30,0.3)';
      const badStroke   = '#e84040';

      const ghosts = models.map(m => {
        const r = ((window.UNIT_STATS || {})[m.type] || {}).baseRadius || 0.5;
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

    // Casualty allocation: click a model in the group to toggle selection
    if (onModelToggled && allocationGroup) {
      svg.addEventListener('mousedown', e => {
        const tokenG = e.target.closest('[data-unit-id]');
        if (!tokenG) return;
        const unit = units[tokenG.dataset.unitId];
        if (!unit || unit.unitGroup !== allocationGroup || !unit.alive) return;
        e.preventDefault();
        onModelToggled(tokenG.dataset.unitId);
      });
    }

    // Target-click for shooting and charge targeting (fires on mousedown; no drag needed)
    if (onTargetSelected && validTargetGroups && validTargetGroups.size > 0) {
      svg.addEventListener('mousedown', e => {
        const tokenG = e.target.closest('[data-unit-group]');
        if (!tokenG) return;
        const groupId = tokenG.dataset.unitGroup;
        if (validTargetGroups.has(groupId)) {
          e.preventDefault();
          onTargetSelected(groupId);
        }
      });
    }

    if (!activeGroup) return;

    svg.addEventListener('mousedown', e => {
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
      const baseRadius = ((window.UNIT_STATS || {})[unit.type] || {}).baseRadius || 0.5;

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
        tallTerrain, baseRadius, normalStroke, otherModels, groupMembers
      };

      docMove = ev => {
        if (!drag) return;
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

      docUp = () => {
        document.removeEventListener('mousemove', docMove);
        document.removeEventListener('mouseup',   docUp);
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
          d.onModelMoved(d.unitId, allPositions[d.unitId].x, allPositions[d.unitId].y, allPositions);
        } else {
          const c = d.tokenG.querySelector('.token-circle');
          if (c) {
            c.setAttribute('stroke-width', String((d.baseRadius * 0.24).toFixed(2)));
            c.removeAttribute('filter');
          }
        }
      };

      document.addEventListener('mousemove', docMove);
      document.addEventListener('mouseup',   docUp);
    });
  }

  // ---- Public render ----

  function render(game, container, opts = {}) {
    if (drag) {
      document.removeEventListener('mousemove', docMove);
      document.removeEventListener('mouseup',   docUp);
      drag = null;
    }

    const bW    = game.boardWidth  || 44;
    const bH    = game.boardHeight || 60;
    const zoneH = Math.round(bH * 0.2);

    container.innerHTML = '';

    const svg = svgEl('svg', {
      viewBox: `0 0 ${bW} ${bH}`,
      class: 'board-svg',
      preserveAspectRatio: 'xMidYMid meet'
    });

    buildDefs(svg);

    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: bW, height: bH, fill: '#0b1209' }));
    svg.appendChild(svgEl('rect', { x: 0, y: 0,        width: bW, height: zoneH, fill: 'rgba(138,154,91,0.07)' }));
    svg.appendChild(svgEl('rect', { x: 0, y: bH-zoneH, width: bW, height: zoneH, fill: 'rgba(74,143,181,0.07)' }));

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
    setupInteraction(svg, game.units || {}, { ...opts, terrain: game.terrain || {}, bW, bH });
  }

  return { render, calcCoherency, playTracer };
})();
