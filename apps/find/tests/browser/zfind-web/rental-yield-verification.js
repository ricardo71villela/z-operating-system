/* Browser contract: the rental yield simulator (#/{lang}/yield), between
   "Crédit" and "Estimer" in the main navigation. No figure before the
   visitor's own price and rent; rules of each market on screen. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const WEB = path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web');
const HTML = path.join(WEB, 'dist', 'z-find-prototype.html');
const PUBLIC = path.join(WEB, 'public');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const SHOTS = process.env.ZFIND_SHOTS_DIR || '';

let passed = 0;
function check(label, value) {
  if (!value) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS:', label);
}

function startServer() {
  const html = fs.readFileSync(HTML);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/' || url === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html); }
    const file = path.join(PUBLIC, path.normalize(url).replace(/^([/\\])+/, ''));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function mock(page) {
  const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(/openstreetmap\.org/, route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }));
  await page.route('**/rest/v1/**', route => route.fulfill(json([])));
  await page.route('**/storage/v1/**', route => route.fulfill(json({})));
}

const text = (page, sel) => page.$eval(sel, el => el.textContent.replace(/\s+/g, ' ').trim());
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name), fullPage: true }); }

(async () => {
  console.log('\n=== Z FIND RENTAL YIELD (browser) ===');
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-03T10:00:00Z'));
    await mock(page);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`${base}/#/fr`);
    await page.waitForFunction(() => !!(window.ZFindServices && window.ZFindServices.rentalYield), null, { timeout: 15000 });
    const nav = await page.$$eval('.nav-links .nav-btn', b => b.map(x => x.textContent.trim()));
    check('nav: Crédit, Rentabilité, Estimer in that order', nav.indexOf('Rentabilité') === nav.indexOf('Crédit') + 1 && nav.indexOf('Estimer') === nav.indexOf('Rentabilité') + 1);
    await page.click('.nav-btn[data-view="yield"]');
    await page.waitForSelector('[data-yield-form]');
    check('nav button opens the page and is marked active', (await page.evaluate(() => location.hash)).startsWith('#/fr/yield') && await page.$eval('.nav-btn[data-view="yield"]', b => b.classList.contains('active')));
    check('before any figure: the method, no yield', (await text(page, '[data-yield-result]')).includes('Comment ça marche') && !(await page.$('[data-yield-gross]')));
    check('rules for France on screen (DPE calendar, taxation, warning)', (await text(page, '[data-yield-rules]')).includes('1er janvier 2028') && (await text(page, '[data-yield-rules]')).includes('micro-foncier')
      && (await text(page, '[data-yield-rules]')).includes('ni un conseil en investissement'));
    await shot(page, 'yield-empty.png');

    await page.fill('[data-ry="price"]', '200000');
    check('price alone: still asks for the rent', (await text(page, '[data-yield-result]')).includes('Indiquez le loyer'));
    await page.fill('[data-ry="rent"]', '800');
    await page.fill('[data-ry="propertyTax"]', '1000');
    await page.fill('[data-ry="coownership"]', '600');
    await page.fill('[data-ry="insurance"]', '150');
    await page.fill('[data-ry="maintenance"]', '400');
    check('gross yield 4,80 % (9 600 € ÷ 200 000 €)', (await text(page, '[data-yield-gross]')) === '4,80 %');
    const res = await text(page, '[data-yield-result]');
    check('costs, total cost, collected rent and charges listed', res.includes('Frais d’achat estimés') && res.includes('Coût total de l’opération') && res.includes('8 800 €') && res.includes('2 150 €'));
    check('cash flow before tax: 554 €/mois', (await text(page, '[data-yield-cashflow]')).replace(/\s/g, '') === '554€/mois' && res.includes('avant impôt'));

    await page.selectOption('[data-ry="dpe"]', 'G');
    check('DPE G: letting blocked since 2025', (await text(page, '[data-yield-result]')).includes('depuis le 1er janvier 2025'));
    await page.selectOption('[data-ry="dpe"]', 'C');

    await page.check('[data-ry="financed"]');
    check('financing: dated reference rate prefilled with its source', (await page.inputValue('[data-ry="rate"]')) === '3.27' && (await text(page, '[data-ry-rate-hint]')).includes('août 2026'));
    await page.fill('[data-ry="deposit"]', '20000');
    const fin = await text(page, '[data-yield-result]');
    check('financed: loan, payment, first-year interest, negative cash flow as monthly top-up', fin.includes('Montant emprunté') && fin.includes('Intérêts de la 1re année') && fin.includes('Effort d’épargne') && fin.includes('Un crédit vous engage'));
    await page.fill('[data-ry="incomeTax"]', '1200');
    check('tax entered: cash flow labelled "after your tax"', (await text(page, '[data-yield-result]')).includes('après votre impôt'));
    await shot(page, 'yield-fr-long.png');

    // Short-term, France.
    await page.click('.est-modes a:nth-child(2)');
    await page.waitForSelector('.yield-page[data-mode="short"]');
    check('short-term: price per night, occupancy, platform fields; rules on tourist lets', !!(await page.$('[data-ry="nightly"]')) && (await text(page, '[data-yield-rules]')).includes('120 jours'));
    await page.fill('[data-ry="price"]', '200000');
    await page.fill('[data-ry="nightly"]', '100');
    await page.fill('[data-ry="occupancy"]', '50');
    check('short-term gross yield 9,13 % (18 250 € ÷ 200 000 €)', (await text(page, '[data-yield-gross]')) === '9,13 %');

    // Luxembourg, English, rent ceiling.
    await page.evaluate(() => { location.hash = '#/en/yield?market=LU&mode=long&price=600000'; });
    await page.waitForSelector('.yield-page[data-market="LU"]');
    check('listing price taken from the address', (await page.inputValue('[data-ry="price"]')) === '600000');
    await page.fill('[data-ry="rent"]', '2700');
    check('LU: rent above the 5 % ceiling is flagged', (await text(page, '[data-yield-lu-cap]')).includes('above this ceiling'));
    check('LU rules: no Bëllegen Akt for letting', (await text(page, '[data-yield-rules]')).includes('Bëllegen Akt'));
    await shot(page, 'yield-lu.png');

    // Belgium: region required.
    await page.evaluate(() => { location.hash = '#/fr/yield?market=BE&mode=long'; });
    await page.waitForSelector('.yield-page[data-market="BE"]');
    await page.fill('[data-ry="price"]', '300000');
    await page.fill('[data-ry="rent"]', '1100');
    check('BE: without the region the costs are not guessed', (await text(page, '[data-yield-result]')).includes('Choisissez la région'));
    await page.selectOption('[data-ry="region"]', 'WAL');
    check('BE: Wallonia investment costs computed; cadastral-income rule shown', (await text(page, '[data-yield-result]')).includes('Frais d’achat estimés') && (await text(page, '[data-yield-rules]')).includes('revenu cadastral'));

    // Phone.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { location.hash = '#/fr/yield'; });
    await page.waitForSelector('.yield-page[data-market="FR"]');
    await page.fill('[data-ry="price"]', '200000');
    await page.fill('[data-ry="rent"]', '800');
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      formFirst: document.querySelector('[data-yield-form]').getBoundingClientRect().top < document.querySelector('[data-yield-result]').getBoundingClientRect().top
    }));
    check('phone: no horizontal scroll, form before result', layout.overflow <= 0 && layout.formFirst);
    await shot(page, 'yield-mobile.png');
    check('no script error', errors.length === 0);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nRENTAL YIELD BROWSER: ${passed}/${passed} PASSED`);
})().catch(error => { console.error(error); process.exit(1); });
