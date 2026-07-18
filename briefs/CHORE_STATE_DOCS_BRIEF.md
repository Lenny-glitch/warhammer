# CHORE — Land v6 state, CLAUDE.md canon, file rename

CLAIMED: 2026-07-18

## Orientation
Monorepo, ~/projects/warhammer, branch master. CLAIM FIRST.
This is a docs/git chore — NO app code, NO gameData, NO parsers.
If you find yourself editing anything under killteam/,
warhammer40k/, or data-pipeline/, STOP — you're off scope.
You cannot push. Commit, cite hashes, Nox pushes.

Two source files are in Nox's uploads for this task:
  PROJECT_STATE_v6.md
  CLAUDE_ADDITIONS.md
Nox will place them where you can reach them (repo root, or he'll
tell you the path). Confirm you can see both before starting; if
you can't, ask — do not reconstruct them from memory.

## What this does
Replaces the stale project state file, folds three hard-won
mobile/pointer rules into CLAUDE.md, and renames the state file
so its name tracks its version. Nothing functional changes.

## Item 1 — Replace the state file
- The current on-disk state file is named PROJECT_STATE_3.md (the
  "3" means nothing to Nox — it's an artifact of an old download).
  Its internal header says v5.
- PROJECT_STATE_v6.md is the new content, already written.
- Do: remove the old file, add the new one under the name
  PROJECT_STATE.md (drop the version from the FILENAME — the
  version lives in the file's header line, currently "v6").

  git rm PROJECT_STATE_3.md
  # place PROJECT_STATE_v6.md's content at PROJECT_STATE.md
  git add PROJECT_STATE.md

- VERIFY the header line inside still reads "# PROJECT_STATE.md —
  v6, 2026-07-18. Monorepo root." after the move. The filename is
  version-less; the header carries the version. Report if that's
  confusing and you'd do it differently — Nox's call, not yours to
  silently change.

## Item 2 — Fold canon into CLAUDE.md
CLAUDE_ADDITIONS.md is a paste-in block. Merge its contents into
CLAUDE.md:
- If CLAUDE.md has a "gotchas" / "hard-won rules" / "canon"
  section, append the block's subsections there.
- If not, add a clearly-headed section for them.
- Do NOT duplicate anything already present — if CLAUDE.md already
  states one of these rules, don't add a second copy; note the
  overlap in your report instead.
- The block covers: touch-action must be permanent CSS; don't
  preventDefault on pointerdown (breaks tap-to-place); replace-
  don't-add pointer listeners; viewBox not CSS transforms for
  pan/zoom; the 3 map sizes + flat 1-square-=-2" grid; and the
  40k End-Phase-below-the-fold papercut.
- After merging, DELETE CLAUDE_ADDITIONS.md (it's scaffolding, not
  a keeper): git rm CLAUDE_ADDITIONS.md

## Item 3 — gitignore the deploy artifact
.firebase/hosting..cache keeps showing up staged/modified — it's
a deploy artifact. Add a line to .gitignore:

  .firebase/

If .firebase/ files are already tracked, untrack them without
deleting from disk:

  git rm -r --cached .firebase/

Report whether anything was tracked.

## Do NOT
- Touch any app code, gameData, or parsers.
- "Improve" the state file's content — it's already reviewed.
  Fix a literal typo if you spot one, but flag it, don't rewrite.
- Push. Nox pushes.

## Done when
One commit (or a few), hashes cited, plus a short report:
1. Confirm PROJECT_STATE.md exists, PROJECT_STATE_3.md is gone,
   and the internal header still reads v6.
2. Where in CLAUDE.md the canon block landed, and any overlaps
   you found + skipped.
3. Confirm CLAUDE_ADDITIONS.md is deleted.
4. Whether .firebase/ was already tracked, and that it's now
   ignored.
5. `git status` clean at the end (nothing stray staged).
