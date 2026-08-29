const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'customer-shell.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'zos-ecosystem-footer.css'), 'utf8');

const expectedApps = ['Z Studio', 'Z Find', 'Z Desk', 'Z Jobs', 'Z Mobility'];
const forbiddenCurrentApp = 'data-zos-app="fashion"';

for (const document of [homepage, shell]) {
  assert.ok(document.includes('zos-ecosystem-footer.css'), 'ecosystem footer stylesheet must be loaded');
  assert.ok(document.includes('class="zfashion-zos-ecosystem-footer"'), 'ecosystem footer row must be present');
  assert.ok(document.includes('aria-label="ZOS ecosystem"'), 'ecosystem footer must expose an accessible label');
  assert.ok(!document.includes(forbiddenCurrentApp), 'current Z Fashion app must not list itself as a sibling app');

  let lastIndex = -1;
  for (const app of expectedApps) {
    const index = document.indexOf(app);
    assert.ok(index > lastIndex, `ecosystem app order invalid or missing: ${app}`);
    lastIndex = index;
  }
}

for (const key of ['studio', 'find', 'desk', 'jobs', 'mobility']) {
  assert.ok(homepage.includes(`data-zos-app="${key}"`), `homepage missing ecosystem key: ${key}`);
  assert.ok(shell.includes(`data-zos-app="${key}"`), `customer shell missing ecosystem key: ${key}`);
}

assert.ok(!homepage.includes('data-zos-app="studio" href='), 'canonical app links must remain unset until validated');
assert.ok(!shell.includes('data-zos-app="studio" href='), 'canonical app links must remain unset until validated');
assert.ok(css.includes('grid-column: 1 / -1'), 'ecosystem row must span the full footer width');
assert.ok(css.includes('@media (max-width: 980px)'), 'tablet/mobile alignment contract missing');
assert.ok(css.includes('@media (max-width: 680px)'), 'mobile wrapping contract missing');

console.log('Z_FASHION_ZOS_ECOSYSTEM_FOOTER=PASS');
