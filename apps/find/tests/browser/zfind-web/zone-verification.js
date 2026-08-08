/* ============================================================
   Z FIND — LIVE ZONE VIEW VERIFICATION
   ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web', 'dist', 'z-find-prototype.html');

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});

  console.log('\n=== 1. Zone not found — honest message, never a blank/broken page ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/zones_lite**', route => route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116' }) }));
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(FILE_URL + '#/en/zone/does-not-exist');
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.getElementById('zone-root').textContent);
    assert(text.includes('could not be found'), `Shows an honest not-found message (got: "${text.slice(0,80)}")`);
    await page.close();
  }

  console.log('\n=== 2. Zone with thin inventory (< 5 listings) — never a misleading average ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/zones_lite**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }) }));
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(FILE_URL + '#/en/zone/z1');
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.getElementById('zone-root').textContent);
    assert(text.includes('Boavista') && text.includes('Porto'), 'Shows the real zone name and city');
    assert(text.includes('actively adding'), 'Honest thin-inventory message, no fabricated average price');
    assert(!text.includes('Average price'), 'Never shows "Average price" text with zero real listings');
    await page.close();
  }

  console.log('\n=== 3. Zone image renders when a real mapping exists ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/zones_lite**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }) }));
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(FILE_URL + '#/en/zone/z1');
    await page.waitForTimeout(600);
    const imgSrc = await page.evaluate(() => { const img = document.querySelector('#zone-root img'); return img ? img.getAttribute('src') : null; });
    assert(imgSrc === '/zones/boavista.jpg', `Uses the real, explicitly-mapped photo for Boavista (got: ${imgSrc})`);
    await page.close();
  }

  console.log('\n=== 4. Zone with no image mapping — gracefully no <img>, never a broken reference ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/zones_lite**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'z9', name: 'A Zone With No Photo', city: 'Nowhere', country_iso: 'PT' }) }));
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(FILE_URL + '#/en/zone/z9');
    await page.waitForTimeout(600);
    const hasImg = await page.evaluate(() => !!document.querySelector('#zone-root img'));
    assert(!hasImg, 'No <img> tag rendered at all when the zone has no mapped photo');
    await page.close();
  }

  console.log('\n=== 5. Zone with real listings — shows real cards, real stats above the threshold ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/zones_lite**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'z1', name: 'Boavista', city: 'Porto', country_iso: 'PT' }) }));
    const mkProp = (i, price) => ({
      id: 'prop-' + i, subtype: 'apartment', typology: 'T2', area_sqm: 80, zone_lite_id: 'z1',
      zones_lite: { name: 'Boavista', city: 'Porto', country_iso: 'PT' },
      representations: [{ target_type: 'property', status: 'active', listings: [{ id: 'l' + i, channel: 'standard', price_current: price, currency_iso: 'EUR', price_is_from: false, status: 'published', listing_content: [{ locale: 'en', title: 'Apt ' + i }] }] }],
    });
    const rows = [1,2,3,4,5].map(i => mkProp(i, 400000 + i * 10000));
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(FILE_URL + '#/en/zone/z1');
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.getElementById('zone-root').textContent);
    assert(text.includes('5 opportunities'), `Shows the real count once >= threshold (got fragment: ${text.includes('5 opportunities')})`);
    assert(text.includes('Average price'), 'Shows real average price once there is enough data');
    const cardCount = await page.evaluate(() => document.querySelectorAll('#zone-root .card').length);
    assert(cardCount === 5, `Renders one real card per listing, reusing cardHTML (got ${cardCount})`);
    await page.close();
  }

  await browser.close();
  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
