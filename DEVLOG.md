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

  terrain:       { "x,y": 'rough' | 'chestHigh' | 'tall' }
  terrainOwner:  { "x,y": 'player1' | 'player2' }
  terrainPassed: { player1: bool, player2: bool }  — simultaneous pass tracking

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
- ~~`passTerrainTurn` advances directly to deployment — first player to press ends terrain for both~~
  **Fixed KT-3 Part 2 (2026-06-29):** terrain is now simultaneous; both players pass independently.
- ~~Deployment alternation deadlock on unequal team sizes~~ — **fixed 2026-06-26**.
  Post-placement logic now checks `otherRemaining.length > 0` (not `myRemaining.length > 0`)
  to decide whose turn it is. If the opponent has nothing left to place their turn is skipped;
  the placing player keeps `activePlayer` until they finish or both are done.
  Tested scenario: Tau Pathfinders (12 ops) vs Void-dancer Troupe (8 ops).
- `endTurningPoint` calls `startStrategyPhase(activePlayer)` then increments TP — two
  separate Firebase writes; should be combined in Phase KT-2 cleanup.

---

### KT-2 Part 2 — Drag-to-Shoot (2026-06-26)

**Shoot button** enabled. Operatives with ranged weapons (RNG field > 0) can now shoot.

**Flow:**
1. Player clicks Shoot (1AP) in activation panel
2. If multiple ranged weapons → weapon picker panel appears inline
3. Click-drag from active token toward an enemy:
   - Green solid line: valid target, clear LOS, in range, Engage order
   - Amber solid line: valid but target in cover
   - Red dashed line: out of range / LOS blocked / Concealed / friendly in melee
   - Hovering over a valid target: highlight ring appears on token
4. Release on valid target → AP spent, `pendingShot` written to Firebase
5. Both panels switch to **Shoot Resolution** view:
   - Defender sees "Use Cover / Don't Use" if target is in cover; commits their choice
   - Attacker sees "Roll Dice" (enabled once cover decided)
6. Dice rolled: ATK pool + DEF pool displayed as pip d6 faces
7. Auto-resolution: crit saves cancel crit hits, normal saves cancel normal/crit hits (2-for-1)
8. Attacker sees "Apply N Damage" button → wounds decremented in Firebase, pendingShot cleared

**Rules implemented:**
- HIT stat 1 = always miss, 6 = always crit (regardless of HIT stat)
- Injured penalty: HIT threshold +1 for injured operatives
- Cover: defender converts worst non-crit die to auto normal save
- LOS: reuses `rayResult()` — blocked by tall terrain, cover from chestHigh
- Conceal order: target untargetable (red line, label "CONCEALED")
- Don't shoot into melee: attacker's friendly within 1" of target blocks the shot

**Firebase:** `pendingShot` node at `games-kt/{gameId}/pendingShot` tracks the shot in progress across both clients. Cleared atomically when damage is confirmed.

**Out of scope:** cover save UI in fight (Part 3), weapon special rules (Part 5+), Overwatch.

**Fight and Charge** action buttons now say "Coming in KT-3" (not KT-2).

---

### Deploy branch (2026-06-26)

Created `deploy` branch from `master`. Added `build.sh` (generates `firebase-config.js`
from Netlify environment variables at build time) and `netlify.toml` (`bash build.sh`,
publish `.`). Pushed to `github.com/Lenny-glitch/killteam`.

**To host on Netlify:** connect the `deploy` branch, set the 7 `FIREBASE_*` env vars
from Firebase project settings (`warhammer-5f2f4`).

---

### KT-3 Part 1 — Radial Action Menu + Deployment Fix (2026-06-28)

**What shipped (uncommitted changes to `index.html`):**

**Radial action menu:**
- During firefight activation, action buttons are now presented as a circular radial menu centred on the active operative's token rather than as a flat list in the activation panel.
- 7 buttons arranged radially: Move, Dash, Shoot, Fight, Charge, Engage/Conceal (order toggle), End.
- `showRadialMenu(opId, playerSlot)` / `hideRadialMenu()` / `refreshRadialIfActive()` — new functions. `refreshRadialIfActive()` is called from `reRender()` so the menu tracks operative position when the board re-renders.
- `<div id="radial-menu"></div>` added to body; wired via CSS absolute positioning.
- `let radialSlot = null` added to module state.

**Deployment fix (simultaneous):**
- Deployment is no longer gated on `turn.activePlayer === viewerSlot`. Both players can now deploy simultaneously instead of alternating. This removes a friction point when one player is slow to place — the other can keep going.

**Shoot confirmation flag:**
- `activation.hasShot = true` now set alongside `apSpent` on `confirmShootTarget`. Prevents double-shoot within the same activation.

**Cover UI text:**
- Defender cover prompt clarified to: "You are in cover — use it? Convert one defence die to an automatic normal save."

**Dead operative opacity:**
- Expended token opacity changed from `0.25` → `0.55`. Operatives were becoming too hard to see on the board when expended.

**Out of scope:** Fight, Charge mechanics (KT-3 Part 2+).

---

### KT-2 Part 3 — Drag-to-Fight (2026-06-29)

**Fight button** enabled. Operatives with melee weapons (`type: 'melee'`) can now fight.

**Flow:**
1. Player clicks Fight (1AP) in activation panel or radial menu
2. If multiple melee weapons → weapon picker panel appears inline
3. Click-drag from active token toward an enemy:
   - 1" control range ring shown around attacker
   - Red ring on target if within 1" (valid), grey if out of reach
   - Distance label shown on drag
4. Release on valid target (≤1" away) → AP spent, `pendingFight` written to Firebase
5. Both panels switch to **Fight Resolution** view:
   - Both sides' dice rolled simultaneously; misses auto-resolved with no effect
   - Attacker goes first — interactive die-picking: click a hit/crit die, then Strike or Block
   - Block auto-cancels the best available opponent die (crit blocks anything; normal only blocks non-crits)
   - Sides alternate until all dice are resolved
   - Running damage tallies shown live for both sides
6. When all dice resolved → "Apply Damage" button appears (attacker triggers)
7. Both operatives take their wounds in a single Firebase write; `pendingFight` cleared

**Rules implemented (RAW):**
- Attacker initiates fight from within 1" (control range) — Fight button greyed out with "No enemies in control range" when no valid targets
- Fight works regardless of Engage/Conceal order (no order restriction)
- Both sides roll their own melee weapon's ATK dice simultaneously
- Injured penalty applied: HIT threshold +1 for injured operative (wounds ≤ half maxWounds)
- Defender's retaliation is NOT a separate action — no AP cost to defender
- Both operatives can be incapacitated; all damage applied simultaneously after resolution
- `hasFought` flag prevents fighting twice in same activation

**Auto-resolve (flagged per KT2_PART3_BRIEF.md):** Player-choice alternating resolution deferred to KT-3.
- Attacker: all hit/crit dice Strike (deal damage to defender)
- Defender: crit dice Block attacker crits first, then normals; remaining hits Block attacker normals; unblocked defender dice Strike attacker
- Miss dice: no effect

**Firebase:** `pendingFight` node at `games-kt/{gameId}/pendingFight`. Written once on target confirmation with fully-resolved state (`atkAnnotated`/`defAnnotated` arrays + final `dmgToDefender`/`dmgToAttacker`). Single Firebase write per fight. Attacker clicks "Apply Damage" to commit wounds.

**Drag visual:** red dashed line; "FIGHT" label when hovering valid target within 1"; distance + "out of reach" for invalid.

**Defender weapon auto-pick:** defender's `isDefault: true` melee weapon selected automatically (or first melee weapon if no default).

**VDT name fix:** Firebase `gameData/kill-team/factions/void-dancer-troupe/units/player/name` and all 5 Player entries in the dev export patched to "Troupe Player". Scraped data file also fixed.

**Known limitations:**
- Auto-resolve only — player-choice alternating Strike/Block deferred to KT-3.
- `hasFought` only blocks fighting once; RAW allows multiple fights per activation with enough AP.
- Defender weapon selection is always the first default melee weapon; no choice given to defender.

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

---

## Code Reference Map

> Fast lookup for future AI sessions. Every section below maps a feature to its function
> names and approximate line numbers in `index.html`. Line numbers will drift as code grows —
> use them as a starting point, then grep to verify.

---

### Constants (line ~403)

```
BOARD_W = 22          Board width in inches (SVG units)
BOARD_H = 30          Board height in inches
DEPLOY_DEPTH = 10     Deployment zone depth — bottom/top 10" each
TERRAIN_BUDGET = 10   Points per player for terrain placement
TOKEN_R = 0.5         Operative token radius in SVG inches
TERRAIN_COSTS         { rough:1, chestHigh:2, tall:3 }
DEV_ROSTER_P1/P2      Hardcoded Firebase roster IDs for dev mode
```

All coordinates are in inches. The SVG `viewBox` is `0 0 22 30`. 1 SVG unit = 1 inch.
P1 deploys at the bottom (`y: 20–30`). P2 deploys at the top (`y: 0–10`).

---

### SVG & Math Utilities (line ~421)

| Function | What it does |
|---|---|
| `svgEl(tag, attrs)` | Create a namespaced SVG element with attributes |
| `clearEl(el)` | Remove all children from an element |
| `toSVG(svg, cx, cy)` | Convert screen coordinates to SVG coordinates |
| `clampVec(fx, fy, tx, ty, max)` | Clamp destination to within `max` inches along a vector |
| `snapToGrid(x, y)` | Round to nearest inch, clamped to board bounds (0.5–21.5, 0.5–29.5) |
| `segmentsIntersect(...)` | Parametric line-segment intersection test |
| `segmentCrossesRect(...)` | Does a line cross a terrain square? |
| `rayResult(x1,y1,x2,y2, terrain)` | Returns `'clear'` \| `'cover'` \| `'blocked'` — used for LOS |
| `circleOverlapsRect(...)` | Circle vs AABB overlap |
| `dieFaceSVG(value, size)` | Inline HTML string of a pip d6 face |

`rayResult` is the key LOS function — it iterates every terrain square and tests whether the
attacker→target line crosses it. Tall = blocked. ChestHigh = cover. Rough = no LOS effect.
This function is **copied from `warhammer40k/js/board.js`** and should be kept in sync.

---

### App State (line ~586)

All module-level `let` variables. The important ones:

| Variable | Type | Purpose |
|---|---|---|
| `gameId` | string | Firebase game key |
| `gameData` | object | Live Firebase snapshot (updated on every `on('value')` event) |
| `myPlayer` | `'player1'`\|`'player2'` | Local player slot (normal mode only) |
| `activation` | object\|null | Local-only active operative state — **not in Firebase** |
| `dragState` | object\|null | Active Move/Dash drag state |
| `shootWeapon` | null\|`'picking'`\|weapon | Shoot weapon selection state |
| `shootState` | object\|null | Active shoot drag in progress |
| `fightWeapon` | null\|`'picking'`\|weapon | Fight weapon selection state |
| `fightState` | object\|null | Active fight drag in progress |
| `radialSlot` | string\|null | Which player's radial menu is showing |
| `deploySelId` | string\|null | Operative selected for deployment |

**`activation` object shape:**
```js
{ opId, apRemaining, playerSlot, apSpent, hasMoved, hasDashed, hasShot, hasFought }
```
Set by `activateOperative()` (line ~1872), cleared by `endActivation()` or `cancelActivation()`.
`apSpent` becomes `true` on first AP-costing action — this gates whether Cancel is allowed.

---

### Bootstrap (line ~614)

`DOMContentLoaded` reads `?dev=true` and `?game=` from the URL.
- Dev mode → `bootDev()` (skips lobby entirely)
- Game ID in URL → `loadGame(id)` → `subscribeToGame()`
- No params → `renderLobby('create')`

`subscribeToGame()` (line ~924) opens a Firebase `on('value')` listener that calls `render()`
on every change. This is the single re-render trigger for all Firebase state changes.

---

### Roster Loading & Operative Building (line ~665)

**Data flow:** `exports/kill-team/{rosterId}` in Firebase → `fetchRosterExport()` → `buildOperatives()` → operative instances written to `games-kt/{gameId}/operatives/`

`buildOperatives(exportData, playerSlot)` (line ~670):
- Iterates `exportData.units` (array or object)
- Numbers duplicate names: `"Troupe Player"×5` → `"Troupe Player #1"` through `#5`
- Parses stats from strings: `parseStat("6\"")` → `6`
- Copies full weapon list onto each instance (no async lookup during gameplay)
- Sets `x: -1, y: -1` (undeployed sentinel)
- Returns a flat `{ [id]: operativeObject }` map

**Operative instance shape (written to Firebase):**
```js
{
  id, player, faction, factionName, unitId,
  name,        // display name (numbered if duplicate)
  role,        // e.g. "Shas'ui", "Lead Player"
  order,       // 'engage' | 'conceal'  — starts as 'conceal'
  ready,       // bool — false when expended
  apl,         // action points per activation (from stats.APL)
  move,        // inches (from stats.MOVE)
  def,         // defence dice (from stats.DF)
  save,        // save threshold (from stats.SAVE)
  wounds,      // current wounds
  maxWounds,   // max wounds (from stats.WOUNDS)
  weapons,     // full weapon array (see Weapon Format below)
  x, y,        // board position; -1 = undeployed
  activatedThisTurn,
}
```

---

### Weapon Profile Format

Weapons come from the roster export and are stored verbatim on the operative instance.

**Kill Team weapon profile fields:**
```
ATK   — number of attack dice (string, e.g. "4")
HIT   — hit threshold (string, e.g. "3+")
DMG   — "normalDmg/critDmg" (string, e.g. "4/6")
RNG   — range in inches as a plain integer string (e.g. "8"), OR empty
WR    — weapon rule text (e.g. "Range 3\", Devastating 3, Piercing 2")
type  — 'ranged' | 'melee'
isDefault — bool (first weapon of each type from scraper)
```

**Range ambiguity note:** Some weapons store range in `WR` as `"Range X\""` instead of
in the `RNG` field. `getRangedWeapons()` (line ~2247) filters by `parseRng(w.profiles?.RNG) > 0`,
which only reads the `RNG` field. `getMaxSightRange()` (line ~2257) is the more robust helper —
it tries `RNG` first, then falls back to a `/Range\s+(\d+)/i` regex on `WR`. Use
`getMaxSightRange()` for visual/informational range; use `getRangedWeapons()` for game-valid
shoot targets.

**Weapon parse helpers (line ~2240):**
```js
parseRng(s)          // parseInt on RNG field — returns 0 if missing/non-numeric
parseHit(s)          // parseInt on "3+" → 3
parseDmgPair(s)      // "4/6" → [4, 6]  (normalDmg, critDmg)
isInjuredOp(op)      // wounds > 0 && wounds <= maxWounds/2
getRangedWeapons(op) // filter by parseRng(RNG) > 0
getMeleeWeapons(op)  // filter by type === 'melee'
getDefaultMeleeWeapon(op) // isDefault:true, or first melee
getMaxSightRange(op) // max range across all ranged-type weapons (RNG or WR regex)
hasFightTarget(op)   // any enemy within 1" (control range)
```

---

### Game Creation / Joining (line ~769)

`createGame(name, rosterId)` — P1 path:
1. Fetch roster export from Firebase
2. `buildOperatives(exportData, 'player1')`
3. Push to `games-kt/` with `meta.status = 'waiting'`
4. Save `myPlayer = 'player1'` to localStorage
5. Call `subscribeToGame()`

`joinGame(name, rosterId)` — P2 path (line ~819):
1. Verify game exists and has no P2 yet
2. Fetch roster, build P2 operatives
3. `db.update()` with P2 player data, P2 operatives, and `meta/status: 'terrain'`
4. Subscribe

Both paths store player slot in `localStorage` keyed by gameId so page refresh restores context.

---

### Dev Mode (line ~858)

`bootDev()` (line ~862):
- Fetches both hardcoded dev rosters in parallel
- Builds both sets of operatives, merges into one object
- Creates game with `meta.status: 'terrain'` and `meta.dev: true`
- Does NOT set `myPlayer` — both player panels are active simultaneously

Dev banner (HTML, line ~360):
- **Reset Game** → `devNewGame()` (line ~3022): confirms, deletes old game, resets all state, calls `bootDev()`
- **Auto-Place** → `autoPlaceDev()` (line ~3045): places all undeployed ops in grid within deploy zones, writes `meta/status: 'initiative'` in one Firebase update

`autoPlaceDev` layout: up to 10 per row, evenly spaced across 22" board width.
P1 starts at y=29 going up by 2"; P2 starts at y=1 going down by 2".

---

### Render Architecture (line ~935)

```
subscribeToGame() → on('value') → render()
                                    ├─ devMode → renderDev() → renderDevCol() ×2
                                    └─ normal  → renderGame(myPlayer)

renderGame(playerSlot)
  builds: topbar + sidebar ×2 + board-wrap + phase-bar
  calls:  buildBoardSVG()     → draws SVG, wires interactions
          renderPhaseBar()    → dispatches to phase-specific renderer
          renderOpList()      → operative sidebar rows

reRender()          (line ~3000)  Full re-render. Called on Firebase updates.
reRenderPhaseBar()  (line ~3006)  Partial re-render — phase bar only, no SVG rebuild.
                                   Used for mid-action state changes (AP spent, cover choice).
refreshRadialIfActive()  (line ~2228)  Re-positions radial menu after re-render.
```

**SVG layer order (bottom to top):**
1. Background rect (`#0a0a14`)
2. Grid lines (`gridG`)
3. Deploy zone tints (`deployG`) — only during deployment
4. Terrain squares (`terrainG`)
5. Operative tokens (`unitG`) — `<g class="op-token" data-op-id="...">` per operative
6. Overlay (`<g id="overlay-{slot}">`) — drag lines, arc circles, glow rings

---

### Terrain Phase (line ~1208 phase bar, ~1623 interaction)

**Bar:** `renderTerrainBar(playerSlot)` — shows tier buttons (Rough/Chest-High/Tall), budget bars for
both players, "Pass Turn" button. Both players see controls simultaneously. Once a player passes,
their panel shows "Turn passed — waiting for opponent…". Tier selection updates local `terrainTier`.

**Interaction:** `setupTerrainPaint(svg, playerSlot)` (line ~1623):
- Returns early if `gameData.terrainPassed[playerSlot]` (passed players can't paint).
- `mousedown`: determine paint vs erase mode (erase if clicking own square with same tier)
- `mousemove`: accumulate squares in `strokes` Map and `erases` Set; check budget on each square
- `mouseup`/`mouseleave`: `commitStroke()` → single `db.update()` with all `terrain/{x,y}` and
  `terrainOwner/{x,y}` changes

Budget tracking uses a running projection across the current stroke to prevent overspend.
Can't paint opponent's squares.

`passTerrainTurn(playerSlot)` (line ~1738): writes `terrainPassed/{playerSlot}: true`. If the
other player has already passed, also writes `meta/status: 'deployment'`. Deployment only starts
when both players have passed.

---

### Deployment Phase (line ~1262 phase bar, ~1752 interaction)

**Flow:**
1. Click operative in sidebar → `selectForDeploy(opId)` sets `deploySelId`
2. Click board inside own deploy zone → `setupDeployClick()` handler fires
3. Validates: inside zone bounds, no token within `TOKEN_R * 2` (1")
4. Writes `{ x, y }` to `operatives/{opId}`
5. Re-fetches all operatives, checks `anyUndeployed`; if none remain → writes `meta/status: 'initiative'`

Both players deploy simultaneously (no `activePlayer` gating since KT-3 Part 1).

Zone bounds: P1 `y: 20–30` (`BOARD_H - DEPLOY_DEPTH` to `BOARD_H`), P2 `y: 0–10`.

---

### Initiative Phase (line ~1286 phase bar, ~1800 logic)

`rollInitiative(playerSlot)` (line ~1800):
- Rolls 2D6 (`Math.ceil(Math.random() * 6) × 2`)
- Writes result to `initiative/{playerSlot}`
- Re-fetches `initiative/`, checks if both rolled
- Tie → sets `initiative: null` to reset
- Winner → 1800ms delay then `startStrategyPhase(winner)`

---

### Strategy Phase (line ~1315 bar, ~1862 logic, ~1823 start)

`startStrategyPhase(initiativeWinner, overrides)` (line ~1823):
- Called by initiative resolution AND by `endTurningPoint` (which passes `overrides` to
  include the TP increment in the same atomic write)
- Awards CP: TP1 = 1 each; TP2+ = initiative winner gets 1, loser gets 2
- Readies all operatives (`ready: true, activatedThisTurn: false`)
- Writes everything in one `db.update()`: status, phase, CP, operative states

`endStrategyPhase(playerSlot)` (line ~1862):
- Guards: only active player can advance
- Writes `turn/phase: 'firefight'`

---

### Firefight Phase — Activation (line ~1334 bar, ~1872 logic)

**Activation flow:**
1. `activateOperative(opId, playerSlot)` (line ~1872) — sets local `activation` object
2. `showRadialMenu()` appears on token; `renderActivationBar()` appears in phase bar
3. Player takes actions (Move, Dash, Shoot, Fight)
4. `endActivation(playerSlot)` (line ~1894) — marks op `ready: false`, calls `advanceActivatingPlayer()`

`advanceActivatingPlayer(justActivatedSlot)` (line ~1908):
- Re-fetches operative states
- If both players have no ready ops → `endTurningPoint()`
- Otherwise: try to give turn to the other player; if they have no ready ops, stay with current

`endTurningPoint()` (line ~1930):
- TP 4 → writes `meta/status: 'ended'`
- Otherwise → `startStrategyPhase(activePlayer, { 'turn/turningPoint': tp + 1 })`
  (single atomic write — no separate TP increment step)

**Action gate logic** (computed in both `renderActivationBar` and `showRadialMenu`):
```
moveDisabled  = ap < 1 || dragActive || hasMoved
dashDisabled  = ap < 1 || dragActive || hasDashed
shootDisabled = ap < 1 || !ranged.length || shootState || fightState || pendingShot || pendingFight || conceal
fightDisabled = ap < 1 || !melee.length || !hasFightTarget || shootState || fightState || pendingShot || pendingFight || hasFought
```

---

### Token Rendering (line ~1508 health arc, ~1552 token)

`drawHealthArc(parent, op)` (line ~1514):
- 270° segmented arc, gap at bottom (6 o'clock)
- One segment per wound point
- Green above half; all-red at/below Injured threshold (wounds ≤ maxWounds/2)
- Radius: `TOKEN_R + 0.15` (0.65" — just outside token body)
- Arc math: start at 135°, step by `270/N` degrees per segment, `segFill = segSpan - 3°` gap

`drawOperativeToken(parent, op, viewerSlot, status, phase)` (line ~1552):
- Dead ops: dark circle + red X lines, 0.65 opacity
- Expended ops: 0.45 opacity on `<g>`
- Token body: faction-colored fill circle + rim-colored stroke
- Health arc drawn on top of body
- Abbreviation label: first character of op name, rim color
- Order pip: top-right corner, green = Engage, dark = Conceal
- Active glow ring: gold, r = `TOKEN_R * 1.75`, inserted as first child (behind everything)
- Player colors: P1 `#4a9eff` / P2 `#c97af7`

---

### Move / Dash Drag (line ~1947)

`startMove(playerSlot, isDash)` (line ~1947):
- Computes `maxMove = isDash ? 3 : op.move`
- Dims all non-active tokens to 0.25 opacity
- Adds ghost circle at start position (permanent overlay child [0])
- Adds movement range circle (permanent overlay child [1])
- Stores `dragState = { ..., maxSightRange, arcRgb }` — includes firing arc data
- Attaches `mousemove` / `mouseup` handlers; calls `updateDragOverlay()` on each move

`updateDragOverlay(tx, ty)` (line ~2019):
- Keeps children [0] and [1] (ghost + range circle)
- Clears everything else, then draws fresh:
  1. Distance line (gold dashed)
  2. Destination preview circle
  3. Distance label (mid-line, dark background)
  4. **Firing arc circle** centered at destination (faction color, 10% fill, 30% stroke)
  5. **Enemy glow rings** (amber yellow) on all live enemies within `maxSightRange`

`commitMove(tx, ty, apCost, playerSlot)` (line ~2073):
- Writes `{ x, y }` to `operatives/{opId}`
- Decrements `activation.apRemaining`
- If AP exhausted → `endActivation()`; else `reRenderPhaseBar()`

---

### Firing Arc Projection (inside `updateDragOverlay`, line ~2051)

Only active during Move or Dash drag (not Shoot, Fight, or Charge).

`getMaxSightRange(op)` (line ~2257):
- Scans all `type: 'ranged'` weapons
- Reads `w.profiles.RNG` first (integer string); if 0, regex `Range\s+(\d+)` on `w.profiles.WR`
- Returns the max range found, or 0 (arc not drawn for melee-only operatives)

Visual: faction-colored dashed circle at drag destination (`rgba({arcRgb}, 0.10)` fill).
Enemy operatives within range get an amber ring (`rgba(255,220,50,0.60)`), regardless of
Conceal order (range visibility is not hidden information). Distance-only check per frame;
no `rayResult()` during drag.

---

### Radial Action Menu (line ~2120)

`showRadialMenu(opId, playerSlot)` (line ~2124):
- Converts operative's SVG position to screen coordinates via `svg.getScreenCTM()`
- Builds 6 radial buttons + 1 "End" center button as positioned `<div>` elements
- Buttons arranged at: -90° (order), -30° (move), 30° (dash), 90° (shoot), 150° (fight), 210° (charge)
- Radius from center: 72px; button size: 50×50px
- Hover-restriction display: hovering a button highlights buttons it would lock (`data-locks` attribute)
- Mounted at `#radial-menu` (fixed position div in HTML body)

`refreshRadialIfActive()` (line ~2228) — called by `reRender()`:
- If activation is live and no drag/shoot/fight state → `showRadialMenu()`
- Otherwise → `hideRadialMenu()`
- This is how the menu follows the token after a Move commits.

---

### Shoot Action (line ~2237)

**Flow:**
1. `startShoot(playerSlot)` (line ~2300) — gets `getRangedWeapons(op)`. Single weapon → skip picker. Multiple → set `shootWeapon = 'picking'` and re-render.
2. `beginShootDrag(playerSlot, weapon)` (line ~2337) — sets `shootState`, attaches mouse handlers
3. `updateShootOverlay(p)` (line ~2393) — per-frame: draws range circle from attacker, colored line to hover target (green=valid, amber=cover, red=invalid), hover ring on target
4. `mouseup` → `getShootValidity()` → if valid, `confirmShootTarget()`
5. `confirmShootTarget()` (line ~2452) — spends 1AP, writes `pendingShot` to Firebase
6. Both clients render `renderShotResolutionBar()` — defender chooses cover, then attacker rolls
7. `rollShot(playerSlot)` (line ~2478) — rolls ATK + DEF dice, applies cover, runs save resolution, writes results back to `pendingShot`
8. `confirmShotDamage()` (line ~2526) — atomic update: wounds to target + `pendingShot: null`

**`getShootValidity(attacker, target, weapon)`** (line ~2277):
- Checks: target alive, not Conceal, in range, LOS not blocked, no friendly within 1" of target
- Returns `{ valid, reason, inCover }`

**Shoot dice resolution (in `rollShot`):**
- Roll = 6 → always crit. Roll = 1 → always miss. Roll ≥ HIT → normal hit.
- Injured penalty: effective HIT + 1 (capped at 6).
- Cover: convert the lowest non-crit defence die to `'auto'` (automatic normal save).
- Crit saves cancel crit hits 1-for-1 → then crit saves cancel normal hits 2-for-1 (RAW).
- Normal saves cancel normal hits 1-for-1.

**`pendingShot` Firebase node shape:**
```
attackerOpId, targetOpId, attackerSlot,
weapon, inCover, useCover, coverDecided,
phase: 'coverChoice' → 'rolled',
atkRolls, defRolls,
remainingCritHits, remainingNormalHits,
totalDamage, normalDmg, critDmg, effectiveHit
```

---

### Fight Action (line ~2651)

**Flow:**
1. `startFight(playerSlot)` (line ~2655) — gets `getMeleeWeapons(op)`. Single weapon → skip picker. Multiple → `fightWeapon = 'picking'`.
2. `beginFightDrag(playerSlot, weapon)` (line ~2685) — sets `fightState`, draws 1" control range circle
3. `updateFightOverlay(p)` (line ~2742) — per-frame: draws 1" range ring around attacker, hover ring on target (red if valid/≤1", grey if out of reach), dashed red line, "FIGHT" or distance label
4. `mouseup` → if target within 1" → `confirmFightTarget()`
5. `confirmFightTarget()` (line ~2787) — rolls both sides' dice, auto-resolves, writes `pendingFight` in one Firebase write
6. Both clients render `renderFightResolutionBar()` showing annotated dice pools
7. `confirmFightDamage()` (line ~2880) — attacker only; atomic update: both operatives' wounds + `pendingFight: null`

**Auto-resolve algorithm (in `confirmFightTarget`):**
```
Classify ATK dice:  d=6 → crit, d≥HIT (d≠1) → hit, else → miss
Classify DEF dice:  same with defender's weapon HIT stat

Defender blocks:
  Step 1: defender crits block attacker crits (1-for-1)
  Step 2: remaining defender crits block attacker normals (1-for-1)
  Step 3: defender normals block attacker normals (1-for-1)
  Remaining unblocked attacker dice → Strike (deal damage to defender)
  Remaining defender dice → Strike (deal damage to attacker)

dmgToDefender = unblocked_atk_crits × atkCDmg + unblocked_atk_hits × atkNDmg
dmgToAttacker = surviving_def_crits × defCDmg + surviving_def_hits × defNDmg
```

Defender's weapon auto-selected: `isDefault: true` melee weapon, or first melee weapon.
Injured penalty applies to both sides independently. No AP cost for defender retaliation.

**`pendingFight` Firebase node shape:**
```
attackerOpId, defenderOpId, attackerSlot,
atkWeapon, defWeapon,
atkHitStat, defHitStat, atkNDmg, atkCDmg, defNDmg, defCDmg,
phase: 'confirm',
atkRolls, defRolls,
atkAnnotated,   // per-die: 'crit' | 'hit' | 'miss'
defAnnotated,   // per-die: 'crit-block' | 'hit-block' | 'crit-strike' | 'hit-strike' | 'miss'
dmgToDefender, dmgToAttacker
```

---

### Cross-Client State Pattern (`pendingShot` / `pendingFight`)

Both Shoot and Fight use the same pattern to sync resolution across two browsers:

1. **Attacker writes** the full resolved state to a Firebase node (`pendingShot` or `pendingFight`)
2. **Firebase `on('value')`** fires on both clients → `render()` → `renderFirefightBar()` detects the node
3. **`renderFirefightBar()` checks** `iAmAttacker` and `iAmDefender` → renders the appropriate view
4. **Final commit** by attacker clears the node atomically with the wound update

This pattern works because **all resolution happens client-side on the attacker**, then the full
result (annotated dice, damage totals) is written in one write. The defender never needs to compute
anything — they only see the results and optionally make choices (cover) before the roll.

For new actions that need cross-client interaction, follow this pattern. Name the Firebase node
clearly (`pendingCharge`, `pendingOverwatch`, etc.) and check `iAmAttacker`/`iAmDefender` in
`renderFirefightBar()` before the general activation bar render.

---

### Roster Integration Reference

**How a roster gets into a game:**

```
Roster Builder App
  └─ publishes to: exports/kill-team/{rosterId}
       └─ schema: { meta: { factionId, factionName, ... }, units: [...] }

killteam/index.html
  └─ fetchRosterExport(rosterId)         reads exports/kill-team/{rosterId}
  └─ buildOperatives(exportData, slot)   transforms units → operative instances
  └─ db.ref('games-kt').push().set({     writes to games-kt/ collection
       operatives: { [id]: operativeInstance, ... }
     })
```

**Roster export unit shape** (what `buildOperatives` reads):
```js
{
  instanceId,   // unique identifier within the roster
  unitId,       // references gameData/kill-team/factions/{faction}/units/{id}
  name,         // display name
  role,         // e.g. "Shas'ui", "Troupe Player"
  stats: { APL, MOVE, DF, SAVE, WOUNDS },  // string values, parsed via parseStat()
  weapons: [{ id, name, type, isDefault, profiles: { ATK, HIT, DMG, WR, RNG } }],
  chosenLoadout, // optional override — takes priority over weapons array
}
```

**Key denormalization decisions:**
- Full weapon list is copied onto each operative instance at game creation time.
  Reason: no async Firebase lookup needed during gameplay when resolving combat.
- `apl`, `move`, `def`, `save` are stored as parsed integers on the instance.
  Reason: same — avoid string parsing during combat.
- Names are resolved (numbered) at instance creation time.
  Reason: consistent display; op names never change mid-game.

**Adding a new game system (e.g. AoS):**
- Create `exports/{system}/{rosterId}` nodes in Firebase (same structure)
- Create `games-{system}/{gameId}` collection (different from `games-kt/`)
- Adapt `buildOperatives` for system-specific stats (AoS uses different stat names)
- The `rayResult()` / `segmentsIntersect()` / `dieFaceSVG()` utilities are pure math —
  copy them directly; they have zero KT-specific logic

---

### KT-3 Part 2 — Combat Feel Refinements (2026-06-29)

**Beam timing rework:**

Old sequence: beam fired when `pendingShot` was *cleared* (i.e. on damage confirm).
New sequence: beam fires when attacker clicks **Roll Dice**, simultaneously with dice tumble.

- `rollShot()` now calls `playBeamOnly(p, attacker, target)` synchronously before the Firebase write.
- `detectAndPlayEffects` no longer triggers a beam on target confirmation.
- On damage confirm, only impact burst + screen flash fire (`playBurstAndFlash`).
- Beam always travels full distance (hasDamage=true) — it's announcing the shot, not confirming the outcome.

**Multi-beam per ATK die (partially working):**

- `playBeamOnly` fires one beam per ATK die (capped at 6).
- Per-beam duration = `DURS[tier] / atkCount` so the full volley takes the same total time as a single beam.
- `drawBeam` accepts optional `durOverride` (8th param) to override tier-derived duration.
- **Known issue:** only one beam visually appears. Suspected cause: Firebase's local optimistic write fires `render()` almost immediately, wiping the SVG and any in-flight beam from the i=0 setTimeout. Subsequent beams draw to the rebuilt SVG but overlap on identical paths. Tabled for now — the speed-scaling change (faster beams for more ATK dice) is visible and feels correct.

**Dice tumble animation:**

When `pendingShot.phase` transitions from `coverChoice` → `rolled`, each die cycles through random pip faces before landing on its real value.

- Module-level `diceAnimState` tracks display values, stop times, and the animation timer.
- `startDiceAnimation(pending)` called from `detectAndPlayEffects` on phase transition.
- Each die gets a stop time: `baseTumble + (dieIdx × stagger)`. ATK dice settle first, then DEF.
- `auto` cover-save dice appear immediately (they're not rolled, no tumble).
- `renderShotResolutionBar` reads `diceAnimState.displayAtk/displayDef` while animating; result summary and Apply Damage button hidden until all dice land.
- Timing by tier:

| Tier | Tumble | Stagger | Max total (6 dice) |
|------|--------|---------|-------------------|
| subtle | 300ms | 30ms | ~450ms |
| dramatic | 500ms | 60ms | ~800ms |
| cinematic | 700ms | 80ms | ~1100ms |

**Simultaneous terrain placement:**

Terrain was alternating (only `activePlayer` could place). Now both players place simultaneously, matching deployment behaviour.

- `terrainPassed: { player1: false, player2: false }` added to Firebase schema (both init paths).
- `renderTerrainBar(playerSlot)` — `iAmActive` param removed. Now reads `gameData.terrainPassed[playerSlot]`.
  - Both players always see tier buttons + Pass Turn button.
  - Once passed: "Turn passed — waiting for opponent…" replaces controls.
  - Tier buttons disabled when budget exhausted OR player has passed.
- `passTerrainTurn(playerSlot)` — writes `terrainPassed/{playerSlot}: true`; advances to deployment only when the other player has also passed.
- `setupTerrainPaint` — `iAmActive` guard removed. Guards on `hasPassed` instead (passed players can't continue painting).

---

### KT-2 Part 4 — Firing Arc (added 2026-06-29)

`getMaxSightRange(op)` (line ~2257) — scans `type: 'ranged'` weapons, reads `RNG` field or
parses `/Range\s+(\d+)/i` from `WR`. Returns max range in inches; 0 if no ranged weapons.

Fired from `updateDragOverlay` (line ~2051) during Move/Dash drag only.
Not fired during Shoot, Fight, or Charge drags (those use `shootState`/`fightState`, not `dragState`).
