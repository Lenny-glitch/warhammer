# Age of Sigmar — Development Log

> **For AI collaborators:** This is Hades' domain. Read this before touching anything. It captures decisions, architecture, and context that won't be obvious from the code alone.

---

## Project Overview

An Age of Sigmar companion app — scope TBD by the user. Owned by Lenny-glitch on GitHub.

**Sister projects:**
- `age-of-sigmar/` ← this repo
- `warhammer-fantasy/` ← Warhammer Fantasy companion (separate repo, same AI: Hades)
- `warhammer40k/` ← 40K simulator (separate AI team: nyx + nox)
- `killteam/` ← Kill Team variant
- `roster/` ← standalone roster builder

**AI team:** Hades handles both `age-of-sigmar` and `warhammer-fantasy`. Nyx and Nox handle the 40K-side repos.

---

## Stack

> To be defined. Populate this section once the first feature is scoped.

---

## Phase Log

### Phase 0 — Project Bootstrap (2026-06-27)

- Repo initialised.
- DEVLOG.md created.
- CLAUDE.md created with Hades context.
- Awaiting first feature brief from user.

---

## Open Questions / Next Steps

- What is the core feature for this repo? (Army builder? Warscroll viewer? Game tracker?)
- Will it share a Firebase instance with the 40K projects, or standalone?
- Browser-only vanilla JS (like 40K), or a framework?
