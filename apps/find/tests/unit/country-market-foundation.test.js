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

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

let registry;
let routes;
let generator;
let seoScript;

try {
  registry = require(path.join(
    ROOT,
    'apps/zfind-web/src/services/market-registry.js'
  ));
} catch (error) {
  console.error('MARKET_REGISTRY_LOAD_ERROR=' + error.message);
}

try {
  routes = require(path.join(
    ROOT,
    'apps/zfind-web/src/services/public-routes.js'
  ));
} catch (error) {
  console.error('PUBLIC_ROUTES_LOAD_ERROR=' + error.message);
}

try {
  generator = require(path.join(
    ROOT,
    'apps/zfind-web/src/services/seo-page-generator.js'
  ));
} catch (error) {
  console.error('SEO_GENERATOR_LOAD_ERROR=' + error.message);
}

try {
  seoScript = require(path.join(
    ROOT,
    'apps/zfind-web/scripts/generate-seo-pages.js'
  ));
} catch (error) {
  console.error('SEO_SCRIPT_LOAD_ERROR=' + error.message);
}

const body = read('apps/zfind-web/src/body.html');
const app = read('apps/zfind-web/src/app.js');
const build = read('apps/zfind-web/scripts/build.js');
const i18n = read('apps/zfind-web/src/i18n.js');

check('market registry service loads', !!registry);
check('public routes service loads', !!routes);
check('SEO page generator loads', !!generator);
check('SEO build script loads without network access', !!seoScript);

if (registry) {
  const expectedLocales = ['fr', 'en', 'pt', 'es', 'de', 'it'];
  const expectedKeys = [
    'PT','ES','FR','DE','IT','IE',
    'GB-ENG','GB-SCT','GB-WLS','GB-NIR',
    'NL','BE',
    'US','CA','MX','BR','AR',
    'CL','DO','PL','GR','HR','CY','AE-DU'
  ];

  check('market locale authority is exact 6/6',
    same(registry.MARKET_LOCALES, expectedLocales));

  const markets = registry.listMarkets();
  check('exact 24 marketplace markets registered',
    markets.length === 24 &&
    same(markets.map(m => m.key), expectedKeys));

  check('every market has labels and slugs in all six locales',
    markets.every(m =>
      expectedLocales.every(locale =>
        typeof m.labels[locale] === 'string' &&
        m.labels[locale].trim() &&
        typeof m.slugs[locale] === 'string' &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.slugs[locale])
      )
    ));

  check('all clean market URLs are unique per locale',
    expectedLocales.every(locale => {
      const paths = markets.map(m => registry.marketPath(m.key, locale));
      return new Set(paths).size === markets.length;
    }));

  check('approved localized Portugal paths are exact',
    registry.marketPath('PT', 'fr') === '/fr/marches/portugal' &&
    registry.marketPath('PT', 'en') === '/en/markets/portugal' &&
    registry.marketPath('PT', 'pt') === '/pt/mercados/portugal' &&
    registry.marketPath('PT', 'es') === '/es/mercados/portugal' &&
    registry.marketPath('PT', 'de') === '/de/maerkte/portugal' &&
    registry.marketPath('PT', 'it') === '/it/mercati/portogallo');

  const england = registry.getMarket('GB-ENG');
  const dubai = registry.getMarket('AE-DU');

  check('England remains exact constituent-market geography',
    england &&
    england.geography.kind === 'constituent-country' &&
    england.geography.code === 'GB-ENG' &&
    england.geography.parentCountryIso === 'GB' &&
    england.searchScope.kind === 'exact_market' &&
    england.searchScope.value === 'GB-ENG');

  check('Dubai remains Emirate of Dubai, never generic UAE',
    dubai &&
    dubai.geography.kind === 'emirate' &&
    dubai.geography.code === 'AE-DU' &&
    dubai.geography.parentCountryIso === 'AE' &&
    dubai.searchScope.kind === 'exact_market' &&
    dubai.searchScope.value === 'AE-DU' &&
    !markets.some(m => m.key === 'AE'));

  check('sovereign markets carry explicit country_iso search scopes',
    ['PT','ES','FR','DE','IT','IE','NL','BE','US','CA','MX','BR','AR','CL','DO','PL','GR','HR','CY']
      .every(key => {
        const market = registry.getMarket(key);
        return market.searchScope.kind === 'country_iso' &&
          market.searchScope.value === key;
      }));

  check('new market presentation copy is complete 6/6 without fallback',
    expectedLocales.every(locale => {
      const p = registry.marketPresentation('PT', locale);
      return [
        p.heroEyebrow,
        p.heroTitle,
        p.heroLead,
        p.featuredTitle,
        p.searchTitle,
        p.guidesTitle,
        p.legalLabel,
        p.rentalLabel,
        p.seoTitle,
        p.seoDescription
      ].every(value => typeof value === 'string' && value.trim());
    }));

  let rejected = false;
  try {
    registry.marketPresentation('PT', 'xx');
  } catch (_) {
    rejected = true;
  }
  check('new market copy rejects unsupported locales instead of fallback',
    rejected);
}

if (routes) {
  check('public routes expose localized market route segments',
    routes.ROUTES.fr.market === 'marches' &&
    routes.ROUTES.en.market === 'markets' &&
    routes.ROUTES.pt.market === 'mercados' &&
    routes.ROUTES.es.market === 'mercados' &&
    routes.ROUTES.de.market === 'maerkte' &&
    routes.ROUTES.it.market === 'mercati');

  check('clean market path parser recognizes a market URL',
    same(
      routes.parsePublicPath('/pt/mercados/portugal'),
      { type:'market', locale:'pt', slug:'portugal' }
    ));
}

check('single reusable market view exists',
  body.includes('id="view-market"') &&
  body.includes('id="market-root"'));

check('market selectors target marketplace, not legal guide directly',
  (body.match(/data-market-select/g) || []).length === 2 &&
  body.includes('onchange="navigateMarket(this.value)"') &&
  !body.includes('data-market-guide-select'));

check('app dispatches one reusable market renderer',
  app.includes("case 'market': renderMarket(state.id); break;") &&
  app.includes('function renderMarket(marketKey)'));

check('legacy content-navigation-only market guide mode retired',
  !app.includes("MARKET_GUIDE_MODE = 'content-navigation-only'") &&
  !app.includes('const MARKET_GUIDES = Object.freeze'));

check('market selector navigation uses stable market key',
  app.includes("navigate('market', marketKey, {})"));

check('browser build bundles market registry before app',
  build.includes("read('services/market-registry.js')") &&
  build.indexOf('marketRegistryService') < build.indexOf("const app = read('app.js')"));

check('legacy homepage copy now describes entering markets, not only guides',
  i18n.includes("eyebrow:'International markets'") &&
  i18n.includes("eyebrow:'Mercados internacionais'") &&
  i18n.includes("eyebrow:'Marchés internationaux'"));

if (generator && seoScript && registry) {
  check('legacy listing SEO locale scope remains intentionally 3-language',
    same(generator.LOCALES, ['en','pt','fr']));

  check('market SEO locale scope is exact six',
    same(generator.MARKET_LOCALES, ['fr','en','pt','es','de','it']));

  const entries = seoScript.buildMarketSeoEntries('https://zfind.online');

  check('24 markets x 6 languages yields 144 static SEO pages',
    entries.length === 144);

  check('all 144 static SEO public paths are unique',
    new Set(entries.map(entry => entry.publicPath)).size === 144);

  const sample = entries.find(
    entry => entry.marketKey === 'PT' && entry.locale === 'en'
  );

  check('market SEO sample has clean canonical, not hash authority',
    sample &&
    sample.publicPath === '/en/markets/portugal' &&
    sample.canonicalUrl === 'https://zfind.online/en/markets/portugal' &&
    sample.html.includes(
      '<link rel="canonical" href="https://zfind.online/en/markets/portugal">'
    ) &&
    !sample.html.includes(
      '<link rel="canonical" href="https://zfind.online/#/'
    ));

  check('market SEO sample exposes 6 hreflang alternates plus x-default',
    sample &&
    (sample.html.match(/rel="alternate" hreflang="/g) || []).length === 7 &&
    ['fr','en','pt','es','de','it','x-default'].every(
      code => sample.html.includes(`hreflang="${code}"`)
    ));

  check('static market page and interactive SPA remain explicitly connected',
    sample &&
    sample.html.includes('https://zfind.online/#/en/market/PT'));
}

console.log('');
console.log(`COUNTRY_MARKET_FOUNDATION_TOTAL=${passed + failed}`);
console.log(`COUNTRY_MARKET_FOUNDATION_PASSED=${passed}`);
console.log(`COUNTRY_MARKET_FOUNDATION_FAILED=${failed}`);

if (failed) process.exit(1);
