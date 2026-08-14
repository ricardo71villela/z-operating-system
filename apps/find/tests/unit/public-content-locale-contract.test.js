#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const file = path.resolve(
  __dirname,
  '../../apps/zfind-web/src/viewmodels.js'
);

const src = fs.readFileSync(file, 'utf8');

let passed = 0;
let failed = 0;

function check(condition, label, detail) {
  if (condition) {
    passed++;
    console.log('✅', label);
  } else {
    failed++;
    console.error(
      '❌',
      label,
      detail ? `— ${detail}` : ''
    );
  }
}

console.log(
  '\n=== PUBLIC CONTENT LOCALE CONTRACT ==='
);

/* ---------- ADAPTER ---------- */

check(
  src.includes(
    "function contentLocaleForLang(lang)"
  ),
  'Canonical public→persisted locale adapter exists'
);

check(
  src.includes(
    "ZFindServices.publicLocales.persistedLocaleFor(lang)"
  ) &&
    /return\s+lang\s*===\s*'pt'\s*\?\s*'pt-PT'\s*:\s*lang\s*;/.test(
      src
    ),
  'Portuguese maps pt → pt-PT'
);

check(
  src.includes(
    "function findLocalizedContentRow(rows, lang)"
  ),
  'Localized content selector is centralized'
);

check(
  src.includes(
    "const locale = contentLocaleForLang(lang);"
  ),
  'Central selector resolves canonical persisted locale'
);

check(
  src.includes(
    "localizedRows.find(c => c.locale === locale)"
  ),
  'Requested localized content is preferred'
);

check(
  src.includes(
    "localizedRows.find(c => c.locale === 'en')"
  ),
  'English fallback remains explicit'
);

/* ---------- CALL SITES ---------- */

const listingCalls =
  (
    src.match(
      /const content = findLocalizedContentRow\(contentRows, lang\)/g
    ) || []
  ).length;

check(
  listingCalls === 4,
  'Property/Development cards + details all use adapter',
  `count=${listingCalls}`
);

const mediaCalls =
  (
    src.match(
      /const contentRow = findLocalizedContentRow\(asset\.media_asset_content, lang\);/g
    ) || []
  ).length;

check(
  mediaCalls === 2,
  'Property/Development media both use adapter',
  `count=${mediaCalls}`
);

/* ---------- REGRESSION GUARDS ---------- */

check(
  !src.includes("c.locale === lang"),
  'No router locale is compared directly with persisted locale'
);

check(
  !src.includes(
    "contentRows.find(c => c.locale === lang)"
  ),
  'Legacy listing-content lookup is gone'
);

check(
  !src.includes(
    "(asset.media_asset_content || []).find(c => c.locale === lang)"
  ),
  'Legacy media-content lookup is gone'
);

console.log(
  `\nPUBLIC CONTENT LOCALE CONTRACT: ` +
  `${passed}/${passed + failed} PASSED`
);

if (failed) {
  process.exitCode = 1;
}
