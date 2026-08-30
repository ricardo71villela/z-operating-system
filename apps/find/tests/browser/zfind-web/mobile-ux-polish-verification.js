#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const VIEWPORTS = [
  { width: 320, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
];

const ROUTE_BALANCE_CASES = [
  {
    name: 'simulator-fr',
    hash: '#/fr/simulator',
    content: '#view-simulator #simulator-root > .wrap',
  },
  {
    name: 'simulator-en',
    hash: '#/en/simulator',
    content: '#view-simulator #simulator-root > .wrap',
  },
  {
    name: 'market-fr',
    hash: '#/fr/market/FR',
    content: '#view-market .market-foundation-section',
  },
  {
    name: 'market-en',
    hash: '#/en/market/FR',
    content: '#view-market .market-foundation-section',
  },
];

const fileUrl = 'file://' + path.resolve(
  __dirname,
  '..', '..', '..',
  'apps', 'zfind-web', 'dist', 'z-find-prototype.html'
);

function fail(message, context) {
  const suffix = context ? ` :: ${JSON.stringify(context)}` : '';
  throw new Error(message + suffix);
}

function expectedGutter(width) {
  if (width <= 360) return 16;
  if (width <= 640) return 18;
  return 24;
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport });
      await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(150);

      const metrics = await page.evaluate(() => {
        const px = value => Number.parseFloat(value || '0');
        const style = selector => {
          const el = document.querySelector(selector);
          return el ? getComputedStyle(el) : null;
        };
        const box = selector => {
          const el = document.querySelector(selector);
          return el ? el.getBoundingClientRect() : null;
        };

        const heroWrapStyle = style('#view-home .hero > .wrap');
        const searchWrapStyle = style('#view-search > .wrap');
        const navRow = box('header.site .nav-row');
        const language = box('.lang-menu-summary');
        const signIn = box('header.site .nav-actions .btn-outline');
        const firstCategory = box('.cat-tabs.design-balanced-categories .cat-tab');
        const firstTransaction = box('#home-transaction-tabs .transaction-tab');
        const searchButton = box('.search-fields-balanced .go');
        const heroHeadingStyle = style('#view-home .hero h1');
        const searchbarStyle = style('#view-home .searchbar');
        const categoriesStyle = style('.cat-tabs.design-balanced-categories');
        const blockStyle = style('section.block');
        const footerColsStyle = style('footer.site .cols');

        const overflowOffenders = Array.from(document.querySelectorAll('body *'))
          .map(el => {
            const rect = el.getBoundingClientRect();
            return {
              tag: el.tagName,
              id: el.id || '',
              cls: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
              left: Math.round(rect.left * 10) / 10,
              right: Math.round(rect.right * 10) / 10,
              width: Math.round(rect.width * 10) / 10,
            };
          })
          .filter(item => item.right > innerWidth + 1 || item.left < -1)
          .sort((a, b) => (b.right - innerWidth) - (a.right - innerWidth))
          .slice(0, 8);

        return {
          viewportWidth: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          heroGutter: heroWrapStyle ? px(heroWrapStyle.paddingLeft) : -1,
          searchGutter: searchWrapStyle ? px(searchWrapStyle.paddingLeft) : -1,
          navHeight: navRow ? navRow.height : -1,
          languageHeight: language ? language.height : -1,
          signInHeight: signIn ? signIn.height : -1,
          categoryHeight: firstCategory ? firstCategory.height : -1,
          transactionHeight: firstTransaction ? firstTransaction.height : -1,
          searchButtonHeight: searchButton ? searchButton.height : -1,
          heroFontSize: heroHeadingStyle ? px(heroHeadingStyle.fontSize) : -1,
          searchbarRadius: searchbarStyle ? px(searchbarStyle.borderTopLeftRadius) : -1,
          categoryColumns: categoriesStyle ? categoriesStyle.gridTemplateColumns.split(' ').filter(Boolean).length : -1,
          blockPaddingTop: blockStyle ? px(blockStyle.paddingTop) : -1,
          footerColumns: footerColsStyle ? footerColsStyle.gridTemplateColumns.split(' ').filter(Boolean).length : -1,
          polishMarker: document.documentElement.innerHTML.includes('Z FIND — MOBILE UX POLISH V1'),
          balanceMarker: document.documentElement.innerHTML.includes('Z FIND — MOBILE LAYOUT BALANCE V2'),
          overflowOffenders,
        };
      });

      const phone = viewport.width <= 640;
      const minGutter = expectedGutter(viewport.width);

      if (!metrics.polishMarker) fail('mobile UX polish marker missing', { viewport, metrics });
      if (!metrics.balanceMarker) fail('mobile layout balance V2 marker missing', { viewport, metrics });
      if (metrics.scrollWidth > viewport.width + 1) fail('horizontal document overflow', { viewport, metrics });
      if (metrics.heroGutter + 0.5 < minGutter) fail('hero gutter below mobile authority', { viewport, metrics });
      if (metrics.searchGutter + 0.5 < minGutter) fail('search gutter below mobile authority', { viewport, metrics });
      if (metrics.navHeight > 66 || metrics.navHeight < 60) fail('mobile header height outside compact band', { viewport, metrics });
      if (metrics.languageHeight < 44) fail('language touch target below 44px', { viewport, metrics });
      if (metrics.signInHeight < 44) fail('sign-in touch target below 44px', { viewport, metrics });
      if (metrics.categoryHeight < 44) fail('category touch target below 44px', { viewport, metrics });
      if (metrics.transactionHeight < 44) fail('transaction touch target below 44px', { viewport, metrics });
      if (metrics.searchButtonHeight < 44) fail('search CTA touch target below 44px', { viewport, metrics });
      if (metrics.heroFontSize > 39) fail('hero typography too large for mobile', { viewport, metrics });
      if (metrics.searchbarRadius < 12) fail('search surface lacks mobile polish radius', { viewport, metrics });
      if (metrics.blockPaddingTop > 54) fail('section rhythm remains desktop-heavy', { viewport, metrics });

      if (phone && metrics.categoryColumns !== 2) {
        fail('phone categories must remain a compact 2x2 grid', { viewport, metrics });
      }
      if (phone && metrics.footerColumns !== 1) {
        fail('phone footer must use one-column composition', { viewport, metrics });
      }
      if (!phone && metrics.footerColumns > 2) {
        fail('tablet footer must not retain desktop four-column composition', { viewport, metrics });
      }

      console.log(
        `PASS Z_FIND_MOBILE_UX width=${viewport.width}`,
        JSON.stringify(metrics)
      );

      await page.close();
    }

    let routePasses = 0;

    for (const viewport of VIEWPORTS) {
      const gutter = expectedGutter(viewport.width);

      for (const routeCase of ROUTE_BALANCE_CASES) {
        const page = await browser.newPage({ viewport });

        await page.route('https://example.supabase.co/**', request =>
          request.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '[]',
          })
        );

        await page.goto(fileUrl + routeCase.hash, {
          waitUntil: 'domcontentloaded',
        });

        await page.waitForSelector(routeCase.content, {
          state: 'visible',
          timeout: 5000,
        });
        await page.waitForSelector('#mobile-nav-toggle', {
          state: 'visible',
          timeout: 5000,
        });

        const metrics = await page.evaluate(contentSelector => {
          const px = value => Number.parseFloat(value || '0');
          const nav = document.querySelector('header.site .wrap.nav-row');
          const content = document.querySelector(contentSelector);
          const logo = document.querySelector('header.site .logo');
          const actions = document.querySelector('header.site .nav-actions');

          if (!nav || !content || !logo || !actions) {
            return { missing: true };
          }

          const navStyle = getComputedStyle(nav);
          const contentStyle = getComputedStyle(content);
          const logoRect = logo.getBoundingClientRect();
          const actionsRect = actions.getBoundingClientRect();

          return {
            missing: false,
            scrollWidth: document.documentElement.scrollWidth,
            navClientWidth: nav.clientWidth,
            navScrollWidth: nav.scrollWidth,
            navLeftPadding: px(navStyle.paddingLeft),
            navRightPadding: px(navStyle.paddingRight),
            contentLeftPadding: px(contentStyle.paddingLeft),
            contentRightPadding: px(contentStyle.paddingRight),
            collision: logoRect.right > actionsRect.left + 1,
          };
        }, routeCase.content);

        if (metrics.missing) {
          fail('route balance surface missing', { viewport, routeCase, metrics });
        }
        if (metrics.scrollWidth > viewport.width + 1) {
          fail('route horizontal document overflow', { viewport, routeCase, metrics });
        }
        if (metrics.navScrollWidth > metrics.navClientWidth + 1) {
          fail('route header overflow', { viewport, routeCase, metrics });
        }
        if (metrics.collision) {
          fail('route header brand/actions collision', { viewport, routeCase, metrics });
        }

        for (const [name, value] of [
          ['navLeftPadding', metrics.navLeftPadding],
          ['navRightPadding', metrics.navRightPadding],
          ['contentLeftPadding', metrics.contentLeftPadding],
          ['contentRightPadding', metrics.contentRightPadding],
        ]) {
          if (value + 0.5 < gutter) {
            fail(`${name} below route gutter authority`, {
              viewport,
              routeCase,
              gutter,
              metrics,
            });
          }
        }

        await page.click('#mobile-nav-toggle');
        await page.waitForTimeout(25);

        const menu = await page.evaluate(() => {
          const el = document.querySelector('.mobile-primary-menu');
          if (!el || el.hidden) return null;
          const rect = el.getBoundingClientRect();
          return {
            left: rect.left,
            right: innerWidth - rect.right,
          };
        });

        if (!menu) {
          fail('route mobile menu did not open', { viewport, routeCase });
        }
        if (
          Math.abs(menu.left - gutter) > 1 ||
          Math.abs(menu.right - gutter) > 1
        ) {
          fail('route mobile menu gutter mismatch', {
            viewport,
            routeCase,
            gutter,
            menu,
          });
        }

        routePasses += 1;
        console.log(
          `PASS Z_FIND_MOBILE_ROUTE_BALANCE route=${routeCase.name} width=${viewport.width} gutter=${gutter}`
        );

        await page.close();
      }
    }

    if (routePasses !== 20) {
      fail('route balance scenario count mismatch', { routePasses, expected: 20 });
    }

    console.log('MOBILE_LAYOUT_BALANCE_RUNTIME=20/20');
    console.log('Z_FIND_MOBILE_LAYOUT_BALANCE_V2=PASS');
    console.log('Z_FIND_MOBILE_UX_POLISH_V1=PASS');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
