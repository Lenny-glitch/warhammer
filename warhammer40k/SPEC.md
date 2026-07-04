# Warhammer 40k - Phase 1 Spec

## Goal
A turn-based, two-player 40k game playable remotely via shared link.
Phase 1 = one full guided turn structure working end-to-end with two
small squads. Not a full ruleset, not real-time.

## Board
- Size: 44" x 60" (standard 40k table)
- 2D top-down view
- Semi-grid: free movement, snapped to a measured grid for accuracy
- Terrain: simple blocking shapes to start (no LOS-blocking complexity yet)

## Units (Phase 1 only)
- Guard: Infantry Squad, 10 models, basic stat line, one attached Sergeant
- Eldar: Guardian Defender Squad, same scale
- Tokens show faction color, unit type label, wounds remaining

## Turn Structure (guided, step by step for both players)
1. Command phase (CP awarded, tracked but not spendable yet - see CP below)
2. Movement phase (with measurement arrow, like Kill Team build)
3. Shooting phase (range/LOS check, dice roll, damage)
4. Charge phase
5. Fight phase
6. Morale phase

Each phase should walk the active player through what to do before
handing off, same pattern as the Kill Team project.

## Command Points
- Tracked per player, increments each Command phase
- STUBBED: no orders, no stratagems yet. Just a visible counter.
- Orders/stratagems are explicitly Phase 3 - do not implement in Phase 1.

## Backend
- Same Firebase project as the Kill Team build
- New top-level collection (e.g. `games40k`) so data doesn't collide
  with Kill Team game data
- Shareable link loads current game state
- Replay of opponent's last turn: movement arrows, shot lines, dice
  roll display (rebuild from scratch, not reused code)

## Explicitly OUT of scope for Phase 1
- Stratagems
- Order effects
- Psychic phase
- Full army lists (more than the two squads above)
- Anything Kill Team specific
