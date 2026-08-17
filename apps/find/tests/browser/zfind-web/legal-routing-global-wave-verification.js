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
    iso: 'CL',
    label: 'Chile',
    legal: 'legal-chile',
    tourist: 'tourist-rental-chile',
    legalMarker: 'Boletín 18.216-05',
    touristMarker: 'Ley 21.442',
  },
  {
    iso: 'DO',
    label: 'República Dominicana',
    legal: 'legal-dominican-republic',
    tourist: 'tourist-rental-dominican-republic',
    legalMarker: 'Ley 30-26',
    touristMarker: 'RENATUR',
  },
  {
    iso: 'PL',
    label: 'Poland',
    legal: 'legal-poland',
    tourist: 'tourist-rental-poland',
    legalMarker: 'PIT-39',
    touristMarker: 'CWTON',
  },
  {
    iso: 'GR',
    label: 'Greece',
    legal: 'legal-greece',
    tourist: 'tourist-rental-greece',
    legalMarker: '€800,000',
    touristMarker: 'Short-Term Stay Property Registry',
  },
  {
    iso: 'HR',
    label: 'Croatia',
    legal: 'legal-croatia',
    tourist: 'tourist-rental-croatia',
    legalMarker: 'Croatian citizens under 45',
    touristMarker: 'early 2027',
  },
  {
    iso: 'CY',
    label: 'Cyprus',
    legal: 'legal-cyprus',
    tourist: 'tourist-rental-cyprus',
    legalMarker: 'Law 239(I)/2025',
    touristMarker: 'Special Label and Registration Number',
  },
  {
    iso: 'AE-DU',
    label: 'Dubai',
    legal: 'legal-dubai',
    tourist: 'tourist-rental-dubai',
    legalMarker: 'Seller: 2%',
    touristMarker: 'Holiday Home permit',
  },
];

const translatedLocales = ['fr', 'en', 'pt'];

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
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(7000);

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

  async function requireDisclaimer(route) {
    const text = await page
      .locator(`#view-${route} .disclaimer`)
      .innerText();

    const valid =
      text.includes(
        'qualified local legal professional'
      ) ||
      text.includes(
        'profesional local cualificado'
      ) ||
      text.includes(
        'profissional local qualificado'
      ) ||
      text.includes(
        'profissional habilitado'
      );

    if (!valid)
      throw new Error(
        'jurisdiction-specific disclaimer absent'
      );
  }

  console.log('');
  console.log(
    '=== Z FIND GLOBAL LEGAL WAVE DISTINCT JURISDICTION CONTRACT ==='
  );

  for (const country of countries) {
    await check(
      `${country.label} legal guide is independent route`,
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
        await requireDisclaimer(country.legal);
      }
    );

    await check(
      `${country.label} tourist disclaimer remains visible`,
      async () => {
        await open('en', country.tourist);
        await requireDisclaimer(country.tourist);
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

  for (const locale of translatedLocales) {
    for (const country of countries) {
      await check(
        `${country.label} legal route remains ${country.label} under UI locale ${locale}`,
        () => open(locale, country.legal)
      );

      await check(
        `${country.label} tourist route remains ${country.label} under UI locale ${locale}`,
        () => open(locale, country.tourist)
      );
    }
  }

  await check(
    'existing Belgium legal selector exposes all seven global-wave jurisdictions',
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
    'existing Belgium tourist selector exposes all seven global-wave jurisdictions',
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

  await check(
    'Dubai legal guide is explicitly Emirate of Dubai only',
    async () => {
      await open('en', 'legal-dubai');

      const text = await page
        .locator('#view-legal-dubai')
        .innerText();

      if (!text.includes('Emirate of Dubai only'))
        throw new Error(
          'Dubai legal scope is not explicit'
        );
    }
  );

  await check(
    'Dubai tourist guide is explicitly scoped to the Emirate of Dubai',
    async () => {
      await open('en', 'tourist-rental-dubai');

      const text = await page
        .locator('#view-tourist-rental-dubai')
        .innerText();

      if (!text.includes('Emirate of Dubai'))
        throw new Error(
          'Dubai tourist scope is not explicit'
        );
    }
  );

  await check(
    'Phase-4 public locale authority remains six-language',
    async () => {
      await open('fr', 'legal-chile');
      const actual = await page.evaluate(() => Array.from(window.ZFindServices.publicLocales.PUBLIC_LOCALES));
      const expected = ['fr', 'en', 'pt', 'es', 'de', 'it'];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('unexpected Phase-4 PUBLIC_LOCALES');
    }
  );

  await check(
    'compact language menu exposes six Phase-4 languages while only translated UI locales are selectable',
    async () => {
      await open('fr', 'legal-chile');
      const actual = await page.evaluate(() => ({
        translated: Array.from(window.ZFindServices.publicLocales.LEGACY_TRANSLATED_LOCALES),
        menu: Array.from(document.querySelectorAll('.lang-menu button[data-lang]')).map(button => ({
          lang: button.dataset.lang,
          disabled: button.disabled,
        })),
        current: document.getElementById('current-lang-label')?.textContent || '',
      }));

      const expectedTranslated = ['fr', 'en', 'pt'];
      const expectedMenu = [
        { lang:'fr', disabled:false },
        { lang:'en', disabled:false },
        { lang:'pt', disabled:false },
        { lang:'es', disabled:true },
        { lang:'de', disabled:true },
        { lang:'it', disabled:true },
      ];

      if (JSON.stringify(actual.translated) !== JSON.stringify(expectedTranslated))
        throw new Error('translated locale authority drift');

      if (JSON.stringify(actual.menu) !== JSON.stringify(expectedMenu))
        throw new Error('compact six-language menu contract drift');

      if (actual.current !== 'FR')
        throw new Error('French default compact-menu label drift');
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
    (countries.length * 8) +
    (countries.length * 2) +
    (translatedLocales.length * countries.length * 2) +
    6;

  if (
    failed ||
    passed !== expectedPassed
  ) {
    console.error(
      'GLOBAL LEGAL WAVE DISTINCT JURISDICTION CONTRACT: '
      + `${passed} PASSED, ${failed} FAILED`
    );
    process.exit(1);
  }

  console.log(
    'GLOBAL LEGAL WAVE DISTINCT JURISDICTION CONTRACT: '
    + `${expectedPassed}/${expectedPassed} PASSED`
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
