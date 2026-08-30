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
const FRENCH_CONTACT_COPY =
  'CONTACTER POUR CETTE OPPORTUNITÉ';
const MOBILE_WIDTHS = [320, 375, 390, 430];

let passed = 0;

function pass(label) {
  passed += 1;
  console.log('PASS:', label);
}

async function launchBrowser() {
  const executablePath =
    process.env.LOCAL_SANDBOX_CHROMIUM_PATH;

  return chromium.launch(
    executablePath
      ? { executablePath, headless: true }
      : { headless: true }
  );
}

async function waitForView(page, view) {
  await page.waitForFunction(
    expected =>
      document.querySelector('.view.active')?.id ===
      `view-${expected}`,
    view
  );
}

async function openMarket(page, locale, marketKey) {
  await page.goto(
    `${FILE_URL}#/${locale}/market/${marketKey}`,
    { waitUntil: 'load' }
  );
  await waitForView(page, 'market');
}

async function clickFooterGuide(page, kind) {
  const key =
    kind === 'legal'
      ? 'footer.legalGuide'
      : 'footer.alManual';

  await page
    .locator(`footer.site a[data-i18n="${key}"]`)
    .click();
}

async function expectHashView(page, locale, route) {
  await page.waitForFunction(
    ({ locale, route }) =>
      location.hash === `#/${locale}/${route}` &&
      document.querySelector('.view.active')?.id ===
        `view-${route}`,
    { locale, route }
  );

  assert.strictEqual(
    await page.locator('.view.active').getAttribute('id'),
    `view-${route}`
  );
}

async function run() {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 }
    });

    console.log(
      '\n=== Z FIND FR MARKET FOOTER + CTA HOTFIX ==='
    );

    await openMarket(page, 'fr', 'FR');
    await clickFooterGuide(page, 'legal');
    await expectHashView(page, 'fr', 'legal-fr');
    pass(
      'France market footer Legal Guide opens legal-fr'
    );

    await openMarket(page, 'fr', 'FR');
    await clickFooterGuide(page, 'rental');
    await expectHashView(
      page,
      'fr',
      'tourist-rental-fr'
    );
    pass(
      'France market footer rental guide opens tourist-rental-fr'
    );

    await openMarket(page, 'en', 'FR');
    await clickFooterGuide(page, 'legal');
    await expectHashView(page, 'en', 'legal-fr');
    pass(
      'France jurisdiction is preserved under English UI locale'
    );

    await openMarket(page, 'fr', 'PT');
    await clickFooterGuide(page, 'legal');
    await expectHashView(page, 'fr', 'legal');
    pass(
      'Portugal jurisdiction is preserved under French UI locale'
    );

    await page.goto(
      `${FILE_URL}#/en/legal-fr`,
      { waitUntil: 'load' }
    );
    await waitForView(page, 'legal-fr');

    const directFranceContext =
      await page.evaluate(() =>
        window.ZFindServices
          .marketGuideFooterHotfix
          .currentMarketKey()
      );

    assert.strictEqual(
      directFranceContext,
      'FR',
      'direct France legal route must establish FR market context'
    );
    pass(
      'Direct France legal route resolves FR market context'
    );

    await page.goto(
      `${FILE_URL}#/fr/home`,
      { waitUntil: 'load' }
    );
    await waitForView(page, 'home');

    const translatedCopy = await page.evaluate(() =>
      t('fr', 'property.contactBtn')
    );

    assert.strictEqual(
      translatedCopy,
      FRENCH_CONTACT_COPY,
      'French Property contact copy must use approved wording'
    );
    pass(
      'French Property CTA copy matches approved wording'
    );

    await page.evaluate(copy => {
      document
        .querySelectorAll('.view.active')
        .forEach(view => view.classList.remove('active'));

      const view = document.getElementById('view-property');
      const root = document.getElementById('property-root');

      view.classList.add('active');
      root.innerHTML = `
        <div class="wrap">
          <div class="detail-layout">
            <div></div>
            <div>
              <div class="sidebar-sticky">
                <div class="sidebar-card">
                  <button
                    class="btn btn-gold"
                    style="width:100%; margin-top:20px; justify-content:center"
                    onclick="openModal('test', {}, '')"
                  >${copy}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      window.ZFindServices
        .marketGuideFooterHotfix
        .syncFrenchPropertyCta();
    }, FRENCH_CONTACT_COPY);

    const button = page.locator(
      '#view-property .sidebar-card ' +
      'button.btn.btn-gold[onclick^="openModal("]'
    );

    for (const width of MOBILE_WIDTHS) {
      await page.setViewportSize({
        width,
        height: 844
      });

      const metrics = await button.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);

        return {
          text: element.textContent.trim(),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          left: rect.left,
          right: rect.right,
          height: rect.height,
          viewportWidth: document.documentElement.clientWidth,
          whiteSpace: style.whiteSpace,
          minWidth: style.minWidth
        };
      });

      assert.strictEqual(
        metrics.text,
        FRENCH_CONTACT_COPY,
        `${width}px CTA text drift`
      );

      assert(
        metrics.scrollWidth <= metrics.clientWidth + 1,
        `${width}px CTA has internal horizontal overflow`
      );

      assert(
        metrics.left >= -0.5 &&
        metrics.right <= metrics.viewportWidth + 0.5,
        `${width}px CTA escapes viewport`
      );

      assert(
        metrics.height >= 44,
        `${width}px CTA touch target is below 44px`
      );

      assert.strictEqual(
        metrics.whiteSpace,
        'normal',
        `${width}px CTA must be allowed to wrap safely`
      );

      assert.strictEqual(
        metrics.minWidth,
        '0px',
        `${width}px CTA must be shrink-safe`
      );

      pass(
        `${width}px French Property CTA remains contained`
      );
    }

    console.log(
      `\nFR MARKET FOOTER + CTA HOTFIX: ` +
      `${passed}/${passed} PASSED`
    );
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(
    '\nFR MARKET FOOTER + CTA HOTFIX: FAILED'
  );
  console.error(
    error && error.stack
      ? error.stack
      : error
  );
  process.exit(1);
});
