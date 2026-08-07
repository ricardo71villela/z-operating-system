/* ============================================================
   Z FIND — SPRINT 1.1 VERIFICATION
   ============================================================
   Proves the Supabase services layer is correctly loaded and usable
   inside the browser build — a capability the existing 15-scenario
   browser_test.js suite does not exercise at all (it only tests the
   pre-existing db.js-based UI, which is not yet wired to these
   services — that begins in Sprint 1.2).

   Run: node tests/browser/zfind-web/sprint-1-1-verification.js
   ============================================================ */

const { chromium } = require('playwright');
const path = require('path');

async function run() {
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text()); });

  // Sprint 1.2 wired the Home page to real Supabase calls — mock them
  // here so this test stays focused on verifying module loading/
  // registration, not polluted by network noise unrelated to its
  // actual purpose (see sprint-1-2-verification.js for Home's own
  // dedicated, thorough network-mocked tests).
  await page.route('**/rest/v1/properties**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/developments**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/searches**', route => route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));

  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

  try {
    const fileUrl = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web', 'dist', 'z-find-prototype.html');
    await page.goto(fileUrl);
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const out = {};
      out.hasSupabaseGlobal = typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function';
      out.hasConfig = typeof window.__ZFIND_CONFIG__ === 'object' && !!window.__ZFIND_CONFIG__.supabaseUrl && !!window.__ZFIND_CONFIG__.supabaseAnonKey;
      out.configUrlLooksReal = window.__ZFIND_CONFIG__ && window.__ZFIND_CONFIG__.supabaseUrl.startsWith('https://') && !window.__ZFIND_CONFIG__.supabaseUrl.includes('__SUPABASE_URL__');
      out.hasZFindServices = typeof window.ZFindServices === 'object';
      out.services = window.ZFindServices ? Object.keys(window.ZFindServices) : [];

      try {
        const client = window.ZFindServices.supabaseClient.getSupabaseClient();
        out.clientConstructed = !!client && typeof client.from === 'function';
      } catch (e) {
        out.clientConstructed = false;
        out.clientError = e.message;
      }

      out.propertiesExports = window.ZFindServices.properties ? Object.keys(window.ZFindServices.properties) : [];
      out.developmentsExports = window.ZFindServices.developments ? Object.keys(window.ZFindServices.developments) : [];
      out.searchExports = window.ZFindServices.search ? Object.keys(window.ZFindServices.search) : [];
      out.authExports = window.ZFindServices.auth ? Object.keys(window.ZFindServices.auth) : [];

      return out;
    });

    assert(result.hasSupabaseGlobal, 'window.supabase.createClient is available (vendor SDK loaded)');
    assert(result.hasConfig, 'window.__ZFIND_CONFIG__ is populated');
    assert(result.configUrlLooksReal, 'Injected config contains a real URL, not a leftover placeholder');
    assert(result.hasZFindServices, 'window.ZFindServices namespace exists');
    assert(result.services.includes('supabaseClient'), 'ZFindServices.supabaseClient registered');
    assert(result.services.includes('properties'), 'ZFindServices.properties registered');
    assert(result.services.includes('developments'), 'ZFindServices.developments registered');
    assert(result.services.includes('search'), 'ZFindServices.search registered');
    assert(result.services.includes('auth'), 'ZFindServices.auth registered');
    assert(result.clientConstructed, 'getSupabaseClient() successfully constructs a client in the browser' + (result.clientError ? ` (error: ${result.clientError})` : ''));
    assert(JSON.stringify(result.propertiesExports) === JSON.stringify(['getPropertyById', 'listPublishedByZone']), 'properties exports match exactly, unchanged from Node');
    assert(JSON.stringify(result.developmentsExports.sort()) === JSON.stringify(['getDevelopmentById', 'listPublished', 'listUnitsForDevelopment'].sort()), 'developments exports match exactly (3 functions, including Sprint 1.2\'s listPublished), unchanged from Node');
    assert(JSON.stringify(result.searchExports) === JSON.stringify(['search', 'logSearch']), 'search exports match exactly, unchanged from Node');
    assert(JSON.stringify(result.authExports) === JSON.stringify(['signIn', 'signOut', 'getSession', 'getCurrentProfile']), 'auth exports match exactly, unchanged from Node');

    assert(consoleErrors.filter(e => !e.includes('403')).length === 0, 'Zero unexpected console/page errors (only the known sandbox 403 for Google Fonts, if any)');

  } finally {
    await browser.close();
  }

  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
