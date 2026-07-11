# BUG — KT Engine Treats Absent rng as Unshootable
CLAIMED: 2026-07-11

## Symptom (Nox, live game, 2026-07-11)
Legionary Balefire Acolyte: Fireblast and Life siphon display
range "—" and are never offered in the Shoot flow; only Bolt
pistol (rng 8") is shootable. Confirmed against data during
PIPE-H1: those weapons have NO rng key in Firebase — correct and
intentional. Pipeline convention: rng null = unlimited range;
Firebase drops null keys, so absent key = unlimited. True for
every PSYCHIC weapon in every faction.

## Fix
Find every place the shoot flow reads weapon range — weapon
eligibility/selection, target validation, and the halfRange fact
fed to the resolver — and make absent/null rng mean UNLIMITED:
- weapon is always range-eligible
- any target in LOS is in range
- halfRange fact = false (already the documented convention in
  BON2_BRIEF_v3; verify it holds in the implementation)
Display: "—" is acceptable but "∞" or "unlimited" is clearer —
your call, one word in the weapon row.
Check melee isn't disturbed: melee weapons are a different path
(Fight), not rng-based — don't let "no rng = unlimited" leak
melee weapons into Shoot. The weapon's R/M type flag is the
discriminator, not rng presence.

## Done when
- Nox fires Fireblast in his live Legionary game (?dev=true):
  shot resolves, dev readout lists Fireblast's bonuses in plain
  English — this simultaneously closes the BON-2b/KT-RS shoot
  acceptance, the last open item on the bonus arc
- Bolt pistol and normal ranged weapons unchanged
- DEVLOG, hash, Nox pushes
