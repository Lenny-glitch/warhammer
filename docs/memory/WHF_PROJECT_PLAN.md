# WHF Project Plan — Phases & Agnostic Infrastructure
# 2026-07-09. Nox's reference. Save to ~/projects/warhammer/docs/
# and commit. Feeds the WHF-3 brief and everything after it.

## 0. Direction locked
- **Roster architecture: Option A.** WHF becomes a third system inside
  roster/, per the original scope doc. Supersedes the "undecided"
  framing in WHF_UPDATE_ASSUMPTIONS_BRIEF.md Section 3.
- **Aesthetic: grimdark**, matching KT/40k — dark backgrounds, muted
  military palette, health-arc tokens. Not a separate visual identity.
- **Sequencing principle:** build native for WHF first, prove it in
  real play, promote to shared/ once a second real consumer wants it.
  This is how bonus-resolver actually happened — built for KT, proven
  live, centralized after. Don't design the abstract version first
  with zero data points.
- **firebase-config.js** — flagged, not corrected, no DEVLOG edit.
  Verify with `git check-ignore` only when Firebase connectivity
  actually needs testing.

## 1. The agnostic infrastructure layer
Six pieces come out of WHF work. Each has a clear owner (who builds
it) and a clear reuse direction (who steals it later).

| Piece | Status | Reuse direction |
|---|---|---|
| **Shape/containment engine** — given an origin, a shape (circle, template, swept path), and board state, returns which entities are inside | New, WHF-native | Pioneered here for auras, blast templates, ramming. Feeds resolver — geometry decides *who*, resolver decides *what happens to them*. Portable to 40k blast weapons, vehicle ramming, any future aura effect. |
| **Scatter/randomized-placement tool** — roll direction + distance, move a thing, ignoring terrain unless told otherwise | New, WHF-native | Feeds the shape engine (blast template scatter, Magic vortex movement). Portable to deep-strike mishaps, spawn scatter, anything with imprecise placement in 40k/KT. |
| **Turn/activation sequencer** — pluggable phase/activation ordering, tested against WHF's real RAW structure (Movement→Magic→Shooting→Close Combat, Movement's own 4 sub-phases) | New, WHF-native, built async-agnostic | Pioneered here. Groundwork for play-by-mail later (not built now — just don't assume synchronous live play). Also the reusable answer if KT/40k ever want a different activation model. |
| **Model-formation geometry** — individual models with individual stats/weapons held in a formation that moves, wheels, and reforms as a group | **Already built** (WHF-1/WHF-2) | Document the interface for extraction. Pioneered here, portable to 40k squadrons or any future multi-model unit — nothing else in the project has built this. |
| **Pivot-arc / reach geometry** — can this footprint, after pivoting, reach a target without violating facing/arc constraints | New, built for WHF-3 (Charge) | Portable to 40k vehicle turning. Same shape of problem, two call sites. |
| **Resolver stat-vocabulary extensions** — Ld override/reroll facts, casting value, dispel value | Extend existing `shared/bonus-resolver.js` | Not new infra — additive fields only, same discipline as always (extend, never rename). |

## 2. Phase sequence

**WHF-3 — Charge** (next, no blockers)
WHF-native. Extends WHF-2 movement geometry directly: charge
reactions, Initiative-based reach/eligibility. Builds the pivot-arc
/ reach geometry piece as a byproduct — flag it as extractable when
it lands, don't bolt on 40k compatibility now.

**Infra piece — Shape/containment + scatter engine**
Build before WHF-4. Needed for template weapons (stone throwers,
cannons, Helstorm Rockets) and sets up the containment primitive
Psychology's auras will need later. Test scatter mechanics here
against RAW artillery dice + scatter dice.

**WHF-4 — Shooting**
WHF-native combat math. Steals KT's BON-2 profile pattern
(attackProfile/defenseProfile → resolver) for to-hit/to-wound.
Pioneers the shape/containment engine's first real use for
template/blast weapons.

**WHF-5 — Combat resolution**
WHF-native: combat res scoring, Steadfast rank-counting (uses the
already-built model-formation geometry directly — this is exactly
what it's for). Steals the resolver profile pattern for melee,
same as Shooting.

**Infra piece — Turn/activation sequencer**
Can run in parallel with WHF-4/5 — orthogonal to combat math, just
needs the phase list to sequence against. Validate against WHF's
actual four-phase RAW structure as the real test case, not a
synthetic one.

**Architecture integration — roster/ (Option A execution)**
This is where the actual roster/ merge work happens — not before
it's structurally needed. Must land before Magic phase design
starts, since Magic's data model (wizard levels, spell selection,
Winds of Magic) is roster-schema-sensitive in a way Charge/Shooting/
Combat aren't.

**WHF-Magic**
WHF-native: pool management (power/dispel dice), channeling,
cast/dispel loop, miscast table. This is closer in weight to a
second Movement phase (multi-step sub-sequence) than a single
resolver call — plan the effort accordingly. Steals resolver's stat
vocabulary for casting/dispel value. Uses the shape/containment +
scatter engine for Magic Missile and Magical Vortex spell templates.
Pioneers its own sub-phase sequencing pattern, later portable to
40k's Psychic phase.

**WHF-Psychology**
WHF-native: Panic/Break/Fear/Terror/Rally, resolved at their real
RAW trigger points (Start of Turn rally, mid-phase panic triggers,
post-combat break tests) — not a synthetic command phase. Steals
resolver's condition machinery (same class as stunned/markerlight).
This is where the aura work actually happens: Inspiring Presence
(General's Ld within 12") and Hold Your Ground! (BSB reroll-any-
failed-Ld within 12") both run through the shape/containment engine
built for WHF-4, extended with the "override/reroll a stat" effect
type on the resolver side.

## 3. What's next
First Hades brief: **WHF-3 (Charge)**. Ship it as scoped — it
doesn't need any of the six infra pieces except the pivot-arc/reach
geometry, which it builds as part of doing Charge correctly. Keep
that geometry written so it's extractable later (WHF-native
location, clean interface) without forcing 40k-compatibility
decisions into this brief.
