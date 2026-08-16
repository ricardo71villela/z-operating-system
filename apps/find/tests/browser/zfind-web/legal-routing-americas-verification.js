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

  async function requireUniqueActiveButton(
    route,
    label
  ) {
    const button = countryButton(route, label);

    if (await button.count() !== 1)
      throw new Error(`${label} button not unique`);

    if (!(await button.isDisabled()))
      throw new Error(`${label} is not active`);
  }

  async function requireSeparateButton(
    route,
    targetLabel,
    expectedTargetRoute
  ) {
    const button =
      countryButton(route, targetLabel);

    if (await button.count() !== 1)
      throw new Error(
        `${targetLabel} button not unique`
      );

    if (await button.isDisabled())
      throw new Error(
        `${targetLabel} incorrectly shares active state`
      );

    await button.click();

    await page.waitForFunction(
      targetRoute => {
        const el =
          document.getElementById(`view-${targetRoute}`);

        return (
          el &&
          el.classList.contains('active')
        );
      },
      expectedTargetRoute
    );
  }

  console.log('');
  console.log(
    '=== Z FIND AMERICAS DISTINCT COUNTRY CONTRACT ==='
  );

  for (const country of countries) {
    await check(
      `${country.label} Legal Guide is independent route`,
      () => open('en', country.legal)
    );

    await check(
      `${country.label} tourist guide is independent route`,
      () => open('en', country.tourist)
    );

    await check(
      `${country.label} legal selector has own active button`,
      async () => {
        await open('en', country.legal);
        await requireUniqueActiveButton(
          country.legal,
          country.label
        );
      }
    );

    await check(
      `${country.label} tourist selector has own active button`,
      async () => {
        await open('en', country.tourist);
        await requireUniqueActiveButton(
          country.tourist,
          country.label
        );
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

  for (let index = 0; index < countries.length; index++) {
    const current = countries[index];
    const next =
      countries[(index + 1) % countries.length];

    await check(
      `${current.label} legal selector navigates separately to ${next.label}`,
      async () => {
        await open('en', current.legal);

        await requireSeparateButton(
          current.legal,
          next.label,
          next.legal
        );
      }
    );

    await check(
      `${current.label} tourist selector navigates separately to ${next.label}`,
      async () => {
        await open('en', current.tourist);

        await requireSeparateButton(
          current.tourist,
          next.label,
          next.tourist
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
    'Europe selector exposes all five Americas legal jurisdictions',
    async () => {
      await open('en', 'legal-belgium');

      for (const country of countries) {
        const button =
          countryButton(
            'legal-belgium',
            country.label
          );

        if (await button.count() !== 1)
          throw new Error(
            `${country.label} missing from Belgium legal selector`
          );
      }
    }
  );

  await check(
    'Europe selector exposes all five Americas tourist jurisdictions',
    async () => {
      await open(
        'en',
        'tourist-rental-belgium'
      );

      for (const country of countries) {
        const button =
          countryButton(
            'tourist-rental-belgium',
            country.label
          );

        if (await button.count() !== 1)
          throw new Error(
            `${country.label} missing from Belgium tourist selector`
          );
      }
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
    (countries.length * 2) +
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
