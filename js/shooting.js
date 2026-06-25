window.Shooting = (() => {

  // ---- Geometry ----

  function segmentsIntersect(x1,y1,x2,y2, x3,y3,x4,y4) {
    const d1x = x2-x1, d1y = y2-y1;
    const d2x = x4-x3, d2y = y4-y3;
    const cross = d1x*d2y - d1y*d2x;
    if (Math.abs(cross) < 1e-10) return false;
    const dx = x3-x1, dy = y3-y1;
    const t = (dx*d2y - dy*d2x) / cross;
    const u = (dx*d1y - dy*d1x) / cross;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  function segmentCrossesRect(x1,y1,x2,y2, t) {
    const rx = t.x, ry = t.y, rx2 = t.x + t.width, ry2 = t.y + t.height;
    return segmentsIntersect(x1,y1,x2,y2, rx,ry,  rx2,ry)  ||
           segmentsIntersect(x1,y1,x2,y2, rx2,ry, rx2,ry2) ||
           segmentsIntersect(x1,y1,x2,y2, rx,ry2, rx2,ry2) ||
           segmentsIntersect(x1,y1,x2,y2, rx,ry,  rx,ry2);
  }

  // ---- LOS ----

  // Result for one ray against all terrain: 'clear' | 'cover' | 'blocked'
  // terrain is { "x,y": tier } — each key is a 1"×1" square's top-left corner.
  function rayResult(x1,y1,x2,y2, terrain) {
    let hasCover = false;
    for (const [key, tier] of Object.entries(terrain || {})) {
      const [gx, gy] = key.split(',').map(Number);
      if (!segmentCrossesRect(x1,y1,x2,y2, { x:gx, y:gy, width:1, height:1 })) continue;
      if (tier === 'tall')      return 'blocked';
      if (tier === 'chestHigh') hasCover = true;
      // 'rough' has no LOS effect
    }
    return hasCover ? 'cover' : 'clear';
  }

  // 3 rays: shooter → target center, left edge, right edge
  // Returns best result: 'clear' > 'cover' > 'blocked'
  function losToModel(sx,sy, tx,ty, br, terrain) {
    const dx = tx-sx, dy = ty-sy;
    const len = Math.hypot(dx, dy);
    const px = len > 0 ? (-dy/len)*br : br;
    const py = len > 0 ? ( dx/len)*br : 0;

    const rays = [
      [sx,sy, tx,    ty    ],
      [sx,sy, tx+px, ty+py ],
      [sx,sy, tx-px, ty-py ],
    ];

    let best = 'blocked';
    for (const [ax,ay,bx,by] of rays) {
      const r = rayResult(ax,ay,bx,by, terrain);
      if (r === 'clear')  return 'clear';
      if (r === 'cover')  best = 'cover';
    }
    return best;
  }

  // Unit-level LOS: centroid of shooter models → each alive target model
  // Returns { visible: bool, cover: bool }
  function unitLOS(shooterModels, targetModels, terrain) {
    if (!shooterModels.length || !targetModels.length) return { visible: false, cover: false };
    const sx = shooterModels.reduce((s,u) => s+u.x, 0) / shooterModels.length;
    const sy = shooterModels.reduce((s,u) => s+u.y, 0) / shooterModels.length;
    let hasCover = false;
    for (const tm of targetModels) {
      const br = getTargetProfile(tm).baseRadius;
      const r  = losToModel(sx,sy, tm.x,tm.y, br, terrain);
      if (r === 'clear')  return { visible: true,  cover: false };
      if (r === 'cover')  hasCover = true;
    }
    return { visible: hasCover, cover: hasCover };
  }

  // Range: true if any shooter model is within weaponRange of any target model (center-to-center)
  function unitInRange(shooterModels, targetModels, weaponRange) {
    for (const sm of shooterModels)
      for (const tm of targetModels)
        if (Math.hypot(sm.x-tm.x, sm.y-tm.y) <= weaponRange) return true;
    return false;
  }

  // Returns [{ groupId, cover }] — enemy unit groups that are in range AND visible
  function findValidTargets(shooterGroup, allUnits, terrain) {
    const all = Object.values(allUnits);
    const shooterModels = all.filter(u => u.unitGroup === shooterGroup && u.alive);
    if (!shooterModels.length) return [];

    const shooterFaction = shooterModels[0].faction;
    // Use the longest range in the group — models with shorter range are filtered per-model in resolveAttacks
    const weaponRange = Math.max(...shooterModels.map(sm => getRangedWeapon(sm).range || 0));

    const enemyGroups = {};
    all.forEach(u => {
      if (u.faction === shooterFaction || !u.alive) return;
      (enemyGroups[u.unitGroup] = enemyGroups[u.unitGroup] || []).push(u);
    });

    const results = [];
    Object.entries(enemyGroups).forEach(([groupId, models]) => {
      if (!unitInRange(shooterModels, models, weaponRange)) return;
      const los = unitLOS(shooterModels, models, terrain);
      if (los.visible) results.push({ groupId, cover: los.cover });
    });
    return results;
  }

  // ---- Dice & resolution ----

  function d6() { return Math.floor(Math.random() * 6) + 1; }

  // ---- GameData helpers (Phase 15) ----

  function parseStat(val) { return parseInt(String(val == null ? 0 : val)) || 0; }

  // Roll variable notation: "D6" → 1-6, "D3" → 1-3, "2D6" → 2-12, number → itself
  function resolveCount(val) {
    if (typeof val === 'number') return val;
    const s = String(val).trim();
    if (/^2D6$/i.test(s)) return d6() + d6();
    if (/^D6$/i.test(s))  return d6();
    if (/^D3$/i.test(s))  return Math.ceil(d6() / 2);
    return parseInt(s) || 1;
  }

  // Expected value — used in estimate functions instead of rolling
  function avgCount(val) {
    if (typeof val === 'number') return val;
    const s = String(val).trim();
    if (/^2D6$/i.test(s)) return 7;
    if (/^D6$/i.test(s))  return 3.5;
    if (/^D3$/i.test(s))  return 2;
    return parseFloat(s) || 1;
  }

  // First ranged weapon from gameData for this unit, normalised to pipeline field names.
  // Falls back to UNIT_STATS[type].weapon if unit has no factionId (legacy units).
  function getRangedWeapon(unit) {
    const def = (unit.factionId && window.getRosterUnitDef)
      ? window.getRosterUnitDef(unit.factionId, unit.unitId) : null;
    if (def && def.weapons) {
      const w = Object.values(def.weapons).find(w => w.type === 'ranged');
      if (w) return { name: w.name, range: w.range, attacks: w.attacks, bs: w.skill, strength: w.S, ap: w.AP, damage: w.D };
    }
    return ((window.UNIT_STATS || {})[unit.type] || {}).weapon || {};
  }

  // First melee weapon from gameData, falling back to UNIT_STATS[type].meleeWeapon
  function getMeleeWeapon(unit) {
    const def = (unit.factionId && window.getRosterUnitDef)
      ? window.getRosterUnitDef(unit.factionId, unit.unitId) : null;
    if (def && def.weapons) {
      const w = Object.values(def.weapons).find(w => w.type === 'melee');
      if (w) return { name: w.name, range: 0, attacks: w.attacks, ws: w.skill, strength: w.S, ap: w.AP, damage: w.D };
    }
    return ((window.UNIT_STATS || {})[unit.type] || {}).meleeWeapon || {};
  }

  // Target toughness, save, baseRadius — from gameData or UNIT_STATS fallback
  function getTargetProfile(unit) {
    const def = (unit.factionId && window.getRosterUnitDef)
      ? window.getRosterUnitDef(unit.factionId, unit.unitId) : null;
    if (def && def.stats) {
      return {
        toughness:  parseStat(def.stats.T),
        save:       parseStat(def.stats.SV),
        baseRadius: def.baseRadius || 0.5,
      };
    }
    const s = (window.UNIT_STATS || {})[unit.type] || {};
    return { toughness: s.toughness || 3, save: s.save || 6, baseRadius: s.baseRadius || 0.5 };
  }

  function woundThreshold(str, t) {
    if (str >= t * 2) return 2;
    if (str >  t)     return 3;
    if (str === t)    return 4;
    if (str * 2 <= t) return 6;
    return 5;
  }

  // Best single-ray LOS from sm to any alive target model — 'clear' | 'cover' | 'blocked'
  // 'clear' | 'cover' | 'blocked' — best single-ray result from sm to any in-range target model
  function modelCanContribute(sm, targetModels, weaponRange, terrain) {
    let best = 'blocked';
    for (const tm of targetModels) {
      if (Math.hypot(sm.x - tm.x, sm.y - tm.y) > weaponRange) continue;
      const r = rayResult(sm.x, sm.y, tm.x, tm.y, terrain);
      if (r === 'clear') return 'clear';
      if (r === 'cover') best = 'cover';
    }
    return best;
  }

  // Statistical estimate — no dice rolled. Used for display before Confirm.
  // Returns { attacks, hits, wounds, unsaved, models, hasCover }
  function estimateAttacks(shooterGroup, allUnits, targetGroupId, hasCover, terrain) {
    terrain = terrain || {};
    const all           = Object.values(allUnits);
    const shooterModels = all.filter(u => u.unitGroup === shooterGroup  && u.alive);
    const targetModels  = all.filter(u => u.unitGroup === targetGroupId && u.alive);
    if (!shooterModels.length || !targetModels.length) return { attacks:0, hits:0, wounds:0, unsaved:0, models:0, hasCover };

    const tgtProfile = getTargetProfile(targetModels[0]);
    const toughness  = tgtProfile.toughness;
    const baseSave   = tgtProfile.save;

    let totalAttacks = 0, expHits = 0, expWounds = 0, expUnsaved = 0, expModels = 0;

    shooterModels.forEach(sm => {
      const w           = getRangedWeapon(sm);
      const weaponRange = w.range    || 0;
      if (modelCanContribute(sm, targetModels, weaponRange, terrain) === 'blocked') return;
      const attacks  = avgCount(w.attacks  || 1);
      const bs       = w.bs       || 4;
      const strength = w.strength || 3;
      const ap       = w.ap       || 0;
      const damage   = avgCount(w.damage   || 1);
      const wndThr   = woundThreshold(strength, toughness);
      const modSave  = Math.max(2, Math.min(7, baseSave - ap - (hasCover ? 1 : 0)));

      const pHit      = Math.max(0, Math.min(1, (7 - bs)     / 6));
      const pWound    = Math.max(0, Math.min(1, (7 - wndThr)  / 6));
      const pFailSave = Math.min(1, (modSave - 1) / 6);

      const hits    = attacks * pHit;
      const wounds  = hits    * pWound;
      const unsaved = wounds  * pFailSave;

      totalAttacks += attacks;
      expHits      += hits;
      expWounds    += wounds;
      expUnsaved   += unsaved;
      expModels    += unsaved / damage;
    });

    return { attacks: totalAttacks, hits: expHits, wounds: expWounds, unsaved: expUnsaved, models: expModels, hasCover };
  }

  // Full shooting resolution: each alive shooter model fires its weapon at the target group.
  // Returns { casualties, summary: string[], rolls: RollEntry[] }
  // RollEntry: { modelId, bs, wndThr, modSave, hitRoll, hit?, woundRoll?, wound?, saveRoll?, saved?, damage? }
  function resolveAttacks(shooterGroup, allUnits, targetGroupId, hasCover, terrain) {
    terrain = terrain || {};
    const all           = Object.values(allUnits);
    const shooterModels = all.filter(u => u.unitGroup === shooterGroup  && u.alive);
    const targetModels  = all.filter(u => u.unitGroup === targetGroupId && u.alive)
                             .map(u => ({ ...u }));

    if (!shooterModels.length || !targetModels.length) {
      return { casualties: {}, summary: ['No models to shoot or no targets.'], rolls: [] };
    }

    const tgtProfile = getTargetProfile(targetModels[0]);
    const toughness  = tgtProfile.toughness;
    const baseSave   = tgtProfile.save;

    let totalAttacks = 0, totalHits = 0, totalWounds = 0, totalFailed = 0;
    const casualties = {};
    const rolls      = [];
    let tIdx = 0;

    shooterModels.forEach(sm => {
      const w           = getRangedWeapon(sm);
      const weaponRange = w.range    || 0;
      if (modelCanContribute(sm, targetModels, weaponRange, terrain) === 'blocked') return;
      const attacks  = resolveCount(w.attacks  || 1);
      const bs       = w.bs       || 4;
      const strength = w.strength || 3;
      const ap       = w.ap       || 0;
      const wndThr   = woundThreshold(strength, toughness);
      const modSave  = Math.max(2, Math.min(7, baseSave - ap - (hasCover ? 1 : 0)));

      totalAttacks += attacks;
      for (let a = 0; a < attacks; a++) {
        const roll = { modelId: sm.id, bs, wndThr, modSave };

        roll.hitRoll = d6();
        if (roll.hitRoll < bs) { rolls.push(roll); continue; }
        roll.hit = true; totalHits++;

        roll.woundRoll = d6();
        if (roll.woundRoll < wndThr) { rolls.push(roll); continue; }
        roll.wound = true; totalWounds++;

        roll.saveRoll = d6();
        roll.saved    = roll.saveRoll >= modSave;
        if (roll.saved) { rolls.push(roll); continue; }

        totalFailed++;
        const dmgRoll = resolveCount(w.damage || 1);
        roll.damage = dmgRoll;
        let dmg = dmgRoll;
        while (dmg > 0 && tIdx < targetModels.length) {
          const tm    = targetModels[tIdx];
          const taken = Math.min(dmg, tm.wounds);
          tm.wounds  -= taken;
          dmg        -= taken;
          casualties[tm.id] = { woundsLeft: tm.wounds, alive: tm.wounds > 0 };
          if (tm.wounds <= 0) tIdx++;
        }
        rolls.push(roll);
      }
    });

    const dead    = Object.values(casualties).filter(c => !c.alive).length;
    const summary = [
      `${shooterModels.length} models · ${totalAttacks} attack${totalAttacks !== 1 ? 's' : ''} → ${totalHits} hit${totalHits !== 1 ? 's' : ''}, ${totalWounds} wound${totalWounds !== 1 ? 's' : ''}, ${totalFailed} unsaved`,
      hasCover ? 'Cover save bonus: +1 to save' : null,
      `${dead} model${dead !== 1 ? 's' : ''} removed`,
    ].filter(Boolean);

    return { casualties, summary, rolls };
  }

  // Returns [{groupId, minGap}] — enemy groups within 12" with LOS from the charger.
  // minGap = closest model-to-model distance; charge roll must be >= (minGap - 1).
  function findChargeTargets(chargerGroupId, allUnits, terrain) {
    const all = Object.values(allUnits);
    const chargers = all.filter(u => u.unitGroup === chargerGroupId && u.alive);
    if (!chargers.length) return [];
    const chargerFaction = chargers[0].faction;

    const enemyGroups = {};
    all.forEach(u => {
      if (u.faction === chargerFaction || !u.alive) return;
      (enemyGroups[u.unitGroup] = enemyGroups[u.unitGroup] || []).push(u);
    });

    const results = [];
    Object.entries(enemyGroups).forEach(([groupId, enemies]) => {
      if (!unitInRange(chargers, enemies, 12)) return;
      const los = unitLOS(chargers, enemies, terrain || {});
      if (!los.visible) return;
      let minGap = Infinity;
      chargers.forEach(c => enemies.forEach(e => {
        minGap = Math.min(minGap, Math.hypot(c.x - e.x, c.y - e.y));
      }));
      results.push({ groupId, minGap });
    });
    return results;
  }

  // Statistical estimate for melee — no dice. Returns same shape as estimateAttacks.
  function estimateMeleeAttacks(fighterGroupId, allUnits, targetGroupId) {
    const all      = Object.values(allUnits);
    const fighters = all.filter(u => u.unitGroup === fighterGroupId && u.alive);
    const targets  = all.filter(u => u.unitGroup === targetGroupId  && u.alive);
    if (!fighters.length || !targets.length) return { attacks:0, hits:0, wounds:0, unsaved:0, models:0 };

    const tgtProfile = getTargetProfile(targets[0]);
    const toughness  = tgtProfile.toughness;
    const baseSave   = tgtProfile.save;

    let totalAttacks=0, expHits=0, expWounds=0, expUnsaved=0, expModels=0;
    fighters.forEach(f => {
      const mw       = getMeleeWeapon(f);
      const attacks  = avgCount(mw.attacks  || 1);
      const ws       = mw.ws       || 4;
      const strength = mw.strength || 3;
      const ap       = mw.ap       || 0;
      const damage   = avgCount(mw.damage   || 1);
      const wndThr   = woundThreshold(strength, toughness);
      const modSave  = Math.max(2, Math.min(7, baseSave - ap));
      const pHit      = Math.max(0, Math.min(1, (7 - ws)    / 6));
      const pWound    = Math.max(0, Math.min(1, (7 - wndThr) / 6));
      const pFailSave = Math.min(1, (modSave - 1) / 6);
      const hits    = attacks * pHit;
      const wounds  = hits    * pWound;
      const unsaved = wounds  * pFailSave;
      totalAttacks += attacks;
      expHits      += hits;
      expWounds    += wounds;
      expUnsaved   += unsaved;
      expModels    += unsaved / damage;
    });
    return { attacks: totalAttacks, hits: expHits, wounds: expWounds, unsaved: expUnsaved, models: expModels };
  }

  // Full melee resolution — same hit/wound/save chain as shooting, using meleeWeapon + WS.
  // No range or LOS check (engagement range eligibility is the caller's responsibility).
  function resolveMeleeAttacks(fighterGroupId, allUnits, targetGroupId) {
    const all      = Object.values(allUnits);
    const fighters = all.filter(u => u.unitGroup === fighterGroupId && u.alive);
    const targets  = all.filter(u => u.unitGroup === targetGroupId  && u.alive).map(u => ({ ...u }));

    if (!fighters.length || !targets.length) {
      return { casualties: {}, summary: ['No fighters or no targets.'], rolls: [] };
    }

    const tgtProfile = getTargetProfile(targets[0]);
    const toughness  = tgtProfile.toughness;
    const baseSave   = tgtProfile.save;

    let totalAttacks=0, totalHits=0, totalWounds=0, totalFailed=0;
    const casualties = {};
    const rolls      = [];
    let tIdx = 0;

    fighters.forEach(f => {
      const mw       = getMeleeWeapon(f);
      const attacks  = resolveCount(mw.attacks  || 1);
      const ws       = mw.ws       || 4;
      const strength = mw.strength || 3;
      const ap       = mw.ap       || 0;
      const wndThr   = woundThreshold(strength, toughness);
      const modSave  = Math.max(2, Math.min(7, baseSave - ap));

      totalAttacks += attacks;
      for (let a = 0; a < attacks; a++) {
        const roll = { modelId: f.id, ws, wndThr, modSave };
        roll.hitRoll = d6();
        if (roll.hitRoll < ws) { rolls.push(roll); continue; }
        roll.hit = true; totalHits++;

        roll.woundRoll = d6();
        if (roll.woundRoll < wndThr) { rolls.push(roll); continue; }
        roll.wound = true; totalWounds++;

        roll.saveRoll = d6();
        roll.saved    = roll.saveRoll >= modSave;
        if (roll.saved) { rolls.push(roll); continue; }

        totalFailed++;
        const mDmgRoll = resolveCount(mw.damage || 1);
        roll.damage = mDmgRoll;
        let dmg = mDmgRoll;
        while (dmg > 0 && tIdx < targets.length) {
          const tm   = targets[tIdx];
          const taken = Math.min(dmg, tm.wounds);
          tm.wounds  -= taken;
          dmg        -= taken;
          casualties[tm.id] = { woundsLeft: tm.wounds, alive: tm.wounds > 0 };
          if (tm.wounds <= 0) tIdx++;
        }
        rolls.push(roll);
      }
    });

    const dead = Object.values(casualties).filter(c => !c.alive).length;
    return {
      casualties,
      rolls,
      summary: [
        `${fighters.length} model${fighters.length!==1?'s':''} · ${totalAttacks} attack${totalAttacks!==1?'s':''} → ${totalHits} hit${totalHits!==1?'s':''}, ${totalWounds} wound${totalWounds!==1?'s':''}, ${totalFailed} unsaved`,
        `${dead} model${dead!==1?'s':''} removed`
      ]
    };
  }

  return { findValidTargets, findChargeTargets, estimateAttacks, resolveAttacks, estimateMeleeAttacks, resolveMeleeAttacks, unitLOS, unitInRange, rayResult };
})();
