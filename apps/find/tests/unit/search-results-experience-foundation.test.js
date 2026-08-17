#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = rel =>
  fs.readFileSync(path.join(ROOT, rel), 'utf8');

const body = read('apps/zfind-web/src/body.html');
const css = read('apps/zfind-web/src/css_block.txt');
const app = read('apps/zfind-web/src/app.js');

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

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

console.log('\n=== Z FIND — PHASE B SEARCH RESULTS EXPERIENCE FOUNDATION ===');

check(
  'Search Results has one explicit layout shell',
  occurrences(body, 'class="search-results-layout"') === 1
);

check(
  'Search Results has one main organic-results container',
  occurrences(body, 'class="search-results-main"') === 1
);

check(
  'Search Results has one reserved right-rail aside',
  occurrences(body, 'class="search-results-aside"') === 1 &&
  occurrences(body, 'id="search-results-aside"') === 1
);

check(
  'B1 right rail is explicitly reserved and non-user-facing',
  body.includes('data-search-aside-state="reserved"') &&
  body.includes('aria-hidden="true"')
);

check(
  'existing Search result-grid authority remains unique',
  occurrences(body, 'id="search-grid"') === 1
);

check(
  'existing Search empty-state authority remains unique',
  occurrences(body, 'id="search-empty"') === 1 &&
  occurrences(body, 'id="search-empty-title"') === 1 &&
  occurrences(body, 'id="search-empty-body"') === 1
);

check(
  'desktop Search layout is explicit 2/3 + 1/3',
  css.includes(
    'grid-template-columns:minmax(0,2fr) minmax(280px,1fr);'
  )
);

check(
  'Search organic-result column is a one-row stack foundation',
  css.includes(
    '#view-search #search-grid{\n  grid-template-columns:1fr;'
  )
);

check(
  'Search layout collapses to one column on mobile',
  /@media\(max-width:900px\)\{[\s\S]*?#view-search \.search-results-layout\{[\s\S]*?grid-template-columns:1fr;/.test(
    css
  )
);

const asideStart = body.indexOf(
  '<aside\n        class="search-results-aside"'
);
const asideEnd = body.indexOf('</aside>', asideStart);
const aside =
  asideStart >= 0 && asideEnd >= 0
    ? body.slice(asideStart, asideEnd + '</aside>'.length)
    : '';

check(
  'B1/B3-B4 rail introduces no unauthorized paid-placement claim',
  aside &&
  !/\b(sponsored|promoted|paid|advertisement)\b/i.test(aside) &&
  !/commercial\s+(assignment|ranking|placement)/i.test(aside)
);

const searchGridUsesLegacyCanonicalCardRenderer =
  app.includes(
    "document.getElementById('search-grid').innerHTML = filtered.map(cardHTML).join('');"
  );


check(
  'Search runtime renders canonical card-compatible results into search-grid',
  app.includes('function searchResultRowHTML(vm)') &&
  app.includes('pagination.cards') &&
  app.includes('.map(searchResultRowHTML)')
);

check(
  'B1 does not alter Phase A market scope handoff',
  app.includes('marketKey: q.market || undefined')
);


check(
  'B2 uses a dedicated Search-only horizontal row renderer',
  app.includes('function searchResultRowHTML(vm)') &&
  app.includes('class="card search-result-row"') &&
  app.includes('pagination.cards') &&
  app.includes('.map(searchResultRowHTML)')
);

check(
  'B2 preserves shared cardHTML for non-Search surfaces',
  app.includes('function cardHTML(vm, searchOrigin = false)') &&
  app.includes('searchOrigin = false') &&
  app.includes('cardHTML(slot.card)') &&
  app.includes('cardHTML(slot.card, true)')
);

check(
  'B2 Search rows retain the legacy .card counting contract',
  app.includes('class="card search-result-row"')
);

check(
  'B2 desktop rows are image-left and content-right',
  css.includes(
    'grid-template-columns:minmax(190px,32%) minmax(0,1fr);'
  ) &&
  css.includes('#view-search .search-result-thumb') &&
  css.includes('#view-search .search-result-body')
);

check(
  'B2 mobile rows collapse to one column',
  /@media\(max-width:700px\)\{[\s\S]*?#view-search \.search-result-row\.card\{[\s\S]*?grid-template-columns:1fr;/.test(
    css
  )
);

const viewmodels = read('apps/zfind-web/src/viewmodels.js');
const searchService = read('apps/zfind-web/src/services/search.js');
const developmentService = read('apps/zfind-web/src/services/developments.js');
const supabaseClient = read('apps/zfind-web/src/services/supabaseClient.js');

check(
  'B2 Property Search read embeds existing Listing media',
  searchService.includes('listing_media (') &&
  searchService.includes('position, is_cover') &&
  searchService.includes('media_assets (') &&
  searchService.includes('media_variants (')
);

check(
  'B2 Development Search read embeds own media plus Listing fallback',
  developmentService.includes('development_media (') &&
  developmentService.includes('listing_media (') &&
  developmentService.includes('${MEDIA_EMBED}')
);

check(
  'B2 Search media resolves through existing private-media authority',
  viewmodels.includes(
    'async function resolveSearchCardImageUrl('
  ) &&
  viewmodels.includes(
    'services.supabaseClient.resolveMediaUrl('
  ) &&
  supabaseClient.includes(
    "const targetBucket = bucket || 'listing-media';"
  ) &&
  supabaseClient.includes(
    'const expiry = expirySeconds || 3600;'
  )
);

check(
  'B2 media ordering matches canonical is_cover then position rule',
  viewmodels.includes('a && a.position') &&
  viewmodels.includes('b && b.position') &&
  !viewmodels.includes('a && a.sort_order') &&
  !viewmodels.includes('b && b.sort_order')
);

check(
  'B2 does not fabricate missing Search images',
  viewmodels.includes('if (!asset) return null;') &&
  viewmodels.includes('if (!storagePath) return null;') &&
  app.includes("'placeholder'")
);

check(
  'B2 horizontal organic renderer remains pagination-compatible',
  app.includes('function searchResultRowHTML(vm)') &&
  app.includes('card search-result-row') &&
  css.includes('#view-search .search-result-row')
);


const b34FeaturedStart =
  app.indexOf(
    'function searchFeaturedEmptySlotHTML('
  );

const b34RailStart =
  app.indexOf(
    'async function renderSearchFeaturedRail(marketKey)',
    b34FeaturedStart
  );

const b34FeaturedEnd =
  app.indexOf(
    'async function renderSearch()',
    b34RailStart
  );

const b34FeaturedBlock =
  b34FeaturedStart >= 0 &&
  b34RailStart > b34FeaturedStart &&
  b34FeaturedEnd > b34RailStart
    ? app.slice(b34FeaturedStart, b34FeaturedEnd)
    : '';

const b34RailBlock =
  b34RailStart >= 0 &&
  b34FeaturedEnd > b34RailStart
    ? app.slice(b34RailStart, b34FeaturedEnd)
    : '';

const b34FeaturedService =
  read('apps/zfind-web/src/services/market-featured.js');

check(
  'B3/B4 Search rail declares exact three-slot source-backed contract',
  body.includes('data-search-featured-capacity="3"') &&
  body.includes(
    'data-search-featured-selection-mode="source-backed-market-preview"'
  )
);

check(
  'B3/B4 unscoped Search hides and empties Featured rail',
  b34RailBlock.includes('if (!marketKey)') &&
  b34RailBlock.includes(
    "hideSearchFeaturedRail('unscoped')"
  ) &&
  b34FeaturedBlock.includes(
    "aside.setAttribute('aria-hidden', 'true')"
  ) &&
  b34FeaturedBlock.includes("aside.innerHTML = '';")
);

check(
  'B3/B4 invalid market never triggers a Featured fallback',
  b34RailBlock.includes(
    'MARKET_REGISTRY_SERVICE.getMarket(marketKey)'
  ) &&
  b34RailBlock.includes(
    "hideSearchFeaturedRail('invalid-market')"
  )
);

check(
  'B3/B4 market-scoped Search rail has exactly three slots',
  b34RailBlock.includes('.buildSlots([])') &&
  b34RailBlock.includes('.buildSlots(selected)') &&
  (b34RailBlock.match(/\.slice\(0,\s*3\)/g) || []).length >= 3
);

check(
  'B3/B4 rail reuses deterministic Country Market preview selection',
  b34RailBlock.includes(
    'FEATURED_MARKET_SERVICE.selectPreviewCards('
  ) &&
  b34RailBlock.includes('result.cards') &&
  b34RailBlock.includes('market')
);

check(
  'B3/B4 passive rail uses existing non-Search candidate loader',
  b34RailBlock.includes(
    'await loadFeaturedCandidateCards(state.lang)'
  ) &&
  !b34RailBlock.includes('loadSearchResults(')
);

check(
  'B3/B4 Featured selection couples only to explicit market context',
  !b34RailBlock.includes('transactionType') &&
  !b34RailBlock.includes('rentalPeriod') &&
  !b34RailBlock.includes('budgetMin') &&
  !b34RailBlock.includes('budgetMax') &&
  !b34RailBlock.includes('subtype') &&
  !b34RailBlock.includes('q.q')
);

check(
  'B3/B4 organic and Featured renderers remain structurally separate',
  app.includes('pagination.cards') &&
  app.includes('.map(searchResultRowHTML)') &&
  b34FeaturedBlock.includes(
    'function searchFeaturedCardSlotHTML'
  ) &&
  b34FeaturedBlock.includes(
    'cardHTML(slot.card, true)'
  ) &&
  !b34RailBlock.includes('searchResultRowHTML(')
);

check(
  'B3/B4 Featured labeling reuses existing six-language Market copy',
  b34FeaturedBlock.includes('copy.featuredTitle') &&
  b34FeaturedBlock.includes('copy.featuredBadge') &&
  b34FeaturedBlock.includes('copy.featuredEmptyTitle') &&
  b34FeaturedBlock.includes('copy.featuredErrorTitle')
);

check(
  'B3/B4 introduces no unauthorized paid-placement claim in Search Featured implementation',
  !/\b(sponsored|promoted|paid|advertisement)\b/i.test(
    b34FeaturedBlock
  ) &&
  !/commercial\s+(assignment|ranking|placement)/i.test(
    b34FeaturedBlock
  )
);

check(
  'B3/B4 stale Featured responses cannot paint after market change',
  b34RailBlock.includes("state.view !== 'search'") &&
  b34RailBlock.includes(
    'state.query.market !== market.key'
  )
);

check(
  'B3/B4 exact-market parent substitution remains forbidden',
  b34FeaturedService.includes(
    'no parent-country substitution'
  ) &&
  b34FeaturedService.includes(
    "FEATURED_CAPACITY = 6"
  )
);

check(
  'B3/B4 keeps Country Market Featured capacity at six',
  b34FeaturedService.includes(
    'const FEATURED_CAPACITY = 6;'
  )
);

check(
  'B3/B4 Search Featured rail has dedicated responsive styling',
  css.includes(
    'PHASE B3/B4 — SEARCH FEATURED RAIL'
  ) &&
  css.includes(
    '#view-search .search-featured-slots'
  ) &&
  css.includes(
    '#view-search .search-results-aside[aria-hidden="true"]'
  )
);

check(
  'B3/B4 keeps Featured page-independent while Phase C context stays navigation-only',
  app.includes('renderSearchFeaturedRail(q.market || null)') &&
  !app.includes('renderSearchFeaturedRail(q.market || null, q.page)') &&
  !b34RailBlock.includes('returnQuery') &&
  !b34RailBlock.includes('SEARCH_RETURN_QUERY_KEYS') &&
  !b34RailBlock.includes('searchResultRowHTML(')
);

console.log('');

/* ---------------- PHASE B5 — PAGINATION CONTRACT ---------------- */

const b5Pagination =
  require(
    '../../apps/zfind-web/src/services/search-pagination'
  );

const b5Build =
  read(
    'apps/zfind-web/scripts/build.js'
  );

const b5SearchSource =
  read(
    'apps/zfind-web/src/services/search.js'
  );

const b5DevelopmentsSource =
  read(
    'apps/zfind-web/src/services/developments.js'
  );

const b5BrowserSource =
  read(
    'tests/browser/zfind-web/browser_test.js'
  );

check(
  'B5 page size is exactly six organic rows',
  b5Pagination.SEARCH_PAGE_SIZE === 6
);

const b5Fixture = [
  { kind:'Development', assetId:'dev-b', listingId:'l7' },
  { kind:'Property', assetId:'prop-c', listingId:'l3' },
  { kind:'Land', assetId:'land-b', listingId:'l2' },
  { kind:'Property', assetId:'prop-a', listingId:'l1' },
  { kind:'Development', assetId:'dev-a', listingId:'l6' },
  { kind:'Land', assetId:'land-a', listingId:'l4' },
  { kind:'Property', assetId:'prop-b', listingId:'l5' }
];

const b5P1 =
  b5Pagination.paginate(
    b5Fixture,
    '1'
  );

const b5P2 =
  b5Pagination.paginate(
    b5Fixture,
    '2'
  );

check(
  'B5 deterministic technical order is input-order independent',
  b5Pagination.orderCards(b5Fixture)
    .map(card => card.assetId)
    .join(',') ===
      'land-a,land-b,prop-a,prop-b,prop-c,dev-a,dev-b' &&
  b5Pagination.orderCards(b5Fixture.slice().reverse())
    .map(card => card.assetId)
    .join(',') ===
  b5Pagination.orderCards(b5Fixture)
    .map(card => card.assetId)
    .join(',')
);

check(
  'B5 seven organic results paginate exactly six plus one',
  b5P1.cards.length === 6 &&
  b5P2.cards.length === 1 &&
  b5P1.totalCount === 7 &&
  b5P1.pageCount === 2
);

check(
  'B5 invalid and overflow page values fail safely',
  b5Pagination.paginate(b5Fixture, 'abc').page === 1 &&
  b5Pagination.paginate(b5Fixture, '0').page === 1 &&
  b5Pagination.paginate(b5Fixture, '1.5').page === 1 &&
  b5Pagination.paginate(b5Fixture, '999').page === 2
);

check(
  'B5 pagination copy is exact six-language without fallback',
  ['fr','en','pt','es','de','it'].every(locale => {
    const copy =
      b5Pagination.presentation(
        locale,
        {
          page:1,
          pageCount:2
        }
      );

    return copy.previous && copy.next && copy.page;
  }) &&
  (() => {
    try {
      b5Pagination.presentation(
        'xx',
        {
          page:1,
          pageCount:2
        }
      );
      return false;
    } catch (_) {
      return true;
    }
  })()
);

check(
  'B5 build registers one unique pagination service before viewmodels',
  b5Build.includes(
    "const searchPaginationService = read('services/search-pagination.js');"
  ) &&
  b5Build.includes(
    "+ searchPaginationService + '\\n'"
  ) &&
  b5Build.indexOf('searchPaginationService') <
    b5Build.indexOf('viewmodels.js')
);

check(
  'B5 pagination stays in app presentation layer, not viewmodels or data ports',
  app.includes('const searchResultsCache =') &&
  app.includes('SEARCH_PAGINATION_SERVICE.paginate') &&
  !viewmodels.includes('searchPagination') &&
  !b5SearchSource.includes('f.page') &&
  !b5SearchSource.includes('.range(') &&
  !b5DevelopmentsSource.includes('.range(')
);

check(
  'B5 Search cache key excludes page and page-only render can reuse full results',
  app.includes('function searchResultsCacheKey(') &&
  app.includes('searchResultsCache.key === cacheKey') &&
  app.includes('searchResultsCache.result')
);

check(
  'B5 Search title and unscoped market label derive from full result set',
  app.includes('count: fullCards.length') &&
  app.includes('computeMarketLabel(fullCards)')
);

check(
  'B5 pagination accessibility reuses localized Search title authority',
  body.includes('id="search-results-pagination"') &&
  body.includes('aria-labelledby="search-results-title"') &&
  !body.includes('aria-label="Search result pages"')
);

check(
  'B5 page changes preserve query while Search intent changes reset page',
  app.includes('function goToSearchPage(targetPage)') &&
  app.includes('delete next.page') &&
  (app.match(/delete next\.page;/g) || []).length >= 4
);

check(
  'B5 Featured rail remains market-only and page-independent',
  app.includes('renderSearchFeaturedRail(q.market || null)') &&
  !app.includes('renderSearchFeaturedRail(q.market || null, q.page)')
);

check(
  'B5 pagination has dedicated responsive styling',
  css.includes('#view-search .search-results-pagination') &&
  css.includes('#view-search .search-pagination-button')
);

check(
  'B5 browser regression owns the real two-page flow',
  b5BrowserSource.includes('--- 3C. B5 organic pagination ---') &&
  b5BrowserSource.includes('B5 page 2 organic rows') &&
  b5BrowserSource.includes('b5SearchLogsBeforePageTurn') &&
  b5BrowserSource.includes('b5SearchLogsAfterNext') &&
  b5BrowserSource.includes('b5SearchLogsAfterPrevious')
);

console.log(
  `SEARCH_RESULTS_EXPERIENCE_FOUNDATION_TOTAL=${passed + failed}`
);
console.log(
  `SEARCH_RESULTS_EXPERIENCE_FOUNDATION_PASSED=${passed}`
);
console.log(
  `SEARCH_RESULTS_EXPERIENCE_FOUNDATION_FAILED=${failed}`
);

if (failed) process.exit(1);
