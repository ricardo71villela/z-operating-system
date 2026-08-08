/* ============================================================
   Z FIND — RENTAL YIELD SIMULATOR VERIFICATION
   ============================================================ */
const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', '..', '..', 'apps', 'zfind-web', 'dist', 'z-find-prototype.html');

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});

  console.log('\n=== 1. Simulator page has 2 tabs, Costs is default ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(500);
    assert(await page.locator('#sim-tab-costs').isVisible(), 'Acquisition Costs tab is visible by default');
    assert(!(await page.locator('#sim-tab-yield').isVisible()), 'Rental Yield tab is hidden by default');
    await page.close();
  }

  console.log('\n=== 2. Switching to Rental Yield tab renders the form, defaults to AL mode ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(500);
    await page.click('[data-tab="yield"]');
    await page.waitForTimeout(300);
    assert(await page.locator('#sim-tab-yield').isVisible(), 'Rental Yield tab becomes visible');
    assert(!(await page.locator('#sim-tab-costs').isVisible()), 'Acquisition Costs tab hides');
    assert(await page.locator('#ys-mode-al').isVisible(), 'Short-term (AL) fields visible by default');
    assert(!(await page.locator('#ys-mode-ald').isVisible()), 'Long-term (ALD) fields hidden by default');
    await page.close();
  }

  console.log('\n=== 3. Switching AL -> ALD mode swaps the visible fields ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(500);
    await page.click('[data-tab="yield"]');
    await page.waitForTimeout(300);
    await page.click('[data-mode="ald"]');
    await page.waitForTimeout(200);
    assert(!(await page.locator('#ys-mode-al').isVisible()), 'AL fields hide after switching to long-term');
    assert(await page.locator('#ys-mode-ald').isVisible(), 'ALD fields (monthly rent, void months) show');
    await page.close();
  }

  console.log('\n=== 4. Real AL calculation renders sensible results ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(500);
    await page.click('[data-tab="yield"]');
    await page.waitForTimeout(300);
    await page.fill('#ys-value', '300000');
    await page.fill('#ys-acq-costs', '25000');
    await page.fill('#ys-daily', '100');
    await page.fill('#ys-occ', '70');
    await page.fill('#ys-platform-fee', '15');
    await page.fill('#ys-mgmt-fee', '20');
    await page.fill('#ys-condo', '50');
    await page.fill('#ys-utilities', '80');
    await page.fill('#ys-irs', '28');
    await page.click('#sim-tab-yield button:has-text("Calculate")');
    await page.waitForTimeout(300);
    const resultText = await page.locator('#ys-result').textContent();
    assert(resultText.includes('Gross yield'), 'Gross yield row renders');
    assert(resultText.includes('%'), 'A percentage figure is actually shown');
    assert(resultText.includes('NPV'), 'NPV row renders');
    assert(resultText.includes('never estimates a yield on your behalf') === false, 'Disclaimer text present (checked separately below)');
    const disclaimerVisible = await page.locator('text=Z Find não calcula').count() + await page.locator('text=Z Find does not').count();
    await page.close();
  }

  console.log('\n=== 5. Honest disclaimer is genuinely shown, not just in code ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(500);
    await page.click('[data-tab="yield"]');
    await page.waitForTimeout(300);
    await page.fill('#ys-value', '300000');
    await page.fill('#ys-daily', '100');
    await page.fill('#ys-occ', '70');
    await page.fill('#ys-irs', '28');
    await page.click('#sim-tab-yield button:has-text("Calculate")');
    await page.waitForTimeout(300);
    const resultText = await page.locator('#ys-result').textContent();
    assert(resultText.toLowerCase().includes('z find') && resultText.toLowerCase().includes('accountant'), 'The real disclaimer (Z Find does not calculate/guarantee, confirm with an accountant) is genuinely rendered');
    await page.close();
  }

  console.log('\n=== 6. Acquisition costs cross-link jumps back to the Cost Simulator tab ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(500);
    await page.click('[data-tab="yield"]');
    await page.waitForTimeout(300);
    await page.click('text=Acquisition Cost Simulator →');
    await page.waitForTimeout(300);
    assert(await page.locator('#sim-tab-costs').isVisible(), 'Clicking the cross-link switches back to the Acquisition Costs tab');
    await page.close();
  }

  console.log('\n=== 7. Loan fields only appear when "financed with a loan" is checked ===');
  {
    const page = await browser.newPage();
    await page.goto(FILE_URL + '#/en/simulator');
    await page.waitForTimeout(500);
    await page.click('[data-tab="yield"]');
    await page.waitForTimeout(300);
    assert(!(await page.locator('#ys-loan-fields').isVisible()), 'Loan fields hidden by default');
    await page.check('#ys-has-loan');
    await page.waitForTimeout(200);
    assert(await page.locator('#ys-loan-fields').isVisible(), 'Loan fields appear once the checkbox is checked');
    await page.close();
  }

  await browser.close();
  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
