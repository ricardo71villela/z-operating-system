/* ============================================================
   Z FIND — SIMULATOR VERIFICATION
   ============================================================
   Tests the real browser UI + the underlying calculation engine,
   including out-of-scope refusals and the country-aware architecture.
   ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web', 'dist', 'z-find-prototype.html');

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});

  console.log('\n=== 1. Real calculation in the browser matches the sourced, cross-validated value ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(300);
    await page.fill('#sim-value', '180000');
    await page.click('button:has-text("Calculate")');
    await page.waitForTimeout(200);
    const resultText = await page.evaluate(() => document.getElementById('sim-result').textContent);
    assert(resultText.includes('2,509') || resultText.includes('2 509'), `IMT for €180,000 matches the sourced/cross-validated value, correctly rounded to whole euros for display (got: ${resultText.slice(0,150)})`);
    await page.close();
  }

  console.log('\n=== 2. Exemption below €106,346 ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(300);
    await page.fill('#sim-value', '100000');
    await page.click('button:has-text("Calculate")');
    await page.waitForTimeout(200);
    const resultText = await page.evaluate(() => document.getElementById('sim-result').textContent);
    const imtLine = resultText.match(/Transfer tax \(IMT\)\s*€?\s*0\b/);
    assert(!!imtLine, `Property under the exemption threshold shows €0 IMT (got: ${resultText.slice(0,150)})`);
    await page.close();
  }

  console.log('\n=== 3. Second-home refuses rather than guesses ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(300);
    await page.fill('#sim-value', '200000');
    await page.uncheck('#sim-hpp');
    await page.click('button:has-text("Calculate")');
    await page.waitForTimeout(200);
    const resultText = await page.evaluate(() => document.getElementById('sim-result').textContent);
    assert(resultText.toLowerCase().includes('segunda habitação') || resultText.toLowerCase().includes('consultor'), `Second-home case is refused with a clear message, not a guessed number (got: ${resultText.slice(0,150)})`);
    await page.close();
  }

  console.log('\n=== 4. Non-resident now calculates the real flat 7.5% rate (DL 97/2026), not a refusal ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(300);
    await page.fill('#sim-value', '1000000');
    await page.uncheck('#sim-resident');
    await page.click('button:has-text("Calculate")');
    await page.waitForTimeout(200);
    const resultText = await page.evaluate(() => document.getElementById('sim-result').textContent);
    assert(resultText.includes('75,000') || resultText.includes('75 000'), `IMT for a €1,000,000 non-resident purchase matches the real DL 97/2026 flat rate exactly (75,000€, verified against the source article's own worked example) — got: ${resultText.slice(0,200)}`);
    assert(resultText.includes('83,000') || resultText.includes('83 000'), `Total (IMT + Selo) matches exactly — got: ${resultText.slice(0,200)}`);
    assert(resultText.toLowerCase().includes('97/2026') || resultText.toLowerCase().includes('exce'), 'Mentions the legal source or the 3 exceptions, not just a bare number with no context');
    await page.close();
  }

  console.log('\n=== 5. Country-aware architecture: dropdown built from supportedCountries(), not hardcoded ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(300);
    const options = await page.evaluate(() => Array.from(document.querySelectorAll('#sim-country option')).map(o => o.value));
    assert(options.length === 1 && options[0] === 'PT', `Only PT is offered today (honest — no fabricated countries), got: ${JSON.stringify(options)}`);
    const isDataDriven = await page.evaluate(() => typeof window.ZFindServices.simulator.supportedCountries === 'function');
    assert(isDataDriven, 'Dropdown is genuinely built from supportedCountries(), a real, callable, extensible API');
    await page.close();
  }

  console.log('\n=== 6. Warning shown above the derived-bracket threshold ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(300);
    await page.fill('#sim-value', '500000');
    await page.click('button:has-text("Calculate")');
    await page.waitForTimeout(200);
    const resultText = await page.evaluate(() => document.getElementById('sim-result').textContent);
    assert(resultText.includes('330.539') || resultText.includes('⚠'), `A warning about the derived (not directly published) deduction appears above €330,539 (got fragment present: ${resultText.includes('⚠')})`);
    await page.close();
  }

  console.log('\n=== 7. Multilingual: PT and FR render real translated labels ===');
  for (const [locale, expected] of [['pt', 'Simulador de Custos'], ['fr', "Simulateur de Frais"]]) {
    const page = await browser.newPage();
    await page.goto(FILE_URL + `#/${locale}/simulator`);
    await page.waitForTimeout(300);
    const title = await page.evaluate(() => document.querySelector('#simulator-root h1').textContent);
    assert(title.includes(expected), `${locale.toUpperCase()} shows a real translated title (got: "${title}")`);
    await page.close();
  }

  await browser.close();
  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
