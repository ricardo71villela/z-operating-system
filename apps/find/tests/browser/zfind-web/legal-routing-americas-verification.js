'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const DIST = path.resolve(
  __dirname,
  '../../../apps/zfind-web/dist/z-find-prototype.html'
);

const URL = pathToFileURL(DIST).href;

const countries = [
  {
    slug: 'united-states',
    label: 'United States',
    legal: 'legal-united-states',
    tourist: 'tourist-rental-united-states',
    legalMarker: '15% of the amount realized',
    touristMarker: 'no single national short-term-rental licence',
  },
  {
    slug: 'canada',
    label: 'Canada',
    legal: 'legal-canada',
    tourist: 'tourist-rental-canada',
    legalMarker: '2.1%',
    touristMarker: 'not uniform across Canada',
  },
  {
    slug: 'mexico',
    label: 'México',
    legal: 'legal-mexico',
    tourist: 'tourist-rental-mexico',
    legalMarker: '25% sobre el ingreso total',
    touristMarker: '90 noches por año',
  },
  {
    slug: 'brazil',
    label: 'Brasil',
    legal: 'legal-brazil',
    tourist: 'tourist-rental-brazil',
    legalMarker: 'Tema 1113/STJ',
    touristMarker: 'REsp 2.121.055-MG',
  },
  {
    slug: 'argentina',
    label: 'Argentina',
    legal: 'legal-argentina',
    tourist: 'tourist-rental-argentina',
    legalMarker: 'Ley 27.802',
    touristMarker: 'CABA dispone de su propio régimen',
  },
];

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
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name} — ${error.message}`);
  }
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage();

  const pageErrors = [];
  page.on(
    'pageerror',
    error => pageErrors.push(error.message)
  );

  async function open(locale, route) {
    await page.goto(
      `${URL}#/${locale}/${route}`,
      { waitUntil: 'load' }
    );

    await page.waitForFunction(
      requestedRoute => {
        const active =
          document.querySelectorAll('.view.active');

        return (
          active.length === 1 &&
          active[0].id === `view-${requestedRoute}`
        );
      },
      route
    );
  }

  function countryButton(route, label) {
    return page
      .locator(`#view-${route} button`)
      .filter({ hasText: label });
  }

  function headerGrid(route) {
    return page.locator(
      `#view-${route} ` +
      '.legal-page > .legal-header > ' +
      '.legal-callout:has(> button)'
    );
  }

  console.log('');
  console.log(
    '=== Z FIND AMERICAS DISTINCT COUNTRY CONTRACT ==='
  );

  for (let index = 0; index < countries.length; index++) {
    const country = countries[index];
    const other = countries[(index + 1) % countries.length];

    await check(
      `${country.label} Legal Guide is independent route`,
      () => open('en', country.legal)
    );

    await check(
      `${country.label} tourist guide is independent route`,
      () => open('en', country.tourist)
    );

    await check(
      `${country.label} Legal Guide hides legacy jurisdiction grid`,
      async () => {
        await open('en', country.legal);
        const grid = headerGrid(country.legal);
        if (await grid.count() !== 1)
          throw new Error('legal jurisdiction grid not unique');
        if (!(await grid.isHidden()))
          throw new Error('legal jurisdiction grid still visible');
      }
    );

    await check(
      `${country.label} tourist guide hides country choices and preserves Back to Legal Guide`,
      async () => {
        await open('en', country.tourist);

        const otherButton = countryButton(
          country.tourist,
          other.label
        );
        const back = page.locator(
          `#view-${country.tourist} ` +
          `button[onclick="navigate('${country.legal}')"]`
        );

        if (await otherButton.count() !== 1 || !(await otherButton.isHidden()))
          throw new Error(`${other.label} tourist choice must be hidden`);
        if (await back.count() !== 1 || !(await back.isVisible()))
          throw new Error('Back to Legal Guide must remain visible');
      }
    );

    await check(
      `${country.label} legal content marker is visible`,
      async () => {
        await open('en', country.legal);

        const text = await page
          .locator(`#view-${country.legal}`)
          .innerText();

        if (!text.includes(country.legalMarker))
          throw new Error(
            `legal marker absent: ${country.legalMarker}`
          );
      }
    );

    await check(
      `${country.label} tourist content marker is visible`,
      async () => {
        await open('en', country.tourist);

        const text = await page
          .locator(`#view-${country.tourist}`)
          .innerText();

        if (!text.includes(country.touristMarker))
          throw new Error(
            `tourist marker absent: ${country.touristMarker}`
          );
      }
    );

    await check(
      `${country.label} legal disclaimer remains visible`,
      async () => {
        await open('en', country.legal);

        const text = await page
          .locator(
            `#view-${country.legal} .disclaimer`
          )
          .innerText();

        const valid =
          text.includes(
            'qualified local legal professional'
          ) ||
          text.includes(
            'profesional local cualificado'
          ) ||
          text.includes(
            'profissional habilitado'
          );

        if (!valid)
          throw new Error(
            'jurisdiction-specific disclaimer absent'
          );
      }
    );
  }

  for (const locale of ['fr', 'en', 'pt']) {
    for (const country of countries) {
      await check(
        `${country.label} Legal Guide remains ${country.label} under UI locale ${locale}`,
        () => open(locale, country.legal)
      );
    }
  }

  await check(
    'Belgium Legal Guide also hides the legacy Americas jurisdiction choices',
    async () => {
      await open('en', 'legal-belgium');
      const grid = headerGrid('legal-belgium');
      if (await grid.count() !== 1 || !(await grid.isHidden()))
        throw new Error('Belgium legal jurisdiction grid still visible');
    }
  );

  await check(
    'Belgium tourist guide hides Americas choices and preserves Back to Legal Guide',
    async () => {
      await open(
        'en',
        'tourist-rental-belgium'
      );

      for (const country of countries) {
        const button = countryButton(
          'tourist-rental-belgium',
          country.label
        );

        if (await button.count() !== 1 || !(await button.isHidden()))
          throw new Error(
            `${country.label} tourist choice must be hidden`
          );
      }

      const back = page.locator(
        '#view-tourist-rental-belgium ' +
        'button[onclick="navigate(\'legal-belgium\')"]'
      );
      if (await back.count() !== 1 || !(await back.isVisible()))
        throw new Error('Belgium Back to Legal Guide must remain visible');
    }
  );

  await browser.close();

  if (pageErrors.length) {
    failed += pageErrors.length;

    for (const error of pageErrors)
      console.error(`PAGE_ERROR: ${error}`);
  }

  console.log(
    `PAGE_ERRORS=${pageErrors.length}`
  );

  const expectedPassed =
    (countries.length * 7) +
    (3 * countries.length) +
    2;

  if (
    failed ||
    passed !== expectedPassed
  ) {
    console.error(
      'AMERICAS DISTINCT COUNTRY CONTRACT: '
      + `${passed} PASSED, ${failed} FAILED`
    );
    process.exit(1);
  }

  console.log(
    'AMERICAS DISTINCT COUNTRY CONTRACT: '
    + `${expectedPassed}/${expectedPassed} PASSED`
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
