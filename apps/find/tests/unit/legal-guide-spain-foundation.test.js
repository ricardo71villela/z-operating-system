#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FIND = path.resolve(__dirname, '../..');
const WEB = path.join(FIND, 'apps/zfind-web');
const body = fs.readFileSync(path.join(WEB, 'src/body.html'), 'utf8');
const app = fs.readFileSync(path.join(WEB, 'src/app.js'), 'utf8');
const pkg = fs.readFileSync(path.join(FIND, 'package.json'), 'utf8');
const masterPath = path.join(
  FIND,
  'content/legal/ES/ZFind_MasterPack_Espana_ES.md'
);

let passed = 0;

function check(condition, label) {
  assert(condition, label);
  passed += 1;
  console.log('PASS:', label);
}

console.log('\n=== SPAIN LEGAL GUIDE JURISDICTION FOUNDATION ===');

check(
  fs.existsSync(masterPath),
  'Spanish master legal pack is preserved as source evidence'
);

const master = fs.readFileSync(masterPath, 'utf8');

check(
  master.includes('**country_iso:** ES') &&
  master.includes('**jurisdiction_name:** Reino de España'),
  'Spanish jurisdiction metadata is explicit'
);

check(
  master.includes('**rules_checked_through:** agosto de 2026'),
  'Spanish master retains its source review horizon'
);

check(
  body.includes('id="view-legal-es"') &&
  body.includes('id="view-al-manual-es"'),
  'Spain has separate Legal Guide and tourist-rental public views'
);

check(
  body.includes('Comprar, vender y alquilar en España') &&
  body.includes('Vivienda de uso turístico en España'),
  'Spanish public legal surfaces use Spain-specific presentation'
);

[
  'Número de Identificación de Extranjero',
  'Impuesto de Transmisiones Patrimoniales',
  'Impuesto sobre Bienes Inmuebles',
  'Ley de Arrendamientos Urbanos',
  'Comunidad de propietarios (propiedad horizontal)',
  'Golden Visa',
].forEach(token => {
  check(
    body.includes(token),
    `Spanish legal guide contains ${token}`
  );
});

check(
  body.includes("navigate('legal')") &&
  body.includes("navigate('legal-es')") &&
  body.includes("navigate('al-manual')") &&
  body.includes("navigate('al-manual-es')"),
  'Jurisdiction switching preserves Portugal and Spain as distinct surfaces'
);

check(
  app.includes("case 'legal-es': break;") &&
  app.includes("case 'al-manual-es': break;"),
  'Router render switch recognizes both Spanish static legal views'
);

check(
  !/state\.lang\s*===?\s*['"]es['"][\s\S]{0,160}(?:legal|al-manual)/.test(app) &&
  !/(?:legal|al-manual)[\s\S]{0,160}state\.lang\s*===?\s*['"]es['"]/.test(app),
  'Spanish jurisdiction is not inferred from Spanish UI locale'
);

check(
  pkg.includes('"test:legal-guide-spain-foundation"') &&
  pkg.includes('npm run test:legal-guide-spain-foundation'),
  'Spain legal guide regression is registered in package check chain'
);

check(
  !body.includes('id="view-legal-es" data-i18n=') &&
  body.includes('Master ES'),
  'Spanish master is exposed as jurisdiction content, not falsely presented as six-language translation'
);

console.log('');
console.log(
  `SPAIN LEGAL GUIDE FOUNDATION: ${passed}/${passed} PASSED`
);
