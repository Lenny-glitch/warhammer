// 40K-BLOOD-FX: transient hit/damage feedback effect.
//
// GAME-AGNOSTIC BY DESIGN (per the brief's convergence instruction — this
// is built native to 40k now, but written so lifting it to Kill Team
// later is a copy, not a rewrite). This module knows nothing about units,
// wounds, factions, or Firebase — it takes an SVG element to draw into,
// board-space coordinates, and a small options bag, and draws. The
// caller (40k-specific — board.js's drawUnits) is responsible for
// deciding WHEN a wound/kill happened and WHERE on the board it landed;
// this module only knows how to render one impact once told to.
//
// Positioning is entirely in the caller's coordinate space (board units,
// i.e. inches, matching this app's SVG viewBox) — nothing here reads
// screen pixels, so pan/zoom (an SVG viewBox mutation) carries any effect
// already in flight for free, no coordinate conversion needed.
window.HitFX = (function () {
  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  // svg: the live <svg> element to append into (caller resolves this —
  //   this module never looks it up itself, so it has no idea what
  //   selector/class the host app's board uses).
  // x, y: board-space coordinates of the impact.
  // opts.kind: 'wound' (model survives) or 'kill' (model removed).
  // opts.intensity: arbitrary positive number, bigger = a harder-hitting
  //   effect. Not required — omitting it plays a flat, default-sized
  //   effect. Clamped internally so an extreme caller value can't produce
  //   a degenerate/invisible/oversized result.
  function play(svg, x, y, opts) {
    if (!svg || typeof x !== 'number' || typeof y !== 'number') return;
    const isKill        = (opts && opts.kind) === 'kill';
    const rawIntensity  = (opts && typeof opts.intensity === 'number') ? opts.intensity : 1;
    const intensity     = Math.max(0.5, Math.min(2, rawIntensity));

    const baseR    = (isKill ? 0.85 : 0.5) * (0.7 + 0.3 * intensity);
    const spikes   = Math.round((isKill ? 9 : 5) * (0.8 + 0.2 * intensity));
    const spikeLen = baseR * (isKill ? 1.7 : 1.15);
    const color    = isKill ? '#e84040' : '#e8a838';
    const cls      = isKill ? 'hitfx-kill' : 'hitfx-wound';

    const g = svgEl('g', { class: cls, 'pointer-events': 'none' });

    // Impact flash (core)
    g.appendChild(svgEl('circle', {
      cx: x, cy: y, r: baseR, fill: color, opacity: 0.6
    }));

    // Radiating impact spikes ("brief spatter" — short marks, not gore)
    for (let i = 0; i < spikes; i++) {
      const angle = (i / spikes) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const inner = baseR * 0.5;
      g.appendChild(svgEl('line', {
        x1: x + Math.cos(angle) * inner,
        y1: y + Math.sin(angle) * inner,
        x2: x + Math.cos(angle) * (inner + spikeLen),
        y2: y + Math.sin(angle) * (inner + spikeLen),
        stroke: color, 'stroke-width': Math.max(0.06, baseR * 0.16),
        'stroke-linecap': 'round'
      }));
    }

    svg.appendChild(g);

    // Self-cleaning: the CSS animation (css/styles.css .hitfx-wound /
    // .hitfx-kill) drives the actual fade; animationend removes the node
    // once it's genuinely finished. The setTimeout is only a safety net
    // for the case a full board rebuild happens mid-animation and this
    // node gets detached without ever firing animationend (same
    // accepted limitation board.js's own tracer-line already lives
    // with — a transient effect getting cut short by a fast subsequent
    // re-render is not a regression to solve here).
    const duration = isKill ? 750 : 420;
    g.addEventListener('animationend', () => g.remove(), { once: true });
    setTimeout(() => { if (g.parentNode) g.remove(); }, duration + 100);
  }

  return { play };
})();
