const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const FIND = path.join(ROOT, 'apps/find');
const MIGRATIONS = path.join(
  ROOT,
  'infrastructure/supabase/migrations'
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

const migrationName = fs
  .readdirSync(MIGRATIONS)
  .filter(name =>
    name.endsWith(
      '_z_find_rental_market_foundation_v1.sql'
    )
  )
  .sort()
  .at(-1);

check(
  Boolean(migrationName),
  'Rental market forward migration exists'
);

const migration = migrationName
  ? fs.readFileSync(
      path.join(MIGRATIONS, migrationName),
      'utf8'
    )
  : '';

const search = fs.readFileSync(
  path.join(
    FIND,
    'apps/zfind-web/src/services/search.js'
  ),
  'utf8'
);

const properties = fs.readFileSync(
  path.join(
    FIND,
    'apps/zfind-web/src/services/properties.js'
  ),
  'utf8'
);

const developments = fs.readFileSync(
  path.join(
    FIND,
    'apps/zfind-web/src/services/developments.js'
  ),
  'utf8'
);

const finalAudit = fs.readFileSync(
  path.join(
    FIND,
    'tests/sql/final-surface-boundary.sql'
  ),
  'utf8'
);


console.log(
  '\n=== Z FIND — RENTAL MARKET FOUNDATION ==='
);


check(
  migration.includes(
    'add column transaction_type text'
  ),
  'Listing gains explicit transaction_type'
);

check(
  migration.includes("'sale'") &&
  migration.includes("'rent'"),
  'Transaction vocabulary is sale | rent'
);

check(
  migration.includes(
    "channel"
  ) &&
  migration.includes(
    "standard"
  ) &&
  migration.includes(
    "offmarket"
  ),
  'Channel remains standard/offmarket distribution'
);

check(
  migration.includes(
    'listings_transaction_rental_period_shape'
  ),
  'Database owns sale/rent versus rental_period invariant'
);

check(
  migration.includes(
    "transaction_type = 'sale'"
  ) &&
  migration.includes(
    'rental_period is null'
  ),
  'Sale Listing cannot carry rental_period'
);

check(
  migration.includes(
    "transaction_type = 'rent'"
  ) &&
  migration.includes(
    'rental_period is not null'
  ),
  'Rent Listing requires rental_period'
);

check(
  migration.includes(
    'grant update ('
  ) &&
  migration.includes(
    'transaction_type'
  ),
  'Partner commercial grant includes transaction_type'
);

check(
  search.includes(
    'transaction_type'
  ) &&
  search.includes(
    'rental_period'
  ),
  'Search reads transaction semantics'
);

check(
  search.includes(
    'f.transactionType'
  ) &&
  search.includes(
    'representations.listings.transaction_type'
  ),
  'Public search can filter sale versus rent'
);

check(
  !search.includes(
    'representations.listings.channel'
  ),
  'Current public search no longer depends on historical Listing channel'
);

check(
  properties.includes(
    'transaction_type'
  ) &&
  properties.includes(
    'rental_period'
  ),
  'Property public read exposes transaction semantics'
);

check(
  developments.includes(
    'transaction_type'
  ) &&
  developments.includes(
    'rental_period'
  ),
  'Development public read exposes transaction semantics'
);

check(
  finalAudit.includes(
    "'transaction_type'"
  ),
  'Permanent production auditor includes new Partner commercial column'
);

check(
  !migration.includes(
    "channel in ('sale'"
  ) &&
  !migration.includes(
    "channel in ('rent'"
  ),
  'Rental implementation does not overload channel'
);


console.log(
  `\nRENTAL MARKET FOUNDATION: ` +
  `${passed}/${passed + failed} PASSED`
);

if (failed) {
  process.exit(1);
}
