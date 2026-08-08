/* ============================================================
   Z FIND — SEO PAGE GENERATOR VERIFICATION
   ============================================================
   Tests the pure generator function directly (no browser, no
   network) — this is the part with all the real SEO-correctness
   logic, deliberately separated from data-fetching so it can be
   tested this way.
   ============================================================ */

const gen = require('../../apps/zfind-web/src/services/seo-page-generator.js');

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

console.log('\n=== 1. Refuses to generate without a real SITE_BASE_URL ===');
try {
  gen.buildListingPage({ kind: 'property', baseUrl: null, locale: 'en', id: 'x', title: 'Test' });
  assert(false, 'Should have thrown without a real baseUrl');
} catch (e) {
  assert(e.message.includes('SITE_BASE_URL'), 'Throws a clear error naming the missing requirement, never generates a guessed canonical');
}
try {
  gen.buildListingPage({ kind: 'property', baseUrl: 'not-a-url', locale: 'en', id: 'x', title: 'Test' });
  assert(false, 'Should have thrown for a malformed baseUrl');
} catch (e) {
  assert(true, 'Also refuses a malformed (non-http) baseUrl, not just a missing one');
}

console.log('\n=== 2. Property page: real canonical, hreflang, JSON-LD, price ===');
{
  const html = gen.buildListingPage({
    kind: 'property', baseUrl: 'https://zfind.pt', locale: 'en', id: 'asset_apt_boavista',
    title: 'Renovated Duplex in Boavista', description: 'A beautifully renovated duplex apartment in the heart of Boavista, close to Casa da Musica.',
    priceValue: 620000, currencyIso: 'EUR', priceIsFrom: false,
    zoneLabel: 'Boavista', cityLabel: 'Porto', countryIsoCode: 'PT',
    imageUrl: 'https://x.supabase.co/storage/v1/object/sign/listing-media/boavista.jpg?token=abc', imageAlt: 'Living room',
  });
  assert(html.includes('https://zfind.pt/en/property/asset_apt_boavista'), 'Real canonical URL present');
  assert(html.includes('hreflang="pt"') && html.includes('hreflang="fr"') && html.includes('hreflang="x-default"'), 'All three locales plus x-default present in hreflang');
  assert(html.includes('"@type":"RealEstateListing"'), 'JSON-LD RealEstateListing present');
  assert(html.includes('"@type":"BreadcrumbList"'), 'JSON-LD BreadcrumbList present');
  assert(html.includes('boavista.jpg?token=abc'), 'og:image uses the real, resolved signed URL passed in, not a placeholder');
  assert(html.includes('"price":620000'), 'Real price value present in JSON-LD, not fabricated');
  assert(html.includes('<html lang="en">'), 'Correct lang attribute for the requested locale');
}

console.log('\n=== 3. Development page: price_is_from reflected honestly as minPrice, no fabricated image ===');
{
  const html = gen.buildListingPage({
    kind: 'development', baseUrl: 'https://zfind.pt', locale: 'en', id: 'asset_dev_rionorte',
    title: 'Rio Norte Development', description: 'A new construction project in Matosinhos.',
    priceValue: 340000, currencyIso: 'EUR', priceIsFrom: true,
    zoneLabel: 'Matosinhos Sul', cityLabel: 'Matosinhos', countryIsoCode: 'PT',
    imageUrl: null, imageAlt: null,
  });
  assert(html.includes('"minPrice":340000'), 'price_is_from correctly produces a minPrice specification, not a flat (misleading) price claim');
  assert(!html.includes('og:image'), 'No og:image tag emitted when there is genuinely no image — never fabricates one');
}

console.log('\n=== 4. Zone page: honest about thin inventory, never a misleading small-sample average ===');
{
  const thin = gen.buildZonePage({ baseUrl: 'https://zfind.pt', locale: 'en', zoneId: 'z1', zoneName: 'Cedofeita', cityName: 'Porto', countryIsoCode: 'PT', listingCount: 2, avgPrice: 400000, currencyIso: 'EUR', sampleListings: [] });
  assert(!thin.includes('Average price'), 'Does not show an average price computed from only 2 listings');
  assert(thin.includes('actively adding'), 'Shows an honest, non-statistical alternative instead');

  const rich = gen.buildZonePage({ baseUrl: 'https://zfind.pt', locale: 'en', zoneId: 'z1', zoneName: 'Boavista', cityName: 'Porto', countryIsoCode: 'PT', listingCount: 12, avgPrice: 455000, currencyIso: 'EUR', sampleListings: [{ kind: 'property', id: 'p1', title: 'Apt in Boavista' }] });
  assert(rich.includes('455,000') || rich.includes('455000'), 'Shows the real average price once there is enough real inventory (>= MIN_LISTINGS_FOR_STATS)');
  assert(rich.includes('"@type":"CollectionPage"'), 'JSON-LD CollectionPage present for zone pages');
  assert(gen.MIN_LISTINGS_FOR_STATS === 5, 'The stats threshold is a named, inspectable constant, not a magic number buried in logic');
}

console.log('\n=== 5. Meta description: real content, cleanly truncated, never padded ===');
{
  const longDesc = gen.buildMetaDescription('Este é um texto de descrição muito longo que ultrapassa claramente o limite recomendado de cento e cinquenta e cinco caracteres para uma meta description otimizada para motores de busca modernos.');
  assert(longDesc.length <= 156, `Truncates to a search-engine-appropriate length (got ${longDesc.length})`);
  assert(longDesc.endsWith('…') && !longDesc.slice(0, -1).endsWith(' '), 'Truncates at a word boundary, not mid-word');
  const shortDesc = gen.buildMetaDescription('Short and real.');
  assert(shortDesc === 'Short and real.', 'Short, real descriptions pass through unmodified — never padded with invented text');
}

console.log('\n=== 6. Zone image: relative path resolved to absolute, absolute passed through, absent gracefully omitted ===');
{
  const withRelative = gen.buildZonePage({ baseUrl: 'https://zfind.online', locale: 'en', zoneId: 'z1', zoneName: 'Boavista', cityName: 'Porto', countryIsoCode: 'PT', listingCount: 12, avgPrice: 455000, currencyIso: 'EUR', sampleListings: [], imageUrl: '/zones/boavista.jpg' });
  assert(withRelative.includes('https://zfind.online/zones/boavista.jpg'), 'A site-relative image path is resolved to a full absolute URL for og:image');
  assert(withRelative.includes('"image":"https://zfind.online/zones/boavista.jpg"'), 'Same absolute URL appears correctly in JSON-LD');

  const withAbsolute = gen.buildZonePage({ baseUrl: 'https://zfind.online', locale: 'en', zoneId: 'z1', zoneName: 'Boavista', cityName: 'Porto', countryIsoCode: 'PT', listingCount: 12, avgPrice: 455000, currencyIso: 'EUR', sampleListings: [], imageUrl: 'https://cdn.example.com/x.jpg' });
  assert(withAbsolute.includes('https://cdn.example.com/x.jpg') && !withAbsolute.includes('zfind.online/https://'), 'An already-absolute image URL passes through unchanged, never double-wrapped');

  const withoutImage = gen.buildZonePage({ baseUrl: 'https://zfind.online', locale: 'en', zoneId: 'z1', zoneName: 'Boavista', cityName: 'Porto', countryIsoCode: 'PT', listingCount: 12, avgPrice: 455000, currencyIso: 'EUR', sampleListings: [], imageUrl: null });
  assert(!withoutImage.includes('og:image') && !withoutImage.includes('<img'), 'No image tag emitted at all when none is available — never a broken image reference');
}

console.log('\n=== 7. Zone image mapping: explicit, never guesses ===');
{
  const zoneImages = require('../../apps/zfind-web/src/services/zone-images.js');
  assert(zoneImages.getZoneImagePath('Boavista') === '/zones/boavista.jpg', 'Boavista maps to its real photo');
  assert(zoneImages.getZoneImagePath('Foz do Douro') === '/zones/foz.jpg', 'Foz do Douro maps to its real photo');
  assert(zoneImages.getZoneImagePath('Cedofeita') === '/zones/cedofeita.jpg', 'Cedofeita maps to its real photo');
  assert(zoneImages.getZoneImagePath('Matosinhos Sul') === '/zones/matosinhos-sul.jpg', 'Matosinhos Sul maps to its real photo');
  assert(zoneImages.getZoneImagePath('A Zone That Does Not Exist') === null, 'An unmapped zone returns null — never falls back to a wrong photo');
}

console.log('\n============================================================');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('============================================================');
if (fail > 0) process.exit(1);
