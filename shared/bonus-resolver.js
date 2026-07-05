// bonus-resolver.js — BON-1 generic modifier resolver
//
// GIT-2 (monorepo migration): lives at shared/bonus-resolver.js, repo root.
// killteam/ and warhammer40k/ reference this file directly (e.g.
// ../shared/bonus-resolver.js) — the old manual-copy vendoring pattern and
// its parsers/check-resolver-sync.js drift-checker are OBSOLETE now that
// there's one real file instead of N copies, and have been deleted. Update
// BONUS_RESOLVER_VERSION below whenever the resolver's behavior changes.
//
// SNAPSHOT RULE: game apps copy the relevant bonus catalog entries into the
// game document (games-kt/{gameId}/bonuses, and the 40k equivalent) at game
// creation and never read gameData/{system}/bonuses/ again for that game.
// Re-running upload.js must not change the rules of a game in progress.
//
// Pure functions only. No UI, no dice, no Firebase, no game-specific logic.
// See data-pipeline/briefs/BONUS_ENGINE_BRIEF.md (v3) and
// BON1B_ADDENDUM_BRIEF.md for the full schema writeup and the Decision log
// behind each addition.

'use strict';

const BONUS_RESOLVER_VERSION = '1.2.1';

// Stats where a LOWER number is better (roll-target stats: you're trying to
// beat this number on a die). Every other stat in the abstract vocabulary is
// "higher is better" (quantities). This distinction only affects the
// direction-aware ops: improve and cap.
const ROLL_TARGET_STATS = new Set(['hit', 'save', 'critThreshold']);

const ACTIVATIONS = new Set(['passive', 'active']);
const COST_TYPES = new Set(['free', 'cp', 'ap']);
const USAGES = new Set(['unlimited', 'oncePerRound', 'oncePerGame', 'oncePerActivation']);
const DURATIONS = new Set(['instant', 'untilEndOfActivation', 'untilEndOfRound', 'game']);
const SCOPE_TARGETS = new Set(['self', 'ally', 'team', 'enemy']);
const SYSTEMS = new Set(['kill-team', 'warhammer-40k', 'warhammer-fantasy', 'any']);
const SOURCES = new Set(['keyword', 'ploy', 'stratagem', 'ability', 'aura', 'magic', 'user']);
const EFFECT_TYPES = new Set(['mod', 'flag', 'condition']);
const APPLIES_TO = new Set(['actor', 'target']);
const APPLIES_TO_DEFAULT = 'actor';
const MOD_OPS = ['set', 'add', 'improve', 'cap']; // fixed application order, do not reorder
const WHEN_DEFAULT = 'always';
// "when" vocabulary (v1.1, BON-1b Decision 1): always | critScored |
// halfRange | noCritScored. Open vocabulary, same as flags — effectApplies
// below already checks arbitrary fact strings against context.facts, so
// adding a value here is documentation, not new logic. halfRange = attack
// made within half the weapon's range (Melta x, Rapid Fire x). noCritScored
// = no critical hit was scored in the sequence (Severe).

// ── validateBonus ────────────────────────────────────────────────────────

function validateBonus(bonus) {
  const errors = [];
  const err = msg => errors.push(msg);

  if (!bonus || typeof bonus !== 'object') return { valid: false, errors: ['bonus must be an object'] };

  if (typeof bonus.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(bonus.id)) {
    err(`id must be a lowercase-hyphen slug, got: ${JSON.stringify(bonus.id)}`);
  }
  if (typeof bonus.name !== 'string' || bonus.name.trim() === '') {
    err('name must be a non-empty string');
  }
  if (!SYSTEMS.has(bonus.system)) {
    err(`system must be one of ${[...SYSTEMS].join('|')}, got: ${JSON.stringify(bonus.system)}`);
  }
  if (bonus.faction !== null && typeof bonus.faction !== 'string') {
    err('faction must be a string slug or null');
  }
  if (!SOURCES.has(bonus.source)) {
    err(`source must be one of ${[...SOURCES].join('|')}, got: ${JSON.stringify(bonus.source)}`);
  }
  if (!ACTIVATIONS.has(bonus.activation)) {
    err(`activation must be one of ${[...ACTIVATIONS].join('|')}, got: ${JSON.stringify(bonus.activation)}`);
  }

  const cost = bonus.cost;
  if (!cost || typeof cost !== 'object' || !COST_TYPES.has(cost.type) || typeof cost.amount !== 'number') {
    err(`cost must be { type: free|cp|ap, amount: number }, got: ${JSON.stringify(cost)}`);
  } else if (bonus.activation === 'passive' && cost.type !== 'free') {
    // MANDATORY: passive bonuses cannot have a cost — there is no activation
    // event to attach it to.
    err(`passive bonuses must have cost.type "free" (activation has no event to pay a cost at), got: ${cost.type}`);
  }

  if (!USAGES.has(bonus.usage)) {
    err(`usage must be one of ${[...USAGES].join('|')}, got: ${JSON.stringify(bonus.usage)}`);
  }
  if (typeof bonus.trigger !== 'string' || bonus.trigger.trim() === '') {
    err('trigger must be a non-empty string');
  }
  if (!DURATIONS.has(bonus.duration)) {
    err(`duration must be one of ${[...DURATIONS].join('|')}, got: ${JSON.stringify(bonus.duration)}`);
  }

  const scope = bonus.scope;
  if (!scope || typeof scope !== 'object') {
    err('scope must be an object');
  } else {
    if (!SCOPE_TARGETS.has(scope.target)) {
      err(`scope.target must be one of ${[...SCOPE_TARGETS].join('|')}, got: ${JSON.stringify(scope.target)}`);
    }
    if (scope.range !== null && typeof scope.range !== 'number') {
      err('scope.range must be a number (inches) or null');
    }
    if (!Array.isArray(scope.filter)) {
      err('scope.filter must be an array');
    }
  }

  if (!Array.isArray(bonus.effects) || bonus.effects.length === 0) {
    err('effects must be a non-empty array');
  } else {
    bonus.effects.forEach((effect, i) => {
      if (!EFFECT_TYPES.has(effect.type)) {
        err(`effects[${i}].type must be one of ${[...EFFECT_TYPES].join('|')}, got: ${JSON.stringify(effect.type)}`);
        return;
      }
      // appliesTo (v1.2, BON-1c Fix 1) is valid on any effect type — it's
      // metadata the CALLER reads to decide which side's stats a given
      // effect belongs to (see resolveStats' doc comment below); resolveStats
      // itself is agnostic to it and just applies whatever baseStats it was
      // given, so this is the only place it's actually checked.
      if (effect.appliesTo !== undefined && !APPLIES_TO.has(effect.appliesTo)) {
        err(`effects[${i}].appliesTo must be one of ${[...APPLIES_TO].join('|')}, got: ${JSON.stringify(effect.appliesTo)}`);
      }
      if (effect.type === 'mod') {
        if (typeof effect.stat !== 'string' || effect.stat.trim() === '') err(`effects[${i}].stat must be a non-empty string`);
        if (!MOD_OPS.includes(effect.op)) err(`effects[${i}].op must be one of ${MOD_OPS.join('|')}, got: ${JSON.stringify(effect.op)}`);
        if (typeof effect.value !== 'number') err(`effects[${i}].value must be a number`);
        if (effect.when !== undefined && typeof effect.when !== 'string') err(`effects[${i}].when must be a string`);
      } else if (effect.type === 'flag') {
        if (typeof effect.flag !== 'string' || effect.flag.trim() === '') err(`effects[${i}].flag must be a non-empty string`);
      } else if (effect.type === 'condition') {
        if (typeof effect.condition !== 'string' || effect.condition.trim() === '') err(`effects[${i}].condition must be a non-empty string`);
        if (typeof effect.stacks !== 'number') err(`effects[${i}].stacks must be a number`);
        if (typeof effect.max !== 'number') err(`effects[${i}].max must be a number`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

// ── eligibleBonuses ──────────────────────────────────────────────────────

function distanceInches(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function keywordFilterMatches(filter, keywords) {
  if (!filter || filter.length === 0) return true;
  const kw = new Set(keywords || []);
  return filter.every(tok => {
    if (tok.startsWith('!')) return !kw.has(tok.slice(1));
    return kw.has(tok);
  });
}

// allBonuses: Bonus[]
// context: { trigger, actor, target?, positions?, round, usedThisGame,
//            usedThisRound, usedThisActivation?, facts? }
//   actor / target: { keywords: string[] } | undefined
//   positions: { actor: {x,y}, target: {x,y} } | undefined — inches, shared
//     coordinate space between both boards
function eligibleBonuses(allBonuses, context) {
  const usedGame = new Set(context.usedThisGame || []);
  const usedRound = new Set(context.usedThisRound || []);
  const usedActivation = new Set(context.usedThisActivation || []);

  return allBonuses.filter(bonus => {
    // trigger
    if (bonus.trigger !== 'always' && bonus.trigger !== context.trigger) return false;

    // usage gating
    if (bonus.usage === 'oncePerGame' && usedGame.has(bonus.id)) return false;
    if (bonus.usage === 'oncePerRound' && usedRound.has(bonus.id)) return false;
    if (bonus.usage === 'oncePerActivation' && usedActivation.has(bonus.id)) return false;

    // scope: keyword filter checks against the recipient (target if present,
    // else the actor for self-only bonuses)
    const recipientKeywords = (context.target || context.actor || {}).keywords;
    if (!keywordFilterMatches(bonus.scope.filter, recipientKeywords)) return false;

    // scope: range check (auras). A bonus that declares a range requires
    // both positions to evaluate — fail closed if they're missing.
    if (bonus.scope.range !== null) {
      if (!context.positions || !context.positions.actor || !context.positions.target) return false;
      if (distanceInches(context.positions.actor, context.positions.target) > bonus.scope.range) return false;
    }

    return true;
  });
}

// ── resolveStats ─────────────────────────────────────────────────────────

function applyOp(current, op, value, isRollTarget) {
  switch (op) {
    case 'set':
      return value;
    case 'add':
      return current + value;
    case 'improve':
      // value is always a positive "how much better" magnitude; direction
      // flips for roll-target stats so authors never have to know which way
      // a given stat's numbers run.
      return isRollTarget ? current - value : current + value;
    case 'cap':
      // "set if better" — never makes a stat worse, never stacks (repeated
      // caps just keep picking the best value seen).
      return isRollTarget ? Math.min(current, value) : Math.max(current, value);
    default:
      throw new Error(`unknown op: ${op}`);
  }
}

function effectApplies(effect, context) {
  const when = effect.when || WHEN_DEFAULT;
  if (when === WHEN_DEFAULT) return true;
  return Boolean(context.facts && context.facts.includes(when));
}

// baseStats: { [stat]: number } — belongs to ONE side of the interaction.
//   resolveStats stays single-sided on purpose (BON-1c Fix 1 decision): it
//   does not take an actor+target pair and does not know which side
//   `baseStats` represents. An effect's `appliesTo` ("actor" | "target",
//   default "actor") is pure metadata for the CALLER — to get a
//   target-directed effect (e.g. Piercing's -1 defDice) to actually land,
//   the calling engine must call resolveStats a second time with the
//   target's own baseStats and only the subset of activeBonuses/effects
//   whose appliesTo is "target". resolveStats does not filter by appliesTo
//   itself; it applies every mod effect it's given to whatever baseStats it
//   was handed, and passes appliesTo through untouched on `applied` and
//   `conditions` entries so the caller can also inspect it after the fact.
// activeBonuses: Bonus[] — already filtered by eligibleBonuses; order matters
//   for tie-breaking within the same op (first-seen wins ties), so callers
//   should pass them in a stable, deterministic order.
// context: same shape as eligibleBonuses' context, plus optional `facts`
//   (string[] of true statements about this resolution, e.g. ["critScored"])
//   used to gate conditional (`when`) effects.
function resolveStats(baseStats, activeBonuses, context) {
  const stats = { ...baseStats };
  const flags = [];
  const conditions = [];
  const applied = [];

  // Bucket mod effects per stat so we can apply them in fixed op order,
  // regardless of which bonus contributed them or what order they arrived in.
  const modsByStat = {};

  for (const bonus of activeBonuses) {
    for (const effect of bonus.effects) {
      if (!effectApplies(effect, context)) continue;

      if (effect.type === 'mod') {
        (modsByStat[effect.stat] = modsByStat[effect.stat] || []).push({ bonusId: bonus.id, effect });
      } else if (effect.type === 'flag') {
        if (!flags.includes(effect.flag)) flags.push(effect.flag);
        applied.push({ bonusId: bonus.id, effect });
      } else if (effect.type === 'condition') {
        conditions.push({
          bonusId: bonus.id, condition: effect.condition, stacks: effect.stacks, max: effect.max,
          appliesTo: effect.appliesTo || APPLIES_TO_DEFAULT,
        });
        applied.push({ bonusId: bonus.id, effect });
      }
    }
  }

  for (const stat of Object.keys(modsByStat)) {
    const isRollTarget = ROLL_TARGET_STATS.has(stat);
    let value = stats[stat] !== undefined ? stats[stat] : 0;
    for (const op of MOD_OPS) {
      for (const { bonusId, effect } of modsByStat[stat]) {
        if (effect.op !== op) continue;
        value = applyOp(value, op, effect.value, isRollTarget);
        applied.push({ bonusId, effect });
      }
    }
    stats[stat] = value;
  }

  return { stats, flags, conditions, applied };
}

const BonusResolver = {
  BONUS_RESOLVER_VERSION,
  ROLL_TARGET_STATS,
  resolveStats,
  eligibleBonuses,
  validateBonus,
};

// BON-2b (2026-07-05): game apps load this file with a plain
// <script src="../shared/bonus-resolver.js"> tag (killteam/index.html has
// no bundler and is one giant inline <script>, not an ES module — adding
// `export` here and switching that tag to type="module" would put the
// whole existing 4700+ line script under strict-mode module scoping for no
// reason). `module.exports` alone doesn't run in a browser (no `module`
// global), so Node stays on its normal path and the browser gets the same
// object attached to `window.BonusResolver` — one file, two load
// mechanisms, no vendored copy either way.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BonusResolver;
} else if (typeof window !== 'undefined') {
  window.BonusResolver = BonusResolver;
}
