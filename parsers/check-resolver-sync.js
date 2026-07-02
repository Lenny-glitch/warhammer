#!/usr/bin/env node
// check-resolver-sync.js — verifies vendored copies of shared/bonus-resolver.js
// haven't drifted from the master.
//
// shared/bonus-resolver.js is manually copied into killteam/js/ and
// warhammer40k/js/ (no npm package, no build step — see that file's header).
// Manual copies drift silently unless something checks for it. This script
// hashes the master against any copies it finds and reports match/drift/
// absent for each. Standalone, no side effects — it never writes anything.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MASTER_PATH = path.join(__dirname, '../shared/bonus-resolver.js');

// Where BON-2's copy step is expected to place vendored copies.
const VENDOR_LOCATIONS = [
  { app: 'killteam', file: path.join(__dirname, '../../killteam/js/bonus-resolver.js') },
  { app: 'warhammer40k', file: path.join(__dirname, '../../warhammer40k/js/bonus-resolver.js') },
];

function hash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main() {
  if (!fs.existsSync(MASTER_PATH)) {
    console.error(`ERROR: master not found at ${MASTER_PATH}`);
    process.exit(1);
  }
  const masterHash = hash(MASTER_PATH);
  console.log(`Master: ${MASTER_PATH}`);
  console.log(`Master sha256: ${masterHash}\n`);

  let drift = false;
  for (const { app, file } of VENDOR_LOCATIONS) {
    if (!fs.existsSync(file)) {
      console.log(`${app}: ABSENT — ${file}`);
      continue;
    }
    const copyHash = hash(file);
    if (copyHash === masterHash) {
      console.log(`${app}: MATCH — ${file}`);
    } else {
      console.log(`${app}: DRIFT — ${file}`);
      console.log(`  master sha256: ${masterHash}`);
      console.log(`  copy   sha256: ${copyHash}`);
      drift = true;
    }
  }

  if (drift) {
    console.log('\nAt least one vendored copy has drifted from the master. Re-sync before shipping.');
    process.exit(1);
  }
}

main();
