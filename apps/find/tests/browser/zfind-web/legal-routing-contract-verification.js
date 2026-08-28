#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const DIST = path.resolve(
  __dirname,
  '../../../apps/zfind-web/dist/z-find-prototype.html'
);

const FILE_URL = pathToFileURL(DIST).href;

const routes = [
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

let passed = 0;

function pass(label) {
  passed += 1;
  console.log('PASS:', label);
}

async function activeView(page) {
  return page.locator('.view.active').getAttribute('id');
}

async function expectRoute(page, route, locale = 'en') {
  await page.goto(
    `${FILE_URL}#/${locale}/${route}`
  );

  await page.waitForFunction(
    expected =>
      document.querySelector('.view.active')?.id ===
      `view-${expected}`,
    route
  );

  assert.strictEqual(
    await activeView(page),
    `view-${route}`,
    `${route} must activate its own DOM view`
  );

  assert.strictEqual(
    await page.locator(`#view-${route}`).count(),
    1,
    `${route} must have one DOM view`
  );

  assert(
    await page.locator(`#view-${route}`).isVisible(),
    `${route} must be visibly rendered`
  );

  pass(`${route} activates view-${route}`);
}

async function run() {
  const launchOptions =
    process.env.LOCAL_SANDBOX_CHROMIUM_PATH
      ? {
          executablePath:
            process.env.LOCAL_SANDBOX_CHROMIUM_PATH
        }
      : {};

  const browser = await chromium.launch(
    launchOptions
  );

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1400,
        height: 1000
      }
    });

    console.log(
      '\n=== Z FIND STATIC LEGAL BROWSER ROUTING CONTRACT ==='
    );

    /*
     * Prove every current static legal/tourist route through the
     * real hash parser + render() + DOM .active contract.
     */
    for (const route of routes) {
      await expectRoute(
        page,
        route
      );
    }

    /*
     * Prove an unknown route cannot become an arbitrary DOM target
     * and safely resolves visually to Home.
     */
    await page.goto(
      `${FILE_URL}#/en/not-a-real-view`
    );

    await page.waitForFunction(
      () =>
        document.querySelector('.view.active')?.id ===
        'view-home'
    );

    assert.strictEqual(
      await activeView(page),
      'view-home',
      'unknown route must visually fall back to Home'
    );

    pass(
      'unknown route safely activates view-home'
    );

    /*
     * Legal Guide pages are reading surfaces. The old all-country
     * jurisdiction grid must not be visible above the document.
     */
    await expectRoute(
      page,
      'legal-england'
    );

    const englandLegacyGrid = page.locator(
      '#view-legal-england ' +
      '.legal-page > .legal-header > ' +
      '.legal-callout:has(> button)'
    );

    assert.strictEqual(
      await englandLegacyGrid.count(),
      1,
      'England legacy jurisdiction grid must remain uniquely identifiable'
    );

    assert(
      await englandLegacyGrid.isHidden(),
      'England legacy jurisdiction grid must be hidden on the reading surface'
    );

    pass(
      'Legal Guide hides the legacy all-jurisdiction header grid'
    );

    /*
     * Prove Legal Guide -> separate tourist module using the real
     * in-document link, without relying on a cross-country grid.
     */
    await expectRoute(
      page,
      'legal-wales'
    );

    await page.locator(
      '#view-legal-wales ' +
      'a[onclick*="tourist-rental-wales"]'
    ).click();

    await page.waitForFunction(
      () =>
        location.hash.endsWith(
          '/tourist-rental-wales'
        ) &&
        document.querySelector('.view.active')?.id ===
        'view-tourist-rental-wales'
    );

    assert.strictEqual(
      await activeView(page),
      'view-tourist-rental-wales'
    );

    pass(
      'Wales Legal Guide navigates to its tourist module'
    );

    /*
     * Tourist modules must also suppress cross-jurisdiction buttons,
     * but preserve the one contextual Back to Legal Guide action.
     */
    const touristCountrySwitch = page.locator(
      '#view-tourist-rental-wales ' +
      'button[onclick="navigate(\'tourist-rental-northern-ireland\')"]'
    );

    assert(
      await touristCountrySwitch.isHidden(),
      'tourist module cross-jurisdiction buttons must be hidden'
    );

    const walesBackToGuide = page.locator(
      '#view-tourist-rental-wales ' +
      'button[onclick="navigate(\'legal-wales\')"]'
    );

    assert(
      await walesBackToGuide.isVisible(),
      'Wales tourist module must preserve Back to Legal Guide'
    );

    pass(
      'Tourist module hides country grid and preserves Back to Legal Guide'
    );

    await walesBackToGuide.click();

    await page.waitForFunction(
      () =>
        location.hash.endsWith(
          '/legal-wales'
        ) &&
        document.querySelector('.view.active')?.id ===
        'view-legal-wales'
    );

    assert.strictEqual(
      await activeView(page),
      'view-legal-wales'
    );

    pass(
      'Wales tourist module returns to its Legal Guide'
    );

    /*
     * Back-to-guide navigation must preserve another jurisdiction too.
     */
    await expectRoute(
      page,
      'tourist-rental-northern-ireland'
    );

    const niBackToGuide = page.locator(
      '#view-tourist-rental-northern-ireland ' +
      'button[onclick="navigate(\'legal-northern-ireland\')"]'
    );

    assert(
      await niBackToGuide.isVisible(),
      'Northern Ireland tourist module must preserve Back to Legal Guide'
    );

    await niBackToGuide.click();

    await page.waitForFunction(
      () =>
        location.hash.endsWith(
          '/legal-northern-ireland'
        ) &&
        document.querySelector('.view.active')?.id ===
        'view-legal-northern-ireland'
    );

    assert.strictEqual(
      await activeView(page),
      'view-legal-northern-ireland'
    );

    pass(
      'Northern Ireland tourist module returns to its Legal Guide'
    );

    /*
     * Jurisdiction must remain independent of UI locale.
     * Route activation must work under another supported shell locale.
     */
    await expectRoute(
      page,
      'legal-wales',
      'fr'
    );

    assert(
      page.url().includes(
        '#/fr/legal-wales'
      ),
      'French UI locale must preserve Wales jurisdiction'
    );

    pass(
      'UI locale does not change Wales jurisdiction'
    );

    console.log(
      `\nSTATIC LEGAL BROWSER ROUTING: ` +
      `${passed}/${passed} PASSED`
    );
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(
    '\nSTATIC LEGAL BROWSER ROUTING: FAILED'
  );

  console.error(
    error && error.stack
      ? error.stack
      : error
  );

  process.exit(1);
});
