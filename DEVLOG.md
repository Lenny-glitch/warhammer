# Roster Manager — Dev Log

Collaborative log between Nox (user) and Nyx (Claude). Kept here so context survives machine changes.

---

## Project Vision

A suite of browser-based tabletop wargame tools built for two brothers to play across states.
No app store, no installs, no subscriptions. Just a link.

**Three components:**

| App | Status | Notes |
|---|---|---|
| Roster Manager | In progress | This project |
| Kill Team Game App | Planned | Phase 1: Tau Pathfinders vs Drukhari Wyches |
| Warhammer 40k Game App | Groundwork exists | Will wire to Roster Manager once roster system stable |

All three share a single Firebase project. Rosters flow from Roster Manager into game apps via shared Firebase export path — no file transfer, no format negotiation.

---

## Architecture Principles

- Vanilla HTML/CSS/JS. No frameworks, no build tools.
- Single HTML file per app.
- Firebase Realtime Database for all persistent state.
- Anonymous access via generated IDs and shareable URLs. No auth for now.
- Game-agnostic data models — stat blocks and weapon profiles are schema-driven, not hardcoded.
- Hash-based routing.

---

## Firebase Structure

```
gameData/
  {gameSystem}/
    meta: { name, pointsLimit, teamSizeMin, teamSizeMax }
    factions/
      {factionId}/
        info: { name, description, compositionRules }
        units/
          {unitId}/     ← canonical unit templates, permanent library

rosters/
  {rosterId}/
    meta: { name, gameSystem, factionId, created, pointsTotal }
    units: []           ← selected units with chosen loadouts

exports/
  {gameSystem}/
    {rosterId}/         ← finalized rosters for game app handoff

rosterSchemas/
  {gameSystem}/         ← stat field definitions, weapon profile fields
```

---

## Unit Data Model

```javascript
{
  id: "auto-generated",
  name: "Kasrkin Trooper",
  gameSystem: "kill-team",
  faction: "Kasrkin",
  factionId: "kasrkin",       // slugified from faction name
  role: "Trooper",
  points: 15,
  stats: {
    APL: "2",
    MOVE: "6\"",
    SAVE: "4+",
    WOUNDS: "8"
  },
  weapons: [
    {
      id: "w1",               // local ID, never changes, used for loadout refs
      name: "Hot-shot lasgun",
      type: "ranged",
      isDefault: true,        // max one default per unit
      profiles: { ATK: "4", HIT: "3+", DMG: "3/4", WR: "" }
    }
  ],
  loadoutOptions: [
    {
      slot: "Primary weapon",
      weaponIds: ["w1", "w2"] // references weapons by local ID
    }
  ],
  abilities: [
    { name: "Adaptive Equipment", description: "Full rules text here" }
  ],
  equipment: ["Smoke Grenade", "Stun Grenade"],
  keywords: ["Kasrkin", "Imperium", "Astra Militarum", "Trooper"],
  notes: ""
}
```

---

## Routing

```
#home                           → Home screen, game system selection
#unit/new/{system}              → Unit Creator, blank form
#unit/edit/{system}/{unitId}    → Unit Creator, pre-filled for editing
#roster/new/{system}            → Roster Builder (future)
#roster/{rosterId}              → Roster view (future)
```

---

## Game System Schemas (Firebase: rosterSchemas/{system})

```javascript
{
  "kill-team": {
    statBlock: ["APL", "MOVE", "SAVE", "WOUNDS"],
    weaponProfiles: ["ATK", "HIT", "DMG", "WR"],
    hasWeaponType: true
  },
  "warhammer-40k": {
    statBlock: ["M", "T", "SV", "W", "LD", "OC"],
    weaponProfiles: ["RANGE", "A", "BS/WS", "S", "AP", "D"],
    hasWeaponType: true
  }
}
```

---

## Session 1 — 2026-06-23

### What's done
- **Step 1 complete:** Firebase scaffold, schema seeding on first load, home screen with game system selection cards, hash-based router, sticky nav with breadcrumb and back button.
- Two schemas seeded to Firebase: `kill-team`, `warhammer-40k`.

### Step 3: Unit Creator Form
**Status:** Layout + dynamic behavior built. Firebase save not yet wired (pending Nox review).

**Form sections:** header (name, faction combobox, role, points) → stat block (dynamic from schema) → weapons (add/remove/reorder, type toggle, isDefault, dynamic profiles) → loadout slots (weapon references by local ID) → abilities → equipment tags → keyword tags → notes.

**Key decisions made:**
- Loadout slots reference weapons by local ID (not name) — avoids stale refs on rename
- Faction field is a combobox (datalist) — type new or select existing
- Game system is locked from home screen — no switching inside form
- One default weapon max — selecting new default auto-unchecks previous
- factionId = slugified faction name (lowercase, spaces→hyphens, strip specials)
- Edit route: `#unit/edit/{system}/{unitId}` — Copy opens `#unit/new/{system}` pre-filled

**Stop condition:** Nox reviews layout and dynamic stat block before approving Firebase save wiring.

### Step 4: Unit Card (complete)
Read-only datasheet-style card. Header (name, faction·role, points badge), stat block row, weapons table with profile columns and ★ default marker, loadout options, abilities, equipment/keyword tags, notes, action row (Edit / Copy Unit / Delete).

**Known limitation:** changing faction name during edit updates display fields but does not migrate the Firebase path. Unit stays under its original `factions/{originalFactionId}` key. Followup item, not blocking.

### Step 5: Library view (complete)
**Route:** `#library/{system}`

**What it does:** Browseable list of all units for a game system. Faction filter tabs at top, units grouped by faction, each row shows name / role / points with hover-reveal Edit and × Delete buttons. Search filters by unit name or role across visible groups. Empty-group suppression (faction headers with no matching units are hidden). Delete from list is wired (confirm dialog, Firebase remove, optimistic state update without reload).

**Pending data entry:** The seeded Kasrkin Trooper has a placeholder for Adaptive Equipment rules text. Must be entered via the Edit flow when the full rules text is available.

---

## Phase 1 Complete — 2026-06-23

### What was built

| Step | Feature | Status |
|---|---|---|
| 1 | Firebase scaffold, schema seeding, home screen | ✓ Complete |
| 2 | Home screen — game system selection, routing | ✓ Complete |
| 3 | Unit Creator form — dynamic schema-driven form, Firebase save | ✓ Complete |
| 4 | Unit Card — read-only datasheet view, Edit / Copy / Delete | ✓ Complete |
| 5 | Library — faction-filtered unit list, search, delete from list | ✓ Complete |

### What's next (Phase 2)
- Roster Builder (`#roster/new/{system}/{factionId}`) — pick units from library, choose loadouts, track points
- Roster view (`#roster/{rosterId}`) — shareable roster summary
- Kill Team Game App — async 2-player implementation wired to Roster Manager
- Adaptive Equipment rules text entry for Kasrkin Trooper

---

## Phase 2 — In Progress (started 2026-06-23)

### Factions in scope
- **Tau Pathfinders** — seeded composition rules + 3 test operative units (Shas'ui, Shas'la, Weapons Expert)
- **Void-dancer Troupe** (replacing Drukhari Wyches) — MHT rules extracted, pending seed after review
- **Ork Kommandos** (`ork-kommandos`) — fully seeded: composition rules + 11 operative units (Boss Nob through Snipa Boy)

### Discrepancies vs Phase 2 brief (Wahapedia wins per brief instructions)

| Item | Brief said | Wahapedia says | Resolved |
|---|---|---|---|
| KT24 points limit | `pointsLimit: 1000` in composition rules | KT24 has no points system — count-based only | `pointsLimit` excluded from composition seed |
| MB3 RECON DRONE | Not mentioned | Counts as 2 operative selections | `countsAs: 2` unit property; legality checker must use this value |

### Phase 2 routing
```
#roster/new/{system}/{factionId}   → Roster Builder
#roster/{rosterId}                 → Roster View (Step 5)
```
Home screen "Browse & Build Roster" now navigates to Library (`#library/{system}`) — user picks faction there, clicks "Build Roster" button in faction header.

### Step 1: Roster Builder shell — COMPLETE (2026-06-23)
Stacked layout: roster name input + operative counter in header, operative list (empty state), unit browser loaded from Firebase. Add/remove/reorder operatives. Greying logic uses composition rules (slot availability, max constraints, unique constraints). Points shown cosmetically. Save Draft and Publish stubs (disabled, wired in Steps 4/6).

### Extracted Void-dancer Troupe composition (from local MHT — pending seed)
```
Total: 8 operatives
Required: 1 Lead Player (LEADER, APL 3, MOVE 7", SAVE 4+, WOUNDS 9)
7 from list:
  - Death Jester (unique, max 1, APL 3, MOVE 7", SAVE 4+, WOUNDS 9)
  - Player       (repeatable, APL 3, MOVE 7", SAVE 4+, WOUNDS 8)
  - Shadowseer   (unique, max 1, APL 3, MOVE 7", SAVE 4+, WOUNDS 9)
Special: max 1 fusion pistol and max 1 neuro disruptor across the whole team
```
Weapon profiles (ATK/HIT/DMG/WR) for each operative need targeted extraction or manual entry.

### Ork Kommandos — seeded 2026-06-23

factionId: `ork-kommandos`, parentFaction: Orks

```
Total: 10 operatives (fixed)
Required: 1 Boss Nob (Leader)
Max 2 Bomb Squig (each counts as ½ slot — 2 squigs = 1 slot)
All other operatives unique except Kommando Boy (role: Boy) and Bomb Squig
```

11 operative units seeded with full weapon profiles:

| Operative | Role | APL | SAVE | WOUNDS | countsAs |
|---|---|---|---|---|---|
| Boss Nob | Leader | 3 | 5+ | 14 | 1 |
| Bomb Squig | Bomb Squig | 2 | 5+ | 5 | **0.5** |
| Kommando Boy | Boy | 2 | 5+ | 10 | 1 |
| Breacha Boy | Breacha Boy | 2 | 5+ | 10 | 1 |
| Burna Boy | Burna Boy | 2 | 5+ | 10 | 1 |
| Comms Boy | Comms Boy | 2 | 5+ | 10 | 1 |
| Dakka Boy | Dakka Boy | 2 | 5+ | 10 | 1 |
| Grot | Grot | 2 | 5+ | 5 | 1 |
| Rokkit Boy | Rokkit Boy | 2 | 5+ | 10 | 1 |
| Slasha Boy | Slasha Boy | 2 | 5+ | 10 | 1 |
| Snipa Boy | Snipa Boy | 2 | 5+ | 10 | 1 |

Note: Slasha Boy and Comms Boy have the BOY-related compound keywords (SLASHA BOY, COMMS BOY) but NOT the standalone BOY keyword — only Kommando Boy is repeatable.

### Step 2: Loadout configurator — COMPLETE (2026-06-24)
Operative rows expand inline on click. Choice operatives show radio groups per slot + live-updating weapon profile table. Fixed-loadout operatives show "Fixed Loadout" label + read-only profile table. Collapsed rows show weapon summary `Boss Nob — Big Choppa · Slugga`. Expansion state survives reorder; radio change updates table and summary in place without full re-render.

### Step 3: Legality checker — COMPLETE (2026-06-24)
Checks in order: (1) total slot count vs min/max using `countsAs`, (2) required roles present, (3) role max caps, (4) unique constraint by unitId for non-repeatable roles. Green banner "Roster is legal" or red banner listing plain-English violations. Publish gated on legal. Save Draft always enabled. `_checkSpecialRules()` stub present for Void-dancer Troupe weapon uniqueness check (Step 7).

### Step 4: Save Draft → Firebase — COMPLETE (2026-06-24)
First save generates rosterId via push key, stores in state + localStorage as `roster_owner_{rosterId}`. Subsequent saves reuse same ID (preserves `created` timestamp). Saves to `rosters/{rosterId}/meta` + `rosters/{rosterId}/units`. `meta.isLegal` written at save time. URL bar shows "Draft saved — [link] [Copy]" after save; clears on any roster edit.

### Step 5: Roster View — COMPLETE (code), UNVERIFIED (2026-06-24)
Route `#roster/{rosterId}`. Reads `rosters/{rosterId}`, loads unit templates to resolve weapon names, renders read-only view: header (name, Legal/Draft/Published badge, faction·system, operative count), operative list with weapon summary per row. "Edit this roster" button visible only for owner (localStorage token check). Navigates to blank builder — full edit-resume from Firebase is a future step.

**Known limitation:** Step 5 was not tested in-browser before proceeding to Step 6. Must be verified before Phase 2 is considered complete.

### Step 6: Publish flow — COMPLETE (2026-06-24)
Publish loads unit templates and writes fully denormalized export to `exports/{system}/{rosterId}/operatives[]`. Each operative contains: name, role, stats, full weapons array, `chosenLoadout` resolved to full weapon objects, abilities, keywords, equipment, notes. Also marks `rosters/{rosterId}/meta.status = 'published'`. After publish: `state.rosterId` cleared — subsequent edits force a new Save Draft with a new ID. URL bar changes label to "Published". Roster View badge shows purple "Published" for published rosters.

**Outstanding for Phase 2:**
- Step 5 verification in-browser
- Step 7: Void-dancer Troupe weapon uniqueness check (`_checkSpecialRules`)
- Void-dancer Troupe data seed (weapon profiles still needed)
- "Edit this roster" full resume from Firebase (currently opens blank builder)

---

## Session close — 2026-06-25

No new code this session. Committed three MHT source files as reference material:

| File | Contents |
|---|---|
| `Kommandos.mht` | Wahapedia page used to seed Ork Kommandos — 11 operatives, weapon profiles, composition rules |
| `Pathfinders.mht` | Wahapedia page for Tau Pathfinders — source for operative stats and composition rules |
| `Void-dancer Troupe.mht` | Wahapedia page for Void-dancer Troupe — weapon profiles still need extraction before data seed |

---

## Session — 2026-06-25 (continued)

### What was done

Seeded all remaining unit data and published two rosters via Node.js REST API script (`seed-and-publish.js`, scratchpad only — not committed).

**Firebase seeded:**

| Path | Content |
|---|---|
| `gameData/kill-team/factions/void-dancer-troupe/info` | Faction info + composition rules (8 ops, Leader required, max 1 Death Jester, max 1 Shadowseer, special rule note) |
| `gameData/kill-team/factions/void-dancer-troupe/units/lead-player-001` | Lead Player — APL 3, MOVE 7", SAVE 4+, W9, 3 pistol options + 5 melee options |
| `gameData/kill-team/factions/void-dancer-troupe/units/death-jester-001` | Death Jester — same stats, same weapon pools (unique) |
| `gameData/kill-team/factions/void-dancer-troupe/units/player-001` | Player — APL 3, MOVE 7", SAVE 4+, W8, same weapon pools (repeatable) |
| `gameData/kill-team/factions/void-dancer-troupe/units/shadowseer-001` | Shadowseer — APL 3, MOVE 7", SAVE 4+, W9, hallucinogen grenade (default) + ranged option (neuro/shuriken) + miststave (default) |
| `gameData/kill-team/factions/tau-pathfinders/units/blooded-pathfinder-001` | Blooded Pathfinder — APL 2, MOVE 6", SAVE 5+, W7, suppressed pulse carbine + bionic arm |
| `gameData/kill-team/factions/tau-pathfinders/units/assault-grenadier-001` | Assault Grenadier — APL 2, MOVE 6", SAVE 5+, W7, pulse carbine + fusion grenade + fists |
| `gameData/kill-team/factions/tau-pathfinders/units/mv7-marker-drone-001` | MV7 Marker Drone — APL 1, MOVE 8", SAVE 4+, W7, countsAs 1 |
| `gameData/kill-team/factions/tau-pathfinders/units/mv1-gun-drone-001` | MV1 Gun Drone — APL 1, MOVE 8", SAVE 4+, W7, twin pulse carbine + ram |
| `gameData/kill-team/factions/tau-pathfinders/units/mb3-recon-drone-001` | MB3 Recon Drone — APL 1, MOVE 8", SAVE 4+, W7, **countsAs 2**, burst cannon (focused + sweeping) + ram |
| `gameData/kill-team/factions/tau-pathfinders/units/weapons-expert-pathfinder-001` | PATCH: added `role: "Weapons Expert"` to existing record |

**Rosters published:**

| Roster | Firebase ID | Export path |
|---|---|---|
| Tau Pathfinders — Roster 1 | `-OvzZzqDWpwSVAwZx3kO` | `exports/kill-team/-OvzZzqDWpwSVAwZx3kO` |
| Void-dancer Troupe — Roster 2 | `-OvzZzrLgyu9iYFRbFrb` | `exports/kill-team/-OvzZzrLgyu9iYFRbFrb` |

**Roster 1 — Tau Pathfinders (12 operatives):**
Shas'ui (Leader), 6× Shas'la, Blooded Pathfinder, Assault Grenadier, Weapons Expert (Ion rifle), Weapons Expert (Rail rifle), MV7 Marker Drone.

**Roster 2 — Void-dancer Troupe (8 operatives):**
Lead Player (Fusion pistol + Blade), Death Jester (Neuro disruptor + Kiss), Shadowseer (Shuriken pistol + Miststave), 5× Player (Shuriken pistol + Caress / Embrace / Kiss / Blade / Blade).

### Bug fix — export key + keywords (2026-06-25, same session)

**Bug 1 — `_doPublish()` export key was `operatives`, should be `units`.**
`_doPublish()` was writing the denormalized data under `exportData.operatives`. Game apps are designed to read `exports/{system}/{rosterId}/units`. Fixed: renamed key to `units` in both `_doPublish()` and the re-publish script.

**Bug 2 — Keywords empty for old unit templates.**
Old units (Shas'ui, Shas'la, Weapons Expert seeded in Phase 1) store keywords as `tags` not `keywords`. `_doPublish()` was reading `tmpl.keywords` which returned undefined. Fixed: `tmpl.keywords || tmpl.tags`.

Both rosters republished after the fix. All 12 Tau and 8 Void-dancer operatives confirmed to have `stats`, `weapons`, `keywords`, `abilities` in the export.

**Export schema (game apps read this):**
```
exports/kill-team/{rosterId}/
  meta/  { name, gameSystem, factionId, factionName, pointsTotal, publishedAt, rosterId }
  units/ [ { instanceId, unitId, name, role, points, countsAs, stats, weapons,
              chosenLoadout (resolved to full weapon objects), abilities, keywords,
              equipment, notes } ]
```

### Phase 2 sign-off

Both rosters are live and confirmed at `exports/kill-team/{rosterId}/units`. Phase 2 is complete pending browser verification of Step 5 (Roster View).

### Outstanding items

- **Step 5 verification** — Roster View in-browser (was unverified before Phase 2 closed)
- **`_checkSpecialRules`** — Void-dancer Troupe: max 1 fusion pistol + max 1 neuro disruptor across kill team (current stub returns `[]`)
- **Roster 3 (Kommandos)** — Build via the app using existing seeded data
- **Kill Team Game App** — Faction alignment: replace hardcoded Drukhari Wyches with Void-dancer Troupe; build board/game loop
- **Integration** — Wire Kill Team game app to read from `exports/kill-team/{rosterId}`

---

## Phase 3a — 2026-06-25

### Fixes shipped (commit a220403)

**Fix 1 — RosterView router bug**
Router was assigning `document.getElementById('screen-roster').innerHTML = RosterView.render(sub)`. `render()` sets `innerHTML` itself and returns nothing, so this clobbered the element with `"undefined"`. Fixed: call `RosterView.render(sub)` directly, no assignment.

**Fix 2 — "Edit this roster" opens blank builder**
Three parts:
- `RosterBuilder.render()` now accepts optional third argument `rosterId`. When present: loads `rosters/{rosterId}/meta+units`, restores operatives into `state` (preserving `created` timestamp and roster name), then renders normally so the builder opens pre-populated.
- `_load()` now guards `if (!RosterBuilder.state.name)` before applying the faction-default name — prevents overwriting a loaded roster name.
- Edit button in RosterView now routes to `#roster/edit/{rosterId}`; Router dispatches that case to `RosterBuilder.render(null, null, rosterId)`.

**Fix 3 — Void-dancer special rule enforcement**
`_checkSpecialRules()` stub replaced with real check: max 1 `w-fusion-pistol` and max 1 `w-neuro-disruptor` across all operatives' `chosenLoadout` values. Weapon IDs confirmed from Firebase before hardcoding. Comment flags the function for conversion to a dispatch table when more factions need cross-team weapon limits.

### Known data gap — Kommandos missing Defence stat

All 11 Ork Kommandos operatives are missing the `DF` (Defence) stat in Firebase. The Kill Team schema expects `APL / MOVE / DF / SAVE / WOUNDS`; Kommandos units only have `APL / MOVE / SAVE / WOUNDS`. Displays as `—` in any stat block view. Non-blocking for roster builder or game logic. Fix when doing a Kommandos data cleanup pass: update all 11 unit records with correct DF values (standard Ork DF is 3).

### Fix 4 — Kommandos end-to-end validation

Full create → configure → legality check → save → publish flow exercised via Firebase REST API, mirroring the exact operations `RosterBuilder` performs in the browser.

**Roster built:** 1 Boss Nob (Leader) + 7 unique specialists (Slasha, Dakka, Breacha, Snipa, Burna, Comms, Rokkit) + 2 Kommando Boys (repeatable) = 10 operatives / 10 slots.

**Legality check:** Passed. All constraints met: total 10/10, 1 Leader present, no Bomb Squig overflow, all non-repeatable specialists appear once, Boys correctly excluded from unique constraint.

**Results:**

| | |
|---|---|
| Roster ID | `-Ow0T5UGlT8q7ryTPnck` |
| Draft path | `rosters/-Ow0T5UGlT8q7ryTPnck` |
| Export path | `exports/kill-team/-Ow0T5UGlT8q7ryTPnck` |
| Roster View URL | `#roster/-Ow0T5UGlT8q7ryTPnck` |
| Edit URL | `#roster/edit/-Ow0T5UGlT8q7ryTPnck` |

**Export verified:** All 10 operatives have `stats` and `weapons` arrays. Boss Nob melee loadout resolved correctly to full weapon object (Big choppa, the first slot option).

**Nothing broke.** No issues found during the flow. The data gap (missing `DF` stat) shows as `—` in stats as expected — confirmed non-blocking.

### Outstanding items carried forward to Phase 3b

- **Roster View browser verification** — Fix 1 corrects the router bug; Roster View for all three factions should now be verified in-browser
- **Fix 2 browser verification** — Load `#roster/edit/-Ow0T5UGlT8q7ryTPnck`, confirm 10 operatives pre-populate, make a change, Save Draft, confirm update (not duplicate)
- **Kommandos DF data gap** — Update all 11 unit records with `DF: "3"` in Firebase
- **Kill Team Game App** — Wire to roster exports

---

## Phase 3a closure — 2026-06-26

Three outstanding Phase 3a items closed before proceeding to Phase 3b Part 2.

### Kommandos DF patch

All 11 Ork Kommandos units patched in Firebase via REST PATCH to `gameData/kill-team/factions/ork-kommandos/units/{id}/stats`:
`boss-nob-001`, `bomb-squig-001`, `kommando-boy-001`, `breacha-boy-001`, `burna-boy-001`, `comms-boy-001`, `dakka-boy-001`, `grot-001`, `rokkit-boy-001`, `slasha-boy-001`, `snipa-boy-001` — all now have `DF: "3"`.

### Roster View verification (Fix 1)

Verified via direct Firebase read + JS logic execution (headless browser unavailable in WSL — missing `libasound.so.2`):
- `rosters/-Ow0T5UGlT8q7ryTPnck` loads correctly: name `"Kommandos Roster 1"`, status `published`, 10 operatives
- All 10 operative `unitId` values resolve to unit templates in `gameData/kill-team/factions/ork-kommandos/units`
- `_resolveWeaponNames` produces correct summaries for all 10 operatives (Boss Nob → Slugga · Big choppa, etc.)
- Badge renders as `"Published"`. No `undefined` output.
- Router fix confirmed in code: line 3775 calls `RosterView.render(sub)` standalone, not assigned to `innerHTML`.

### Edit resume verification (Fix 2)

Verified via code inspection + Firebase data shape check:
- `render(null, null, rosterId)` sets `state.rosterId = rosterId` from the URL param (line 2532), not from `meta.rosterId` (which is absent from Firebase — non-issue)
- `state.name` set to `data.meta.name` before `_load()` runs; name guard at line 2579 (`if (!state.name)`) prevents faction-default from overwriting it
- Save Draft `isNew = !s.rosterId` → `false` when editing → same Firebase path reused, no duplicate created
- All 10 operatives have `instanceId` in Firebase → restore maps cleanly

### wargearOptions array fix (uncommitted before session end)

`UnitSearch._transform` was calling `_parseWargear(raw.wargearOptions || '')` directly. Some source pool units store `wargearOptions` as an array rather than a string. Fixed: coerce to string via `.join(' ')` before parsing.

---

## Cross-Project Status — 2026-06-27

| Repo | Status | Next |
|---|---|---|
| roster | Phase 3b Part 1 done (unit search + lazy migration scaffolded for 40k path) | Parts 2–3: 40k builder flow + publish export + sim integration |
| killteam | KT-2 Part 2 done (drag-to-shoot, pip dice, Firebase-backed resolution) | KT-2 Parts 3–4: fight, firing arc projection |
| warhammer40k | Phase 16 complete, deploy branch live | Phase 17: blocked on roster Phase 3b Part 3 (chosenLoadout in sim) |

**Roster Phase 3b remaining work:**
- Part 2: 40k roster builder flow — unit picker, squad size slider, live points, wargear dropdowns, legality check, publish
- Part 3: sim integration — `buildUnitsFromRoster()` reads `chosenLoadout`, `getAllRangedWeapons` filters by equipped weapons

**KT-2 remaining work:**
- Part 3: drag-to-fight (both sides roll, alternating resolve or auto-resolve)
- Part 4: firing arc projection during movement drag

---

## KT Wahapedia Scraper — 2026-06-27

Added `scraper/scrape_kt.js` and `scraper/write_firebase_kt.js` to the roster project, mirroring the 40k scraper pattern in the warhammer40k project.

**Scraper:** `node scraper/scrape_kt.js`
**Output:** `scraped-data/kt-{faction}.json` + `scraped-data/kt-scrape-report.txt`
**Write:** `node scraper/write_firebase_kt.js` → writes to `gameData/kill-team/factions/{factionId}/units/`

**Factions scraped (from `https://wahapedia.ru/kill-team3/kill-teams/{slug}/`):**
- Ork Kommandos (11 operatives) → `kt-ork-kommandos.json`
- Tau Pathfinders (16 operatives) → `kt-tau-pathfinders.json`
- Void-dancer Troupe (4 operatives) → `kt-void-dancer-troupe.json`

**Parsed per operative:** APL, MOVE, SAVE, WOUNDS stats (DF defaults to "3" — not listed on KT3 pages), all weapons with ATK/HIT/DMG/WR profiles, abilities, keywords, base size.

**Manual patches applied in Firebase:**
- `tau-pathfinders / mb3-recon-drone`: `countsAs = 2` ✓
- `ork-kommandos / bomb-squig`: `countsAs = 0.5` ✓

**Source tracking:** Every scraped operative has `source: "scraper"` in Firebase. User-created units (via Unit Creator form) now write `source: "user"` on save. On edit, the existing source is preserved so scraper units stay tagged as "scraper" even after human edits. Units seeded before this session have no source field.

**URL pattern quirk:** Wahapedia's live pages use `class=" bkg"` (leading space) on weapon tbody elements, vs `class="bkg bkg0"` in saved MHT files. Scraper handles both.

**ID format change — action needed on existing saved rosters:**
The scraper generates clean IDs (`boss-nob`, `shas-ui`, `boy`) without the old `-001` numeric suffix used by the manual seed scripts. The write script replaced all units at each faction path, so old IDs (`boss-nob-001`, `shas-ui-001`, etc.) no longer exist in Firebase.

Effect: The three existing draft rosters reference old unitIds and will show "unit not found" in the roster builder UI. The published game exports (`exports/kill-team/{rosterId}`) are denormalized and unaffected — the KT game app still works.

**Action:** Use the Draft Cleaner utility (added in next session) to auto-repair these rosters.

---

## Roster Cleaner — 2026-06-26

Added a **Draft Cleaner** maintenance utility to the roster app at `#clean-drafts` (accessible via "Clean Drafts" link on the home screen).

**Problem it solves:** The KT scraper write changed all unitIds from `boss-nob-001` format to clean slugs (`boss-nob`). Any draft roster built against the old IDs now has broken unit references.

**How it works:**
1. Fetches all `status: "draft"` rosters from Firebase.
2. For each unit instance, checks if the current `unitId` still exists in Firebase.
3. If not, tries two auto-repair strategies in order:
   - **Slug-strip:** removes trailing `-\d+` suffix and checks if the result exists.
   - **Name-match:** searches all units in the faction for a name that exactly matches `unitName`; succeeds if exactly one match found.
4. Renders a report: ✓ ok / ↻ auto-fixable / ⚠ manual units, with fix arrows showing old → new ID.
5. "Apply Fixes" button PATCHes all auto-fixable `unitId` fields to Firebase, then re-renders to confirm.

**Notes:**
- Only touches `status === 'draft'` rosters — published exports are denormalized and unaffected.
- Weapon IDs also changed (e.g., `w-fusion-pistol` → `fusion-pistol`). The cleaner fixes `unitId` only; loadout selections on repaired units may need re-picking in the builder.
- Reports "loadout may need re-selection" note on each auto-fixed row.

---

