#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FIND_ROOT = path.resolve(__dirname, '../..');
const WEB_ROOT = path.join(FIND_ROOT, 'apps/zfind-web');
const ADMIN_ROOT = path.join(FIND_ROOT, 'apps/zfind-admin');
const PARTNER_ROOT = path.join(FIND_ROOT, 'apps/zfind-partner');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function headerValue(config, key) {
  for (const rule of config.headers || []) {
    for (const header of rule.headers || []) {
      if (String(header.key).toLowerCase() === key.toLowerCase()) {
        return String(header.value || '');
      }
    }
  }
  return null;
}

function verifyPrivateSurface(name, root, ownPath) {
  const config = readJson(path.join(root, 'vercel.json'));
  assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json', `${name}: Vercel schema missing`);
  assert.match(config.ignoreCommand || '', /git cat-file -e/, `${name}: missing shallow-clone guard`);
  assert.match(config.ignoreCommand || '', new RegExp(ownPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${name}: own source path missing from ignore contract`);
  assert.match(config.ignoreCommand || '', /apps\/find\/apps\/zfind-web\/src\/\*\*/, `${name}: shared Web source missing from ignore contract`);
  assert.equal(config.installCommand, 'cd ../../../.. && npm ci --workspace=apps/find', `${name}: monorepo install authority mismatch`);
  assert.equal(config.outputDirectory, 'vercel-output', `${name}: output directory mismatch`);
  const robots = headerValue(config, 'X-Robots-Tag');
  assert.ok(robots && /noindex/i.test(robots), `${name}: private surface must be noindex`);
  assert.equal(headerValue(config, 'X-Frame-Options'), 'DENY', `${name}: frame protection missing`);
  return config;
}

const adminConfig = verifyPrivateSurface('Admin', ADMIN_ROOT, 'apps/find/apps/zfind-admin/**');
const partnerConfig = verifyPrivateSurface('Partner', PARTNER_ROOT, 'apps/find/apps/zfind-partner/**');
assert.match(adminConfig.buildCommand, /zfind-admin\/scripts\/build\.js/, 'Admin: build command mismatch');
assert.match(partnerConfig.buildCommand, /zfind-partner\/scripts\/build\.js/, 'Partner: build command mismatch');

const webConfig = readJson(path.join(WEB_ROOT, 'vercel.json'));
assert.equal(webConfig.build.env.SITE_BASE_URL, 'https://zfind.online', 'Web: canonical production domain mismatch');
assert.match(webConfig.buildCommand, /generate-seo-pages\.js/, 'Web: SEO generation must run during deployment build');
assert.match(webConfig.ignoreCommand || '', /git cat-file -e/, 'Web: shallow-clone guard missing');
assert.ok(!/noindex/i.test(headerValue(webConfig, 'X-Robots-Tag') || ''), 'Web: public surface must not be source-configured noindex');

const publicLocales = require(path.join(WEB_ROOT, 'src/services/public-locales.js'));
const marketRegistry = require(path.join(WEB_ROOT, 'src/services/market-registry.js'));
const seoDeployment = require(path.join(WEB_ROOT, 'scripts/generate-seo-pages.js'));
const seoGenerator = require(path.join(WEB_ROOT, 'src/services/seo-page-generator.js'));

const expectedLocales = ['fr', 'en', 'pt', 'es', 'de', 'it'];
assert.deepEqual(publicLocales.PUBLIC_LOCALES, expectedLocales, 'Public locale authority must remain 6/6');
assert.deepEqual(publicLocales.TRANSLATED_PUBLIC_LOCALES, expectedLocales, 'Translated public locale authority must remain 6/6');
assert.deepEqual(publicLocales.LEGACY_TRANSLATED_LOCALES, expectedLocales, 'Compatibility locale export must follow the complete 6/6 authority');
assert.equal(publicLocales.DEFAULT_PUBLIC_LOCALE, 'fr', 'French must remain the public default locale');
assert.deepEqual(seoGenerator.LOCALES, expectedLocales, 'Generic SEO presentation must remain 6/6');

// Editorial listings are allowed to expose only genuinely authored
// locales, even though the structural SEO renderer supports all six.
const editorialRows = [
  { locale:'fr', title:'Titre FR', description:'Description FR' },
  { locale:'en', title:'Title EN', description:'Description EN' }
];
assert.deepEqual(
  seoDeployment.genuineEditorialLocales(editorialRows),
  ['fr', 'en'],
  'Listing indexing must remain limited to genuine localized editorial content'
);
assert.equal(
  seoDeployment.contentForPublicLocale(editorialRows, 'es'),
  null,
  'Missing Spanish content must never fall back to English'
);

const markets = marketRegistry.listMarkets();
assert.equal(markets.length, 24, 'Market registry must contain exactly 24 launch markets');

const baseUrl = 'https://zfind.online';
const entries = seoDeployment.buildMarketSeoEntries(baseUrl);
assert.equal(entries.length, 24 * 6, 'Market SEO matrix must be 24 markets x 6 locales');

const canonicalUrls = new Set();
for (const entry of entries) {
  assert.ok(expectedLocales.includes(entry.locale), `Unexpected market locale: ${entry.locale}`);
  assert.equal(entry.canonicalUrl, baseUrl + entry.publicPath, 'Canonical URL/path mismatch');
  assert.ok(!canonicalUrls.has(entry.canonicalUrl), `Duplicate market canonical: ${entry.canonicalUrl}`);
  canonicalUrls.add(entry.canonicalUrl);

  assert.match(entry.html, new RegExp(`<html lang="${entry.locale}">`), 'HTML lang mismatch');
  assert.ok(entry.html.includes(`<link rel="canonical" href="${entry.canonicalUrl}">`), `Missing canonical: ${entry.canonicalUrl}`);
  for (const locale of expectedLocales) {
    assert.ok(entry.html.includes(`hreflang="${locale}"`), `${entry.canonicalUrl}: missing hreflang ${locale}`);
  }
  assert.ok(entry.html.includes('hreflang="x-default"'), `${entry.canonicalUrl}: missing x-default`);
  assert.ok(!/name="robots"[^>]*noindex/i.test(entry.html), `${entry.canonicalUrl}: market page must remain indexable`);
}

assert.equal(canonicalUrls.size, 144, 'Market canonical set must contain 144 unique URLs');

const sitemap = seoDeployment.buildSitemapXml(baseUrl, canonicalUrls);
assert.equal((sitemap.match(/<url><loc>/g) || []).length, 145, 'Minimum production sitemap must contain root + 144 market URLs');
for (const url of canonicalUrls) {
  assert.ok(sitemap.includes(`<loc>${url}</loc>`), `Sitemap missing ${url}`);
}

const robots = seoDeployment.buildRobotsTxt(baseUrl);
assert.ok(robots.includes('User-agent: *\nAllow: /'), 'robots.txt must allow the public site');
assert.ok(robots.includes(`Sitemap: ${baseUrl}/sitemap.xml`), 'robots.txt sitemap authority mismatch');

console.log('Z_FIND_RELEASE_SURFACE_AUTHORITY=PASS');
console.log(`Z_FIND_MARKETS=${markets.length}`);
console.log(`Z_FIND_PUBLIC_LOCALES=${expectedLocales.length}`);
console.log(`Z_FIND_TRANSLATED_PUBLIC_LOCALES=${expectedLocales.length}`);
console.log(`Z_FIND_MARKET_SEO_PAGES=${entries.length}`);
console.log('Z_FIND_EDITORIAL_LOCALE_FALLBACK=FORBIDDEN');
console.log('Z_FIND_MINIMUM_SITEMAP_URLS=145');
console.log('Z_FIND_ADMIN_NOINDEX=PASS');
console.log('Z_FIND_PARTNER_NOINDEX=PASS');
