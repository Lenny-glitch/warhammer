# KT-RANGE-AUDIT — Find KT weapons that RAW should have a stated range but show unlimited

CLAIMED: 2026-07-18

## Orientation
Monorepo, ~/projects/warhammer, branch master. CLAIM FIRST.
Data-pipeline / gameData reads. Stay out of the game subprojects.
You cannot push — commit, cite hashes, Nox pushes.
VERIFY-FIRST: check claims against real source and RAW, report
divergence.

## Background — the earlier framing was WRONG, read this
A prior lane (02ddec1) found 459 of 874 KT ranged weapons have no
range in source and flagged it as a bug. THAT FRAMING IS
INCORRECT and a range-defaults fix was NOT shipped — Nox caught
it first.

Kill Team 2024 RAW: MOST ranged weapons have NO range limit at
all. The killzone is small (~22"x30") and GW simply doesn't cap
most guns — if you have line of sight and meet the weapon's
rules, you can shoot. Range is not a stat on most KT weapons.
So the rng-null sentinel rendering those weapons as unlimited (∞)
is CORRECT, not a bug. Do NOT assign archetype default ranges.
Do NOT touch the 459 as a group. That whole idea is dead.

## What's actually being asked
The real question is small: are there KT weapons that RAW DO have
a specific stated range (not uncapped), which the app is
currently showing as ∞ because the range didn't make it into the
data? Those — and ONLY those — are real bugs.

Expectation: this set is SMALL, possibly ZERO. A "nothing is
broken, the ∞ is correct" result is a completely valid and
welcome outcome. Do not manufacture fixes to have something to
fix.

## Item 1 — Identify weapons that RAW have a stated range
Go find, from source (BSData XML) and/or KT2024 rules knowledge,
which KT ranged weapons actually have a SPECIFIC range value in
the real game (e.g. a weapon whose profile states a numeric range
or a range-limiting keyword), as opposed to the uncapped default.

Method notes:
- The prior audit already produced the full list of no-range
  weapons in data-pipeline/DEVLOG.md — start there, that's your
  candidate pool.
- For each candidate, the question is: does this weapon RAW have
  a stated/limited range, or is it correctly uncapped? Most will
  be correctly uncapped.
- Watch for range-limiting KEYWORDS, not just a numeric range
  field — some KT weapons cap range via a special rule/keyword
  rather than a stat. If the app ignores such a keyword, that's
  the kind of real bug worth finding.
- PSYCHIC / intentionally-unlimited weapons: leave alone, they're
  correct ∞ by canon.

Report the list of genuine "should-have-a-range-but-shows-∞"
weapons. If it's empty, say so plainly and stop — that's a pass.

## Item 2 — Fix ONLY the confirmed-real ones
For each weapon confirmed to RAW have a stated range that the app
is missing:
- Fix via data-pipeline/parsers/patches.json (the ONLY home for
  corrections; no hand-edits to gameData/ ever; patches.json
  fails loud on no-match).
- Use the weapon's ACTUAL RAW range, sourced — do NOT invent a
  number. If you can't source a real value for a weapon you
  believe should be capped, report it as "suspected but
  unsourced" and DON'T patch it. Nox's standing rule: no invented
  data.

## Item 3 — Upload path (only if anything was patched)
If item 2 patched anything, give Nox a NUMBERED CHECKLIST to
re-upload (upload command, the global --force caveat), pass/fail.
Snapshot rule: existing games freeze their catalog, so only new
games pick up changes — mention it so Nox isn't surprised.
If nothing was patched, no upload needed — say so.

## Out of scope
- Archetype default ranges (rejected — wrong for KT).
- The rng-null sentinel (correct, don't touch).
- 40k range (separate data pool entirely; not this brief).
- Any engine/UI change — data only.

## Done when
Commit(s) if any, hashes cited, plus a report:
1. How you determined which KT weapons RAW have a stated range.
2. The list of genuine bugs found (weapon, correct range, source)
   — or a clear "none found, the ∞ is correct" if that's the
   answer.
3. What you patched (if anything) and the upload checklist, or a
   statement that no change was needed.
