window.RosterLoader = (() => {
  const cache = {};  // { factionId: { unitId: unitDef } } — gameData fallback only (squadSize, and any roster unit missing embedded weapons)

  const FACTION_MAP = {
    guard: 'astra-militarum',
    eldar: 'craftworlds-eldar',
  };

  function parseStat(val) {
    return parseInt(String(val == null ? 0 : val)) || 0;
  }

  // 40K-P3: reads the PUBLISHED export (exports/warhammer-40k/{id}), not
  // the old draft rosters/{id} collection. Only exports carry
  // chosenLoadout plus each unit's own fully-resolved weapon profiles
  // embedded inline — the whole point of this change (KL-1/KL-2
  // retirement needs that data, and it doesn't exist anywhere else).
  // Old draft-only roster IDs (e.g. the two hardcoded "Test Roster IDs"
  // in this repo's own DEVLOG) no longer resolve through this path —
  // that's the expected fallout of retiring the free-text flow for the
  // picker (which also reads exports/warhammer-40k), not a regression.
  async function fetchRoster(rosterId) {
    const snap = await window.db.ref('exports/warhammer-40k/' + rosterId).once('value');
    if (!snap.exists()) throw new Error('Roster not found.');
    return snap.val();
  }

  async function loadFactionData(factionId) {
    if (cache[factionId]) return;
    const snap = await window.db.ref('gameData/warhammer-40k/' + factionId).once('value');
    cache[factionId] = snap.val() || {};
  }

  function getUnitDef(factionId, unitId) {
    return (cache[factionId] || {})[unitId] || null;
  }

  // ---- chosenLoadout resolution (40K-P3, retires KL-1/KL-2) ----
  //
  // A roster unit's exported `weapons` array is the unit's FULL datasheet
  // catalog — every weapon across every valid loadout configuration, not
  // what any one squad actually carries (this IS the KL-2 bug's root
  // cause). `chosenLoadout` narrows exactly the optional slots that were
  // resolved at publish time, keyed by roster's own self-describing slot
  // name (see roster/index.html's _parseWargear, which builds these
  // names): "Replace X" — a default weapon named X gets swapped for the
  // chosen one — or "Optional: X" / "Optional (up to N)" — a pure
  // addition, nothing to exclude.
  //
  // The slot name alone only identifies the ONE default being replaced,
  // not the OTHER un-chosen alternatives for that same slot (e.g.
  // Guardian Defenders' Heavy Weapon Platform can become a missile
  // launcher, bright lance, scatter laser, OR starcannon — chosenLoadout
  // only tells us which one WAS picked). Leaving the others in the
  // "fixed" set would be a smaller but still real form of KL-2 (a squad
  // firing its chosen weapon AND every alternative it didn't pick).
  // Closing that requires the alternatives list, which only exists in
  // gameData's raw wargearOptions prose — so parseReplaceSlots() below
  // duplicates JUST roster/index.html's _parseWargear patterns 1/1c (the
  // "replace X with one of the following" family), not the whole parser.
  // Patterns 2/3/4 (pure additions, "for every N models") aren't needed
  // here since additions have nothing to exclude.
  function weaponNameNorm(s) {
    return (s || '').toLowerCase().replace(/[\s-]+/g, '');
  }

  function cleanRef(text) {
    return (text || '')
      .replace(/^(?:their|its|the|1)\s+/i, '')
      .replace(/\s+and\s+.*$/i, '')
      .replace(/[*]$/, '')
      .trim();
  }

  // Returns [{ replaces, options, uniform }] — `replaces` matches the same
  // text roster's own _parseWargear would have used to build the
  // "Replace X" chosenLoadout key; `options` are ALL alternative weapon
  // names for that slot (including whichever one ended up chosen).
  // `uniform` distinguishes the two shapes this prose actually takes —
  // found by testing against a REAL live export (Wraithguard), not
  // assumed: Guardian Defenders' Heavy Weapon Platform slot ("The Heavy
  // Weapon Platform's shuriken cannon can be replaced with one of the
  // following: ...") names ONE specific sub-component — a single special
  // model in the squad. Wraithguard's slot ("All of the models in this
  // unit can EACH have their wraithcannon replaced with 1 D-scythe")
  // explicitly says "all"/"each" — a uniform swap every model in the
  // squad shares identically. These need OPPOSITE perModel tagging (see
  // resolveLoadout below) and the export gives no other way to tell them
  // apart, so this is read directly off the sentence's own "each"/"all
  // ... models" phrasing.
  function parseReplaceSlots(rawText) {
    const slots = [];
    // Same pre-cleaning roster's own _parseWargear does before running any
    // pattern — without it, the "following:"/single-option capture runs on
    // past into the scraper-concatenated ABILITIES/FACTION prose (there's
    // often no period before it to stop a [^.]+ capture).
    const text = String(rawText || '')
      .replace(/\bABILITIES\b[\s\S]*/i, '')
      .replace(/\bFACTION:\s*[\s\S]*/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    function isUniform(matchedText) {
      return /\beach\b/i.test(matchedText) || /\ball\b[^.]*\bmodels\b/i.test(matchedText);
    }

    // List form: "...replaced with one/N of the following: A B C".
    const listPatterns = [
      /([^.]*?)\s+can be replaced with (?:one|\d+) of the following[*]?\s*:\s*([^.]+)/gi,
      /[^.]*?can (?:each )?(?:have (?:their|its|the) )?(.+?)\s+replaced with (?:one|\d+) of the following[*]?\s*:\s*([^.]+)/gi,
    ];
    listPatterns.forEach(re => {
      let m;
      while ((m = re.exec(text))) {
        const replaces = cleanRef(m[1]);
        const options  = m[2].trim().split(/\s+1\s+/)
          .map(s => s.replace(/^1\s+/, '').replace(/[*\s]+$/, '').trim())
          .filter(s => s.length > 0 && s.length < 80);
        if (replaces && options.length) slots.push({ replaces, options, uniform: isUniform(m[0]) });
      }
    });

    // Single-option form: "...can [each] have their X replaced with 1 Y."
    // (Wraithguard's own phrasing — no "of the following" list at all.)
    const singlePattern = /[^.]*?can (?:each )?(?:have (?:their|its|the) )?(.+?)\s+replaced with (?:1 )?([a-z][^.(]+)\./gi;
    let sm;
    while ((sm = singlePattern.exec(text))) {
      const replaces = cleanRef(sm[1]);
      const option   = cleanRef(sm[2]);
      if (replaces && option && !option.includes('cannot') && !option.includes('more than') && option.length < 60) {
        slots.push({ replaces, options: [option], uniform: isUniform(sm[0]) });
      }
    }

    return slots;
  }

  // Extracts { full, weaponName } from a "Replace X" slot name — `full` is
  // the whole reference (for matching against parseReplaceSlots' own
  // `replaces`, which comes from the identical source text via the same
  // cleanRef step), `weaponName` strips a possessive owner prefix if
  // present ("Heavy Weapon Platform's shuriken cannon" -> "shuriken
  // cannon", the actual weapon's own name) for the single-default
  // exclusion. Handles both a straight apostrophe and the curly one the
  // scraper/export actually use (’). Returns null for non-"Replace" slot
  // names (additions).
  function parseReplaceRef(slotName) {
    const m = /^replace\s+(.+)$/i.exec((slotName || '').trim());
    if (!m) return null;
    const full = m[1];
    const possessive = full.match(/['’]s\s+(.+)$/i);
    return { full, weaponName: possessive ? possessive[1] : full };
  }

  // Splits a roster unit's weapons into { fixed, chosenPerModel, chosenOnce }.
  // `fixed`: datasheet weapons not excluded as either the specific default
  // a slot replaced, or one of that slot's other un-chosen alternatives
  // (default troop equipment every model carries, e.g. Close Combat
  // Weapon / Shuriken Catapult, survives untouched). `chosenPerModel`:
  // chosenLoadout picks for a UNIFORM slot ("all models can each have
  // their X replaced") — every model carries this, same as fixed.
  // `chosenOnce`: chosenLoadout picks for a single-special-model slot
  // (e.g. the one Heavy Weapon Platform) — fires once for the squad, not
  // once per model. An "Optional: X"/"Optional (up to N)" addition (no
  // "Replace" prefix, nothing to look up in wargearOptions) defaults to
  // chosenOnce — the safer assumption when the slot's true scope is
  // unknown (fires less, not silently more).
  function resolveLoadout(rosterUnit, unitDef) {
    const allWeapons    = Array.isArray(rosterUnit.weapons) ? rosterUnit.weapons : [];
    const chosenLoadout = rosterUnit.chosenLoadout || {};
    const excludeNames    = new Set(); // exact-match: the one named default
    const excludePrefixes = [];        // prefix-match: slot alternatives (roster's own options text names a weapon FAMILY, e.g. "missile launcher" for both its starshot/sunburst profiles)
    const chosenPerModel  = [];
    const chosenOnce      = [];

    const replaceSlots = (unitDef && Array.isArray(unitDef.wargearOptions))
      ? unitDef.wargearOptions.flatMap(parseReplaceSlots)
      : [];

    Object.entries(chosenLoadout).forEach(([slotName, chosenWeapon]) => {
      const ref = parseReplaceRef(slotName);
      if (!ref) { chosenOnce.push(chosenWeapon); return; } // "Optional: X" / "Optional (up to N)"

      excludeNames.add(weaponNameNorm(ref.weaponName));
      const slot = replaceSlots.find(s => weaponNameNorm(s.replaces) === weaponNameNorm(ref.full));
      if (slot) slot.options.forEach(opt => excludePrefixes.push(weaponNameNorm(opt)));

      (slot && slot.uniform ? chosenPerModel : chosenOnce).push(chosenWeapon);
    });

    const fixed = allWeapons.filter(w => {
      const norm = weaponNameNorm(w.name);
      if (excludeNames.has(norm)) return false;
      return !excludePrefixes.some(p => norm.startsWith(p));
    });
    return { fixed, chosenPerModel, chosenOnce };
  }

  function parseWeaponRange(val) {
    if (val == null) return 0;
    const s = String(val).trim();
    if (/^melee$/i.test(s)) return 0;
    const n = parseInt(s.replace(/[^0-9.-]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  function parseNum(val, fallback) {
    if (val == null) return fallback;
    const n = parseInt(String(val).replace(/[^0-9.-]/g, ''), 10);
    return isNaN(n) ? fallback : n;
  }

  // Converts export-shape weapon objects ({ name, type, profiles: { A, AP,
  // D, RANGE, S, bsws } }) into the flat shape shooting.js already reads
  // ({ name, range, attacks, bs/ws, strength, ap, damage }) — same field
  // names gameData's `weapons` object produces, so shooting.js needs no
  // per-source branching. `perModel` (true = fixed/fires-per-alive-model,
  // false = chosen/replaced-slot/fires-once-for-the-squad) is the actual
  // fix for KL-2's full severity on multi-model squads: gameData has no
  // way to say "only ONE model in this 11-strong squad has the Heavy
  // Weapon Platform's gun" — chosenLoadout is squad-level, not per-model
  // — so a chosen/replaced weapon is treated as fired by the one model
  // that plausibly carries it (once per squad), while fixed troop
  // equipment ("every Guardian Defender is equipped with...") correctly
  // scales with headcount. Documented simplification, not a silent guess.
  function tagWeapons(list, perModel) {
    return list.map(w => {
      const p = w.profiles || {};
      return {
        name:     w.name,
        range:    parseWeaponRange(p.RANGE),
        attacks:  p.A,
        bs:       parseNum(p.bsws, 4),
        ws:       parseNum(p.bsws, 4),
        strength: parseNum(p.S, 3),
        ap:       parseNum(p.AP, 0),
        damage:   p.D,
        perModel,
      };
    });
  }

  function buildUnitsFromRoster(roster, playerFaction, boardHeight) {
    const units      = {};
    const factionId  = FACTION_MAP[playerFaction];
    const bH         = boardHeight || 60;
    const isGuard    = playerFaction === 'guard';
    const SPACING    = 2;

    const rosterUnitList = Array.isArray(roster.units)
      ? roster.units
      : Object.values(roster.units || {});

    for (const rosterUnit of rosterUnitList) {
      const { instanceId, unitId } = rosterUnit;
      if (!instanceId || !unitId) continue;
      const def  = getUnitDef(factionId, unitId);

      // modelCount respected for squad size if present (roster only sets
      // it for VARIABLE-size units — see roster/index.html's
      // _addOperative). Fixed-size squads carry no modelCount at all
      // (Firebase drops the null), so this falls back to gameData's own
      // squadSize, then 1 if even that's unavailable.
      const count = rosterUnit.modelCount != null
        ? rosterUnit.modelCount
        : (def && def.squadSize && def.squadSize.min) || 1;

      const cols = Math.min(count, 5);
      const w    = rosterUnit.stats ? Math.max(1, parseStat(rosterUnit.stats.W))
                 : (def && def.stats ? Math.max(1, parseStat(def.stats.W)) : 1);

      // Resolved ONCE per roster unit (squad), not per model — chosenLoadout
      // has no per-model breakdown to do otherwise. Exports without
      // chosenLoadout/weapons (or any other still-valid old shape) leave
      // both null here, which makes getAllRangedWeapons()/
      // getAllMeleeWeapons() fall back to their existing gameData/
      // UNIT_STATS path unchanged — "behaves as today."
      let equippedRanged = null, equippedMelee = null;
      if (Array.isArray(rosterUnit.weapons)) {
        const { fixed, chosenPerModel, chosenOnce } = resolveLoadout(rosterUnit, def);
        equippedRanged = [
          ...tagWeapons(fixed.filter(x => x.type === 'ranged'),         true),
          ...tagWeapons(chosenPerModel.filter(x => x.type === 'ranged'), true),
          ...tagWeapons(chosenOnce.filter(x => x.type === 'ranged'),     false),
        ];
        equippedMelee = [
          ...tagWeapons(fixed.filter(x => x.type === 'melee'),         true),
          ...tagWeapons(chosenPerModel.filter(x => x.type === 'melee'), true),
          ...tagWeapons(chosenOnce.filter(x => x.type === 'melee'),     false),
        ];
      }

      for (let i = 0; i < count; i++) {
        const id  = `${playerFaction}_${instanceId}_${i}`;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x   = 6 + col * SPACING;
        const y   = isGuard ? (2 + row * SPACING) : (bH - 3 - row * SPACING);

        units[id] = {
          id,
          faction:   playerFaction,
          factionId,
          unitId,
          unitGroup: `${playerFaction}_${instanceId}`,
          label:     rosterUnit.name || rosterUnit.unitName || (def ? def.name : unitId),
          type:      unitId,   // kept for legacy UNIT_STATS fallbacks
          x, y,
          wounds:    w,
          maxWounds: w,
          equippedRanged,
          equippedMelee,
          alive:          true,
          movedThisTurn:  false,
          shotThisTurn:   false,
          chargedThisTurn:false,
          foughtThisTurn: false,
        };
      }
    }

    return units;
  }

  return { fetchRoster, loadFactionData, getUnitDef, buildUnitsFromRoster, FACTION_MAP, parseStat };
})();

// Global shorthand used by shooting.js, state.js, game.js
window.getRosterUnitDef = (factionId, unitId) => window.RosterLoader.getUnitDef(factionId, unitId);
