/* Contract: commune search, natural-language search, advanced filters and order. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const places = require(path.join(WEB, 'src', 'services', 'place-search.js'));
const natural = require(path.join(WEB, 'src', 'services', 'natural-search.js'));
places.setLoader(p => JSON.parse(fs.readFileSync(path.join(WEB, 'public', p), 'utf8')));

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}

(async () => {
  console.log('\n=== Z FIND ADVANCED SEARCH ===');

  // Places.
  const evian = await places.search('evian');
  check('"evian" finds Évian-les-Bains first (accents ignored)', evian[0] && evian[0].code === '74119' && evian[0].country === 'FR');
  const cp = await places.search('74500', { limit: 20 });
  check('postcode 74500 finds Évian-les-Bains', cp.some(p => p.code === '74119'));
  const elsene = await places.search('Elsene', { countries: ['BE'] });
  check('Dutch name "Elsene" finds Ixelles', elsene[0] && elsene[0].name === 'Ixelles');
  const kirchberg = await places.search('Kirchberg', { countries: ['LU'] });
  check('district "Kirchberg" finds Luxembourg-City', kirchberg[0] && kirchberg[0].code === 'LU-LUXEMBOURG');
  check('a listing city resolves only when unique', (await places.resolveCity('FR', 'Évian-les-Bains')).code === '74119' &&
    (await places.resolveCity('FR', 'Saint-Denis')) === null && (await places.resolveCity('FR', 'Saint-Denis', '93200')).code === '93066');
  check('commune in the address: FR:74119 round-trips', places.encode({ country: 'FR', code: '74119' }) === 'FR:74119' &&
    (await places.byCode('FR:74119')).name === 'Évian-les-Bains' && places.decode('XX:1') === null && places.decode('<b>') === null);

  // Natural language.
  const a = natural.parse('T3 avec balcon à Évian-les-Bains moins de 450 000 €');
  check('French sentence → 3 rooms, apartment, outdoor, max 450 000 €, place Évian',
    a.filters.roomsMin === 3 && a.filters.subtype === 'apartment' && a.filters.outdoor === true && a.filters.priceMax === 450000 && a.place === 'evian-les-bains');
  const b = natural.parse('3-bedroom house in Namur under 400k');
  check('English sentence → house, 3 bedrooms, max 400 000 €, place Namur',
    b.filters.subtype === 'villa' && b.filters.bedsMin === 3 && b.filters.priceMax === 400000 && b.place === 'namur');
  const c = natural.parse('maison 4 chambres jardin Thonon entre 500 000 et 700 000 €');
  check('price range "entre … et …"', c.filters.priceMin === 500000 && c.filters.priceMax === 700000 && c.filters.outdoor);
  const d = natural.parse('location studio Luxembourg');
  check('rental studio', d.filters.transactionType === 'rent' && d.filters.subtype === 'apartment' && d.place === 'luxembourg');
  const e = natural.parse('appartement 80 m2 DPE C Lyon parking ascenseur');
  check('surface, energy class and features', e.filters.areaMin === 80 && e.filters.energyMax === 'C' && e.filters.parking && e.filters.lift);
  check('a plain place or postcode is left untouched', natural.parse('Évian-les-Bains').place === 'Évian-les-Bains' && !natural.parse('74500').hasCriteria);
  check('amounts: 450k, 1,2 M€, 450 000 €', natural.parseAmount('450', 'k') === 450000 && natural.parseAmount('1,2', 'M') === 1200000 && natural.parseAmount('450 000', '') === 450000);

  // Advanced filters (viewmodels.js helpers, run in isolation).
  const source = fs.readFileSync(path.join(WEB, 'src', 'viewmodels.js'), 'utf8');
  const start = source.indexOf('const ENERGY_ORDER');
  const end = source.indexOf('async function loadSearchResults');
  const context = { Date, Number, String, Array, Infinity };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + ';globalThis.apply = applyAdvancedSearchFilters;', context);
  const card = (id, extra) => Object.assign({ assetId: id, kind: 'Property', title: id, cityLabel: 'Évian-les-Bains', zoneLabel: 'Évian-les-Bains', countryIso: 'FR', priceValue: 400000, areaSqm: 70, rooms: 3, bedrooms: 2, energyRating: 'C', hasOutdoor: false, hasParking: false, hasLift: false, createdAt: '2026-09-01' }, extra);
  const cards = [
    card('a', { hasOutdoor: true, priceValue: 420000, createdAt: '2026-09-20' }),
    card('b', { rooms: 2, priceValue: 300000, createdAt: '2026-09-25' }),
    card('c', { energyRating: 'F', hasOutdoor: true, priceValue: 350000 }),
    card('d', { cityLabel: 'Thonon-les-Bains', zoneLabel: 'Thonon-les-Bains', hasOutdoor: true }),
    card('e', { hasOutdoor: true, priceValue: 690000, areaSqm: 110, rooms: 4 }),
    { assetId: 'dev', kind: 'Development', title: 'Programme', cityLabel: 'Évian-les-Bains', countryIso: 'FR', priceValue: 300000 }
  ];
  const ids = list => list.map(x => x.assetId).join(',');
  const place = await places.byCode('FR:74119');
  check('commune + rooms + outdoor + max price', ids(context.apply(cards, { place, roomsMin: '3', outdoor: true, budgetMax: 500000 })) === 'a,c');
  check('energy class at least C', ids(context.apply(cards, { place, energyMax: 'C', outdoor: true })) === 'a,e');
  check('property-only criteria leave developments out; none keeps them', !ids(context.apply(cards, { roomsMin: '1' })).includes('dev') && ids(context.apply(cards, {})).includes('dev'));
  check('orders: price up, price down, newest, price per m²',
    ids(context.apply(cards, { place, sort: 'price_asc' })).startsWith('b,dev') &&
    ids(context.apply(cards, { place, sort: 'price_desc' })).startsWith('e,a') &&
    ids(context.apply(cards, { place, sort: 'recent' })).startsWith('b,a') &&
    ids(context.apply(cards, { place, sort: 'ppm2_asc' })).startsWith('b,'));
  check('free text ignores accents', ids(context.apply(cards, { q: 'thonon les bains' })) === 'd');

  // Wiring.
  const app = fs.readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
  const build = fs.readFileSync(path.join(WEB, 'scripts', 'build.js'), 'utf8');
  check('search bars: commune suggestions and sentences', app.includes("attachPlaceAutocomplete(document.getElementById('search-q'), applySearchBar);") &&
    app.includes("attachPlaceAutocomplete(document.getElementById('home-q'), submitHomeSearch);") && app.includes('async function searchQueryFromText('));
  check('criteria panel and order are in the address and the cache key', app.includes("const ADVANCED_SEARCH_KEYS = Object.freeze(['commune', 'priceMin', 'priceMax', 'areaMin', 'rooms', 'beds', 'dpe', 'outdoor', 'parking', 'lift', 'sort']);") &&
    app.includes('.concat(ADVANCED_SEARCH_KEYS.map(') && app.includes('keepOrder: Boolean((state.query || {}).sort)'));
  check('listing page compares the price with the official market estimate', app.includes('renderListingMarketContext(vm);') && app.includes("engine.estimate({ market: country, communeCode: place.code, type, surface, askingPrice: price }"));
  check('build loads place and natural-language search', build.includes("read('services/place-search.js')") && build.includes("read('services/natural-search.js')") && build.includes("read('search-advanced.css')"));

  console.log(`\nADVANCED SEARCH: ${passed}/${passed} PASSED`);
})().catch(error => { console.error(error); process.exit(1); });
