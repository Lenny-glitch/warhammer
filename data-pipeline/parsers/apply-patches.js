// apply-patches.js — Part 1 of PATCH_OVERLAY_BRIEF.md.
//
// Home for hand-corrections that don't come from BSData (e.g. countsAs
// values that only ever lived in the live Firebase database, hand-applied
// after a scrape/parse and never recorded upstream — the exact failure
// mode this file exists to close off). Rule going forward: NO hand-edits to
// gameData/ in Firebase, ever. Every correction is a patches.json entry.
// The pipeline is the only writer.
//
// Applied at parse time, after the faction object is built, before it's
// written to output/. A patch that stops matching an existing unit means
// BSData renamed or removed something out from under the correction — that
// must surface as a loud failure, not a silent drop, so parse-kt.js exits
// non-zero rather than shipping a faction quietly missing a correction it
// should have.

const fs = require('fs');
const path = require('path');

const PATCHES_PATH = path.join(__dirname, 'patches.json');

function loadPatches() {
  if (!fs.existsSync(PATCHES_PATH)) return [];
  return JSON.parse(fs.readFileSync(PATCHES_PATH, 'utf8'));
}

// faction: the parsed faction object (system: 'kill-team' shape — has
//   .id (slug) and .operatives[]; a future 40k caller would pass its own
//   .units[] shape and system:'warhammer-40k' patches).
// unitsKey: which array on `faction` holds the units ('operatives' for KT,
//   'units' for 40k).
// Returns the list of applied patches (for logging); throws on any patch
// targeting this faction that doesn't match an existing unit.
//
// ROSTER_VAL_ALL: patches with `scope: 'faction'` target
// `faction.composition` directly instead of a unit — for values BSData
// genuinely doesn't encode (e.g. a team's total operative count, when the
// .cat's forceEntry has no min/max constraint at all). Only `totalOperatives`
// is supported today (the one real case this pass needed) — extend this,
// don't guess a generic path-setter, when a second field actually needs it.
function applyPatches(faction, patches, unitsKey = 'operatives') {
  const relevant = patches.filter(p => p.faction === faction.id);
  const applied = [];
  for (const patch of relevant) {
    if (patch.scope === 'faction') {
      if (!faction.composition) {
        throw new Error(
          `patches.json entry targets a faction-level field but faction=${patch.faction} has no ` +
          `composition object at all — BSData shape may have changed. Fix or remove the patch entry.`
        );
      }
      if (patch.field !== 'totalOperatives') {
        throw new Error(
          `patches.json entry: unsupported faction-level field "${patch.field}" for faction=${patch.faction} ` +
          `— only "totalOperatives" is implemented.`
        );
      }
      faction.composition.totalOperatives = patch.value;
      applied.push(patch);
      continue;
    }
    const unit = (faction[unitsKey] || []).find(u => u.id === patch.unit);
    if (!unit) {
      throw new Error(
        `patches.json entry does not match any unit: system=${patch.system} faction=${patch.faction} ` +
        `unit=${patch.unit} field=${patch.field} — BSData may have renamed or removed this unit. ` +
        `Fix or remove the patch entry before recompiling.`
      );
    }
    unit[patch.field] = patch.value;
    applied.push(patch);
  }
  return applied;
}

module.exports = { loadPatches, applyPatches, PATCHES_PATH };
