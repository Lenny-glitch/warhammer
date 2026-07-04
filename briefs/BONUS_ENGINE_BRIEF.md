# Bonus Engine Brief — Generic Modifier System (BON-1) — v3

## Session orientation (read first, cold-start safe)
This brief is the COMPLETE task spec. If your memory store is empty,
you need nothing beyond this file and the data-pipeline repo.
- Working repo: ~/projects/data-pipeline (ONLY repo touched in BON-1)
- Out of scope this session: killteam/, warhammer40k/,
  warhammer-fantasy/, age-of-sigmar/, roster/ — do not read or
  modify them for this task
- v3 supersedes v2 and all chat-relayed amendments. Everything
  agreed in review is folded in here.

## Context
Card-exact ploy/stratagem text is dead. Replacing it: one generic
bonus engine that expresses weapon keywords, ploys, stratagems,
auras, and (later) Fantasy magic/psychology as structured modifiers
readable by all game systems. Description text is flavor only —
the engine NEVER parses prose. Everything mechanical lives in
structured fields.

ploys/tau-pathfinders.json stays untouched as an unvalidated
reference library. Nothing in this brief reads it.

v3 changes from v2 (from repo cross-check review):
- Firebase path fixed to gameData/{system}/bonuses/{bonusId}
  (system-first, matching every existing path convention)
- "any" removed as a storage key — fan-out duplication instead
- Resolver vendoring acknowledged as a FIRST instance, not an
  existing pattern; version constant + sync-check script added
- 40k live-game collection is games/ (not games-40k/) — recorded
  for BON-2/BON-4, no action in BON-1
- Optional "when" field on effects (Piercing Crits 1 case)

## Scope of BON-1
1. The bonus schema (defined below — implement exactly)
2. Shared resolver module — pure functions, no UI, no game logic
3. Keyword compile step mapping BSData keyword strings → bonuses
4. Firebase paths + upload support
5. check-resolver-sync.js drift detector

NOT in BON-1: game-app integration, UI, CP/AP spending, condition
token state tracking, Fantasy anything. Those are BON-2+.

---

## The Schema

```json
{
  "id": "lethal-5",
  "name": "Lethal 5+",
  "description": "Flavor/reference text only. Engine never reads this.",
  "system": "kill-team",            // "kill-team" | "warhammer-40k" | "warhammer-fantasy" | "any"
  "faction": null,                   // faction slug, or null = universal
  "source": "keyword",               // "keyword" | "ploy" | "stratagem" | "ability" | "aura" | "magic" | "user"

  "activation": "passive",           // "passive" | "active" — see semantics
  "cost": { "type": "free", "amount": 0 },   // type: "free" | "cp" | "ap"
  "usage": "unlimited",              // "unlimited" | "oncePerRound" | "oncePerGame" | "oncePerActivation"

  "trigger": "onShoot",              // eligibility — see vocabulary
  "duration": "instant",             // "instant" | "untilEndOfActivation" | "untilEndOfRound" | "game"

  "scope": {
    "target": "self",                // "self" | "ally" | "team" | "enemy"
    "range": null,                   // inches, null = no range requirement
    "filter": []                     // keyword filter, "!" prefix = exclusion
  },

  "effects": [
    { "type": "mod",  "stat": "critThreshold", "op": "cap", "value": 5 },
    { "type": "mod",  "stat": "defDice", "op": "add", "value": -1, "when": "critScored" },
    { "type": "flag", "flag": "ignoreCover" },
    { "type": "condition", "condition": "markerlight", "stacks": 1, "max": 4 }
  ]
}
```

### system: "any" — source vs storage
"any" is legal on the SOURCE object only. At compile/upload time,
an any-system bonus is DUPLICATED into each real system's Firebase
path. Readers never look in two places; writers fan out. The
snapshot rule (below) makes duplication harmless — games freeze
their copy at creation.

### Activation vs cost — semantics (get this right)
Cost attaches to the ACTIVATION EVENT, not ongoing behavior.
- **passive** = no activation event exists, ever. Weapon keywords,
  innate abilities. Passive MUST be cost "free" — validateBonus
  rejects anything else.
- **active** = a player triggers it, paying its cost at that
  moment. What happens after is governed by duration.

A CP stratagem creating a round-long aura is:
activation "active", cost {cp,1}, duration "untilEndOfRound",
scope {target:"ally", range:6}. It FEELS passive while running but
is schema-active. There is no passive-with-cost.
Markerlight: activation "active", cost {ap,1} — active and CP-free
are independent axes. AP is deducted by the game engine; the
resolver only records the cost.

### Effect types
**mod** — numeric change to an abstract stat.
- op "add": signed arithmetic
- op "improve": direction-aware for roll targets (hit 4+ → 3+)
- op "set": overwrite
- op "cap": direction-aware "set if better". Lethal 5+ =
  cap critThreshold 5. Already 5 or better → no effect. Caps
  never stack — two Lethal 5+ still crit on 5s.

**MANDATORY OP ORDERING** per stat: set → add → improve → cap.
Caps run LAST so additive bonuses cannot cross a hard threshold
and both clients compute identical results. Fixed order or games
desync.

**Optional "when" field** on any effect: "always" (default) |
"critScored". Vocabulary extendable. Resolver applies conditional
effects only when the context carries the matching fact.
Piercing Crits 1 = {mod, defDice, add, -1, when: critScored} —
distinct from flat Piercing 1. This lands on day one, not
hypothetically: "Piercing Crits 1" is a real alias in the KT
glossary. (40k's crit-conditional rules, e.g. Devastating Wounds,
are the same shape.)

**flag** — boolean rule attached to the attack/unit context.
Engines apply flags they understand and IGNORE ones they don't.
Mandatory: Blast/Torrent/Silent are targeting rules, not numbers,
and an engine ignoring a foreign flag must be safe, not an error.

**condition** — named, stackable, capped token attached to a
target (Markerlight: stacks 1, max 4). BON-1 implements SCHEMA and
validation only. Live token state is game-engine work — BON-3.
Resolver must accept condition effects without error and surface
them in the applied list; it does not track state. Same machinery
later carries WHF psychology (Fear, Panic).

### Abstract stat vocabulary (v1 — extend by adding, never rename)
Movement:   move, dashDistance, chargeDistance
Offense:    atkDice, hit, dmgNormal, dmgCrit, critThreshold, range
Defense:    defDice, save, wounds
Dice:       rerollOne, rerollAll, retainNormal, retainCrit
Economy:    apl, cp

### Flag vocabulary (v1)
blast, torrent, silent, heavy, ignoreCover, ignoreObscured,
noBlock, noReroll, indirect. Unknown flags pass through untouched.

### Condition vocabulary (v1, extended BON-1c)
markerlight, stunned

### Trigger vocabulary (v1)
always, onShoot, onDefend, onFight, onMove, onCharge,
phaseStrategy, phaseCommand, roundStart
("round" = Turning Point in KT, battle round in 40k, turn in WHF.)

### "when" vocabulary (v1)
always, critScored

### Stacking rules
- Same id never stacks with itself
- Different ids stack additively (mods; caps resolve best-wins)
- Resolver does NOT clamp. Each game engine clamps to its own
  legal ranges after resolution. Resolver returns raw totals +
  applied list.

---

## Pipeline-time vs game-time
The MAPPING is data, produced once at compile time:
"Lethal 5+" → {op: cap, stat: critThreshold, value: 5}.
APPLICATION runs at game time in the resolver, because live stats
at roll time depend on everything stacked. The diceroller calls
the resolver immediately before collecting dice. Pipeline stores
declarative facts; resolver computes live values.

---

## Part 1 — Resolver module

Location: ~/projects/data-pipeline/shared/bonus-resolver.js.
This is the FIRST instance of a vendored-shared-file pattern in
this project — no precedent exists, so drift protection is built
in from day one:
- const BONUS_RESOLVER_VERSION = "1.0.0" (bump on any change)
- Header comment stating: master location, that killteam/ and
  warhammer40k/ carry vendored copies (from BON-2 on), and the
  full snapshot rule (Part 3) so the rule travels into every copy

Pure functions only:
```
resolveStats(baseStats, activeBonuses, context)
  → { stats, flags, conditions, applied: [{bonusId, effect}] }
eligibleBonuses(allBonuses, context)
  → bonuses whose trigger/scope/usage match context
validateBonus(bonus)
  → { valid, errors } — incl. passive-must-be-free
```
context = { trigger, actor, target?, positions?, round, facts?,
usedThisGame, usedThisRound }. facts carries roll-state like
critScored for "when" evaluation. Range checks in inches; filter
matching against keyword arrays, "!" = exclusion.

Resolver knows nothing about dice, Firebase, or rendering.

Test file (plain node, no framework) covering:
- op ordering set → add → improve → cap on one stat
- cap non-stacking (best wins)
- add + cap: additive cannot cross the cap
- improve direction on roll-target stats
- "when: critScored" applies with fact present, not without
- flag passthrough of unknown flags
- condition effects accepted and surfaced, no state kept
- oncePerGame / oncePerRound gating
- aura range + keyword filter incl. "!" exclusion
- passive-with-cost rejected by validateBonus

## Part 1b — check-resolver-sync.js

parsers/check-resolver-sync.js: hashes the master resolver against
copies at ../killteam/js/bonus-resolver.js and
../warhammer40k/js/bonus-resolver.js. Reports per path:
MATCH / DRIFT (with version constants of both) / ABSENT.
Standalone, read-only, no side effects. Reports ABSENT for both
today — it exists so BON-2's copy step has verification from day
one.

## Part 2 — Keyword compile step

parsers/compile-keywords.js. Reads parsed faction output JSON,
maps every weapon keyword string to a bonus object via an explicit
mapping table (reviewable, correctable — same philosophy as the
faction slug table):

```
"Lethal 5+"        → mod critThreshold cap 5     (parametric: Lethal x+)
"Accurate 1"       → mod retainNormal add 1      (parametric)
"Balanced"         → mod rerollOne add 1
"Piercing 1"       → mod defDice add -1 (target) (parametric)
"Piercing Crits 1" → mod defDice add -1, when critScored (parametric)
"Blast x"          → flag blast (+ radius mod if parametric)
"Torrent x"        → flag torrent
"Heavy"            → flag heavy
"Silent"           → flag silent
```
Build the full table from the 22-entry KT glossary + the 40k
glossary. Any keyword without a mapping: keep the raw string on
the weapon AND append to output/_unmapped_keywords.txt — never
silently drop, never guess.

Output: each weapon gains a "bonuses" array of compiled bonus
objects alongside its existing keywords array (keep both —
keywords stay for display).

## Part 3 — Firebase + snapshot rule

Paths (system-first, matching every existing gameData/ convention):
```
gameData/kill-team/bonuses/{bonusId}
gameData/warhammer-40k/bonuses/{bonusId}
gameData/warhammer-fantasy/bonuses/{bonusId}   (empty for now)
```
system:"any" bonuses are written to ALL of the above (fan-out).
No gameData/any/ path exists.

Extend upload.js to write the catalog with the same gates
(--dry-run, per-write YES, --force). Weapon-attached bonuses
travel denormalized inside unit data and exports — game apps
never join back.

**SNAPSHOT RULE (architectural, implemented in BON-2+, decided
now):** at game creation the game app copies relevant catalog
entries into the game document — games-kt/{gameId}/bonuses for KT,
and for 40k under its live collection, which is currently games/
(NOT games-40k/; rename to games-{system}/ is a someday item).
The game plays against its frozen copy for its entire life; apps
NEVER read gameData/*/bonuses/ after creation. Why: re-running
upload.js must not change the rules of a game in progress —
critical for play-by-mail spanning days — and it keeps both
clients deterministic. Same pattern as roster exports, applied to
rules. This rule lives in the resolver header comment so it
survives into every vendored copy.

## Done when
- bonus-resolver.js + tests pass (run test script, show output)
- check-resolver-sync.js runs, reports ABSENT for both app paths
- compile-keywords.js runs on all 47 KT factions + AM + Eldar;
  report: total keywords seen, mapped count, unmapped list
- upload.js supports the bonuses paths (dry-run verified, NOT run
  for real)
- Report the full keyword→bonus mapping table for Nox review
  before any Firebase write

## Roadmap after BON-1
BON-2 — KT engine applies passive weapon bonuses in shoot/fight
        resolution; vendored resolver copy + snapshot implemented
BON-3 — Active bonuses: CP/AP spend UI, condition token state
        (Markerlight lives here), faction bonus authoring
BON-4 — 40k integration (active bonuses + keywords; games/ path)
WHF   — adopts resolver via its own stat mapping; psychology rides
        the condition system (project side)

## Out of scope forever (do not revisit)
- Parsing rule prose for mechanics
- Card-exact ploy/stratagem text fidelity
- Per-game bespoke modifier engines
- Live catalog reads during a game (snapshot rule is final)
