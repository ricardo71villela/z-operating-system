#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

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

let featured;
let registry;

try {
  featured = require(path.join(
    ROOT,
    'apps/zfind-web/src/services/market-featured.js'
  ));
} catch (error) {
  console.error('FEATURED_SERVICE_LOAD_ERROR=' + error.message);
}

try {
  registry = require(path.join(
    ROOT,
    'apps/zfind-web/src/services/market-registry.js'
  ));
} catch (error) {
  console.error('MARKET_REGISTRY_LOAD_ERROR=' + error.message);
}

const app = read('apps/zfind-web/src/app.js');
const css = read('apps/zfind-web/src/css_block.txt');
const build = read('apps/zfind-web/scripts/build.js');
const search = read('apps/zfind-web/src/services/search.js');
const viewmodels = read('apps/zfind-web/src/viewmodels.js');
const browser = read('tests/browser/zfind-web/browser_test.js');

check('market featured service loads', !!featured);
check('market registry still loads', !!registry);

if (featured && registry) {
  check('weekly featured capacity is exactly six',
    featured.FEATURED_CAPACITY === 6);

  check('selection mode is explicit source-backed preview only',
    featured.FEATURED_SELECTION_MODE ===
      'source-backed-market-preview');

  const cards = [
    { assetId:'z', countryIso:'PT', kind:'Property' },
    { assetId:'a', countryIso:'PT', kind:'Property' },
    { assetId:'d', countryIso:'PT', kind:'Development' },
    { assetId:'b', countryIso:'PT', kind:'Land' },
    { assetId:'e', countryIso:'PT', kind:'Property' },
    { assetId:'c', countryIso:'PT', kind:'Property' },
    { assetId:'f', countryIso:'PT', kind:'Property' },
    { assetId:'fr-1', countryIso:'FR', kind:'Property' },
  ];

  const pt = registry.getMarket('PT');
  const selected = featured.selectPreviewCards(cards, pt);

  check('PT selection is market-scoped and capped at six',
    selected.length === 6 &&
    selected.every(card => card.countryIso === 'PT'));

  check('preview selection is deterministic without pretending paid rank',
    selected.map(card => card.assetId).join(',') ===
      'a,b,c,d,e,f');

  check('selected cards preserve original source-backed objects',
    selected.every(card => cards.includes(card)));

  const slots = featured.buildSlots(selected);
  check('exact six positions exist even when fully populated',
    slots.length === 6 &&
    slots.every((slot, index) =>
      slot.position === index + 1 &&
      slot.card
    ));

  const sparse = featured.buildSlots(selected.slice(0, 2));
  check('unfilled positions remain explicit empty slots, never fake listings',
    sparse.length === 6 &&
    sparse.filter(slot => slot.card).length === 2 &&
    sparse.filter(slot => !slot.card).length === 4);

  const dubai = featured.selectPreviewCards(
    cards.concat([
      { assetId:'uae-parent', countryIso:'AE', kind:'Property' }
    ]),
    registry.getMarket('AE-DU')
  );

  check('Dubai never substitutes parent-country UAE inventory',
    dubai.length === 0);

  const england = featured.selectPreviewCards(
    [{ assetId:'uk-parent', countryIso:'GB', kind:'Property' }],
    registry.getMarket('GB-ENG')
  );

  check('England never substitutes generic GB inventory',
    england.length === 0);
}

check('search service exposes no-log public inventory read',
  search.includes('async function listPublished()') &&
  search.includes("'search.listPublished'") &&
  search.includes('return { search, listPublished, logSearch };'));

if (search.includes('async function listPublished()')) {
  const start = search.indexOf('async function listPublished()');
  const end = search.indexOf('async function logSearch', start);
  const body = search.slice(start, end);
  check('featured inventory read does not create Search analytics writes',
    !body.includes('logSearch(') &&
    !body.includes("from('searches')"));
}

check('card viewmodels expose source-backed country ISO',
  (viewmodels.match(/countryIso:\s*zone\.country_iso\s*\|\|\s*null/g) || [])
    .length >= 2);

check('featured candidate loader uses non-search public inventory port',
  viewmodels.includes('async function loadFeaturedCandidateCards(lang)') &&
  viewmodels.includes('services.search.listPublished()') &&
  !viewmodels
    .slice(
      viewmodels.indexOf('async function loadFeaturedCandidateCards(lang)'),
      viewmodels.indexOf('/** Loads real Home page data', viewmodels.indexOf('async function loadFeaturedCandidateCards(lang)'))
    )
    .includes('services.search.search('));

check('market registry exposes full featured UI copy 6/6',
  ['fr','en','pt','es','de','it'].every(locale => {
    const copy = registry.marketPresentation('PT', locale);
    return [
      copy.featuredBadge,
      copy.featuredLoading,
      copy.featuredEmptyTitle,
      copy.featuredEmptyBody,
      copy.featuredErrorTitle,
      copy.featuredErrorBody
    ].every(value => typeof value === 'string' && value.trim());
  }));

check('runtime asynchronously renders source-backed featured slots',
  app.includes('async function renderMarketFeatured(market)') &&
  app.includes('FEATURED_MARKET_SERVICE.selectPreviewCards') &&
  app.includes('FEATURED_MARKET_SERVICE.buildSlots') &&
  app.includes('renderMarketFeatured(market);'));

check('runtime keeps commercial model explicitly pending',
  app.includes('data-featured-commercial-model="pending-dedicated-phase"') &&
  app.includes('data-featured-selection-mode="source-backed-market-preview"'));

check('featured cards reuse canonical shared card navigation',
  app.includes('${cardHTML(slot.card)}'));

check('desktop featured layout is exactly three columns',
  css.includes('#market-featured-root{') &&
  css.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));

check('featured UI is visibly distinct from organic cards',
  css.includes('.market-featured-card') &&
  css.includes('.market-featured-label'));

check('browser build bundles market-featured before viewmodels/app',
  build.includes("read('services/market-featured.js')") &&
  build.indexOf('marketFeaturedService') < build.indexOf("const viewmodels = read('viewmodels.js')") &&
  build.indexOf('marketFeaturedService') < build.indexOf("const app = read('app.js')"));

check('browser regression covers 6 PT slots and zero parent substitution',
  browser.includes('COUNTRY MARKET FEATURED FOUNDATION') &&
  browser.includes('PT featured slots:') &&
  browser.includes('Dubai parent-country substitution cards:'));

console.log('');
console.log(`COUNTRY_MARKET_FEATURED_TOTAL=${passed + failed}`);
console.log(`COUNTRY_MARKET_FEATURED_PASSED=${passed}`);
console.log(`COUNTRY_MARKET_FEATURED_FAILED=${failed}`);

if (failed) process.exit(1);
