#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const ui = require(path.join(ROOT, 'apps/zfind-web/src/services/search-map-ui.js'));
const viewport = require(path.join(ROOT, 'apps/zfind-web/src/services/search-map-viewport.js'));
const buildSource = require('fs').readFileSync(path.join(ROOT, 'apps/zfind-web/scripts/build.js'), 'utf8');

const cards = [
  {assetId:'p1',kind:'Property',title:'Paris',locationLabel:'Paris',priceLabel:'€1'},
  {assetId:'p2',kind:'Land',title:'Lyon',locationLabel:'Lyon',priceLabel:'€2'},
  {assetId:'d1',kind:'Development',title:'Dev',locationLabel:'Nice',priceLabel:'€3'}
];
const pins = [
  {id:'p1',latitude:48.8566,longitude:2.3522},
  {id:'p2',latitude:45.764,longitude:4.8357},
  {id:'other',latitude:41.15,longitude:-8.61}
];
assert.equal(ui.normalizeLang('pt'),'pt');
assert.equal(ui.normalizeLang('xx'),'fr');
assert.equal(ui.targetForKind('Land'),'land');
assert.equal(ui.targetForKind('Development'),'development');
assert.equal(ui.targetForKind('Property'),'property');
const page = ui.pinsForPage(pins,cards,['p2','p1','d1']);
assert.deepEqual(page.map(p=>p.id),['p1','p2']);
assert.equal(page[0].card.title,'Paris');
const visible = ui.visiblePinsForBounds(page,{south:47,west:1,north:50,east:3},viewport);
assert.deepEqual(visible.map(p=>p.id),['p1']);
assert.equal(ui.listLabel(cards[0]),'Paris — Paris');
assert.equal(ui.listLabel(null),'');
assert.equal(ui.escapeHtml('<b>&'), '&lt;b&gt;&amp;');
assert.equal(ui.installBrowser(null,null,null),null);
assert.match(buildSource, /search-map-ui\.css/);
assert.match(buildSource, /services\/search-map-viewport\.js/);
assert.match(buildSource, /services\/search-map-ui\.js/);
assert.doesNotMatch(require('fs').readFileSync(path.join(ROOT, 'apps/zfind-web/src/services/search-map-ui.js'), 'utf8'), /\bgeocode\w*\s*\(/i);
console.log('Z_FIND_SEARCH_MAP_UI_V1=PASS');
