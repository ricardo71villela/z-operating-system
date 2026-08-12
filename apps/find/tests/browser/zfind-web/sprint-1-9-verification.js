/* ============================================================
   Z FIND — SPRINT 1.9 VERIFICATION
   Partner Detail — Supabase-backed public runtime

   Network is mocked, application code is real.

   Contract:
   - Partner identity/profile is read from Supabase
   - portfolio is restricted to the real Partner id
   - Property/Land/Development cards reuse real Supabase card mappers
   - legacy fixture trust / trust_level never leaks
   - loading/not-found/missing-id states are honest
   - Partner logo uses the existing shared signed-media resolver
   ============================================================ */

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL =
  'file://' +
  path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'apps',
    'zfind-web',
    'dist',
    'z-find-prototype.html'
  );

const PARTNER = {
  id: 'partner-real',
  name: 'Real Partner Network',
  role: 'agency',
  status: 'active',
  avg_response_hours: 6.5,
  enquiry_policy: {
    direct: true,
    qualified: true,
    assisted: false,
  },
  logo_storage_path: null,

  // Deliberately present in the MOCK response even though the real service
  // must never request or consume it. If it leaks into the UI the test fails.
  trust_level: 'Legacy High',
};

function propertyRow(id, subtype, title, zoneName) {
  return {
    id,
    subtype,
    typology: subtype === 'land' ? null : 'T2',
    area_sqm: subtype === 'land' ? 3200 : 95,
    zone_lite_id: 'zone-' + id,
    zones_lite: {
      name: zoneName,
      city: 'Porto',
      country_iso: 'PT',
    },
    representations: [{
      partner_id: PARTNER.id,
      target_type: 'property',
      status: 'active',
      listings: [{
        id: 'listing-' + id,
        channel: 'standard',
        price_current: subtype === 'land' ? 1250000 : 475000,
        currency_iso: 'EUR',
        price_is_from: false,
        status: 'published',
        listing_content: [{
          locale: 'en',
          title,
        }],
      }],
    }],
  };
}

const PROPERTY_ROWS = [
  propertyRow(
    'property-real-1',
    'apartment',
    'Real Partner Apartment',
    'Boavista'
  ),
  propertyRow(
    'land-real-1',
    'land',
    'Real Partner Land',
    'Foz do Douro'
  ),
];

const DEVELOPMENT_ROWS = [{
  id: 'development-real-1',
  name: 'Real Partner Development',
  zone_lite_id: 'zone-development-real-1',
  zones_lite: {
    name: 'Matosinhos Sul',
    city: 'Matosinhos',
    country_iso: 'PT',
  },
  representations: [{
    partner_id: PARTNER.id,
    target_type: 'development',
    status: 'active',
    listings: [{
      id: 'listing-development-real-1',
      channel: 'standard',
      price_current: 620000,
      currency_iso: 'EUR',
      price_is_from: true,
      status: 'published',
      listing_content: [{
        locale: 'en',
        title: 'Real Partner Development',
      }],
    }],
  }],
}];

async function mockPartnerRoutes(page, options) {
  const opts = options || {};
  const requests = {
    partners: [],
    properties: [],
    developments: [],
    storage: [],
  };

  await page.route('**/rest/v1/partners**', async route => {
    requests.partners.push(route.request().url());

    if (opts.partnerDelay) {
      await new Promise(resolve => setTimeout(resolve, opts.partnerDelay));
    }

    if (opts.partnerMissing) {
      return route.fulfill({
        status: 406,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'PGRST116',
          message: 'Results contain 0 rows',
        }),
      });
    }

    const partner = Object.assign({}, PARTNER, {
      logo_storage_path: opts.logoStoragePath || null,
    });

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(partner),
    });
  });

  await page.route('**/rest/v1/properties**', route => {
    requests.properties.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PROPERTY_ROWS),
    });
  });

  await page.route('**/rest/v1/developments**', route => {
    requests.developments.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DEVELOPMENT_ROWS),
    });
  });

  await page.route('**/storage/v1/object/sign/**', route => {
    requests.storage.push({
      url: route.request().url(),
      method: route.request().method(),
    });

    const url = route.request().url();
    const match = url.match(/\/object\/sign\/(.+?)(\?|$)/);
    const signedPath = match ? match[1] : 'unknown';

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        signedURL:
          '/object/sign/' +
          signedPath +
          '?token=mock-logo-token',
      }),
    });
  });

  return requests;
}

async function run() {
  let pass = 0;
  let fail = 0;

  function assert(condition, label) {
    if (condition) {
      pass++;
      console.log('  ✅', label);
    } else {
      fail++;
      console.log('  ❌', label);
    }
  }

  const browser = await chromium.launch(
    process.env.LOCAL_SANDBOX_CHROMIUM_PATH
      ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH }
      : {}
  );

  try {
    console.log('\n=== 1. Real Partner profile + published portfolio ===');

    {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));

      const requests = await mockPartnerRoutes(page);

      await page.goto(FILE_URL + '#/en/partner/' + PARTNER.id);

      await page.waitForFunction(() => {
        const h1 = document.querySelector('#partner-root h1');
        return h1 && h1.textContent === 'Real Partner Network';
      });

      const text = await page.locator('#partner-root').textContent();
      const cards = await page.locator('#partner-root .card').count();
      const stats = await page
        .locator('#partner-root .partner-stats b')
        .allTextContents();

      assert(
        pageErrors.length === 0,
        'Partner page throws no browser exception: ' +
          JSON.stringify(pageErrors)
      );

      assert(
        text.includes('Real Partner Network'),
        'Real Supabase Partner name is rendered'
      );

      assert(
        cards === 3,
        'Portfolio renders exactly 3 real published opportunities'
      );

      assert(
        stats[0] === '3',
        'Total opportunity count is derived from real cards'
      );

      assert(
        stats[1] === '1',
        'Development count is derived from real Development cards'
      );

      assert(
        stats[2] === '1',
        'Land count is derived from real Land cards'
      );

      assert(
        stats[3] === '6.5 hrs',
        'Real avg_response_hours is rendered'
      );

      assert(
        text.includes('Real Partner Apartment') &&
          text.includes('Real Partner Land') &&
          text.includes('Real Partner Development'),
        'Property, Land and Development cards all use Supabase portfolio data'
      );

      assert(
        !text.includes('Legacy High') &&
          !text.includes('4.2 hrs'),
        'Legacy fixture Trust/response values do not leak'
      );

      const partnerUrl = new URL(requests.partners[0]);
      const select = partnerUrl.searchParams.get('select') || '';

      assert(
        !select.includes('trust_level'),
        'Public Partner query never requests legacy partners.trust_level'
      );

      const propertyUrl = new URL(requests.properties[0]);
      const developmentUrl = new URL(requests.developments[0]);

      assert(
        propertyUrl.searchParams.get('representations.partner_id') ===
          'eq.' + PARTNER.id,
        'Property portfolio query is scoped to the real Partner id'
      );

      assert(
        developmentUrl.searchParams.get('representations.partner_id') ===
          'eq.' + PARTNER.id,
        'Development portfolio query is scoped to the real Partner id'
      );

      const exports = await page.evaluate(() =>
        Object.keys(window.ZFindServices.partners || {}).sort()
      );

      assert(
        JSON.stringify(exports) ===
          JSON.stringify([
            'getPublicPartnerById',
            'listPublishedDevelopments',
            'listPublishedProperties',
          ]),
        'Public Partner service is registered with the expected read-only exports'
      );

      await page.close();
    }

    console.log('\n=== 2. Loading state while Partner request is in flight ===');

    {
      const page = await browser.newPage();

      await mockPartnerRoutes(page, {
        partnerDelay: 800,
      });

      await page.goto(FILE_URL + '#/en/partner/' + PARTNER.id);

      await page.waitForTimeout(150);

      const earlyText = await page
        .locator('#partner-root')
        .textContent();

      assert(
        earlyText.toLowerCase().includes('loading'),
        'Partner loading state is visible before Supabase responds'
      );

      await page.waitForFunction(() => {
        const h1 = document.querySelector('#partner-root h1');
        return h1 && h1.textContent === 'Real Partner Network';
      });

      assert(
        (await page.locator('#partner-root').textContent())
          .includes('Real Partner Network'),
        'Real Partner content replaces the loading state'
      );

      await page.close();
    }

    console.log('\n=== 3. Missing/non-public Partner is unavailable ===');

    {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));

      await mockPartnerRoutes(page, {
        partnerMissing: true,
      });

      await page.goto(FILE_URL + '#/en/partner/does-not-exist');

      await page.waitForFunction(() =>
        document
          .getElementById('partner-root')
          .textContent
          .includes('Partner unavailable')
      );

      const text = await page
        .locator('#partner-root')
        .textContent();

      assert(
        text.includes('Partner unavailable'),
        'Missing/non-public Partner gets an honest unavailable state'
      );

      assert(
        !text.includes('Z Imobiliária'),
        'Missing Partner never falls back to fixture partner_zimob'
      );

      assert(
        pageErrors.length === 0,
        'Missing Partner state does not crash the page'
      );

      await page.close();
    }

    console.log('\n=== 4. Partner route without id has no fixture fallback ===');

    {
      const page = await browser.newPage();
      let partnerRequests = 0;

      await page.route('**/rest/v1/partners**', route => {
        partnerRequests++;
        route.abort();
      });

      await page.goto(FILE_URL + '#/en/partner');

      await page.waitForFunction(() =>
        document
          .getElementById('partner-root')
          .textContent
          .includes('Partner unavailable')
      );

      const text = await page
        .locator('#partner-root')
        .textContent();

      assert(
        partnerRequests === 0,
        'Partner route without id performs no invented Partner lookup'
      );

      assert(
        !text.includes('Z Imobiliária'),
        'Partner route without id never injects partner_zimob'
      );

      await page.close();
    }

    console.log('\n=== 5. Partner logo reuses shared signed-media resolver ===');

    {
      const page = await browser.newPage();

      const requests = await mockPartnerRoutes(page, {
        logoStoragePath:
          'partners/partner-real/logo-real-partner.webp',
      });

      await page.goto(FILE_URL + '#/en/partner/' + PARTNER.id);

      await page.waitForFunction(() => {
        const avatar = document.querySelector(
          '#partner-root .partner-avatar'
        );
        return (
          avatar &&
          avatar.style.backgroundImage &&
          avatar.style.backgroundImage.includes('mock-logo-token')
        );
      });

      const backgroundImage = await page
        .locator('#partner-root .partner-avatar')
        .evaluate(el => el.style.backgroundImage);

      const signingRequests = requests.storage.filter(
        request => request.method === 'POST'
      );

      assert(
        signingRequests.length === 1,
        'Partner logo performs exactly one signed-media creation request'
      );

      assert(
        backgroundImage.includes('mock-logo-token'),
        'Resolved Partner logo URL is applied to the profile avatar'
      );

      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(
    '\nSprint 1.9: ' +
      pass +
      ' passed, ' +
      fail +
      ' failed'
  );

  if (fail > 0) {
    process.exitCode = 1;
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
