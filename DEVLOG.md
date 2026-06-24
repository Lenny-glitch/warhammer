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
