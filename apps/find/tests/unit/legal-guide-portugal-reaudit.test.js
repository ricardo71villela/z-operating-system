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

const masterPath = path.join(
  FIND,
  'content/legal/PT/ZFind_MasterPack_Portugal_PT.md'
);

const master = fs.readFileSync(
  masterPath,
  'utf8'
);

let passed = 0;

function check(value, label) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}

console.log(
  '\n=== PORTUGAL LEGAL GUIDE RE-AUDIT CONVERGENCE ==='
);

check(
  fs.existsSync(masterPath),
  'Portugal re-audit Master preserved'
);

check(
  master.includes('**country_iso:** PT'),
  'Portugal jurisdiction metadata explicit'
);

check(
  master.includes('**research_date:** 2026-08-15'),
  'Portugal research date explicit'
);

check(
  master.includes(
    '**rules_checked_through:** agosto de 2026'
  ),
  'Portugal review horizon explicit'
);

check(
  (master.match(/\| PT-\d{2} \|/g) || []).length === 50,
  'Portugal Master carries 50-source ledger'
);

check(
  (body.match(/id="view-legal"/g) || []).length === 1,
  'Portugal Legal Guide remains one canonical view'
);

check(
  (body.match(/id="view-al-manual"/g) || []).length === 1,
  'Portugal AL remains one canonical view'
);

check(
  !body.includes('id="view-legal-pt"') &&
  !body.includes('id="view-al-manual-pt"'),
  'Portugal is converged, not duplicated'
);

[
  'IMT Jovem',
  'Alojamento Local',
  'Balcão do Arrendatário e do Senhorio',
  'PROPRIEDADE HORIZONTAL E CONDOMÍNIO',
  '7,5%',
  'Decreto-Lei n.º 97/2026'
].forEach(term => {
  check(
    body.toLowerCase().includes(
      term.toLowerCase()
    ),
    `Portugal presentation contains ${term}`
  );
});

check(
  body.includes("navigate('legal-es')") &&
  body.includes("navigate('legal-fr')") &&
  body.includes("navigate('legal-de')") &&
  body.includes("navigate('legal-it')") &&
  body.includes("navigate('legal-ie')") &&
  body.includes("navigate('legal-england')") &&
  body.includes("navigate('legal-scotland')"),
  'Portugal legal view preserves jurisdiction switching'
);

check(
  body.includes("navigate('al-manual-es')") &&
  body.includes("navigate('tourist-rental-fr')") &&
  body.includes("navigate('tourist-rental-de')") &&
  body.includes("navigate('tourist-rental-it')") &&
  body.includes("navigate('tourist-rental-ie')") &&
  body.includes("navigate('tourist-rental-england')") &&
  body.includes("navigate('tourist-rental-scotland')"),
  'Portugal AL view preserves jurisdiction switching'
);

check(
  app.includes("case 'legal': break;") &&
  app.includes("case 'al-manual': break;"),
  'existing Portugal router authority preserved'
);

check(
  !app.includes("case 'legal-pt':") &&
  !app.includes("case 'al-manual-pt':"),
  'router introduces no duplicate Portugal routes'
);

check(
  pkg.includes(
    '"test:legal-guide-portugal-reaudit"'
  ),
  'Portugal re-audit regression registered'
);

console.log('');
console.log(
  `PORTUGAL LEGAL RE-AUDIT: ${passed}/${passed} PASSED`
);
