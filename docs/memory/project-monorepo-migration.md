---
name: project-monorepo-migration
description: "All six Warhammer subprojects now live in one repo at ~/projects/warhammer (GIT-2, 2026-07-04) — the old separate repos still exist on disk as *-old but are archived, never pushed anywhere."
metadata: 
  node_type: memory
  type: project
  originSessionId: 15f145b3-221a-49c7-94f6-ee885a549083
---

**As of 2026-07-04, the six separate repos no longer exist at their old
paths.** `~/projects/roster`, `killteam`, `warhammer40k`, `data-pipeline`,
`warhammer-fantasy`, `age-of-sigmar` were subtree-merged (history
preserved, verified via `merge-base --is-ancestor` on a pre-migration
commit) into **`~/projects/warhammer`** as subdirectories of the same
name, single `master` branch. The originals were renamed `{name}-old`
right after and are archived — don't develop against them, don't push them
anywhere (see the token note below for a concrete reason why not).

**Layout inside the monorepo:**
- `PROJECT_STATE.md`, `CLAUDE.md`, `briefs/` (flat, all subprojects'
  briefs merged in), `docs/memory/` (a copy of this same memory system,
  since the repo is supposed to be the durable source of truth — but this
  local `~/.claude/.../memory/` copy is still what the harness actually
  auto-loads at session start; the two are meant to be kept in sync
  manually, not the same file).
- `shared/bonus-resolver.js` — moved here from `data-pipeline/shared/`,
  now a single real file every subproject can reference directly
  (`../shared/bonus-resolver.js`) instead of hand-copied vendored
  duplicates. The old vendoring pattern and its drift-checker
  (`check-resolver-sync.js`) were deleted as part of this move.
- Each subproject keeps its own `DEVLOG.md` in place.

**A real bug from the migration, since fixed:** anything with a hardcoded
absolute path assuming the old separate-repos layout broke silently.
Concretely, `data-pipeline/parsers/upload.js` read its Firebase config from
a hardcoded `$HOME/projects/roster/firebase-config.js` — fixed to a
sibling-relative path. If something in a subproject references another
subproject by an absolute `$HOME/projects/<name>` path, it's almost
certainly another instance of this same bug — check it before assuming
it's fine.

**`firebase-config.js` did NOT come across automatically.** It was
gitignored in every subproject (correctly — real credentials), so the
subtree merge (which only carries git-tracked history) never brought the
actual files into the monorepo. They had to be manually copied over from
the archived `*-old` directories after the fact. `warhammer-fantasy` never
had one in the first place (that subproject barely started).

**A GitHub PAT leaked into `warhammer40k`'s pre-migration history**
(`package.json`'s `repository.url` field, npm metadata only — nothing
actually depended on it functionally) and got carried into the monorepo's
merged history too, triggering GitHub's push protection (GH013). Purged
via `git filter-repo --replace-text` across all refs, verified exhaustively
(every blob object individually checked, not just a history grep). The
token itself turned out to also be the live git-remote credential for
every one of these repos' `origin` URLs — a second, more actively dangerous
instance of the same underlying mistake (a live secret embedded directly
in a URL/config file rather than kept out of anything committed or
persisted in plain text). If a fresh credential is ever added for pushing,
don't repeat that pattern — use a credential helper or a one-time prompt,
not an embedded token in a remote URL.

See [[project-deployment-topology]] for why the old Netlify-cutover gate
on archiving `*-old` got cancelled rather than fulfilled, and
[[feedback-verify-briefs-against-source]] for the general pattern this
whole migration kept surfacing (stale paths, lost edits from a failed
multi-path `git add`, etc.) — verification work didn't stop being useful
just because the task shifted from "implement a feature" to "reorganize
the repos."
