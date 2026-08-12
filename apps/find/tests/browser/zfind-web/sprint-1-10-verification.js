'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const DIST = path.resolve(
  ROOT,
  'apps/zfind-web/dist/z-find-prototype.html'
);
const FILE_URL = pathToFileURL(DIST).href;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  ✅ ' + message);
  } else {
    failed += 1;
    console.log('  ❌ ' + message);
  }
}

async function main() {
  const appSource = fs.readFileSync(
    path.resolve(ROOT, 'apps/zfind-web/src/app.js'),
    'utf8'
  );

  const vmSource = fs.readFileSync(
    path.resolve(ROOT, 'apps/zfind-web/src/viewmodels.js'),
    'utf8'
  );

  const buildSource = fs.readFileSync(
    path.resolve(ROOT, 'apps/zfind-web/scripts/build.js'),
    'utf8'
  );

  console.log(
    '\n=== 1. Source runtime has no fixture DB dependency ==='
  );

  assert(
    !fs.existsSync(
      path.resolve(ROOT, 'apps/zfind-web/src/db.js')
    ),
    'Prototype db.js is removed'
  );

  assert(
    !buildSource.includes("read('db.js')") &&
    !buildSource.includes("+ db +"),
    'Public build no longer includes db.js'
  );

  const legacyNames = [
    'getRepresentationHistory',
    'getActiveRepresentation',
    'getListingForAsset',
    'getTrustViewModel',
    'getListingCardViewModel',
    'getAllCardViewModels',
    'searchCards',
    'getPropertyDetailViewModel',
    'getDevelopmentDetailViewModel',
    'getEnquiryConfig',
  ];

  // Architectural dependency checks apply to executable source.
  // Historical comments must not be mistaken for live callers.
  const executableVmSource = vmSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  assert(
    legacyNames.every(
      name => !executableVmSource.includes(name)
    ),
    'Legacy fixture view-model chain is removed'
  );

  assert(
    !appSource.includes(
      "state.id || 'asset_apt_boavista'"
    ) &&
    !appSource.includes(
      "state.id || 'asset_dev_rionorte'"
    ) &&
    !appSource.includes(
      "state.id || 'asset_land_boavista'"
    ),
    'Detail routes no longer invent fixture ids'
  );

  const executablePath =
    process.env.LOCAL_SANDBOX_CHROMIUM_PATH;

  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });

  const page = await browser.newPage();

  const pageErrors = [];
  const restRequests = [];

  page.on(
    'pageerror',
    err => pageErrors.push(String(err))
  );

  await page.route(
    '**/rest/v1/**',
    async route => {
      restRequests.push(route.request().url());

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          message:
            'Missing-id route must not reach Supabase',
        }),
      });
    }
  );

  console.log(
    '\n=== 2. Built runtime does not expose DB ==='
  );

  await page.goto(FILE_URL + '#/en/property');
  await page.waitForTimeout(100);

  const hasDB = await page.evaluate(
    () => typeof DB !== 'undefined'
  );

  assert(
    hasDB === false,
    'Built runtime exposes no global DB fixture'
  );

  console.log(
    '\n=== 3. Missing-id loaders perform zero REST calls ==='
  );

  restRequests.length = 0;

  const results = await page.evaluate(async () => ({
    property: await loadPropertyDetail(null, 'en'),
    land: await loadLandDetail(undefined, 'en'),
    development:
      await loadDevelopmentDetail('', 'en'),
  }));

  assert(
    results.property.notFound === true &&
    results.property.error === null,
    'Property missing id is not-found'
  );

  assert(
    results.land.notFound === true &&
    results.land.error === null,
    'Land missing id is not-found'
  );

  assert(
    results.development.notFound === true &&
    results.development.error === null,
    'Development missing id is not-found'
  );

  assert(
    restRequests.length === 0,
    'Missing-id loaders make zero REST requests'
  );

  console.log(
    '\n=== 4. Missing-id routes never invent fixture ids ==='
  );

  const routes = [
    ['property', 'property-root'],
    ['development', 'development-root'],
    ['land', 'land-root'],
  ];

  for (const [routeName, rootId] of routes) {
    restRequests.length = 0;

    await page.goto(
      FILE_URL + '#/en/' + routeName
    );

    await page.waitForTimeout(100);

    const text = await page.evaluate(id => {
      const root = document.getElementById(id);
      return root ? root.textContent.trim() : '';
    }, rootId);

    assert(
      restRequests.length === 0,
      `${routeName}: zero REST requests without id`
    );

    assert(
      text.length > 0,
      `${routeName}: honest UI state without id`
    );
  }

  console.log(
    '\n=== 5. Policy-less enquiry is conservative ==='
  );

  await page.evaluate(() => {
    openModal('listing-without-policy');
  });

  assert(
    await page.locator(
      '.contact-opt[data-opt="direct"]'
    ).isVisible(),
    'Fallback exposes direct contact'
  );

  assert(
    await page.locator(
      '.contact-opt[data-opt="qualified"]'
    ).count() === 0 &&
    await page.locator(
      '.contact-opt[data-opt="assisted"]'
    ).count() === 0,
    'Fallback invents no qualified/assisted policy'
  );

  assert(
    pageErrors.length === 0,
    'No browser exceptions after fixture retirement'
  );

  await browser.close();

  console.log(
    '\n============================================================'
  );
  console.log(
    `Sprint 1.10: ${passed} passed, ${failed} failed`
  );
  console.log(
    '============================================================'
  );

  if (failed) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
