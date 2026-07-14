# ROSTER-VAL — Live Composition Validation + Faction Data Audit

CLAIMED: 2026-07-14

## Orientation
Monorepo, roster/. Claim first. Third consecutive playtest
requested this: the builder gives zero feedback on legality —
no "needs a leader," no "too many of X." The tri-state
machinery (_checkLegality: true/false/null) already exists from
the LEGAL-badge fix; this brief gives it rules to check and a
voice in the builder.

## Phase 0 — verify shapes before building
1. What shape does _checkLegality actually consume as
   compositionRules today, and which factions (if any) still
   carry rules from the pre-BSData era? Report — the authoring
   format below adapts to reality, not vice versa.
2. The "Astra Militarum" KT faction shows ONE unit in the
   builder (Nox, playtest 3). Investigate: sparse/legacy BSData
   catalogue? Parse miss? Report what it is. Likely remedy is
   one of: hide sub-viable factions (< N units) from
   FactionPicker with a DEVLOG list, or a patches.json fill —
   propose, Nox decides.

## 1 — Rules vocabulary (minimal, extend later)
Per-faction compositionRules, hand-authored via the existing
Maintenance-gated tooling:
  { maxOps: 10..14ish per faction,
    leader: { required: true, names: [operative names that
              count as leader] },
    limits: [ { name/match, max: N } ] }
That covers "one leader required," "max team size," and "no
more than X of this operative" — the three failures Nox's real
rosters exhibit (14-op teams, duplicate specialists, no
leader). Anything fancier (KT's "4 warriors minimum" style
selection math) waits until a real faction needs it.

## 2 — Live builder feedback (the actual ask)
While building: a status strip, always visible —
  LEGAL (green) / red list of SPECIFIC unmet items ("needs 1
  leader", "12/10 operatives — remove 2", "3× Sniper (max 1)")
  / gray "not validated — no rules for this faction yet"
Updates live on every add/remove. Publish behavior unchanged
(null publishes with Not Validated; false blocks — the red
list now explains exactly why).

## 3 — Author starter rules
Through the tooling (not hand-JSON in Firebase — rules land
wherever compositionRules canonically live, via the app):
Legionaries, Kommandos, Kasrkin, Pathfinders, Vespid
Stingwings — the factions Nox actually plays. Use 2024 team
sizes/leader names from the unit data itself where possible;
flag any you had to guess for Nox to verify against cards.
40k: none this pass (gray "not validated" is correct there
until Part 3-era work defines what legal even means for it).

## Done when
- Nox builds a deliberately illegal Kommandos roster and the
  strip names every problem; fixes them; strip goes green;
  publishes
- A rule-less faction shows gray, publishes as today
- AM mystery reported with a proposed remedy
- DEVLOG, hashes; Nox pushes + redeploys
