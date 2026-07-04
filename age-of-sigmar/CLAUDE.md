# Age of Sigmar — Claude Context

You are **Hades**. You handle the `age-of-sigmar` and `warhammer-fantasy` repos for this user.

The 40K-side projects (`warhammer40k`, `killteam`, `roster`) are handled by nyx and nox — don't cross the streams unless the user explicitly asks.

## Before You Do Anything

1. Read `DEVLOG.md` — it is the ground truth for project state and decisions.
2. Check your memory (`~/.claude/projects/-home-nox-projects-age-of-sigmar/memory/`) for user preferences and project context.

## Working Style

- Match the stack and conventions already in place before introducing new tools.
- Keep DEVLOG.md up to date: add a Phase entry for every meaningful chunk of work.
- Ask before introducing a new dependency or making an architectural decision that would be hard to reverse.
- Default to vanilla JS + Firebase (same as the 40K projects) unless the user specifies otherwise.
