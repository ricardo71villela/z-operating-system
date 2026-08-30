#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const servicePath = path.join(
  ROOT,
  'apps/zfind-web/src/services/search-map-interaction.js'
);
const source = fs.readFileSync(servicePath, 'utf8');
const interaction = require(servicePath);

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

const parisBounds = {
  south: 48.80,
  west: 2.20,
  north: 48.90,
  east: 2.45
};

const movedBounds = {
  south: 48.70,
  west: 2.10,
  north: 49.00,
  east: 2.60
};

check(
  'interaction module exposes provider-neutral state API',
  [
    'createInteractionState',
    'selectListing',
    'highlightListing',
    'clearHighlight',
    'selectCluster',
    'changeViewport',
    'commitSearchArea',
    'syncVisibleResults',
    'clearIntent'
  ].every(name => typeof interaction[name] === 'function')
);

const initial = interaction.createInteractionState({
  visibleIds: ['b', 'a', 'b', '', null],
  viewportBounds: parisBounds,
  committedBounds: parisBounds,
  selectedId: 'a'
});

check(
  'initial state normalizes visible ids without reordering first occurrence',
  initial.visibleIds.join(',') === 'b,a' && initial.selectedId === 'a',
  initial
);

check(
  'interaction states and owned arrays are immutable',
  Object.isFrozen(initial) && Object.isFrozen(initial.visibleIds)
);

const fromCard = interaction.selectListing(initial, 'b', 'card');
const fromPin = interaction.selectListing(initial, 'b', 'pin');

check(
  'card and pin selection converge on the same canonical listing id',
  fromCard.selectedId === 'b' && fromPin.selectedId === 'b'
);

check(
  'selection origin produces provider-neutral reciprocal reveal intent',
  fromCard.intent.type === 'reveal-pin' &&
  fromPin.intent.type === 'reveal-card' &&
  fromCard.intent.id === 'b' &&
  fromPin.intent.id === 'b'
);

check(
  'invisible or malformed selection fails closed without changing state',
  interaction.selectListing(initial, 'missing', 'card') === initial &&
  interaction.selectListing(initial, 'a', 'unknown') === initial
);

const highlighted = interaction.highlightListing(initial, 'b', 'keyboard');
const unhighlighted = interaction.clearHighlight(highlighted);
check(
  'visible keyboard/card/pin highlight is reversible without changing selection',
  highlighted.highlightedId === 'b' &&
  highlighted.selectedId === 'a' &&
  unhighlighted.highlightedId === null &&
  unhighlighted.selectedId === 'a'
);

const clustered = interaction.selectCluster(initial, {
  id: 'cluster-1',
  memberIds: ['b', 'a', 'b', 'not-visible']
});

check(
  'cluster selection keeps only visible unique member ids and requests fit intent',
  clustered.activeClusterId === 'cluster-1' &&
  clustered.clusterMemberIds.join(',') === 'a,b' &&
  clustered.intent.type === 'fit-cluster' &&
  clustered.intent.memberIds.join(',') === 'a,b'
);

check(
  'invalid or singleton-visible cluster fails closed',
  interaction.selectCluster(initial, { id:'one', memberIds:['a'] }) === initial &&
  interaction.selectCluster(initial, { id:'hidden', memberIds:['x','y'] }) === initial
);

const userMoved = interaction.changeViewport(initial, movedBounds, 'user');
check(
  'user map movement away from committed bounds enables search-this-area state',
  userMoved.pendingSearchArea === true &&
  interaction.sameBounds(userMoved.viewportBounds, movedBounds)
);

const programmaticMoved = interaction.changeViewport(initial, movedBounds, 'programmatic');
check(
  'programmatic fit/pan never creates search-this-area prompt by itself',
  programmaticMoved.pendingSearchArea === false
);

const movedBack = interaction.changeViewport(userMoved, parisBounds, 'user');
check(
  'user returning exactly to committed bounds clears search-this-area prompt',
  movedBack.pendingSearchArea === false
);

const committed = interaction.commitSearchArea(userMoved);
check(
  'commit search area records current viewport and emits pure run-search-area intent',
  committed.pendingSearchArea === false &&
  interaction.sameBounds(committed.committedBounds, movedBounds) &&
  committed.intent.type === 'run-search-area' &&
  interaction.sameBounds(committed.intent.bounds, movedBounds)
);

const selectedB = interaction.selectListing(initial, 'b', 'card');
const highlightedB = interaction.highlightListing(selectedB, 'b', 'card');
const synced = interaction.syncVisibleResults(highlightedB, ['a']);
check(
  'visible-result synchronization clears stale selection and highlight',
  synced.visibleIds.join(',') === 'a' &&
  synced.selectedId === null &&
  synced.highlightedId === null
);

const clusterSynced = interaction.syncVisibleResults(clustered, ['a']);
check(
  'cluster state clears when fewer than two cluster members remain visible',
  clusterSynced.activeClusterId === null &&
  clusterSynced.clusterMemberIds.length === 0
);

const clearedIntent = interaction.clearIntent(committed);
check(
  'intent acknowledgement is explicit and preserves committed interaction state',
  clearedIntent.intent === null &&
  interaction.sameBounds(clearedIntent.committedBounds, movedBounds)
);

const executable = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

check(
  'interaction contract performs no executable network, geocoding or provider SDK call',
  !/\bfetch\s*\(/.test(executable) &&
  !/XMLHttpRequest/.test(executable) &&
  !/geocod/i.test(executable) &&
  !executable.includes('maps.googleapis.com') &&
  !executable.includes('openstreetmap.org') &&
  !executable.includes('maptiler.com')
);

console.log('');
console.log(`SEARCH_MAP_INTERACTION_TOTAL=${passed + failed}`);
console.log(`SEARCH_MAP_INTERACTION_PASSED=${passed}`);
console.log(`SEARCH_MAP_INTERACTION_FAILED=${failed}`);

if (failed) process.exit(1);
console.log('Z_FIND_SEARCH_MAP_INTERACTION_V1=PASS');
