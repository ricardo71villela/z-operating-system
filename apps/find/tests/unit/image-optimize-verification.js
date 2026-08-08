/* ============================================================
   Z FIND — IMAGE OPTIMIZATION VERIFICATION
   ============================================================
   Runs the actual optimizeImage() function in a real browser context
   (createImageBitmap/Canvas aren't available in Node) against real
   generated test images, not mocked/faked results.
   ============================================================ */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  let pass = 0, fail = 0;
  function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }
  const browser = await chromium.launch(process.env.LOCAL_SANDBOX_CHROMIUM_PATH ? { executablePath: process.env.LOCAL_SANDBOX_CHROMIUM_PATH } : {});
  const page = await browser.newPage();

  // A blank page is enough — we only need the browser's real Canvas/
  // createImageBitmap APIs, not any app UI.
  await page.goto('about:blank');
  await page.addScriptTag({ path: path.resolve(__dirname, '..', '..', 'apps', 'zfind-web', 'src', 'services', 'image-optimize.js') });

  const largeImageBase64 = fs.readFileSync('/tmp/large-test.jpg').toString('base64');
  const smallImageBase64 = fs.readFileSync('/tmp/small-test.jpg').toString('base64');

  console.log('\n=== 1. Large image (4000x3000, 188KB) gets resized and recompressed ===');
  const largeResult = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const file = new File([bytes], 'large-test.jpg', { type: 'image/jpeg' });
    const result = await window.ZFindServices.imageOptimize.optimizeImage(file);
    return { width: result.width, height: result.height, skipped: result.skipped, outputSize: result.blob.size, inputSize: file.size };
  }, largeImageBase64);
  assert(!largeResult.skipped, 'Large image is NOT skipped — actually processed');
  assert(largeResult.width <= 2400 && largeResult.height <= 2400, `Resized to within the 2400px max dimension — got ${largeResult.width}x${largeResult.height}`);
  assert(Math.max(largeResult.width, largeResult.height) === 2400, 'Long edge scaled to exactly the max dimension (aspect ratio preserved, not distorted)');
  const expectedRatio = 4000 / 3000;
  const actualRatio = largeResult.width / largeResult.height;
  assert(Math.abs(actualRatio - expectedRatio) < 0.01, `Aspect ratio preserved — expected ~${expectedRatio.toFixed(3)}, got ${actualRatio.toFixed(3)}`);

  console.log('\n=== 2. Small, already-JPEG image is skipped — never degrades an already-small file ===');
  const smallResult = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const file = new File([bytes], 'small-test.jpg', { type: 'image/jpeg' });
    const result = await window.ZFindServices.imageOptimize.optimizeImage(file);
    return { width: result.width, height: result.height, skipped: result.skipped, outputSize: result.blob.size };
  }, smallImageBase64);
  assert(smallResult.skipped, 'Small (200x150, ~1KB) JPEG is skipped, not needlessly re-encoded');
  assert(smallResult.width === 200 && smallResult.height === 150, 'Real dimensions still reported even when skipped — width/height is never left null just because optimization was skipped');

  console.log('\n=== 3. Non-image file passes through untouched, never blocks the upload ===');
  const nonImageResult = await page.evaluate(async () => {
    const file = new File(['not an image'], 'document.pdf', { type: 'application/pdf' });
    const result = await window.ZFindServices.imageOptimize.optimizeImage(file);
    return { skipped: result.skipped, width: result.width };
  });
  assert(nonImageResult.skipped, 'Non-image file (PDF) is skipped, never crashes or blocks');
  assert(nonImageResult.width === null, 'Width stays null for a non-image — correctly honest, not a fabricated 0');

  console.log('\n=== 4. Optimized output is genuinely smaller than the original, not just resized-but-still-huge ===');
  assert(largeResult.outputSize < largeResult.inputSize, `Optimized file is smaller — ${largeResult.inputSize} bytes -> ${largeResult.outputSize} bytes`);
  const reductionPercent = Math.round((1 - largeResult.outputSize / largeResult.inputSize) * 100);
  console.log(`     (${reductionPercent}% smaller)`);

  await browser.close();
  console.log('\n============================================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  if (fail > 0) process.exit(1);
}

run();
