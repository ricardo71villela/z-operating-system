#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS = path.join(ROOT, 'src', 'ux', 'app-theme-light-polish-v1.css');
const INDEX = path.join(ROOT, 'app', 'index.html');
const LEGACY = path.join(ROOT, 'app', 'my-studio.html');
const NATIVE = path.join(ROOT, 'native', 'www', 'index.html');
const MARKER = 'ZSTUDIO_APP_THEME_LIGHT_POLISH_V1';

function fail(message) {
  console.error('FAIL:', message);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const css = fs.readFileSync(CSS, 'utf8');
const index = fs.readFileSync(INDEX, 'utf8');
const legacy = fs.readFileSync(LEGACY, 'utf8');
const native = fs.readFileSync(NATIVE, 'utf8');

assert((css.match(new RegExp(MARKER, 'g')) || []).length === 1, 'light polish marker must exist exactly once in source CSS');
assert(!css.includes('data-zstudio-app-theme="dark"'), 'light polish must not target dark theme');
assert(!css.includes('state.bg'), 'light polish must not touch post background state');
assert(!css.includes('draw('), 'light polish must not touch renderer');

for (const selector of [
  '.zs-assistant-empty-icon',
  '.zs-assistant-empty-kicker',
  '.zs-assistant-empty-title',
  '.zs-assistant-empty-body',
  '#zsAssistantWrite',
  '.site-footer',
]) {
  assert(css.includes('html[data-zstudio-app-theme="light"] ' + selector), 'missing light-only selector ' + selector);
}

assert(css.includes('color:#26292B !important;'), 'caption empty title contrast authority missing');
assert(css.includes('color:#666B6E !important;'), 'caption secondary/body contrast authority missing');
assert(css.includes('#F4F3EF !important;'), 'light footer background authority missing');

for (const [label, html] of [['index', index], ['legacy', legacy], ['native', native]]) {
  assert((html.match(new RegExp(MARKER, 'g')) || []).length === 1, label + ' artifact must contain polish marker exactly once');
  assert(html.includes('.zs-assistant-empty-title'), label + ' artifact missing caption title polish');
  assert(html.includes('#zsAssistantWrite'), label + ' artifact missing manual caption polish');
  assert(html.includes('html[data-zstudio-app-theme="light"] .site-footer'), label + ' artifact missing light footer polish');
}

assert(index === legacy, 'web index and compatibility artifact diverged');
assert(index === native, 'web and native artifacts diverged');

console.log('Z_STUDIO_LIGHT_CAPTION_CONTRAST=PASS');
console.log('Z_STUDIO_LIGHT_FOOTER_CONSISTENCY=PASS');
console.log('Z_STUDIO_LIGHT_POLISH_POST_BG_INDEPENDENCE=PASS');
console.log('Z_STUDIO_LIGHT_POLISH_CONTRACT=PASS');
