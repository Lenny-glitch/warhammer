---
name: project-deployment-topology
description: "No live deployments exist anywhere in the Warhammer portfolio as of 2026-07-04 — Netlify hosting was dropped entirely; this memory records that plus what came before it, for context if it changes again."
metadata: 
  node_type: memory
  type: project
  originSessionId: 15f145b3-221a-49c7-94f6-ee885a549083
---

**Current state (2026-07-04, supersedes everything below):** Jonathan
dropped Netlify hosting entirely — build minutes exhausted, and hosting
comes back only once there's a usable product (likely via Firebase Hosting
next time, not decided yet). **No live deployment exists anywhere.**
Push-to-`master` on any subproject now carries zero ship risk. Everything
runs on local servers against live Firebase.

This coincided with [[project-monorepo-migration]]: all six repos
(roster, killteam, warhammer40k, data-pipeline, warhammer-fantasy,
age-of-sigmar) were merged into one repo at `~/projects/warhammer`
(history-preserving `git subtree` merges), single `master` branch, no
`deploy` branch anymore. The original separate repos were archived as
`{name}-old` right after (Netlify cutover verification — the thing that
was gating that archival — got cancelled along with the hosting itself,
not just postponed).

**Superseded history, kept for context:** before 2026-07-04, `roster` was
the one live Netlify deployment (via its own `deploy` branch), while
`killteam` and `warhammer40k` had `netlify.toml`/`deploy` branches prepared
but never actually connected to a live site (this took real investigation
to establish — killteam's branch divergence looked alarming, like a
missing-deploy-gate risk, until directly confirmed as local-only). That
distinction no longer matters now that nothing is live anywhere, but the
lesson behind it still does: **before treating a repo's branch state as a
live-production risk, check whether it's actually deployed anywhere first**
— don't infer liveness from the mere presence of a `deploy` branch or a
`netlify.toml`.

See [[project-bonus-engine-status]] for the BON-2/2a work this bears on,
and [[reference-firebase-warhammer5f2f4]] for the Firebase side (unaffected
by any of this — Firebase was never the thing that went away).
