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
    iso: 'FR',
    legal: 'legal-fr',
    tourist: 'tourist-rental-fr',
    master: 'content/legal/FR/ZFind_MasterPack_France_FR.md',
    terms: [
      'compromis de vente',
      'taxe foncière',
      'copropriété',
      'location touristique'
    ]
  },
  {
    iso: 'DE',
    legal: 'legal-de',
    tourist: 'tourist-rental-de',
    master: 'content/legal/DE/ZFind_MasterPack_Deutschland_DE.md',
    terms: [
      'Grunderwerbsteuer',
      'Grundbuch',
      'Mietpreisbremse',
      'Wohnungseigentum'
    ]
  },
  {
    iso: 'IT',
    legal: 'legal-it',
    tourist: 'tourist-rental-it',
    master: 'content/legal/IT/ZFind_MasterPack_Italia_IT.md',
    terms: [
      'imposta di registro',
      'IMU',
      'Condominio',
      'reciprocità'
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
  '\n=== FR + DE + IT LEGAL JURISDICTION FOUNDATION ==='
);

for (const c of countries) {
  const masterPath = path.join(FIND, c.master);

  check(
    fs.existsSync(masterPath),
    `${c.iso} master preserved`
  );

  const master = fs.readFileSync(masterPath, 'utf8');

  check(
    master.includes(`**country_iso:** ${c.iso}`),
    `${c.iso} jurisdiction metadata explicit`
  );

  check(
    body.includes(`id="view-${c.legal}"`),
    `${c.iso} Legal Guide view exists`
  );

  check(
    body.includes(`id="view-${c.tourist}"`),
    `${c.iso} tourist-rental view exists`
  );

  for (const term of c.terms) {
    check(
      body.toLowerCase().includes(term.toLowerCase()),
      `${c.iso} contains ${term}`
    );
  }

  check(
    app.includes(`case '${c.legal}': break;`) &&
    app.includes(`case '${c.tourist}': break;`),
    `${c.iso} router recognizes both views`
  );
}

[
  "navigate('legal')",
  "navigate('legal-es')",
  "navigate('legal-fr')",
  "navigate('legal-de')",
  "navigate('legal-it')",
  "navigate('al-manual')",
  "navigate('al-manual-es')",
  "navigate('tourist-rental-fr')",
  "navigate('tourist-rental-de')",
  "navigate('tourist-rental-it')"
].forEach(route => {
  check(
    body.includes(route),
    `jurisdiction navigation exposes ${route}`
  );
});

check(
  pkg.includes(
    '"test:legal-guide-fr-de-it-foundation"'
  ),
  'FR/DE/IT regression registered'
);

console.log('');
console.log(
  `FR/DE/IT LEGAL FOUNDATION: ${passed}/${passed} PASSED`
);
