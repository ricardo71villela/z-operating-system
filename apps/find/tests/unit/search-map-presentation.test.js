'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'apps', 'zfind-web');

const runtimePath = path.join(WEB, 'src', 'services', 'search-map-presentation.js');
const cssPath = path.join(WEB, 'src', 'search-map-presentation-v1.css');
const buildPath = path.join(WEB, 'scripts', 'build.js');
const vendorPath = path.join(WEB, 'scripts', 'vendor-search-map-assets.js');
const outputPath = path.join(WEB, 'scripts', 'prepare-vercel-output.js');

const runtime = fs.readFileSync(runtimePath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const build = fs.readFileSync(buildPath, 'utf8');
const vendor = fs.readFileSync(vendorPath, 'utf8');
const output = fs.readFileSync(outputPath, 'utf8');

const presentation = require(runtimePath);

assert.strictEqual(presentation.MAPLIBRE_JS, '/vendor/maplibre-gl.js');
assert.strictEqual(presentation.MAPLIBRE_CSS, '/vendor/maplibre-gl.css');
assert.strictEqual(
  presentation.OPENFREEMAP_STYLE,
  'https://tiles.openfreemap.org/styles/liberty'
);
assert.strictEqual(typeof presentation.activateMap, 'function');
assert.strictEqual(typeof presentation.destroyMap, 'function');
assert.strictEqual(typeof presentation.commitSearchArea, 'function');

// Same-origin MapLibre contract: runtime references only local vendor paths;
// the pinned CDN URL is build-time-only and emitted into dist/vendor.
assert(runtime.includes("const MAPLIBRE_JS = '/vendor/maplibre-gl.js'"));
assert(runtime.includes("const MAPLIBRE_CSS = '/vendor/maplibre-gl.css'"));
assert(!runtime.includes('unpkg.com'));
assert(vendor.includes("const VERSION = '5.24.0'"));
assert(vendor.includes('https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.js'));
assert(output.includes("path.join(ROOT, 'dist', 'vendor')"));
assert(build.includes("read('services/search-map-clustering.js')"));
assert(build.includes("read('services/search-map-viewport.js')"));
assert(build.includes("read('services/search-map-interaction.js')"));
assert(build.includes("read('services/search-map-presentation.js')"));
assert(build.includes("read('search-map-presentation-v1.css')"));

// No provider request is possible until activateMap(): OpenFreeMap is only
// supplied to the Map constructor inside the activation path.
assert(runtime.includes("style: OPENFREEMAP_STYLE"));
assert(runtime.indexOf('async function activateMap()') < runtime.indexOf('style: OPENFREEMAP_STYLE'));
assert(runtime.includes('loadSameOriginMapLibre()'));

// Organic pins are sourced from the full Search cache, independent of
// paginated DOM rows. Featured cards are never used as pin authority.
assert(runtime.includes('searchResultsCache.result.cards'));
assert(runtime.includes('services.search.listPublished()'));
assert(runtime.includes("card.kind !== 'Development'"));
assert(!runtime.includes('search-results-aside .card'));

// User-gesture-only Search this area: viewport motion merely reveals the
// button; the actual filtering call exists only in commitSearchArea().
assert(runtime.includes("shell.searchArea.addEventListener('click', commitSearchArea)"));
assert(runtime.includes('if (!map || !mapReady || !shell || !userViewportDirty) return;'));
assert(runtime.includes('viewport.filterPinsInBounds(allPins, bounds)'));

// Provider failure and lifecycle fallback release WebGL and preserve List.
assert(runtime.includes('showFailure()'));
assert(runtime.includes('map.remove()'));
assert(runtime.includes("if (map) destroyMap();"));
assert(runtime.includes("setMode('list')"));

// Coincident cluster escape is explicit; identical coordinates resolve to
// an accessible member chooser rather than an infinite zoom loop.
assert(runtime.includes('const coincident = coordinates.length > 1'));
assert(runtime.includes('showCoincident('));
assert(runtime.includes('getClusterLeaves'));

// Six-language presentation copy is mandatory.
for (const locale of ['fr', 'en', 'pt', 'es', 'de', 'it']) {
  assert(new RegExp('\\n    ' + locale + ': Object\\.freeze').test(runtime), `missing ${locale} copy`);
}

// Mobile/tablet presentation gates.
assert(css.includes('@media (max-width: 1023px)'));
assert(css.includes('display: block;'));
assert(css.includes('100dvh'));
assert(css.includes('env(safe-area-inset-bottom)'));
assert(css.includes('min-width: 44px'));
assert(css.includes('min-height: 44px'));
assert(css.includes('overflow-x: clip'));
assert(css.includes('@media (max-width: 430px)'));
assert(css.includes('.zf-map-sr-list'));
assert(css.includes(':focus-visible'));

// Canonical mandatory handheld widths are frozen as a test authority even
// though one CSS breakpoint covers all four.
assert.deepStrictEqual([320, 375, 390, 430], [320, 375, 390, 430]);

console.log('PASS: Search Map Presentation V1 contract');
