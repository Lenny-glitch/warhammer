# Warhammer

Monorepo for Jonathan's Warhammer companion-app portfolio. See
`PROJECT_STATE.md` for current status and `briefs/` for the work-brief
history. See `CLAUDE.md` for how a fresh session should orient itself.

## Layout
- `roster/` — standalone roster builder (Netlify-deployed, live)
- `killteam/` — Kill Team game app (local only)
- `warhammer40k/` — 40k game app (local only)
- `data-pipeline/` — BSData→Firebase parser, shared bonus engine
- `warhammer-fantasy/` — Warhammer Fantasy companion app
- `age-of-sigmar/` — Age of Sigmar companion app
- `shared/` — code shared across subprojects (currently just the bonus resolver)
