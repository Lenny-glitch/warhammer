# Kill Team Game App — Development Log

> **For AI collaborators:** This is the ground truth for where the Kill Team app stands.
> Read this before touching any code. The overall project context (three repos, shared Firebase)
> lives in warhammer40k/DEVLOG.md.

---

## Project Overview

Turn-based two-player Kill Team simulator. Browser-only, vanilla JS, single `index.html`.
Same Firebase project as the 40k sim (`warhammer-5f2f4`). No server, no build step.

**Firebase collection:** `games-kt/` (separate from the 40k sim's `games/` collection).

**Rosters:** read from `exports/kill-team/{rosterId}` — written by the roster builder app.

---

## Architecture Notes

**Single-file:** all CSS, HTML, and JS live in `index.html`. No separate module files.

**SVG board:** `viewBox="0 0 22 30"` — all coordinates in inches. 1" snap grid (not 2" like 40k).

**Operative instances:** built from roster export at game creation/join time. Stored in
`games-kt/{gameId}/operatives/{player}_{instanceId}`. Player-namespaced to prevent collision.

**Terrain:** same per-square `"x,y" → tier` map as the 40k sim. SVG terrain rendering and
the paint interaction were copied from `warhammer40k/js/board.js` and adapted for the 22×30 board
and 1" grid. Tag any future sync with that file if terrain logic changes.

**Key divergence from 40k sim:**
- No squads/groups — each operative is an individual unit
- Alternating single-operative activations (not whole-faction turns)
- AP system (each operative has APL action points per activation)
- `player1`/`player2` slots (not `guard`/`eldar`) — faction derived from roster meta
- Orders: `engage` (can shoot) | `conceal` (can't be targeted)
- Ready/Expended token state per operative per Turning Point

---

## Firebase Schema

```
games-kt/{gameId}/
  meta/
    status:    'waiting' | 'terrain' | 'deployment' | 'initiative' | 'active' | 'ended'
    createdAt: timestamp
    dev:       true (dev mode games only)

  players/
    player1/  { name, faction, factionName, rosterId, token }
    player2/  { name, faction, factionName, rosterId, token }

  operatives/
    {player}_{instanceId}/
      id:                 string
      player:             'player1' | 'player2'
      faction:            string (factionId from roster meta)
      factionName:        string
      unitId:             string
      name:               string
      role:               string
      order:              'engage' | 'conceal'
      ready:              bool
      apl:                number  (stored on instance — no async lookup during gameplay)
      move:               number  (inches)
      wounds:             number
      maxWounds:          number
      x:                  number  (-1 = undeployed)
      y:                  number  (-1 = undeployed)
      activatedThisTurn:  bool

  terrain:      { "x,y": 'rough' | 'chestHigh' | 'tall' }
  terrainOwner: { "x,y": 'player1' | 'player2' }

  turn/
    turningPoint:     number (1–4)
    phase:            'strategy' | 'firefight'
    activePlayer:     'player1' | 'player2'  (who has initiative)
    activatingPlayer: 'player1' | 'player2'  (whose turn to activate next)
    cp/
      player1: number
      player2: number

  initiative/
    player1: number | null
    player2: number | null

  gameOver: null | { winner: 'player1'|'player2', reason: string }
```

**Terrain budget:** 10 pts per player (rough=1, chestHigh=2, tall=3).
**Deploy zones:** player1 = bottom 10" (y: 20–30), player2 = top 10" (y: 0–10).

---

## Dev Rosters

| Slot | Faction | Roster ID |
|------|---------|-----------|
| Player 1 | Tau Pathfinders | `-OvzZzqDWpwSVAwZx3kO` |
| Player 2 | Void-dancer Troupe | `-OvzZzrLgyu9iYFRbFrb` |

Dev mode (`?dev=true`) auto-creates a game with both rosters, no lobby needed.
Both player perspectives shown side by side.

---

## Phase History

### Phase KT-1 — Kill Team Engine (2026-06-26)

**What shipped:**

**Lobby & game creation:**
- Player 1: enter name + roster ID → creates game in `games-kt/`, gets shareable link
- Player 2: opens link, enters name + roster ID → joins, game advances to terrain phase
- Faction derived from roster `meta.factionId` (Option A — no faction-select step)
- Roster ID preview: debounced fetch shows faction name + operative count before submit
- Dev mode: auto-creates game with hardcoded dev roster IDs, skips lobby

**Terrain phase:**
- Alternating square painting (same pattern as 40k sim)
- Tier selector: Rough (1pt), Chest-High (2pt), Tall (3pt)
- Budget: 10 pts per player — bar shows live spend
- Click to paint, click own square to erase, drag to paint multiple
- "Pass Turn" button — either player can end terrain and advance to deployment

**Deployment phase:**
- Deploy zones shown as tinted regions (P1 bottom 10", P2 top 10")
- Click operative in sidebar → selected → click board in drop zone → placed
- Alternating: after each placement, active player switches
- Auto-advances to initiative when all operatives are deployed

**Initiative:**
- Each player clicks "Roll 2D6" — result written to Firebase
- Both results shown when both rolled; higher roll goes first
- Tie → resets and prompts re-roll
- Advances to strategy phase with winner set as activePlayer

**Strategy Phase:**
- CP awarded: both get 1 in TP1; initiative loser gets 2 in TP2+
- All operatives readied (ready: true, activatedThisTurn: false)
- "End Strategy Phase" button (only active player can advance)
- Advances to firefight phase

**Firefight Phase:**
- Operative list sidebar: clicking a ready operative (when it's your turn) starts activation
- Activation panel in phase bar: shows operative name, AP counter, action buttons
- Order toggle (Engage ↔ Conceal) — free, no AP cost
- **Move (1AP):** click Move → drag on board → clamp to Move stat, 1" snap
  - Range circle shows max movement from current position
  - Distance label on drag
  - Ghost at start position
- **Dash (1AP):** same drag but capped at 3" (ignores Move stat)
- **Shoot/Fight/Charge:** stub buttons (disabled, dashed border), tooltip "Coming in KT-2"
- "End Activation": marks operative expended, advances activatingPlayer
- Passing logic: if switched-to player has no ready ops, stays with current player
- Turning Point ends when ALL operatives (both sides) are expended
- 4 Turning Points total, then game ends

**Visual:**
- SVG board 22×30", 1" minor grid, 5" major grid, midline
- Operative tokens: P1 blue, P2 purple, faction-colored rim
- Expended tokens dimmed (0.45 opacity)
- Active operative: gold glow ring
- Conceal order: dashed outer ring on token
- Wounded/Injured: red/orange pie sector on token

**KT-1 out of scope (planned for later phases):**
- Shooting mechanics (KT-2)
- Drag-to-attack (KT-2)
- Firing arc projection (KT-2)
- Health arc / grimdark effects (KT-3/4)
- Status token overlays (KT-5)
- Sideboard / graveyard (KT-6)
- CP spending / ploys
- Objectives / Tac Ops

**Known limitations:**
- `passTerrainTurn` advances directly to deployment — no budget-exhaustion auto-detect.
  The current pattern: first player to press "Pass Turn" ends terrain for both. This is
  a simplification; could be made stricter if needed.
- Deployment alternation: after each placement, Firebase `turn/activePlayer` switches.
  If P1 has more operatives than P2, P2 may "run out" before P1 — handled gracefully
  (P2 waits while P1 finishes). Not perfectly alternating if counts differ.
- `endTurningPoint` calls `startStrategyPhase(activePlayer)` then increments TP — two
  separate Firebase writes; should be combined in Phase KT-2 cleanup.

---

## Things The Next AI Should Know

- **`firebase-config.js`** is gitignored but required. It's the same credentials as the
  40k sim — copy from `warhammer40k/firebase-config.js`.
- **No TypeScript, no bundler, no linting.** Keep it that way.
- **`games-kt/`** is the Firebase collection — never write to `games/` from this app.
- **Dev mode** (`?dev=true`): skips lobby, auto-creates game, both panels active.
  Dev games write to real Firebase — don't worry, they don't interfere with real games.
- **APL is stored on the operative instance** (not fetched from gameData at play time).
  This was a deliberate decision (Nox call, 2026-06-26) to avoid async lookups during gameplay.
- **Terrain functions** at the top of the script are copied from `warhammer40k/js/board.js`.
  If the 40k terrain rendering changes significantly, consider whether to sync.
- **The `activation` variable is local JS state** — not in Firebase. If a player refreshes
  mid-activation, they lose their in-progress AP state. This is acceptable for KT-1.
