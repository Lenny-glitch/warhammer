---
name: project-deployment-topology
description: Which repos in the Warhammer portfolio are actually live on Netlify vs run locally only — matters for whether a branch push is safe to make without a deploy gate.
metadata: 
  node_type: memory
  type: project
  originSessionId: 15f145b3-221a-49c7-94f6-ee885a549083
---

Confirmed directly by Jonathan (2026-07-04):

- **`roster`** — live on Netlify, ships from the `deploy` branch. Convention:
  `master` = dev work, merging `master` → `deploy` is the deliberate "ship"
  action. `deploy` is currently a strict superset of `master` (kept that
  way as of the 2026-07-04 fast-forward + `feat/killteam-phase2` cleanup).
- **`killteam`** — **local only, not deployed anywhere.** It has a `deploy`
  branch with `netlify.toml`/`build.sh` prepared back on 2026-06-26 (see
  its DEVLOG's "Deploy branch" entry) as hosting *prep*, but that
  connection was never activated — there's no live audience. `master` and
  `deploy` have genuinely diverged (13 feature commits sit on `master`
  that `deploy` lacks; `deploy` only has 2 Netlify-plumbing commits) but
  this is *not* a live-production risk the way it would be for roster,
  since nothing is actually being served from either branch.
- **`warhammer40k`** — has `netlify.toml`, `deploy` is a near-superset of
  `master`. Per its own DEVLOG ("Phase 16 complete + Netlify deploy"),
  this one does appear to be actually live — treat pushes here with the
  same care as roster, not the same laxity as killteam.

**Why this matters:** before any branch reconciliation or "does this need
a deploy gate" question, check whether the target repo is actually live
first — killteam's branch divergence looked alarming (same shape as a
missing-deploy-gate risk) until Jonathan clarified it's local-only, which
changes the answer from "pause and add a gate" to "no urgency."

See [[project-bonus-engine-status]] for the BON-2/2a work this bears on.
