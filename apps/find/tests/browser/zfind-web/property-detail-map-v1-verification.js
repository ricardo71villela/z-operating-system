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
  const emptyJson = {
    status: 200,
    contentType: 'application/json',
    body: '[]',
  };

  await page.route('https://example.supabase.co/**', route =>
    route.fulfill(emptyJson)
  );

  await page.route('https://build-only.supabase.co/**', route =>
    route.fulfill(emptyJson)
  );

  await page.route('https://www.openstreetmap.org/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body>map fixture</body></html>',
    })
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

      // This is a component-level fixture, not a router test. Measure
      // synchronously in the same browser task in which renderMap()
      // inserts the map. The production MutationObserver correctly
      // removes map UI when the actual route is not Property, so an
      // artificial fixture must not wait across that route cleanup.
      const result = await page.evaluate(() => {
        document.querySelectorAll('.view').forEach(view => {
          view.classList.remove('active');
        });

        const view = document.getElementById('view-property');
        const root = document.getElementById('property-root');
        view.classList.add('active');

        root.innerHTML = `
          <div class="detail-hero"><div class="wrap"><h1>Map fixture</h1></div></div>
          <div class="wrap detail-layout">
            <div>
              <div class="gallery"></div>
              <div class="facts-grid" id="map-fixture-facts">
                <div class="fact"><div class="k">Surface</div><div class="v">95 m²</div></div>
                <div class="fact"><div class="k">Type</div><div class="v">Appartement</div></div>
              </div>
              <div class="section-title">À propos</div>
              <p>Fixture used only to verify Property Detail Map V1.</p>
            </div>
            <div><div class="sidebar-sticky"><div class="sidebar-card">Contact</div></div></div>
          </div>
        `;

        const api = window.ZFindServices && window.ZFindServices.propertyMap;
        if (!api) return { setup: { api: false }, metrics: null };

        const invalid = api.normalizeCoordinates(95, 3);
        const missingNull = api.normalizeCoordinates(null, null);
        const missingUndefined = api.normalizeCoordinates(undefined, undefined);
        const missingEmpty = api.normalizeCoordinates('', '');
        const missingRendered = api.renderMap(
          { latitude: null, longitude: null },
          { lang: 'fr' }
        );
        const rendered = api.renderMap(
          { latitude: 50.629250, longitude: 3.057256 },
          { lang: 'fr' }
        );

        const map = document.getElementById('zfind-property-map-v1');
        const facts = document.getElementById('map-fixture-facts');
        const iframe = map && map.querySelector('iframe');
        const link = map && map.querySelector('a');
        const note = map && map.querySelector('.property-map-v1-note');
        const rect = map && map.getBoundingClientRect();
        const factsRect = facts && facts.getBoundingClientRect();

        return {
          setup: {
            api: true,
            invalidIsNull: invalid === null,
            nullIsMissing: missingNull === null,
            undefinedIsMissing: missingUndefined === null,
            emptyIsMissing: missingEmpty === null,
            missingRendered,
            rendered,
            embed: api.openStreetMapEmbedUrl(50.629250, 3.057256),
            page: api.openStreetMapPageUrl(50.629250, 3.057256),
          },
          metrics: {
            exists: Boolean(map),
            mapLeft: rect && rect.left,
            mapRight: rect && rect.right,
            mapWidth: rect && rect.width,
            factsBottom: factsRect && factsRect.bottom,
            mapTop: rect && rect.top,
            iframeSrc: iframe && iframe.getAttribute('src'),
            iframeLoading: iframe && iframe.getAttribute('loading'),
            iframeReferrer: iframe && iframe.getAttribute('referrerpolicy'),
            iframeWidth: iframe && iframe.getBoundingClientRect().width,
            iframeHeight: iframe && iframe.getBoundingClientRect().height,
            linkTarget: link && link.getAttribute('target'),
            linkRel: link && link.getAttribute('rel'),
            note: note && note.textContent.trim(),
            scrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
            sourceMarker: document.documentElement.innerHTML.includes('Z FIND — PROPERTY DETAIL MAP V1'),
          }
        };
      });

      const setup = result.setup;
      const metrics = result.metrics;

      if (!setup.api) fail('Property Map API missing from built HTML', { viewport, setup });
      if (!setup.invalidIsNull) fail('Out-of-range coordinates must be rejected', { viewport, setup });
      if (!setup.nullIsMissing || !setup.undefinedIsMissing || !setup.emptyIsMissing) {
        fail('Nullish/empty coordinates must be rejected before numeric coercion', { viewport, setup });
      }
      if (setup.missingRendered !== false) fail('Missing coordinates must not render a map', { viewport, setup });
      if (setup.rendered !== true) fail('Valid coordinates must render a map', { viewport, setup });
      if (!String(setup.embed).startsWith('https://www.openstreetmap.org/export/embed.html')) {
        fail('Map embed must use the zero-key OpenStreetMap endpoint', { viewport, setup });
      }
      if (!String(setup.page).startsWith('https://www.openstreetmap.org/')) {
        fail('Map external link must use OpenStreetMap', { viewport, setup });
      }

      if (!metrics || !metrics.exists) fail('Property map DOM missing', { viewport, metrics });
      if (!metrics.sourceMarker) fail('Property map runtime marker missing', { viewport, metrics });
      if (metrics.mapTop < metrics.factsBottom - 1) fail('Property map must be inserted after facts', { viewport, metrics });
      if (metrics.scrollWidth > viewport.width + 1) fail('Property map causes document overflow', { viewport, metrics });
      if (metrics.bodyScrollWidth > viewport.width + 1) fail('Property map causes body overflow', { viewport, metrics });
      if (metrics.mapLeft < -1 || metrics.mapRight > viewport.width + 1) fail('Property map breaches viewport', { viewport, metrics });
      if (Math.abs(metrics.iframeWidth - metrics.mapWidth) > 2) fail('Map iframe must fill map width', { viewport, metrics });
      if (viewport.width <= 640 && Math.abs(metrics.iframeHeight - 260) > 2) fail('Phone map height must be 260px', { viewport, metrics });
      if (metrics.iframeLoading !== 'lazy') fail('Map iframe must lazy-load', { viewport, metrics });
      if (metrics.iframeReferrer !== 'no-referrer') fail('Map iframe must suppress referrer', { viewport, metrics });
      if (metrics.linkTarget !== '_blank') fail('External map link must open separately', { viewport, metrics });
      if (!String(metrics.linkRel).includes('noopener') || !String(metrics.linkRel).includes('noreferrer')) {
        fail('External map link must be isolated', { viewport, metrics });
      }
      if (!String(metrics.note).includes('localisation fournie')) {
        fail('French public-location disclosure missing', { viewport, metrics });
      }

      passes += 1;
      console.log(
        `PASS Z_FIND_PROPERTY_DETAIL_MAP width=${viewport.width}`,
        JSON.stringify(metrics)
      );

      await page.close();
    }

    if (passes !== VIEWPORTS.length) {
      fail('Property map scenario count mismatch', {
        passes,
        expected: VIEWPORTS.length,
      });
    }

    console.log(`PROPERTY_DETAIL_MAP_RUNTIME=${passes}/${VIEWPORTS.length}`);
    console.log('Z_FIND_PROPERTY_DETAIL_MAP_V1=PASS');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
