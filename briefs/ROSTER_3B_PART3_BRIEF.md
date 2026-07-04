# Roster 3b Part 3 — 40k Sim Reads chosenLoadout (retires KL-1/KL-2)

## Orientation
Repo: ~/projects/warhammer40k, branch master. Read-only reference:
roster repo (export shape just shipped in Part 2), data-pipeline
docs. Out of scope: roster changes, killteam/, bonuses (BON-4).

## Context
Part 2 is live: 40k exports now carry chosenLoadout (verified in
production — a published Eldar roster shows the chosen Mirrorswords
surviving to the export). The sim currently ignores loadout:
KL-1 (melee weapon picked by array index) and KL-2 (vehicles fire
every datasheet weapon) have been open since Phase 16. This brief
retires both.

## Verify first (report if divergent, as usual)
1. How the sim imports a roster today: which exports/ shape it
   reads, where weapons get attached to units.
2. Where KL-1 and KL-2 actually live in code (the index-pick and
   the fire-everything paths).
3. The real shape of chosenLoadout in a fresh Part 2 export —
   read one from Firebase (the published Eldar roster exists);
   build against what's there, not what this brief assumes.

## Scope
1. When an imported unit carries chosenLoadout: the unit is armed
   with exactly the chosen weapons (plus its fixed/default
   equipment as the export defines it) — nothing else.
2. Shooting uses only equipped ranged weapons (KL-2 dies).
3. Melee weapon selected from equipped melee weapons by role, not
   index (KL-1 dies). If multiple melee weapons are equipped,
   simplest correct rule: the player picks at fight time if the
   UI supports it, else best-profile default — state which you
   implemented and why.
4. Backwards compatibility: exports WITHOUT chosenLoadout (all KT
   exports, any pre-Part-2 40k export) behave exactly as today.
   No migration, no errors.
5. Squad size: if the export carries model count, unit size in
   the sim respects it. If it doesn't carry it, REPORT that gap —
   don't invent a count. (Publish view currently doesn't display
   size; unknown whether the export stores it.)

## Git flow
master, commit per milestone, push before reporting, cite hashes.

## Done when
- A game created from the live Part 2 Eldar export: Banshees are
  armed with Mirrorswords (the actual published choice), not the
  default blade; no phantom weapons on any unit
- One unit without chosenLoadout in the same game behaves as today
- KL-1 and KL-2 marked retired in warhammer40k/DEVLOG.md with
  commit refs
- Verified-vs-assumed report
