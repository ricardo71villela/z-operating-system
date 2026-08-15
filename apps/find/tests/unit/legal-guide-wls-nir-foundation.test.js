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

const specs = [
  {
    iso: 'GB-WLS',
    file:
      'content/legal/GB-WLS/ZFind_MasterPack_Wales_EN.md',
    legal: 'legal-wales',
    tourist: 'tourist-rental-wales',
    masterRequired: [
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
    ],
    runtimeTerms: [
      'Land Transaction Tax',
      'Rent Smart Wales',
      'Cardiff Council has resolved to introduce the levy from 1 April 2027',
      '252 days',
      '182 days'
    ]
  },
  {
    iso: 'GB-NIR',
    file:
      'content/legal/GB-NIR/ZFind_MasterPack_Northern_Ireland_EN.md',
    legal: 'legal-northern-ireland',
    tourist: 'tourist-rental-northern-ireland',
    masterRequired: [
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
    ],
    runtimeTerms: [
      'Stamp Duty Land Tax',
      'domestic rates',
      '1 December 2025',
      'certification before it begins operating'
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
  const masterPath = path.join(
    FIND,
    s.file
  );

  check(
    fs.existsSync(masterPath),
    `${s.iso} canonical master exists`
  );

  const master = fs.readFileSync(
    masterPath,
    'utf8'
  );

  check(
    master.includes(
      `**country_iso:** ${s.iso}`
    ),
    `${s.iso} metadata exact`
  );

  check(
    master.includes(
      '**research_date:** 2026-08-15'
    ),
    `${s.iso} research date exact`
  );

  check(
    master.includes(
      'pending validation by a qualified'
    ),
    `${s.iso} DRAFT review gate retained`
  );

  for (
    const marker
    of s.masterRequired
  ) {
    check(
      master.includes(marker),
      `${s.iso} authority marker: ${marker}`
    );
  }

  for (
    const marker
    of s.forbidden
  ) {
    check(
      !master.includes(marker),
      `${s.iso} obsolete/unsafe claim absent: ${marker}`
    );
  }

  const jsonMatch = master.match(
    /## STRUCTURED JSON VERSION[\s\S]*?```json\s*([\s\S]*?)\s*```/
  );

  check(
    Boolean(jsonMatch),
    `${s.iso} structured JSON block exists`
  );

  const data = JSON.parse(
    jsonMatch[1]
  );

  check(
    data.country_iso === s.iso,
    `${s.iso} JSON jurisdiction exact`
  );

  check(
    data.effective_checked_at
      === '2026-08-15',
    `${s.iso} JSON date exact`
  );

  check(
    data.authority_mode
      === 'PRIMARY_OFFICIAL',
    `${s.iso} JSON authority mode exact`
  );

  check(
    body.includes(
      `id="view-${s.legal}"`
    ),
    `${s.iso} Legal Guide public view exists`
  );

  check(
    body.includes(
      `id="view-${s.tourist}"`
    ),
    `${s.iso} short-term public view exists`
  );

  check(
    body.includes(
      `navigate('${s.legal}')`
    ),
    `${s.iso} legal navigation exposed`
  );

  check(
    body.includes(
      `navigate('${s.tourist}')`
    ),
    `${s.iso} tourist navigation exposed`
  );

  check(
    app.includes(
      `case '${s.legal}': break;`
    ),
    `${s.iso} legal router case exists`
  );

  check(
    app.includes(
      `case '${s.tourist}': break;`
    ),
    `${s.iso} tourist router case exists`
  );

  for (
    const term
    of s.runtimeTerms
  ) {
    check(
      body
        .toLowerCase()
        .includes(
          term.toLowerCase()
        ),
      `${s.iso} runtime contains ${term}`
    );
  }

  check(
    !body.includes(
      `id="view-${s.legal}" data-i18n=`
    ),
    `${s.iso} jurisdiction content is not UI-locale-derived`
  );

  check(
    !body.includes(
      `id="view-${s.tourist}" data-i18n=`
    ),
    `${s.iso} tourist content is not UI-locale-derived`
  );
}

for (const route of [
  'legal-wales',
  'legal-northern-ireland',
  'tourist-rental-wales',
  'tourist-rental-northern-ireland'
]) {
  const needle =
    `navigate('${route}')`;

  const count =
    body.split(needle).length - 1;

  check(
    count >= 9,
    `${route} exposed across jurisdiction selectors`
  );
}

check(
  body.includes(
    'Master GB-WLS · rules checked through 15 August 2026'
  ),
  'Wales public surface declares authority horizon'
);

check(
  body.includes(
    'Master GB-NIR · rules checked through 15 August 2026'
  ),
  'Northern Ireland public surface declares authority horizon'
);

check(
  body.includes(
    'DRAFT pending qualified local legal review'
  ),
  'public source retains DRAFT legal-review warning'
);

check(
  pkg.includes(
    '"test:legal-guide-wls-nir-foundation"'
  ),
  'WLS/NIR regression remains registered'
);

console.log(
  `\nGB.2C WLS/NIR RUNTIME FOUNDATION: `
  + `${passed}/${passed} PASSED`
);
