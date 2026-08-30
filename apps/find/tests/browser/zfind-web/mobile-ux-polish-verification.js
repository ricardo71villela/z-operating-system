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
    kind: 'standard',
  },
  {
    name: 'simulator-en',
    hash: '#/en/simulator',
    content: '#view-simulator #simulator-root > .wrap',
    kind: 'standard',
  },
  {
    name: 'market-fr',
    hash: '#/fr/market/FR',
    content: '#view-market .market-foundation-section',
    kind: 'standard',
  },
  {
    name: 'market-en',
    hash: '#/en/market/FR',
    content: '#view-market .market-foundation-section',
    kind: 'standard',
  },
  {
    name: 'search-fr',
    hash: '#/fr/search',
    content: '#view-search > .wrap',
    kind: 'search',
  },
  {
    name: 'search-en',
    hash: '#/en/search',
    content: '#view-search > .wrap',
    kind: 'search',
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

async function routeNetworkStubs(page) {
  const response = {
    status: 200,
    contentType: 'application/json',
    body: '[]',
  };

  await page.route('https://example.supabase.co/**', request =>
    request.fulfill(response)
  );

  await page.route('https://build-only.supabase.co/**', request =>
    request.fulfill(response)
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    /* ----------------------------------------------------------
       BASE MOBILE SHELL
       ---------------------------------------------------------- */
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport });
      await routeNetworkStubs(page);
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
        const nav = document.querySelector('header.site .nav-row');
        const navRow = nav ? nav.getBoundingClientRect() : null;
        const logo = box('header.site .logo');
        const actions = box('header.site .nav-actions');
        const menu = box('#mobile-nav-toggle');
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
          navClientWidth: nav ? nav.clientWidth : -1,
          navScrollWidth: nav ? nav.scrollWidth : -1,
          logoRight: logo ? logo.right : -1,
          actionsLeft: actions ? actions.left : -1,
          menuHeight: menu ? menu.height : -1,
          languageHeight: language ? language.height : -1,
          signInHeight: signIn ? signIn.height : -1,
          signInWidth: signIn ? signIn.width : -1,
          categoryHeight: firstCategory ? firstCategory.height : -1,
          transactionHeight: firstTransaction ? firstTransaction.height : -1,
          searchButtonHeight: searchButton ? searchButton.height : -1,
          heroFontSize: heroHeadingStyle ? px(heroHeadingStyle.fontSize) : -1,
          searchbarRadius: searchbarStyle ? px(searchbarStyle.borderTopLeftRadius) : -1,
          categoryColumns: categoriesStyle ? categoriesStyle.gridTemplateColumns.split(' ').filter(Boolean).length : -1,
          blockPaddingTop: blockStyle ? px(blockStyle.paddingTop) : -1,
          footerColumns: footerColsStyle ? footerColsStyle.gridTemplateColumns.split(' ').filter(Boolean).length : -1,
          polishMarker: document.documentElement.innerHTML.includes('Z FIND — MOBILE UX POLISH V1'),
          balanceV2Marker: document.documentElement.innerHTML.includes('Z FIND — MOBILE LAYOUT BALANCE V2'),
          balanceV3Marker: document.documentElement.innerHTML.includes('Z FIND — MOBILE UX BALANCE V3'),
          overflowOffenders,
        };
      });

      const phone = viewport.width <= 640;
      const minGutter = expectedGutter(viewport.width);

      if (!metrics.polishMarker) fail('mobile UX polish marker missing', { viewport, metrics });
      if (!metrics.balanceV2Marker) fail('mobile layout balance V2 marker missing', { viewport, metrics });
      if (!metrics.balanceV3Marker) fail('mobile UX balance V3 marker missing', { viewport, metrics });
      if (metrics.scrollWidth > viewport.width + 1) fail('horizontal document overflow', { viewport, metrics });
      if (metrics.heroGutter + 0.5 < minGutter) fail('hero gutter below mobile authority', { viewport, metrics });
      if (metrics.searchGutter + 0.5 < minGutter) fail('search gutter below mobile authority', { viewport, metrics });
      if (metrics.navHeight > 68 || metrics.navHeight < 60) fail('mobile header height outside compact band', { viewport, metrics });
      if (metrics.navScrollWidth > metrics.navClientWidth + 1) fail('mobile header overflows its own shell', { viewport, metrics });
      if (metrics.logoRight > metrics.actionsLeft + 1) fail('mobile brand/actions collision', { viewport, metrics });
      if (metrics.menuHeight < 44) fail('menu touch target below 44px', { viewport, metrics });
      if (metrics.languageHeight < 44) fail('language touch target below 44px', { viewport, metrics });
      if (metrics.signInHeight < 44) fail('sign-in touch target below 44px', { viewport, metrics });
      if (phone && metrics.signInWidth > 118) fail('sign-in dominates mobile header proportion', { viewport, metrics });
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

    /* ----------------------------------------------------------
       CROSS-ROUTE GUTTERS + SEARCH COMPOSITION
       ---------------------------------------------------------- */
    let routePasses = 0;

    for (const viewport of VIEWPORTS) {
      const gutter = expectedGutter(viewport.width);

      for (const routeCase of ROUTE_BALANCE_CASES) {
        const page = await browser.newPage({ viewport });
        await routeNetworkStubs(page);

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

        const metrics = await page.evaluate(({ contentSelector, kind }) => {
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

          const result = {
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

          if (kind === 'search') {
            const bar = document.querySelector('#view-search .searchbar');
            const transaction = document.querySelector('#view-search .transaction-filter-block');
            const fields = document.querySelector('#view-search .search-fields');
            const input = document.querySelector('#view-search #search-q');

            if (!bar || !transaction || !fields || !input) {
              result.searchMissing = true;
            } else {
              const barRect = bar.getBoundingClientRect();
              const transactionRect = transaction.getBoundingClientRect();
              const fieldsRect = fields.getBoundingClientRect();
              const inputRect = input.getBoundingClientRect();

              result.searchFlexDirection = getComputedStyle(bar).flexDirection;
              result.searchBarWidth = barRect.width;
              result.transactionWidth = transactionRect.width;
              result.fieldsWidth = fieldsRect.width;
              result.inputWidth = inputRect.width;
              result.searchBarRadius = px(getComputedStyle(bar).borderTopLeftRadius);
            }
          }

          return result;
        }, {
          contentSelector: routeCase.content,
          kind: routeCase.kind,
        });

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

        if (routeCase.kind === 'search' && viewport.width <= 640) {
          if (metrics.searchMissing) {
            fail('search mobile composition surface missing', { viewport, routeCase, metrics });
          }
          if (metrics.searchFlexDirection !== 'column') {
            fail('search filter must use vertical mobile flow', { viewport, routeCase, metrics });
          }
          if (metrics.searchBarRadius < 16) {
            fail('search filter surface remains visually harsh', { viewport, routeCase, metrics });
          }

          const expectedInner = metrics.searchBarWidth - 28;
          if (metrics.transactionWidth < expectedInner - 2) {
            fail('transaction selector is not full-width mobile content', { viewport, routeCase, metrics });
          }
          if (metrics.fieldsWidth < expectedInner - 2) {
            fail('search fields remain compressed beside transaction selector', { viewport, routeCase, metrics });
          }
          if (metrics.inputWidth < expectedInner - 2) {
            fail('search location input is not full-width mobile content', { viewport, routeCase, metrics });
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

    if (routePasses !== 30) {
      fail('route balance scenario count mismatch', { routePasses, expected: 30 });
    }

    /* ----------------------------------------------------------
       DEVELOPMENT VISUAL-PROPORTION FIXTURE
       The production renderer is dynamic, but these are its exact public
       classes/7-column structure. The fixture proves the CSS contract that
       the screenshots exposed: no dead fact cell and no phone-wide table.
       ---------------------------------------------------------- */
    let developmentPasses = 0;

    for (const viewport of VIEWPORTS.filter(v => v.width <= 640)) {
      const page = await browser.newPage({ viewport });
      await routeNetworkStubs(page);
      await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });

      const metrics = await page.evaluate(() => {
        const view = document.querySelector('#view-development');
        const root = document.querySelector('#development-root');

        document.querySelectorAll('.view').forEach(el => {
          el.classList.remove('active');
          el.style.display = 'none';
        });

        view.style.display = 'block';
        view.classList.add('active');

        root.innerHTML = `
          <div class="wrap" style="padding:48px 0">
            <div class="facts-grid">
              <div class="fact"><div class="k">Promoteur</div><div class="v">Horizon Développement</div></div>
              <div class="fact"><div class="k">Lots</div><div class="v">4</div></div>
              <div class="fact"><div class="k">Typologies</div><div class="v">T2, T3, T4</div></div>
            </div>
            <div class="units-table-wrap">
              <table class="units-table">
                <thead><tr><th>Lot</th><th>Typologie</th><th>Surface</th><th>Étage</th><th>Prix</th><th>Statut</th><th></th></tr></thead>
                <tbody>
                  <tr><td>2f23a490-61ae-4e4f-a481-95db3d355ddd</td><td>T2</td><td>48 m²</td><td>1</td><td>289 000 €</td><td><span class="status-dot">Enquire</span></td><td><button class="btn btn-outline">Voir</button></td></tr>
                  <tr><td>47f586a5-c9d6-4444-b0ed-85d51b47b403</td><td>T3</td><td>67 m²</td><td>2</td><td>375 000 €</td><td><span class="status-dot">Enquire</span></td><td><button class="btn btn-outline">Voir</button></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        `;

        const wrap = root.querySelector(':scope > .wrap');
        const facts = root.querySelector('.facts-grid');
        const lastFact = root.querySelector('.facts-grid > .fact:last-child');
        const tableWrap = root.querySelector('.units-table-wrap');
        const table = root.querySelector('.units-table');
        const firstRowCells = Array.from(root.querySelectorAll('.units-table tbody tr:first-child td'));
        const firstHeaderCells = Array.from(root.querySelectorAll('.units-table thead th'));

        const wrapStyle = getComputedStyle(wrap);
        const factsRect = facts.getBoundingClientRect();
        const lastFactRect = lastFact.getBoundingClientRect();

        return {
          documentScrollWidth: document.documentElement.scrollWidth,
          wrapPaddingLeft: Number.parseFloat(wrapStyle.paddingLeft || '0'),
          wrapPaddingRight: Number.parseFloat(wrapStyle.paddingRight || '0'),
          factsWidth: factsRect.width,
          lastFactWidth: lastFactRect.width,
          lastFactLeftDelta: Math.abs(lastFactRect.left - factsRect.left),
          tableWrapClientWidth: tableWrap.clientWidth,
          tableWrapScrollWidth: tableWrap.scrollWidth,
          tableClientWidth: table.clientWidth,
          tableScrollWidth: table.scrollWidth,
          hiddenDataColumns: [0, 5, 6].map(index => getComputedStyle(firstRowCells[index]).display),
          visibleDataColumns: firstRowCells.filter(cell => getComputedStyle(cell).display !== 'none').length,
          hiddenHeaderColumns: [0, 5, 6].map(index => getComputedStyle(firstHeaderCells[index]).display),
          visibleHeaderColumns: firstHeaderCells.filter(cell => getComputedStyle(cell).display !== 'none').length,
        };
      });

      const gutter = expectedGutter(viewport.width);

      if (metrics.documentScrollWidth > viewport.width + 1) {
        fail('development fixture creates document overflow', { viewport, metrics });
      }
      if (metrics.wrapPaddingLeft + 0.5 < gutter || metrics.wrapPaddingRight + 0.5 < gutter) {
        fail('development inline padding defeats mobile gutter', { viewport, gutter, metrics });
      }
      if (metrics.lastFactLeftDelta > 1 || metrics.lastFactWidth < metrics.factsWidth - 2) {
        fail('development three-fact grid still leaves dead fourth cell', { viewport, metrics });
      }
      if (metrics.tableWrapScrollWidth > metrics.tableWrapClientWidth + 1) {
        fail('development units wrapper still overflows horizontally', { viewport, metrics });
      }
      if (metrics.tableScrollWidth > metrics.tableClientWidth + 1) {
        fail('development units table still internally overflows', { viewport, metrics });
      }
      if (metrics.hiddenDataColumns.some(value => value !== 'none')) {
        fail('mobile development still exposes raw/status/action utility columns', { viewport, metrics });
      }
      if (metrics.hiddenHeaderColumns.some(value => value !== 'none')) {
        fail('mobile development header still exposes hidden utility columns', { viewport, metrics });
      }
      if (metrics.visibleDataColumns !== 4 || metrics.visibleHeaderColumns !== 4) {
        fail('mobile development must present exactly four useful unit facts', { viewport, metrics });
      }

      developmentPasses += 1;
      console.log(
        `PASS Z_FIND_MOBILE_DEVELOPMENT_BALANCE width=${viewport.width}`,
        JSON.stringify(metrics)
      );

      await page.close();
    }

    if (developmentPasses !== 4) {
      fail('development balance scenario count mismatch', { developmentPasses, expected: 4 });
    }

    console.log('MOBILE_LAYOUT_BALANCE_RUNTIME=30/30');
    console.log('MOBILE_DEVELOPMENT_BALANCE_RUNTIME=4/4');
    console.log('Z_FIND_MOBILE_UX_BALANCE_V3=PASS');
    console.log('Z_FIND_MOBILE_LAYOUT_BALANCE_V2=PASS');
    console.log('Z_FIND_MOBILE_UX_POLISH_V1=PASS');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
