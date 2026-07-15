#!/usr/bin/env node
// upload.js — upload parsed JSON files to Firebase RTDB
// Run ONLY after Nox has reviewed and approved all output JSON files.
// Reads Firebase config at runtime from ../roster/firebase-config.js — no
// hardcoded credentials.

const fs       = require('fs');
const path     = require('path');
const https    = require('https');
const readline = require('readline');

// ── Config ─────────────────────────────────────────────────────────────────────

// GIT-2 monorepo migration: data-pipeline/ and roster/ are now siblings
// under the same repo root, so this is relative to this file instead of
// hardcoded against $HOME/projects/roster (the old separate-repos layout,
// which broke the moment roster/ moved to warhammer/roster/).
const FIREBASE_CONFIG_PATH = path.join(__dirname, '../../roster/firebase-config.js');
const OUT_DIR   = path.join(__dirname, '../output');
const PLOYS_DIR = path.join(__dirname, '../ploys');
const STRATS_DIR = path.join(__dirname, '../stratagems');

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');
// --only=slug1,slug2 — targeted re-upload (PATCH_OVERLAY_BRIEF.md Part 1):
// runs just the matching KT/40k faction files, skips rules/ploys/
// stratagems/bonuses entirely. For re-pushing a small correction (e.g. a
// patches.json fix) without re-running the whole catalog.
const ONLY_ARG = process.argv.find(a => a.startsWith('--only='));
const ONLY = ONLY_ARG ? ONLY_ARG.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean) : null;

// ── Firebase config loader ─────────────────────────────────────────────────────

function loadFirebaseConfig() {
  const raw = fs.readFileSync(FIREBASE_CONFIG_PATH, 'utf8');
  // Extract databaseURL from the JS config file
  const match = raw.match(/databaseURL\s*:\s*["']([^"']+)["']/);
  if (!match) throw new Error('Could not extract databaseURL from firebase-config.js');
  return { databaseURL: match[1] };
}

// ── Firebase REST helpers ──────────────────────────────────────────────────────

function firebaseRequest(method, dbUrl, fbPath, data, query) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${fbPath}.json`, dbUrl);
    // Query params (e.g. shallow=true) must be set on the URL object AFTER
    // ".json" is appended to the path, not baked into fbPath beforehand —
    // doing the latter produced ".../info?shallow=true.json" (the ".json"
    // landing inside the query string value), which Firebase 301-redirects
    // instead of answering. exists() silently caught that as "false" for
    // every single call — every skip-if-exists check in this file has been
    // dead code since this function was written.
    if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(raw || 'null'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function exists(dbUrl, fbPath) {
  try {
    const result = await firebaseRequest('GET', dbUrl, fbPath, null, { shallow: 'true' });
    return result !== null;
  } catch {
    return false;
  }
}

async function put(dbUrl, fbPath, data) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] PUT ${fbPath}`);
    return;
  }
  await firebaseRequest('PUT', dbUrl, fbPath, data);
}

// ── Confirmation prompt ────────────────────────────────────────────────────────

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Upload functions ───────────────────────────────────────────────────────────

async function uploadKtFaction(dbUrl, file) {
  const data   = JSON.parse(fs.readFileSync(file, 'utf8'));
  const slug   = data.id;
  const base   = `gameData/kill-team/factions/${slug}`;

  const unitCount = (data.operatives || []).length;
  console.log(`\nKT faction: ${data.name} (${slug}) — ${unitCount} operatives`);

  // No skip-if-exists here (removed per PATCH_OVERLAY_BRIEF.md guard note):
  // the pipeline is now authoritative, so an existing faction isn't data to
  // protect from overwrite, it's the normal case. The pre-upload manifest
  // in main() already told the operator which factions this run will
  // overwrite; this per-item YES prompt is the actual write gate.
  const answer = await confirm(`  About to write ${unitCount} operatives for ${data.name}. Type YES to continue: `);
  if (answer !== 'YES') {
    console.log('  Aborted.');
    return { skipped: true };
  }

  // Build the full faction payload
  // ROSTER-VAL: this read `data.compositionRules` — a field that has
  // never existed on the parser's faction object (it's called
  // `composition`, see parse-kt.js's parseCat return) — so composition
  // data has never once reached Firebase, always writing `composition:
  // null` regardless of what the parser derived. Second bug in the same
  // chain: roster/index.html's RosterBuilder._load() reads
  // `info.compositionRules` (nested inside `info`), not a sibling
  // `composition` key — writing to the sibling key alone would still
  // never have been seen by the app that consumes it. Fixed both: read
  // the right field, write it where roster actually looks.
  const payload = {
    info: { id: slug, name: data.name, system: 'kill-team', compositionRules: data.composition || null },
    units: {},
  };
  for (const op of (data.operatives || [])) {
    payload.units[op.id] = op;
  }

  await put(dbUrl, base, payload);
  console.log(`  ✓ Wrote ${slug}`);
  return { slug, units: unitCount };
}

async function uploadKtPloys(dbUrl, file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const slug = data.faction;
  const fbPath = `gameData/kill-team/factions/${slug}/ploys`;

  console.log(`\nKT ploys: ${slug}`);

  if (!FORCE && await exists(dbUrl, fbPath)) {
    console.log(`  SKIP: ploys already exist for ${slug} (use --force to overwrite)`);
    return { skipped: true };
  }

  const answer = await confirm(`  About to write ploys for ${slug}. Type YES to continue: `);
  if (answer !== 'YES') { console.log('  Aborted.'); return { skipped: true }; }

  await put(dbUrl, fbPath, data);
  console.log(`  ✓ Wrote ploys for ${slug}`);
  return { slug };
}

async function uploadKtRules(dbUrl) {
  const file = path.join(OUT_DIR, 'rules-glossary-kt.json');
  if (!fs.existsSync(file)) { console.warn('  WARN: rules-glossary-kt.json not found'); return; }
  const glossary = JSON.parse(fs.readFileSync(file, 'utf8'));
  const fbPath = 'gameData/kill-team/rules';

  console.log(`\nKT rules glossary — ${glossary.length} entries`);

  if (!FORCE && await exists(dbUrl, fbPath)) {
    console.log('  SKIP: KT rules already exist (use --force to overwrite)');
    return { skipped: true };
  }

  const answer = await confirm(`  About to write ${glossary.length} KT weapon rules. Type YES to continue: `);
  if (answer !== 'YES') { console.log('  Aborted.'); return { skipped: true }; }

  const payload = {};
  for (const rule of glossary) payload[rule.id] = rule;
  await put(dbUrl, fbPath, payload);
  console.log(`  ✓ Wrote KT rules`);
}

async function upload40kFaction(dbUrl, file) {
  const data     = JSON.parse(fs.readFileSync(file, 'utf8'));
  const slug     = data.id;
  const base     = `gameData/warhammer-40k/factions/${slug}`;
  const unitCount = (data.units || []).length;

  console.log(`\n40k faction: ${data.name} (${slug}) — ${unitCount} units`);

  // No skip-if-exists here — see the matching note in uploadKtFaction.
  const answer = await confirm(`  About to write ${unitCount} units for ${data.name}. Type YES to continue: `);
  if (answer !== 'YES') { console.log('  Aborted.'); return { skipped: true }; }

  const payload = {
    info:  { id: slug, name: data.name, system: 'warhammer-40k' },
    units: {},
  };
  for (const unit of (data.units || [])) {
    if (!unit.stats) continue; // skip units with no stats
    payload.units[unit.id] = unit;
  }

  await put(dbUrl, base, payload);
  console.log(`  ✓ Wrote ${slug} (${Object.keys(payload.units).length} units with stats)`);
  return { slug, units: Object.keys(payload.units).length };
}

async function upload40kStratagems(dbUrl, file) {
  const data   = JSON.parse(fs.readFileSync(file, 'utf8'));
  const slug   = data.faction;
  const fbPath = `gameData/warhammer-40k/factions/${slug}/stratagems`;

  console.log(`\n40k stratagems: ${slug}`);

  if (!FORCE && await exists(dbUrl, fbPath)) {
    console.log(`  SKIP: stratagems already exist for ${slug} (use --force to overwrite)`);
    return { skipped: true };
  }

  const answer = await confirm(`  About to write stratagems for ${slug}. Type YES to continue: `);
  if (answer !== 'YES') { console.log('  Aborted.'); return { skipped: true }; }

  await put(dbUrl, fbPath, data);
  console.log(`  ✓ Wrote stratagems for ${slug}`);
  return { slug };
}

async function uploadBonusesCatalog(dbUrl) {
  const file = path.join(OUT_DIR, 'bonuses-catalog.json');
  if (!fs.existsSync(file)) { console.warn('  WARN: bonuses-catalog.json not found (run npm run compile-keywords first)'); return; }
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));

  // gameData/{system}/bonuses/{bonusId} — system-first, matching every other
  // path in this pipeline (gameData/kill-team/rules, gameData/warhammer-40k/
  // factions/..., etc). A bonus with system:"any" isn't a storage location —
  // it's a source property that gets fanned out to every real system's path
  // at write time (writers fan out, readers never look in two places). The
  // per-game snapshot rule makes the duplication harmless.
  const REAL_SYSTEMS = ['kill-team', 'warhammer-40k', 'warhammer-fantasy'];
  const bySystem = {};
  for (const sys of REAL_SYSTEMS) bySystem[sys] = {};
  for (const bonus of catalog) {
    const targets = bonus.system === 'any' ? REAL_SYSTEMS : [bonus.system];
    for (const sys of targets) {
      if (!bySystem[sys]) { console.warn(`  WARN: unknown system "${sys}" on bonus ${bonus.id}, skipping`); continue; }
      bySystem[sys][bonus.id] = bonus;
    }
  }

  console.log(`\nBonuses catalog — ${catalog.length} entries`);
  for (const sys of REAL_SYSTEMS) {
    const entries = bySystem[sys];
    const count = Object.keys(entries).length;
    if (count === 0) { console.log(`  ${sys}: nothing to write, skipping`); continue; }

    const fbPath = `gameData/${sys}/bonuses`;
    if (!FORCE && await exists(dbUrl, fbPath)) {
      console.log(`  SKIP: ${sys} bonuses already exist (use --force to overwrite)`);
      continue;
    }

    const answer = await confirm(`  About to write ${count} bonuses to ${fbPath}. Type YES to continue: `);
    if (answer !== 'YES') { console.log('  Aborted.'); continue; }

    await put(dbUrl, fbPath, entries);
    console.log(`  ✓ Wrote ${count} bonuses for ${sys}`);
  }
}

async function upload40kRules(dbUrl) {
  const file = path.join(OUT_DIR, 'rules-glossary-40k.json');
  if (!fs.existsSync(file)) { console.warn('  WARN: rules-glossary-40k.json not found'); return; }
  const glossary = JSON.parse(fs.readFileSync(file, 'utf8'));
  const fbPath = 'gameData/warhammer-40k/rules';

  console.log(`\n40k rules glossary — ${glossary.length} entries`);

  if (!FORCE && await exists(dbUrl, fbPath)) {
    console.log('  SKIP: 40k rules already exist (use --force to overwrite)');
    return { skipped: true };
  }

  const answer = await confirm(`  About to write ${glossary.length} 40k weapon rules. Type YES to continue: `);
  if (answer !== 'YES') { console.log('  Aborted.'); return { skipped: true }; }

  const payload = {};
  for (const rule of glossary) payload[rule.id] = rule;
  await put(dbUrl, fbPath, payload);
  console.log(`  ✓ Wrote 40k rules`);
}

// ── Pre-upload manifest ─────────────────────────────────────────────────────
// PATCH_OVERLAY_BRIEF.md guard note: uploadKtFaction/upload40kFaction no
// longer skip existing factions silently (the pipeline is authoritative now
// — an existing faction is the normal case, not protected data). In
// exchange, this prints an upfront summary of which factions in THIS run
// already exist and will be overwritten, with one confirmation gate for the
// whole batch, before the per-item write prompts start.
async function preUploadManifest(dbUrl, ktFiles, w40kFiles) {
  const existingKt = [];
  for (const f of ktFiles) {
    const slug = JSON.parse(fs.readFileSync(f, 'utf8')).id;
    if (await exists(dbUrl, `gameData/kill-team/factions/${slug}/info`)) existingKt.push(slug);
  }
  const existingW40k = [];
  for (const f of w40kFiles) {
    const slug = JSON.parse(fs.readFileSync(f, 'utf8')).id;
    if (await exists(dbUrl, `gameData/warhammer-40k/factions/${slug}/info`)) existingW40k.push(slug);
  }

  const total = existingKt.length + existingW40k.length;
  if (total === 0) return true;

  console.log(`\n⚠ Pre-upload manifest: ${total} faction(s) already exist and WILL BE OVERWRITTEN`);
  console.log('  (the pipeline is authoritative — this is expected, not a bug):');
  if (existingKt.length) console.log(`  kill-team: ${existingKt.join(', ')}`);
  if (existingW40k.length) console.log(`  warhammer-40k: ${existingW40k.join(', ')}`);

  if (FORCE) return true;
  const answer = await confirm('\nProceed with this upload plan? Type YES to continue: ');
  return answer === 'YES';
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Firebase Upload ===');
  if (DRY_RUN) console.log('[DRY-RUN MODE — no actual writes]');
  if (FORCE)   console.log('[FORCE MODE — will overwrite existing data]');
  if (ONLY)    console.log(`[--only MODE — targeted faction re-upload: ${ONLY.join(', ')}]`);

  const { databaseURL } = loadFirebaseConfig();
  console.log(`Firebase: ${databaseURL}`);

  let ktFiles = fs.readdirSync(OUT_DIR)
    .filter(f => f.startsWith('kt-') && f.endsWith('.json'))
    .map(f => path.join(OUT_DIR, f));
  let w40kFiles = fs.readdirSync(OUT_DIR)
    .filter(f => f.startsWith('40k-') && f.endsWith('.json'))
    .map(f => path.join(OUT_DIR, f));

  if (ONLY) {
    ktFiles = ktFiles.filter(f => ONLY.includes(JSON.parse(fs.readFileSync(f, 'utf8')).id));
    w40kFiles = w40kFiles.filter(f => ONLY.includes(JSON.parse(fs.readFileSync(f, 'utf8')).id));
  }

  const proceed = await preUploadManifest(databaseURL, ktFiles, w40kFiles);
  if (!proceed) { console.log('\nAborted at pre-upload manifest.'); return; }

  // ── Kill Team ──────────────────────────────────────────────────────────────

  if (!ONLY) await uploadKtRules(databaseURL);

  for (const file of ktFiles) {
    await uploadKtFaction(databaseURL, file);
  }

  // KT ploys (hand-authored)
  if (!ONLY && fs.existsSync(PLOYS_DIR)) {
    const ployFiles = fs.readdirSync(PLOYS_DIR).filter(f => f.endsWith('.json'));
    for (const f of ployFiles) {
      await uploadKtPloys(databaseURL, path.join(PLOYS_DIR, f));
    }
  }

  // ── Warhammer 40k ─────────────────────────────────────────────────────────

  if (!ONLY) await upload40kRules(databaseURL);

  for (const file of w40kFiles) {
    await upload40kFaction(databaseURL, file);
  }

  // 40k stratagems (hand-authored)
  if (!ONLY && fs.existsSync(STRATS_DIR)) {
    const stratFiles = fs.readdirSync(STRATS_DIR).filter(f => f.endsWith('.json'));
    for (const f of stratFiles) {
      await upload40kStratagems(databaseURL, path.join(STRATS_DIR, f));
    }
  }

  // ── Bonus engine catalog (BON-1) ──────────────────────────────────────────
  if (!ONLY) await uploadBonusesCatalog(databaseURL);

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
