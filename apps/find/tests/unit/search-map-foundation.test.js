#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const servicePath = path.join(ROOT, 'apps/zfind-web/src/services/search.js');
const source = fs.readFileSync(servicePath, 'utf8');
const search = require(servicePath);

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
  'published Property query reads publisher-authored latitude/longitude',
  source.includes('zone_lite_id, latitude, longitude')
);

check(
  'map foundation exports pure coordinate helpers',
  typeof search.normalizeCoordinatePair === 'function' &&
  typeof search.buildMapPins === 'function'
);

const missingCases = [
  [null, null],
  [undefined, undefined],
  ['', ''],
  ['   ', '  '],
  [48.8566, null],
  [null, 2.3522]
];

check(
  'missing/nullish coordinate pairs are rejected before Number coercion',
  missingCases.every(([lat, lon]) => search.normalizeCoordinatePair(lat, lon) === null)
);

const invalidCases = [
  [91, 0],
  [-91, 0],
  [0, 181],
  [0, -181],
  ['not-a-number', 2],
  [48, 'not-a-number']
];

check(
  'out-of-range and non-numeric coordinate pairs are rejected',
  invalidCases.every(([lat, lon]) => search.normalizeCoordinatePair(lat, lon) === null)
);

const paris = search.normalizeCoordinatePair('48.8566', '2.3522');
check(
  'valid numeric strings normalize to finite numbers',
  paris && paris.latitude === 48.8566 && paris.longitude === 2.3522,
  paris
);

const rows = [
  {
    id: 'property-paris',
    latitude: '48.8566',
    longitude: '2.3522',
    subtype: 'apartment',
    typology: 'T2',
    zone_lite_id: 'zone-paris'
  },
  {
    id: 'property-missing',
    latitude: null,
    longitude: null,
    subtype: 'apartment'
  },
  {
    id: 'property-invalid',
    latitude: 120,
    longitude: 2,
    subtype: 'villa'
  },
  {
    id: 'property-lille',
    latitude: 50.62925,
    longitude: 3.057256,
    subtype: 'apartment',
    typology: null,
    zone_lite_id: 'zone-lille'
  },
  {
    id: '',
    latitude: 41.1579,
    longitude: -8.6291
  }
];

const pins = search.buildMapPins(rows);

check('only valid, identified published rows become map pins', pins.length === 2, pins);
check(
  'map pins preserve stable result order',
  pins.map(pin => pin.id).join(',') === 'property-paris,property-lille',
  pins
);
check(
  'map pins expose only identity, authored coordinates and compact taxonomy context',
  Object.keys(pins[0]).join(',') === 'id,latitude,longitude,subtype,typology,zoneLiteId' &&
  pins[0].zoneLiteId === 'zone-paris' &&
  pins[1].typology === null,
  pins
);
check(
  'non-array input fails closed to empty pin set',
  search.buildMapPins(null).length === 0 &&
  search.buildMapPins({}).length === 0
);

check(
  'foundation performs no geocoding or provider-specific map request',
  !/geocod/i.test(source) &&
  !source.includes('maps.googleapis.com') &&
  !source.includes('openstreetmap.org') &&
  !source.includes('maptiler.com')
);

console.log('');
console.log(`SEARCH_MAP_FOUNDATION_TOTAL=${passed + failed}`);
console.log(`SEARCH_MAP_FOUNDATION_PASSED=${passed}`);
console.log(`SEARCH_MAP_FOUNDATION_FAILED=${failed}`);

if (failed) process.exit(1);
console.log('Z_FIND_SEARCH_MAP_FOUNDATION_V1=PASS');
