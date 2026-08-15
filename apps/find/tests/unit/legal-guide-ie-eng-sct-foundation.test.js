#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FIND = path.resolve(__dirname, '../..');
const WEB = path.join(FIND, 'apps/zfind-web');

const body = fs.readFileSync(
  path.join(WEB, 'src/body.html'),
  'utf8'
);

const app = fs.readFileSync(
  path.join(WEB, 'src/app.js'),
  'utf8'
);

const pkg = fs.readFileSync(
  path.join(FIND, 'package.json'),
  'utf8'
);

const countries = [
  {
    iso: 'IE',
    legal: 'legal-ie',
    tourist: 'tourist-rental-ie',
    master:
      'content/legal/IE/ZFind_MasterPack_Ireland_EN.md',
    terms: [
      'Sale Agreed',
      'Stamp Duty',
      'Local Property Tax',
      'Residential Tenancies Board'
    ]
  },
  {
    iso: 'GB-ENG',
    legal: 'legal-england',
    tourist: 'tourist-rental-england',
    master:
      'content/legal/GB-ENG/ZFind_MasterPack_England_EN.md',
    terms: [
      'Stamp Duty Land Tax',
      'Council Tax',
      'Renters&#x27; Rights Act 2025',
      'leasehold'
    ]
  },
  {
    iso: 'GB-SCT',
    legal: 'legal-scotland',
    tourist: 'tourist-rental-scotland',
    master:
      'content/legal/GB-SCT/ZFind_MasterPack_Scotland_EN.md',
    terms: [
      'missives',
      'Land and Buildings Transaction Tax',
      'Private Residential Tenancy',
      'tenement'
    ]
  }
];

let passed = 0;

function check(value, label) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}

console.log(
  '\n=== IE + ENGLAND + SCOTLAND LEGAL FOUNDATION ==='
);

for (const c of countries) {
  const masterPath = path.join(
    FIND,
    c.master
  );

  check(
    fs.existsSync(masterPath),
    `${c.iso} master preserved`
  );

  const master = fs.readFileSync(
    masterPath,
    'utf8'
  );

  check(
    master.includes(
      `**country_iso:** ${c.iso}`
    ),
    `${c.iso} jurisdiction metadata explicit`
  );

  check(
    body.includes(
      `id="view-${c.legal}"`
    ),
    `${c.iso} Legal Guide exists`
  );

  check(
    body.includes(
      `id="view-${c.tourist}"`
    ),
    `${c.iso} short-term view exists`
  );

  for (const term of c.terms) {
    check(
      body
        .toLowerCase()
        .includes(term.toLowerCase()),
      `${c.iso} contains ${term}`
    );
  }

  check(
    app.includes(
      `case '${c.legal}': break;`
    ) &&
    app.includes(
      `case '${c.tourist}': break;`
    ),
    `${c.iso} router recognizes both views`
  );
}

[
  "navigate('legal-ie')",
  "navigate('legal-england')",
  "navigate('legal-scotland')",
  "navigate('tourist-rental-ie')",
  "navigate('tourist-rental-england')",
  "navigate('tourist-rental-scotland')"
].forEach(route => {
  check(
    body.includes(route),
    `navigation exposes ${route}`
  );
});

check(
  pkg.includes(
    '"test:legal-guide-ie-eng-sct-foundation"'
  ),
  'IE/ENG/SCT regression registered'
);

console.log(
  `\nIE/ENG/SCT LEGAL FOUNDATION: ` +
  `${passed}/${passed} PASSED`
);
