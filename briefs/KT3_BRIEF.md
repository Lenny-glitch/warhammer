# KT-3 Brief — Grimdark Visual Effects

## Goal
Layer visceral, weighted visual effects on top of the existing combat
system. All effects are purely additive — no game logic changes.
The goal is grimdark atmosphere: weapons feel powerful, casualties
feel consequential, death leaves a mark on the board.

---

## Animation Speed Tiers

Determine tier from the weapon's Normal Dmg value at the time of
the shot/fight:

| Tier | Normal Dmg | Duration | Feel |
|------|-----------|----------|------|
| SUBTLE | ≤ 3 | 300-400ms | Quick flash, doesn't interrupt flow |
| DRAMATIC | 4-5 | 600-800ms | Deliberate pause, player feels the hit |
| CINEMATIC | ≥ 6 | 1000-1500ms | Full freeze-frame moment |

Use Critical Dmg as the tiebreaker if Normal Dmg is equal: if
Critical Dmg is ≥ 8, escalate one tier.

Store this as a helper: `getAnimTier(weapon)` → 'subtle' | 'dramatic'
| 'cinematic'. Used everywhere effects fire.

---

## Part 1 — Weapon Beam Effects (Shoot action)

### Color by weapon name/type
Match on weapon name (case-insensitive substring check):

| Color | Hex | Matches |
|-------|-----|---------|
| RED | #e84040 | las, laser, lascannon, lasgun, laspistol, hot-shot |
| CYAN/TAU BLUE | #40c8e8 | pulse, tau, ion, rail, burst, pathfinder |
| YELLOW | #e8c840 | bolt, bolter, slugga, dakka, shoota, stub, autogun |
| ORANGE | #e87040 | plasma, melta, fusion, flamer, inferno |
| GREEN | #40e870 | needler, shuriken, catapult, neuro, hallucinogen |
| WHITE | #e8e8e8 | default/fallback for anything unmatched |

### Beam visual
Replace the current plain line shot tracer with a styled beam:
- Thickness: 2px for subtle, 3px for dramatic, 4px for cinematic
- Subtle: solid line, fades out over the animation duration
- Dramatic: solid line with a slight glow/blur filter, fades out
- Cinematic: thick line with strong glow + a brief afterimage
  (second thinner line that fades slightly behind the main beam)
- All beams animate from shooter to target (draw-forward motion
  over first 40% of duration, then fade over remaining 60%)

### Miss effects
If the shot misses entirely (all attack dice fail): show a shorter
beam that stops 80% of the way to the target and dissipates, or
skip the beam entirely for subtle-tier misses. Dramatic/cinematic
tier misses still show a partial beam.

---

## Part 2 — Hit Impact Effect (on target, when damage lands)

### Freeze-frame ink/blood splash
When damage is dealt (at least one unsaved hit), show a brief
radial splash effect centered on the target token:

- SVG circle burst or star-shaped splatter radiating from the
  token center
- Color: red (#c0392b) for biological targets (all current
  operatives), could be oil/mechanical color later for vehicles
- Size scales with tier:
  - Subtle: small burst, radius ~0.8" in SVG units
  - Dramatic: medium burst, radius ~1.2"
  - Cinematic: large burst, radius ~1.8", with secondary smaller
    splashes offset slightly from center
- Animation: appear instantly at full opacity, then fade out
  over the animation duration
- Drawn on a layer ABOVE terrain but BELOW tokens so it doesn't
  obscure the operative mid-fight

### Screen edge flash
When ANY friendly operative takes damage (the local player's
operative is hit), flash a brief red vignette on the screen edges:
- Red semi-transparent gradient from screen edges inward,
  ~15% max opacity at edges, transparent at center
- Duration: 200ms appear, 300ms fade — always subtle regardless
  of weapon tier (this is environmental feedback, not weapon feedback)
- Applied as a full-viewport overlay div with pointer-events: none
- Only fires on the DEFENDER's screen, not the attacker's

---

## Part 3 — Death Effects (operative incapacitated)

### Death animation on token
When an operative's wounds reach 0:
1. Brief flash of white at full opacity over the token (50ms)
2. Token fades to grey and shows red X (already implemented in KT-2)
3. Token shrinks slightly (scale 0.8) over 300ms
4. Token fades out completely over a further 300ms and is removed
   from the board

### Blood/oil splat (persists on board)
After the token is removed, leave a blood splat mark at that
position on the board. This persists for the rest of the game
as a reminder of where operatives fell.

**Implementation approach — pre-generated blots, NOT complex SVG:**
- Create 5-6 pre-defined SVG path strings representing different
  splat/stain shapes (organic irregular blobs, not circles)
  stored as constants. Simple closed paths with maybe 8-12 points
  each — hand-authored or generated once and hardcoded. Keep them
  simple, they're small and on the background layer.
- On death: pick one at random
- Apply random rotation (0-360°) and scale variation (0.8-1.2×
  of base size)
- Apply slight color variation: base red (#8b1a1a for biological),
  randomly shift hue ±15° and lightness ±10% so each splat reads
  as individual even if the same shape is reused
- Draw on the LOWEST board layer (below terrain, below tokens) so
  nothing is obscured — these are floor stains, not overlays
- Animate: grow from scale 0 to final scale over 400ms, then
  stay permanently

### Vehicle/drone explosion (future-proof, implement now)
When a drone or vehicle operative (category: 'vehicle' or 'drone')
is incapacitated:
- Same death animation as above BUT additionally:
- Brief orange/yellow flash at the token position
- Larger splat using an oil/smoke color (#3d3d1a, dark olive/grey)
  instead of red
- Leave a "wreck marker" (small dark square/shape) at the position
  instead of a blood splat — something that reads as debris, not gore
- Currently no vehicles in KT but the system should handle the
  category check cleanly for when they appear

---

## Part 4 — Fight Close Combat Effects

### Melee clash visual
When a fight resolves, show a brief clash indicator at the
midpoint between the two operatives:
- Crossed swords or spark-burst SVG shape (simple, not detailed)
- Color: white/yellow (#e8e840) — impact spark, not weapon-colored
- Size scales with total damage dealt (sum of both sides' damage):
  - 0 total damage: tiny or skip
  - 1-5 total damage: subtle size
  - 6-14 total damage: dramatic size
  - 15+ total damage: cinematic size
- Animates: appear instantly, rotate slightly, fade out over
  the animation tier duration

### Blood splats for melee
Same as shooting hit effects but fire at BOTH operative positions
(attacker takes retaliation, defender takes strikes) if they each
took damage. Each splat is independent.

---

## Technical notes

### Layer order (SVG painter's order, bottom to top)
1. Board background
2. Blood/death splats (permanent floor stains)
3. Terrain squares
4. Coherency zones
5. Shot/fight beam effects (temporary)
6. Impact burst effects (temporary)
7. Unit tokens
8. Health arcs
9. Order pips, status indicators
10. Temporary labels (LOS, range, etc.)

### Animation timing
All effect animations should use CSS animations or SVG animate
elements, NOT JavaScript setInterval/setTimeout loops — keeps
rendering on the GPU and doesn't block the JS thread.

`animationend` event removes temporary elements (beams, bursts,
clash indicators). Permanent elements (splats) never get removed.

### Sync
Visual effects are LOCAL ONLY — don't write effect state to
Firebase. Each client plays its own effects based on Firebase
state changes it receives. The existing tracer pattern (both
clients detect a new shotLog entry and play the tracer) is the
right model — extend it, don't replace it.

Both clients should see effects: the attacker fires a shot and
sees their beam going out; the defender sees an incoming beam
arriving from the attacker's direction + the screen flash +
the impact burst.

---

## Explicitly OUT of scope for KT-3
- Sound effects (KT-5 or later)
- Pixel art tokens (KT-4)
- Animated blood spreading over time (static splat that
  appears with a grow animation is enough)
- Particle systems or WebGL

## Done when
- Weapon beams show in the correct color per weapon type,
  with thickness/glow matching the damage tier
- Impact burst fires on the target token when damage lands
- Screen edge flash fires on the DEFENDER's screen when
  their operative takes damage
- Death tokens animate out and leave a permanent splat
- Melee clash indicator shows between combatants
- Blood splats vary visually (rotation, scale, slight color
  variation) so they read as individual
- None of these affect game state, tokens, or Firebase

Report back: show a screenshot of a death splat on the board,
a dramatic-tier beam, and the screen edge flash (describe it
since it's hard to screenshot). Confirm the layer order is
correct (splats under terrain and tokens).
