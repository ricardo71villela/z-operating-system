/* Browser contract: the mortgage simulator (#/{lang}/simulator).
   A reference rate is prefilled only while its official publication is
   recent, always with its source and month; otherwise the visitor types
   the rate of their bank. The warnings are always on screen. */
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

async function open(page, base, hash) {
  await page.goto(`${base}/#/fr`);
  await page.waitForFunction(() => !!(window.ZFindServices && window.ZFindServices.creditSimulator), null, { timeout: 15000 });
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForSelector('[data-credit-form]', { timeout: 10000 });
}

const text = (page, sel) => page.$eval(sel, el => el.textContent.replace(/\s+/g, ' ').trim());
const mainNumber = async page => Number((await text(page, '[data-credit-main] strong')).replace(/[^\d]/g, ''));

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
}

(async () => {
  console.log('\n=== Z FIND MORTGAGE SIMULATOR (browser) ===');
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  try {
    // While the reference data is valid.
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-03T10:00:00Z'));
    await mock(page);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await open(page, base, '#/fr/simulator');
    check('nav says "Crédit"', (await page.textContent('.nav-btn[data-view="simulator"]')).trim() === 'Crédit');
    check('France: rate prefilled with the 25-year average', (await page.inputValue('[data-credit="ratePct"]')) === '3.35');
    const hint = await text(page, '[data-credit-rate-hint]');
    check('the rate shows its month and source', hint.includes('août 2026') && hint.includes('Crédit Logement') && hint.includes('dépendra de votre dossier'));
    const first = await mainNumber(page);
    check('capacity computed at once (no empty column)', first > 100000 && (await text(page, '[data-credit-result]')).includes('Prix de bien accessible'));
    check('warnings on screen: not an offer, consult a bank or broker, repayment', (await text(page, '[data-credit-warning]')).includes('ni une offre de prêt ni un conseil')
      && (await text(page, '[data-credit-warning]')).includes('courtier') && (await text(page, '[data-credit-result]')).includes('Un crédit vous engage'));
    await shot(page, 'credit-capacity-fr.png');

    await page.fill('[data-credit="income"]', '6000');
    check('capacity follows the income', (await mainNumber(page)) > first);

    await page.selectOption('[data-credit="years"]', '10');
    check('a duration without published average: rate emptied and the bank\'s rate asked',
      (await page.inputValue('[data-credit="ratePct"]')) === '' && (await text(page, '[data-credit-rate-hint]')).includes('saisissez le taux proposé par votre banque'));
    check('no rate, no figure: the result asks for one', !(await page.$('[data-credit-main]')) && (await text(page, '[data-credit-result]')).includes('Indiquez un taux'));
    await page.fill('[data-credit="ratePct"]', '3.9');
    check('own rate accepted and labelled as such', !!(await page.$('[data-credit-main]')) && (await text(page, '[data-credit-rate-hint]')).includes('Taux saisi par vous'));
    await page.selectOption('[data-credit="years"]', '20');
    check('an entered rate is kept when the duration changes', (await page.inputValue('[data-credit="ratePct"]')) === '3.9');
    await page.click('[data-credit-rate-reset]');
    check('one click goes back to the published average', (await page.inputValue('[data-credit="ratePct"]')) === '3.27' && (await text(page, '[data-credit-rate-hint]')).includes('août 2026'));

    // Payment mode, Belgium: no recent official average.
    await page.evaluate(() => { location.hash = '#/fr/simulator?market=BE&mode=payment&price=350000'; });
    await page.waitForSelector('.credit-page[data-market="BE"][data-mode="payment"]');
    check('Belgium: no rate prefilled, explains there is no recent official figure',
      (await page.inputValue('[data-credit="ratePct"]')) === '' && (await text(page, '[data-credit-rate-hint]')).includes('Pas de taux moyen officiel récent pour la Belgique'));
    check('price taken from the address', (await page.inputValue('[data-credit="price"]')) === '350000');
    await page.fill('[data-credit="ratePct"]', '3.4');
    check('without the region the purchase costs are not guessed', (await text(page, '[data-credit-result]')).includes('Choisissez la région'));
    await page.selectOption('[data-credit="region"]', 'WAL');
    const be = await text(page, '[data-credit-result]');
    check('with the region: costs, loan and monthly payment', be.includes('Frais d’achat estimés') && be.includes('Montant à emprunter') && (await mainNumber(page)) > 500);
    await page.fill('[data-credit="income"]', '4000');
    check('effort rate shown against the limit', (await text(page, '[data-credit-result]')).includes('Taux d’effort'));
    await shot(page, 'credit-payment-be.png');

    // English, Luxembourg.
    await page.evaluate(() => { location.hash = '#/en/simulator?market=LU'; });
    await page.waitForSelector('.credit-page[data-market="LU"]');
    check('Luxembourg (en): BCL fixed rate with its fixation band', (await page.inputValue('[data-credit="ratePct"]')) === '3.5'
      && (await text(page, '[data-credit-rate-hint]')).includes('over 20 up to 25 years') && (await text(page, '[data-credit-rate-hint]')).includes('BCL'));
    check('Luxembourg: notary fees flagged as not included', (await text(page, '[data-credit-result]')).includes('notary fees not included'));

    // Phone width.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { location.hash = '#/fr/simulator'; });
    await page.waitForSelector('.credit-page[data-market="FR"]');
    const layout = await page.evaluate(() => {
      const form = document.querySelector('[data-credit-form]').getBoundingClientRect();
      const result = document.querySelector('[data-credit-result]').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - window.innerWidth, formFirst: form.top < result.top };
    });
    check('phone: no horizontal scroll, form before result', layout.overflow <= 0 && layout.formFirst);
    await shot(page, 'credit-mobile.png');
    check('no script error', errors.length === 0);
    await context.close();

    // After the expiry date: never an old figure.
    const late = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const p2 = await late.newPage();
    await p2.clock.setFixedTime(new Date('2026-11-20T10:00:00Z'));
    await mock(p2);
    await open(p2, base, '#/fr/simulator');
    check('expired reference: rate field empty, explains why, no figure shown',
      (await p2.inputValue('[data-credit="ratePct"]')) === '' && (await text(p2, '[data-credit-rate-hint]')).includes('trop ancien')
      && !(await p2.$('[data-credit-main]')) && !(await text(p2, '[data-credit-warning]')).includes('août 2026'));
    await late.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nMORTGAGE SIMULATOR BROWSER: ${passed}/${passed} PASSED`);
})().catch(error => { console.error(error); process.exit(1); });
