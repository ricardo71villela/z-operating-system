const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'polished.html'),'utf8');
const launch=fs.readFileSync(path.join(root,'launch.html'),'utf8');
const css=fs.readFileSync(path.join(root,'polish.css'),'utf8');
const js=fs.readFileSync(path.join(root,'polish.js'),'utf8');
const launchJs=fs.readFileSync(path.join(root,'launch-i18n.js'),'utf8');
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));

for(const marker of ['polish.css','polish.js','accountDrawer','mobile-dock','catalog-toolbar','searchSuggestions','partnerFulfilment']) assert.ok(html.includes(marker),`missing polish marker: ${marker}`);
for(const marker of ['safe-area-inset-bottom','mobile-dock',':focus-visible','account-content','detail-polish']) assert.ok(css.includes(marker),`missing polish CSS: ${marker}`);
for(const marker of ['Z_FASHION_FINAL_POLISH','openAccount','syncMobileCounts','sortMode','baseOpenProduct','baseAddCart','baseRenderCart','baseRenderWishlist']) assert.ok(js.includes(marker),`missing polish behavior: ${marker}`);
for(const locale of ['pt','en','fr','es','it','de']) assert.ok(js.includes(`${locale}:{`)||js.includes(`${locale}: {`),`missing polish locale: ${locale}`);
assert.ok(html.includes('noindex,nofollow'),'polished preview must remain noindex');
assert.ok(html.includes('sem pagamentos live'),'payment boundary must remain explicit');

assert.ok(launch.includes('<html lang="fr-FR" data-locale="fr">'),'launch document must be French by default');
assert.ok(launch.includes("localStorage.setItem('zfashion_locale','fr')"),'first visit must seed French as default');
assert.ok(launch.includes('id="localeSelect"'),'launch must expose user language selector');
for(const locale of ['fr','pt','en','es','it','de']) assert.ok(launch.includes(`<option value="${locale}">`),`launch selector missing locale: ${locale}`);
assert.ok(launch.includes('launch-i18n.js'),'launch multilingual runtime missing');
assert.ok(launch.includes('Une marque de l’écosystème ZOS'),'French ZOS footer endorsement missing');
assert.ok(!launch.includes('<div class="footer-zos"><img'),'institutional footer must not show a ZOS logo');
assert.ok(!launch.includes('Z OPERATING SYSTEM'),'full system name must not be customer-facing launch copy');
assert.ok(launch.includes('width:2.2rem;height:2.2rem'),'header logo must not be visually smaller than Fashion initial');
assert.ok(launch.includes('width:2.45rem;height:2.45rem'),'footer product logo must retain sufficient visual weight');

for(const locale of ['fr','pt','en','es','it','de']) {
  assert.ok(launchJs.includes(`${locale}:{`)||launchJs.includes(`${locale}: {`),`launch runtime missing locale: ${locale}`);
}
for(const marker of [
  "const defaultLocale='fr'",
  "localStorage.getItem('zfashion_locale')",
  'Z_FASHION_MARKET_INDEPENDENT_LANGUAGE=true',
  "Z_FASHION_MULTILINGUAL_LAUNCH='PASS'",
  'productsByLocale',
  'badgeCopy',
  'applyProductLocale'
]) assert.ok(launchJs.includes(marker),`multilingual launch marker missing: ${marker}`);
for(const marker of ['Structured wool blazer','Blazer estructurado de lana','Blazer strutturato in lana','Strukturierter Wollblazer','Blazer structuré en laine']) assert.ok(launchJs.includes(marker),`localized product copy missing: ${marker}`);
for(const forbidden of ['navigator.language','navigator.geolocation','countryCode','geoip']) assert.ok(!launchJs.includes(forbidden),`language must not be market/geolocation driven: ${forbidden}`);

assert.ok(Array.isArray(vercel.rewrites),'root launch rewrite missing');
assert.ok(vercel.rewrites.some(r=>r.source==='/'&&r.destination==='/launch.html'),'root must serve French-default multilingual launch shell');

console.log('Z_FASHION_FINAL_POLISH_CONTRACT=PASS');
console.log('Z_FASHION_MULTILINGUAL_LAUNCH_CONTRACT=PASS');
