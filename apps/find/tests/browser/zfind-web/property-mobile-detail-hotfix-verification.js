#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const VIEWPORTS = [
  { width: 320, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
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
    let passes = 0;

    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport });
      await routeNetworkStubs(page);
      await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });

      await page.evaluate(() => {
        document.querySelectorAll('.view').forEach(view => {
          view.classList.remove('active');
        });

        const view = document.getElementById('view-property');
        const root = document.getElementById('property-root');
        view.classList.add('active');

        root.innerHTML = `
          <div class="wrap" style="padding-top:20px;">
            <a class="btn-ghost">Retour aux résultats</a>
          </div>
          <div class="detail-hero">
            <div class="wrap">
              <span class="eyebrow">NULL · Lille, Lille, FR</span>
              <h1>[TEST FR] Bureaux Grand-Place — Lille</h1>
              <div class="loc-row">
                <span>Lille</span><span>·</span><span>145 m²</span><span>·</span>
                <span class="tag tag-verified">Représentation unique vérifiée</span>
              </div>
              <div class="price-tag">690 000 €</div>
            </div>
          </div>
          <div class="wrap detail-layout">
            <div>
              <div class="gallery"></div>
              <div class="facts-grid" id="property-facts-three">
                <div class="fact"><div class="k">Surface brute</div><div class="v">145 m²</div></div>
                <div class="fact"><div class="k">Étage</div><div class="v">2</div></div>
                <div class="fact"><div class="k">Type</div><div class="v">Bureaux</div></div>
              </div>
              <div class="facts-grid" id="property-facts-one">
                <div class="fact"><div class="k">Surface brute</div><div class="v">145 m²</div></div>
              </div>
              <div class="section-title">À propos de cette opportunité</div>
              <p id="property-description">ANNONCE DE DÉMONSTRATION. Plateau de bureaux fictif de 145 m² pour environ 18 postes, deux salles de réunion, fibre, climatisation, ascenseur et parkings.</p>
            </div>
            <div>
              <div class="sidebar-sticky">
                <div class="sidebar-card">
                  <h4>Simulation</h4>
                  <div class="sim-row"><span>Prix d'achat</span><span>690 000 €</span></div>
                  <div class="sim-row"><span>Information particulièrement longue</span><span>Valeur particulièrement longue</span></div>
                </div>
              </div>
            </div>
          </div>
        `;
      });

      await page.waitForTimeout(60);

      const metrics = await page.evaluate(() => {
        const px = value => Number.parseFloat(value || '0');
        const rect = selector => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            width: r.width,
          };
        };

        const layout = document.querySelector('#view-property .detail-layout');
        const factsThree = document.getElementById('property-facts-three');
        const factsOne = document.getElementById('property-facts-one');
        const thirdFact = factsThree.children[2];
        const onlyFact = factsOne.children[0];
        const sidebar = document.querySelector('#view-property .sidebar-sticky');
        const description = document.getElementById('property-description');

        const layoutStyle = getComputedStyle(layout);
        const factsStyle = getComputedStyle(factsThree);
        const sidebarStyle = getComputedStyle(sidebar);

        return {
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          gutterLeft: px(layoutStyle.paddingLeft),
          gutterRight: px(layoutStyle.paddingRight),
          layoutColumns: layoutStyle.gridTemplateColumns.split(' ').filter(Boolean).length,
          factsColumns: factsStyle.gridTemplateColumns.split(' ').filter(Boolean).length,
          layout: rect('#view-property .detail-layout'),
          gallery: rect('#view-property .gallery'),
          factsThree: rect('#property-facts-three'),
          thirdFact: {
            left: thirdFact.getBoundingClientRect().left,
            right: thirdFact.getBoundingClientRect().right,
            width: thirdFact.getBoundingClientRect().width,
          },
          factsOne: rect('#property-facts-one'),
          onlyFact: {
            left: onlyFact.getBoundingClientRect().left,
            right: onlyFact.getBoundingClientRect().right,
            width: onlyFact.getBoundingClientRect().width,
          },
          description: {
            left: description.getBoundingClientRect().left,
            right: description.getBoundingClientRect().right,
            width: description.getBoundingClientRect().width,
          },
          sidebar: {
            left: sidebar.getBoundingClientRect().left,
            right: sidebar.getBoundingClientRect().right,
            width: sidebar.getBoundingClientRect().width,
            position: sidebarStyle.position,
          },
          eyebrow: document.querySelector('#view-property .detail-hero .eyebrow').textContent.trim(),
          cssMarker: document.documentElement.innerHTML.includes('Z FIND — PROPERTY MOBILE DETAIL HOTFIX V1'),
          runtimeMarker: document.documentElement.innerHTML.includes('Z FIND — PROPERTY DETAIL HOTFIX V1'),
        };
      });

      const expectedGutter = viewport.width <= 360 ? 16 : 18;
      const tolerance = 1.5;

      if (!metrics.cssMarker) fail('property mobile CSS hotfix marker missing', { viewport, metrics });
      if (!metrics.runtimeMarker) fail('property detail runtime hotfix marker missing', { viewport, metrics });
      if (metrics.scrollWidth > viewport.width + 1) fail('property detail causes document overflow', { viewport, metrics });
      if (metrics.bodyScrollWidth > viewport.width + 1) fail('property detail causes body overflow', { viewport, metrics });
      if (metrics.layoutColumns !== 1) fail('property detail must be one column on phone', { viewport, metrics });
      if (metrics.factsColumns !== 2) fail('property facts must use two phone columns', { viewport, metrics });
      if (Math.abs(metrics.gutterLeft - expectedGutter) > tolerance) fail('property left gutter mismatch', { viewport, expectedGutter, metrics });
      if (Math.abs(metrics.gutterRight - expectedGutter) > tolerance) fail('property right gutter mismatch', { viewport, expectedGutter, metrics });

      for (const [name, box] of [
        ['gallery', metrics.gallery],
        ['factsThree', metrics.factsThree],
        ['factsOne', metrics.factsOne],
        ['description', metrics.description],
        ['sidebar', metrics.sidebar],
      ]) {
        if (!box) fail(`${name} missing`, { viewport, metrics });
        if (box.left < expectedGutter - tolerance) fail(`${name} breaches left gutter`, { viewport, expectedGutter, metrics });
        if (box.right > viewport.width - expectedGutter + tolerance) fail(`${name} breaches right gutter`, { viewport, expectedGutter, metrics });
      }

      if (metrics.thirdFact.width < metrics.factsThree.width - 3) {
        fail('odd final property fact must span full width', { viewport, metrics });
      }
      if (metrics.onlyFact.width < metrics.factsOne.width - 3) {
        fail('single property fact must span full width', { viewport, metrics });
      }
      if (metrics.sidebar.position !== 'static') {
        fail('property sidebar must not remain sticky on phone', { viewport, metrics });
      }
      if (metrics.eyebrow !== 'Lille, FR') {
        fail('property eyebrow null/duplicate normalization failed', { viewport, metrics });
      }

      passes += 1;
      console.log(
        `PASS Z_FIND_PROPERTY_MOBILE_DETAIL width=${viewport.width}`,
        JSON.stringify(metrics)
      );

      await page.close();
    }

    if (passes !== VIEWPORTS.length) {
      fail('property mobile detail scenario count mismatch', {
        passes,
        expected: VIEWPORTS.length,
      });
    }

    console.log(`PROPERTY_MOBILE_DETAIL_RUNTIME=${passes}/${VIEWPORTS.length}`);
    console.log('Z_FIND_PROPERTY_MOBILE_DETAIL_HOTFIX_V1=PASS');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
