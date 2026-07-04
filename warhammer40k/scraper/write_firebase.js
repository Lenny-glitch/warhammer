#!/usr/bin/env node
/**
 * Phase 14 — Firebase write
 * Writes scraped AM + Eldar units to gameData/warhammer-40k/ in Firebase.
 * Run only after JSON review and approval.
 *
 * Usage: node write_firebase.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const DB_URL  = 'https://warhammer-5f2f4-default-rtdb.firebaseio.com';
const DATA_DIR = path.join(__dirname, '..', 'scraped-data');

const FACTIONS = [
  { file: 'wh40k-astra-militarum.json',   key: 'astra-militarum' },
  { file: 'wh40k-craftworlds-eldar.json', key: 'craftworlds-eldar' },
];

function put(fbPath, data) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(data));
    const req  = https.request({
      hostname: 'warhammer-5f2f4-default-rtdb.firebaseio.com',
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
        if (res.statusCode === 200) {
          resolve({ status: 200 });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  for (const { file, key } of FACTIONS) {
    const raw   = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file)));
    const units = raw.units;

    // Strip scraper-internal fields before writing
    const clean = {};
    for (const [id, unit] of Object.entries(units)) {
      const { _warnings, wahapediaSlug, ...rest } = unit;
      clean[id] = rest;
    }

    const count = Object.keys(clean).length;
    const fbPath = `gameData/warhammer-40k/${key}`;
    console.log(`Writing ${count} units → ${fbPath} ...`);

    try {
      await put(fbPath, clean);
      console.log(`  ✓ Done`);
    } catch (e) {
      console.error(`  ✗ FAILED: ${e.message}`);
      process.exit(1);
    }
  }

  console.log('\nAll done. gameData/warhammer-40k written to Firebase.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
