# Roster Phase 3b Part 2 — 40k Build Flow

## Orientation
Repo: ~/projects/roster, branch master (post-consolidation —
verify master == deploy tip before starting; if the fast-forward
didn't happen, stop and say so). Read-only reference:
~/projects/data-pipeline (parsed output shape, mapping-review).
Out of scope: killteam/ (BON-2a runs there — do not touch),
warhammer40k/ (Part 3's repo, not yours yet), pipeline changes.
Ship rule for this repo: work lands on master; merging to deploy
is Nox's ship action — do NOT push deploy.

## Context
KT roster flow is complete. 40k has unit search + lazy migration
(Part 1) but no build flow: no way to assemble, point-cost,
loadout, and publish a 40k army. Part 2 builds that. Part 3
(separate brief, warhammer40k repo) makes the sim read the
published chosenLoadout — which retires KL-1 and KL-2.

## Phase 0 — Verify the data shape (before any UI work)
Part 1 was written against scraper-shaped data. Firebase now
holds BSData-pipeline data (astra-militarum, craftworlds-eldar
under gameData/warhammer-40k/). Before building, pull both
factions and report the actual shape of:
- points: flat value? pointsTable by squad size? where does
  _pointsNote live and what does it say?
- loadout structure: what does the parsed weapon/wargear data
  actually offer for "choosable" options vs fixed equipment —
  is there a loadoutSlots concept in the BSData output, or does
  Part 2 need to derive choices from weapon lists?
- squad sizing: min/max model counts — present? per-unit?
- weapons' bonuses arrays: present on 40k units? (They should
  be, post-BON-1c.)
- the 4 known Eldar gaps (_known_gaps.txt) — confirm they fail
  gracefully in the build flow, not crash it
Report the shape FIRST if it materially diverges from what the
existing Part 1 code assumes — a schema mismatch here changes
the design, and I'd rather revise the brief than have you guess.

## Part 2 scope (assuming shape verification passes)
1. Build flow for 40k rosters, mirroring the KT flow's UX where
   it fits: add unit → set squad size (if variable) → points
   update live from the actual points data → choose loadout per
   choosable slot → chosenLoadout stored on the roster unit in
   the same field shape the KT flow uses (the sim contract).
2. Points: total at roster level, per-unit breakdown visible.
   _pointsNote surfaces as a visible annotation wherever it
   exists — it exists because base points needed a caveat; don't
   hide it.
3. Publish: denormalized export to exports/, same pattern as KT —
   the export carries everything a game needs with no join-backs:
   full unit stats, chosen weapons with their complete profiles
   INCLUDING bonuses arrays (BON-2's killteam finding was that
   pre-BSData exports lack bonuses — 40k exports must not repeat
   that; this is what BON-4 will read).
4. countsAs: if any 40k unit carries it (patches may add some
   later), roster size math respects it — the KT flow already
   does this; reuse, don't reimplement.
5. Draft persistence same as KT (rosters/, existing rules cover
   writes).

## Explicitly out of scope
- Sim integration (Part 3, warhammer40k repo)
- Detachments, enhancements, army rules — units, points,
  loadouts only. If BSData output contains detachment data,
  note its existence in the report and leave it.
- KT flow changes of any kind
- New Firebase rules or paths

## Done when
- Phase 0 shape report delivered (even if everything matches)
- An Astra Militarum roster built end-to-end in the UI: multiple
  units, at least one variable-size squad, at least one loadout
  choice made, live points
- Published; export verified to contain chosenLoadout and
  weapons' bonuses arrays
- One Eldar unit with a known gap added to a roster without
  crashing (graceful degradation shown)
- DEVLOG updated; report verified-vs-assumed as usual
