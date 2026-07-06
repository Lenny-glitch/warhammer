# KT-RS — Roster Selection at Game Creation

CLAIMED: 2026-07-05

## Orientation
Monorepo, killteam/. This is now the critical path: BON-2b's
acceptance and all real play are blocked on it — KT games
currently run only on two hardcoded dev rosters whose unitIds
predate the current pipeline (2b report, flag 3). A real KT
export exists to test against (Nox published a Legionary force;
exports/kill-team/ also holds older entries of unknown vintage).

## Scope
1. Game creation: each player slot picks from a list of
   exports/kill-team entries — show name, faction, op count,
   published date. Newest first.
2. The chosen export feeds the existing buildOperatives path
   (which preserves bonuses arrays post-2a). No new data shapes:
   the export is already denormalized and is the contract.
3. Snapshot semantics unchanged: game doc carries full operative
   data + bonus catalog at creation, as today. Deleting an
   export later must not affect a created game — verify this
   falls out of the existing denormalization rather than
   assuming it (old exports in exports/kill-team may predate
   fields the builder expects; handle missing fields gracefully
   and report what old exports lack).
4. ?dev=true works identically with picked rosters.
5. Hardcoded dev rosters: keep them as clearly-labeled "Demo"
   entries at the bottom of the picker IF trivial, else delete
   them — their unitIds are dead anyway. Your call, state it.

## Out of scope
40k game app, roster app changes, any new Firebase paths,
lobby/matchmaking anything — this is a picker, not a lobby.

## Done when
- New game created with the Legionary export from the picker;
  operatives match the published roster
- A shoot in that game shows weapon bonuses in the ?dev=true
  readout (this simultaneously completes BON-2b acceptance —
  Legionary weapons carry mapped keywords)
- Old existing games unaffected
- DEVLOG; commits cited; Nox pushes
