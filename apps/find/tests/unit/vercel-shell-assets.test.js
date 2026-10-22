// The Vercel output moves the SPA's inline CSS and JS into content-hashed,
// long-cached files (scripts/prepare-vercel-output.js). Checks the split is
// lossless, the hash changes with the content, and broken input stops the build.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { externalizeShellAssets } = require('../../apps/zfind-web/scripts/prepare-vercel-output.js');

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log('PASS:', name); }

const page = (css, js) => '<!DOCTYPE html><html><head><title>Z Find</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n<main id="app"><h1>Z</h1></main>\n<script>\n' + js + '\n</script>\n</body>\n</html>\n';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zfind-shell-'));

test('CSS and JS move to /assets/ files with their exact content', () => {
  const dir = tmp();
  const css = 'body{color:#111}';
  const js = 'window.ready = true;\nfunction navigate(){}';
  const out = externalizeShellAssets(page(css, js), dir);
  const cssUrl = out.match(/<link rel="stylesheet" href="(\/assets\/zfind\.[0-9a-f]{12}\.css)">/)[1];
  const jsUrl = out.match(/<script src="(\/assets\/zfind\.[0-9a-f]{12}\.js)"><\/script>/)[1];
  assert.strictEqual(fs.readFileSync(path.join(dir, cssUrl), 'utf8'), css);
  assert.strictEqual(fs.readFileSync(path.join(dir, jsUrl), 'utf8'), js);
  assert.ok(!out.includes('<style>') && !out.includes('window.ready'));
  assert.ok(out.includes('<main id="app"><h1>Z</h1></main>'), 'body markup kept');
  assert.ok(out.endsWith('</script>\n</body>\n</html>\n'));
});

test('new content gets a new file name (no stale cache after a deploy)', () => {
  const a = externalizeShellAssets(page('a{}', 'x=1'), tmp());
  const b = externalizeShellAssets(page('a{}', 'x=2'), tmp());
  const js = s => s.match(/zfind\.([0-9a-f]{12})\.js/)[1];
  const css = s => s.match(/zfind\.([0-9a-f]{12})\.css/)[1];
  assert.notStrictEqual(js(a), js(b));
  assert.strictEqual(css(a), css(b));
});

test('a page without the expected blocks stops the build', () => {
  assert.throws(() => externalizeShellAssets('<html><head></head><body></body></html>', tmp()), /BUILD FAILED/);
  assert.throws(() => externalizeShellAssets(page('a{}', 'x=1').replace('\n</script>\n</body>', '\n</script><p></p>\n</body>'), tmp()), /BUILD FAILED/);
});

test('vercel.json caches /assets/ for a year and never caches the service worker', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../../apps/zfind-web/vercel.json'), 'utf8'));
  const header = src => (vercel.headers.find(h => h.source === src) || { headers: [] }).headers.find(h => h.key === 'Cache-Control');
  assert.match(header('/assets/(.*)').value, /max-age=31536000, immutable/);
  assert.strictEqual(header('/sw.js').value, 'no-cache');
});

console.log(`\nVERCEL SHELL ASSETS: ${passed}/4 PASSED`);
