/* ============================================================
   Z FIND — SPRINT 1.4 VERIFICATION (Property page, Supabase-backed)
   ============================================================
   Mocks only network requests (page.route), exercises real
   application code (loadPropertyDetail, mapSupabasePropertyRowToDetailViewModel,
   renderProperty's async flow).

   Coverage against the Sprint 1.4 brief's 10 required test areas:
     ✓ successful property loading      -> Scenario 1
     ✓ missing property                 -> Scenario 2
     ✓ network failure                  -> Scenario 3
     ✓ multilingual rendering            -> Scenario 4
     ✓ gallery                           -> Scenario 5
     ✓ SEO metadata                      -> Scenario 6 (document.title only —
                                            see this sprint's report: no other
                                            SEO mechanism exists in this codebase
                                            to test)
     ~ JSON-LD                           -> N/A, confirmed absent from the
                                            entire codebase before this sprint;
                                            not added (see report)
     ~ breadcrumb generation             -> N/A, confirmed absent; only a
                                            single "back to results" link
                                            exists, not a breadcrumb trail
     ✓ loading state                     -> Scenario 7
     ✓ error state                       -> Scenario 3 (same as network failure)

   Run: node tests/browser/zfind-web/sprint-1-4-verification.js
   ============================================================ */

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web', 'dist', 'z-find-prototype.html');

function mockPropertyRow(overrides) {
  return Object.assign({
    id: 'asset_apt_boavista', subtype: 'apartment', typology: 'T3 Duplex', area_sqm: 140, floor: null, zone_lite_id: 'z1', development_id: null,
    zones_lite: { name: 'Boavista', city: 'Porto', country_iso: 'PT' },
    representations: [{
      id: 'rep1', target_type: 'property', status: 'active',
      partners: { id: 'partner_zimob', name: 'Z Imobiliária' },
      listings: [{
        id: 'listing1', channel: 'standard', price_current: 620000, currency_iso: 'EUR', price_is_from: false, status: 'published',
        listing_content: [
          { locale: 'en', title: 'Renovated Duplex in Boavista', description: 'A beautifully renovated duplex.' },
          { locale: 'pt', title: 'Duplex Renovado na Boavista', description: 'Um duplex lindamente renovado.' },
        ],
        listing_media: [{
          position: 0, is_cover: true,
          media_assets: {
            id: 'media1', original_storage_path: 'listings/boavista-01-original.jpg',
            media_variants: [
              { variant_type: 'thumbnail', storage_path: 'listings/boavista-01-thumb.jpg' },
              { variant_type: 'large', storage_path: 'listings/boavista-01-large.jpg' }, // must be preferred over the original
            ],
            media_asset_content: [{ locale: 'en', alt_text: 'Living room with large windows' }],
          },
        }],
      }],
    }],
  }, overrides);
}

async function mockRoutes(page, { propertyData, propertyStatus, propertyFail }) {
  await page.route('**/rest/v1/properties**', route => {
    if (propertyFail) return route.fulfill({ status: 500, body: JSON.stringify({ message: 'Internal Server Error' }) });
    route.fulfill({ status: propertyStatus || 200, contentType: 'application/json', body: JSON.stringify(propertyData) });
  });
  // Real endpoint pattern confirmed directly against the installed SDK
  // (client.storage.url === '{SUPABASE_URL}/storage/v1') — the bucket
  // is private (public: false in migration 0001), so this is the ONLY
  // mechanism that can ever produce a usable URL. IMPORTANT: the raw
  // server response field is `signedURL` (capital, relative path) —
  // the SDK itself prepends its base URL and exposes it to callers as
  // lowercase `signedUrl` afterwards. Getting this field name/shape
  // wrong was a real bug caught by this test actually running.
  await page.route('**/storage/v1/object/sign/**', route => {
    const url = route.request().url();
    const pathMatch = url.match(/\/object\/sign\/(.+?)(\?|$)/);
    const signedPath = pathMatch ? pathMatch[1] : 'unknown';
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: `/object/sign/${signedPath}?token=mock-token-abc` }) });
  });
}

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});

  // ---- Scenario 1: successful loading ----
  console.log('\n=== Scenario 1: successful property loading ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { propertyData: mockPropertyRow({}) });
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(600);
    const html = await page.evaluate(() => document.getElementById('property-root').innerHTML);
    assert(html.includes('Renovated Duplex in Boavista'), 'Real title rendered');
    assert(html.includes('140'), 'Real area rendered');
    const price = await page.evaluate(() => document.querySelector('.price-tag') && document.querySelector('.price-tag').textContent);
    assert(!!price && price.length > 0, `Price rendered (${price})`);
    const visibleText = await page.evaluate(() => document.getElementById('property-root').textContent);
    assert(!visibleText.includes('null'), 'No literal "null" text visible to the user (countryLabel fallback check — onclick="...null..." in markup is legitimate JS, not checked here)');

    // CTO product decision: never hide these sections, never fabricate
    // data — show a "Coming Soon" placeholder instead.
    assert(visibleText.includes('Z Intelligence market analysis'), 'Market Intelligence section ALWAYS visible, shows Coming Soon placeholder (never hidden, never fabricated)');
    assert(visibleText.includes('Professional insights and contextual observations'), 'Z Insights (Observation) section ALWAYS visible, shows Coming Soon placeholder — distinct from Market Intelligence, per CTO correction');
    assert(visibleText.includes('Z Intelligence investment scoring'), 'Investment/Yield sections ALWAYS visible, show Coming Soon placeholder');
    assert(visibleText.includes('Trust Score') && visibleText.includes('Coming Soon'), 'Trust chip ALWAYS visible, shows Coming Soon label instead of a fabricated trust score');
    await page.close();
  }

  // ---- Scenario 2: missing property ----
  console.log('\n=== Scenario 2: missing property (empty result, same as unpublished) ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { propertyData: null, propertyStatus: 406 }); // PostgREST .single() with 0 rows -> 406
    await page.goto(FILE_URL + '#/en/property/does-not-exist');
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.getElementById('property-root').textContent);
    assert(text.includes('no longer available') || text.toLowerCase().includes('not'), `Not-found message shown (got: "${text.slice(0,80)}")`);
    await page.close();
  }

  // ---- Scenario 3: network failure / error state ----
  console.log('\n=== Scenario 3: network failure -> error state ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { propertyFail: true });
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.getElementById('property-root').textContent);
    assert(text.toLowerCase().includes('could not'), 'Error message shown, distinct from not-found message');
    await page.close();
  }

  // ---- Scenario 4: multilingual rendering ----
  console.log('\n=== Scenario 4: multilingual rendering (PT) ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { propertyData: mockPropertyRow({}) });
    await page.goto(FILE_URL + '#/pt/property/asset_apt_boavista');
    await page.waitForTimeout(600);
    const html = await page.evaluate(() => document.getElementById('property-root').innerHTML);
    assert(html.includes('Duplex Renovado na Boavista'), 'Portuguese title rendered, not English fallback (PT content row exists)');
    await page.close();
  }
  console.log('--- multilingual fallback: locale with no content row falls back to English ---');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { propertyData: mockPropertyRow({}) }); // no 'fr' content row in the mock
    await page.goto(FILE_URL + '#/fr/property/asset_apt_boavista');
    await page.waitForTimeout(600);
    const html = await page.evaluate(() => document.getElementById('property-root').innerHTML);
    assert(html.includes('Renovated Duplex in Boavista'), 'Falls back to English title when the requested locale has no content row');
    await page.close();
  }

  // ---- Scenario 5: gallery — REAL URL resolution, not just a path string ----
  console.log('\n=== Scenario 5: gallery — real signed URL resolution and fetch ===');
  {
    const page = await browser.newPage();
    const imageRequests = [];
    page.on('request', req => { if (req.url().includes('boavista-01')) imageRequests.push(req.url()); });
    await mockRoutes(page, { propertyData: mockPropertyRow({}) });
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(700);

    const galleryStyle = await page.evaluate(() => { const g = document.querySelector('.gallery'); return g ? g.getAttribute('style') : null; });
    assert(galleryStyle && galleryStyle.includes('large.jpg'), `A web-suitable 'large' variant is preferred over the original (style: ${galleryStyle})`);
    assert(galleryStyle && !galleryStyle.includes('boavista-01-original.jpg'), 'The immutable original is NOT used directly when a variant exists');
    assert(galleryStyle && galleryStyle.includes('token=mock-token-abc'), 'The gallery uses the RESOLVED SIGNED URL, not the bare storage path — proves the private-bucket fix actually runs');
    assert(imageRequests.some(u => u.includes('token=mock-token-abc')), 'The browser genuinely fetches the resolved URL (a real request/response cycle, not just a string sitting in CSS)');

    console.log('--- already-absolute URL is not corrupted ---');
    const rowAbsoluteUrl = mockPropertyRow({});
    rowAbsoluteUrl.representations[0].listings[0].listing_media[0].media_assets.media_variants = [];
    rowAbsoluteUrl.representations[0].listings[0].listing_media[0].media_assets.original_storage_path = 'https://cdn.example.com/already-absolute.jpg';
    await mockRoutes(page, { propertyData: rowAbsoluteUrl });
    await page.goto(FILE_URL + '#/en/home');
    await page.waitForTimeout(200);
    await page.evaluate(() => { location.hash = '/en/property/asset_apt_boavista'; });
    await page.waitForTimeout(500);
    const absoluteStyle = await page.evaluate(() => { const g = document.querySelector('.gallery'); return g ? g.getAttribute('style') : null; });
    assert(absoluteStyle && absoluteStyle.includes('https://cdn.example.com/already-absolute.jpg') && !absoluteStyle.includes('/storage/v1/object/sign/'), `An already-absolute URL passes through unchanged, never re-wrapped in a signed-URL call (style: ${absoluteStyle})`);

    console.log('--- gallery with no media: falls back to the original empty placeholder, no regression ---');
    const rowNoMedia = mockPropertyRow({});
    rowNoMedia.representations[0].listings[0].listing_media = [];
    await mockRoutes(page, { propertyData: rowNoMedia });
    await page.goto(FILE_URL + '#/en/home'); // navigate away first — same hash twice never fires hashchange
    await page.waitForTimeout(200);
    await page.evaluate(() => { location.hash = '/en/property/asset_apt_boavista'; });
    await page.waitForTimeout(600);
    const emptyGalleryStyle = await page.evaluate(() => { const g = document.querySelector('.gallery'); return g ? g.getAttribute('style') : null; });
    assert(!emptyGalleryStyle || !emptyGalleryStyle.includes('background-image'), 'No media -> gallery stays the original empty placeholder box (CSS gradient), no broken image');
    await page.close();
  }

  // ---- Scenario 6: SEO metadata (document.title only — see report) ----
  console.log('\n=== Scenario 6: SEO metadata (document.title) ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { propertyData: mockPropertyRow({}) });
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(600);
    const title = await page.title();
    assert(title.includes('Renovated Duplex in Boavista'), `document.title updated per-property (got: "${title}")`);
    await page.close();
  }

  // ---- Scenario 7: loading state ----
  console.log('\n=== Scenario 7: loading state shown before data arrives ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', async route => {
      await new Promise(r => setTimeout(r, 800)); // deliberate delay to observe the loading state
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({})) });
    });
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(150); // check BEFORE the delayed response arrives
    const earlyText = await page.evaluate(() => document.getElementById('property-root').textContent);
    assert(earlyText.toLowerCase().includes('loading'), 'Loading message shown while the request is in flight');
    await page.waitForFunction(
      () => document.getElementById('property-root').textContent.includes('Renovated Duplex in Boavista'),
      null,
      { timeout: 3000 }
    );
    const laterText = await page.evaluate(() => document.getElementById('property-root').textContent);
    assert(laterText.includes('Renovated Duplex in Boavista'), 'Real content replaces the loading state once data arrives');
    await page.close();
  }

  // ---- Scenario 8: vm.market/intelligence/trust genuinely null — must not crash ----
  // This does NOT rely on the mapping function's current object-shaped
  // contract (confirmed: it always returns market as an object with
  // null fields, never null itself) — it forces the more hostile case
  // by overriding the global loadPropertyDetail function directly, so
  // the null-safety guard in app.js is the thing actually being
  // proven, not just today's mapping function's behavior.
  console.log('\n=== Scenario 8: vm.market/intelligence/trust genuinely null (not just empty objects) ===');
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await mockRoutes(page, { propertyData: mockPropertyRow({}) });
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      window.__originalLoadPropertyDetail = loadPropertyDetail;
      window.loadPropertyDetail = async function () {
        return {
          notFound: false, error: null,
          viewModel: {
            asset: { id: 'x', typology: 'T2', areaSqm: 90, subtype: 'apartment' },
            listing: { id: 'l1', priceCurrent: 300000 },
            partner: { id: 'p1', name: 'Test Partner', enquiryPolicy: { direct: true, qualified: false, assisted: false } },
            geo: { zoneLabel: 'Test Zone', cityLabel: 'Porto', countryLabel: 'PT', currencyIso: 'EUR' },
            content: { title: 'Null Safety Test Property', description: 'Test description.' },
            media: [],
            trust: null,
            facts: [{ labelKey: 'property.typology', value: 'T2' }],
            market: null,      // genuinely null, not an object with null fields
            intelligence: null,
            priceLabel: '€300,000',
            representationNote: { multiple: false },
          },
        };
      };
    });
    // Re-run the real Property renderer directly after replacing its
    // loader. Do not route through Home: mockRoutes() intentionally
    // returns one Property object for getPropertyById(), whereas Home's
    // search service correctly expects an array.
    await page.evaluate(async () => {
      await renderProperty('asset_apt_boavista');
    });

    assert(pageErrors.length === 0, `No exception thrown when vm.market is genuinely null (errors: ${JSON.stringify(pageErrors)})`);
    const visibleText = await page.evaluate(() => document.getElementById('property-root').textContent);
    assert(visibleText.includes('Null Safety Test Property'), 'Page still renders the real content around the null sections');
    assert(visibleText.includes('Z Intelligence market analysis'), 'Market Intelligence placeholder renders correctly when vm.market is null (not just empty-object)');
    assert(visibleText.includes('Professional insights and contextual observations'), 'Z Insights placeholder renders correctly alongside a null vm.market');
    assert(visibleText.includes('Z Intelligence investment scoring'), 'Investment placeholder renders correctly when vm.intelligence is null');
    assert(visibleText.includes('Trust Score') && visibleText.includes('Coming Soon'), 'Trust placeholder renders correctly when vm.trust is null');
    assert(!/%|€\d/.test(visibleText.replace('€300,000','')), 'No fabricated percentages or currency figures anywhere outside the real, mocked price');
    await page.close();
  }

  // ---- Scenario 9: all three languages render valid placeholder content ----
  console.log('\n=== Scenario 9: placeholders render correctly in all 3 languages ===');
  {
    for (const [locale, expectedFragment] of [['en', 'Professional insights'], ['pt', 'Análises profissionais'], ['fr', 'analyses professionnelles']]) {
      const page = await browser.newPage();
      await mockRoutes(page, { propertyData: mockPropertyRow({}) });
      await page.goto(FILE_URL + `#/${locale}/property/asset_apt_boavista`);
      await page.waitForTimeout(500);
      const visibleText = await page.evaluate(() => document.getElementById('property-root').textContent);
      assert(visibleText.toLowerCase().includes(expectedFragment.toLowerCase()), `Z Insights placeholder renders valid ${locale.toUpperCase()} content (expected fragment: "${expectedFragment}")`);
      await page.close();
    }
  }

  // ---- Scenario 8 (Property): partner navigation uses the real id, missing partner data doesn't crash ----
  console.log('\n=== Scenario 8: partner data — real navigation, safe when missing ===');
  {
    const page = await browser.newPage();
    await mockRoutes(page, { propertyData: mockPropertyRow({}) });
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(600);
    const onclickAttr = await page.evaluate(() => { const el = document.querySelector('.sidebar-card [onclick*="navigate(\'partner\'"]'); return el ? el.getAttribute('onclick') : null; });
    assert(onclickAttr && onclickAttr.includes("'partner_zimob'"), `Partner click handler navigates with the REAL id (got: ${onclickAttr})`);
    await page.close();
  }
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    const rowNoPartner = mockPropertyRow({});
    delete rowNoPartner.representations[0].partners;
    await mockRoutes(page, { propertyData: rowNoPartner });
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(600);
    assert(pageErrors.length === 0, `Missing partner data does not crash the page (errors: ${JSON.stringify(pageErrors)})`);
    const html = await page.evaluate(() => document.getElementById('property-root').innerHTML);
    assert(!html.includes("navigate('partner','null')") && !html.includes('navigate(\'partner\', \'null\')'), 'UI never generates navigate(\'partner\',\'null\') when partner data is missing');
    await page.close();
  }

  await browser.close();

  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
