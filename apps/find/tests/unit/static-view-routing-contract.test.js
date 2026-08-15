#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FIND = path.resolve(__dirname, '../..');
const WEB = path.join(FIND, 'apps/zfind-web');

const app = fs.readFileSync(
  path.join(WEB, 'src/app.js'),
  'utf8'
);

const body = fs.readFileSync(
  path.join(WEB, 'src/body.html'),
  'utf8'
);

const pkg = fs.readFileSync(
  path.join(FIND, 'package.json'),
  'utf8'
);

let passed = 0;

function check(value, label) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}

const legacyWhitelist =
  "['home','search','property','development','land','partner','simulator','zone','legal','al-manual'].includes(state.view)";

check(
  !app.includes(legacyWhitelist),
  'legacy static-view whitelist removed'
);

check(
  app.includes(
    "const requestedView = document.getElementById('view-' + state.view);"
  ),
  'router resolves requested DOM view'
);

check(
  app.includes(
    "requestedView && requestedView.classList.contains('view')"
  ),
  'router accepts only actual .view elements'
);

check(
  app.includes(
    ": document.getElementById('view-home');"
  ),
  'unknown route safely falls back to home'
);

check(
  app.includes(
    "activeView.classList.add('active');"
  ),
  'resolved view receives active state'
);

const staticRoutes = [
  'legal',
  'al-manual',
  'legal-es',
  'al-manual-es',
  'legal-fr',
  'tourist-rental-fr',
  'legal-de',
  'tourist-rental-de',
  'legal-it',
  'tourist-rental-it',
  'legal-ie',
  'tourist-rental-ie',
  'legal-england',
  'tourist-rental-england',
  'legal-scotland',
  'tourist-rental-scotland',
  'legal-wales',
  'tourist-rental-wales',
  'legal-northern-ireland',
  'tourist-rental-northern-ireland'
];

for (const route of staticRoutes) {
  check(
    body.includes(`id="view-${route}"`),
    `${route} has a real DOM view`
  );

  check(
    app.includes(`case '${route}': break;`),
    `${route} remains recognized by render dispatch`
  );
}

const ids = [
  ...body.matchAll(
    /<section class="view" id="([^"]+)"/g
  )
].map(match => match[1]);

check(
  ids.length === new Set(ids).size,
  'all public .view section ids are unique'
);

check(
  pkg.includes(
    '"test:static-view-routing-contract"'
  ),
  'routing regression registered'
);

console.log(
  `\nSTATIC VIEW ROUTING CONTRACT: ` +
  `${passed}/${passed} PASSED`
);
