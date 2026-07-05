# BON-2 v3 — Profile Refactor + Bonus Integration (monorepo edition)

CLAIMED: 2026-07-05

## Orientation
Repo: ~/projects/warhammer, work in killteam/. Supersedes all
prior BON-2 briefs (v2 was never persisted to disk — this is the
canonical spec). Ground truth from killteam/DEVLOG.md's earlier
verify-first pass: crits hardcoded to natural-6 in rollShot and
confirmFightTarget; no variable dice/threshold mechanics;
buildOperatives() strips bonuses/keywords from weapons.
Two parts, HARD CHECKPOINT between: Nox plays a 2a build and
confirms behavioral identity before 2b starts.

═══════════════════════════════════
## BON-2a — Profile extraction (pure refactor, zero behavior change)
═══════════════════════════════════
1. attackProfile built at the top of the shoot sequence from
   weapon + operative data:
   { atkDice, hit, critThreshold: 6, dmgNormal, dmgCrit }
   defenseProfile for the defender: { defDice, save }
   Field names match shared/bonus-resolver.js's stat vocabulary
   exactly so 2b plugs in without renames.
2. rollShot and confirmFightTarget consume ONLY profiles — no
   numeric literals at any roll site. Crit = roll >=
   profile.critThreshold (a field that currently always holds 6).
3. Fight gets its melee profile via the same builder — one
   construction path, two consumers.
4. buildOperatives(): preserve weapons' bonuses arrays through
   game creation. First determine WHY it strips (whitelist copy
   predating the field vs deliberate size trim) and report;
   absent arrays stay fine (old exports) — no errors, no bonuses.
5. Replay-identity proof: before refactoring, capture several
   combat resolutions (inputs + dice + outcomes); after, replay
   the same inputs with stubbed/seeded dice and diff outcomes.
   Report the diff (expected: empty) and anything that couldn't
   be replay-tested and why.
### 2a done when
No roll-site literals; replay diff empty; bonuses arrays survive
game creation (or deliberate-strip finding reported); DEVLOG;
commits cited. CHECKPOINT: Nox plays, confirms, says go.

═══════════════════════════════════
## BON-2b — Bonus integration
═══════════════════════════════════
1. Resolver: import/reference ../shared/bonus-resolver.js
   (≥1.2.0) directly — the monorepo killed vendoring; do NOT
   copy the file. If killteam's page loading can't reference
   outside its dir (plain file:// constraints), report the
   constraint before inventing a workaround.
2. Snapshot at game creation: games-kt/{gameId}/bonuses ← full
   gameData/kill-team/bonuses/ catalog. App never reads the live
   catalog after creation. Old games without the node: bonuses
   inert, zero errors.
3. Resolution: immediately before rolling, resolveStats once per
   side over the profiles; the ENGINE routes appliesTo:"target"
   effects onto the other side's profile (resolver stays
   single-sided — confirmed design, do not widen its signature).
   halfRange fact from measured distance vs weapon rng (null =
   unlimited → false). Post-roll conditional pass: with crit
   results known, re-resolve with facts.critScored /
   noCritScored and apply the delta (Piercing Crits, Rending,
   Severe, Punishing — Rending/Severe are paired conversion
   effects in the data; apply both, no special-casing).
4. Display, not enforcement: flags as badges (blast, torrent,
   hot, brutal...); conditions visible (stunned, markerlight),
   no token state (BON-3). The resolver's applied list drives a
   dice readout — one plain-English line per applied bonus from
   catalog descriptions. Always expanded in ?dev=true; collapsed/
   expandable in play. The readout IS Nox's acceptance test.
5. Determinism: facts feeding the resolver derive from shared
   game-doc state or are written into the action record by the
   acting client; the observing client replays the record, never
   recomputes. (These action records are also the future
   catch-up feature's raw material — write them human-readably.)
### 2b done when
Snapshot verified on a fresh game; old game still plays; a
Lethal/Piercing weapon shows correct resolved numbers in the dev
readout; a conversion visibly fires on the right crit state; one
melee example through the same path; verified-vs-assumed report;
DEVLOG; commits cited.

## Out of scope (both parts)
Flag enforcement, condition state, active/CP bonuses, 40k,
Firebase rules, pipeline changes, catch-up UI itself.
