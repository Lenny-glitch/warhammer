# 40K-BLOOD-FX — Hit/damage visual feedback (native, built to be liftable)

CLAIMED: 2026-07-18

## Orientation
Monorepo, ~/projects/warhammer, branch master. CLAIM FIRST.
Touch ONLY warhammer40k/. Parallel session may own killteam/.
You cannot push — commit, cite hashes, Nox pushes.
VERIFY-FIRST: check claims against real code, report divergence.

## Why
Aaron wants more visceral feedback — "blood effects like killteam."
Right now a wound/kill in 40k resolves numerically with little
visual punch. Add hit/damage feedback on the board so a shot or a
melee hit LANDS visually.

Scope note: this is HIT/DAMAGE FEEDBACK in KT's existing style
(impact marks, brief spatter, hit flash) — NOT gore. Match the
tone KT already sets. Aaron wants juice, not a mature-content
pass.

## CONVERGENCE INSTRUCTION — read this, it shapes the build
Nox's long-term goal: shared capabilities that transfer between
all games. This effect WILL be ported to Kill Team (and later
Fantasy). Per project canon: build it NATIVE to 40k now (don't
build a shared abstraction on spec), BUT write it so promotion is
a LIFT, not a rewrite:
- Self-contained: keep the effect in one module/function, not
  smeared across the render loop.
- Parameter-driven: it takes inputs (position, intensity/damage,
  maybe color) and draws — it does NOT reach into 40k-specific
  game state to figure out what to draw. The CALLER passes what
  it needs.
- No hardcoded coupling to 40k's unit schema inside the effect
  itself. The trigger site (40k-specific) is separate from the
  effect (game-agnostic).
Think: "a function KT could call tomorrow with its own numbers."
Don't over-engineer it into shared/ yet — that happens when KT
actually consumes it. Just keep the seam clean.

## COORDINATE TRAP — do not skip
Screen<->board conversion on non-square boards must NOT use
rect.width/viewBox.width (ignores preserveAspectRatio letterbox-
ing — see CLAUDE.md / commit 989df94). If this effect positions
anything by screen pixels, cross-check against a real token's
getBoundingClientRect(). Prefer positioning in BOARD coordinates
(viewBox space) so pan/zoom carries the effect correctly.

## What to build
A hit/damage effect that fires when a model takes a wound and/or
dies:
- On WOUND (model survives): a brief impact mark at the model's
  position. Small, fast.
- On KILL (model removed): a stronger version — bigger spatter /
  flash as the model dies.
- Intensity scales with damage if that's cheap (a 1-damage hit vs
  a big hit reads differently). If it's not cheap, a flat effect
  is acceptable — report which you did.
- The effect is TRANSIENT: it plays and clears, it does not
  persist as board state and does NOT get written to Firebase.
  It's presentation only.

## Determinism / multiplayer
The effect is local presentation, but BOTH players should see a
hit happen (Aaron shooting Nox's model — Nox should see his model
get hit too). So the TRIGGER must fire from the shared game-state
change (a wound/death both clients observe), not from a purely
local click. Verify: when one client resolves a hit, the other
client's board plays the effect too. If it only plays for the
shooter, that's a bug.
It must NOT write new state or cause a desync — it reacts to the
wound/death that's already in state.

## Watch
- Performance: a unit of 20 models all taking hits shouldn't
  stutter. Keep effects lightweight; cap or pool if needed.
- Don't block input or the turn flow — effects play over the top,
  game stays interactive.
- Pan/zoom: effect stays anchored to the right board spot when
  the view moves (another reason to position in board coords).

## Out of scope
- Shot/laser animations (#9 — separate, bigger brief).
- Pile-in (#11 — separate).
- Killteam (this gets PORTED there later, not built here).
- Gore / mature content — this is stylized hit feedback.

## Test — two browser contexts for the multiplayer check
1. Shoot an enemy model, it survives. PASS = wound effect plays
   at the model. FAIL = nothing, or wrong spot.
2. Kill a model. PASS = stronger kill effect, model removed.
3. OTHER client watching: same hit plays on their board too.
   PASS = both see it. FAIL = only shooter sees it.
4. Pan/zoom the board, then take a hit. PASS = effect anchored
   correctly. FAIL = offset (the coordinate trap).
5. Big unit takes many hits at once. PASS = no stutter.

## Done when
Commit(s), hash(es) cited, plus a report:
1. Where the effect module lives and how it's called (show the
   seam — what the caller passes in).
2. Whether intensity scales with damage or is flat, and why.
3. The 5 tests, pass/fail with what you saw.
4. One line: what KT would need to do to reuse this (proves the
   seam is clean).
