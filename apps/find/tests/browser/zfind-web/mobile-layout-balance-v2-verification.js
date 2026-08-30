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

const ROUTES = [
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

function expectedGutter(width) {
  if (width <= 360) return 16;
  if (width <= 640) return 18;
  return 24;
}

function fail(message, context) {
  const suffix = context ? ` :: ${JSON.stringify(context)}` : '';
  throw new Error(message + suffix);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  let passed = 0;

  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const page = await browser.newPage({ viewport });
        const pageErrors = [];

        page.on('pageerror', error => {
          pageErrors.push(String(error.message || error));
        });

        await page.route('https://example.supabase.co/**', request =>
          request.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '[]',
          })
        );

        await page.goto(fileUrl + route.hash, {
          waitUntil: 'domcontentloaded',
        });

        await page.waitForSelector(route.content, {
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
            marker: document.documentElement.innerHTML.includes(
              'Z FIND — MOBILE LAYOUT BALANCE V2'
            ),
          };
        }, route.content);

        const gutter = expectedGutter(viewport.width);

        if (metrics.missing) {
          fail('required route layout surface missing', { viewport, route, metrics });
        }
        if (!metrics.marker) {
          fail('mobile layout balance V2 marker missing', { viewport, route, metrics });
        }
        if (metrics.scrollWidth > viewport.width + 1) {
          fail('document horizontal overflow', { viewport, route, metrics });
        }
        if (metrics.navScrollWidth > metrics.navClientWidth + 1) {
          fail('header horizontal overflow', { viewport, route, metrics });
        }
        if (metrics.collision) {
          fail('header brand/actions collision', { viewport, route, metrics });
        }

        for (const [name, value] of [
          ['navLeftPadding', metrics.navLeftPadding],
          ['navRightPadding', metrics.navRightPadding],
          ['contentLeftPadding', metrics.contentLeftPadding],
          ['contentRightPadding', metrics.contentRightPadding],
        ]) {
          if (value + 0.5 < gutter) {
            fail(`${name} below gutter authority`, {
              viewport,
              route,
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
          fail('mobile primary menu did not open', { viewport, route });
        }
        if (
          Math.abs(menu.left - gutter) > 1 ||
          Math.abs(menu.right - gutter) > 1
        ) {
          fail('mobile menu gutter mismatch', {
            viewport,
            route,
            gutter,
            menu,
          });
        }
        if (pageErrors.length) {
          fail('runtime page errors', { viewport, route, pageErrors });
        }

        passed += 1;
        console.log(
          `PASS MOBILE_LAYOUT_BALANCE route=${route.name} width=${viewport.width} gutter=${gutter}`
        );

        await page.close();
      }
    }

    const expected = VIEWPORTS.length * ROUTES.length;
    if (passed !== expected) {
      fail('scenario count mismatch', { passed, expected });
    }

    console.log('============================================================');
    console.log(`MOBILE_LAYOUT_BALANCE_RUNTIME=${passed}/${expected}`);
    console.log('Z_FIND_MOBILE_LAYOUT_BALANCE_V2=PASS');
    console.log('============================================================');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
