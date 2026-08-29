const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const launch = fs.readFileSync(path.join(root, 'launch.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'customer-shell.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'zos-ecosystem-footer.css'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

const expectedApps = ['Z Studio', 'Z Find', 'Z Desk', 'Z Jobs', 'Z Mobility'];
const forbiddenCurrentApp = 'data-zos-app="fashion"';

for (const [surface, document] of [
  ['index', homepage],
  ['launch', launch],
  ['customer shell', shell],
]) {
  assert.ok(document.includes('zos-ecosystem-footer.css'), `${surface} must load ecosystem footer stylesheet`);
  assert.ok(document.includes('class="zfashion-zos-ecosystem-footer"'), `${surface} must contain ecosystem footer row`);
  assert.ok(document.includes('aria-label="ZOS ecosystem"'), `${surface} ecosystem footer must expose an accessible label`);
  assert.ok(!document.includes(forbiddenCurrentApp), `${surface} must not list current Z Fashion app as a sibling`);

  let lastIndex = -1;
  for (const app of expectedApps) {
    const index = document.indexOf(app);
    assert.ok(index > lastIndex, `${surface} ecosystem app order invalid or missing: ${app}`);
    lastIndex = index;
  }

  for (const key of ['studio', 'find', 'desk', 'jobs', 'mobility']) {
    assert.ok(document.includes(`data-zos-app="${key}"`), `${surface} missing ecosystem key: ${key}`);
  }

  assert.ok(!document.includes('data-zos-app="studio" href='), `${surface} canonical app links must remain unset until validated`);
}

assert.match(vercel.buildCommand, /cp launch\.html public\/index\.html/, 'Vercel public root must continue to derive from launch.html');
assert.ok(
  vercel.rewrites.some((rule) => rule.source === '/' && rule.destination === '/launch.html'),
  'Vercel root rewrite must continue to target launch.html',
);
assert.ok(css.includes('grid-column: 1 / -1'), 'ecosystem row must span the full footer width');
assert.ok(css.includes('@media (max-width: 980px)'), 'tablet/mobile alignment contract missing');
assert.ok(css.includes('@media (max-width: 680px)'), 'mobile wrapping contract missing');

console.log('Z_FASHION_ZOS_ECOSYSTEM_FOOTER=PASS');
console.log('Z_FASHION_PUBLIC_ROOT_FOOTER_AUTHORITY=PASS');
