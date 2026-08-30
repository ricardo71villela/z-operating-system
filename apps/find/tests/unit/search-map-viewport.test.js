#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const servicePath = path.join(ROOT, 'apps/zfind-web/src/services/search-map-viewport.js');
const source = fs.readFileSync(servicePath, 'utf8');
const executableSource = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const viewport = require(servicePath);

let passed = 0;
let failed = 0;

function check(label, condition, context) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${passed}: ${label}`);
    return;
  }

  failed += 1;
  console.error(`FAIL ${failed}: ${label}${context ? ` :: ${JSON.stringify(context)}` : ''}`);
}

check(
  'viewport module exposes provider-neutral synchronization API',
  typeof viewport.normalizeBounds === 'function' &&
  typeof viewport.pointInBounds === 'function' &&
  typeof viewport.filterPinsInBounds === 'function' &&
  typeof viewport.computeBoundsForPins === 'function' &&
  typeof viewport.buildViewportState === 'function'
);

const france = { south: 41, west: -6, north: 52, east: 10 };
check(
  'ordinary bounds normalize without changing semantic orientation',
  JSON.stringify(viewport.normalizeBounds(france)) === JSON.stringify(france)
);

check(
  'invalid latitude ordering and invalid coordinates fail closed',
  viewport.normalizeBounds({ south: 50, west: -5, north: 40, east: 5 }) === null &&
  viewport.normalizeBounds({ south: -95, west: -5, north: 40, east: 5 }) === null &&
  viewport.normalizeBounds({ south: 40, west: -181, north: 50, east: 5 }) === null
);

check(
  'ordinary viewport contains Paris and excludes Porto',
  viewport.pointInBounds(48.8566, 2.3522, france) === true &&
  viewport.pointInBounds(41.1579, -8.6291, france) === false
);

const dateline = { south: -30, west: 170, north: 30, east: -170 };
check(
  'antimeridian-crossing bounds include both sides and exclude Greenwich',
  viewport.pointInBounds(0, 179, dateline) === true &&
  viewport.pointInBounds(0, -179, dateline) === true &&
  viewport.pointInBounds(0, 0, dateline) === false
);

const pins = [
  { id: 'paris', latitude: 48.8566, longitude: 2.3522 },
  { id: 'lille', latitude: 50.62925, longitude: 3.057256 },
  { id: 'porto', latitude: 41.1579, longitude: -8.6291 },
  { id: 'invalid', latitude: 120, longitude: 0 }
];
const before = JSON.stringify(pins);
const visibleFrance = viewport.filterPinsInBounds(pins, france);
check(
  'filter preserves source order and source pin references',
  visibleFrance.length === 2 &&
  visibleFrance[0] === pins[0] &&
  visibleFrance[1] === pins[1]
);
check('filtering does not mutate source pins', JSON.stringify(pins) === before);

const europeBounds = viewport.computeBoundsForPins(pins);
check(
  'computed European bounds cover every valid pin and ignore invalid coordinates',
  europeBounds &&
  viewport.pointInBounds(48.8566, 2.3522, europeBounds) &&
  viewport.pointInBounds(50.62925, 3.057256, europeBounds) &&
  viewport.pointInBounds(41.1579, -8.6291, europeBounds) &&
  europeBounds.south === 41.1579 &&
  europeBounds.north === 50.62925,
  europeBounds
);

const datelineBounds = viewport.computeBoundsForPins([
  { id: 'east', latitude: 10, longitude: 179 },
  { id: 'west', latitude: -10, longitude: -179 }
]);
check(
  'computed bounds choose the short antimeridian-crossing longitude arc',
  datelineBounds &&
  datelineBounds.west === 179 &&
  datelineBounds.east === -179 &&
  viewport.pointInBounds(10, 179, datelineBounds) &&
  viewport.pointInBounds(-10, -179, datelineBounds) &&
  !viewport.pointInBounds(0, 0, datelineBounds),
  datelineBounds
);

const single = viewport.computeBoundsForPins([
  { id: 'single', latitude: 43.6047, longitude: 1.4442 }
]);
check(
  'single-pin bounds collapse exactly to the authored point',
  single && single.south === 43.6047 && single.north === 43.6047 &&
  single.west === 1.4442 && single.east === 1.4442,
  single
);

check(
  'no valid coordinates produce no synthetic bounds',
  viewport.computeBoundsForPins([]) === null &&
  viewport.computeBoundsForPins([{ id: 'bad', latitude: null, longitude: null }]) === null
);

const state = viewport.buildViewportState(pins, france, 'lille');
check(
  'viewport state synchronizes visible list ids and visible selection',
  state.totalPinCount === 4 &&
  state.visiblePinCount === 2 &&
  state.visibleIds.join(',') === 'paris,lille' &&
  state.selectedId === 'lille' &&
  state.visiblePins[1] === pins[1],
  state
);

const hiddenSelection = viewport.buildViewportState(pins, france, 'porto');
check(
  'selection outside current viewport fails closed without inventing visibility',
  hiddenSelection.selectedId === null &&
  hiddenSelection.visibleIds.join(',') === 'paris,lille'
);

const invalidState = viewport.buildViewportState(pins, { south: 20, west: 0, north: 10, east: 1 }, 'paris');
check(
  'invalid viewport yields explicit empty synchronized state',
  invalidState.bounds === null &&
  invalidState.visiblePinCount === 0 &&
  invalidState.visibleIds.length === 0 &&
  invalidState.selectedId === null
);

check(
  'viewport foundation performs no executable network, geocoding or provider SDK call',
  !/\bfetch\s*\(/.test(executableSource) &&
  !/\bXMLHttpRequest\b/.test(executableSource) &&
  !/\bgeocode\w*\s*\(/i.test(executableSource) &&
  !source.includes('maps.googleapis.com') &&
  !source.includes('openstreetmap.org') &&
  !source.includes('maptiler.com')
);

console.log('');
console.log(`SEARCH_MAP_VIEWPORT_TOTAL=${passed + failed}`);
console.log(`SEARCH_MAP_VIEWPORT_PASSED=${passed}`);
console.log(`SEARCH_MAP_VIEWPORT_FAILED=${failed}`);

if (failed) process.exit(1);
console.log('Z_FIND_SEARCH_MAP_VIEWPORT_V1=PASS');
