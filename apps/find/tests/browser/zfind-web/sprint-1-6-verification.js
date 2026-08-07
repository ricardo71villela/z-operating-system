/* ============================================================
   Z FIND — SPRINT 1.6 VERIFICATION (Lead & Contact Flow — FINAL)
   ============================================================
   Mocks only network requests, exercises real application code.

   Sprint 1.6 final correction: successful lead INSERTs are mocked
   with an EMPTY response body and 201 status — the real contract for
   anon (INSERT grant only, no SELECT) — never a returned row. Any
   test that mocked a fake "created lead" object would be testing a
   contract the real database cannot produce.
   ============================================================ */

const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web', 'dist', 'z-find-prototype.html');

function mockPropertyRow(enquiryPolicy) {
  return {
    id: 'asset_apt_boavista', subtype: 'apartment', typology: 'T3', area_sqm: 140, floor: null, zone_lite_id: 'z1', development_id: null,
    zones_lite: { name: 'Boavista', city: 'Porto', country_iso: 'PT' },
    representations: [{
      id: 'rep1', target_type: 'property', status: 'active',
      partners: { id: 'partner_zimob', name: 'Z Imobiliária', enquiry_policy: enquiryPolicy },
      listings: [{
        id: 'listing1', channel: 'standard', price_current: 620000, currency_iso: 'EUR', price_is_from: false, status: 'published',
        listing_content: [{ locale: 'en', title: 'Renovated Duplex in Boavista', description: 'A beautifully renovated duplex.' }],
        listing_media: [],
      }],
    }],
  };
}
function mockDevelopmentRow(enquiryPolicy) {
  return {
    id: 'asset_dev_rionorte', name: 'Rio Norte', zone_lite_id: 'z2',
    zones_lite: { name: 'Matosinhos Sul', city: 'Matosinhos', country_iso: 'PT' },
    development_media: [],
    representations: [{ id: 'rep1', target_type: 'development', status: 'active', partners: { id: 'partner_zimob', name: 'Z Imobiliária', enquiry_policy: enquiryPolicy }, listings: [{
      id: 'listing-dev-1', channel: 'standard', price_current: 340000, currency_iso: 'EUR', price_is_from: true, status: 'published',
      listing_content: [{ locale: 'en', title: 'Rio Norte Development', description: 'A new construction project.' }], listing_media: [],
    }] }],
  };
}

function trackLeadsRoute(page, opts) {
  const options = opts || {};
  const requests = [];
  page.route('**/rest/v1/leads**', route => {
    const method = route.request().method();
    let body = null;
    try { body = route.request().postData(); } catch (e) {}
    requests.push({ method, body: body ? JSON.parse(body) : null });
    if (method === 'GET') {
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'permission denied for table leads' }) });
    }
    if (options.fail) return route.fulfill({ status: 500, body: '' });
    route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  });
  return requests;
}

async function openModalOnPage(page) {
  await page.evaluate(() => { document.querySelectorAll('button.btn-gold').forEach(b => { if (b.getAttribute('onclick') && b.getAttribute('onclick').includes('openModal')) b.click(); }); });
  await page.waitForTimeout(300);
}

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

  console.log('\n=== 0. Direct unit-level assertions (Node, no browser) ===');
  {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://unit-test.supabase.co';
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_unit_test_key_000000000000';
    const leadsModule = require('../../../apps/zfind-web/src/services/leads.js');

    assert(leadsModule.isValidPhone('+351 912 345 678') === true, 'isValidPhone: valid international number accepted');
    assert(leadsModule.isValidPhone('(21) 123-4567') === true, 'isValidPhone: parentheses/hyphen formatting accepted');
    assert(leadsModule.isValidPhone('abc') === false, 'isValidPhone: "abc" rejected');
    assert(leadsModule.isValidPhone('???') === false, 'isValidPhone: "???" rejected');
    assert(leadsModule.isValidPhone('123') === false, 'isValidPhone: unrealistically short number rejected');
    assert(leadsModule.isValidPhone('') === false, 'isValidPhone: empty string rejected');

    const blankName = leadsModule.validateLead({ listingId: 'l1', contactType: 'direct', name: '', email: 'maria@example.com', phone: '' });
    assert(!blankName.valid && blankName.errors.includes('missing_name'), 'validateLead: blank name -> missing_name');

    const whitespaceName = leadsModule.validateLead({ listingId: 'l1', contactType: 'direct', name: '   ', email: 'maria@example.com', phone: '' });
    assert(!whitespaceName.valid && whitespaceName.errors.includes('missing_name'), 'validateLead: whitespace-only name -> missing_name');

    const invalidEmail = leadsModule.validateLead({ listingId: 'l1', contactType: 'direct', name: 'Maria', email: 'abc', phone: '' });
    assert(!invalidEmail.valid && invalidEmail.errors.includes('invalid_email'), 'validateLead: "abc" as email -> invalid_email, never silently accepted');

    const validEmail = leadsModule.validateLead({ listingId: 'l1', contactType: 'direct', name: 'Maria', email: 'maria@example.com', phone: '' });
    assert(validEmail.valid && validEmail.email === 'maria@example.com' && !validEmail.phone, 'validateLead: valid email accepted, phone stays null');

    const validPhone = leadsModule.validateLead({ listingId: 'l1', contactType: 'direct', name: 'Maria', email: '', phone: '+351 912 345 678' });
    assert(validPhone.valid && validPhone.phone === '+351 912 345 678' && !validPhone.email, 'validateLead: valid phone accepted, original value preserved verbatim, email stays null');

    const both = leadsModule.validateLead({ listingId: 'l1', contactType: 'direct', name: 'Maria', email: 'maria@example.com', phone: '+351 912 345 678' });
    assert(both.valid && both.email === 'maria@example.com' && both.phone === '+351 912 345 678', 'validateLead: BOTH email and phone accepted together — the real gap this fix closes, a visitor is never forced to pick just one');

    const neither = leadsModule.validateLead({ listingId: 'l1', contactType: 'direct', name: 'Maria', email: '', phone: '' });
    assert(!neither.valid && neither.errors.includes('missing_contact_method'), 'validateLead: neither email nor phone provided -> missing_contact_method');
  }

  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});

  console.log('\n=== 1. Real anon INSERT contract (no read-back) ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Maria Silva');
    await page.fill('#enquiry-email', 'maria@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);

    const posts = requests.filter(r => r.method === 'POST');
    const gets = requests.filter(r => r.method === 'GET');
    assert(posts.length === 1, `Exactly one INSERT (POST) reaches leads — got ${posts.length}`);
    assert(gets.length === 0, `Zero GET/SELECT requests to leads occur — got ${gets.length}`);
    const successVisible = await page.evaluate(() => document.getElementById('enquiry-feedback').textContent.toLowerCase().includes('thank you'));
    assert(successVisible, 'UI shows success from a real empty-body 201 response (no row read back)');
    await page.close();
  }

  console.log('\n=== 2. Qualification payload contract ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: true, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.click('.contact-opt[data-opt="qualified"]');
    await page.selectOption('#enquiry-lookingfor', { index: 1 });
    await page.selectOption('#enquiry-timing', { index: 1 });
    await page.fill('#enquiry-name', 'Test');
    await page.fill('#enquiry-email', 'test@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    const payload = requests.find(r => r.method === 'POST').body;
    assert(payload.contact_type === 'qualified', 'contact_type is qualified');
    assert(payload.message.includes('[Qualification'), 'Message includes a Qualification block');
    assert(payload.message.includes('Looking for:'), 'Message includes the real "looking for" selection');
    assert(payload.message.includes('Timing:'), 'Message includes the real "timing" selection');
    await page.close();
  }
  {
    console.log('--- direct enquiry: no fabricated qualification data ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Test');
    await page.fill('#enquiry-email', 'test@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    const payload = requests.find(r => r.method === 'POST').body;
    assert(!payload.message || !payload.message.includes('[Qualification'), 'Direct enquiry message contains NO Qualification block');
    await page.close();
  }

  console.log('\n=== 3. Context metadata (partner, source, UTM, no null/undefined) ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista?utm_source=google&utm_medium=cpc');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Test');
    await page.fill('#enquiry-email', 'test@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    const payload = requests.find(r => r.method === 'POST').body;
    assert(payload.message.includes('Partner: partner_zimob'), 'Property lead includes the real partner id');
    assert(payload.message.includes('Source: zfind_property'), 'Property lead includes the real source');
    assert(payload.message.includes('utm_source: google'), 'UTM value included when actually present in the URL');
    assert(payload.message.includes('utm_medium: cpc'), 'Second UTM value also included');
    assert(!/\bnull\b|\bundefined\b/.test(payload.message), 'No literal "null" or "undefined" appears anywhere in the message');
    await page.close();
  }
  {
    console.log('--- Development lead: partner + development id + source ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDevelopmentRow({ direct: true, qualified: false, assisted: false })) }));
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/development/asset_dev_rionorte');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Test');
    await page.fill('#enquiry-email', 'test@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    const payload = requests.find(r => r.method === 'POST').body;
    assert(payload.message.includes('Partner: partner_zimob'), 'Development lead includes the real partner id');
    assert(payload.message.includes('Development: asset_dev_rionorte'), 'Development lead includes the real development id');
    assert(payload.message.includes('Source: zfind_development'), 'Development lead includes the real source');
    assert(!/\bnull\b|\bundefined\b/.test(payload.message), 'No literal null/undefined in the Development lead message either');
    await page.close();
  }
  {
    console.log('--- No UTM in URL: no UTM lines fabricated ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Test');
    await page.fill('#enquiry-email', 'test@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    const payload = requests.find(r => r.method === 'POST').body;
    assert(!payload.message.includes('utm_'), 'No utm_ lines appear when none were present in the URL');
    await page.close();
  }

  console.log('\n=== 4. Assisted mode (assisted-only policy) ===');
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: false, qualified: false, assisted: true })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    const optionsVisible = await page.evaluate(() => document.querySelectorAll('.contact-opt').length);
    assert(optionsVisible === 1, `Exactly one visible contact option for an assisted-only policy — got ${optionsVisible} (never an invisible selected mode)`);
    const assistedText = await page.evaluate(() => document.querySelector('.contact-opt[data-opt="assisted"]') ? document.querySelector('.contact-opt[data-opt="assisted"]').textContent : null);
    assert(!!assistedText, 'The assisted option is genuinely rendered and visible');
    await page.fill('#enquiry-name', 'Test');
    await page.fill('#enquiry-email', 'test@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    const payload = requests.find(r => r.method === 'POST').body;
    assert(payload.contact_type === 'assisted', `Submitted contact_type is assisted — got ${payload.contact_type}`);
    await page.close();
  }

  console.log('\n=== 5. Land — no Supabase INSERT attempted from an unmigrated page ===');
  {
    const page = await browser.newPage();
    let leadsRequested = false;
    page.route('**/rest/v1/leads**', route => { leadsRequested = true; route.fulfill({ status: 201, contentType: 'application/json', body: '' }); });
    await page.goto(FILE_URL + '#/en/land/asset_land_boavista');
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.querySelectorAll('button.btn-gold').forEach(b => { if (b.getAttribute('onclick') && b.getAttribute('onclick').includes('openLandEnquiryUnavailable')) b.click(); }); });
    await page.waitForTimeout(300);
    const modalVisible = await page.evaluate(() => document.getElementById('modal-overlay').classList.contains('active'));
    const hasNameField = await page.evaluate(() => !!document.getElementById('enquiry-name'));
    assert(modalVisible, 'A modal opens (clear temporary state), not a silent no-op');
    assert(!hasNameField, 'No submission form is rendered for Land — no name/contact fields exist to even attempt a submission with');
    assert(!leadsRequested, 'Zero requests to /rest/v1/leads occur from the Land page');
    await page.close();
  }

  console.log('\n=== 6. Validation and UX state handling ===');
  {
    console.log('--- validation failure re-enables the button ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(400);
    const btnEnabledAfterValidation = await page.evaluate(() => !document.getElementById('enquiry-send-btn').disabled);
    assert(btnEnabledAfterValidation, 'Button is re-enabled after a validation failure');
    await page.close();
  }
  {
    console.log('--- network/server failure re-enables the button ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    trackLeadsRoute(page, { fail: true });
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Test');
    await page.fill('#enquiry-email', 'test@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    const btnEnabledAfterFailure = await page.evaluate(() => !document.getElementById('enquiry-send-btn').disabled);
    assert(btnEnabledAfterFailure, 'Button is re-enabled after a network/server failure');
    await page.close();
  }
  {
    console.log('--- closing and reopening resets state; no stale values inherited ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: true, assisted: false })) }));
    trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.click('.contact-opt[data-opt="qualified"]');
    await page.fill('#enquiry-name', 'Stale Name');
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(150);
    await openModalOnPage(page);
    const reopenedName = await page.evaluate(() => document.getElementById('enquiry-name').value);
    const reopenedSelected = await page.evaluate(() => document.querySelector('.contact-opt.selected') ? document.querySelector('.contact-opt.selected').dataset.opt : null);
    assert(reopenedName === '', `Name field is empty on reopen, not inheriting the stale "Stale Name" value (got: "${reopenedName}")`);
    assert(reopenedSelected === 'direct', `Selection resets to the policy default (direct) on reopen, not staying on the previously-selected "qualified" (got: ${reopenedSelected})`);
    await page.close();
  }

  console.log('\n=== 7. Name and contact validation (final correction) ===');
  {
    console.log('--- blank name is rejected, zero POST ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-email', 'maria@example.com'); // name left blank
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(400);
    assert(requests.filter(r => r.method === 'POST').length === 0, 'Blank name: zero POST requests made');
    const btnEnabled = await page.evaluate(() => !document.getElementById('enquiry-send-btn').disabled);
    assert(btnEnabled, 'Send button re-enabled after blank-name validation failure');
    await page.close();
  }
  {
    console.log('--- whitespace-only name is rejected ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', '    ');
    await page.fill('#enquiry-email', 'maria@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(400);
    assert(requests.filter(r => r.method === 'POST').length === 0, 'Whitespace-only name: zero POST requests made');
    await page.close();
  }
  {
    console.log('--- "abc" rejected as phone, zero POST ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Maria');
    await page.fill('#enquiry-phone', 'abc');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(400);
    assert(requests.filter(r => r.method === 'POST').length === 0, '"abc" as phone: zero POST requests made');
    await page.close();
  }
  {
    console.log('--- "???" rejected as phone ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Maria');
    await page.fill('#enquiry-phone', '???');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(400);
    assert(requests.filter(r => r.method === 'POST').length === 0, '"???" as phone: zero POST requests made');
    await page.close();
  }
  {
    console.log('--- unrealistically short number rejected ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Maria');
    await page.fill('#enquiry-phone', '123');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(400);
    assert(requests.filter(r => r.method === 'POST').length === 0, '"123" (too short): zero POST requests made');
    await page.close();
  }
  {
    console.log('--- valid email still succeeds ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Maria');
    await page.fill('#enquiry-email', 'maria@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    const posts = requests.filter(r => r.method === 'POST');
    assert(posts.length === 1, `Valid email: exactly one INSERT occurs — got ${posts.length}`);
    assert(posts[0].body.email === 'maria@example.com' && !posts[0].body.phone, 'Payload correctly stores it as email, not phone');
    await page.close();
  }
  {
    console.log('--- valid international phone (+351 912 345 678) succeeds ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Maria');
    await page.fill('#enquiry-phone', '+351 912 345 678');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    const posts = requests.filter(r => r.method === 'POST');
    assert(posts.length === 1, `Valid international phone: exactly one INSERT occurs — got ${posts.length}`);
    assert(posts[0].body.phone === '+351 912 345 678' && !posts[0].body.email, 'Payload correctly stores it as phone, preserving the original entered value verbatim');
    await page.close();
  }
  {
    console.log('--- phone with parentheses/hyphens succeeds ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Maria');
    await page.fill('#enquiry-phone', '(21) 123-4567');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    const posts = requests.filter(r => r.method === 'POST');
    assert(posts.length === 1 && posts[0].body.phone === '(21) 123-4567', `Phone with parentheses/hyphens accepted and stored verbatim — got ${posts.length} posts`);
    await page.close();
  }
  {
    console.log('--- qualified and assisted submissions still succeed with valid name+contact ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: false, qualified: true, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Maria');
    await page.fill('#enquiry-email', 'maria@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    assert(requests.filter(r => r.method === 'POST').length === 1, 'Qualified submission with valid name+contact still succeeds (exactly one INSERT)');
    await page.close();
  }
  {
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: false, qualified: false, assisted: true })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Maria');
    await page.fill('#enquiry-email', 'maria@example.com');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    assert(requests.filter(r => r.method === 'POST').length === 1, 'Assisted submission with valid name+contact still succeeds (exactly one INSERT)');
    await page.close();
  }

  {
    console.log('--- BOTH email and phone provided together — the real gap this fix closes ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Maria');
    await page.fill('#enquiry-email', 'maria@example.com');
    await page.fill('#enquiry-phone', '+351 912 345 678');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(500);
    const posts = requests.filter(r => r.method === 'POST');
    assert(posts.length === 1, `Both fields filled: exactly one INSERT occurs — got ${posts.length}`);
    assert(posts[0].body.email === 'maria@example.com' && posts[0].body.phone === '+351 912 345 678', 'Payload carries BOTH email and phone — a visitor is never forced to pick just one field');
    await page.close();
  }
  {
    console.log('--- invalid email format rejected in the browser, not just at the unit level ---');
    const page = await browser.newPage();
    await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPropertyRow({ direct: true, qualified: false, assisted: false })) }));
    const requests = trackLeadsRoute(page);
    await page.goto(FILE_URL + '#/en/property/asset_apt_boavista');
    await page.waitForTimeout(500);
    await openModalOnPage(page);
    await page.fill('#enquiry-name', 'Maria');
    await page.fill('#enquiry-email', 'not-an-email');
    await page.click('#enquiry-send-btn');
    await page.waitForTimeout(400);
    assert(requests.filter(r => r.method === 'POST').length === 0, 'Malformed email in the real browser form: zero POST requests made');
    await page.close();
  }

  await browser.close();

  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
