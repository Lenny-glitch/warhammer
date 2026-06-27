#!/usr/bin/env node
/**
 * Kill Team Firebase Writer
 *
 * Usage: node scraper/write_firebase_kt.js
 *
 * Reads scraped JSON files from scraped-data/ and writes operative data to:
 *   gameData/kill-team/factions/{factionId}/units/{unitId}
 *
 * Run only after reviewing the JSON output from scrape_kt.js.
 * This REPLACES existing data at those paths — review diffs carefully.
 *
 * Note: countsAs defaults to 1 for all operatives. Patch manually after write:
 *   - MB3 Recon Drone (tau-pathfinders): countsAs = 2
 *   - Bomb Squig (ork-kommandos): countsAs = 0.5
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const DB_HOST  = 'warhammer-5f2f4-default-rtdb.firebaseio.com';
const DATA_DIR = path.join(__dirname, '..', 'scraped-data');

const FILES = [
  { file: 'kt-ork-kommandos.json',       factionId: 'ork-kommandos' },
  { file: 'kt-tau-pathfinders.json',     factionId: 'tau-pathfinders' },
  { file: 'kt-void-dancer-troupe.json',  factionId: 'void-dancer-troupe' },
  { file: 'kt-legionary.json',           factionId: 'legionary' },
  { file: 'kt-kasrkin.json',             factionId: 'kasrkin' },
  { file: 'kt-hand-of-the-archon.json',  factionId: 'hand-of-the-archon' },
];

function put(fbPath, data) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(data));
    const req  = https.request({
      hostname: DB_HOST,
      path:     `/${fbPath}.json`,
      method:   'PUT',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': body.length,
      },
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode === 200) resolve({ status: 200 });
        else reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  for (const { file, factionId } of FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping ${file} — not found (run scrape_kt.js first)`);
      continue;
    }

    const raw        = JSON.parse(fs.readFileSync(filePath));
    const operatives = raw.operatives || {};

    // Strip scraper-internal fields before writing
    const clean = {};
    for (const [id, op] of Object.entries(operatives)) {
      const { _wahapediaSlug, _warnings, ...rest } = op;
      clean[id] = rest;
    }

    const count  = Object.keys(clean).length;
    const fbPath = `gameData/kill-team/factions/${factionId}/units`;
    console.log(`Writing ${count} operatives → ${fbPath} ...`);

    try {
      await put(fbPath, clean);
      console.log(`  ✓ Done`);
    } catch (e) {
      console.error(`  ✗ FAILED: ${e.message}`);
      process.exit(1);
    }
  }

  console.log('\nAll done.');
  console.log('\nRemember to patch countsAs for special operatives:');
  console.log('  MB3 Recon Drone (tau-pathfinders): countsAs = 2');
  console.log('  Bomb Squig (ork-kommandos): countsAs = 0.5');
}

main().catch(e => { console.error(e.message); process.exit(1); });
