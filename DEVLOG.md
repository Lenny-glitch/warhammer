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
- Roster Builder (`#roster/new/{system}`) — pick units from library, choose loadouts, track points
- Roster view (`#roster/{rosterId}`) — shareable roster summary
- Kill Team Game App — async 2-player implementation wired to Roster Manager
- Adaptive Equipment rules text entry for Kasrkin Trooper

---
