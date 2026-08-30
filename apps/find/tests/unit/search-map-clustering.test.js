#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const servicePath = path.join(ROOT, 'apps/zfind-web/src/services/search-map-clustering.js');
const source = fs.readFileSync(servicePath, 'utf8');
const executableSource = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const clustering = require(servicePath);

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
  'clustering module exposes provider-neutral pure API',
  typeof clustering.projectWebMercator === 'function' &&
  typeof clustering.clusterMapPins === 'function'
);

const worldCenter = clustering.projectWebMercator(0, 0, 0);
check(
  'Web Mercator world center is deterministic at zoom zero',
  worldCenter && Math.abs(worldCenter.x - 128) < 1e-9 && Math.abs(worldCenter.y - 128) < 1e-9,
  worldCenter
);

check(
  'invalid zooms fail closed',
  clustering.projectWebMercator(0, 0, -1) === null &&
  clustering.projectWebMercator(0, 0, 23) === null &&
  clustering.projectWebMercator(0, 0, 1.5) === null &&
  clustering.clusterMapPins([], { zoom: 'bad' }).length === 0
);

const pole = clustering.projectWebMercator(90, 0, 5);
check(
  'polar latitude is safely clamped into finite Web Mercator space',
  pole && Number.isFinite(pole.x) && Number.isFinite(pole.y),
  pole
);

const basePins = [
  { id: 'paris', latitude: 48.8566, longitude: 2.3522 },
  { id: 'lille', latitude: 50.62925, longitude: 3.057256 },
  { id: 'porto', latitude: 41.1579, longitude: -8.6291 },
  { id: 'invalid', latitude: 120, longitude: 0 },
  { id: '', latitude: 45, longitude: 2 }
];

const before = JSON.stringify(basePins);
const lowZoom = clustering.clusterMapPins(basePins, { zoom: 0, cellSizePx: 64 });
check(
  'low zoom deterministically groups nearby European pins',
  lowZoom.some(feature => feature.type === 'cluster' && feature.count >= 2),
  lowZoom
);

check(
  'clustering does not mutate input pins',
  JSON.stringify(basePins) === before
);

const reversed = clustering.clusterMapPins(basePins.slice().reverse(), { zoom: 0, cellSizePx: 64 });
check(
  'cluster output is independent of input order',
  JSON.stringify(lowZoom) === JSON.stringify(reversed),
  { lowZoom, reversed }
);

const highZoom = clustering.clusterMapPins(basePins, { zoom: 12, cellSizePx: 64 });
check(
  'higher zoom separates the three valid city pins',
  highZoom.length === 3 && highZoom.every(feature => feature.type === 'pin' && feature.count === 1),
  highZoom
);

const samePoint = clustering.clusterMapPins([
  { id: 'a', latitude: 48.8566, longitude: 2.3522 },
  { id: 'b', latitude: 48.8566, longitude: 2.3522 }
], { zoom: 22, cellSizePx: 24 });
check(
  'coincident listings cluster even at maximum supported zoom',
  samePoint.length === 1 &&
  samePoint[0].type === 'cluster' &&
  samePoint[0].count === 2 &&
  samePoint[0].memberIds.join(',') === 'a,b',
  samePoint
);

const duplicatesForward = clustering.clusterMapPins([
  { id: 'dup', latitude: 48, longitude: 2 },
  { id: 'dup', latitude: 49, longitude: 3 },
  { id: 'other', latitude: 48, longitude: 2 }
], { zoom: 10 });
const duplicatesReverse = clustering.clusterMapPins([
  { id: 'other', latitude: 48, longitude: 2 },
  { id: 'dup', latitude: 49, longitude: 3 },
  { id: 'dup', latitude: 48, longitude: 2 }
], { zoom: 10 });
check(
  'duplicate listing ids are deterministically de-duplicated',
  JSON.stringify(duplicatesForward) === JSON.stringify(duplicatesReverse) &&
  duplicatesForward.reduce((sum, feature) => sum + feature.count, 0) === 2,
  { duplicatesForward, duplicatesReverse }
);

check(
  'invalid explicit cluster cell sizes fail closed',
  clustering.clusterMapPins(basePins, { zoom: 8, cellSizePx: 10 }).length === 0 &&
  clustering.clusterMapPins(basePins, { zoom: 8, cellSizePx: 300 }).length === 0
);

const defaultCell = clustering.clusterMapPins(basePins, { zoom: 8 });
check(
  'omitted cell size uses named deterministic default',
  clustering.DEFAULT_CELL_SIZE_PX === 64 && Array.isArray(defaultCell)
);

check(
  'foundation performs no executable network, geocoding or provider SDK call',
  !/\bfetch\s*\(/.test(executableSource) &&
  !/\bXMLHttpRequest\b/.test(executableSource) &&
  !/\bgeocode\w*\s*\(/i.test(executableSource) &&
  !source.includes('maps.googleapis.com') &&
  !source.includes('openstreetmap.org') &&
  !source.includes('maptiler.com')
);

console.log('');
console.log(`SEARCH_MAP_CLUSTERING_TOTAL=${passed + failed}`);
console.log(`SEARCH_MAP_CLUSTERING_PASSED=${passed}`);
console.log(`SEARCH_MAP_CLUSTERING_FAILED=${failed}`);

if (failed) process.exit(1);
console.log('Z_FIND_SEARCH_MAP_CLUSTERING_V1=PASS');
