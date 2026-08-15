'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const DIST = path.resolve(
  __dirname,
  '../../../apps/zfind-web/dist/z-find-prototype.html'
);

const URL = pathToFileURL(DIST).href;

let passed = 0;
let failed = 0;

async function launch() {
  const executablePath =
    process.env.LOCAL_SANDBOX_CHROMIUM_PATH;

  return chromium.launch(
    executablePath
      ? { executablePath, headless: true }
      : { headless: true }
  );
}

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name} — ${e.message}`);
  }
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage();

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  async function open(locale, route) {
    await page.goto(
      `${URL}#/${locale}/${route}`,
      { waitUntil: 'load' }
    );

    await page.waitForFunction(
      r => {
        const active =
          document.querySelectorAll('.view.active');

        return (
          active.length === 1 &&
          active[0].id === `view-${r}`
        );
      },
      route
    );
  }

  async function button(route, text) {
    return page
      .locator(`#view-${route} button`)
      .filter({ hasText: text });
  }

  console.log('');
  console.log(
    '=== Z FIND NL + BE DISTINCT COUNTRY CONTRACT ==='
  );

  await check(
    'Netherlands Legal Guide is independent route',
    () => open('en', 'legal-netherlands')
  );

  await check(
    'Belgium Legal Guide is independent route',
    () => open('fr', 'legal-belgium')
  );

  await check(
    'Netherlands tourist guide is independent route',
    () => open('en', 'tourist-rental-netherlands')
  );

  await check(
    'Belgium tourist guide is independent route',
    () => open('fr', 'tourist-rental-belgium')
  );

  await check(
    'Netherlands selector has its own active country button',
    async () => {
      await open('en', 'legal-netherlands');

      const b = await button(
        'legal-netherlands',
        'Netherlands'
      );

      if (await b.count() !== 1)
        throw new Error('Netherlands button not unique');

      if (!(await b.isDisabled()))
        throw new Error('Netherlands is not active');
    }
  );

  await check(
    'Belgium is a separate button inside Netherlands guide',
    async () => {
      await open('en', 'legal-netherlands');

      const b = await button(
        'legal-netherlands',
        'Belgique'
      );

      if (await b.count() !== 1)
        throw new Error('Belgium button not unique');

      if (await b.isDisabled())
        throw new Error('Belgium incorrectly shares NL active state');

      await b.click();

      await page.waitForFunction(() =>
        document
          .getElementById('view-legal-belgium')
          .classList.contains('active')
      );
    }
  );

  await check(
    'Belgium selector has its own active country button',
    async () => {
      await open('fr', 'legal-belgium');

      const b = await button(
        'legal-belgium',
        'Belgique'
      );

      if (await b.count() !== 1)
        throw new Error('Belgium button not unique');

      if (!(await b.isDisabled()))
        throw new Error('Belgium is not active');
    }
  );

  await check(
    'Netherlands is a separate button inside Belgium guide',
    async () => {
      await open('fr', 'legal-belgium');

      const b = await button(
        'legal-belgium',
        'Netherlands'
      );

      if (await b.count() !== 1)
        throw new Error('Netherlands button not unique');

      if (await b.isDisabled())
        throw new Error('Netherlands incorrectly shares BE active state');

      await b.click();

      await page.waitForFunction(() =>
        document
          .getElementById('view-legal-netherlands')
          .classList.contains('active')
      );
    }
  );

  await check(
    'UI language does not merge Netherlands into Belgium',
    () => open('fr', 'legal-netherlands')
  );

  await check(
    'UI language does not merge Belgium into Netherlands',
    () => open('en', 'legal-belgium')
  );

  await check(
    'Netherlands disclaimer remains jurisdiction-specific',
    async () => {
      await open('en', 'legal-netherlands');

      const t = await page
        .locator('#view-legal-netherlands .disclaimer')
        .innerText();

      if (!t.includes('qualified local legal professional'))
        throw new Error('NL disclaimer absent');
    }
  );

  await check(
    'Belgium disclaimer remains jurisdiction-specific',
    async () => {
      await open('fr', 'legal-belgium');

      const t = await page
        .locator('#view-legal-belgium .disclaimer')
        .innerText();

      if (!t.includes('juriste local qualifié'))
        throw new Error('BE disclaimer absent');
    }
  );

  await browser.close();

  if (pageErrors.length) {
    failed += pageErrors.length;

    for (const error of pageErrors)
      console.error(`PAGE_ERROR: ${error}`);
  }

  console.log(`PAGE_ERRORS=${pageErrors.length}`);

  if (failed || passed !== 12) {
    console.error(
      `NL + BE DISTINCT COUNTRY CONTRACT: `
      + `${passed} PASSED, ${failed} FAILED`
    );
    process.exit(1);
  }

  console.log(
    'NL + BE DISTINCT COUNTRY CONTRACT: 12/12 PASSED'
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
