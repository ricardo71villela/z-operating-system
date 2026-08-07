#!/usr/bin/env node
/* ============================================================
   Z FIND — SUPABASE STAGING SMOKE TEST (real network, no mocks)
   ============================================================
   Unlike sprint-1-2-verification.js (which intentionally mocks every
   Supabase call to test app logic in isolation), this test makes a
   REAL network request to the real staging project, served over a
   REAL local HTTP server (never file://, which gives a null origin
   and does not represent the deployed application).

   Skip semantics are intentionally narrow (hardened after the CORS
   root-cause investigation): this test exits 0/SKIPPED ONLY when it
   detects the exact sandbox-proxy signature (an x-deny-reason
   response header) that investigation proved was the real cause of
   the earlier false CORS report, or when ALLOW_NETWORK_SKIP=true is
   explicitly set. Every other failure — DNS, TLS, timeout, connection
   refusal, or an ordinary HTTP/auth error from a real environment —
   is a genuine test FAILURE, not a skip.

   Run: node -r dotenv/config tests/browser/zfind-web/staging-smoke-test.js
   Requires: SUPABASE_URL, SUPABASE_ANON_KEY
   Optional: PLAYWRIGHT_CHROME_PATH (explicit browser override),
             ALLOW_NETWORK_SKIP=true (unconditional skip override)
   ============================================================ */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

/* ---------------- 1. Local static server (never file://) ---------------- */
function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const filePath = path.join(rootDir, reqPath === '/' ? '/z-find-prototype.html' : reqPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(filePath);
        const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server)); // port 0 = OS-assigned free port
  });
}

/* ---------------- 2. Environment validation (fail clearly, don't guess) ---------------- */
function validateEnv() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  if (missing.length) {
    console.error(`FAILED: missing required environment variable(s): ${missing.join(', ')}.`);
    console.error('Set them via .env (loaded automatically with `node -r dotenv/config`) or export them directly.');
    process.exit(1);
  }
  const key = process.env.SUPABASE_ANON_KEY;
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('SUPABASE_ANON_KEY:', key.slice(0, 14) + '...' + key.slice(-4), `(${key.length} chars, redacted)`);
}

/* ---------------- 3. Browser resolution (macOS 12 support) ---------------- */
async function launchBrowser() {
  if (process.env.PLAYWRIGHT_CHROME_PATH) {
    try {
      const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROME_PATH });
      console.log('Browser: PLAYWRIGHT_CHROME_PATH ->', process.env.PLAYWRIGHT_CHROME_PATH);
      return b;
    } catch (e) {
      throw new Error(`FAILED: PLAYWRIGHT_CHROME_PATH="${process.env.PLAYWRIGHT_CHROME_PATH}" was set but launch failed: ${e.message}`);
    }
  }
  try {
    const b = await chromium.launch({ channel: 'chrome' });
    console.log('Browser: installed Google Chrome (channel "chrome")');
    return b;
  } catch (e) {
    // fall through — bundled Chromium is unavailable on macOS 12; this
    // is expected there, not an error, hence no log noise here.
  }
  try {
    const b = await chromium.launch();
    console.log('Browser: bundled Playwright Chromium');
    return b;
  } catch (e) {
    throw new Error(
      'FAILED: no usable browser found. Tried, in order: PLAYWRIGHT_CHROME_PATH (not set), ' +
      'installed Google Chrome via channel "chrome", and bundled Playwright Chromium. ' +
      'On macOS 12, install Google Chrome and let this test find it automatically, ' +
      'or set PLAYWRIGHT_CHROME_PATH to a working Chromium/Chrome executable path.'
    );
  }
}

/* ---------------- 4. Connectivity probe with narrow skip semantics ---------------- */
function probeConnectivity(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      res.resume();
      resolve({ ok: true, status: res.statusCode, denyReason: res.headers['x-deny-reason'] || null });
    });
    req.on('error', (err) => resolve({ ok: false, code: err.code, message: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, code: 'ETIMEDOUT', message: 'Request timed out after 8s' }); });
  });
}

async function run() {
  validateEnv();
  const supabaseUrl = process.env.SUPABASE_URL;

  if (process.env.ALLOW_NETWORK_SKIP === 'true') {
    console.log('SKIPPED: ALLOW_NETWORK_SKIP=true is explicitly set.');
    process.exit(0);
  }

  console.log('Probing raw connectivity to', supabaseUrl, '...');
  const probe = await probeConnectivity(supabaseUrl);

  if (probe.ok && probe.denyReason) {
    console.log(`SKIPPED: sandbox network egress proxy detected (x-deny-reason: ${probe.denyReason}). This is the exact signature the CORS root-cause investigation identified — not a genuine result, so not a failure either.`);
    process.exit(0);
  }
  if (!probe.ok) {
    console.error(`FAILED: cannot reach ${supabaseUrl} — ${probe.code || ''} ${probe.message}`.trim());
    console.error('This is a genuine connectivity failure (DNS/TLS/timeout/refused), not the known sandbox proxy signature — treated as a real failure.');
    process.exit(1);
  }
  console.log('Connectivity probe: reachable, HTTP', probe.status, '(no sandbox-proxy signature — proceeding to real browser test)');

  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

  let server = null;
  let browser = null;

  try {
    const distDir = path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web', 'dist');
    server = await startStaticServer(distDir);
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/z-find-prototype.html`;
    console.log('Serving', distDir, 'at', url);

    browser = await launchBrowser();
    const page = await browser.newPage();

    const supabaseResponses = [];
    const consoleErrors = [];
    page.on('response', res => {
      if (res.url().includes('/rest/v1/')) supabaseResponses.push({ url: res.url(), status: res.status() });
    });
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

    await page.goto(url);
    await page.waitForTimeout(3000);

    const pageProtocol = await page.evaluate(() => location.protocol);
    assert(pageProtocol === 'http:' || pageProtocol === 'https:', `Page served over ${pageProtocol} — never file://`);

    assert(supabaseResponses.length > 0, `At least one request reached /rest/v1/ (got ${supabaseResponses.length})`);

    supabaseResponses.forEach(r => {
      assert(typeof r.status === 'number' && r.status > 0, `Response for ${r.url.split('?')[0]} has a real HTTP status (${r.status})`);
      assert(![401, 403].includes(r.status) && r.status < 500, `Response for ${r.url.split('?')[0]} is not 401/403/5xx (got ${r.status})`);
    });

    const homeState = await page.evaluate(() => ({
      statusVisible: document.getElementById('home-status').style.display !== 'none',
      statusTitle: document.getElementById('home-status-title').textContent,
      gridsVisible: document.getElementById('home-grids-wrap').style.display !== 'none',
    }));
    const isErrorState = homeState.statusVisible && /could not|não foi possível|impossible/i.test(homeState.statusTitle);
    const isValidDataState = homeState.gridsVisible && !homeState.statusVisible;
    const isValidEmptyState = homeState.statusVisible && !isErrorState;

    assert(!isErrorState, `Homepage is NOT showing the error state (shown: "${homeState.statusTitle || '(grids visible)'}"))`);
    assert(isValidDataState || isValidEmptyState, 'Homepage reached either the valid data state or the valid empty state');

    const supabaseRelatedErrors = consoleErrors.filter(e => /supabase|cors|fetch|network/i.test(e));
    assert(supabaseRelatedErrors.length === 0, `No console error relates to Supabase, CORS, fetch, or network (found ${supabaseRelatedErrors.length}: ${JSON.stringify(supabaseRelatedErrors)})`);

  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve));
  }

  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
