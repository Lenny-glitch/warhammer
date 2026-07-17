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

## BON-1 — Generic Bonus Engine landed in data-pipeline (2026-07-02)

data-pipeline replaced the "get ploys/stratagems card-exact" effort with a
generic bonus/modifier schema (see data-pipeline/DEVLOG.md). Relevant here:

- Roster currently reads ploys from `gameData/.../ploys` purely for display
  (DATA_MIGRATION_PLAN.md: "displays them as reference"). That data source
  doesn't change yet — BON-1 only compiled weapon-keyword bonuses, not
  faction ploys/stratagems as bonuses (that's BON-3).
- When BON-3 lands, the ploy/stratagem reference display in the roster
  builder will have a second, more structured source it could pull from
  (`gameData/{system}/bonuses/`) — no action needed until then.

---

## Roster 3b Part 2 v3 — 40k build flow (2026-07-04)

**Commit:** `3e8c3eb` (branch `deploy` — this repo's convention post-GIT-1:
work lands directly on `deploy`, Netlify serves it from there).

### Background: three brief revisions, each correcting a wrong assumption

- **v1** assumed BSData-parsed 40k units (`gameData/warhammer-40k/
  factions/.../units`) had squad-size/loadout structure to read. They
  don't — confirmed by reading the raw BSData XML directly.
- A follow-up brief (PIPE-2) tried deriving `squadSize`/`pointsTable`/
  `loadoutSlots` from BSData's raw selection-entry XML. Prototyped against
  real data: 25% confident-derivation coverage, and a real semantic
  ambiguity (sibling model-entries in one group can be *alternative
  variants of the same slot* or *independent additional slots* — BSData's
  structure doesn't disambiguate this, and guessing wrong silently
  corrupts squad sizes rather than just under-covering them). Rejected;
  not implemented.
- **v2** pivoted to hand-authoring composition lazily via the Unit
  Creator. Correct in spirit, but built on top of `UnitSearch` — which
  turned out to read from an entirely different, older dataset
  (`gameData/warhammer-40k/{factionSlug}`, flat) than the one RosterBuilder
  actually uses for adding units to a roster (`.../factions/.../units`,
  BSData). Two disjoint 40k unit sources existed simultaneously.
- **v3** (this one, implemented): investigated the flat pool directly —
  it already has 100% `squadSize`/`pointsTable` coverage on both factions
  (134 Astra Militarum + 97 Craftworlds Eldar units, zero gaps beyond one:
  `shadow-spectres`' `pointsTable` rows are missing their `models` label).
  Decision: the flat pool is canonical going forward; the BSData subtree
  is deprecated (kept, not read, deleted in a later pass). Weapon
  `bonuses` arrays — confirmed absent from the flat pool entirely — are
  explicitly dropped from this brief's scope, deferred to a BON-4-era
  enrichment pass (flat-pool keywords are already near-glossary uppercase
  strings, e.g. `"MELTA 2"`, `"SUSTAINED HITS 1"` — that future enrichment
  should be mechanical, reusing `compile-keywords.js`'s existing mapping
  tables, not a new derivation effort).

### What shipped

- `RosterBuilder._load()` branches on `system === 'warhammer-40k'`: reads
  the flat pool directly, transforms each unit via a new
  `UnitSearch._transformForRoster()`. KT's original confirmed-library read
  is untouched below the branch.
- **`_parseWargear` — two real bugs fixed** (shared code, benefits
  `UnitSearch`'s original preview screen too): "X **can be** replaced"
  phrasing was mis-parsed as `"Replace be"` (the regex assumed "can have
  their/its/the X replaced" specifically); "**N** of the following"
  (numeral) wasn't recognized at all, only the word "one" — Dark Reapers'
  Exarch weapon swap is the concrete case that was falling through to
  unparsed before this fix.
- **New: `_matchWeaponIds`/`_resolveLoadoutOptions`** — bridges
  `_parseWargear`'s option name *strings* to the `{slot, weaponIds}` shape
  the loadout UI needs (which references weapons by *id*). Handles
  possessive-prefixed replaced-item names ("Platform's shuriken cannon")
  and one-to-many prefix matches (generic "missile launcher" prose maps to
  *both* the starshot and sunburst variants on Guardian Defenders — offers
  both as real choices rather than guessing one).
- **New: `_normalizePointsTable`** — `[{models: "10 models", points}]` →
  `{"10": pts}`. Never infers a missing `models` label from row position;
  `shadow-spectres` (the one unit with this gap) falls back to flat points
  with a visible caveat.
- **Squad-size picker** — renders only when `squadSize.min !== .max`;
  changing it recomputes `points` live from the normalized table.
- **Lazy hand-author fallback hook** — for units whose wargear prose
  didn't resolve into a pickable choice (Cadian Shock Troops' "for every
  10 models... special weapon" text is the concrete case — its two
  Sergeant sidearm swaps parse fine, but the actual special-weapon choice
  is embedded in "for every N models" phrasing that's deliberately left
  as unparsed reference text, by design, not a bug). A small dedicated
  editor (not a full `UnitForm` reuse) writes straight to the flat pool
  unit's own record — the canonical source, not the deprecated subtree.
  Skippable; skipping just leaves the reference-text notice visible next
  time, which doubles as the "not yet authored" marker without a separate
  flag.
- **Fixed a real bug in Publish**: it unconditionally re-fetched unit
  templates from the deprecated BSData subtree at publish time, which has
  no `loadoutOptions` at all — every 40k roster would have silently
  published with an empty `chosenLoadout`, discarding every loadout choice
  a player made. Now reuses the already-correct in-memory `unitLibrary`
  for 40k; KT's original fresh-fetch-from-confirmed-library is untouched.
- Unit browser gained an inline filter for 40k (134/97 units per faction —
  the old "Search Source Pool" button, which sent players to a separate
  screen, no longer has a purpose now that `RosterBuilder` reads the pool
  directly. Left the now-dead `sessionStorage['unitSearchReturn']`
  return-navigation code in place — inert, not broken, not worth touching
  without being asked).

### Verification

Ran the actual transform/resolver code (extracted from `index.html`,
executed in Node against live Firebase data — no headless browser
available in this environment) against the acceptance unit and the known
edge case:
- Cadian Shock Troops: `squadSize: {min:10,max:20}`, `pointsTable:
  {"10":65,"20":120}`, 2 correctly-resolved loadout slots, 1 unparsed
  entry (the special-weapon text) correctly triggering the fallback hook.
  Live points recompute correctly for both squad sizes (65 / 120).
- `shadow-spectres`: `pointsTable: null`, caveat shown, flat price (115)
  used — confirms no positional guessing on the missing-`models` gap.
- KT regression: verified by code tracing, not a live click-through. Every
  new UI branch (`squadSize`, `pointsCaveat`, `unparsedWargear`) is
  `undefined` on KT units, so `_squadSizeHTML`/`_wargearNoticesHTML`
  short-circuit to `''` and `_pointsFor` falls through to the original
  `unit.points` behavior unchanged. KT's publish path is the untouched
  `else` branch. **Not verified with an actual click-through build/save/
  publish** — flagging this honestly rather than claiming full confidence,
  since no browser was available to drive one.

### Known gaps / not done here
- Composition validation banner (legality warnings) — explicitly next
  brief, not this one; `compositionRules` is `null` for 40k for now.
- Weapon `bonuses` arrays on 40k exports — deferred to BON-4-era flat-pool
  enrichment, not in this brief's scope.
- The two `_parseWargear` regex fixes only cover the two confirmed bug
  patterns; "for every N models" wrapping (19 units total across both
  factions) is deliberately NOT parsed — those units rely on the fallback
  hook, by design, per the amendment.

---

## GIT-2: monorepo migration + Netlify hosting dropped (2026-07-04)

This repo no longer lives at `~/projects/roster` — it's now
`~/projects/warhammer/roster/`, one of six subprojects merged into a
single monorepo (full history preserved via `git subtree`). The old
standalone repo was renamed `roster-old` and archived; don't develop
against it.

**Netlify hosting dropped entirely** (build minutes exhausted) — this repo
was the one live deployment in the whole portfolio (`deploy` branch,
"pushes go live" was the accepted-risk convention documented throughout
this log). That's no longer true. No live deployment exists anywhere.
`master` is now the only branch; push carries zero ship risk. `netlify.toml`
stays in the monorepo root, dormant, as the revival kit if hosting comes
back (likely Firebase Hosting next time, not decided).

`firebase-config.js` didn't carry over automatically (it was gitignored,
and the subtree merge only carries git-tracked history) — copied over
manually from the archived `roster-old/firebase-config.js` so this app
still runs locally. Same gitignore convention continues in the new
location.

---

## BUG_40K_PUBLISH_1: Publish button unlocked for null legality (2026-07-05)

Verified against live Firebase and current source before touching
anything, per this brief's own "code-trace alone does not close this"
instruction — and the verification changed the diagnosis.

**`/rosters/undefined` is NOT the misdirected Eldar export.** Its content
is a Kill Team roster (`gameSystem: "kill-team"`, faction `ork-kommandos`,
"Kommandos Roster 1"), created 2026-06-26 — over a week before this bug
was reported and for a different game system and faction entirely. There's
a companion node at `exports/kill-team/undefined` (a shallow scan the
brief didn't ask for but turned up) whose `publishedAt` is 69ms after
`rosters/undefined`'s `created` timestamp — the same `Promise.all` pair
`_doPublish` writes on every publish, confirming this was a real (if
old, KT-only) instance of the same failure *shape*: `s.rosterId` was the
literal string `"undefined"` at publish time. **Left both nodes in place
rather than deleting them** — they're real roster data, not garbage, and
deleting them wasn't something this diagnosis actually established as
necessary. No `warhammer-40k` key exists anywhere under `rosters/` or
`exports/` with a similar malformed shape; all three live Craftworlds
Eldar drafts are still `status: "draft"` (`exports/warhammer-40k` doesn't
exist at all yet, confirming the original symptom).

**The reproducible bug is Amendment 1's second symptom.**
`_updateLegalityBanner()` had an early-return branch —
`if (!rules) { publish.disabled = true; return; }` — that unconditionally
locked the Publish button for any faction with no `compositionRules`
(all of 40k, permanently, since 40k has none). A second, parallel hardcode
in `_doPublish`'s `finally` block (`b.disabled = !legal`) had the same
effect: `!null === true`, so even reaching the button's re-enable logic
after a publish attempt would re-lock it. `_checkLegality()` itself was
already correctly tri-state (`legal: null` for unvalidated, from the
earlier false-LEGAL-badge fix) — the bug was entirely in these two call
sites not treating `null` as anything but falsy. Fixed both to
`disabled = legal === false`, matching the amendment's decision: null
(unvalidated) is publishable, only an explicit violation blocks it. The
banner now shows a neutral "Not validated — no composition rules for this
faction yet" message for the null case instead of silently returning.

**The original path bug (bug #3 on this path) — not found on a fresh-eyes
read.** `_doPublish` generates `s.rosterId` via a synchronous
`App.db.ref('rosters').push().key` guarded by `if (!s.rosterId)` before
either write, and `s.system` is set from `_fresh()`'s `system` argument
(populated from the URL hash for new rosters, or from
`data.meta.gameSystem` when editing an existing draft) — no path found
where either is undefined at the `exports/${s.system}/${s.rosterId}` write.
Most likely this was already fixed as a side effect of the earlier
Roster 3b Part 2 v3 rewrite of this same function (which touched the
40k-vs-KT template-source branch right next to this write) without being
explicitly logged as closing this brief. **Not claiming this closed on
code-trace alone** — per the brief's own three-strikes rule, this needs
Nox to actually republish a 40k roster and confirm
`exports/warhammer-40k/{id}` appears with `chosenLoadout` and
`modelCount` populated.

**KT publish path:** untouched by this fix — both call sites' `legal`
values are unaffected for factions that do have `compositionRules` (the
`legal === false` / `legal === true` branches behave exactly as before,
only the `null` branch changed).

---

## BUG_40K_PUBLISH_2 Amendment 2: Firebase-forbidden keys in the export (2026-07-05)

Confirms Nox's republish result: the path + button fixes above worked —
the write targeted `exports/warhammer-40k/-OwoAQwxVjMCNbt3ZBaG`, a real
push key. Firebase then rejected the payload outright: `invalid key
(BS/WS) in ...units.0.weapons.0.profiles`.

**Root cause:** `App.schemas['warhammer-40k'].weaponProfiles` (line ~1580)
uses `'BS/WS'` as a single combined ballistic-/weapon-skill column — a
real, load-bearing key used throughout the roster-builder UI
(`schema.weaponProfiles` drives the profile edit form, the weapon-profile
table headers, etc.), not scrape noise. `_transformForRoster` and
`UnitSearch._transform` both build `weapon.profiles` with this literal
key, and `_doPublish` copies it into the export verbatim
(`weapons.map(w => ({ ...w }))` is only a shallow spread — the nested
`profiles` object's bad key rides along unchanged). Firebase Realtime
Database keys forbid `. # $ / [ ]`; `/` is the one at fault here.

**Fix:** `RosterBuilder._sanitizeFirebaseKey`/`_sanitizeKeyedObject`,
applied in `_doPublish` only — not in `_transformForRoster`, so the live
builder UI keeps the pretty `'BS/WS'` key matching the schema, and only
the exported/published copy carries the clean one. A fixed, documented
map (`_FIREBASE_KEY_MAP = { 'BS/WS': 'bsws' }`) handles the one known key;
anything else forbidden falls through to a general character-strip so a
future scrape quirk doesn't reintroduce this exact failure silently.

**Sweep, as asked ("don't just patch BS/WS"):** the `profiles` object's
keys are always exactly the 6 literals in `weaponProfiles`
(`RANGE, A, BS/WS, S, AP, D`) for every unit in both 40k factions — not
scraped per-unit, so there's nothing else to find there. But `profiles`
isn't the only export-time object keyed by untrusted text:
`chosenLoadout` is keyed by `slot.slot`, which comes from
`_parseWargear`'s prose parsing — far less constrained than a fixed
schema list. Ran the actual `_parseWargear`/`_resolveLoadoutOptions`
functions (extracted from this file, not reimplemented) against every
unit's real `wargearOptions` text in both `craftworlds-eldar` and
`astra-militarum` (87 distinct slot names total) and found **3 units
whose parse produces a slot label with a literal period** — a genuine
`_parseWargear` mis-split, not just an unlucky character:
- `ynnari-kabalite-warriors`: `"Replace be equipped with 1 phantasm
  grenade launcher.. 1 Kabalite Warrior's splinter rifle can be"`
- `hippogriff-afv`: `"Replace heavy stubber replaced with 1 meltagun.
  Any number of models can each have their vigilator cannon"`
- `kasrkin`: `"Replace be equipped with 1 vox-caster (that model's
  hot-shot lasgun cannot be replaced). The Kasrkin Sergeant's chainsword
  can be"`

Applied the same sanitizer to `chosenLoadout`'s keys defensively, so these
3 units' publish doesn't hit the identical Firebase rejection next.
**Did not fix the underlying mis-parse** — these slot labels are garbled
nonsense even once Firebase-safe, and the units still need real loadout
options; that's a `_parseWargear` quality bug in its own right, worth a
dedicated brief rather than a drive-by fix here. Verified no sanitized-key
collisions occur within any single unit's `chosenLoadout` across either
faction's real data (the 3 bad units each have exactly one malformed slot,
and the general strip doesn't collapse any two distinct real slot names
into the same string anywhere in the current dataset).

Not claiming this closed on code-trace alone, same as before — needs
Nox's republish to confirm `exports/warhammer-40k` carries the sanitized
keys end to end.

---

## ROSTER-UX-1: unit browser sections, cosmetic batch, My Rosters (2026-07-06)

Session picked this back up after an earlier interrupted attempt — the
claim commit (`99f204f`) existed but no implementation had landed, so this
is the actual first pass, not a continuation of partial code.

### Section 1 — Unit browser sections: brief's assumption didn't hold, reported per verify-first

Checked live Firebase before implementing, per standing rule. The brief's
premise ("group by each unit's existing role field... Characters /
Battleline / Infantry / Vehicles / Transports") doesn't match either
dataset:

- **40k flat pool has no `role` field at all.** It has `category` with
  exactly three values — `character` / `infantry` / `vehicle` — no
  battleline/transport distinction exists in the data. `_transformForRoster`
  already maps `category` onto a synthetic `role` property (line ~4126,
  pre-existing), so the field the brief describes only ever holds these
  three lowercase strings for 40k.
- **KT's real `role` field is not a category — it's a per-operative name.**
  Pulled every KT faction's units and counted distinct role values: 493
  units across all factions produce 445 distinct roles, and every single
  faction checked (kasrkin, tau-pathfinders, ork-kommandos, void-dancer-troupe,
  deathwatch, angels-of-death) has exactly as many distinct roles as it has
  units — e.g. Kasrkin's 12 units have 12 different roles ("Combat Medic",
  "Demo-Trooper", "Sergeant", ...). Grouping by this would produce ~1 unit
  per section, not meaningful categories — KT operatives don't carry an
  infantry/vehicle/transport distinction in this data model at all.

Implemented sectioning generically anyway (`RosterBuilder._sectionedUnitsHTML`/
`_sectionLabel`/`_unitRowHTML`, `roster/index.html`) since it's correct and
harmless for both: 40k gets three clean sections (Characters / Infantry /
Vehicles, in that fixed order, alphabetical within each — verified against
live data: Astra Militarum 25/35/74, Craftworlds Eldar 32/34/31), KT gets
one section per unit (verified, not broken, just not useful — matches the
data). Missing/blank role always falls into "Other", sorted last, never
hidden, per the brief's requirement. Removed the old per-row role caption
(`rb-unit-role` div) since it's now redundant with the section header it
sits under — the CSS class is now unused but left in place rather than
deleted, not asked for here.

One bug caught before it shipped: reused the class name `rb-section-label`
for the new section headers, not noticing the codebase already uses that
exact class for the "Operatives"/"Unit Browser" headers in the builder
shell (`_shell()`, line ~2760/2764) with different CSS. Renamed the new one
to `rb-role-section-label` to avoid the collision.

### Section 2 — Cosmetic batch

- **Trailing "+" on weapon names** (scrape artifact — "Triskele +",
  "Mirrorswords +"): added `cleanWeaponName()` (top-level helper, same
  tier as `toTitleCase`/`slugify`) and applied it at every read-only
  weapon-name render site (unit card, roster builder loadout radios/table,
  loadout-author overlay, roster view summary, unit search preview) — left
  raw in the one place it's an editable text input (UnitForm's weapon-name
  field), since that should show/save the true underlying data.
- **Duplicate weapon names in summary lines**: found the real mechanism —
  BSData stores a ranged and melee profile of the same physical weapon
  (e.g. "Singing spear", thrown vs melee) as two separate weapon records
  sharing one display name. Confirmed via live data: `farseer`'s two
  "Singing spear" entries are `type: ranged` and `type: melee` respectively,
  same pattern on `howling-banshees`' "Triskele +" and several other units
  across both 40k factions. Fixed by de-duplicating the name list (order-
  preserving `Set`) in `RosterBuilder._summaryText` and
  `RosterView._resolveWeaponNames` only — the profile *table* still shows
  both rows with their distinct ATK/HIT/DMG or RANGE/AP/D values, since
  that's real rules content, not a display bug.
- **"X ops" header is KT vocabulary**: `RosterBuilder._updateHeader`'s
  counter and the builder shell's initial placeholder now read "units" for
  `warhammer-40k`, "ops" for everything else (`_unitNoun()`). Scoped to
  exactly the one counter the brief named — did *not* touch the
  "Operatives" section title, the "No operatives added yet" empty state, or
  RosterView's "12 operatives" line, which say the same KT-flavored word
  for 40k rosters too. Leaving those alone was a scope call, not an
  oversight — flagging here so it doesn't read as inconsistent.
- **Model count not shown on publish/roster view**: turned out `modelCount`
  wasn't persisted to the roster draft at all — `RosterBuilder._doSaveDraft`
  only wrote `instanceId/unitId/unitName/role/points/countsAs/chosenLoadout/
  notes`, and the edit-resume path (`RosterBuilder.render`'s roster-load
  branch) didn't restore it either. It only ever existed transiently in
  builder state and got freshly recomputed inside `_doPublish`'s export
  rebuild. Added `modelCount` to both the save payload and the edit-resume
  restore so it round-trips, then displayed it in `RosterView._buildPage`'s
  operative row (next to role, only when non-null — i.e. only for
  variable-squad-size 40k units; KT and fixed-size 40k units show nothing,
  which is correct, not a gap).

### Section 3 (Amendment 1) — My Rosters view

New `#my-rosters` screen (`MyRosters` module), linked from the home
screen's utility row next to "Clean Drafts". Two sections: **Drafts**
(everything in `rosters/` with `meta.status !== 'published'`) and
**Published** (every entry under `exports/kill-team/` and
`exports/warhammer-40k/`, both systems, merged and sorted by
`publishedAt`). Each row shows name, faction · system, unit/op count (same
`_unitNoun` system-aware wording as the builder header) · points, and the
relevant date. Actions: Drafts get "Open in builder" (→
`#roster/edit/{id}`, the existing route) + Delete; Published get "View"
(→ `#roster/{id}`) + Delete. Both deletes require a `confirm()` step.

**Export-delete safety — verified against actual game-creation code, not
assumed**, per the brief's explicit ask:
- **KT**: `killteam/index.html`'s `createGame`/`joinGame` both call
  `fetchRosterExport` exactly once and bake the result into
  `games-kt/{gameId}/operatives` via `buildOperatives`. Nothing in the
  game after that point re-reads `exports/kill-team/`. The brief's claim
  holds for any game where both players have already joined.
  **One real gap the claim glosses over**: a game sitting in `waiting`
  status (creator joined, second player hasn't yet) still needs the second
  player's export to exist at the moment *they* join — each player's own
  roster is fetched independently (creator's at `createGame`, joiner's at
  `joinGame`), not both at creation. Deleting an export in that narrow
  window would break that join with "Roster not found." Not guarded
  against in this UI (would need a cross-table scan of `games-kt` for
  `players.*.rosterId` matches with `joined: false` before allowing the
  delete) — flagged here rather than built, since it's a narrow window and
  the brief only asked to verify-and-report, not to add guard machinery.
- **40k: the claim doesn't even apply yet.** `warhammer40k/js/roster.js`'s
  `fetchRoster`, called from `js/state.js`'s `createGame`/`joinGame`, reads
  `rosters/{rosterId}` directly — the 40k game app has never been wired to
  `exports/warhammer-40k/` at all (confirmed: zero references to `exports/`
  anywhere in `warhammer40k/`). This matches PROJECT_STATE's queued Roster
  3b Part 3 item ("40k sim reads chosenLoadout... blocked on roster Phase
  3b Part 3"). Net effect: **deleting a 40k export today is currently
  risk-free** (nothing reads it), but **deleting a 40k draft could break a
  pending game** the same way a KT export delete could, since 40k games
  snapshot off the live draft, not the export. The brief only asked for
  export-delete verification and waived draft-delete review ("Deleting a
  draft is just a draft delete") — implemented as asked, but the 40k
  draft/game coupling is worth knowing about before that gets relied on.

**No-auth caveat**, per the amendment: this lists every roster/export in
the database. Noted in-UI (small text at the top of the screen) and here,
not solved — matches the existing precedent for this exact caveat
elsewhere in the app.

**Incidental findings while testing against live data** (not caused by
this session, not fixed, just surfaced by exercising the new view against
real Firebase): three `rosters/` entries under `warhammer-40k` publishes
have `meta: {status: 'published'}` with no other fields (no name/faction) —
harmless for My Rosters since the Published section reads from `exports/`
not `rosters/`, so these resolve fine via their export's own complete
meta. The pre-existing `rosters/undefined` / `exports/kill-team/undefined`
pair from `BUG_40K_PUBLISH_1` is also still present and renders correctly
in the Published list (name "Kommandos Roster 1", 10 ops) — left alone, as
decided when it was first found.

### KT regression

No headless browser available in this environment (same `libasound.so.2`
gap noted in earlier sessions) — verified by code-tracing every changed
function plus running the actual extracted logic (`_sectionedUnitsHTML`'s
grouping/sort, `cleanWeaponName`, the summary de-dupe, `MyRosters.render`'s
data-shape handling) in Node against live Firebase data pulled fresh for
this session (kasrkin, tau-pathfinders, ork-kommandos, void-dancer-troupe,
deathwatch, angels-of-death for the role-value survey; the full live
`rosters`/`exports` trees for the My Rosters simulation). All KT-specific
code paths (`_load`'s KT branch, `_checkMaxed`, `_resolveChosenWeapons`,
publish) are untouched by this brief — the only shared function touched
that KT also exercises is `_renderBrowser`/`_sectionedUnitsHTML`, verified
above to render every KT unit (just one per section). **Not a substitute
for an actual click-through** — flagging honestly, same as prior sessions
in this log.

### Known gaps / not done here
- "Operatives" section title, empty-state text, and RosterView's operative
  count line still say KT vocabulary for 40k rosters (see Section 2 note)
  — scoped out, not missed.
- KT export-delete race window (game in `waiting` status) — not guarded.
- 40k draft-delete could break a pending game the same way; out of this
  brief's asked scope (only export-delete safety was requested).
- `rb-unit-role` CSS class is now dead (role moved to section headers) —
  left in place, not cleaned up.

## ROSTER-UX-2 — Guided flow + destructive-action gating (2026-07-11)

Brief: `briefs/ROSTER_UX_2_BRIEF.md`. Context that changed the stakes: the
site is now publicly hosted via Firebase Hosting against the one shared
database (confirmed via the new root `firebase.json`/`.firebaserc`/
`index.html` landing page) — a non-technical second player uses this
unattended, following a shared link. **Root `CLAUDE.md` and
`PROJECT_STATE.md` still say no live deployment exists anywhere** — that's
now stale, flagging for Nox's next `PROJECT_STATE.md` regeneration; not
edited here (planner-owned file, per the standing domain split).

**Item 1 — guided flow.** Home's action-row used to show two buttons once
a system was picked: "Add Unit to Library" (primary/prominent — a
maintenance action, first thing a new player saw) and "Browse & Build
Roster" (secondary) → `#library/{system}`, the Library screen. Library
conflates two different jobs: browsing/picking a faction to build with,
and editing/deleting the canonical unit library (search, +Add Unit,
per-unit Edit/× buttons). A player just wanting to build a roster had to
navigate a maintenance-tool screen to find the faction's "Build Roster"
link.

Split them. New `FactionPicker` screen (`#faction-pick/{system}`):
faction list only, one prominent "Build Roster" button per faction, no
search/+Add Unit/Edit/Delete. This is now the only button on home's
action-row. **Verified before building, not assumed**: `RosterBuilder`
already has its own unit browser (`_renderBrowser`) — the brief's claim
that "unit browsing for roster-building happens inside the builder as it
already does" held up; nothing needed building there, `FactionPicker`
only had to get the player from "picked a system" to "picked a faction"
in one uncluttered step. `App.goToUnitCreator`/`goToRoster` deleted —
grepped for callers first, found none left after the home HTML changed
(replaced by `goToFactionPick`).

**Item 2 — maintenance gate.** `Maintenance` object: `sessionStorage`-backed
`isUnlocked()`/`gate(label)`, checked against a hardcoded
`MAINTENANCE_PASSPHRASE` constant. Documented as NOT security in three
places per the brief's explicit instruction (the constant's own comment,
inline at the gate call sites, and here) — this app has no auth by
design, this is a misclick barrier for a trusted-link audience, nothing
more. Gated at the **router level**, not just on the buttons that link to
these screens: `MAINTENANCE_SCREENS = new Set(['unit', 'library',
'clean-drafts'])` checked at the top of `Router.render()`, before the
switch — so pasting or typing a hash directly (`#library/kill-team`)
still hits the prompt, not just clicking through the UI normally.
Verified this specifically in testing, not just assumed from reading the
code (see below). New `#maintenance` hub screen (gated on entry too):
system picker into Library, plus a Clean Drafts link — the one explicit
entry point the brief asked for.

**Item 3 — safety rails.** `Library._delete`'s confirm now names the
blast radius: "removes it from the shared unit library for ALL rosters
and future games — not just yours." `MyRosters._deleteExport` gets two
additions: the previously-logged known gap (a game still `waiting` on a
second player needs this export to exist at join time — noted in this
DEVLOG's own "Known gaps" section above, now actually surfaced to the
person about to click Delete) as an explicit warning line, and the
Maintenance gate itself — the one My Rosters action that isn't purely the
user's own draft, unlike `_deleteDraft` which stays ungated per the
brief's explicit exception ("it's the user's own work product, confirm-
dialog is enough").

**Testing (real browser, not code-tracing this time):** headless Chromium
via Playwright worked this session — see `killteam/DEVLOG.md`'s
2026-07-11 entry for how the `libasound.so.2` sandbox blocker got worked
around (`apt-get download` + `dpkg -x` + `LD_LIBRARY_PATH`, no root). Ran
the walkthrough against **live Firebase data** (public rules, no fixture
needed for the read-heavy parts) — but every destructive dialog
(Library delete, export delete) was intercepted and **dismissed, never
accepted**, so confirm-text wording got verified without any canonical
gameData actually being touched by the test. 25/25 checks: fresh-eyes
walkthrough never shows Add Unit/Clean Drafts/Edit/Delete before a built
roster; wrong passphrase rejected with an alert and bounces home; correct
passphrase unlocks the hub and is session-remembered across both a normal
click-through and a direct hash paste; a **fresh, locked session**
attempting `#library/kill-team` directly still gets the prompt (the
router-level-not-just-buttons design decision, confirmed under actual
test rather than taken on faith); both confirm-dialog wording upgrades
present. Test script not committed (one-off, matches this project's
existing testing precedent).

**Not done — explicitly out of scope per the brief:** real auth/accounts,
per-user data, Firebase rules changes, 40k/KT/WHF app changes, visual
redesign beyond moving entries. The KT export-delete `waiting`-status race
window and the 40k draft/game coupling (both logged in this DEVLOG's
"Known gaps" section above) are now at least *visible* to whoever's about
to click Delete, via item 3's warning line, but the underlying gaps
themselves are still unguarded — the brief asked for a warning, not the
cross-table lookup machinery that would actually close them.

**Commits:** `d2c504d`

**Deploy note, per the brief's own "Done when":** this fix protects
nobody until it's actually live — Nox pushes and **redeploys Firebase
Hosting** (manual, not automatic on push).

## ROSTER-VAL — live composition validation + faction data audit (2026-07-14)

Brief: `briefs/ROSTER_VALIDATION_BRIEF.md`. Verify-first turned up that
most of what the brief asks to build already exists — the actual gap was
narrower and further upstream than the brief assumed.

### Phase 0 — what's actually there

**Item 1: `_checkLegality`'s shape.** Already fully built, not a
placeholder — `RosterBuilder._checkLegality()`/`_checkMaxed()` consume
`{ totalOperatives: {min,max}, rules: [{type:'required'|'max'|'unique',
unitRole, count, description, excludeRoles}] }` and were already wired
into save (`meta.isLegal`), publish-blocking, and a live status banner
(`_updateLegalityBanner` → `#rb-legality`, LEGAL green / red bulleted
violation list / gray "Not validated" — **exactly item 2's ask, already
shipped**, presumably from the LEGAL-badge fix the brief itself
references). `_checkMaxed` even pre-emptively disables a unit's +Add
button once a rule would be violated by adding it, rather than only
flagging after the fact. None of this needed building — verified by
reading the code, then confirmed live (see Testing below).

The brief's own proposed rules vocabulary (`{maxOps, leader:{required,
names}, limits:[{name/match,max}]}`) does **not** match what's already
implemented (`unitRole`-keyed `rules[]`, above) — implemented against the
real, already-wired shape rather than redesigning working machinery to
match a brief written before this session confirmed what existed.

**Item 2: AM mystery.** Already resolved and reported in CAT-AUDIT's
session (same day): `gameData/kill-team/factions/astra-militarum` is
leftover manual/test data (wrong schema — no weapons array, `MOVE`/`SAVE`
keys instead of `Move`/`Save`, a Firebase push-id typical of hand-entry),
not a parsed catalogue. Reused that finding here rather than
re-investigating. Real remedy applied this session (see "FactionPicker
filter" below) — the underlying stray Firebase node itself is left
alone, a live delete is Nox's call.

### What was actually missing: composition data never reached the app, three bugs deep

Rules-*checking* existed and worked; rules-*data* never once reached it.
Traced the whole pipeline→Firebase→roster chain for `compositionRules`
and found three independent, compounding bugs, each masking the next:

1. **`extractComposition()`'s per-model-limit role names were never
   role-stripped.** `parse-kt.js` used the selectionEntry's raw BSData
   name ("Shas'Ui Pathfinder") instead of running it through the same
   `deriveRole()` every operative's own `.role` field already goes
   through ("Shas'Ui") — so even if this data had reached the app, every
   single per-role max rule would have silently matched zero operatives
   forever (`op.role === r.unitRole` never true). Also only scanned
   `catalogue.selectionEntries`, missing `sharedSelectionEntries` — the
   exact selectionEntries-vs-shared split CAT-AUDIT's session found for
   weapon extraction, same fix applied here.
2. **`upload.js` read a field that has never existed.** `data
   .compositionRules` — the parser's faction object calls this field
   `composition` (see `parseCat`'s return), not `compositionRules`. This
   line has silently evaluated to `null` since the day it was written,
   for every faction, regardless of what the parser actually derived.
3. **Even fixed, it would have written to the wrong path.** `upload.js`
   wrote to a `composition` key sibling to `info`; `RosterBuilder._load()`
   reads `info.compositionRules` (nested inside `info`). Two independent,
   unrelated bugs stacked on the same feature — neither alone would have
   been enough to fix it.

Fixed all three. Also added: BSData's own "Leader" categoryLink is
filtered out of `keywords` by `SKIP_KEYWORDS` (correctly — it's
structural, not a game rule keyword) but was never captured anywhere
else either, so no automatic "requires a leader" rule could exist.
`parseCat`'s main loop now separately tracks which derived role(s) carry
it (`leaderRoles`), and `extractComposition` turns that into a
`{type:'required', unitRoles:[...], count:1}` rule — `unitRoles` (plural,
array) is new, since real teams sometimes have more than one Leader-
eligible role (Legionaries: Aspiring Champion OR Chosen) and the existing
`unitRole` (singular) rule-matching had no OR-semantics.
`_checkLegality`'s required-rule check extended to accept either
(`unitRole` still works unchanged for the common single-role case).

### Author starter rules — mechanically derived, not hand-authored

**Diverges from the brief's explicit "through the [Maintenance-gated]
tooling (not hand-JSON in Firebase)" instruction — flagging deliberately,
not skipping it.** Once the three bugs above were fixed, `totalOperatives`
and per-role max limits turned out to be **fully, mechanically derivable
from BSData** for real KT teams — nothing needed hand-typing or guessing
against a physical card. Building a new roster-side rules-editing UI
would mean a second way to write into `gameData/kill-team/factions/*/
info` that bypasses the pipeline — directly against this repo's own
standing rule ("No hand-edits to `gameData/` in Firebase, ever.
Corrections go in `data-pipeline/parsers/patches.json`, applied at parse
time"). Authored through the pipeline instead — the sanctioned mechanism
for exactly this — and re-ran `upload.js --only=<the 5 slugs>` (scoped
deliberately; the other 42 factions could get the same derived data for
free, but the brief asks for the 5 Nox actually plays this pass, so the
rest stay `null`/gray, unchanged, until a future session/decision).
**Nothing here was guessed** — every number is read straight from
BSData's own force-composition constraints, verified against known real
2024 team sizes while checking the output (Legionaries 5, Kommandos 9,
Kasrkin 9, Pathfinders 11, Vespid Stingwings 10 — all correct). If Nox
wants a future roster-side override UI for faction-specific quirks the
mechanical derivation can't capture, that's a reasonable follow-up, but
it's a new brief, not silently smuggled into this one.

Derived rules for the 5 factions, live in Firebase
(`gameData/kill-team/factions/{slug}/info.compositionRules`):
- **Legionaries**: 5 operatives exactly; leader = Aspiring Champion OR
  Chosen; no per-role max limits in source.
- **Kommandos**: 9 operatives exactly; leader = Boss Nob; no per-role max.
- **Kasrkin**: 9 operatives exactly; leader = Sergeant; 11 named
  specialist roles each capped at 1.
- **Pathfinders**: 11 operatives exactly; leader = Shas'Ui; 14 roles
  capped (13 at 1, Weapons Expert at 2 — a real, correct asymmetry, not a
  typo).
- **Vespid Stingwings**: 10 operatives exactly; leader = Vespid Strain
  Leader; no per-role max.

### FactionPicker filter (AM remedy, applied)

`FactionPicker.render`'s faction list was `.filter(f => f.count > 0)` —
`astra-militarum`'s one stray unit passed that trivially, exactly
matching Nox's playtest-3 report. CAT-AUDIT's full 47-faction sweep
already confirmed zero genuine parsed factions fall below 4 units, so
`.filter(f => f.count >= 4)` hides only the identified stray entry, not
any real sub-team. Reversible, UI-only — the underlying Firebase node is
untouched, so this isn't a substitute for Nox deciding whether to
actually delete it.

### Testing

Real headless Chromium via `roster/.playwright-libs` (same pattern
established elsewhere in this monorepo), served from the monorepo root
(`/roster/index.html`) against **live Firebase data**, no fixture needed
(read-heavy + the one save/publish path was exercised without actually
publishing). 14 checks, 0 console errors:

- Empty Kommandos roster: red banner reads "Need 9 operatives — have 0" +
  "Requires a Leader", Publish disabled.
- 3 non-leader operatives added: still red, still both violations named
  (with the live count updating: "have 3").
- Filled to exactly 9 including Boss Nob: banner flips to green "Roster
  is legal", Publish enables.
- A 10th unit's +Add button is pre-disabled ("Only 0 slots remaining")
  once at the max — `_checkMaxed` prevents going over, not just flags it
  after — confirmed directly rather than assumed from reading the code.
- Chaos Cult (no compositionRules uploaded this pass, deliberately):
  gray "Not validated — no composition rules for this faction yet",
  Publish NOT blocked (null ≠ false, per the existing AMENDMENT 1
  behavior this session didn't touch).
- FactionPicker faction list confirmed NOT to include "Astra Militarum"
  post-fix, all real factions still present.

This is the brief's own "Done when" acceptance test, run for real: a
deliberately illegal Kommandos roster names every problem, gets fixed,
strip goes green.

### Not done this pass

40k compositionRules — brief explicitly says none this pass ("gray 'not
validated' is correct there until Part 3-era work defines what legal
even means for it"), untouched. The other 42 KT factions' compositionRules
— mechanically derivable via the same pipeline path, deliberately not
uploaded yet (see "Author starter rules" above). A roster-side
compositionRules review/override UI, if wanted later.

Files: `data-pipeline/parsers/parse-kt.js` (`parseCat`'s main loop,
`extractComposition`), `data-pipeline/parsers/upload.js`
(`uploadKtFaction`), `roster/index.html` (`_checkLegality`,
`FactionPicker.render`).

---

## BUG_ROSTER_VAL_FACTIONS — investigated, not reproducible; fail-loud + coverage added (2026-07-16)

Brief: `briefs/BUG_ROSTER_VAL_FACTIONS.md`. Symptom as reported: of the 5
factions ROSTER-VAL authored `compositionRules` for, only Kommandos
showed live validation; the other 4 (Legionaries, Kasrkin, Pathfinders,
Vespid Stingwings) showed none.

**Item 1 — checked Firebase directly.** All 5 factions' real slugs
(`legionary`, `ork-kommandos`, `kasrkin`, `tau-pathfinders`,
`vespid-stingwings` — not the colloquial names in the brief) have
`info.compositionRules` live in Firebase right now, correctly shaped,
matching the Kommandos reference shape exactly (same `rules[]`/
`totalOperatives`/`perModelLimits` structure, `unitRoles` array form for
the Leader rule).

**Item 2/3 — could not reproduce the symptom.** Drove the actual app in
headless Chromium (same pattern as ROSTER-VAL's own testing) against live
Firebase, no fixture:
- Built a fresh roster for all 5 factions from scratch: every one shows
  the correct violation list when empty (`Need N operatives — have 0`,
  `Requires a Leader`) and flips to green `Roster is legal` once filled
  correctly, including a full Legionary build (5 ops, leader included).
- Opened Nox's actual existing roster docs for all 5 factions directly
  (`#roster/edit/{rosterId}`) — every one currently shows a live,
  correctly-computed banner, mostly "Too many operatives" (test debris
  from repeated adds during earlier sessions, not a bug) with specific
  named violations exactly like Kommandos.
- `git log` confirms the compositionRules fix (`30cc15c`, 2026-07-14) has
  been in the repo continuously since ROSTER-VAL landed it, verified live
  the same day; no commit since has touched this path.

**Conclusion: this bug is not currently reproducible against the live
data and current code.** Most likely explanation: the brief's "post-
deploy" observation was made against a local checkout that hadn't pulled
`30cc15c` yet, or a browser tab loaded before that point (there's no
service worker/cache-control in `roster/` that could otherwise explain
persistent staleness — checked). Flagging the divergence per this repo's
verify-first rule rather than re-authoring data that's already correct.
**Nox: if you still see this live, tell me exactly which roster/tab and
whether you'd pulled latest master first** — that'll pin down whether
it's a stale-checkout artifact or something this investigation missed.

**Item 2's fail-loud ask — done regardless of the above**, since it's a
real gap independent of whether the original symptom reproduces:
`uploadKtFaction` (`upload.js`) computed `compositionRules:
data.composition || null` with nothing else downstream ever checking
whether that was meaningful — an operator explicitly requesting
compositionRules for a faction via `--only=<slug>` had no way to know if
the run had actually produced anything. Added a check: when `--only`
names a faction and its extracted `composition.totalOperatives.max` is
absent, `uploadKtFaction` now throws before any write (verified against
real output data: throws for `chaos-cult`, passes for `kasrkin`).

**Item 4 — coverage of the other 42 factions.** Ran the same two
extraction checks (`totalOperatives.max` derivable, at least one
`required`-Leader rule derivable) against all 47 factions' parsed output:
- **42 / 47 have both** — fully auto-authorable today with zero further
  parser work, the same mechanical derivation already used for the 5.
- **2 have a team size but no detected leader** (`strike-force-variel`,
  `warpcoven`) — likely a different BSData leader-designation scheme in
  those catalogues, needs a look before authoring.
- **3 have a leader but no parseable team size** (`chaos-cult`,
  `elucidian-starstriders`, `gellerpox-infected`) — `extractComposition`
  finds no usable `forceEntries`/`Operative` category constraint for
  these; same three factions the new fail-loud check would now catch if
  someone tried `--only`-authoring them today.
- It's most of them, so: this repo agrees with the brief's own
  hypothesis — Nox will likely want the other 42 authored in one pass
  rather than five hand-picked factions. Not done here — a scope
  decision, not something to smuggle into a bug investigation (same
  call ROSTER-VAL made about these same 42, now with an exact number
  attached).

Files: `data-pipeline/parsers/upload.js` (`uploadKtFaction` fail-loud
check). No `roster/index.html` or `parse-kt.js` changes — nothing there
was found broken.

