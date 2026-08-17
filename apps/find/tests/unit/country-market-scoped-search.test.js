#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let scope;
let registry;

try {
  scope = require(path.join(
    ROOT,
    'apps/zfind-web/src/services/market-search-scope.js'
  ));
} catch (error) {
  console.error('SCOPE_SERVICE_LOAD_ERROR=' + error.message);
}

try {
  registry = require(path.join(
    ROOT,
    'apps/zfind-web/src/services/market-registry.js'
  ));
} catch (error) {
  console.error('MARKET_REGISTRY_LOAD_ERROR=' + error.message);
}

const zones = read('apps/zfind-web/src/services/zones.js');
const search = read('apps/zfind-web/src/services/search.js');
const developments = read('apps/zfind-web/src/services/developments.js');
const viewmodels = read('apps/zfind-web/src/viewmodels.js');
const app = read('apps/zfind-web/src/app.js');
const css = read('apps/zfind-web/src/css_block.txt');
const build = read('apps/zfind-web/scripts/build.js');
const browser = read('tests/browser/zfind-web/browser_test.js');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${passed}: ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${failed}: ${label}`);
  }
}

check('market search scope service loads', !!scope);
check('market registry loads', !!registry);

if (scope && registry) {
  const markets = registry.listMarkets();
  const resolved = markets.map(m => [m.key, scope.resolveMarketScope(m)]);
  const supported = resolved.filter(([,r]) => r.supported);
  const unavailable = resolved.filter(([,r]) => !r.supported);

  check('all 24 markets now have an authoritative searchable scope',
    supported.length === 24 &&
    unavailable.length === 0);

  const sovereign = resolved.filter(
    ([,r]) => r.supported && r.kind === 'country_iso'
  );
  const exact = resolved.filter(
    ([,r]) => r.supported && r.kind === 'exact_market'
  );

  check('exactly 19 sovereign markets remain country-ISO scoped',
    sovereign.length === 19 &&
    sovereign.every(([,r]) =>
      /^[A-Z]{2}$/.test(r.countryIso)
    ));

  check('exactly five special markets use exact-market scope',
    exact.length === 5 &&
    exact.map(([key]) => key).sort().join(',') ===
      ['AE-DU','GB-ENG','GB-NIR','GB-SCT','GB-WLS'].sort().join(','));

  check('special markets never expose parent country substitution',
    exact.every(([key,r]) =>
      r.exactMarketKey === key &&
      !r.countryIso
    ));

  check('new Market Search presentation copy is complete 6/6',
    ['fr','en','pt','es','de','it'].every(locale => {
      const copy = scope.presentation(locale);
      return [
        copy.buy,
        copy.rent,
        copy.locationPlaceholder,
        copy.typeAny,
        copy.typeResidential,
        copy.typeCommercial,
        copy.typeDevelopment,
        copy.typeLand,
        copy.search,
        copy.exactPendingTitle,
        copy.exactPendingBody
      ].every(value => typeof value === 'string' && value.trim());
    }));

  check('commercial type maps to canonical four subtypes',
    scope.typeOptions('en').find(row => row.key === 'commercial').value ===
      'office,retail,industrial_logistics,hospitality');

  check('no subtype=commercial value exists',
    !scope.typeOptions('en').some(row => row.value === 'commercial'));
}

check('zones service has sovereign and exact-market read ports',
  zones.includes('async function listByCountryIso(countryIso)') &&
  zones.includes(".eq('country_iso', countryIso)") &&
  zones.includes('async function resolveExactMarketScope(marketKey)') &&
  zones.includes("client.rpc(") &&
  zones.includes("'zfind_public_exact_market_scope'") &&
  zones.includes('resolveExactMarketScope'));

check('Property search supports server-side zone-id scope',
  search.includes('Array.isArray(f.zoneLiteIds)') &&
  search.includes(".in('zone_lite_id', f.zoneLiteIds)") &&
  search.includes('delete analyticsFilters.zoneLiteIds'));

check('Development scoped search preserves Rental API and adds explicit market scope',
  developments.includes(
    'async function listPublished(zoneLiteId, transactionType, rentalPeriod)'
  ) &&
  developments.includes(
    'async function listPublishedScoped('
  ) &&
  developments.includes('zoneLiteIds') &&
  developments.includes(".in('zone_lite_id', zoneLiteIds)") &&
  viewmodels.includes('services.developments.listPublishedScoped('));

check('viewmodels resolve sovereign and exact markets before inventory',
  viewmodels.includes('resolveSearchMarketScope') &&
  viewmodels.includes('services.zones.listByCountryIso') &&
  viewmodels.includes('services.zones.resolveExactMarketScope') &&
  viewmodels.includes("reason: 'exact_market_unresolved'") &&
  viewmodels.includes('zoneLiteIds: marketScope.zoneLiteIds') &&
  viewmodels.includes('marketKey: f.marketKey'));

check('authoritative zero-zone scopes short-circuit before inventory query',
  viewmodels.includes('marketScope.zoneLiteIds.length === 0') &&
  viewmodels.includes('Never omit the zone filter for []'));

check('unresolved exact-market runtime still fails closed',
  viewmodels.includes('scopeUnavailable: true') &&
  viewmodels.includes('reason: marketScope.reason'));

check('Search runtime passes stable market key into data layer',
  app.includes("marketKey: q.market || undefined"));

check('Search clear preserves selected market',
  app.includes('function clearSearchFilters()') &&
  app.includes('if (state.query && state.query.market)') &&
  app.includes('next.market = state.query.market;'));

check('Country Market Page renders a scoped search form',
  app.includes('function renderMarketSearch(market)') &&
  app.includes('function submitMarketSearch(marketKey)') &&
  app.includes("root.dataset.marketSearchState = 'ready';"));

check('scope-unavailable Search clears stale prior-market result DOM',
  app.includes("gridEl.innerHTML = '';") &&
  app.includes("gridEl.style.display = 'none';") &&
  app.includes("emptyEl.style.display = '';"));

check('ordinary empty Search clears stale prior-market result DOM',
  (() => {
    const ordinaryEmptyStart =
      app.indexOf('if (!fullCards.length) {');

    const ordinaryEmptyEnd =
      app.indexOf(
        "setSearchStatus('none');",
        ordinaryEmptyStart
      );

    if (
      ordinaryEmptyStart < 0 ||
      ordinaryEmptyEnd <= ordinaryEmptyStart
    ) {
      return false;
    }

    const ordinaryEmptyBlock =
      app.slice(
        ordinaryEmptyStart,
        ordinaryEmptyEnd
      );

    return (
      ordinaryEmptyBlock.includes("'search-grid'") &&
      ordinaryEmptyBlock.includes("emptyGridEl.innerHTML = '';") &&
      ordinaryEmptyBlock.includes("emptyGridEl.style.display = 'none';") &&
      ordinaryEmptyBlock.includes("'empty'") &&
      ordinaryEmptyBlock.includes("'search.noResultsTitle'") &&
      ordinaryEmptyBlock.includes("'search.noResultsBody'") &&
      ordinaryEmptyBlock.includes('return;') &&
      !ordinaryEmptyBlock.includes('.map(searchResultRowHTML)')
    );
  })());

check('market page renderer uses resolved scope authority',
  app.includes('MARKET_SEARCH_SCOPE_SERVICE.resolveMarketScope') &&
  app.includes("root.dataset.marketSearchState = 'ready';") &&
  app.includes("'exact-scope-pending';") &&
  app.includes('copy.exactPendingTitle') &&
  app.includes('copy.exactPendingBody'));

check('market search UI has dedicated responsive styling',
  css.includes('.market-scoped-search') &&
  css.includes('.market-search-fields'));

check('build bundles scope service before viewmodels/app',
  build.includes("read('services/market-search-scope.js')") &&
  build.indexOf('marketSearchScopeService') <
    build.indexOf("const viewmodels = read('viewmodels.js')"));

check('browser regression proves sovereign + exact-market scoping',
  browser.includes('COUNTRY MARKET SCOPED SEARCH') &&
  browser.includes('PT scoped result cards:') &&
  browser.includes('FR scoped result cards:') &&
  browser.includes('Dubai exact-market search state:') &&
  browser.includes('zfind_public_exact_market_scope'));

console.log('');
console.log(`COUNTRY_MARKET_SCOPED_SEARCH_TOTAL=${passed + failed}`);
console.log(`COUNTRY_MARKET_SCOPED_SEARCH_PASSED=${passed}`);
console.log(`COUNTRY_MARKET_SCOPED_SEARCH_FAILED=${failed}`);

if (failed) process.exit(1);
