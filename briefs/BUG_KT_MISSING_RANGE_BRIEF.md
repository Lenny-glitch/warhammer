# BUG-KT-MISSING-RANGE — Weapons missing rng that shouldn't be

CLAIMED: 2026-07-18

## Orientation
Monorepo, ~/projects/warhammer, branch master. CLAIM FIRST.
Data-pipeline + gameData work. A parallel session owns
warhammer40k/ (MOBILE-2 pan/zoom) — stay out of it.
You cannot push. Commit, cite hashes, Nox pushes.
VERIFY-FIRST: planner has no repo access. Every claim below is
from PROJECT_STATE.md v5 and a prior session's report. Check
against real source; report divergence rather than building on
a wrong premise. The planner has been wrong repeatedly today.

## The setup — read this before touching anything
DATA CANON: `rng` null/absent = UNLIMITED range. Engine-wide
sentinel. Firebase drops null keys, so an absent key IS the
sentinel. BUG_KT_UNLIMITED_RANGE.md (claimed 2026-07-11) made
the shoot flow honor it, so PSYCHIC weapons with no rng
(Fireblast, Life siphon, etc.) are shootable at unlimited range.
That is CORRECT and INTENTIONAL. DO NOT CHANGE THE SENTINEL.
Changing it re-breaks every psychic weapon in every faction.

THE PROBLEM: the sentinel cannot distinguish two cases.
  (a) PSYCHIC weapon, no rng  -> intentional, truly unlimited
  (b) Nemesis Claw / Night Lords ranged weapons, no rng -> a
      REAL DATA GAP (PROJECT_STATE v5, KNOWN REAL BUGS). These
      are ordinary guns that should have a range and instead
      render as unlimited.
Both look identical to the engine. So a legitimate sentinel is
silently swallowing a data bug. The fix is in the DATA, not the
engine.

## Item 1 — INVESTIGATE FIRST. Do not fix anything yet.
Nobody knows the root cause and the planner's first instinct
("just patch it") was probably wrong. Two possibilities:
  (a) PARSER GAP — the range IS in the BSData XML and our parser
      isn't extracting it. Then this is NOT a Nemesis Claw bug,
      it's a bug in every faction with the same weapon shape,
      and patching one faction leaves the rest broken. The
      catalogue audit already found this exact class of thing:
      missing glyphs, unresolved entryLinks, cross-catalogue
      GUID references.
  (b) SOURCE GAP — the range genuinely isn't in BSData. Then
      patches.json is the right home.

Find out which. Go read the actual BSData XML for the Nemesis
Claw / Night Lords weapons in question and compare against what
landed in gameData.

## Item 2 — Audit the whole catalogue with the free diagnostic
Because PSYCHIC is the legitimate absent-rng case, this rule
falls out:

  A RANGED weapon with NO rng and NO PSYCHIC keyword is a bug.

Scan all 47 KT factions in gameData against that rule. Report
the full list: faction, operative, weapon. Do not fix from the
list yet — Nox wants to see the size of it first. If it's 4
weapons that's a patch; if it's 90 across 20 factions that's a
parser fix and a different conversation.

Report the rule's false-positive rate too: if the scan flags
weapons that are legitimately unlimited but not PSYCHIC-
keyworded, the rule is wrong and I want to know before we act
on it. Say so plainly rather than quietly filtering them out.

Watch the discriminator: melee weapons are a different path
(Fight), not rng-based. The weapon's R/M type flag is what tells
them apart, NOT rng presence. Don't let melee weapons into this
audit and inflate the number.

## Item 3 — Fix, according to what item 1 found
- PARSER GAP -> fix the parser in data-pipeline/parsers/.
  Re-run, diff the output, report how many weapons across how
  many factions the fix recovered. This is the good outcome:
  one fix, whole catalogue.
- SOURCE GAP -> data-pipeline/parsers/patches.json, which is
  the ONLY home for corrections. NO HAND-EDITS TO gameData/
  EVER — that's canon. patches.json fails loud on no-match;
  keep it that way.
- MIXED -> both, and say which weapons went which way.

Then Nox re-uploads. Note upload.js --force is global (per
PROJECT_STATE backlog) — flag if that's a problem for the
re-upload and don't work around it silently.

## Item 4 — Display (small, but priority 3 says it matters)
LEGIBILITY IS CORRECTNESS in this project — "told not shown" is
the #1 recurring complaint. Once the real ranges land, an
unlimited-range weapon should READ as unlimited, not as blank.
BUG_KT_UNLIMITED_RANGE suggested "∞" or "unlimited" over "—" and
left it to the session. Check what actually shipped. If it still
renders "—", make it say something a player understands. One
word in the weapon row.

## Out of scope
- The sentinel itself. Do not touch it.
- The 40k "?" stats bug (getRosterUnitDef lookup miss falling
  through to a legacy stat table). Separate, still open.
- Anything in warhammer40k/ or killteam/ app code.
- The KT `title=`-only hover debt (~20 sites). Next phase.

## Done when
Commits per item, hashes cited, plus a report with:
1. ROOT CAUSE: parser gap or source gap, with the BSData XML
   evidence that settles it.
2. The full audit list from item 2 (faction / operative /
   weapon), and its false-positive assessment.
3. What you fixed and where (parser vs patches.json), and how
   many weapons across how many factions.
4. What Nox needs to do to get it live (re-upload steps as a
   NUMBERED CHECKLIST with pass/fail — he multitasks).
5. What the weapon row displays for a genuinely-unlimited weapon
   now.

If item 2's list is big, STOP after items 1-2 and report. A
large list is a scope decision for Nox, not something to
unilaterally grind through.
