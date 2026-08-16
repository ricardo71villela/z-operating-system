'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');

const files = {
  US: ['content/legal/US/ZFind_MasterPack_UnitedStates_EN.md', 'a1c8bc47f76a23f8b8a958f6d5e3db5da5627667ff9f5eabb25ed3aad102aae0'],
  CA: ['content/legal/CA/ZFind_MasterPack_Canada_EN.md', '629c18fa8b197d63a8e304faeb07bad497af0958a181ef10206dac7b93330ee0'],
  MX: ['content/legal/MX/ZFind_MasterPack_Mexico_ES.md', '931e065fa0b07e37907be2f2a3374ad0a477c32263147b42ccfe55bd6c56f07a'],
  BR: ['content/legal/BR/ZFind_MasterPack_Brasil_PT.md', 'c9ca5bbe0d105b1605f5c41314ae84891138bb270d5a31c337cddd1f204e2b8d'],
  AR: ['content/legal/AR/ZFind_MasterPack_Argentina_ES.md', '7af17fe9da3843743829d96d50642a3460b1b32ae050f5ba036bb5356c1f7170'],
};

const body = fs.readFileSync(path.join(ROOT, 'apps/zfind-web/src/body.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'apps/zfind-web/src/app.js'), 'utf8');
const staticTest = fs.readFileSync(path.join(ROOT, 'tests/unit/static-view-routing-contract.test.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function sha(rel) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, rel)))
    .digest('hex');
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

console.log('');
console.log('=== AMERICAS LEGAL JURISDICTION FOUNDATION ===');

for (const [iso, [rel, expectedHash]] of Object.entries(files)) {
  const text = read(rel);

  check(`${iso} canonical Master hash exact`, sha(rel) === expectedHash);
  check(`${iso} research remains DRAFT`,
    text.includes('**review_status:** DRAFT') &&
    text.includes('"qualified_legal_review_completed": false'));
  check(`${iso} authority mode is PRIMARY_OFFICIAL`,
    text.includes('**authority_mode:** PRIMARY_OFFICIAL'));
  check(`${iso} re-audit horizon exact`,
    text.includes('**research_date:** 2026-08-15') &&
    text.includes('**rules_checked_through:** 2026-08-16') &&
    text.includes('**official_reaudit_scope:**'));
}

const us = read(files.US[0]);
const ca = read(files.CA[0]);
const mx = read(files.MX[0]);
const br = read(files.BR[0]);
const ar = read(files.AR[0]);

check('US canonical semantic contract retained',
  us.includes('CS/HJR 1-F') &&
  us.includes('real property is excluded') &&
  us.includes('not a general federal prohibition') &&
  !us.includes('Florida Amendment 3'));

check('CA canonical semantic contract retained',
  ca.includes('2.1% for 2026') &&
  ca.includes('2026 guideline 2.1%') &&
  ca.includes('subsection **116(5.3)**') &&
  !ca.includes('2026 guideline 2.5%'));

check('MX canonical semantic contract retained',
  mx.includes('25% sobre el ingreso total') &&
  mx.includes('máximo de **90 noches por año**') &&
  mx.includes('| MX-05 | Congreso del Estado de Jalisco |') &&
  !mx.includes('180/90 noches'));

check('BR canonical semantic contract retained',
  br.includes('Tema 1113/STJ') &&
  br.includes('Tema 1443/STJ') &&
  br.includes('situação **“Afetado”**') &&
  br.includes('duas exclusões'));

check('AR canonical semantic contract retained',
  ar.includes('Ley 27.802') &&
  ar.includes('Decreto 406/2026') &&
  ar.includes('RG ARCA 5697/2025') &&
  ar.includes('estado **PENDIENTE**'));

const routes = [
  'legal-united-states',
  'tourist-rental-united-states',
  'legal-canada',
  'tourist-rental-canada',
  'legal-mexico',
  'tourist-rental-mexico',
  'legal-brazil',
  'tourist-rental-brazil',
  'legal-argentina',
  'tourist-rental-argentina',
];

for (const route of routes) {
  check(`${route} public view exists exactly once`,
    occurrences(body, `id="view-${route}"`) === 1);
  check(`${route} router case exists exactly once`,
    occurrences(app, `case '${route}': break;`) === 1);
  check(`${route} is present in central static routing test`,
    staticTest.includes(`'${route}'`));
}

const localeCoupling = app.split('\n').some(line =>
  line.includes('state.lang') &&
  /legal-united-states|tourist-rental-united-states|legal-canada|tourist-rental-canada|legal-mexico|tourist-rental-mexico|legal-brazil|tourist-rental-brazil|legal-argentina|tourist-rental-argentina/.test(line)
);

check('Americas jurisdiction is not inferred from UI locale', !localeCoupling);

check('Americas regression is registered',
  pkg.scripts['test:legal-guide-americas-foundation'] ===
  'node tests/unit/legal-guide-americas-foundation.test.js');

check('Americas regression participates in package check',
  pkg.scripts.check.includes('npm run test:legal-guide-americas-foundation'));

console.log('');

if (failed) {
  console.error(`AMERICAS LEGAL FOUNDATION: ${passed} PASSED, ${failed} FAILED`);
  process.exit(1);
}

console.log(`AMERICAS LEGAL FOUNDATION: ${passed}/${passed} PASSED`);
