# 40K-P3 — Roster Picker + Sim Reads chosenLoadout (retires KL-1/KL-2)
# CLAIMED: 2026-07-14

## Orientation
Monorepo, warhammer40k/. Claim first. Supersedes the old
ROSTER_3B_PART3_BRIEF.md (pre-monorepo paths). Read-only
reference: roster/ (export shape), killteam/ (KT-RS picker is
the pattern to copy).
CONTEXT: Nox's brother wants game 5 in 40k. Today the lobby has
a raw "Roster ID" text field — pasting a roster URL produces
"child failed: path argument was an invalid path" because it
concatenates the whole URL into a Firebase path. And even a
valid ID wouldn't matter: the sim ignores chosenLoadout
entirely. Both must land for a real game.

## 1 — Lobby roster picker (copy KT-RS)
Replace the free-text Roster ID field with a picker over
exports/warhammer-40k entries — name, faction, points, unit
count, published date, newest first. Same shape as killteam's
lobby picker; read that implementation first, don't reinvent.
Keep accepting a pasted ID/URL as a fallback if trivial (strip
to the trailing ID), but the picker is the path.
Both player slots. Verify against Nox's live published Eldar
export.

## 2 — Sim reads chosenLoadout (the KL-1/KL-2 retirement)
Verify first, report divergence:
- how the sim imports a roster today, where weapons attach
- where KL-1 (melee weapon by array index) and KL-2 (vehicles
  fire every datasheet weapon) actually live
- the real shape of chosenLoadout + modelCount in a live
  Part 2 export (read one from Firebase — don't trust this
  brief's description)
Then:
- unit carries EXACTLY its chosen weapons + fixed equipment
- shooting uses only equipped ranged weapons (KL-2 dies)
- melee weapon by role, not index (KL-1 dies). Multiple melee
  equipped: player picks at fight time if the UI supports it,
  else best-profile default — state which you did and why
- modelCount respected for squad size if present
- exports WITHOUT chosenLoadout (old ones) behave as today,
  no errors, no migration

## Out of scope
New 40k factions (data question, separate investigation), bonus
integration (BON-4), roster app changes, KT anything.

## Done when
- Game created from Nox's published Eldar export via the picker;
  Banshees are armed with the ACTUAL published choice
  (Mirrorswords), no phantom weapons on any unit
- A unit without chosenLoadout still plays as today
- KL-1 and KL-2 marked retired in warhammer40k/DEVLOG.md with
  commit refs
- DEVLOG, hashes; Nox pushes + redeploys; brother game 5 is the
  real acceptance
