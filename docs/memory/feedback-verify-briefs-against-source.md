---
name: feedback-verify-briefs-against-source
description: "Work briefs in this project routinely contain incorrect claims about the codebase; verify every load-bearing claim against source before implementing, and report divergences instead of bending code to fit a wrong assumption."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 15f145b3-221a-49c7-94f6-ee885a549083
---

Jonathan's briefs (`*_BRIEF.md` files, dropped as Windows Downloads paths —
see below) frequently instruct "double check" before implementing, and
even when they don't, later briefs explicitly warn things like "Do NOT
trust this brief's claims about killteam/ internals — verify against
source... if reality differs from an assumption here, say so in the report
rather than bending the code to match the brief."

**Why:** this has paid off repeatedly, not been pedantic box-checking:
- BON-1c's brief claimed `resolveStats` already had a "target stats"
  channel for `appliesTo` to route into — it didn't (context only ever
  carried `.keywords`, never stat blocks). Had to pick a resolution
  approach (asked, got no reply in time, went with the conservative one).
- BON-2's brief assumed the KT engine had variable crit-threshold/defDice/
  reroll hooks for bonuses to attach to — grep of the actual `rollShot`/
  `confirmFightTarget` functions showed crits hardcoded to natural-6 and
  damage read straight off flat weapon-profile text, no such hooks exist
  at all. Reported this as a scope-changing finding rather than forcing a
  shallow implementation.
- The very first upload of the bonus pipeline overwrote 7 pre-existing KT
  factions — my first read blamed a `.../info` path-shape mismatch, which
  was real but incomplete; actually investigating `exists()` found a
  genuine URL-construction bug making every skip-if-exists check in the
  script permanently dead. Would have missed this without re-verifying my
  own earlier explanation instead of taking it as settled.

**How to apply:** when a brief describes "the shoot sequence" or "the
resolver already does X" or similar, grep/read the actual function before
writing code against it. If the claim doesn't hold, stop and report/ask
rather than reshaping the implementation to match the brief's mental model
of code that doesn't exist that way.

**Companion pattern:** brief files are handed over as literal Windows
paths (`C:\Users\ahabm\Downloads\NAME.md`) even though everything else is
WSL — translate to `/mnt/c/Users/ahabm/Downloads/NAME.md` to read them.
They frequently aren't saved anywhere durable (not in Downloads for long,
never committed) — when a brief's content matters for future context,
save a copy into the target repo (e.g. `BONUS_ENGINE_BRIEF.md` ended up
saved into `data-pipeline/` after being referenced only in chat/Downloads
for a full session).

See [[project-bonus-engine-status]] for the concrete history this pattern
played out in.
