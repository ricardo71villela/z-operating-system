'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');

const files = {
  CL: [
    'content/legal/CL/ZFind_MasterPack_Chile_ES.md',
    'd462ca163b9640faab31e38d64f2b8f2f6e8a568c072362fefdda1695d91d041',
  ],
  DO: [
    'content/legal/DO/ZFind_MasterPack_RepublicaDominicana_ES.md',
    'd7bb06fd805a49493f1528de19b854d55c43731f65280f1fc9197ccf52953440',
  ],
  PL: [
    'content/legal/PL/ZFind_MasterPack_Poland_EN.md',
    '789755c7ebbf3969b917eef1894994b96658d685b85ff256406134db85d2f448',
  ],
  GR: [
    'content/legal/GR/ZFind_MasterPack_Greece_EN.md',
    '5a7a4be0ce77ac1081a54ca5b3113b31bcc17224e4b205d43c7d83ad985c287d',
  ],
  HR: [
    'content/legal/HR/ZFind_MasterPack_Croatia_EN.md',
    '1675dcefad99a1aa1c3c9d8d1d87f728fb52a4ea70f503ce1132bfe3c0def097',
  ],
  CY: [
    'content/legal/CY/ZFind_MasterPack_Cyprus_EN.md',
    'd37f8fb9022805d394ac10a715ddf7f49c0e5f6dc0f099f6de81a75806e1d1af',
  ],
  'AE-DU': [
    'content/legal/AE-DU/ZFind_MasterPack_Dubai_EN.md',
    '6a5f12c49ba41b01f916624b1055caef73acd27ba41bc31b970ee881764c79dd',
  ],
};

const officialHosts = {
  CL: ['www.senado.cl', 'www.bcn.cl', 'www.sii.cl'],
  DO: ['dgii.gov.do', 'renatur.mitur.gob.do'],
  PL: ['www.podatki.gov.pl', 'www.gov.pl', 'orka.sejm.gov.pl'],
  GR: ['minfin.gov.gr', 'www.aade.gr', 'stegasi.gov.gr'],
  HR: ['www.gov.hr', 'mints.gov.hr'],
  CY: ['www.mof.gov.cy', 'www.gov.cy'],
  'AE-DU': ['dubailand.gov.ae', 'www.dubaidet.gov.ae'],
};

const semanticGroups = {
  CL: [
    ['Boletín 18.216-05'],
    ['Ley 21.442'],
    ['aplazamiento', 'aplazada'],
  ],
  DO: [
    ['Ley 30-26'],
    ['RENATUR'],
    ['Alojamiento de renta corta'],
  ],
  PL: [
    ['PIT-39'],
    ['CWTON'],
    ['no PIT return is filed'],
  ],
  GR: [
    ['€800,000', '800,000'],
    ['€400,000', '400,000'],
    ['€250,000', '250,000'],
  ],
  HR: [
    ['within three years', 'three-year', 'three years'],
    ['25%'],
    ['Croatian citizens under 45', 'Croatian citizen under 45'],
  ],
  CY: [
    ['Law 239(I)/2025', '239(I)/2025'],
    ['1 July 2026'],
    ['electronic payment', 'electronic means of payment'],
  ],
  'AE-DU': [
    ['Emirate of Dubai'],
    ['AED 2 million', 'AED 2m'],
    ['AED 400,000', 'AED 400k'],
  ],
};

const countries = [
  { iso: 'CL', label: 'Chile', slug: 'chile' },
  { iso: 'DO', label: 'República Dominicana', slug: 'dominican-republic' },
  { iso: 'PL', label: 'Poland', slug: 'poland' },
  { iso: 'GR', label: 'Greece', slug: 'greece' },
  { iso: 'HR', label: 'Croatia', slug: 'croatia' },
  { iso: 'CY', label: 'Cyprus', slug: 'cyprus' },
  { iso: 'AE-DU', label: 'Dubai', slug: 'dubai' },
];

const body = fs.readFileSync(
  path.join(ROOT, 'apps/zfind-web/src/body.html'),
  'utf8'
);
const app = fs.readFileSync(
  path.join(ROOT, 'apps/zfind-web/src/app.js'),
  'utf8'
);
const staticTest = fs.readFileSync(
  path.join(ROOT, 'tests/unit/static-view-routing-contract.test.js'),
  'utf8'
);
const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function sha(rel) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, rel)))
    .digest('hex');
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function hasAny(text, markers) {
  const low = text.toLowerCase();
  return markers.some(marker =>
    low.includes(marker.toLowerCase())
  );
}

console.log('');
console.log(
  '=== GLOBAL LEGAL WAVE — 7 JURISDICTION FOUNDATION ==='
);

for (const [iso, [rel, expectedHash]] of Object.entries(files)) {
  const text = read(rel);

  check(
    `${iso} canonical Master hash exact`,
    sha(rel) === expectedHash
  );

  check(
    `${iso} research remains DRAFT and unapproved`,
    text.includes('**review_status:** DRAFT') &&
      text.includes('**canonical_research_status:** DRAFT') &&
      text.includes('**legal_review_approved:** false')
  );

  check(
    `${iso} authority mode is PRIMARY_OFFICIAL`,
    text.includes('**authority_mode:** PRIMARY_OFFICIAL')
  );

  check(
    `${iso} embedded primary-official provenance retained`,
    text.includes('**official_primary_sources_r2b:**') &&
      officialHosts[iso].every(host => text.includes(host))
  );
}

for (const [iso, groups] of Object.entries(semanticGroups)) {
  const text = read(files[iso][0]);

  check(
    `${iso} material canonical semantic contract retained`,
    groups.every(group => hasAny(text, group))
  );
}

const routes = countries.flatMap(country => [
  `legal-${country.slug}`,
  `tourist-rental-${country.slug}`,
]);

for (const route of routes) {
  check(
    `${route} public view exists exactly once`,
    occurrences(body, `id="view-${route}"`) === 1
  );

  check(
    `${route} router case exists exactly once`,
    occurrences(app, `case '${route}': break;`) === 1
  );

  check(
    `${route} is present in central static routing test`,
    staticTest.includes(`'${route}'`)
  );
}

const localeCoupling = app.split('\n').some(line =>
  line.includes('state.lang') &&
  routes.some(route => line.includes(route))
);

check(
  'Global-wave jurisdiction is not inferred from UI locale',
  !localeCoupling
);

check(
  'Global-wave regression is registered',
  pkg.scripts['test:legal-guide-global-wave-foundation'] ===
    'node tests/unit/legal-guide-global-wave-foundation.test.js'
);

check(
  'Global-wave regression participates in package check',
  pkg.scripts.check.includes(
    'npm run test:legal-guide-global-wave-foundation'
  )
);

console.log('');

if (failed) {
  console.error(
    `GLOBAL LEGAL WAVE FOUNDATION: ${passed} PASSED, ${failed} FAILED`
  );
  process.exit(1);
}

console.log(
  `GLOBAL LEGAL WAVE FOUNDATION: ${passed}/${passed} PASSED`
);
