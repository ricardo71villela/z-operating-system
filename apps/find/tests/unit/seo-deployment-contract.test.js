/* ============================================================
   Z FIND — SEO DEPLOYMENT + SIX-LANGUAGE INDEXING CONTRACT
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const seo = require('../../apps/zfind-web/scripts/generate-seo-pages.js');
const generator = require('../../apps/zfind-web/src/services/seo-page-generator.js');

const ROOT = path.resolve(__dirname, '../..');
let pass = 0;
let fail = 0;

function assert(condition, label) {
  if (condition) { pass++; console.log('  ✅', label); }
  else { fail++; console.log('  ❌', label); }
}

console.log('\n=== 1. robots.txt contract ===');
const robots = seo.buildRobotsTxt('https://zfind.online');
assert(robots.includes('User-agent: *'), 'robots applies to all crawlers');
assert(robots.includes('Allow: /'), 'robots allows public crawling');
assert(robots.includes('Sitemap: https://zfind.online/sitemap.xml'), 'robots references the real canonical sitemap');

console.log('\n=== 2. sitemap contract — zero inventory remains valid ===');
const emptySitemap = seo.buildSitemapXml('https://zfind.online', []);
assert(emptySitemap.includes('<loc>https://zfind.online/</loc>'), 'zero-inventory sitemap still contains canonical site root');
assert(emptySitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), 'sitemap uses official namespace');

console.log('\n=== 3. sitemap published-page URLs ===');
const populated = seo.buildSitemapXml('https://zfind.online/', [
  'https://zfind.online/en/property/p1',
  'https://zfind.online/en/property/p1',
  'https://zfind.online/pt/zone/z1?x=1&y=2'
]);
assert((populated.match(/https:\/\/zfind\.online\/en\/property\/p1/g) || []).length === 1, 'duplicate canonical URLs are emitted once');
assert(populated.includes('https://zfind.online/pt/zone/z1?x=1&amp;y=2'), 'XML-sensitive URL characters are escaped');

console.log('\n=== 4. exact six-language editorial indexing — no false fallback ===');
const rows = [
  { locale:'fr', title:'Appartement à Porto', description:'Description française réelle.' },
  { locale:'en', title:'Apartment in Porto', description:'Real English description.' },
  { locale:'es', title:'Apartamento en Oporto', description:'Descripción española real.' },
  { locale:'de', title:'Wohnung in Porto', description:'' }
];
assert(seo.contentForPublicLocale(rows, 'es').title === 'Apartamento en Oporto', 'Spanish uses exact Spanish content');
assert(seo.contentForPublicLocale(rows, 'it') === null, 'Italian never falls back to English when missing');
assert(seo.contentForPublicLocale([{ locale:'pt-PT', title:'Imóvel', description:'Descrição' }], 'pt').title === 'Imóvel', 'public /pt/ maps to persisted pt-PT');
assert(JSON.stringify(seo.genuineEditorialLocales(rows)) === JSON.stringify(['fr','en','es']), 'only locales with genuine title + description are indexable');

const esOnlyHtml = generator.buildListingPage({
  kind:'property', baseUrl:'https://zfind.online', locale:'es', availableLocales:['fr','en','es'], id:'p1',
  title:'Apartamento en Oporto', description:'Descripción española real.', priceValue:500000, currencyIso:'EUR', priceIsFrom:false,
  zoneLabel:'Foz', cityLabel:'Porto', countryIsoCode:'PT', imageUrl:null
});
assert(esOnlyHtml.includes('hreflang="es"'), 'genuine Spanish alternate is emitted');
assert(!esOnlyHtml.includes('hreflang="de"') && !esOnlyHtml.includes('hreflang="it"'), 'missing German/Italian editorial content is not advertised as hreflang');
assert(esOnlyHtml.includes('hreflang="x-default" href="https://zfind.online/fr/property/p1"'), 'x-default prefers genuine French when available');

console.log('\n=== 5. six-language structural SEO copy ===');
assert(JSON.stringify(generator.LOCALES) === JSON.stringify(['fr','en','pt','es','de','it']), 'generic SEO renderer owns exact six public locales');
const deZone = generator.buildZonePage({ baseUrl:'https://zfind.online', locale:'de', zoneId:'z1', zoneName:'Boavista', cityName:'Porto', countryIsoCode:'PT', listingCount:2, avgPrice:0, currencyIso:'EUR', sampleListings:[] });
const itZone = generator.buildZonePage({ baseUrl:'https://zfind.online', locale:'it', zoneId:'z1', zoneName:'Boavista', cityName:'Porto', countryIsoCode:'PT', listingCount:2, avgPrice:0, currencyIso:'EUR', sampleListings:[] });
assert(deZone.includes('Immobilien | Z Find') && deZone.includes('ergänzt derzeit aktiv'), 'German zone SEO is genuinely localized');
assert(itZone.includes('Immobiliare | Z Find') && itZone.includes('sta aggiungendo attivamente'), 'Italian zone SEO is genuinely localized');

console.log('\n=== 6. deterministic 24-market × 6-language SEO floor ===');
const marketEntries = seo.buildMarketSeoEntries('https://zfind.online');
assert(marketEntries.length === 144, '24 markets × 6 locales produce exactly 144 deterministic market pages');
for (const locale of ['fr','en','pt','es','de','it']) {
  assert(marketEntries.filter(entry => entry.locale === locale).length === 24, `${locale}: 24 market pages`);
}
assert(marketEntries.every(entry => entry.html.includes('hreflang="x-default"')), 'every market page has x-default');
assert(marketEntries.every(entry => ['fr','en','pt','es','de','it'].every(locale => entry.html.includes(`hreflang="${locale}"`))), 'every market page has complete six-way hreflang');

console.log('\n=== 7. Vercel deployment is fail-fast ===');
const vercelPath = path.join(ROOT, 'apps/zfind-web/vercel.json');
const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
assert(vercel.cleanUrls === true, 'clean URLs remain enabled');
assert(vercel.outputDirectory === 'vercel-output', 'Vercel output directory remains explicit');
assert(vercel.installCommand === 'cd ../../../.. && npm ci --workspace=apps/find', 'Vercel installs only Z Find workspace from monorepo root');

const monorepoRoot = path.resolve(ROOT, '../..');
const monorepoPackage = JSON.parse(fs.readFileSync(path.join(monorepoRoot, 'package.json'), 'utf8'));
const findPackage = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const monorepoLock = JSON.parse(fs.readFileSync(path.join(monorepoRoot, 'package-lock.json'), 'utf8'));
assert(monorepoPackage.workspaces.includes('apps/find'), 'root npm workspace explicitly owns apps/find');
assert(!!findPackage.dependencies['@supabase/supabase-js'], 'Z Find declares Supabase build dependency');
assert(!!monorepoLock.packages['node_modules/@supabase/supabase-js'], 'root lockfile contains required Supabase dependency');
assert(vercel.buildCommand.includes('generate-seo-pages.js'), 'deployment build invokes SEO generation');
assert(!vercel.buildCommand.includes('|| true'), 'deployment cannot swallow SEO generation failure');

console.log('\n=== 8. Vercel output assembler requires indexing artifacts ===');
const prepareSource = fs.readFileSync(path.join(ROOT, 'apps/zfind-web/scripts/prepare-vercel-output.js'), 'utf8');
assert(prepareSource.includes("'robots.txt'") && prepareSource.includes("'sitemap.xml'"), 'output assembler requires robots.txt and sitemap.xml');
assert(prepareSource.includes('copyRecursive(') && prepareSource.includes('seoSrc'), 'output assembler copies generated SEO tree into deployment root');

console.log('\n=== 9. explicit SEO generation refuses missing public data config ===');
const generatorScript = path.join(ROOT, 'apps/zfind-web/scripts/generate-seo-pages.js');
const childEnv = { ...process.env };
delete childEnv.SUPABASE_URL;
delete childEnv.SUPABASE_ANON_KEY;
delete childEnv.SITE_BASE_URL;
const result = spawnSync(process.execPath, [generatorScript], { env: childEnv, encoding:'utf8' });
const diagnostic = String(result.stdout || '') + String(result.stderr || '');
assert(result.status !== 0, 'explicit SEO generation fails when required config is absent');
assert(diagnostic.includes('SUPABASE_URL') && diagnostic.includes('SUPABASE_ANON_KEY'), 'failure clearly names missing public configuration');

console.log('\n============================================================');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('============================================================');
if (fail > 0) process.exitCode = 1;
