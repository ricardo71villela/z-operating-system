'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

const app = fs.readFileSync(
  path.join(root, 'apps/zfind-web/src/app.js'),
  'utf8'
);

const css = fs.readFileSync(
  path.join(root, 'apps/zfind-web/src/css_block.txt'),
  'utf8'
);

let passed = 0;

function check(condition, label) {
  assert.ok(condition, label);
  passed += 1;
  console.log('✅', label);
}

check(
  /function\s+initMobilePrimaryNavigation\s*\(\s*\)/.test(app),
  'Public app defines mobile primary navigation'
);

check(
  /const\s+desktopNav\s*=\s*document\.querySelector\(\s*['"]\.nav-links['"]\s*\)/.test(app),
  'Desktop navigation remains the mobile source of truth'
);

check(
  /desktopNav\s*\.querySelectorAll\(\s*['"]button,\s*a['"]\s*\)/s.test(app),
  'Mobile destinations derive from existing desktop navigation'
);

check(
  /original\.click\(\)/.test(app),
  'Mobile destinations delegate to existing desktop route handlers'
);

check(
  /aria-expanded['"],\s*['"]false/.test(app) &&
  /aria-controls['"],\s*['"]mobile-primary-nav/.test(app),
  'Toggle exposes accessible expanded/control state'
);

check(
  /event\.key\s*===\s*['"]Escape['"]/.test(app),
  'Escape closes the mobile navigation'
);

check(
  /initMobilePrimaryNavigation\(\);/.test(app),
  'Mobile navigation initializes on DOMContentLoaded'
);

check(
  css.includes('.mobile-primary-nav') &&
  css.includes('.menu-toggle') &&
  css.includes('.mobile-primary-menu') &&
  css.includes('.mobile-primary-menu-item'),
  'Dedicated mobile navigation styling exists'
);

check(
  /@media\s*\(\s*max-width\s*:\s*900px\s*\)/.test(css),
  'Mobile menu uses the existing 900px responsive boundary'
);

check(
  /@media\s*\(\s*min-width\s*:\s*901px\s*\)/.test(css),
  'Mobile navigation is explicitly suppressed above the breakpoint'
);

console.log(
  `✅ public mobile navigation contract PASSED (${passed}/10)`
);
