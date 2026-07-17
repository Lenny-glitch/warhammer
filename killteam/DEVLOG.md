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

### Data Pipeline — Phase A/B/C (2026-06-29)

Standalone BSData XML → Firebase pipeline at `~/projects/data-pipeline/`.

**Phase A — Rule glossary extractor (`extract-glossary.js`):**
- Reads `.gst` files from both BSData repos, extracts all `<sharedRules>` entries
- Output: `rules-glossary-kt.json` (22 KT weapon rules), `rules-glossary-40k.json` (33 40k rules)
- Each entry: `id`, `name`, `description`, `aliases`, `category`

**Phase B — Kill Team parser (`parse-kt.js`):**
- Parses all 47 KT 2024 faction `.cat` files → one JSON per faction
- Handles two storage patterns: operatives in `selectionEntries` OR `sharedSelectionEntries`
- Stats via inline Operative profiles OR `infoLink type="profile"` → sharedProfiles
- Weapon rules resolved: exact match → alias match → parametric fallback (`Limited 1` → `Limited x`)
- DF hardcoded to `"3"` (universal KT3 value, absent from BSData)
- Slug lookup table preserves all 6 existing Firebase faction slugs exactly
- All warnings resolved: 47 factions, 0 unknown weapon keywords

**Phase C — 40k parser (`parse-40k.js`):**
- Parses `Imperium - Astra Militarum - Library.cat` and `Aeldari - Aeldari Library.cat`
- All unit entries in `sharedSelectionEntries` (Library cats have no top-level selectionEntries)
- DFS traversal handles 3+ nesting patterns for model/weapon discovery
- Weapons found via inline selectionEntries (Aeldari) and entryLinks (AM)
- Keyword matching: exact, stripped numeric suffix, parametric-x, anti-prefix, hyphen-normalized
- AP 0 / numeric-zero fix: `charText` now uses `=== null/undefined` guard not falsy check
- AM: 36 units, 34 with stats; Aeldari: 47 units, 35 with stats
- Missing stats are cross-file references (Drukhari units in Aeldari Library, one Legends entry)
- Points modifier detected → `_pointsNote` flag added

**Phase E — Upload script (`upload.js`):**
- Reads `databaseURL` from `~/projects/roster/firebase-config.js` at runtime (no hardcoded creds)
- `--dry-run` flag for safe testing; `--force` required to overwrite existing data
- Per-faction YES confirmation prompt before every write
- Uploads: KT factions, KT ploys, KT rules, 40k factions, 40k stratagems, 40k rules
- **Not yet run** — awaiting Nox review of output JSON and hand-authored ploy/stratagem files

**Pending (Nox):**
- Review `output/kt-*.json` and `output/40k-*.json`
- Author `ploys/tau-pathfinders.json`, `ploys/void-dancer-troupe.json`, `ploys/ork-kommandos.json`, `ploys/kasrkin.json`
- Author `stratagems/astra-militarum.json`, `stratagems/craftworlds-eldar.json`
- Run `node parsers/upload.js` once satisfied

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

---

## BON-1 — Generic Bonus Engine landed in data-pipeline (2026-07-02)

data-pipeline built a shared modifier resolver for ploys/stratagems/weapon
keywords across all three game systems — see `data-pipeline/DEVLOG.md` for
the full writeup. Relevant here:

- `shared/bonus-resolver.js` (master copy lives in data-pipeline) is meant
  to be vendored by hand into `killteam/js/bonus-resolver.js` — no copy
  exists yet (that's BON-2 work). Run `node parsers/check-resolver-sync.js`
  from data-pipeline after copying it in, and again after any future edit
  to the master, to catch drift.
- `games-kt/` was confirmed (again) as the correct live-game collection
  name while cross-checking Firebase paths for that work — no change here,
  just a cross-repo confirmation.
- Weapon-keyword bonuses for all 47 KT factions are compiled and sitting in
  `data-pipeline/output/bonuses-catalog.json` and embedded per-weapon in
  the parsed faction JSON, but nothing has been written to
  `gameData/kill-team/bonuses/` yet — pending review.
- Faction ploy/stratagem replacement-as-bonuses is explicitly BON-3, not
  done yet. Nothing in `killteam/js/` needs to change for BON-1 itself.

## BON-2 double-check (2026-07-04) — brief significantly understates the lift

`BON2_BRIEF.md` (data-pipeline is done: bonus catalog is live in
`gameData/kill-team/bonuses/`, resolver is 1.2.0, weapons carry compiled
`bonuses` arrays) asked to wire Shoot/Fight through the resolver. Verified
against source before touching anything, per the brief's own instruction
not to trust its claims about `killteam/` internals. **Not implemented
this pass — this is a report only.**

**What's confirmed true:**
- No `killteam/js/` directory exists yet (`check-resolver-sync.js` reports
  ABSENT, matches BON-1's note).
- Range/distance measurement already exists (`Math.hypot`, used in
  `getShootValidity` at line ~2421) — a `halfRange` fact is computable from
  existing infrastructure, not new work.
- Shoot and Fight really are two separate entry points
  (`rollShot`/`confirmShotDamage` vs `confirmFightTarget`/
  `confirmFightDamage`) that could plausibly share one resolver call, as
  the brief assumes.

**What's NOT true — the brief assumes hooks that don't exist:**
- **Crits are hardcoded to a natural 6** in both `rollShot` (line ~2649:
  `atkRolls.filter(d => d === 6)`) and `confirmFightTarget` (line ~2962).
  There is no variable crit-threshold concept anywhere. "Lethal 5+"
  (`mod critThreshold cap 5`) has nothing to attach to — implementing it
  means introducing a threshold variable into both dice-classification
  loops, not just feeding a resolved number into an existing slot.
- **Hit/save/damage numbers are read straight off the weapon profile
  text** (`parseHit(w.profiles.HIT)`, `parseDmgPair(w.profiles.DMG)`) with
  exactly one existing modifier: a flat +1 to the hit threshold when
  injured. No Accurate (retainNormal), Piercing (defDice reduction),
  Devastating/Melta (dmgCrit add), Balanced/Ceaseless/Relentless (rerolls)
  — none of these have a variable to modify. Same gap in both shoot and
  fight.
- **`buildOperatives()` (line 736) drops weapon bonuses at game-creation
  time.** It rebuilds each weapon into a new object with an explicit field
  whitelist — `id, name, type, profiles: {ATK, HIT, DMG, RNG, WR}` — and
  `bonuses` (and `keywords`) aren't in it. Even a roster export that
  correctly carries compiled bonuses end-to-end would have them silently
  discarded the moment a game is created. This is a hard blocker, found
  exactly where the brief said to check ("verify that game-creation's
  roster import actually preserves the weapons' bonuses arrays").
  Separately unverified: whether `roster/`'s publish step even puts
  `bonuses` into the export in the first place (out of scope per the
  brief — `roster/` wasn't touched).

**Bottom line:** BON-2 isn't "plug resolved numbers into existing slots."
It's introducing variable crit-threshold/defDice/atkDice/reroll mechanics
into two dice-resolution functions that currently have none, on top of
fixing the operative-build passthrough. Recommend scoping it as its own
pass with the actual rewrite shape decided first (e.g. does `rollShot`
call `resolveStats` once up front and destructure everything, or gate each
mechanic individually), rather than treating this brief's Part 3 as
ready-to-implement as written.

## BON-2a — profile extraction, zero behavior change (2026-07-05)

Implemented `BON2_BRIEF_v3.md`'s first half against the gaps the double-check
above found. Verified line numbers were unchanged since that pass before
touching anything.

**What changed:**
- New `buildAttackProfile(weapon, op)` → `{ atkDice, hit, critThreshold: 6,
  dmgNormal, dmgCrit }` and `buildDefenseProfile(op)` → `{ defDice, save }`.
  Field names match `shared/bonus-resolver.js`'s stat vocabulary exactly, so
  BON-2b can call `resolveStats` on these objects with no renames.
- `rollShot` and `confirmFightTarget` now build a profile, then call two new
  pure functions — `resolveShotOutcome(attackProfile, defenseProfile,
  atkRolls, defRolls, useCover)` and `resolveFightOutcome(atkProfile,
  defProfile, atkRolls, defRolls)` — that consume only profiles and
  pre-rolled dice. Neither calls `Math.random`; dice generation stays in the
  two callers. No bare numeric literals remain at either function's
  roll-classification sites — crit is now `d >= profile.critThreshold`, not
  `d === 6`. `critThreshold` is currently always `6` so this is
  behaviorally identical today, but stops silently excluding actual 6s the
  moment Lethal x+ lowers the threshold in BON-2b.
- `rollShot`/`confirmFightTarget` still write the exact same flattened
  Firebase field names as before (`effectiveHit`, `totalDamage`,
  `atkAnnotated`, `dmgToDefender`, etc.) — the resolution-bar rendering
  needed zero changes.
- Fight builds both combatants' profiles through the same
  `buildAttackProfile` (KT melee has both sides "attack," no separate save
  roll). A defender with no melee weapon gets a synthetic zero-dice profile
  — `{ atkDice: 0, hit: <4 or 5 if injured>, critThreshold: 6, dmgNormal: 0,
  dmgCrit: 0 }`. Not `{ hit: 4 }` unconditionally: the old inline code
  applied the injured +1 hit-stat boost to the no-weapon base of 4
  regardless of whether a weapon existed (`isInjuredOp` never checked for
  one), so a bare `hit: 4` would have quietly changed what an injured,
  weaponless defender's stat line displays. Damage output is unaffected
  either way (zero dice rolled), but the replay harness below caught the
  stored-field regression before it shipped.
- `buildOperatives()` (line 736): confirmed why it stripped bonuses/
  keywords — the weapon whitelist copy (`id, name, type, profiles: {...}`)
  predates both fields entirely (written before BON-1 existed), not a
  deliberate trim. Added `bonuses: Array.isArray(w.bonuses) ? w.bonuses :
  []` and the same for `keywords`; older exports without either field still
  build fine (empty array, no bonuses resolve — BON-2b territory).

**Roll-site literal check:** grepped the file for `=== 6`/`>= 6`/`!== 1`
outside the two resolution functions. One more hit: `renderDicePool` (line
~2801), a display-only helper that re-classifies already-rolled dice for
color-grouping in the dice-pool UI, independently of `resolveShotOutcome`/
`resolveFightOutcome` and using its own hardcoded `6`. It doesn't affect any
resolution or stored outcome — purely cosmetic dice coloring — so it's out
of this pass's "no roll-site literals" scope, which the brief ties to
`rollShot`/`confirmFightTarget` specifically. Flagging it now because it
will silently mis-color dice the first time BON-2b lowers a critThreshold
below 6 (a 5 that resolved as a crit would still render grouped as a
"hit"). Worth threading `critThreshold` into `renderDicePool` as part of
BON-2b's display work, not deferred indefinitely.

**Replay-identity proof:** built a harness
(not checked into the repo — a throwaway Node script) that extracts the
actual shipped `buildAttackProfile`/`buildDefenseProfile`/
`resolveShotOutcome`/`resolveFightOutcome` out of `index.html` via regex
(so it tests the real shipped code, not a hand-copied stand-in), and diffs
their output against a line-by-line reproduction of the pre-refactor inline
formulas (reconstructed from the last commit touching this file,
`5a797fd`, not from memory). Swept: 3 ranged weapon profiles × 3 operative
states (healthy / injured / exactly-half-wounds) × exhaustive 1–2-die combos
× cover on/off for shooting; 2 melee weapons × {weapon, weapon, no-weapon}
defender × 3 operative states × representative miss/hit/crit dice for
fighting. **51,948 cases, 0 mismatches** after the no-weapon-defender fix
above (72 mismatches before it, all in that one fallback path, all in the
stored-but-damage-inert `defHitStat` field). Everything in scope was
replay-testable — no dice-generation randomness needed for this proof since
both resolution functions take pre-rolled dice as input.

**2a done-when checklist:** no roll-site literals (in `rollShot`/
`confirmFightTarget`; `renderDicePool` flagged above, deliberately out of
scope) — met. Replay diff empty — met. Bonuses/keywords survive game
creation — met, root cause reported. DEVLOG — this entry. Commits — see
next commit in this repo's history.

**CHECKPOINT:** per the brief, BON-2b does not start until Nox plays a
build of this and confirms combat feels identical.

**CHECKPOINT cleared (2026-07-05):** Nox confirmed 2a plays fine — BON-2b
below implements `BON2_BRIEF_v3.md`'s second half.

## BON-2b — bonus integration (2026-07-05)

**Verify-first findings before writing any code** (checked against the live
Firebase data, not the brief's assumptions about it):

- Every entry in `gameData/kill-team/bonuses/` (29 entries) has the exact
  same placeholder `description`: `"Flavor/reference text only. Engine
  never reads this."` There is no real prose to read for the dice-readout
  the brief asks for ("one plain-English line per applied bonus from
  catalog descriptions"). `describeBonus()` generates the line from the
  bonus's `name` + `effects` shape instead — e.g. `"Rending: +1 bonus crit
  hit(s) (on a crit), -1 bonus normal hit(s) (on a crit)"`. Divergence from
  the brief's literal wording, not from its intent.
- No catalog effect sets `appliesTo: "target"` — not the Piercing entries,
  not anything — even though `shared/bonus-resolver.js`'s own doc comment
  names Piercing's `-1 defDice` as the canonical appliesTo:target example.
  Routing is done by stat name instead (`defDice`/`save` are exclusive to
  the defense side in Shoot, so it's unambiguous and needs no per-bonus
  special-casing) — see `splitBonusesBySide()`.
- Every catalog entry's `scope` object omits `filter`/`range` entirely
  rather than setting `[]`/`null`. `eligibleBonuses`' range gate is `bonus.
  scope.range !== null` — with range *undefined* that's true, and it fails
  closed without `context.positions`. Fix: always pass positions for both
  Shoot and Fight, even for non-aura weapon-keyword bonuses, or every
  single bonus in the catalog gets silently dropped.
- The two hardcoded dev rosters (`DEV_ROSTER_P1`/`P2`) were published
  2026-06-25 — before BON-1's bonus catalog existed (2026-07-02) — so their
  exported weapons carry no `bonuses` at all. Tried a republish script
  mirroring roster's own publish transform; it found **zero** matches,
  because these rosters' `unitId`s (`shasui-pathfinder-001`, etc.) predate
  the current BSData-pipeline slugs (`shasui`, etc.) entirely — not a
  simple staleness issue, a full roster rebuild through roster/'s own UI
  would be needed. Out of scope here (brief says work in `killteam/`).
  **Nox: the two dev rosters need rebuilding in roster/ before `?dev=true`
  will show any weapon bonuses** — verification below used disposable
  synthetic `games-kt/` fixtures instead (deleted after, never committed).

**What shipped:**

- `<script src="../shared/bonus-resolver.js">` added — plain relative path,
  confirmed working from `file://` too (no bundler/module constraints, per
  the brief's own caveat to check this first).
- `games-kt/{gameId}/bonuses` snapshotted from `gameData/kill-team/bonuses/`
  at creation, in both `createGame` and `bootDev` (not `joinGame` — same
  game doc, no second snapshot). Read via `gameData.bonuses || {}`
  everywhere else — absent on old games, inert, zero errors.
- `getWeaponBonuses`/`splitBonusesBySide`/`buildBonusContext`/
  `computeHalfRangeFact`/`applyRerolls`/`discardWorstDice`/`describeBonus`/
  `dedupeAppliedBonuses` — new pure helpers (all next to `buildDefenseProfile`).
- `rollShot`: two-pass resolve. Pass 1 (facts = `halfRange`\* if
  applicable) builds the profile dice are rolled against and rerolled
  against (`applyRerolls` — Balanced/Ceaseless/Relentless). Raw dice crit
  count decides `critScored`/`noCritScored`; pass 2 re-resolves with that
  fact added, which naturally sums unconditional + now-satisfied
  conditional effects on the same stat in one `resolveStats` call — no
  manual delta-diffing, no special-casing Rending vs Severe vs Punishing
  vs Piercing Crits. `defDice` shrinking after the fact (Piercing Crits)
  is realized as `discardWorstDice` on the already-rolled pool, since dice
  can't retroactively un-roll.
- `confirmFightTarget`: same two-pass shape, run independently per
  combatant (`resolveMeleeSide`) since Fight has no separate defense
  profile — both sides "attack." No appliesTo/cross-side routing for
  melee (nothing in the catalog needs it — Rending/Severe/Punishing are
  all `onShoot`-only, `brutal` is the only `onFight` entry and it's a flag).
- `resolveShotOutcome`/`resolveFightOutcome`: fold in `retainNormal`/
  `retainCrit` (Accurate, Punishing, Rending, Severe) as guaranteed extra
  hits added to the dice-classified counts before the block/save
  simulation. Zero when absent — reproduces 2a's output exactly for every
  pre-BON-2b game.
- Dice readout: badges for flags, badges for conditions (`stun` →
  "STUNNED → target", no token state, display only), one line per applied
  bonus. Always expanded in `?dev=true`; collapsed behind a "Show bonus
  readout (N)" toggle otherwise (`renderBonusReadout`/`toggleDiceReadout`).
- Fixed a bug 2a's own DEVLOG entry had flagged and deliberately deferred:
  `renderDicePool`'s atk-side dice coloring was hardcoded to `d === 6` for
  the CRIT bucket — cosmetic-only, but wrong the instant Lethal x+ went
  live, which it just did. Now takes `critThreshold`. Def-side crit-SAVE
  stays hardcoded 6 on purpose (unmodifiable, per `DEFENSE_CRIT_FACE`).
- Determinism: all of the above only ever runs inside `rollShot` (Roll
  Dice is attacker-only) and `confirmFightTarget` (only the dragging
  player calls it) — same existing cross-client pattern as 2a, nothing new
  needed. `halfRange`/`critScored`/`appliedBonuses`/`flags`/`conditions`
  are written into the action record alongside the existing fields, human-
  readable, for the observing client to just display.

**Verification (real browser, not unit tests):** built disposable
`games-kt/` fixtures via direct Firebase REST writes (rules are public
read/write, no admin creds needed) and drove full Shoot/Fight sequences
in headless Chromium (Playwright; had to work around a missing
`libasound.so.2` in this sandbox by extracting it from the `.deb` locally
— no root available). All fixtures deleted after, nothing committed.

- Rail rifle (Lethal 5+, Piercing 1, Devastating 2) vs a defenseless
  target: a natural 5 correctly colored CRIT, defense dice count dropped
  3→2 *before* rolling (Piercing 1 is unconditional, baked into the
  pre-roll profile), crit damage 4→6 (Devastating 2). Numbers hand-checked
  against the written `pendingShot` record.
- Rending Rifle (Rending only, ATK 6): rolled `[6,4,5,1,4,1]` vs `save 4`
  defense `[3,1,1,5]` → 1 natural crit + 3 normals, Rending's paired
  `retainCrit+1`/`retainNormal-1` converts one normal into a second crit
  (2 crit/2 normal before saves) → 1 save cancels 1 normal →
  `remainingCritHits:2, remainingNormalHits:1, totalDamage:11`. Hand-
  verified: 2×4 + 1×3 = 11. ✓ This is the "conversion fires on the right
  crit state" checkpoint.
- Brutal Blade (melee, flag-only) vs an unarmed defender: resolved
  cleanly through `resolveMeleeSide`/`resolveFightOutcome`
  (`dmgToDefender: 11`, `dmgToAttacker: 0`), `BRUTAL` badge + "Brutal:
  flags brutal" readout line rendered. This is the "one melee example"
  checkpoint.
- Old-game path: a game doc with no `bonuses` key at all and a weapon
  with no `bonuses` field (pre-BON-2a export shape) resolved with zero
  page errors and output identical to 2a's pre-bonus math (hand-verified:
  `remainingCritHits:0, remainingNormalHits:2, totalDamage:6`). No
  readout button rendered (nothing applied) — correct.

**2b done-when checklist:** snapshot verified on a fresh game — met.
Old game still plays — met. Lethal/Piercing weapon shows correct resolved
numbers in dev readout — met (synthetic fixture; real dev rosters need
rebuilding first, see above). Conversion fires on the right crit state —
met (Rending). One melee example through the same path — met (Brutal).
Verified-vs-assumed report — this entry. DEVLOG — this entry. Commits —
see next commit in this repo's history.

**Out of scope, unchanged:** flag enforcement, condition state
persistence, active/CP bonuses, 40k, Firebase rules, pipeline changes,
catch-up UI.

## KT-RS — Roster Selection at Game Creation (2026-07-05)

Implemented `KT_ROSTER_SELECT_BRIEF.md`. Was flagged there as the new
critical path: real play (and BON-2b's own acceptance) was blocked on the
two hardcoded dev rosters, whose `unitId`s predate the current pipeline
(see BON-2b's flag 3 above).

**Verify-first findings:**

- `exports/kill-team` currently holds 5 entries: the two stale dev
  rosters (2026-06-25), a Kommandos roster (also 2026-06-25), a byte-
  identical **duplicate** of that Kommandos roster under the literal
  Firebase key `"undefined"` (its `meta` has no `rosterId` field — almost
  certainly `s.rosterId` was falsy at some past publish and stringified
  into the ref path), and a fresh Legionaries roster Nox published today
  for this brief. Handled generically: the picker always keys off the
  Firebase key, never `meta.rosterId`, so the `"undefined"` entry just
  renders as another (harmless, if confusing-looking) row instead of
  crashing or needing a special case.
- **The Legionary export uses a different weapon-range field than every
  other faction sampled** (Tau, Kommandos, Kasrkin): `w.rng` at the
  weapon's own top level instead of `w.profiles.RNG`. Without a fallback,
  `buildOperatives` would read every Legionary ranged weapon as 0 range
  and `getRangedWeapons()` would silently exclude all of them — no error,
  just a permanently-disabled Shoot button. Fixed with a fallback read
  (`w.profiles?.RNG || w.rng || ''`).
- **The Legionary export's `stats` object is TitleCase** (`Move`, `Save`,
  `Wounds`) where Tau/Kommandos/Kasrkin use upper (`MOVE`, `SAVE`,
  `WOUNDS`) — `APL`/`DF` happen to already match across factions.
  `buildOperatives` read `u.stats.WOUNDS` verbatim with **no fallback at
  all** on that one field, so every Legionary operative was built with
  `maxWounds: 0` — born already-incapacitated, invisible to targeting,
  looked like nothing was wrong until you tried to activate one. This
  wasn't in the brief (which only called out the RNG-shape risk) — found
  by actually creating a game through the picker and checking the written
  operatives, not by reading the export JSON in isolation. Fixed with a
  small `statVal(stats, ...keys)` helper trying every casing seen so far,
  used for WOUNDS/APL/MOVE/DF/SAVE. Deliberately did **not** add a
  fallback *value* for missing WOUNDS (only additional key names) — a
  genuinely absent max-wounds stat should surface as broken, not get
  silently papered over with a made-up number.
- Some Legionary weapons that DO carry real keyword bonuses have no
  captured range at all under either field name (`Fireblast`, `Life
  siphon` — psychic ranged attacks) — a data-completeness gap in the
  parse, not a field-name mismatch, so no fallback can fix it client-side.
  These two weapons can't be used to demo Shoot-with-bonuses until the
  pipeline captures their range. Out of scope here (pipeline changes are
  explicitly excluded).
- Confirmed (again, with real data this time) something BON-2b's own
  entry above already flagged: bonuses compiled from a melee weapon's
  keyword text keep the CATALOG entry's own `trigger` field, which for
  `rending`/`lethal-5` is hardcoded `onShoot` regardless of the weapon
  carrying it. `Tainted chainsword`'s "Rending" and `Power weapon`'s
  "Lethal 5+" can therefore never fire in Fight — `eligibleBonuses`
  correctly rejects them (`bonus.trigger !== context.trigger`). This is a
  compile-time keyword→bonus mapping gap (pipeline), not a killteam
  engine bug; `Power fist`'s "Brutal" (trigger `onFight` in the catalog)
  fires correctly and was used for the melee verification instead.

**What shipped:**

- Lobby's free-text "Roster ID" input replaced with a picker
  (`fetchRosterList`/`renderRosterPickerList`/`selectLobbyRoster`):
  fetches all of `exports/kill-team` (no lightweight index exists —
  adding one is a roster/ change, out of scope — fine at today's scale of
  a handful of rosters), shows name/faction/op-count/published-date,
  newest first. `handleLobbySubmit` now reads the picker's selection
  instead of an input value; unchanged from there down (`createGame`/
  `joinGame` still just take a `rosterId` string). Deleted `previewRoster`/
  `rosterPreviewTimers` — the debounced single-roster preview it replaces
  is now redundant with the picker showing everything up front.
- `buildOperatives`: `RNG` fallback to `w.rng`; `statVal()` helper +
  multi-casing stat reads, both described above.
- Dev rosters (brief point 5, "your call, state it"): **not** added as
  separate labeled "Demo" entries. They already appear in the picker as
  ordinary (if old) rows — duplicating them under a synthetic "Demo"
  label would just show the same two rosters twice. `bootDev()` itself is
  untouched; `?dev=true` still auto-boots the same two hardcoded IDs
  exactly as before.

**Verification (real browser, real roster, not synthetic-only this
time):** picked the Legionaries roster through the actual lobby picker,
created a real game, confirmed the 5 written operatives' names matched
the export exactly (`Legionary Anointed`, `Aspiring Champion`, `Balefire
Acolyte`, `Butcher #1/#2`) and — after the stats-casing fix — their
wounds/move/save came out correct (14-15 wounds, not 0). Fast-forwarded
the same real game to firefight via direct writes (terrain/deployment/
initiative are unrelated, pre-existing phases) and drove combat in
headless Chromium:

- Fight, `Power fist` (real embedded `brutal` bonus, not hand-authored):
  resolved correctly, `BRUTAL` badge + "Brutal: flags brutal" readout
  line.
- Fight, `Tainted chainsword` (real embedded `rending` bonus): resolved
  with zero applied bonuses — correct, per the onFight/onShoot trigger
  gap above, not a bug.
- Shoot, `Bolt pistol` (real weapon, genuinely empty bonuses array):
  resolved cleanly, no readout button rendered (nothing to show) —
  correct.
- Deleted the disposable test game afterward; nothing committed.

**Done-when checklist:** new game created with the Legionary export from
the picker, operatives match the published roster — met (only after the
stats-casing fix, which the brief didn't anticipate). A shoot in that
game shows weapon bonuses in the readout — **not fully met**: Legionary's
only bonus-carrying ranged weapons have no captured range at all (see
above), so no ranged+bonus demo is possible with this specific roster
today; a melee bonus (`Power fist`/Brutal) demonstrates the same
mechanism instead, and BON-2b's acceptance already stands independently
on its own synthetic-fixture verification. Old existing games
unaffected — met (nothing touched read/render paths for other games;
both fixes are pure additions to field-name tolerance). DEVLOG — this
entry. Commits — see next commit. Nox pushes (no git credentials in this
sandbox).

**Out of scope, unchanged:** 40k game app, roster app changes, new
Firebase paths, lobby/matchmaking, pipeline changes.

## 2026-07-11 — BUG_KT_UNLIMITED_RANGE: absent rng treated as unshootable

Brief: `briefs/BUG_KT_UNLIMITED_RANGE.md`. Nox hit this in a real live
Legionary game right after PIPE-H1 shipped: Balefire Acolyte's Fireblast
and Life siphon showed range "—" and were never offered in the Shoot
flow — confirmed against data during PIPE-H1 that this is correct,
intentional data (no `rng` key = unlimited range, true for every PSYCHIC
weapon in every faction; Firebase drops null keys so absent *is* the
null). The engine, not the data, had the bug.

**Root cause:** `parseRng(s) { return parseInt(s || '0') || 0; }` —
collapsed "absent" and "0" into the same value, and several call sites
used that as a truthy/`>0` eligibility gate rather than an actual range
number:

- `getRangedWeapons()`: `filter(w => parseRng(w.profiles?.RNG) > 0)` —
  used range as a *proxy* for "is this weapon ranged at all," so an
  unlimited-range weapon silently failed the gate and vanished from the
  Shoot weapon picker. Fixed to filter on `w.type === 'ranged'` directly
  — the actual discriminator field, matching how `getMeleeWeapons()`
  already worked. This was the exact reported symptom.
- `getShootValidity()`: `if (dist > range)` with `range` defaulting to 0
  meant an unlimited-range weapon read as "Out of range" against literally
  any target at any positive distance. Even if the weapon-picker bug
  above were the only fix, targeting would still have failed here.
- `getMaxSightRange()` (movement-drag firing-arc overlay, a UX aid, not
  gate logic — found while auditing every `parseRng` call site, not named
  in the brief): an unlimited weapon contributed 0 to an operative's max
  sight radius instead of dominating it, so the "what will I threaten
  after this move" overlay silently disappeared for an operative whose
  only ranged weapon has unlimited range.

**Fix:** `parseRng()` now returns `null` for absent/empty/unparseable
input instead of `0` — an explicit, non-numeric sentinel that can't
silently satisfy a `>0` or arithmetic check the way `0` could. Every
consumer was audited and updated to check `=== null` explicitly (not
`!range`, which would re-collapse `null` and `0` back together and
reintroduce the same class of bug): `getRangedWeapons` (now type-based,
doesn't touch range at all), `getShootValidity` (skips the out-of-range
check on `null`), `getMaxSightRange` (returns `Infinity` — dominates any
finite weapon), `computeHalfRangeFact` (was already correct by the old
`0`/`null` both being falsy; made the `=== null` check explicit rather
than relying on that coincidence going forward).

Added `weaponRange(w)`: consolidates two previously-duplicated inline
"RNG field, falling back to a WR-text 'Range N\"' match" implementations
(the unit-card weapon row, `getMaxSightRange`'s old inline version) into
one function. The WR-text fallback matters for older/snapshotted games
whose export predates PIPE-H1's pipeline fix — snapshot rule means those
must keep working exactly as before, not just newly-uploaded rosters.

**Rendering:** two places drew an SVG circle at the weapon's range radius
(the movement-drag firing-arc overlay, the shoot-aim-drag range ring) —
both now skip drawing that circle when range is `null`/`Infinity` (not
meaningful to render) while still treating every target as in-range
underneath. **Display:** unit-card weapon row and the Shoot weapon-picker
button both now show `∞` for unlimited range instead of `—` (brief's
call, taken: "clearer" per the brief's own suggestion) — melee weapons
still show `Melee`, unaffected, using the type field not range presence.

**Testing:** Playwright's Chromium confirmed still blocked in this sandbox
(`libasound.so.2` missing, no apt-get/sudo — same limitation as the
warhammer-fantasy sessions' DEVLOGs, checked fresh rather than assumed).
killteam's own established precedent (real disposable Firebase game,
headless Chromium) wasn't available here; fell back to the same
jsdom-driven pattern WHF used — loaded `index.html` as a real injected
`<script>` element (not `eval`, so top-level `function` declarations
attach to `window` and `let`/`const` like `gameData` are reachable via
`window.eval`, same as the warhammer-fantasy sessions) and called the
actual pure functions directly against synthetic weapon/operative data
matching Balefire Acolyte's real shape. 19/19 checks: `parseRng`/`weaponRange`
null-vs-numeric handling, Fireblast correctly appearing in
`getRangedWeapons()` (the reported symptom, directly reproduced and
fixed), a melee weapon with no RNG correctly NOT leaking into the ranged
list, `getMaxSightRange` returning `Infinity` for an unlimited weapon and
the correct finite max otherwise, `getShootValidity` correctly NOT
returning "Out of range" for a very distant target with Fireblast while
a control case (Bolt pistol, same distance) correctly still does, and
`computeHalfRangeFact` staying `false` for unlimited range at any
distance including 0. Test script not committed (one-off). **Not
verified here, by design:** Nox's own live-game acceptance test (fire
Fireblast via `?dev=true`, confirm the shot resolves and the dev readout
lists its bonuses) is the brief's actual "Done when" and simultaneously
closes the BON-2b/KT-RS shoot acceptance — that's the real end-to-end
check this jsdom pass can't substitute for.

**Commits:** `83ad935`

## 2026-07-11 — KT-2 Part 2: drag-to-shoot polish + combat feel

Brief: `briefs/KT2_PART2_BRIEF.md`. Read the last three DEVLOG entries
first as instructed (BON-2b, KT-RS, BUG_KT_UNLIMITED_RANGE) before
touching the shoot flow.

**Real browser testing unlocked this session** — worth recording since it
changes what's possible for future sessions here. Playwright's Chromium
has been blocked on missing `libasound.so.2` since WHF-3 (no apt-get/sudo
in this sandbox). `apt-get download libasound2t64` works without root
(fetches the `.deb`, doesn't install it) — `dpkg -x` extracts
`libasound.so.2` from it into a local directory, and
`LD_LIBRARY_PATH=<that dir>` at Chromium launch is enough to satisfy the
dynamic linker. Saved to `killteam/.playwright-libs/` (gitignored). This
made real disposable-Firebase-game + headless-Chromium testing possible
again, matching this project's own established precedent (BON-2b) instead
of falling back to jsdom.

**Item 1 — drag-to-shoot.** `setupDragToShoot`: press-and-drag on the
active operative's own token (8px screen threshold, so a plain click
still falls through to the existing activate/deselect handler unchanged)
hands off to the exact same `beginShootDrag`/`updateShootOverlay`/
`getShootValidity`/`confirmShootTarget` pipeline the Shoot-button path
already uses. Live validity feedback during the drag and everything
downstream (crit coloring, bonus resolution) come for free from that
reuse — not re-implemented.

**Real-browser testing caught a bug static review missed entirely:** the
first implementation listened on the SVG only, walking up from
`e.target`. It worked in isolation but never armed in the actual app —
the moment an operative activates, `showRadialMenu()` draws a 44px "End"
button as a plain HTML `<div>` positioned exactly on top of the token's
screen coordinates. A mousedown starting there never reaches the SVG at
all. Rewritten as a single document-level listener, registered once
(idempotent via flag, same pattern as the existing Escape-key binding),
checking proximity to the active operative's own screen position
(computed fresh via its board's SVG CTM) instead of asking which DOM
element got hit — works regardless of what's on top. This is exactly the
class of bug the `/verify` skill and this project's "drive it, don't just
read it" testing culture exist to catch; static code review alone would
not have found it.

**Item 2 — damage visibility.** `spawnDamageFloater()`: "-N" text rises
and fades at the point of damage (SMIL animate + timeout cleanup, same
lifecycle as the existing burst/clash effects), wired into both
`playBurstAndFlash` (Shoot) and `playFightEffects` (Fight, both sides).
Health arc's lost segments were `rgba(255,255,255,0.08)` — read as
background, not "wound taken here" — now red-tinted
(`rgba(192,57,43,0.22)`), louder but still clearly dimmer than a filled
segment.

**Item 3 — injured state.** The only prior signal was the arc's
filled-segment color switching red — thin 0.09-wide strokes, easy to miss
at a glance. Added a slowly-pulsing red ring around the whole token (own
radius, distinct from both the health arc and the active-activation glow)
via a new CSS animation. Sidebar INJURED chip unchanged.

**Item 4 — dice-roll moment.** Fight's `confirmFightTarget()` computes and
writes the fully-resolved `pendingFight` in one shot (no
`coverChoice`→`rolled` phase split like Shoot has), so results always
landed instantly. Added `startFightDiceAnimation()`, mirroring Shoot's
`startDiceAnimation()` exactly (same tier/timing table), triggered off
"`pendingFight` just appeared" in `detectAndPlayEffects` rather than a
phase transition — there isn't one to key off, and the reveal doesn't
need cross-client sync since both clients already have the same real roll
values the moment Firebase delivers `pendingFight`. `renderFightResolutionBar`
hides annotations/damage/confirm-button while animating. Click-to-skip
added for both Fight's new tumble and Shoot's existing one (neither had
it before).

**Item 5 — crit coloring under drag-initiated shots.** Verified, not just
assumed: because item 1 routes through the identical `rollShot`/
`renderDicePool` code path as the button flow, this held by construction.
Confirmed directly in the real-browser test below with a hand-crafted
Lethal 5+ weapon — forced every die to a natural 5 and checked the DOM
grouped them under CRIT, not HIT.

**Testing (real browser, not jsdom):** built a disposable `games-kt/`
fixture via direct Firebase REST (public rules, no admin creds needed —
same technique BON-2b used), with hand-crafted operatives (a Lethal 5+
rifle, controlled wound values) so every item could be tested
deterministically rather than relying on the two bonus-less dev rosters.
Drove it in real headless Chromium via the `.playwright-libs` workaround
above. Fixture deleted after (`finally` block), nothing committed.

12/12 checks: drag-to-shoot creates a correctly-targeted `pendingShot`;
forced all-5s rolls under Lethal 5+ render as CRIT (0 miscategorized as
HIT); a damage floater appears after Apply Damage; the injured ring
renders once wounds cross the half threshold; Fight's tumble resolves,
shows the skip hint, and reveals results on click; the old button-only
Shoot flow still creates a `pendingShot` (regression check). Also
confirmed `?dev=true` still boots cleanly (0 console/page errors) —
brief's explicit "readout unaffected" requirement.

One test-authoring note worth keeping for next time: clicking a
phase-bar button (e.g. "Fight") auto-scrolls the page to bring it into
view (Playwright's own click-actionability behavior), which can leave a
previously-measured element's bounding box stale/off-screen —
`locator.scrollIntoViewIfNeeded()` before re-measuring fixed it. Not an
app bug, a test-sequencing one.

**Not done — explicitly out of scope per the brief:** blast/torrent flag
enforcement, conditions (BON-3), catch-up banner (KT-7), any 40k work,
roster changes.

**Commits:** `b5452c3` (item 1), `258c85b` (item 4), `9a534da` (items
2+3), `1a79a7b` (item 1 fix — the radial-menu overlay bug real-browser
testing caught).

---

## 2026-07-11 — BUG_KT_PLAYTEST_1_1: first real two-window playtest findings

Brief: `briefs/BUG_KT_PLAYTEST_1_1.md`. Nox and his brother ran the first
live two-window game (same PC, live Firebase) right after KT-2 Part 2
shipped and hit three bugs. Brief's own suspect for item 1 was KT-2 Part
2's new document-level drag-shoot listener — told explicitly to verify
against the pre-P2 commit, not assume.

**Item 1 — player 2 selection broken (blocker, NOT conclusively fixed
here).** Reproduced with two real Playwright browser *contexts* (separate
localStorage/cookie jars, matching two separate windows exactly — a
single-page devMode view or two tabs sharing storage would not have caught
a per-client bug like this). First test run reproduced player2's
activation "failing" — but investigation showed the fixture was wrong, not
the app: both activation attempts fired while `turn.activatingPlayer` was
still `'player1'`, so player2 correctly got rejected. Rewrote the fixture
to call `endActivation('player1')` first, genuinely advancing the turn via
the app's own `advanceActivatingPlayer()` path. With that fix, token-click
selection, AP-spend availability, and the full turn handoff all worked
correctly for player2 — in isolation, at a generous viewport.

Then tested the *document-level listener* hypothesis directly: ran the
identical two-context script against both current `index.html` and the
pre-KT-2-P2 commit (`83ad935`). Same fixture bug, same behavior on both —
meaning the document-level proximity listener from KT-2 Part 2 is **not**
the regression. It was already ruled out by construction too: the listener
only arms on a press-and-drag near the *active* operative's own token; a
plain click on any other token, or a sidebar card, was never intended to
route through it and doesn't in the code.

Went looking for what else could explain the symptom and found item 3 (see
below) — a genuine, confirmed CSS bug that shrinks available page height
specifically for the tallest/bottom-most UI (phase-bar action buttons,
where activation happens). Two windows tiled side-by-side on one screen
have much less vertical room than a full test viewport, which is exactly
the condition under which this would bite hardest. This is a strong
plausible explanation but **not proven** to be the exact mechanism my
tests reproduced item 1's failure under — Playwright's own `.click()`
auto-scrolls elements into view, so an automated click can't reproduce
"the button is there but unreachable" the way a human click can. Per the
brief's own "Done when," **Nox's two-window re-test is the actual
acceptance check for item 1**, not this session's testing. If it
reproduces again after this commit, the CSS fix wasn't the (whole) cause
and this needs another pass with the real repro conditions (narrow tiled
windows, not full-width contexts).

**Item 2 — lobby Copy button did nothing.** Brief's hypothesis was
`navigator.clipboard` failing silently (Brave shields / permissions).
That's real and worth guarding, but investigating the actual DOM turned up
the real root cause: `renderWaiting()` built the button as
`onclick="copyLink(this, ${JSON.stringify(gameUrl)})"` —
`JSON.stringify()`'s own wrapping `"` characters terminated the `onclick`
attribute early, so the browser parsed garbage past that point and
`copyLink()` never ran at all, for *any* url, unconditionally, in every
browser. Confirmed by dumping the rendered `outerHTML` and watching the
attribute get chopped mid-string. This means the button has silently never
worked since it was written, independent of clipboard permissions. Fixed
by dropping the url from the inline attribute entirely — `copyLink(this)`
now reads the value straight off the adjacent `.link-input` element. Kept
(and this is still worth having) a real fallback for genuine
`navigator.clipboard` failures: selects the input's text and shows "Select
& Ctrl+C" instead of a false "Copied!".

**Item 3 — page taller than viewport, needed scrolling.** `#screen-game`
used `min-height: 100vh` — a floor, not a ceiling. `.game-main`'s
`flex:1`/`min-height:0`/`overflow:hidden` further down only actually
contains anything if its ancestor is capped at the viewport; with a floor
instead of a ceiling, KT-2 Part 2's taller `.phase-bar` (dice pools,
floaters, skip-hints) just grew the whole page past 100vh instead of being
absorbed by the flex siblings. Changed to `height: 100vh` (a real
ceiling). That alone wasn't sufficient — a DOM diagnostic
(`getBoundingClientRect()` on `html`/`body`/`#screen-game`/`.game-topbar`/
`.game-main`/`.phase-bar`) showed `#screen-game` correctly capped at 800px
but its parent `#app` still measuring 864px, because `#app`'s own generic
`padding: 2rem` + `min-height: 100vh` (styled for the small centered
screens — home, library, faction pick) was stacking on top. Added
`#app.app-fullbleed { min-height: 0; padding: 0; align-items: stretch; }`,
toggled by `showScreen()` only when entering the game screen. Verified via
a real-browser test measuring `scrollHeight` vs `innerHeight` at a
1280×800 viewport across board-loaded, operative-activated,
shoot-armed-with-target, dice-tumbling, and full-resolution-with-dice-pools
states (the tallest UI KT-2 Part 2 added) — `scrollHeight == innerHeight`
(800 == 800) at every state, down from 1235–1254px before the fix.

**"Also" (polish item, done — trivial in scope).** Flag-type bonus lines
read circularly ("Psychic: flags psychic", the raw machine name echoed
back). Added `FLAG_LABELS`, a player-contract phrase per flag (e.g. Blast
→ "can hit multiple targets near the aim point (applied by agreement for
now)"), wired into `describeBonus()`. Deliberately left out `shock` and
`brutal` — `compile-keywords.js` ships both as bare pass-through flags
with no rules comment anywhere in the pipeline, and there's no
source-verified mechanical text for either in this codebase; guessing
would risk shipping confidently-wrong rules text, worse than the old
generic "flags X" fallback it would have replaced. Unmapped flags still
fall back to that generic phrasing rather than erroring or going blank.

**Testing:** real headless Chromium via the `.playwright-libs` workaround
(same technique as KT-2 Part 2/BON-2b), disposable `games-kt/` fixtures
via direct Firebase REST, deleted after each run. 17/17 checks across
three scripts (none committed — one-off, matching this project's existing
pattern): two-context selection/turn-advance/AP-spend (item 1
investigation, 4/4), viewport scroll at five UI states (item 3, 5/5), and
clipboard success/failure/fallback plus flag-wording (item 2 + polish,
8/8).

**Not done:** item 1 is not conclusively fixed — see above. No changes
made to the drag-to-shoot listener itself; nothing here should regress it,
but that's asserted from the two-context test passing (4/4), not proven
against the actual tiled-window repro conditions.

**Commit:** `a1b00c5` (items 2, 3, polish — combined, since none of the
three touch overlapping code and all were verified together).

---

## 2026-07-11 — BUG_KT_PLAYTEST_2: brother-game 2 findings

Brief: `briefs/BUG_KT_PLAYTEST_2.md`, explicitly extending
BUG_KT_PLAYTEST_1_1 above with new data from a second real two-window
game. Read as a continuation, not a fresh investigation.

**Item 1 — lockout cluster: found the real bug this time.** PT1 ruled out
KT-2 Part 2's document-level drag listener but left the actual mechanism
unresolved. PT2's new data point — "radial menu stops appearing entirely
after ~turn 1-2, worked initially" — was the thread to pull. Traced it to
`render()`, the callback wired to Firebase's `.on('value')` and therefore
firing on **every** snapshot of the shared game doc: your own writes
echoing back, the opponent's moves, anything. It never called
`refreshRadialIfActive()` — only `reRender()` (used solely after local
button clicks) did. The radial menu is a single persistent `<div
id="radial-menu">` sitting outside `#screen-game` (confirmed by reading
the static HTML shell — it survives `renderGame()`'s innerHTML rebuild,
so it isn't destroyed), positioned via a one-off screen-coordinate
calculation off the active operative's current token position. Every
snapshot-triggered rebuild left that calculation stale: after a move, the
underlying board redraws the token in its new spot but the menu stays
glued to the old screen coordinates. In a real two-player game, snapshots
arrive constantly — far more often than in an isolated single-action
test — so this compounds fast, matching "worked initially, degrades"
precisely.

Verified as a real regression, not a guess: stashed the fix, re-ran the
new test script against pre-fix code — activate an operative, commit a
move via the app's own `commitMove()`, let the Firebase echo round-trip
back, and check the menu's `style.left`. Pre-fix: stuck at the original
position. Current code: repositions correctly. Fixed at two points —
`render()` now calls `refreshRadialIfActive()` directly, and
`reRenderPhaseBar()` (used by ~15 call sites across the move/shoot/fight
flows, many of which only needed to touch the phase bar before) now folds
in the same refresh, so every one of those call sites gets a correctly
positioned menu without individually patching each one.

Separately verified the brief's other new data point — "when player1 has
no ready operatives left, player2's remaining operatives CANNOT act" —
against `advanceActivatingPlayer()`'s actual logic: `next = otherReady ?
otherSlot : justActivatedSlot`, i.e. it already stays with whichever side
still has ready operatives. Confirmed correct both by reading it and with
a real two-context test: P1's only operative activates and ends, turn
correctly passes to P2, and P2 solo-activates two operatives back to back
via real token clicks (not direct state manipulation) — each one shows a
full radial menu (Move enabled, not just End) and can actually spend AP.
This piece was very likely a symptom of the same staleness above rather
than an independent turn-logic bug — a real activation with an unusably
stale/mispositioned menu looks, from the player's chair, exactly like
"nothing but End is available."

**Item 2 — Shoot repeatable in one activation.** `fightDisabled` already
gated on `activation.hasFought`; `shootDisabled` never gated on
`activation.hasShot`, even though that flag was already tracked and set
by `confirmShootTarget()`. One missing condition, present in both UI
surfaces (the phase-bar activation panel and the radial menu both compute
their own `shootDisabled`). Added `|| hasShot` to both, plus a matching
disabled-button tooltip ("Already shot this activation") consistent with
Fight's existing one. Move/Dash correctly remain repeatable (RAW).

**Item 3 — base collision (new).** Movement was pure distance-clamp +
grid-snap with no notion of occupied squares at all — operatives could
walk straight onto or through any other operative's base. Added
`wouldCollideWithOperative(x, y, excludeOpId)` (`2×TOKEN_R` — "touching,
not overlapping" — the same threshold and phrasing `warhammer-fantasy`'s
WHF-5m uses for its own friendly-overlap rule, borrowed as a concept, no
shared code) and `resolveMoveDestination()`, which walks the drag line
forward in 1"-grid steps from start to the range-clamped destination and
returns the last free square before the first occupied one. Checking
every intermediate step (not just the endpoint) is what stops a long drag
from passing straight through an operative parked between start and
target, not just landing on one — caught by the test suite itself: an
early version only checked the destination, and a straight shot fully
past a blocker slipped through undetected until the test's "stops short
of it, not past it" assertion failed. No friend/foe distinction per the
brief (unlike WHF's separate friendly-overlap vs. enemy-1"-buffer rules).
Wired into both the drag preview and the commit path.

**Item 4 — Fight reveals (decided ruling).** RAW is ambiguous on whether
attacking in melee reveals a Concealed operative. Per Nox: legibility
wins. `confirmFightTarget()` now sets the attacker's `order` to `'engage'`
when it isn't already, mirroring Shoot's existing order-lock
(`orderDisabled = hasShot` in the radial menu).

**Item 5 — scroll, re-checked, not re-broken.** The brief reports this
"still broken... confirmed still open in game 2," but PT1's fix
(`a1b00c5`) hasn't been deployed yet — Nox pushes and redeploys hosting
himself, and that hadn't happened between the two playtests. Re-ran a
scroll-height check against current code, including at a narrower
700×750 viewport (closer to two windows tiled on one screen than the
original 1280×800 test) through an activate→Fight-resolution sequence —
`scrollHeight == innerHeight` held throughout. No regression found; the
brief's report almost certainly reflects the stale deployed build, not
current code. Flagging this explicitly rather than silently assuming —
if it reproduces again after this deploys, something else is going on.

**Testing:** three throwaway Playwright scripts (not committed, per this
project's established pattern), real headless Chromium via
`.playwright-libs`, disposable `games-kt/` fixtures via direct Firebase
REST, deleted after each run. 21/21 checks: once-per-activation Shoot (2)
+ Fight-reveals (2) + base collision unit-level and end-to-end (5, one
failure caught and fixed mid-session as noted above) in one script;
radial-menu staleness before/after a move plus an unrelated remote update
(3), and the full P1-exhausts/P2-solo-activates scenario via real token
clicks (8) in a second; the scroll re-check (3) in a third. The
radial-menu fix was additionally verified against pre-fix code via `git
stash` to confirm it catches a real regression, not a tautological test.

**Commit:** `b425c03` (all five items — items 1's fix, 2, 3, and 4 all
touch the same handful of functions closely enough that splitting them
would have meant re-testing the same scenarios repeatedly; item 5 is
verification-only, no code change).

---

## 2026-07-12 — KT-3: game flow & table feel (playtest-3 papercuts)

Brief: `briefs/KT3_GAMEFLOW_BRIEF.md`. All prior bug-fix briefs verified
holding in a third live brother game; this one is flow/feel papercuts,
not bugs, except item 6 which turned into a real bug fix.

**Item 1 — killed the radial End button.** It sat as a 44px hit target
directly over the operative's own token — the exact overlay-eats-
mousedowns hazard class KT-2 Part 2 found for drag-to-shoot, just for a
different button. Removed entirely (`.radial-end` CSS and the button
markup both gone); End Activation lives only in the bottom bar now,
which was already always present.

**Item 2 — weapon choice moved onto the radial itself.** Multi-weapon
Shoot/Fight used to hand off to a text list in the phase bar
(`shootWeapon`/`fightWeapon === 'picking'`). Replaced with
`renderRadialWeaponPicker()`: the ring itself repurposes into one button
per eligible weapon (evenly spread via the same angle math the normal
6-action ring uses, generalized to any count) plus a Back button, backed
by a single `radialWeaponPick = { kind, playerSlot, weapons }` state.
Wired into all three entry points that used to set the old 'picking'
sentinel — `startShoot`, `startFight`, and drag-to-shoot's
`ktDragShootMove` multi-weapon case — so the click path and the one-motion
drag path agree on where weapon choice happens, per the brief's explicit
"must work with drag-to-shoot's flow too." The old phase-bar picker
blocks and `pickWeaponForShoot`/`pickWeaponForFight` were dead after this
and got deleted rather than left around.

While testing drag-to-shoot's multi-weapon case specifically, found a
real bug: `setupDragMove`'s SVG click handler only guarded against
`dragState || shootState`, never `fightState` or the new
`radialWeaponPick`. A drag's own `mouseup` can be immediately followed by
a native `click` event on the same element, which — without the guard —
fell through to the already-selected-operative branch and called
`cancelActivation()`, silently wiping whatever the drag had just set up.
First symptom: the radial weapon picker would open then vanish within
the same gesture. Fixed by adding both to the guard. This is a plausible
concrete mechanism behind item 6's "fight uncanceled attacker" report,
independent of item 6's own fix below — a fight-drag's release is exactly
this kind of mouseup-then-click sequence.

**Item 3 — token hover.** Two additions to `drawOperativeToken()`: a
native SVG `<title>` element (free hover tooltip, zero JS show/hide
logic, and — usefully — browsers don't fire `<title>` on tap, so touch
tap-select needed no explicit detection branch to stay untouched) with
`"{name} — {wounds}/{maxWounds}W"`, and a `.token-selectable` class
applied under the same condition `renderOpRow` already uses for the
sidebar cards' `clickable` class, paired with `cursor: pointer` gated
behind `@media (hover: hover)` so touch devices never get a stuck pointer
cursor either.

**Item 4 — minimal action log.** `logAction()` writes structured records
(`{ type, ...fields, ts }`) to `games-kt/{id}/actionLog`, pushed from
`commitMove` (with net distance), `confirmShotDamage` (hits + damage),
and `confirmFightDamage` (both sides' damage). `describeActionLogEntry()`
is the only place that turns a record into an English line — per the
brief, written this way specifically so it can grow into KT-7's catch-up
feature without touching every write site. Rendered as a collapsed strip
(latest line + count) between `.game-main` and `.phase-bar`, click to
expand into the last 20 entries, scrollable.

**Item 5 — win/lose sequence.** `checkForWipeout()` runs right after
every damage-confirming write (`confirmShotDamage`/`confirmFightDamage`),
using the just-written wound values directly rather than waiting for the
Firebase snapshot to round-trip back (avoids a race with the caller's own
next step). Went looking for existing convention before inventing one:
`warhammer40k/js/state.js` already writes `gameOver: { winner, reason }`
on annihilation, and `killteam`'s own schema had a dormant `gameOver:
null` at game creation clearly scaffolded for the same field — reused
directly rather than adding a competing `meta/status` enum value. One
deliberate divergence from 40k's version: this brief explicitly asks for
a *personalized* VICTORY/DEFEAT per client, not 40k's single shared
"X wins" message, so `renderGameOver(playerSlot)` reads the viewer's own
slot. Also handles a case 40k's shooting-only flow doesn't reach: Fight
resolves both combatants' damage in one write, so a simultaneous double
wipe-out is real — `winner: null` renders as DRAW instead of leaving the
game in a dead end with no screen at all (note: Firebase strips
null-valued keys even inside nested objects on write, so this lands as
`gameOver: { reason: 'wipeout' }` with no `winner` key rather than a
literal stored null — `renderGameOver`'s `gameData.gameOver?.winner ||
null` already treats missing and null the same way, so this needed no
extra handling once found; it only cost a test-assertion fix once the
literal-null check didn't match what actually got stored).

**Item 6 — no longer just a placeholder.** The brief flagged this as
pending Nox's clarification with a placeholder verification task. Investigating
turned up a concrete, real bug closely matching "fight uncanceled
attacker": `cancelActivation()` (bound to Escape) only ever nulled
`activation`, leaving any in-progress Shoot/Fight drag — `shootState`/
`fightState`, their attached SVG `mousemove`/`mouseup` listeners, the
crosshair cursor — completely orphaned. The drag's own eventual `mouseup`
would still fire, hit `confirmShootTarget`/`confirmFightTarget`'s
`if (!activation) return` early bail, and leave `shootWeapon`/
`fightWeapon` stuck non-null with nothing re-rendering to clear the
stale UI. Fixed by having `cancelActivation()` clean up
`shootState`/`fightState`/`shootWeapon`/`fightWeapon`/`radialWeaponPick`
together before nulling `activation`. Combined with item 2's click-guard
fix above, there are now two independent fixes covering two different
paths to the same class of symptom. Per the brief's own framing and this
session's now-established caution about claiming a table-reported bug is
fully fixed without the actual retest: **Nox's next brother game is the
real acceptance check for this one**, not this session's testing.

**Testing:** one throwaway Playwright script (not committed, established
pattern), real headless Chromium via `.playwright-libs`, disposable
`games-kt/` fixtures via direct Firebase REST. 29/29 checks: no End
button + bottom-bar End still works (2); radial weapon picker for both
Shoot and Fight, single-weapon skip-through, drag-to-shoot's multi-weapon
case, and the dead-code-removed check (9, one fixed mid-session as noted
above — the click-guard bug); hover tooltip + selectable-cursor class (3);
action log recording and expand/collapse (3); win/lose with two real
browser contexts confirming the SAME `gameOver` write renders VICTORY on
one client and DEFEAT on the other, plus the double-wipe-out draw case
(6); Fight-cancel leaving no orphaned state and allowing immediate
re-selection (6). Also ran a `?dev=true` boot smoke test (0 console/page
errors) since item 5 touched `renderDevCol`'s dispatch.

**Not done / deferred:** Turning Point 4's end stays on the existing
(already-unhandled-before-this-brief) `'ended'` status, per the brief —
scoring is future work. The "also queued, not this brief" items (rolling
action-log-as-catch-up, composition validation, 40k lobby roster picker)
are untouched, as instructed.

**Commit:** `0bf46fa` (all six items in one commit — items 1 through 6
share enough surface area, mostly in `showRadialMenu`/`renderActivationBar`/
`cancelActivation`/`setupDragMove`, that splitting them would have meant
re-verifying overlapping scenarios repeatedly across commits).

## 2026-07-14 — KT-4: combat legibility + action-state rules

Brief: `briefs/KT4_COMBAT_LEGIBILITY.md`. Four numbered items plus a
Conceal-targeting verification called out in the RULINGS section.

**Item 1 — show the combat.** Shoot's damage line reformatted to the
brief's exact ask ("N CRIT × dmg + N HIT × dmg = total wounds") via a new
shared `formatDamageBreakdown()` — used by both Shoot and Fight so the
phrasing can't drift between the two.

Fight side turned up a real, pre-existing bug while building the
breakdown: `resolveFightOutcome()`'s block-then-strike annotation
(`crit-block`/`hit-block`/`crit-strike`/`hit-strike`) only ever applied to
the DEFENDER's dice. The attacker's own dice had no "blocked" state at
all — every rolled crit/hit displayed as CRIT STRIKE/STRIKE even when the
defender's blocks had absorbed some of them, so the per-die display could
show e.g. 4 crit strikes while the damage total (correctly) only reflected
2 getting through. This is plausibly part of "reads as a bug" from the
brief's own framing, independent of the labeling-only complaint. Mirrored
the exact same block-counting logic onto the attacker's side (same
priority order the existing damage math already consumes blocks in), and
exposed `atkStrikeCrits`/`atkStrikeHits`/`defStrikeCrits`/`defStrikeHits`
through `pendingFight` so the resolution bar can show the same "N CRIT ×
dmg = total" breakdown per pool, not just a bare "Deals: N wounds". The
defender's pool is now explicitly labeled "Retaliates:" rather than
"Deals:", and the top summary line is phrased relative to the viewer
("You deal 10 to Fight Target" / "Fight Target deals 10 to you") — the
brief's own suggested wording, so retaliation never reads as an unlabeled
number attacker damage happens to share a format with.

**Item 2 — enforce Heavy.** `getHeavyRequirement()`/
`getWeaponHeavyBlockReason()` parse the Heavy keyword's own qualifier
text. **Diverges from the brief's own RULINGS text** — verify-first
turned up that this pipeline's own `rules-glossary-kt.json` (extracted
from BSData, canonical) says: "An operative cannot use this weapon in an
activation... in which it moved... If the rule is Heavy (x only)... only
that move is allowed." Plain "Heavy" therefore blocks Dash too, not just
Reposition/Fall Back as the brief's RULINGS section states — the brief's
text describes what's actually only true of the "(Dash only)" variant.
Implemented per the glossary (the more precise, source-derived text) and
flagged here rather than silently picking one — this also naturally
covers the "(Reposition only)" variant (Dash-blocks-it, Move-doesn't),
which the brief doesn't mention but which real catalogue data has
(Hunter Clade's Galvanic rifle, Nemesis Claw's Heavy Gunner, etc.) and
which needed handling regardless.

Enforcement is per-weapon, not a blanket Shoot-button lock — a multi-
weapon operative can carry one Heavy option and one non-Heavy sidearm
(confirmed in real catalogue data: Skitarii Vanguard Gunner's
Transuranic arquebus has separate "(mobile)"/Dash-only and
"(stationary)"/plain-Heavy profiles). `startShoot()`'s single-weapon
skip-through and the radial weapon picker both grey out only the blocked
weapon(s), with a reason in the title; the whole Shoot button is only
disabled once every ranged weapon is ineligible. Wired identically into
both `renderActivationBar` (bottom bar) and `showRadialMenu` (radial
ring) — these are two independent renders of the same button state and
must agree, so the shared helpers take a plain `{hasMoved,hasDashed,
hasFallenBack}`-shaped object rather than each site re-deriving its own
logic.

**Item 3 — shoot-while-engaged + Fall Back.** `isEngaged()` is exactly
`hasFightTarget()`'s existing 1" check (same condition already used for
Fight eligibility — an operative can Fight whatever it's engaged with,
and can't Shoot while engaged with anything, so no new geometry needed).
`getShootActionBlockReason()` blocks Shoot while engaged or after Fall
Back. Fall Back didn't exist at all before this brief (only Move/Dash) —
built new rather than "confirmed" per the brief's "confirm it works"
framing, since verify-first found there was nothing to confirm.
`startMove(playerSlot, mode)` now takes a string ('move'/'dash'/
'fallback') instead of a boolean `isDash`, all four existing call sites
updated; Fall Back reuses the exact same drag mechanics as Move (this
engine doesn't separately enforce "must end outside control range" beyond
that — narrower than full RAW, matches the brief's own narrower ask) and
shares Move's action slot (`hasMoved`) so the two are mutually exclusive
per activation, same as real KT's "one of Reposition/Fall Back/Charge."
A second flag, `hasFallenBack`, blocks Shoot for the rest of the
activation regardless of weapon or position, per the brief's explicit
"ends shooting eligibility this activation" — this is why Fall Back
matters even though nothing currently stops a plain Move from leaving
engagement in this simplified engine (not touched — not asked for, and
real RAW nuance beyond the brief's stated scope).

Fall Back only added to the bottom activation bar, not the radial ring
— the radial is a fixed 6-slot hexagon (order/move/dash/shoot/fight/
charge at fixed 60° angles) and the bottom bar is always present
regardless (per KT-3 item 1), so a 7th conditional slot wasn't worth the
geometry rework. The radial's own `shootDisabled`/Heavy logic is still
kept in sync with the bottom bar's (same helpers, same activation-shaped
object) so a stale radial button can't let a blocked shot through.

**Item 4 — cancel-recovery.** Two real bugs, both in the same "orphaned
mid-action state" family KT-3 item 6 partially closed:

- `cancelShoot()`: `confirmShootTarget()` spends the AP and sets
  `hasShot` the moment a target is confirmed — before cover choice or
  dice are even rolled. "Cancel Shot" is reachable any time before phase
  `'rolled'`, but the old `cancelShoot()` never refunded
  `apRemaining`/`hasShot` — it only ended the activation outright once
  AP ran out, which made a permanently-burned AP look like an intentional
  consequence instead of the bug it was. This is almost certainly (part
  of) the "brother bug" the brief names directly. Fixed to restore
  exactly what `confirmShootTarget` committed; `apSpent` only reverts to
  false if nothing else (Move/Dash/Fall Back/Fight) committed this
  activation either.
- `cancelActivation()` (KT-3 item 6) cleaned up `shootState`/`fightState`/
  `radialWeaponPick` on Escape, but missed the 4th mid-action state:
  `dragState` (a Move/Dash/Fall Back drag in progress). Escape mid-drag
  left its svg `mousemove`/`mouseup` listeners and crosshair cursor
  orphaned exactly like the other three did before KT-3. Fixed the same
  way — `onMouseMove`/`onMouseUp` already guard on `if (!dragState)
  return`, so nulling it is sufficient, no listener-reference bookkeeping
  needed.

**Conceal verification (RULINGS, not a numbered item).** The brief's
ruling: "Concealed-in-cover = not a valid SHOOT target; always
Fightable." `getShootValidity()` was blocking ANY concealed target
unconditionally, regardless of cover — a Concealed operative standing in
the open should still be shootable. Fixed: the conceal check now only
fires when `rayResult()` also reports `'cover'` for this specific
shooter's line. Fight targeting was already correct (never checks
`order` at all) — no change needed there.

**Testing:** real headless Chromium via `.playwright-libs` (established
pattern), disposable `games-kt/kt4-verify-test` fixture via direct
Firebase REST (7 test operatives: a Heavy-weapon gunner, an engaged
pair, a shoot-then-cancel pair, a fight pair), non-dev single-player view
(`?game=...`, `localStorage kt_player_<id>=player1` set via
`page.addInitScript` — dev mode's `bootDev()` ignores the `?game=` param
and always creates its own fresh scratch game, discovered the hard way).
One real setup gotcha worth recording: serving `killteam/` as the HTTP
root 404s `../shared/bonus-resolver.js` (the app's own relative path
assumes a sibling `shared/` next to `killteam/`) — `BonusResolver is not
defined` then silently aborts Fight resolution with no visible error in
the UI. Serving from the monorepo root instead (`killteam/index.html` as
a subpath) fixes it. Also: board coordinates are bounded to `BOARD_W=22,
BOARD_H=30` (inches) — fixture operatives placed outside that range still
exist in `gameData` and pass every JS-level check, they just never
render inside the SVG's viewBox, so token clicks/drags silently find
nothing.

18 checks across 6 scenarios, all passing, zero console errors: Heavy
blocked after Move/Dash for plain "Heavy" (glossary reading), non-Heavy
sidearm still shootable on the same operative, Heavy usable when fully
stationary; Shoot disabled + Fall Back button appears while engaged,
Shoot still blocked after Fall Back even once out of control range;
Cancel Shot restores AP and `hasShot` exactly, Shoot re-selectable after;
`cancelActivation` nulls `dragState` mid-drag; Fight's pool breakdown
text and viewer-relative summary render correctly (screenshot: "1 CRIT ×
6 + 1 HIT × 4 = 10 wounds" / "No retaliation" / "You deal 10 to Fight
Target", attacker's own BLOCKED dice visible in orange); Shoot's
all-saved case reads "All hits saved — 0 damage"; concealed-in-the-open
target valid, concealed-in-cover target blocked with the new reason
string. Fixture deleted after the run.

**Not done / deferred, per the brief's own "Out of scope":**
ghost/animation drama (KT-5), chess timer, Seek/other keyword
enforcement beyond Heavy (BON-3 era), catalogue weapon data (that's
CAT-AUDIT, already shipped separately). Also not touched: whether a
plain Move (not Fall Back) should be blocked while engaged — real RAW
likely does restrict this, but the brief's explicit acceptance criteria
only cover Shoot-while-engaged and Fall Back existing/working, so this
stays unenforced rather than guessing past the brief's stated scope.

Files: `killteam/index.html` only (`resolveFightOutcome`,
`confirmFightTarget`, `renderFightResolutionBar`, `renderShotResolutionBar`,
`formatDamageBreakdown` (new), `getHeavyRequirement`/
`getWeaponHeavyBlockReason`/`isEngaged`/`getShootActionBlockReason` (new),
`startMove`, `startShoot`, `renderRadialWeaponPicker`, `pickRadialWeapon`,
`renderActivationBar`, `showRadialMenu`, `cancelShoot`, `cancelActivation`,
`getShootValidity`, `activateOperative`).

**Not done — queued for Nox:** brother's next game is the real acceptance
test, per the brief's own "Done when." In particular the Heavy-vs-brief
divergence (plain Heavy also blocking Dash, not just Reposition/Fall
Back) is worth a deliberate look at the table — it's the one place this
session's fix and the brief's own stated ruling disagree.

## 2026-07-15 — BON-3: CP economy, generic ploys, condition tokens

Brief: `briefs/BON3_CP_PLOYS_BRIEF.md` — the brother's #1 request. Turns
on active-bonus machinery that shipped inert since BON-1 (CP/AP cost
types, usage limits, condition effects — all schema-validated, none
enforced).

**Item 1 — CP economy + generic ploy catalog.** 7 universal ploys
authored in `data-pipeline/parsers/generic-ploys.json` (new — reviewable
data file, same philosophy as the keyword mapping tables, not hand-JSON
in Firebase): Steady Aim (+1 hit, 1CP), Second Chance (reroll one die,
1CP), Adrenaline Surge (+1 APL, 2CP, oncePerRound), Grit Through It
(cancel Injured penalty, 1CP), Brutal Efficiency (reroll all, 2CP,
oncePerRound), Focused Strike (+1 normal/+1 crit dmg, 2CP), Hold Fast
(+1 defence save, 1CP, defender-reactive). `compile-keywords.js` merges
them into the catalog, validated against `BonusResolver.validateBonus`
before ever reaching `bonuses-catalog.json` (first time this pipeline
validates hand-authored bonuses programmatically instead of by
convention). All 6 non-Hold-Fast ploys activate from a new panel on the
activation bar, before choosing Move/Shoot/Fight — declared ploys join
`activation.activePloys`, concatenated with the weapon's own bonuses in
`rollShot`/`confirmFightTarget` right where `getWeaponBonuses` already
runs, so they flow through the exact same `eligibleBonuses`/
`resolveStats` pipeline weapon keywords do. Hold Fast is the one
exception — defender-reactive, offered during Shoot's existing cover-
choice moment (`pendingShot.defenderPloys`, written by the defender's
own client, read by the attacker's `rollShot` the same way `useCover`
already crosses clients).

One real exception, flagged rather than forced into the generic
pipeline: Adrenaline Surge's +1 APL is a direct engine action
(`activation.apRemaining += 1`), not a resolved stat — APL isn't part of
any profile object `resolveStats` touches (weapon attack/defense
profiles are; the operative's own AP pool isn't), matching the schema
doc's own note that AP effects are engine-applied, not resolver-applied.

CP spend + usage tracking: `turn/cp/{player}` (existing, KT-1) now
actually decrements. New `ploysUsedThisGame/{player}` (never resets) and
`turn/ploysUsedThisRound/{player}` (reset alongside the CP award in
`startStrategyPhase`, same cadence) feed `BonusResolver.eligibleBonuses`'
existing oncePerGame/oncePerRound gating — no new gating logic, reused
the same mechanism weapon bonuses were already tested against.

**Real bug found and fixed while wiring this up:** every ploy failed
eligibility unconditionally at first — `scope.range: null` in the
authored JSON becomes `undefined` once round-tripped through Firebase
(Firebase drops null values on write), and `eligibleBonuses`' range
check is `if (bonus.scope.range !== null)` — `undefined !== null` is
true, so it fails closed on missing `context.positions`. This is the
exact landmine `buildBonusContext`'s own existing comment already warns
about for weapon bonuses; ploy-eligibility checks didn't supply
`positions` at all. Fixed by always passing dummy positions in
`canActivatePloy`'s context, same as `buildBonusContext` already does.

**Second real bug, found via the test harness's own stricter
`clickToken`:** `activatePloy`/`confirmMarkerlight` are async and spend
CP via a Firebase round-trip before mutating `activation` — if
`activation` gets reassigned or nulled while that write is in flight
(cancelActivation/endActivation firing on a slow connection, or this
session's own test harness switching scenarios mid-write), the resumed
function crashed trying to mutate a variable that no longer pointed at
a live activation. Fixed by capturing the activation object before the
`await` and re-checking identity (`activation !== startedActivation`)
after — bails cleanly instead of crashing if it's stale.

**Item 3 — condition tokens.** Generic per-operative state,
`operatives/{id}/conditions/{name}/stacks`, capped per `CONDITION_CAPS`
(stunned:1, markerlight:4) and displayed as sidebar badges
(`renderConditionBadges`, reusing the existing `.op-tag` pattern).
`conditionUpdatesFor()` turns a resolved `conditions` array (already
computed by `resolveStats`, previously badge-only per the BON-2b comment
directly above where it's called) into real state, wired into both
`confirmShotDamage` and `confirmFightDamage`.

- **Stun**: already correctly compiled since BON-1c
  (`condition:"stunned", when:"critScored"`) but never applied.
  Consumption (-1 APL) happens once, at the START of the stunned
  operative's next activation, then clears (`consumeStunForActivation`,
  called from `activateOperative`) — matches the real rule's "until this
  operative is activated" duration, which isn't one of the engine's
  existing instant/untilEndOfActivation/untilEndOfRound/game buckets
  (it's recipient-activation-scoped, not a fixed clock), so it's handled
  explicitly rather than stretching the duration vocabulary for one
  condition.
- **Markerlight**: no compiled bonus source exists for this at all —
  verify-first turned up that "Markerlight" is a shared BSData force-
  level rule referenced via an `infoLink` the parser's operative-building
  loop never follows (not a per-operative field like `keywords`), and
  real RAW restricts WHICH Pathfinder operatives can apply it (only
  datacard-flagged ones; every Pathfinder can *benefit* from tokens but
  not every one can *apply* them) — a distinction this pipeline doesn't
  capture today. Rather than ship the condition-token system with a
  real-catalogue condition that nothing could ever trigger, added a new
  Markerlight action (`startMarkerlight`/`confirmMarkerlight`, same
  click-and-drag-to-target pattern as Fight, no dice, no control-range
  limit — LOS-only) — deliberately simplified to "any tau-pathfinders
  operative can use it," flagged clearly as a gap (not a guess: the
  benefit-vs-apply distinction is real, just not parser-visible yet).
  Tightening eligibility to the real subset is parser work for a future
  session, not an engine change.

Also added: `markerlightState` is a 5th mid-action drag state alongside
`dragState`/`shootState`/`fightState` — added to `cancelActivation`'s
existing cleanup list from day one (the KT-3/KT-4 "orphaned state" bug
class this project has hit twice already) rather than shipping it with
the same gap and finding it in a future session.

**Testing:** real headless Chromium via `.playwright-libs`, disposable
`games-kt/bon3-verify-test` fixture via direct Firebase REST (9 test
operatives — a fresh game specifically so it snapshots the just-updated
bonus catalog, since existing games are frozen at creation per the
snapshot rule and would never see new ploys). 19 checks, 0 console
errors: CP decrements on ploy activation and the bonus appears by name
in the dice readout; can't afford a ploy past 0 CP (reason names the
shortfall); Adrenaline Surge's +1 APL applies immediately and is
correctly blocked for a second operative the same Turning Point; a live
crit with an Arc-pistol-style weapon (`bonuses:["stun"]`) actually
stunned the target; a pre-stunned fixture operative got exactly apl-1
AP on activation and the condition cleared; Markerlight stacked 1→2→3
(exhausting one operative's AP, correctly auto-ending its activation —
real rule, not a bug, an operative can't reactivate the same Turning
Point) then 4 with a second operative, and a 5th mark confirmed the cap
holds at 4. Screenshot: CP topbar at 8 (from 10, after 2× 1CP spends),
`MARKERLIGHT 4` and `STUNNED` badges visible in the sidebar, ploy panel
showing Adrenaline Surge correctly greyed post-use.

Two real bugs surfaced specifically BECAUSE the test harness enforced
strict activation-identity checks (`clickToken` now throws if the
clicked operative doesn't actually become the active one) rather than
trusting a value that happened to coincidentally match — worth recording
as a testing-methodology note: the first two harness runs had tests
"passing" for the wrong reason (a stale activation left open by a
previous test happened to have the same `apRemaining` value the next
test expected), caught only after tightening the harness itself.

**Not done, per the brief's own "Out of scope":** psychic powers,
faction-specific ploys, 40k/WHF anything, drama/animation. Also not
done: tightening Markerlight to the real datacard-eligible subset
(needs parser work — see above); a UI moment for defensive Fight ploys
(Fight has no pre-roll pause to offer one in, unlike Shoot); enforcing
"only one of Reposition/Fall Back/Charge OR a ploy that needs a specific
prior action" interactions beyond what KT-4 already built.

Files: `data-pipeline/parsers/generic-ploys.json` (new),
`data-pipeline/parsers/compile-keywords.js`, `data-pipeline/parsers/
upload.js` (`--bonuses-only` flag — needed to push the catalog without
also re-touching all 47 factions' unit data, which would have silently
given all of them ROSTER-VAL's compositionRules a session before that
scope decision), `killteam/index.html`.

## 2026-07-17 — BON-3b: psychic powers (extensible catalog)

Brief: `briefs/BON3B_PSYCHIC_BRIEF.md`. Fourth use of the same bonus-
engine machinery (weapon keywords → ploys → conditions → now powers).

### Divergence, confirmed before building anything

The brief's own worked example doesn't hold. Verified against the raw
`.cat` source directly (not the parsed output, not
`PIPE_40K_INVESTIGATE_REPORT.md`'s summary of it, though that report's
own Q3 finding is what flagged this): **Legionary Balefire Acolyte has
zero castable psychic actions.** "Balefire" is the operative's role
name; its three weapons (Fireblast, Life siphon, Fell dagger) all carry
the `PSYCHIC` weapon keyword and nothing else — that's real content,
already fully working today via the ordinary Shoot pipeline (mapped
since BON-1b), not something this brief needed to add. Legionaries has
no `typeName="Unique Actions"` profile carrying `**PSYCHIC**` anywhere
in its catalogue. The brief's acceptance criterion ("Balefire Acolyte
casts a real power by name") is retargeted below to a real castable
example instead of forcing a fictional power onto an operative that
RAW-wise doesn't have one.

Pulled the full 23-action list myself from the raw BSData across the 9
factions the investigation report named (regex over
`typeName="Unique Actions"` profiles whose text starts `**PSYCHIC**`),
to work from primary source rather than the report's per-faction tallies
alone.

### Schema — one real addition

New `damage` effect type (resolver v1.5.0): flat, unconditional damage
not tied to any dice roll (psychic powers like "inflict 2 damage" have
no ATK/HIT/DMG profile at all). Additive-only, same pattern as `when`
and `appliesTo` before it — new `damages` return channel on
`resolveStats`, same "own channel, not forced through the stat-mod
pipeline" treatment `condition` already got in BON-1, for the identical
reason (nothing to resolve against a `baseStats` value). 4 new resolver
tests (32/32 total): damage surfaced without touching `stats`,
`appliesTo` default, positive-value validation, non-positive rejected.

Everything else (mod/flag/condition) already covered every power
attempted — no other schema gap found.

### 8 powers authored, real names, faction-locked, one-line simplified effects

`data-pipeline/parsers/psychic-powers.json` (new, mirrors
`generic-ploys.json`'s pattern exactly — hand-authored, reviewable,
validated against `BonusResolver.validateBonus` in `compile-keywords.js`
before ever reaching the catalog, faction slug cross-checked against
real KT faction files too since a typo here would silently produce a
power no operative could ever be eligible for):

- **Ravage Destiny** (Warpcoven, 1AP, 9" enemy) — Stunned (reuses the
  BON-3 condition as-is: -1 APL at next activation).
- **Protected by Fate** (Warpcoven, 1AP, 6" ally) — new "Warded"
  condition, consumed on the recipient's next DEFENCE roll (rerollAll
  +1). A third distinct condition-duration shape alongside Stun/
  Empowered's "next activation" and Markerlight's "just stacks" —
  needed one real engine hook (see below).
- **Soul Channel** (Corsair Voidscarred, 1AP, 6" ally) — new
  "Empowered" condition (+1 APL at next activation), the positive
  mirror of Stun.
- **Mental Onslaught** (Brood Brothers, 1AP, 6" enemy) — flat 2 damage,
  the new `damage` effect type's first real use.
- **Poisonous Miasma** (Plague Marines, 1AP, 7" enemy) — 1 damage +
  new "Poisoned" condition in one entry (two effects, one power —
  Poisoned is state/display only this pass, same as Markerlight's own
  precedent: real state, mechanical consumption deferred, not smuggled
  in as done).
- **Disconcerting Mimicry** (Nemesis Claw, 1AP, 6" enemy) — forces the
  target's order to Engage. Doesn't fit mod/flag/condition/damage as a
  RESOLVED stat at all (it's a raw field write) — rides the flag
  vocabulary instead (`forceEngage`, special-cased in
  `confirmCastPower`, same one-deliberate-exception shape BON-3's
  Adrenaline Surge already established for "this effect needs a direct
  engine action, not a fifth effect type for one power").
- **Heinous Deluge** (Chaos Cult, 1AP, 6" enemy) — Stunned again,
  deliberately: two different real named powers, same simplified
  mechanic, exactly the "reuse conditions" instruction working as
  intended rather than inventing bespoke state per power.
- **Warding Shield** (Corsair Voidscarred, 1AP, 6" ally) — the recipe-
  proof power (see below), reuses Warded. Kept, not dropped — real,
  harmless, and Corsair Voidscarred having 2 powers instead of 1
  exercises the multi-power radial picker in actual play, not just in
  this session's test.

Dropped from the original 23: Inquisitorial Agents' "Scry" — its caster
("Mystic") doesn't carry the generic `Psyker` categoryLink every other
faction's caster does (verified against the raw `.cat`; a different,
undocumented eligibility convention), so the same PSYKER-keyword gate
this brief uses everywhere else would never have made it castable.
Fixing that is a parser change (teaching it a second caster-tag
convention), not a data-authoring one — flagged, not silently worked
around. Everything else from the 23 not listed above: skipped per the
brief's own instruction (heals — Soul Heal/Reconstitution Ritual/
Putrescent Vitality, this engine has no heal mechanic anywhere, wounds
only ever decrease; teleports/placement — Temporal Flux, Warp Fold;
board markers with recurring effects — Malefic Vortex, Ruinous Icon;
activation-sequencing locks — Fog of Dreams; multi-die contested rolls —
Mirror of Minds, Mind Control; resource systems this engine doesn't
have — Premonition's "Prescience points").

### Cast UI

New `Cast (1AP)` action on the activation bar, shown only for
`PSYKER`-keyword operatives with at least one faction-locked power in
the live catalog (`getCastablePowers` — BSData's `Psyker` categoryLink
survives into the parsed `keywords` array uppercased, same as any other
keyword, no parser change needed to read it). Single power skips
straight to targeting (same shape Shoot/Fight/Markerlight already use);
multiple powers route through the EXISTING radial weapon-picker
(`kind:'cast'`, generalized from its `kind:'shoot'|'fight'` two cases —
badge now shows `scope.range` in inches, or "Any" for unlimited-range
powers). Target-then-resolve reuses `rayResult` for LOS (same as
Markerlight/Shoot) and `power.scope.range`/`.target` (enemy/ally) for
eligibility — no new targeting primitive, the third consumer of the
click-and-drag-to-target shape after Shoot and Fight.

Resolution (`confirmCastPower`) routes through the exact same
`eligibleBonuses`/`resolveStats` call every other bonus source already
uses — a power is just a bonus whose `trigger:"always"` the caster
satisfies unconditionally by casting it. `conditionUpdatesFor` (BON-3)
and the new `damageUpdatesFor` (parallel helper, same shape, returns
both the Firebase-ready fragment and a plain `{opId: wounds}` map so
`checkForWipeout` doesn't need to reverse-parse Firebase path strings)
apply whatever the resolution produced in one write.

**One real engine addition**, not just data: Warded's "consumed on the
recipient's NEXT DEFENCE ROLL" duration needed an actual hook, since
nothing currently re-checks an operative's conditions mid-resolution.
`rollShot` now checks `target.conditions?.warded` before building
`targetBonuses`, synthesizes a bonus object on the fly (`{mod,
rerollAll, add, 1}` — no catalog entry exists for this, it's not
attached to any weapon, it's cast directly onto the target as state)
and clears the condition in a follow-up write once the roll actually
consumes it. This is the one place a psychic-power addition COULD need
more than pure data — any future power needing a similarly-shaped
"consumed on a specific future roll, not a future activation" duration
would need the same kind of hook. Every power actually authored this
session reuses either the activation-consumed shape (Stun/Empowered,
zero new code) or this roll-consumed shape (Warded, built once, reused
by two different powers with zero further code).

### The "add a power" recipe — proven, not just written

1. Pick a real name + faction (from the 23-action audit, or any future
   BSData sweep).
2. Author one entry in `data-pipeline/parsers/psychic-powers.json`: real
   name, real faction slug, one-line description that matches the
   effects exactly, and effects built from mod/flag/condition/damage —
   reusing an existing condition name (stunned/empowered/warded/
   poisoned/markerlight) whenever the mechanic fits, to stay in the
   zero-engine-code case.
3. `node parsers/compile-keywords.js` — validates against
   `BonusResolver.validateBonus` and the known-faction-slug set, merges
   into `bonuses-catalog.json`, fails loud on either kind of mistake.
4. `node parsers/upload.js --bonuses-only --force` (dry-run first) —
   pushes the catalog live without touching faction/unit data.
5. Done. Any `PSYKER`-keyword operative in that faction sees it in
   their Cast picker automatically — no `killteam/index.html` edit.

**Proved for real**, per the brief's explicit "prove it" instruction:
added Warding Shield (step above) with `killteam/index.html` UNCHANGED
between the two upload runs — confirmed live afterward (fresh disposable
fixture, real headless Chromium) that Corsair Voidscarred's caster now
sees exactly 2 powers in the radial picker where it saw 1 before,
0 console errors. This only holds for powers reusing an existing
condition's consumption shape, as noted above — a power needing a truly
novel duration/effect shape would still need an engine change, same as
Warded itself did.

### Testing

Real headless Chromium via `.playwright-libs`, disposable
`games-kt/bon3b-verify-test` fixture via direct Firebase REST (16
operatives — fresh game so it snapshots the just-updated catalog, per
the snapshot rule). 16 checks across 8 scenarios, 0 console errors:

- Cast button hidden for a non-psyker and for Legionary Balefire
  Acolyte (PSYKER keyword present, but Legionaries has 0 real powers —
  the button correctly gates on "any castable power exists," not just
  the keyword); shown for a Warpcoven Sorcerer.
- Ravage Destiny cast through the multi-power radial picker, applies
  Stunned to the enemy target, action log names it by its real name.
- Protected by Fate applies Warded; a simulated incoming shot from a
  different operative shows the reroll bonus in its own dice readout by
  name, then the condition clears — the full roll-consumed lifecycle,
  not just the apply half.
- Soul Channel's Empowered grants +1 APL at the target's next
  activation (4 AP on an apl-3 operative) and clears — the buff mirror
  of BON-3's Stun test, now exercising the generalized
  `consumeActivationConditions`.
  Mental Onslaught inflicts exactly 2 damage with no dice at all.
  Poisonous Miasma's combined damage+condition entry does both.
  Disconcerting Mimicry flips a Concealed target straight to Engage.
  Heinous Deluge (2nd faction, reused Stunned) confirms reuse doesn't
  drift.
- Recipe proof (separate run, described above): Warding Shield reaches
  the live picker with zero `killteam/index.html` changes.

Two real test-harness bugs found and fixed while building this (not app
bugs — both were BON-3's own established patterns applied slightly
wrong in this session's script, worth recording since they cost real
debugging time): a token selector unscoped to the board matched the
sidebar row instead of the SVG token (both carry `data-op-id`, `.first()`
silently picked the wrong one); and re-clicking an operative that had
already ended its activation this Turning Point correctly fails (real
rule — one activation per operative per round) but looks identical to a
real bug until you check `ready`.

### Not done, per the brief's own "Out of scope"

40k/WHF psychic, Deny/psychic defense, perils/Prescience points, the
15+ remaining complex powers this session explicitly skipped (heals,
teleports, markers, sequencing locks, contested-roll powers — see
above, each with its own reason recorded, not just "future work").
Inquisitorial Agents' Scry, blocked on the Mystic-vs-Psyker parser gap
noted above.

Files: `shared/bonus-resolver.js` (v1.5.0, `damage` effect type),
`shared/bonus-resolver.test.js` (4 new tests), `data-pipeline/parsers/
psychic-powers.json` (new), `data-pipeline/parsers/compile-keywords.js`,
`killteam/index.html`.

---

## 2026-07-16 — Port-worthy note from BUG_40K_PREGAME (not built here)

40k's deployment phase auto-advances to the next undeployed unit after you
place one, instead of making you re-click a unit picker every time. Nox's
brother noted it feels better than KT's current per-operative activation
flow, where you re-select from the sidebar/board each turn. Worth porting
to KT's Firefight activation loop (auto-select the next ready operative
after one finishes) if a future brief targets activation-flow polish —
not built here, note only, per BUG_40K_PREGAME item 5.

---

## 2026-07-17 — KT-5: Table Feel (dice legibility, board indicators, motion)

Sequel to KT-4, same root complaint from three consecutive playtests:
"everything is too auto-calculated. Told, not shown." Four items, all
purely presentational — zero die-roll or damage-calculation code touched.

**Item 1 — dice presentation.** Dice faces bumped 22px→30px (Shoot) /
20px→28px (Fight). Each die now sits in a `.dice-chip`: a tinted
background + colored border in its outcome color (crit red / hit green /
miss/fail gray), not just colored pips on a neutral face — color reads
before the label does, per the brief's explicit ask. `formatDamageBreakdown`
(KT-4's "N CRIT × dmg + N HIT × dmg = total" line) now colors each segment
to match its dice-group color, so the eye traces straight from the
colored math back to the colored dice that produced it — same numbers,
no logic change, just legible.

**Item 2 — layout.** The board is portrait (22×30), so on wide viewports
`.board-wrap` left real horizontal gutters empty while the dice pool and
action log both lived crammed below the board in `.phase-bar`/a
collapsible bottom strip — direct cause of the "gap is dead space, no
scrolling ever" complaint (the scroll regression named as having
recurred twice). Added two new persistent side panels flanking
`.board-wrap` inside `.game-main`: `.dice-panel` (left) and `.log-panel`
(right). Action log lost its collapse/expand toggle (`toggleActionLog`
deleted) — it has the panel's full vertical height now, no reason to
hide it. `renderPhaseBar()` and its two combat sub-renderers
(`renderShotResolutionBar`/`renderFightResolutionBar`) now return
`{controls, dice}` instead of a plain string — dice display (the actual
roll + math) goes to the side panel, buttons/cover-choice/bonus-readout
stay in the bottom `.phase-bar`. Only two call sites read `renderPhaseBar`
(`renderGame`, `reRenderPhaseBar`), so the refactor's blast radius stayed
small despite touching the two biggest render functions in the file.

Found live during verification, not anticipated in the brief: fixed
220px/200px side-panel and sidebar widths meant that at half-screen-tiled
width (960px) the board was squeezed to ~120px — technically zero scroll,
but the board was barely usable, which misses the brief's actual intent
even though it satisfied the literal wording. Fixed by switching
`.sidebar`/`.side-panel` from fixed `width` + `flex-shrink:0` to
`width: clamp(...)`, so panels shrink smoothly with viewport instead of
refusing to and crushing the board.

**Item 3 — board-level condition indicators.** New generic
`drawConditionTokens(g, op)`, called from `drawOperativeToken` for every
operative with any `op.conditions` stack > 0 (same data BON-3 already
introduced for the sidebar badges). One colored dot per active condition
along the token's bottom-left arc (the order pip already owns
top-right); conditions with `CONDITION_CAPS > 1` (markerlight, cap 4)
also print their stack count inside the dot. A `CONDITION_TOKEN_COLORS`
table drives the color per condition name with a neutral-cyan fallback
for anything not in the table — a brand new condition gets a token dot
for free, no bespoke per-condition code required, per the brief's ask.

**Item 4 — motion.** Two pieces:

- *Movement tween.* Operatives now animate from old to new position
  (~200ms, SMIL `animateTransform`) instead of teleporting. Non-trivial
  because a single move writes to Firebase TWICE — `commitMove`'s
  position `.update()`, then `logAction`'s separate `actionLog` push —
  and each one independently fires the root `.on('value')` listener,
  which does a FULL `buildBoardSVG` rebuild (tears down and redraws
  every token). A naive "one-shot tween from last render" map gets wiped
  by the second rebuild well before 200ms is up, cutting the tween short
  on essentially every real move (confirmed by test: it happened on 100%
  of moves, not an edge case). Fixed with `activeTweens`, keyed on
  wall-clock progress rather than "current render pass": each rebuild
  recomputes the token's current interpolated position from elapsed time
  and resumes the animation from there, so repeated rebuilds mid-tween
  are invisible instead of visibly restarting or snapping.
- *Shot beam, fixed to two real bugs.* The beam previously fired via a
  direct call inside `rollShot()`, which only ever runs on the
  *attacker's* client (the Roll Dice button is attacker-gated) — the
  defender's screen never saw a beam at all, silently failing the "both
  clients see the same motion" requirement every prior session that
  built on this code had. Moved the call into `detectAndPlayEffects`'s
  existing `pendingShot` coverChoice→rolled transition handler, which
  both clients hit independently via their own Firebase subscription —
  same mechanism `startDiceAnimation` already relies on for its own
  two-client sync. Also recolored the beam from weapon-flavor (laser
  red, bolt yellow, etc.) to hit/miss outcome (green/gray) — the brief's
  literal ask ("colored by outcome... reads instantly"), and per-weapon
  color coding is arguably the kind of per-weapon distinction the brief
  puts out of scope anyway. Damage floaters already spawn at the
  operative's live `x`/`y` (confirmed by inspection, not changed) — since
  Shoot/Fight never move the target mid-resolution, "lands on the
  tween's endpoint" was already true by construction; no code needed.
- *Explicitly out, logged per the brief:* audio, dust, per-weapon shot
  effects (distinct tracer shapes/particles per weapon) — next tier if a
  future brief wants it.

### Verification

Two-Playwright-window fixture (`games-kt/kt5-verify-test`, one page per
`kt_player_<id>` slot) driving a full loop: viewport-scroll check at
1900×1000 and 960×1000 (half-screen), a markerlight+stunned target
(stacks 3/1) for board-indicator checks, a Shoot end-to-end (drag-to-aim
→ roll → verify beam fires on BOTH pages' `beam-g-*` groups → apply
damage), a Move (drag via the Move button, not a token drag — `startMove`
arms its own listeners on button click) sampled mid-animation on both
pages for a live `animateTransform`, and a Fight end-to-end confirming
`fight-pools` moved to the dice panel and out of phase-bar controls.
25/25 checks pass, 0 console/page errors on either client.

Regression: no die-roll, damage, or condition-application code was
touched this session — `formatDamageBreakdown` returns the identical
numbers wrapped in colored spans, `playBeamOnly`'s only removed call site
was a pure-VFX no-op for outcomes, movement's real `x`/`y` write
(`commitMove`) is untouched, only its *rendering* got a transform
animation layered on top. `shared/bonus-resolver.test.js` still 32/32
(unrelated file, sanity-checked anyway).

Files: `killteam/index.html` only (CSS layout/dice-chip rules, side-panel
markup in `renderGame`/`reRenderPhaseBar`, `renderPhaseBar` + the two
resolution-bar functions' `{controls,dice}` split, `drawConditionTokens`,
`activeTweens`/`updateActiveTweens`, `playBeamOnly` recolor +
`detectAndPlayEffects` relocation).

---

## 2026-07-17 — BUG_CRITICAL_ROUND6: cache headers, terrain race, and three "did not reproduce" reports

Brief: `briefs/BUG_CRITICAL_ROUND6.md`, from back-to-back brother games
(40k and KT). Root-repo `firebase.json` (item 1) and this file's own
`.firebaserc`/`.firebase/hosting..cache` confirm a **live Firebase
Hosting deployment now exists** — `PROJECT_STATE.md`'s "no live
deployments anywhere" is stale as of this session; flagging for the next
regeneration rather than silently trusting the old snapshot per
CLAUDE.md's verify-first rule.

**Item 1 — cache headers (root `firebase.json`).** No `headers` block
existed at all, so Hosting served its own defaults — plausible root
cause for a run of "fixed but still broken" reports the brief names.
Added `Cache-Control: no-cache` for `**/*.@(html|js|css)` (must-
revalidate every load, not a hard no-store — small apps, simplicity
over a content-hash scheme). **Deploy + live cached-browser verification
deliberately left to Nox** — every prior brief this session ended with
local commits and Nox pushing/redeploying, and a live-site deploy is
exactly the kind of hard-to-reverse, shared-system action worth
confirming before taking unilaterally. Asked directly; Nox is handling
deploy + verify himself.

**Item 3 — terrain placement deadlock, real bug, fixed + verified.**
`passTerrainTurn()` read `gameData.terrainPassed` — the client's
realtime-listener-delivered snapshot — to decide whether to also
advance `meta/status` to `'deployment'`. Two players passing within one
realtime round-trip of each other each see a stale "other hasn't passed
yet" and neither write ever includes the advance; both flags end up
true but nothing ever moves the game forward, and nothing re-checks
afterward. This is the *same* race warhammer40k's `confirmTerrainDone`
(state.js) already narrowed by reading fresh via `once('value')` at
confirm-time instead of trusting the snapshot — ported that shape
first, then **live-tested it with two real Playwright contexts firing
`passTerrainTurn` in the same tick and it still deadlocked** (a plain
read-then-write, even server-fresh, isn't atomic against a truly
simultaneous pair). Replaced with a Firebase `.transaction()` on
`terrainPassed` itself — the server serializes concurrent transactions
on the same path, so whichever commits second is guaranteed to see the
first's merged value. Re-ran the same simultaneous-race test 4x after
the transaction fix: 4/4 pass, both clients correctly reach
`deployment`. (Side note for whoever next touches 40k's terrain code:
`confirmTerrainDone` has the same narrower theoretical race — not fixed
here, out of this brief's scope, worth a transaction there too if it's
ever actually hit.)

**Item 4 — Night Lords/Nemesis Claw ranged weapon selection: real data
gap found, "can't select" not reproduced.** `gameData/kill-team/
factions/nemesis-claw`'s Heavy Gunner has **all four** of its ranged
weapons (missile launcher frag/krak, heavy bolter focused/sweeping)
missing a range value entirely, and Fearmonger's "Scoped bolt pistol
(long range)" mode is the same — confirmed by direct fetch, not
fabricated. This is the same shape as the already-documented "Legionary"
range bug (`rng` top-level, not nested in `profiles.RNG`) — Nemesis Claw
is a Night Lords-flavored Legionary-family kill team, so it's very
plausibly the same underlying data family. BUT: `weaponRange()` treats a
missing range as **unlimited** (∞), which is permissive, not blocking —
traced the full pipeline (raw catalog → roster export's `{...w,
profiles: sanitized}` spread, which preserves top-level `rng` → `build
Operatives`'s existing `w.rng` fallback) and found no step that would
make a ranged weapon *unselectable*, no disabled state, no crash. Built
a synthetic fixture directly from live Nemesis Claw catalog data for
Heavy Gunner/Gunner/Visionary as player2 and drove Shoot for all three:
every weapon activated cleanly, zero console/page errors — just an "∞"
badge where a real range should be. Also noticed (not confirmed as a
bug, just an observation): the roster export's `chosenLoadout` is built
as a keyed **object**, but `buildOperatives` only uses it when
`.length` is truthy — which a plain object never has — so operatives
may always render their *full* weapon catalog rather than the
specifically chosen loadout; didn't chase this further, flagging for
whoever picks this up next. **Root cause not fully closed** — the
missing-range data gap is real and worth a parser/pipeline pass, but
doesn't explain "can't select." Recommend a live two-window repro with
an actual published Nemesis Claw roster (not a synthetic fixture) if
this recurs post-cache-fix.

**Item 6 — "won't let me click on my dudes" after round 1: not
reproduced.** Same symptom family as BUG_KT_PLAYTEST_1/2, both of which
ended with "Nox's next brother game is the real acceptance check, not
this session's testing" rather than a confirmed fix — worth remembering
before assuming this is new. Built a fixture at Turning Point 2 (after
round 1, matching the report), player2's turn, sidebar-click-to-select
(matching "clicking the sidebar name selects" specifically) then Move,
tested at both a full desktop viewport and a narrow 620×750 tiled
window (PT1's own flagged-but-never-proven risk condition: two windows
tiled side by side have much less room for the bottom action bar).
Selection and Move both worked cleanly at both sizes, zero console
errors. Per the brief's own instruction: reporting this as **not
reproduced against current source — a strong candidate for a cache
ghost**, consistent with item 1's whole premise. Nox's live re-test
after deploying the item 1 cache fix is the real check here, exactly as
the brief asks for.

**Item 2 (40k dead models) and item 5 (40k weapon stats "?") — see
warhammer40k/DEVLOG.md.** Investigation only in that subproject; no
warhammer40k files touched by this session (a separate session was
concurrently editing `js/board.js`/`game.js`/`state.js` while this one
worked — investigation was read-only throughout, no collision).

**Testing:** all live, two real Playwright browser contexts where the
symptom is inherently cross-client (items 3, 6), real Chromium via
`.playwright-libs`, disposable `games-kt/` fixtures via direct Firebase
REST, all cleaned up after. No committed test scripts, established
pattern.

Files: `firebase.json` (item 1), `killteam/index.html` (item 3,
`passTerrainTurn`).
