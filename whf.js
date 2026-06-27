'use strict';

const SPACING = 22;   // px, model token centre-to-centre
const MODEL_R  = 10;  // model circle radius px
const BOARD_W  = 1200;
const BOARD_H  = 900;
const NS = 'http://www.w3.org/2000/svg';

// ─── Core geometry ────────────────────────────────────────────────────────────
//
// modelPosition converts a formation slot (row, col) to absolute SVG coords.
//
// unit.position  — SVG coords of the front-left slot (row=0, col=0)
// unit.facing    — degrees clockwise from north: 0=north, 90=east, 270=west
// row=0          — front rank; row increases toward the rear
// col=0          — left flank from the unit's perspective; col increases right
//
// The rotation is a standard 2-D CW rotation in SVG space (Y-axis down).
// Every subsequent system — charge arcs, flank/rear detection, wheel pivot —
// derives from this transform, so getting it right here matters.

function modelPosition(unit, row, col) {
  const lx  = col * SPACING;
  const ly  = row * SPACING;
  const rad = (unit.facing * Math.PI) / 180;
  return {
    x: unit.position.x + lx * Math.cos(rad) - ly * Math.sin(rad),
    y: unit.position.y + lx * Math.sin(rad) + ly * Math.cos(rad),
  };
}

// ─── Geometry self-test ───────────────────────────────────────────────────────
// Runs immediately. Checks cardinal and 45° cases. Log visible in DevTools.

(function testModelPosition() {
  const near = (a, b) => Math.abs(a - b) < 0.001;
  const u0   = { position: { x: 100, y: 100 }, facing: 0   };
  const u90  = { position: { x: 100, y: 100 }, facing: 90  };
  const u45  = { position: { x: 100, y: 100 }, facing: 45  };
  const s45  = Math.sin(Math.PI / 4);

  const cases = [
    // 0° (north): col increases right (+X), row increases down (+Y)
    [u0,  0, 0,  100,                 100,                '0° origin'],
    [u0,  0, 1,  100 + SPACING,       100,                '0° col→+X'],
    [u0,  1, 0,  100,                 100 + SPACING,      '0° row→+Y'],
    // 90° (east): col increases down (+Y), row increases left (−X)
    [u90, 0, 1,  100,                 100 + SPACING,      '90° col→+Y'],
    [u90, 1, 0,  100 - SPACING,       100,                '90° row→−X'],
    // 45°: diagonal — verifies rotation math at non-cardinal angle
    [u45, 0, 1,  100 + SPACING * s45, 100 + SPACING * s45, '45° col'],
    [u45, 1, 0,  100 - SPACING * s45, 100 + SPACING * s45, '45° row'],
  ];

  let ok = true;
  cases.forEach(([unit, row, col, ex, ey, label]) => {
    const p = modelPosition(unit, row, col);
    if (!near(p.x, ex) || !near(p.y, ey)) {
      console.error(
        `[WHF] modelPosition FAIL — ${label}:`,
        `got (${p.x.toFixed(3)}, ${p.y.toFixed(3)})`,
        `expected (${ex.toFixed(3)}, ${ey.toFixed(3)})`
      );
      ok = false;
    }
  });
  if (ok) console.log('[WHF] modelPosition OK — cardinal + 45° geometry tests passed');
})();

// ─── Game state ───────────────────────────────────────────────────────────────

const state = {
  units:    [],
  selected: null,   // instanceId of selected unit, or null
};

// ─── Faction palettes ─────────────────────────────────────────────────────────

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

// ─── Test unit construction ───────────────────────────────────────────────────

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

function initTestUnits() {
  // ── Unit 1: Empire Halberdiers ─────────────────────────────────────────────
  // 20 models, rank width 5, facing east (90°).
  // unit.position = front-left corner in SVG coords.
  // Facing east: front rank is at x=460 (rightmost), columns descend
  // vertically (col+1 → y+22). Centred at y≈420 over 5 cols (88px span).
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
  });

  // ── Unit 2: Bretonnian Knights of the Realm ────────────────────────────────
  // 9 models, rank width 3, facing west (270°).
  // Facing west: front rank at x=740 (leftmost), columns ascend vertically
  // (col+1 → y−22). position.y=442 so cols run y=442→398, centred at y≈420.
  // Sv: Firebase has 1+ (full plate+shield+barding). WHF-1 brief specifies 2+.
  // Using 1+ per rules — brief value may assume no shield (lance); flagged.
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
    stats: { M: '7"', WS: '4', BS: '3', S: '4', T: '3', W: '1', I: '4', A: '1', Ld: '8', Sv: '1+' },
    weapons: [
      { name: 'Lance',       type: 'melee', desc: '+2S on charge, Lance Formation' },
      { name: 'Hand weapon', type: 'melee', desc: '' },
    ],
    abilities: ['Blessing of the Lady', 'Knightly Vow', 'Lance Formation'],
    models: buildModels('unit-002', 9, 3),
  });
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

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

// ─── Grid ─────────────────────────────────────────────────────────────────────

function renderGrid() {
  const layer = document.getElementById('grid-layer');
  const step  = 88; // 4 model-widths ≈ 4 inches at this scale
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

// ─── Render ───────────────────────────────────────────────────────────────────

function renderAll() {
  const layer = document.getElementById('units-layer');
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  state.units.forEach(u => renderUnit(layer, u));
}

function renderUnit(layer, unit) {
  const isSelected = state.selected === unit.instanceId;
  const pal        = PALETTES[unit.palette] || PALETTES.empire;
  const aliveCount = unit.models.filter(m => m.alive).length;
  const numRanks   = Math.ceil(unit.models.length / unit.rankWidth);
  // Fractional centre column (e.g. 2.0 for rankWidth=5, 1.0 for rankWidth=3)
  const frontCX    = (unit.rankWidth - 1) / 2;

  const g = svgEl('g', { class: 'unit', 'data-unit-id': unit.instanceId });

  // ── Model tokens ───────────────────────────────────────────────────────────
  unit.models.forEach(model => {
    const pos    = modelPosition(unit, model.row, model.col);
    const isDead = !model.alive;
    const fill   = isDead      ? 'var(--dead-model)'
                 : model.isChampion ? pal.champFill
                 : pal.fill;
    const stroke = isDead      ? 'var(--border-dark)'
                 : isSelected  ? 'var(--selected-ring)'
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
      style:           'cursor:pointer',
    }));

    // Small inner dot marks the champion
    if (model.isChampion && !isDead) {
      g.appendChild(svgEl('circle', {
        cx: pos.x.toFixed(2), cy: pos.y.toFixed(2), r: '3',
        fill: 'var(--text-bright)', 'pointer-events': 'none',
      }));
    }
  });

  // ── Facing arrow ───────────────────────────────────────────────────────────
  // Positioned one spacing in front of row 0 at the centre column.
  // Triangle drawn pointing north (tip toward −Y). SVG rotate(facing)
  // maps 0→north, 90→east, 270→west — matches our facing convention.
  const arrowPos = modelPosition(unit, -1.0, frontCX);
  const ax = arrowPos.x, ay = arrowPos.y;
  const ah = 10, aw = 7; // half-height, half-base-width
  g.appendChild(svgEl('polygon', {
    class:   'facing-arrow',
    // Points: tip top, base-left, base-right (triangle pointing up/north)
    points:  `${ax},${ay - ah} ${ax - aw},${ay + ah * 0.5} ${ax + aw},${ay + ah * 0.5}`,
    fill:    pal.arrow,
    stroke:  pal.stroke,
    'stroke-width': '1',
    transform: `rotate(${unit.facing}, ${ax}, ${ay})`,
    'pointer-events': 'none',
  }));

  // ── Unit label ─────────────────────────────────────────────────────────────
  // One spacing behind the rear rank, at the centre column.
  const labelPos = modelPosition(unit, numRanks + 0.3, frontCX);
  const label = svgEl('text', {
    class: 'unit-label',
    x: labelPos.x.toFixed(2), y: labelPos.y.toFixed(2),
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'pointer-events': 'none',
  });
  label.textContent = `${unit.name} (${aliveCount})`;
  g.appendChild(label);

  // ── Event: click unit to select ────────────────────────────────────────────
  g.addEventListener('click', e => { e.stopPropagation(); selectUnit(unit.instanceId); });

  layer.appendChild(g);
}

// ─── Selection ────────────────────────────────────────────────────────────────

function selectUnit(instanceId) {
  state.selected = state.selected === instanceId ? null : instanceId;
  renderAll();
  if (state.selected) {
    const unit = state.units.find(u => u.instanceId === state.selected);
    if (unit) showPanel(unit);
  } else {
    hidePanel();
  }
}

function deselectAll() {
  state.selected = null;
  renderAll();
  hidePanel();
}

// ─── Dead model toggle ────────────────────────────────────────────────────────

function toggleModelDead(unitId, modelId) {
  const unit  = state.units.find(u => u.instanceId === unitId);
  if (!unit) return;
  const model = unit.models.find(m => m.modelId === modelId);
  if (!model) return;
  model.alive = !model.alive;
  renderAll();
  if (state.selected === unitId) {
    showPanel(unit); // refresh alive count in panel
  }
}

// ─── Stat panel ───────────────────────────────────────────────────────────────

function showPanel(unit) {
  const panel    = document.getElementById('stat-panel');
  const content  = document.getElementById('panel-content');
  const alive    = unit.models.filter(m => m.alive).length;
  const total    = unit.models.length;
  const numRanks = Math.ceil(total / unit.rankWidth);
  const s        = unit.stats;

  const weaponItems = unit.weapons.map(w =>
    `<li>${escHtml(w.name)}${w.desc ? ` <span class="panel-sub">(${escHtml(w.type)}, ${escHtml(w.desc)})</span>` : ` <span class="panel-sub">(${escHtml(w.type)})</span>`}</li>`
  ).join('');

  const abilityItems = unit.abilities.length
    ? unit.abilities.map(a => `<li>${escHtml(a)}</li>`).join('')
    : '<li class="panel-none">None</li>';

  content.innerHTML = `
    <div class="panel-header">
      <div class="panel-name">${escHtml(unit.name)}</div>
      <div class="panel-faction">${escHtml(unit.factionLabel)} — ${escHtml(unit.category)}</div>
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
  `;

  panel.classList.add('panel-open');
}

function hidePanel() {
  document.getElementById('stat-panel').classList.remove('panel-open');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  initTestUnits();
  renderGrid();
  renderAll();

  // Right-click model → toggle dead/alive
  document.getElementById('board').addEventListener('contextmenu', e => {
    e.preventDefault();
    const target = e.target.closest('[data-model-id]');
    if (!target) return;
    toggleModelDead(target.dataset.unitId, target.dataset.modelId);
  });

  // Click board background → deselect
  document.getElementById('board').addEventListener('click', e => {
    if (e.target.id === 'board' || e.target.id === 'board-bg') deselectAll();
  });

  // Escape → deselect
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') deselectAll();
  });
}

document.addEventListener('DOMContentLoaded', init);
