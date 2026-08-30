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
  await page.waitForFunction(
    expected =>
      window.ZFindServices
        .marketGuideFooterHotfix
        .currentMarketKey() === expected,
    marketKey
  );
}

function footerSelector(kind) {
  const key =
    kind === 'legal'
      ? 'footer.legalGuide'
      : 'footer.alManual';

  return `footer.site a[data-i18n="${key}"]`;
}

async function footerTarget(page, kind) {
  return page
    .locator(footerSelector(kind))
    .evaluate(anchor => ({
      href: anchor.getAttribute('href'),
      onclick: anchor.getAttribute('onclick'),
      route: anchor.getAttribute('data-market-guide-route'),
      market: anchor.getAttribute('data-market-guide-market')
    }));
}

async function tapFooterGuide(page, kind) {
  await page.locator(footerSelector(kind)).tap();
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

async function expectFooterTarget(
  page,
  kind,
  locale,
  marketKey,
  route
) {
  const target = await footerTarget(page, kind);

  assert.strictEqual(
    target.href,
    `#/${locale}/${route}`,
    `${marketKey} ${kind} href must be physical-navigation safe`
  );
  assert.strictEqual(
    target.route,
    route,
    `${marketKey} ${kind} route marker drift`
  );
  assert.strictEqual(
    target.market,
    marketKey,
    `${marketKey} ${kind} market marker drift`
  );
  assert.strictEqual(
    target.onclick,
    `navigate('${route}');return false;`,
    `${marketKey} ${kind} inline fallback must match registry route`
  );
}

async function run() {
  const browser = await launchBrowser();

  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3
    });
    const page = await context.newPage();

    console.log(
      '\n=== Z FIND FR MARKET FOOTER + CTA HOTFIX V2 ==='
    );

    await openMarket(page, 'fr', 'FR');
    await expectFooterTarget(
      page,
      'legal',
      'fr',
      'FR',
      'legal-fr'
    );
    pass(
      'France footer Legal Guide DOM target is legal-fr before touch'
    );
    await tapFooterGuide(page, 'legal');
    await expectHashView(page, 'fr', 'legal-fr');
    pass(
      'France market touch navigation opens legal-fr'
    );

    await openMarket(page, 'fr', 'FR');
    await expectFooterTarget(
      page,
      'rental',
      'fr',
      'FR',
      'tourist-rental-fr'
    );
    pass(
      'France footer rental DOM target is tourist-rental-fr before touch'
    );
    await tapFooterGuide(page, 'rental');
    await expectHashView(
      page,
      'fr',
      'tourist-rental-fr'
    );
    pass(
      'France market touch navigation opens tourist-rental-fr'
    );

    await openMarket(page, 'en', 'FR');
    await expectFooterTarget(
      page,
      'legal',
      'en',
      'FR',
      'legal-fr'
    );
    await tapFooterGuide(page, 'legal');
    await expectHashView(page, 'en', 'legal-fr');
    pass(
      'France jurisdiction is preserved under English mobile UI locale'
    );

    await openMarket(page, 'fr', 'PT');
    await expectFooterTarget(
      page,
      'legal',
      'fr',
      'PT',
      'legal'
    );
    await tapFooterGuide(page, 'legal');
    await expectHashView(page, 'fr', 'legal');
    pass(
      'Portugal jurisdiction is preserved under French mobile UI locale'
    );

    await openMarket(page, 'fr', 'FR');
    await page.evaluate(() => {
      navigate('property', 'physical-mobile-context-probe');
    });
    await page.waitForFunction(() =>
      location.hash.includes('/fr/property/physical-mobile-context-probe')
    );
    await page.evaluate(() =>
      window.ZFindServices
        .marketGuideFooterHotfix
        .syncFooterGuideTargets()
    );
    await expectFooterTarget(
      page,
      'legal',
      'fr',
      'FR',
      'legal-fr'
    );
    await expectFooterTarget(
      page,
      'rental',
      'fr',
      'FR',
      'tourist-rental-fr'
    );
    pass(
      'France guide targets survive navigation from market into property detail'
    );

    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() =>
      window.ZFindServices
        .marketGuideFooterHotfix
        .syncFooterGuideTargets()
    );
    await expectFooterTarget(
      page,
      'legal',
      'fr',
      'FR',
      'legal-fr'
    );
    await expectFooterTarget(
      page,
      'rental',
      'fr',
      'FR',
      'tourist-rental-fr'
    );
    pass(
      'France guide targets survive physical-page reload via stored market context'
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

    await context.close();

    console.log(
      `\nFR MARKET FOOTER + CTA HOTFIX V2: ` +
      `${passed}/${passed} PASSED`
    );
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(
    '\nFR MARKET FOOTER + CTA HOTFIX V2: FAILED'
  );
  console.error(
    error && error.stack
      ? error.stack
      : error
  );
  process.exit(1);
});
