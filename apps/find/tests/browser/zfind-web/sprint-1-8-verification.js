/* ============================================================
   Z FIND — SPRINT 1.8 VERIFICATION
   Supabase-backed Land Detail
   ============================================================
   Network is mocked; real application code is exercised.

   Contract:
   - Land is loaded through properties.js (subtype='land')
   - real plot_area_sqm/listing/partner/content are rendered
   - old DB.js planning/GDV/model-output fixtures never leak
   - non-Land ids are rejected by the Land route
   - real Land listing_id is usable by the enquiry flow
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

function mockLandRow() {
  return {
    id: 'asset_land_real',
    subtype: 'land',
    typology: null,
    area_sqm: 3200,
    plot_area_sqm: 3200,
    floor: null,
    zone_lite_id: 'zone-real',
    development_id: null,

    zones_lite: {
      name: 'Boavista',
      city: 'Porto',
      country_iso: 'PT',
    },

    representations: [{
      id: 'rep-land-real',
      target_type: 'property',
      status: 'active',

      partners: {
        id: 'partner-real',
        name: 'Real Land Partner',
        enquiry_policy: {
          direct: true,
          qualified: false,
          assisted: false,
        },
      },

      listings: [{
        id: 'listing-land-real',
        channel: 'standard',
        price_current: 2100000,
        currency_iso: 'EUR',
        price_is_from: false,
        status: 'published',

        listing_content: [{
          locale: 'en',
          title: 'Real Development Land in Boavista',
          description: 'Source-backed public description.',
          translation_status: 'approved',
        }],

        listing_media: [],
      }],
    }],
  };
}

async function run() {
  let pass = 0;
  let fail = 0;

  function assert(cond, label) {
    if (cond) {
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

  console.log('\n=== 1. Real Land detail renders source-backed Supabase data ===');
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));

    await page.route(
      '**/rest/v1/properties**',
      route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLandRow()),
      })
    );

    await page.goto(FILE_URL + '#/en/land/asset_land_real');
    await page.waitForTimeout(500);

    const text = await page.evaluate(
      () => document.getElementById('land-root').textContent
    );

    assert(
      pageErrors.length === 0,
      `Land page throws no browser exception (${JSON.stringify(pageErrors)})`
    );

    assert(
      text.includes('Real Development Land in Boavista'),
      'Real Supabase Land title is rendered'
    );

    assert(
      text.includes('3,200 m²'),
      'Real plot_area_sqm is rendered'
    );

    assert(
      text.includes('Real Land Partner'),
      'Real representing Partner is rendered'
    );

    assert(
      text.includes('Source-backed public description.'),
      'Real listing description is rendered'
    );

    assert(
      !text.includes('6,800') &&
      !text.includes('8,200,000') &&
      !text.includes('9,600,000') &&
      !text.includes('18–24'),
      'Old fixture planning/GDV/construction figures do not leak into the real page'
    );

    const handlers = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#land-root button'))
        .map(b => b.getAttribute('onclick') || '')
        .join(' ')
    );

    assert(
      handlers.includes("openModal('listing-land-real'"),
      'Land contact CTA carries the real listing id'
    );

    assert(
      !handlers.includes('openLandEnquiryUnavailable'),
      'Obsolete temporary Land-unavailable flow is gone'
    );

    await page.close();
  }


  console.log('\n=== 2. Loading state is visible while Land request is in flight ===');
  {
    const page = await browser.newPage();

    await page.route('**/rest/v1/properties**', async route => {
      await new Promise(r => setTimeout(r, 800));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLandRow()),
      });
    });

    await page.goto(FILE_URL + '#/en/land/asset_land_real');

    await page.waitForTimeout(150);

    const earlyText = await page.evaluate(
      () => document.getElementById('land-root').textContent
    );

    assert(
      earlyText.toLowerCase().includes('loading'),
      'Land shows loading state before Supabase responds'
    );

    await page.waitForTimeout(1000);

    const laterText = await page.evaluate(
      () => document.getElementById('land-root').textContent
    );

    assert(
      laterText.includes('Real Development Land in Boavista'),
      'Real Land content replaces loading state'
    );

    await page.close();
  }


  console.log('\n=== 3. Land route rejects a non-Land Property id ===');
  {
    const page = await browser.newPage();

    const row = mockLandRow();
    row.subtype = 'apartment';
    row.listing_content = undefined;

    await page.route(
      '**/rest/v1/properties**',
      route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(row),
      })
    );

    await page.goto(FILE_URL + '#/en/land/not-a-land');
    await page.waitForTimeout(500);

    const text = await page.evaluate(
      () => document.getElementById('land-root').textContent.toLowerCase()
    );

    assert(
      text.includes('this listing is no longer available'),
      'A non-Land Property id is treated as unavailable/not-found on /land'
    );

    await page.close();
  }


  console.log('\n=== 4. Land enquiry submits the real Supabase listing_id ===');
  {
    const page = await browser.newPage();

    await page.route(
      '**/rest/v1/properties**',
      route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLandRow()),
      })
    );

    const leadRequests = [];

    await page.route('**/rest/v1/leads**', route => {
      const method = route.request().method();
      let body = null;

      try {
        body = route.request().postData();
      } catch (e) {}

      leadRequests.push({
        method,
        body: body ? JSON.parse(body) : null,
      });

      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: '',
      });
    });

    await page.goto(FILE_URL + '#/en/land/asset_land_real');
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const btn = Array.from(
        document.querySelectorAll('#land-root button.btn-gold')
      ).find(
        b => (b.getAttribute('onclick') || '').includes('openModal')
      );

      if (btn) btn.click();
    });

    await page.waitForTimeout(300);

    await page.fill('#enquiry-name', 'Land Buyer');
    await page.fill('#enquiry-email', 'buyer@example.com');
    await page.click('#enquiry-send-btn');

    await page.waitForTimeout(500);

    const post = leadRequests.find(r => r.method === 'POST');

    assert(
      !!post,
      'Land enquiry performs a /leads POST'
    );

    assert(
      post &&
      post.body &&
      post.body.listing_id === 'listing-land-real',
      `Lead contains real Land listing_id — got ${
        post && post.body && post.body.listing_id
      }`
    );

    await page.close();
  }

  await browser.close();

  console.log(`\nSprint 1.8: ${pass} passed, ${fail} failed`);

  if (fail > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
