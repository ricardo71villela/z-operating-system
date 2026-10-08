#!/usr/bin/env node
'use strict';
/* Z FIND — Search « Carte » (V2): pure helpers of search-map-ui.js. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const ui = require(path.join(ROOT, 'apps/zfind-web/src/services/search-map-ui.js'));
const buildSource = fs.readFileSync(path.join(ROOT, 'apps/zfind-web/scripts/build.js'), 'utf8');
const mapSource = fs.readFileSync(path.join(ROOT, 'apps/zfind-web/src/services/search-map-ui.js'), 'utf8');
const nb = s => s.replace(/[  ]/g, ' ');

// Languages and small helpers
assert.equal(ui.normalizeLang('pt'), 'pt');
assert.equal(ui.normalizeLang('xx'), 'fr');
for (const lang of ['fr', 'en', 'pt', 'es', 'de', 'it']) {
  assert.deepEqual(Object.keys(ui.COPY[lang]).sort(), Object.keys(ui.COPY.fr).sort(), `copy keys for ${lang}`);
}
assert.equal(ui.targetForKind('Land'), 'land');
assert.equal(ui.targetForKind('Development'), 'development');
assert.equal(ui.targetForKind('Property'), 'property');
assert.equal(ui.escapeHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');

// Pin labels
assert.equal(nb(ui.shortPrice(420000, 'sale', 'fr')), '420 k€');
assert.equal(nb(ui.shortPrice(1250000, 'sale', 'fr')), '1,25 M€');
assert.equal(nb(ui.shortPrice(1250000, 'sale', 'en')), '1.25 M€');
assert.equal(nb(ui.shortPrice(1200, 'rent', 'fr')), '1 200 €');
assert.equal(nb(ui.shortPrice(15000, 'rent', 'fr')), '15 000 €', 'rents are never shortened');
assert.equal(nb(ui.shortPrice(300000, 'sale', 'fr', 'CHF')), '300 kCHF');
assert.equal(ui.shortPrice(null, 'sale', 'fr'), '—');
assert.equal(ui.shortPrice(0, 'sale', 'fr'), '—');

// Cards → points: exact position first, else the commune centre (approximate), else nothing
const cards = [
  { assetId: 'exact', latitude: 46.4, longitude: 6.59, zoneLiteId: 'z-evian' },
  { assetId: 'centre', latitude: null, longitude: null, zoneLiteId: 'z-evian' },
  { assetId: 'nocentre', zoneLiteId: 'z-annecy' },
  { assetId: 'nozone' },
  { assetId: 'bad', latitude: 123, longitude: 6, zoneLiteId: 'z-evian' },
  { assetId: 'empty', latitude: '', longitude: '' },
  null,
  { title: 'no id' }
];
const centres = { 'z-evian': { latitude: 46.4011, longitude: 6.5879 }, 'z-annecy': { latitude: null, longitude: null } };
const pins = ui.pinsFromCards(cards, centres);
assert.deepEqual(pins.map(p => p.id), ['exact', 'centre', 'bad']);
assert.equal(pins[0].approximate, false);
assert.equal(pins[0].latitude, 46.4);
assert.equal(pins[1].approximate, true);
assert.equal(pins[1].latitude, 46.4011);
assert.equal(pins[2].approximate, true, 'an invalid published position falls back to the commune centre');
assert.equal(pins[0].card, cards[0]);
assert.deepEqual(ui.pinsFromCards(cards, null).map(p => p.id), ['exact'], 'before the centres exist only exact pins show');
assert.deepEqual(ui.pinsFromCards('nope'), []);

// Visible area
const fr = [
  { id: 'paris', latitude: 48.8566, longitude: 2.3522 },
  { id: 'lyon', latitude: 45.764, longitude: 4.8357 },
  { id: 'porto', latitude: 41.15, longitude: -8.61 }
];
assert.deepEqual(ui.pinsInBounds(fr, { south: 47, west: 1, north: 50, east: 3 }).map(p => p.id), ['paris']);
assert.deepEqual(ui.pinsInBounds(fr, null).map(p => p.id), ['paris', 'lyon', 'porto']);

// Grouping on screen: close pins merge into one cluster, distant ones stay apart
const flat = (lat, lng) => ({ x: lng * 100, y: -lat * 100 });
let f = ui.features([
  { id: 'a', latitude: 0, longitude: 0 },
  { id: 'b', latitude: 0, longitude: 0.3 },
  { id: 'c', latitude: 0, longitude: 5 }
], 10, flat, 70);
assert.equal(f.length, 2);
const cluster = f.find(x => x.type === 'cluster');
assert.deepEqual(cluster.memberIds, ['a', 'b']);
assert.equal(cluster.count, 2);
assert.ok(Math.abs(cluster.longitude - 0.15) < 1e-9);
assert.equal(f.find(x => x.type === 'pin').id, 'c');
f = ui.features([{ id: 'x', latitude: 0, longitude: 0 }, { id: 'y', latitude: 0, longitude: 0 }], 18, flat, 70);
assert.equal(f.length, 1, 'same point → one group (opened as a popup)');
const order1 = ui.features(fr, 5).map(x => x.id).join('|');
const order2 = ui.features(fr.slice().reverse(), 5).map(x => x.id).join('|');
assert.equal(order1, order2, 'grouping does not depend on the order of the results');
assert.ok(ui.features(fr, 3).length < ui.features(fr, 12).length, 'zooming in splits the groups');

// Liste / Carte switch and list items
const toggle = ui.toggleHTML('fr', 'map');
assert.match(toggle, /data-search-view="list"[^>]*aria-pressed="false"/);
assert.match(toggle, /smap-toggle-btn is-active" data-search-view="map"/);
assert.match(toggle, /setSearchViewMode\('map'\)/);
assert.match(toggle, />Liste</);
assert.match(toggle, />Carte</);
assert.match(ui.toggleHTML('en', 'list'), />Map</);
const item = ui.listItemHTML({ id: 'p"1', approximate: true, card: { title: '<T3>', priceLabel: '420 000 €', locationLabel: 'Évian', meta: ['3 p.', null, '72 m²'], imageUrl: 'https://x/y.jpg' } }, 'fr', true);
assert.match(item, /data-map-asset-id="p&quot;1"/);
assert.match(item, /&lt;T3&gt;/);
assert.match(item, /smap-approx-tag/);
assert.match(item, /3 p\. · 72 m²/);
assert.match(item, /is-active/);
assert.doesNotMatch(ui.listItemHTML({ id: 'q', approximate: false, card: {} }, 'fr'), /smap-approx-tag|<img/);

// Wiring and boundaries
assert.equal(ui.isOpen(), false);
assert.match(buildSource, /search-map-ui\.css/);
assert.match(buildSource, /services\/search-map-clustering\.js/);
assert.match(buildSource, /services\/search-map-viewport\.js/);
assert.match(buildSource, /services\/search-map-ui\.js/);
assert.ok(buildSource.indexOf('searchMapClusteringService') < buildSource.lastIndexOf('searchMapUiService'), 'clustering is loaded before the map UI');
assert.doesNotMatch(mapSource, /\bgeocode\w*\s*\(/i, 'no address is geocoded');
assert.doesNotMatch(mapSource, /MutationObserver|queueMicrotask/, 'the map renders only on search and on map moves (2026-09-29 freeze)');
assert.doesNotMatch(mapSource, /unpkg\.com|jsdelivr\.net/, 'Leaflet is self-hosted');
assert.ok(fs.existsSync(path.join(ROOT, 'apps/zfind-web/public/vendor/leaflet-1.9.4/leaflet.js')));
console.log('Z_FIND_SEARCH_MAP_UI_V2=PASS');
