const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const appPath = path.join(
  root,
  'apps',
  'zfind-web',
  'src',
  'app.js'
);
const app = fs.readFileSync(appPath, 'utf8');

let failures = 0;

function check(label, condition) {
  if (condition) {
    console.log('PASS:', label);
  } else {
    failures += 1;
    console.error('FAIL:', label);
  }
}

const startMarker =
  '/* ---------------- Phase C: Search -> detail return context ---------------- */';
const endMarker =
  '/* ---------------- End Phase C return context ---------------- */';

const start = app.indexOf(startMarker);
const end = app.indexOf(endMarker);

check(
  'Phase C helper block exists once',
  start >= 0 &&
    end > start &&
    app.indexOf(startMarker, start + 1) < 0
);

const helperBlock =
  start >= 0 && end > start
    ? app.slice(
        start,
        end + endMarker.length
      )
    : '';

const context = {
  URLSearchParams,
  Number,
  Object,
  String,
  console
};

vm.createContext(context);

if (helperBlock) {
  vm.runInContext(
    helperBlock + `
      ;globalThis.__phaseC = {
        SEARCH_RETURN_QUERY_KEYS,
        canonicalSearchReturnQuery,
        searchReturnDetailQuery,
        searchReturnQueryFromDetail
      };
    `,
    context
  );
}

const phaseC = context.__phaseC || {};

check(
  'exact Search return allow-list',
  Array.from(
    phaseC.SEARCH_RETURN_QUERY_KEYS || []
  ).join(',') ===
    'market,q,subtype,transactionType,rentalPeriod,budget,page'
);

const source = {
  market: 'PT',
  q: 'Porto',
  subtype: 'villa',
  transactionType: 'sale',
  rentalPeriod: '',
  budget: '400-700',
  page: '2',
  evil: 'drop-me'
};

const envelope =
  phaseC.searchReturnDetailQuery
    ? phaseC.searchReturnDetailQuery(source)
    : {};

const decoded =
  phaseC.searchReturnQueryFromDetail
    ? phaseC.searchReturnQueryFromDetail(envelope)
    : {};

check(
  'explicit returnTo=search envelope',
  envelope.returnTo === 'search'
);

check(
  'page 2 and exact Search state round-trip',
  JSON.stringify(decoded) ===
    JSON.stringify({
      market: 'PT',
      q: 'Porto',
      subtype: 'villa',
      transactionType: 'sale',
      budget: '400-700',
      page: '2'
    })
);

const page1 =
  phaseC.searchReturnQueryFromDetail
    ? phaseC.searchReturnQueryFromDetail(
        phaseC.searchReturnDetailQuery({
          transactionType: 'sale',
          page: '1'
        })
      )
    : {};

check(
  'page 1 is canonically omitted',
  JSON.stringify(page1) ===
    JSON.stringify({
      transactionType: 'sale'
    })
);

const invalid =
  phaseC.searchReturnQueryFromDetail
    ? phaseC.searchReturnQueryFromDetail({
        returnTo: 'search',
        returnQuery:
          'market=PT&page=abc&evil=1'
      })
    : {};

check(
  'invalid page and unknown key fail closed',
  JSON.stringify(invalid) ===
    JSON.stringify({
      market: 'PT'
    })
);

const wrongOrigin =
  phaseC.searchReturnQueryFromDetail
    ? phaseC.searchReturnQueryFromDetail({
        returnTo: 'market',
        returnQuery: 'market=PT&page=2'
      })
    : null;

check(
  'wrong origin returns generic Search fallback',
  JSON.stringify(wrongOrigin) === '{}'
);

check(
  'organic Search row carries Search origin context',
  app.includes(
    `onclick="navigateSearchOriginDetail('${'${target}'}','${'${vm.assetId}'}')"`
  )
);

const searchFeaturedStart =
  app.indexOf(
    'function searchFeaturedCardSlotHTML(slot, copy) {'
  );

const searchFeaturedEnd =
  app.indexOf(
    '\nfunction ',
    searchFeaturedStart + 1
  );

const searchFeaturedBlock =
  searchFeaturedStart >= 0 &&
  searchFeaturedEnd > searchFeaturedStart
    ? app.slice(
        searchFeaturedStart,
        searchFeaturedEnd
      )
    : '';

check(
  'Search Featured carries Search origin context',
  searchFeaturedBlock.includes(
    '${cardHTML(slot.card, true)}'
  )
);

const marketFeaturedStart =
  app.indexOf(
    'function featuredCardSlotHTML('
  );

const marketFeaturedEnd =
  app.indexOf(
    '\nfunction ',
    marketFeaturedStart + 1
  );

const marketFeaturedBlock =
  marketFeaturedStart >= 0 &&
  marketFeaturedEnd > marketFeaturedStart
    ? app.slice(
        marketFeaturedStart,
        marketFeaturedEnd
      )
    : '';

check(
  'Country Market Featured is not silently Search-origin',
  !marketFeaturedBlock.includes(
    'cardHTML(slot.card, true)'
  )
);

check(
  'four Back-to-results controls use shared resolver',
  (
    app.match(
      /navigateBackToSearchResults\(\);return false;/g
    ) || []
  ).length === 4
);

check(
  'location click remains a new filtered Search',
  (
    app.match(
      /navigate\('search',null,\{q:/g
    ) || []
  ).length >= 3
);

check(
  'Development unit remains sibling detail state',
  app.includes(
    'Object.assign({}, state.query, { unit: unitId })'
  ) &&
    app.includes('delete q.unit;')
);

check(
  'unit is not part of Search return allow-list',
  Array.from(
    phaseC.SEARCH_RETURN_QUERY_KEYS || []
  ).indexOf('unit') < 0
);

if (failures) {
  console.error(
    `Detail navigation context foundation: ${failures} failure(s)`
  );
  process.exit(1);
}

console.log(
  'Detail navigation context foundation: PASS'
);
