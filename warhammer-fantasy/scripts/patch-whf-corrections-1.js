#!/usr/bin/env node
/**
 * WHF Corrections Pass 1
 *
 * Corrections from Nox spot-check against 8th.whfb.app (2026-06-27):
 *
 * 1. grail-knights stats: WS 6→5, I 6→5, A 3→2, Ld 10→8
 *    (Hades over-estimated from memory; 8th edition confirmed values are lower)
 *
 * 2. Living Saints ability → grail-knights
 *
 * 3. Lance Formation ability (rank-of-3 errata) → knights-of-the-realm,
 *    questing-knights, grail-knights
 *    Existing Lance Formation ability on KotR/Grail Knights updated to include
 *    the rank-of-3 rule. Questing Knights receive it as a new entry.
 *
 * Note: warhorse M was already "8\"" — no change needed there.
 */

const https = require('https');

const DB_HOST = 'warhammer-5f2f4-default-rtdb.firebaseio.com';

function get(fbPath) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: DB_HOST, path: `/${fbPath}.json` }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function put(fbPath, data) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(data));
    const req  = https.request({
      hostname: DB_HOST,
      path:     `/${fbPath}.json`,
      method:   'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode === 200) resolve();
        else reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── ABILITY DEFINITIONS ──────────────────────────────────────────────────────

const LIVING_SAINTS = {
  name: 'Living Saints',
  type: 'passive',
  description: 'Every model in this unit can issue and accept challenges as if they were a Champion.',
};

// Replaces / supersedes the existing "Lance Formation" ability text to add rank-of-3 errata.
// This single description covers both the extra-rank fighting rule AND the 8th ed errata.
const LANCE_FORMATION_FULL = {
  name: 'Lance Formation',
  type: 'passive',
  description: 'All models in the first three ranks fight on the charge. A rank of three or more models counts as a full rank for all purposes (rank bonus, Steadfast, etc.).',
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function replaceLanceFormation(abilities) {
  // Replace existing Lance Formation entry if present; otherwise append.
  const idx = abilities.findIndex(a => a.name === 'Lance Formation');
  if (idx !== -1) {
    abilities[idx] = LANCE_FORMATION_FULL;
  } else {
    abilities.push(LANCE_FORMATION_FULL);
  }
  return abilities;
}

function addAbilityIfMissing(abilities, ability) {
  if (!abilities.find(a => a.name === ability.name)) {
    abilities.push(ability);
  }
  return abilities;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('WHF Corrections Pass 1\n');

  // 1. grail-knights: fix stats + add Living Saints + update Lance Formation
  {
    console.log('Patching grail-knights...');
    const unit = await get('gameData/warhammer-fantasy/bretonnia/units/grail-knights');

    unit.stats.WS = '5';
    unit.stats.I  = '5';
    unit.stats.A  = '2';
    unit.stats.Ld = '8';

    let abilities = Array.isArray(unit.abilities) ? unit.abilities : [];
    abilities = replaceLanceFormation(abilities);
    abilities = addAbilityIfMissing(abilities, LIVING_SAINTS);
    unit.abilities = abilities;

    await put('gameData/warhammer-fantasy/bretonnia/units/grail-knights', unit);
    console.log('  ✓ stats WS5/I5/A2/Ld8, Living Saints added, Lance Formation updated\n');
  }

  // 2. knights-of-the-realm: update Lance Formation
  {
    console.log('Patching knights-of-the-realm...');
    const unit = await get('gameData/warhammer-fantasy/bretonnia/units/knights-of-the-realm');

    let abilities = Array.isArray(unit.abilities) ? unit.abilities : [];
    abilities = replaceLanceFormation(abilities);
    unit.abilities = abilities;

    await put('gameData/warhammer-fantasy/bretonnia/units/knights-of-the-realm', unit);
    console.log('  ✓ Lance Formation updated (rank-of-3 errata)\n');
  }

  // 3. questing-knights: add Lance Formation (rank formation applies even without lances)
  {
    console.log('Patching questing-knights...');
    const unit = await get('gameData/warhammer-fantasy/bretonnia/units/questing-knights');

    let abilities = Array.isArray(unit.abilities) ? unit.abilities : [];
    abilities = replaceLanceFormation(abilities);
    unit.abilities = abilities;

    await put('gameData/warhammer-fantasy/bretonnia/units/questing-knights', unit);
    console.log('  ✓ Lance Formation added (rank-of-3 errata; applies to rank bonus / Steadfast)\n');
  }

  console.log('All corrections applied.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
