/* ============================================================
   Z FIND — DAILY PRODUCTION MONITOR

   Opens the live site (https://zfind.online, or ZFIND_MONITOR_URL) the way
   a visitor does and fails loudly when something a visitor would notice is
   broken: a page that does not render or freezes, a missing data file, a
   sitemap URL that is not 200, test listings on screen.

   Run by .github/workflows/zfind-production-monitor.yml every morning; a
   failure makes GitHub e-mail the repository owner. Screenshots of every
   step are written to ZFIND_MONITOR_OUT (uploaded as a workflow artifact).
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = (process.env.ZFIND_MONITOR_URL || 'https://zfind.online').replace(/\/+$/, '');
const OUT = process.env.ZFIND_MONITOR_OUT || path.join(process.cwd(), 'zfind-monitor');
const STEP_TIMEOUT = 20000;
const MAX_SITEMAP_URLS = 200;

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
}

// A frozen tab never answers: evaluate with a hard deadline.
async function responsive(page, ms = 5000) {
  return Promise.race([
    page.evaluate(() => 1 + 1).then(v => v === 2).catch(() => false),
    new Promise(resolve => setTimeout(() => resolve(false), ms))
  ]);
}

async function step(page, name, fn) {
  try {
    await fn();
  } catch (error) {
    record(name, false, String(error && error.message || error).split('\n')[0]);
  }
  try {
    await page.screenshot({ path: path.join(OUT, name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png'), timeout: 5000 });
  } catch (_) { /* a frozen page cannot be captured; the step already failed */ }
}

async function visibleText(page) {
  return page.evaluate(() => document.body.innerText).catch(() => '');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await step(page, 'home', async () => {
    await page.goto(`${BASE}/#/fr`, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT });
    await page.waitForSelector('#home-markets-root .hm-card', { timeout: STEP_TIMEOUT });
    const cards = await page.locator('#home-markets-root .hm-card').count();
    record('home shows the three markets', cards === 3, `${cards} market cards`);
    const text = await visibleText(page);
    record('home shows no test listing', !/\[\s*(test|qa)\b/i.test(text));
    record('home shows no untranslated key', !/\bhome\.[a-z]+[A-Z]\w*\b/.test(text));
  });

  await step(page, 'data-files', async () => {
    for (const file of ['/geo/summary.json', '/geo/fr/index.json', '/market-data/fr/index.json', '/robots.txt']) {
      const response = await page.request.get(BASE + file, { timeout: STEP_TIMEOUT });
      record(`${file} is served`, response.status() === 200, `HTTP ${response.status()}`);
    }
  });

  await step(page, 'search', async () => {
    await page.goto(`${BASE}/#/fr`, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT });
    await page.evaluate(() => { location.hash = '#/fr/search?market=FR&transactionType=sale'; });
    await page.waitForTimeout(6000);
    const alive = await responsive(page, 8000);
    record('search page stays responsive', alive);
    if (!alive) return;
    // The results title is written only once the database answered.
    const state = await page.evaluate(() => ({
      title: ((document.getElementById('search-results-title') || {}).textContent || '').trim(),
      cards: document.querySelectorAll('#search-grid [data-search-result-asset-id]').length,
      message: ((document.getElementById('search-empty-title') || {}).textContent || '').trim()
    }));
    record('search loads listings from the database', !!state.title && (state.cards > 0 || !!state.message),
      state.title ? `${state.title} · ${state.cards} cards on the page` : `no results title${state.message ? ' — ' + state.message : ''}`);
    const text = await visibleText(page);
    record('search shows no test listing', !/\[\s*(test|qa)\b/i.test(text));
  });

  await step(page, 'market', async () => {
    await page.goto(`${BASE}/#/fr/market/FR?div=84`, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT });
    await page.waitForSelector('#market-divisions-root [data-md-crumbs] button', { timeout: STEP_TIMEOUT });
    const crumbs = await page.locator('#market-divisions-root [data-md-crumbs] button').count();
    record('market page opens a region from its link', crumbs >= 1, `${crumbs} breadcrumb levels`);
    record('market page stays responsive', await responsive(page));
  });

  await step(page, 'estimation', async () => {
    await page.goto(`${BASE}/#/fr`, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT });
    const hasEstimation = await page.locator('[data-view="estimation"]').count();
    if (!hasEstimation) { record('estimation page (not published yet)', true, 'skipped'); return; }
    await page.goto(`${BASE}/#/fr/estimation`, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT });
    await page.waitForSelector('#view-estimation form, .est-page form', { timeout: STEP_TIMEOUT });
    record('estimation form renders', true);
  });

  // Mortgage simulator: an expired reference rate is hidden on the site,
  // but the figures must be refreshed (apps/zfind-web/src/services/credit-rates.js).
  await step(page, 'credit-rates', async () => {
    await page.goto(`${BASE}/#/fr/simulator`, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT });
    await page.waitForFunction(() => !!(window.ZFindServices && window.ZFindServices.estimation), null, { timeout: STEP_TIMEOUT });
    const status = await page.evaluate(() => window.ZFindServices.creditRates ? window.ZFindServices.creditRates.status(new Date()) : null);
    if (!status) { record('mortgage reference rates (not published yet)', true, 'skipped'); return; }
    for (const s of status.filter(x => x.hasRates)) {
      record(`mortgage reference rate ${s.market} is recent`, s.fresh,
        s.fresh ? `${s.period}, valid ${s.daysLeft} more days` : `${s.period} expired on ${s.staleAfter} — update src/services/credit-rates.js`);
    }
    await page.waitForSelector('[data-credit-form]', { timeout: STEP_TIMEOUT });
    record('mortgage simulator renders', true);
  });

  await step(page, 'sitemap', async () => {
    const response = await page.request.get(`${BASE}/sitemap.xml`, { timeout: STEP_TIMEOUT });
    record('sitemap.xml is served', response.status() === 200, `HTTP ${response.status()}`);
    if (response.status() !== 200) return;
    const urls = Array.from((await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)).map(m => m[1].trim());
    const sample = urls.slice(0, MAX_SITEMAP_URLS);
    const broken = [];
    for (const url of sample) {
      const target = url.replace(/^https:\/\/zfind\.online/, BASE);
      const check = await page.request.get(target, { timeout: STEP_TIMEOUT, maxRedirects: 3 }).catch(e => ({ status: () => String(e.message).slice(0, 40) }));
      if (check.status() !== 200) broken.push(`${url} (${check.status()})`);
    }
    record(`every sitemap URL answers 200 (${sample.length} checked)`, broken.length === 0, broken.slice(0, 10).join(', '));
    const pages = sample.filter(u => /\/(zone|property|development)\//.test(u));
    const testPages = [];
    for (const url of pages.slice(0, 40)) {
      const body = await (await page.request.get(url.replace(/^https:\/\/zfind\.online/, BASE))).text();
      if (/\[\s*(TEST|QA)\b/i.test(body)) testPages.push(url);
    }
    record('generated pages show no test listing', testPages.length === 0, testPages.join(', '));
  });

  record('no JavaScript errors on the pages', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  await browser.close();

  const failed = results.filter(r => !r.ok);
  const summary = [`Z Find production monitor — ${BASE} — ${new Date().toISOString()}`, '']
    .concat(results.map(r => `${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`))
    .join('\n');
  fs.writeFileSync(path.join(OUT, 'summary.md'), summary + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.replace(/\n/g, '\n\n') + '\n');
  console.log(`\nZ FIND PRODUCTION MONITOR: ${results.length - failed.length}/${results.length} PASSED`);
  process.exit(failed.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
