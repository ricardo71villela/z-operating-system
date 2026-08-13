'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const FIND = path.join(ROOT, 'apps/find');

const read = rel =>
  fs.readFileSync(path.join(FIND, rel), 'utf8');

const service = read(
  'apps/zfind-web/src/services/admin.js'
);

const adminUi = read(
  'apps/zfind-admin/src/app.js'
);

const partnerUi = read(
  'apps/zfind-partner/src/app.js'
);

const lifecycleTest = read(
  'tests/unit/marketplace-lifecycle-hardening.test.js'
);

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed += 1;
  } else {
    console.log(`❌ FAIL: ${message}`);
    failed += 1;
  }
}

function extractFunction(source, name) {
  const start = source.indexOf(
    `async function ${name}(`
  ) >= 0
    ? source.indexOf(`async function ${name}(`)
    : source.indexOf(`function ${name}(`);

  if (start < 0) {
    throw new Error(`${name} not found`);
  }

  const brace = source.indexOf('{', start);

  let depth = 0;
  let quote = null;
  let escape = false;

  for (let i = brace; i < source.length; i++) {
    const c = source[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (c === '\\') {
      escape = true;
      continue;
    }

    if (quote) {
      if (c === quote) quote = null;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }

    if (c === '{') depth += 1;

    if (c === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  throw new Error(`Could not extract ${name}`);
}


console.log(
  '\n=== Z FIND — RENTAL AUTHORING SURFACE ==='
);


const commercialFn = extractFunction(
  service,
  'updateListingCommercial'
);


check(
  service.includes(
    'async function updateListingCommercial('
  ),
  'One shared Listing commercial command exists'
);

check(
  service.includes(
    ".from('listings')"
  ) &&
  commercialFn.includes(
    '.update(patch)'
  ),
  'Commercial command writes only through Listing boundary'
);

check(
  commercialFn.includes(
    "patch.transaction_type = input.transactionType"
  ),
  'Commercial command owns transaction_type mapping'
);

check(
  commercialFn.includes(
    "patch.rental_period = null"
  ),
  'Switching to sale clears rental_period atomically'
);

check(
  commercialFn.includes(
    "['monthly', 'seasonal', 'yearly']"
  ),
  'Rent requires a validated rental period'
);

check(
  commercialFn.includes(
    "patch.price_current = price"
  ) &&
  commercialFn.includes(
    "patch.currency_iso = currency"
  ) &&
  commercialFn.includes(
    "patch.price_is_from = input.priceIsFrom"
  ),
  'Price/currency/from semantics are commercial-authorable'
);

check(
  commercialFn.includes(
    "patch.channel = input.channel"
  ),
  'standard/offmarket remains independently authorable'
);

check(
  !commercialFn.includes(
    'patch.status'
  ) &&
  !commercialFn.includes(
    'representation_id'
  ) &&
  !commercialFn.includes(
    'partner_id'
  ),
  'Commercial command cannot alter lifecycle, representation or ownership'
);

check(
  service.includes(
    'channel, transaction_type, rental_period, price_current'
  ),
  'Admin edit reads expose Rental commercial state'
);


check(
  adminUi.includes(
    'renderListingCommercialEditor(listing)'
  ),
  'Admin editor renders commercial Listing controls'
);

check(
  adminUi.includes(
    'listing-transaction-type'
  ) &&
  adminUi.includes(
    'listing-rental-period'
  ),
  'Admin can select Sale/Rental and rental period'
);

check(
  adminUi.includes(
    'listing-price-current'
  ) &&
  adminUi.includes(
    'listing-currency-iso'
  ) &&
  adminUi.includes(
    'listing-price-is-from'
  ),
  'Admin can edit price/currency/price-is-from'
);

check(
  adminUi.includes(
    'listing-channel'
  ),
  'Admin keeps distribution channel separate'
);

check(
  adminUi.includes(
    '.updateListingCommercial('
  ),
  'Admin UI saves through shared commercial service'
);


check(
  partnerUi.includes(
    'renderPartnerListingCommercialEditor(listing)'
  ),
  'Partner workspace renders commercial Listing controls'
);

check(
  partnerUi.includes(
    'partner-listing-transaction-type'
  ) &&
  partnerUi.includes(
    'partner-listing-rental-period'
  ),
  'Partner can select Sale/Rental and rental period'
);

check(
  partnerUi.includes(
    '.updateListingCommercial('
  ),
  'Partner saves through the validated shared service'
);

check(
  !partnerUi.includes(
    ".from('listings').update"
  ) &&
  !partnerUi.includes(
    ".from(\"listings\").update"
  ),
  'Partner UI performs no direct Listing table mutation'
);

check(
  !partnerUi.includes(
    'setListingStatus('
  ) &&
  !partnerUi.includes(
    'setRepresentationStatus('
  ),
  'Partner Rental authoring exposes no lifecycle commands'
);

check(
  partnerUi.includes(
    'Publication and lifecycle remain controlled by Z Find.'
  ),
  'Partner UI explicitly communicates lifecycle authority boundary'
);

check(
  lifecycleTest.includes(
    'Partner Listing access split into SELECT + commercial UPDATE'
  ),
  'Existing lifecycle regression still owns Partner commercial boundary'
);


console.log(
  `\nRENTAL AUTHORING SURFACE: ` +
  `${passed}/${passed + failed} PASSED`
);

if (failed) process.exit(1);
