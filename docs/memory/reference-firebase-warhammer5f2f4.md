---
name: reference-firebase-warhammer5f2f4
description: "Where the shared Firebase project's config, auth model, and rules live, and hard constraints discovered about it (no admin creds, no app auth, console-only rules)."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 15f145b3-221a-49c7-94f6-ee885a549083
---

All Warhammer portfolio apps share one Firebase RTDB project,
**`warhammer-5f2f4`** (`https://warhammer-5f2f4-default-rtdb.firebaseio.com`).

- **Client config** lives at `roster/firebase-config.js` (apiKey,
  authDomain, databaseURL, etc.) — `data-pipeline/parsers/upload.js` reads
  the `databaseURL` out of that file at runtime rather than hardcoding it.
- **No admin/service-account credentials exist anywhere on this machine**
  for this project (confirmed via full-filesystem search) — the only
  service-account JSON found belongs to an unrelated project
  (`scope-rpg`). Anything requiring elevated Firebase access (deploying
  rules, admin SDK reads) cannot be done from a script here; it has to
  happen through the Firebase console directly.
- **No app in this portfolio authenticates at all** — checked
  `roster/index.html`'s `App.init()`: it calls `firebase.initializeApp()`
  then `firebase.database()` directly, no `firebase.auth()`,
  `signInAnonymously()`, or `onAuthStateChanged` anywhere. Every app relies
  entirely on RTDB security rules granting public read/write on the paths
  it touches.
- **Rules are never version-controlled** — no `.rules.json`/`database.rules`/
  `firebaserc` has ever existed in any repo's git history. They live
  exclusively in the Firebase console. As of 2026-07-04 the rule shape is:
  `games/$gameId`, `games-kt/$gameId`, `gameData`, `rosterSchemas`,
  `exports` all fully open (`.read`/`.write: true`); `rosters` has
  `.read: true` at the parent (needed for whole-collection reads like the
  Draft Cleaner) plus `.read`/`.write: true` on `$rosterId` children. That
  parent-level `rosters` read was *missing* until Jonathan added it
  2026-07-04 — before that, individual roster reads worked but
  `ref('rosters').once('value')` (parent enumeration) was permission-denied
  for everyone, app included, not just scripts.
- **Firebase CLI isn't installed/configured** on this machine either — no
  way to `firebase deploy --only database` from here.

Net effect: read-only investigation via public REST (`{path}.json`) works
for anything the current rules leave open, but any rules change has to be
made by Jonathan in the console — flag this immediately rather than
attempting workarounds when something reads as permission-denied.
