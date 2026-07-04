#!/usr/bin/env node
// extract-glossary.js — parse .gst files from BSData repos and output rule glossaries

const fs   = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const KT_GST  = path.join(process.env.HOME, 'projects/bsdata-killteam/2024 - Kill Team.gst');
const W40K_GST = path.join(process.env.HOME, 'projects/bsdata-40k/Warhammer 40,000.gst');
const OUT_DIR  = path.join(__dirname, '../output');

const PARSER_OPTS = {
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  textNodeName:        '#text',
  isArray: (name) => ['rule', 'alias'].includes(name),
};

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/'/g,  '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseGlossary(gstPath, label) {
  console.log(`Parsing ${label} glossary from: ${gstPath}`);
  const xml    = fs.readFileSync(gstPath, 'utf8');
  const parser = new XMLParser(PARSER_OPTS);
  const doc    = parser.parse(xml);

  const root  = doc.gameSystem;
  const rules = (root?.sharedRules?.rule || []);

  const glossary = rules.map(rule => {
    const name    = rule['@_name'] || '';
    const desc    = rule.description || '';
    const aliases = (rule.alias || []).map(a =>
      typeof a === 'string' ? a : (a['#text'] || String(a))
    ).filter(Boolean);

    return {
      id:            slugify(name),
      name,
      description:   desc,
      aliases,
      category:      'weapon-rule',
    };
  }).filter(r => r.name);

  console.log(`  Found ${glossary.length} rules`);
  return glossary;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Kill Team
  const ktGlossary = parseGlossary(KT_GST, 'Kill Team');
  fs.writeFileSync(
    path.join(OUT_DIR, 'rules-glossary-kt.json'),
    JSON.stringify(ktGlossary, null, 2)
  );
  console.log('  → output/rules-glossary-kt.json');

  // 40k
  const w40kGlossary = parseGlossary(W40K_GST, 'Warhammer 40k');
  fs.writeFileSync(
    path.join(OUT_DIR, 'rules-glossary-40k.json'),
    JSON.stringify(w40kGlossary, null, 2)
  );
  console.log('  → output/rules-glossary-40k.json');

  // Summary
  console.log('\nKill Team rules:');
  ktGlossary.forEach(r => {
    const aliases = r.aliases.length ? ` [${r.aliases.join(', ')}]` : '';
    console.log(`  ${r.id}  —  ${r.name}${aliases}`);
  });

  console.log('\nWarhammer 40k rules:');
  w40kGlossary.forEach(r => {
    const aliases = r.aliases.length ? ` [${r.aliases.join(', ')}]` : '';
    console.log(`  ${r.id}  —  ${r.name}${aliases}`);
  });
}

main();
