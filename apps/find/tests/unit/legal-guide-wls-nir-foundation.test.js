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

const specs = [
  {
    iso: 'GB-WLS',
    file: 'content/legal/GB-WLS/ZFind_MasterPack_Wales_EN.md',
    required: [
      'authority_mode',
      'PRIMARY_OFFICIAL',
      'four months after the contract starts',
      'Cardiff Council has resolved to introduce the levy from 1 April 2027',
      '28 September 2026',
      'likely to start in 2029',
      '252 days',
      '182 days'
    ],
    forbidden: [
      'cannot be served within the first 6 months of occupation',
      'not yet in force anywhere in Wales as of this guide'
    ]
  },
  {
    iso: 'GB-NIR',
    file: 'content/legal/GB-NIR/ZFind_MasterPack_Northern_Ireland_EN.md',
    required: [
      'authority_mode',
      'PRIMARY_OFFICIAL',
      '1 December 2025',
      '4 weeks',
      '8 weeks',
      '12 weeks',
      '£150,000',
      'certification before it begins operating'
    ],
    forbidden: [
      'existing by April 2026',
      'roughly half of all NI property transactions',
      'most private tenancies include rates in rent, paid by landlord'
    ]
  }
];

let passed = 0;
function check(value, label) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}

for (const s of specs) {
  const p = path.join(FIND, s.file);
  check(fs.existsSync(p), `${s.iso} canonical master exists`);
  const text = fs.readFileSync(p, 'utf8');
  check(text.includes(`**country_iso:** ${s.iso}`), `${s.iso} metadata exact`);
  check(text.includes('**research_date:** 2026-08-15'), `${s.iso} research date exact`);
  check(text.includes('pending validation by a qualified'), `${s.iso} DRAFT review gate retained`);

  for (const marker of s.required) {
    check(text.includes(marker), `${s.iso} authority marker: ${marker}`);
  }
  for (const marker of s.forbidden) {
    check(!text.includes(marker), `${s.iso} obsolete/unsafe claim absent: ${marker}`);
  }

  const match = text.match(/## STRUCTURED JSON VERSION[\s\S]*?```json\s*([\s\S]*?)\s*```/);
  check(Boolean(match), `${s.iso} structured JSON block exists`);
  const data = JSON.parse(match[1]);
  check(data.country_iso === s.iso, `${s.iso} JSON jurisdiction exact`);
  check(data.effective_checked_at === '2026-08-15', `${s.iso} JSON date exact`);
  check(data.authority_mode === 'PRIMARY_OFFICIAL', `${s.iso} JSON authority mode exact`);
}

for (const marker of [
  'view-legal-wales',
  'view-tourist-rental-wales',
  'view-legal-northern-ireland',
  'view-tourist-rental-northern-ireland',
  "navigate('legal-wales')",
  "navigate('tourist-rental-wales')",
  "navigate('legal-northern-ireland')",
  "navigate('tourist-rental-northern-ireland')"
]) {
  check(!body.includes(marker), `GB.1B runtime still absent: ${marker}`);
}

for (const marker of [
  "case 'legal-wales': break;",
  "case 'tourist-rental-wales': break;",
  "case 'legal-northern-ireland': break;",
  "case 'tourist-rental-northern-ireland': break;"
]) {
  check(!app.includes(marker), `GB.1B router still absent: ${marker}`);
}

check(
  pkg.includes('"test:legal-guide-wls-nir-foundation"'),
  'WLS/NIR authority regression registered'
);

console.log(`\nGB.1B WLS/NIR AUTHORITY RE-AUDIT: ${passed}/${passed} PASSED`);
