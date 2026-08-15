const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../../..');
const FIND = path.join(ROOT, 'apps/find');

const read = rel => fs.readFileSync(path.join(FIND, rel), 'utf8');

const viewmodels = read('apps/zfind-web/src/viewmodels.js');
const app = read('apps/zfind-web/src/app.js');
const body = read('apps/zfind-web/src/body.html');
const i18n = read('apps/zfind-web/src/i18n.js');
const css = read('apps/zfind-web/src/css_block.txt');
const search = read('apps/zfind-web/src/services/search.js');
const developments = read('apps/zfind-web/src/services/developments.js');

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${message}`);
    failed++;
  }
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);

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

    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error(`Could not extract ${name}`);
}

console.log('\n=== Z FIND — PUBLIC RENTAL PRODUCT SURFACE ===');

check(
  body.includes('id="home-transaction-tabs"') &&
  body.includes('id="search-transaction-tabs"'),
  'Buy/Rent selector exists on Home and Search'
);

check(
  body.includes("setHomeTransaction('sale')") &&
  body.includes("setHomeTransaction('rent')") &&
  body.includes("setSearchTransaction('sale')") &&
  body.includes("setSearchTransaction('rent')"),
  'Public selectors explicitly drive sale/rent transaction intent'
);

check(
  body.includes('home-rental-period') &&
  body.includes('search-rental-period'),
  'Rental-period selector exists in both public search entrypoints'
);

check(
  app.includes("transactionType") &&
  app.includes("rentalPeriod"),
  'URL/search state carries transaction type and rental period'
);

check(
  app.includes("query.transactionType = transactionType"),
  'Homepage search propagates chosen transaction type'
);

check(
  app.includes("query.rentalPeriod = homeRentalPeriod"),
  'Homepage rent search propagates rental period'
);

check(
  app.includes("transactionType,") &&
  app.includes("rentalPeriod,"),
  'Search route forwards commercial rental filters'
);

check(
  search.includes(
    "representations.listings.transaction_type"
  ) &&
  search.includes(
    "representations.listings.rental_period"
  ),
  'Property search filters transaction type and rental period server-side'
);

check(
  developments.includes(
    "async function listPublished(zoneLiteId, transactionType, rentalPeriod)"
  ),
  'Development search accepts the same rental filter contract'
);

check(
  developments.includes(
    "representations.listings.transaction_type"
  ) &&
  developments.includes(
    "representations.listings.rental_period"
  ),
  'Development search filters rental semantics server-side'
);

check(
  viewmodels.includes(
    "transactionType: listing.transaction_type || 'sale'"
  ) &&
  viewmodels.includes(
    "rentalPeriod: listing.rental_period || null"
  ),
  'Cards/details project transaction semantics'
);

check(
  viewmodels.includes("function formatListingPrice("),
  'One canonical sale/rent price formatter exists'
);

check(
  viewmodels.includes(
    "priceLabel: formatListingPrice(ulisting"
  ),
  'Development units use the same rental-aware price formatter'
);

check(
  viewmodels.includes(
    "search.forRent"
  ),
  'Rental cards visibly identify a rental opportunity'
);

check(
  i18n.includes("buy:'Comprar'") &&
  i18n.includes("rent:'Arrendar'") &&
  i18n.includes("buy:'Buy'") &&
  i18n.includes("rent:'Rent'") &&
  i18n.includes("buy:'Acheter'") &&
  i18n.includes("rent:'Louer'"),
  'Buy/Rent terminology exists in PT/EN/FR'
);

check(
  i18n.includes("perMonth:'/mês'") &&
  i18n.includes("perMonth:'/month'") &&
  i18n.includes("perMonth:'/mois'"),
  'Monthly rent suffix is localized PT/EN/FR'
);

check(
  i18n.includes("perSeason:'/época'") &&
  i18n.includes("perSeason:'/season'") &&
  i18n.includes("perSeason:'/saison'"),
  'Seasonal rent suffix is localized PT/EN/FR'
);

check(
  i18n.includes("perYear:'/ano'") &&
  i18n.includes("perYear:'/year'") &&
  i18n.includes("perYear:'/an'"),
  'Yearly rent suffix is localized PT/EN/FR'
);

check(
  app.includes("r-u1500") &&
  app.includes("r-1500-2500") &&
  app.includes("r-2500-4000") &&
  app.includes("r-o4000"),
  'Monthly rental budgets have their own ranges'
);

check(
  app.includes(
    "transactionType === 'rent' && rentalPeriod !== 'monthly'"
  ),
  'Seasonal/yearly rents never reuse monthly price thresholds'
);

check(
  app.includes("isRentalListing") &&
  app.includes("vm.listing.transactionType === 'rent'"),
  'Rental detail can suppress purchase-specific investment UI'
);

check(
  css.includes(".transaction-tabs") &&
  css.includes(".rental-period-control"),
  'Rental public controls have responsive styling'
);

check(
  !search.includes(
    "representations.listings.channel"
  ),
  'Current public Rental search is independent from historical Listing channel'
);

check(
  !app.includes("channel:'rent'") &&
  !app.includes("channel:'sale'") &&
  !search.includes("channel', 'rent'") &&
  !search.includes("channel', 'sale'"),
  'Transaction intent never overloads channel'
);


// ------------------------------------------------------------
// Execute the price formatter itself.
// ------------------------------------------------------------

const formatFn = extractFunction(
  viewmodels,
  'formatListingPrice'
);

const labels = {
  'search.priceFrom': 'From',
  'search.perMonth': '/month',
  'search.perSeason': '/season',
  'search.perYear': '/year',
};

const context = {
  fmtCurrency(value, lang, currency) {
    return `${currency}:${value}`;
  },
  t(lang, key) {
    return labels[key] || key;
  },
};

vm.createContext(context);
vm.runInContext(formatFn, context);

check(
  context.formatListingPrice(
    {
      price_current: 500000,
      price_is_from: false,
      transaction_type: 'sale',
      rental_period: null,
    },
    'en',
    'EUR'
  ) === 'EUR:500000',
  'Sale price has no rental suffix'
);

check(
  context.formatListingPrice(
    {
      price_current: 1500,
      price_is_from: false,
      transaction_type: 'rent',
      rental_period: 'monthly',
    },
    'en',
    'EUR'
  ) === 'EUR:1500 /month',
  'Monthly rental price displays per-month suffix'
);

check(
  context.formatListingPrice(
    {
      price_current: 8000,
      price_is_from: false,
      transaction_type: 'rent',
      rental_period: 'seasonal',
    },
    'en',
    'EUR'
  ) === 'EUR:8000 /season',
  'Seasonal rental price displays per-season suffix'
);

check(
  context.formatListingPrice(
    {
      price_current: 18000,
      price_is_from: true,
      transaction_type: 'rent',
      rental_period: 'yearly',
    },
    'en',
    'EUR'
  ) === 'From EUR:18000 /year',
  'Yearly rental preserves price-is-from semantics'
);


// Historical fixtures lacking transaction_type remain sale by default.
check(
  context.formatListingPrice(
    {
      price_current: 300000,
      price_is_from: false,
    },
    'en',
    'EUR'
  ) === 'EUR:300000',
  'Pre-rental test fixtures remain backward-compatible as sale'
);


console.log(
  `\nPUBLIC RENTAL PRODUCT SURFACE: ` +
  `${passed}/${passed + failed} PASSED`
);

if (failed) process.exit(1);
