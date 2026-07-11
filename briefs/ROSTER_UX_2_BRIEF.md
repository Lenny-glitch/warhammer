# ROSTER-UX-2 — Guided Flow + Destructive-Action Gating
CLAIMED: 2026-07-11

## Orientation
Monorepo, roster/. Claim before starting. Context: the site is
now PUBLICLY HOSTED (Firebase Hosting) against the one shared
database — a non-technical second player will use it unattended.
The goal: a new user is funneled into building/choosing a
roster and cannot stumble into anything destructive.

## 1 — Guided player flow
After picking a game system, the primary path is:
  pick faction → BUILD ROSTER (prominent) → builder
and a MY ROSTERS entry for opening existing drafts/published
lists. The LIBRARY unit listing stops being the default landing:
unit browsing for roster-building happens inside the builder
(as it already does); the library-as-editor is maintenance, not
a player screen.

## 2 — Maintenance mode gate
All destructive/curation tooling moves behind a single explicit
gate: Unit Creator (+ Add Unit, edit, delete — this edits
CANONICAL gameData and is the highest-risk surface in the app),
Clean Drafts, and export deletion in My Rosters.
Gate mechanism: simple and honest for a no-auth app — a
"Maintenance" entry that prompts for a passphrase checked
client-side against a constant, remembered for the session.
This is NOT security (nothing here is, by design); it is a
misclick barrier for a trusted-link audience. State exactly that
in a code comment and the DEVLOG so nobody later mistakes it
for auth. Draft deletion in My Rosters stays ungated (it's the
user's own work product, confirm-dialog is enough).

## 3 — Small safety rails regardless of gate
- Unit Creator delete: confirm dialog must name the blast radius
  ("removes this unit from the shared library for ALL rosters
  and future games").
- My Rosters export delete: add the "may be referenced by a game
  awaiting player 2" warning line (known gap, previously logged).

## Out of scope
Real auth/accounts, per-user data, Firebase rules changes,
40k/KT/WHF app changes, any visual redesign beyond moving
entries. Keep it small — this is a funnel-and-gate pass.

## Done when
- Fresh-eyes walkthrough: from the landing page, a new user
  reaches a built roster without ever seeing edit/delete/Add
  Unit/Clean Drafts
- Maintenance gate works, session-remembered, documented as a
  misclick barrier not security
- Both confirm-dialog upgrades in
- DEVLOG, hashes, Nox pushes AND redeploys hosting (deploy is
  manual now — a fix that isn't deployed protects nobody)
