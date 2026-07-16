# PIPE-INV Report — 40k Faction Expansion + Psychic Content Audit
# 2026-07-15. Investigation only per brief — no data changed, nothing
# uploaded, no decision taken. All findings below are from running the
# actual parser/reading actual BSData files/querying live Firebase, not
# assumed from the brief's own description.

## Q1 — What's in BSData 40k today?

**38 faction `.cat` files** in `~/projects/bsdata-40k` (excluding the two
shared `- Library.cat` files and the `.gst` game system file): the full
range across Imperium (14: Astra Militarum, Space Marines + 8 chapters,
Adepta Sororitas, Adeptus Custodes, Adeptus Mechanicus, Agents of the
Imperium, Grey Knights, Deathwatch, Adeptus Titanicus, Imperial Knights),
Chaos (8), Aeldari (3: Craftworlds, Drukhari, Ynnari), plus Necrons, Orks,
T'au Empire, Tyranids, Genestealer Cults, Leagues of Votann, Unaligned
Forces.

**Ran `parse-40k.js` as-is** (temporarily pointed at three sample
factions in a scratch copy — nothing in the tracked pipeline touched):

| Faction | Units | Missing stats | Notes |
|---|---|---|---|
| Space Marines | 40 | 0 | clean |
| Necrons | 20 | 0 | clean |
| Tyranids | 19 | 0 | clean |
| (Astra Militarum, re-run for comparison) | 36 | 0 | clean |
| (Craftworlds Eldar, re-run for comparison) | 47 | 3 ("[Legends]" units) | see Q2 |

**Runs clean across the board** — no parser crashes, no XML shape
surprises for any of these three new-to-us factions. Fields that DO come
through per unit: `id, name, faction, stats {M,T,SV,W,LD,OC}, points,
weapons[] {name,type,profiles,keywords}, abilities[], keywords[],
isCharacter, isVehicle, isPsyker`. Confirmed **absent** (checked the
actual output JSON, not the schema): `squadSize`, `pointsTable`,
`loadoutOptions`/wargear-slot data, any composition/model-count field.
This matches the brief's expectation exactly — BSData units carry combat
stats and options but not "how many models, what's the default vs.
optional loadout" structure, which is exactly what `roster/`'s Unit
Creator hand-authors today for the two flat-pool factions.

## Q2 — The two-sources problem

**Recommend (a): add BSData factions alongside the flat pool, lazy-author
composition per unit as Nox fields it.** Costs below, then why.

### Option (b) — migrate flat pool's composition onto BSData units

**Tested the actual mapping, not assumed it.** Slugified BSData unit
names against the flat pool's own unit keys for AM and Eldar:

- **AM: 24/36 (67%) match** a flat-pool entry by name. Unmatched are
  almost entirely `[Legends]` datasheets (retired/legacy units BSData
  still carries — Rapier Laser Destroyer Battery, Sabre Weapons Battery,
  Elysian Sniper Squad, etc., 11 of the 12 unmatched) plus one real miss
  (`Gaunt's Ghosts`, a named unit not in the flat pool at all).
- **Eldar: 29/47 (62%) match.** Here the unmatched set is messier: some
  `[Legends]`, but a real chunk (Incubi, Mandrakes, Reavers, Scourges,
  Talos, Wracks, Wyches, Cronos, Hellions, Kabalite Warriors) are
  **Drukhari units, not Craftworlds** — see the parsing nuance below.
- **For matched units, IDs are byte-identical slugs** (`cadian-shock-
  troops`, `cadian-heavy-weapons-squad`, `cadian-recon-squad`,
  `cadian-command-squad` — checked all four) **and points match exactly**
  against the flat pool's base tier (65/65/80/65pts respectively).
  Migration is technically sound where units match — same slugify
  algorithm, no stat drift found in the sample.

**A parsing nuance that changes the real cost estimate for Eldar**
(found by testing, not assumed): `parse-40k.js` currently points
Craftworlds Eldar at `Aeldari - Aeldari Library.cat` — a file **shared
across Craftworlds, Drukhari, and Ynnari**, containing all three
sub-factions' units undifferentiated. There's a *separate*
`Aeldari - Craftworlds.cat` that IS the correctly-scoped, curated list
(105 `<entryLink>` references by name into the shared Library — Wraithguard,
Windriders, Asurmen, Autarch, Avatar of Khaine, Baharroth, etc., no
Drukhari) — but that file has **zero unit entries of its own**; it's a
thin index of links, and running `parse-40k.js` against it directly
produces 0 units. Resolving it correctly requires the same
cross-catalogue two-pass link resolution `parse-kt.js` already had to
build for Inquisitorial Agents (see that file's own "CAT-AUDIT" comment).
**This means Eldar's real BSData coverage and migration cost is better
than the raw 62% suggests** (some of the "unmatched" units are simply
mis-scoped, not missing) **but the parser work to fix it — cross-
catalogue link resolution — hasn't been built for 40k yet.** Chaos has a
similar shared-Library structure for its own sub-factions (Chaos Daemons,
Chaos Knights each have a `- Library.cat`); Imperium's Space Marine
chapters and Astra Militarum do not (each `.cat` I sampled is
self-contained, `library="false"`).

**Bottom line on (b):** technically soundest long-term (one source of
truth, matches this project's stated bias against duplicate sources), but
non-trivial: needs the cross-catalogue resolver work above for every
sub-faction-sharing-a-Library case, plus someone manually re-authoring
composition/squadSize for the ~35% (AM) to ~50%-ish-after-fixing-scope
(Eldar) of units that don't cleanly match a flat-pool counterpart. Real
work, not a data migration script.

### Option (a) — add BSData factions alongside, accept two sources

Lower upfront cost: BSData factions become playable immediately for stats/
weapons/keywords (confirmed clean above), with squadSize/composition
filled in lazily via the Unit Creator hand-author hook `roster/` Part 2
already built for exactly this gap. Real cost is the one this project has
paid three times before: two sources of truth, ongoing risk of drift
(rules updates landing in BSData without a corresponding flat-pool
correction, or vice versa) and a permanent "which source wins" question
for any unit that ends up defined in both (unlikely today since flat pool
= AM/Eldar only, but stops being unlikely the moment (b) is even partly
pursued later).

### (c) — a middle path worth naming, not fully speced

Add BSData factions AS BSData (option a), but **only for the two existing
flat-pool factions, retire the flat pool for AM/Eldar specifically** once
the cross-catalogue resolver exists and a real mapping pass is done —
i.e., do (b) for AM/Eldar only, (a) for everything else, since (b)'s cost
is a one-time investment per faction and AM/Eldar are the ones already
proven to matter (live games). This avoids ever having AM/Eldar defined
in two places while not blocking new factions on the resolver work.
Flagging this because it's a real option the code supports, not
recommending it over (a) — Nox's actual near-term need (more playable
factions for his brother) is served faster and more cheaply by (a) alone;
(c) is worth a future decision, not now.

## Q3 — Psychic content audit (Kill Team)

**Nox's Balefire Acolyte assumption is NOT the whole picture.** Checked
the actual `.cat` source, not the parsed output: Fireblast/Life siphon
are `type="upgrade"` selectionEntries whose profile is `typeName="Weapons"`
— i.e., ordinary attack profiles carrying the `PSYCHIC` weapon keyword
(the one already mapped). That's genuinely **all** the psychic content
Legionaries (Balefire Acolyte's own faction) has.

**But other live (2024-edition) factions have real psychic ACTIONS, not
just weapons.** `parse-kt.js` already extracts `typeName="Unique Actions"`
profiles into the same `abilities[]` array as `typeName="Abilities"` (see
`collectAbilities()`) — these are free-text name+description pairs, no
psychic flag extracted. Searching for `**PSYCHIC**`-prefixed Unique
Action text specifically (BSData's own in-text marker) across all 47 live
2024 faction files found **23 psychic actions across 9 factions**:
Warpcoven/Thousand Sons (5 — the deepest: Ravage Destiny, Temporal Flux,
Reconstitution Ritual, Alight, one more), Corsair Voidscarred (4), Brood
Brothers and Chaos Cult (3 each), Nemesis Claw and Plague Marines (2
each), Fellgor Ravagers, Inquisitorial Agents, and Void-dancer Troupe (1
each). Legionaries: **0** — confirming the brother's example really is
the weapon-only end of the spectrum, not representative.

**Concrete example** (Warpcoven's "Ravage Destiny", 1AP): *"Select one
enemy operative visible to and within 9" of this operative. Until the
start of this operative's next activation, until it's incapacitated, or
until this action is performed again by a friendly operative (whichever
comes first)... re-roll their attack dice results of 6, and... treat that
enemy operative's APL stat as 1 lower."* This is a targeted, durational
debuff with its own bespoke trigger/expiry conditions — nothing like a
weapon attack.

**What a real "cast a power" mechanic would need that we don't have**
(checked the actual KT engine, `killteam/index.html`, not assumed): today
`abilities`/Unique Actions are rendered as a **hover-tooltip tag only** —
`op-ability-tag` with `title="${description}"` — no mechanical hookup at
all, unlike weapon attacks (full dice resolution) or weapon-keyword
bonuses (compiled into the generic bonus-resolver and auto-applied during
Shoot/Fight). Building real psychic actions would need, at minimum:
1. A structured psychic flag (currently just embedded prose — `**PSYCHIC**`
   markdown at the start of the description string, not a parsed field).
2. AP cost is embedded in the NAME string ("Ravage Destiny (1AP)"), not a
   structured field like weapons' ATK/HIT/DMG.
3. **An effect model these prose descriptions don't have at all** — target
   selection (operative within Nx", visible), duration tracking ("until
   incapacitated or performed again"), and the actual mechanical effects
   themselves (re-roll dice of a specific value, modify a stat by a fixed
   amount for a duration, heal wounds, remove-and-replace on the board) —
   none of which map onto the existing weapon-keyword bonus-resolver
   model (that system modifies a single roll during a single attack; these
   actions grant standing conditions that persist and apply to *future*,
   separate rolls by a *different* operative).

**This is a new subsystem, not a bonus-engine extension.** The existing
bonus engine answers "what modifies THIS roll, right now, during THIS
attack." Psychic actions ask "select a target, apply a standing effect
that changes a *different* roll later, track when it expires." Scoping it
would mean designing that targeting/duration/effect model first — closer
in size to the original bonus-resolver build than to a catalog addition.

## Done-when checklist

- Q1 facts — reported above, from an actual parser run.
- Q2 recommendation with costs — (a), with (b)'s real mapping-rate and
  cross-catalogue-resolver cost measured, not guessed; (c) named for a
  later decision.
- Q3 findings — reported, including the scale check (9/47 factions, 23
  actions) the brief's own framing didn't ask for but needed for an
  honest answer.
- No code changes, no uploads, no decisions taken — confirmed clean
  working tree throughout; all parser runs used scratch copies outside
  the tracked repo, writing to `/tmp` only.
