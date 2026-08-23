#!/usr/bin/env node
/* ============================================================
   Z FIND — SEO STATIC PAGE GENERATION
   ============================================================
   Generates static, indexable Market, Property, Development and Zone
   pages plus robots.txt and sitemap.xml.

   Six-language rule:
   - Market and Zone presentation is genuinely translated 6/6.
   - Property/Development editorial pages are generated ONLY when an
     exact localized listing_content row exists. English is never
     republished under an ES/DE/IT/PT/FR URL as a fake translation.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const DIST_SEO_DIR = path.join(__dirname, '..', 'dist', 'seo');
const marketRegistry = require('../src/services/market-registry.js');
const seoGenerator = require('../src/services/seo-page-generator.js');

const PERSISTED_LOCALE_BY_PUBLIC = Object.freeze({
  fr: 'fr',
  en: 'en',
  pt: 'pt-PT',
  es: 'es',
  de: 'de',
  it: 'it'
});

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) {
    throw new Error('SEO deployment requires a real SITE_BASE_URL using http/https.');
  }
  return baseUrl.replace(/\/+$/, '');
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildRobotsTxt(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  return ['User-agent: *', 'Allow: /', '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n');
}

function buildSitemapXml(baseUrl, urls) {
  const base = normalizeBaseUrl(baseUrl);
  const canonicalUrls = Array.from(new Set([`${base}/`, ...Array.from(urls || [])])).sort();
  const body = canonicalUrls.map(url => `  <url><loc>${xmlEscape(url)}</loc></url>`).join('\n');
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', body, '</urlset>', ''].join('\n');
}

function writeIndexingArtifacts(baseUrl, urls) {
  fs.writeFileSync(path.join(DIST_SEO_DIR, 'robots.txt'), buildRobotsTxt(baseUrl));
  fs.writeFileSync(path.join(DIST_SEO_DIR, 'sitemap.xml'), buildSitemapXml(baseUrl, urls));
}

function contentForPublicLocale(contentRows, publicLocale) {
  const rows = Array.isArray(contentRows) ? contentRows : [];
  const persisted = PERSISTED_LOCALE_BY_PUBLIC[publicLocale];
  if (!persisted) return null;

  // pt was used by the earliest prototype; pt-PT is the canonical
  // persisted identity. Read the legacy spelling only for continuity,
  // never as a fallback from another language.
  const accepted = publicLocale === 'pt'
    ? ['pt-PT', 'pt']
    : [persisted];

  return rows.find(row => accepted.includes(row.locale)) || null;
}

function genuineEditorialLocales(contentRows) {
  return seoGenerator.LOCALES.filter(locale => {
    const content = contentForPublicLocale(contentRows, locale);
    return !!(content && String(content.title || '').trim() && String(content.description || '').trim());
  });
}

function buildMarketSeoEntries(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  const entries = [];

  for (const market of marketRegistry.listMarkets()) {
    const pathByLocale = Object.fromEntries(
      marketRegistry.MARKET_LOCALES.map(locale => [locale, marketRegistry.marketPath(market.key, locale)])
    );

    for (const locale of marketRegistry.MARKET_LOCALES) {
      const copy = marketRegistry.marketPresentation(market.key, locale);
      const publicPath = pathByLocale[locale];
      const canonicalUrl = base + publicPath;
      const html = seoGenerator.buildMarketPage({
        baseUrl: base,
        locale,
        marketKey: market.key,
        marketLabel: copy.label,
        publicPath,
        pathByLocale,
        heroEyebrow: copy.heroEyebrow,
        heroTitle: copy.heroTitle,
        heroLead: copy.heroLead,
        featuredTitle: copy.featuredTitle,
        featuredIntro: copy.featuredIntro,
        searchTitle: copy.searchTitle,
        searchIntro: copy.searchIntro,
        guidesTitle: copy.guidesTitle,
        guidesIntro: copy.guidesIntro,
        legalLabel: copy.legalLabel,
        rentalLabel: copy.rentalLabel,
        openInteractive: copy.openInteractive,
        seoTitle: copy.seoTitle,
        seoDescription: copy.seoDescription,
        interactiveSpaPath: `/#/${locale}/market/${market.key}`,
        legalSpaPath: `/#/${locale}/${market.legalRoute}`,
        touristRentalSpaPath: `/#/${locale}/${market.touristRentalRoute}`
      });

      entries.push({
        marketKey: market.key,
        locale,
        publicPath,
        canonicalUrl,
        outRelativePath: publicPath.replace(/^\/+/, '') + '.html',
        html
      });
    }
  }

  return entries;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const siteBaseUrl = process.env.SITE_BASE_URL;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('BUILD FAILED: SUPABASE_URL and SUPABASE_ANON_KEY are required for SEO generation.');
  }
  if (!siteBaseUrl) {
    throw new Error('BUILD FAILED: SITE_BASE_URL is required to generate SEO pages — refusing to generate guessed canonical URLs.');
  }

  const baseUrl = normalizeBaseUrl(siteBaseUrl);
  fs.rmSync(DIST_SEO_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_SEO_DIR, { recursive: true });

  const supabaseClientModule = require('../src/services/supabaseClient.js');
  global.window = global.window || {};
  window.ZFindServices = window.ZFindServices || {};
  window.ZFindServices.supabaseClient = supabaseClientModule;
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(supabaseUrl, supabaseAnonKey);
  supabaseClientModule.getSupabaseClient = () => client;

  const searchService = require('../src/services/search.js');
  const developmentsService = require('../src/services/developments.js');
  const zoneImages = require('../src/services/zone-images.js');

  const [propertiesResult, developmentsResult] = await Promise.all([
    searchService.search({}),
    developmentsService.listPublished()
  ]);

  if (propertiesResult.error && propertiesResult.error.type !== 'empty_result') {
    throw new Error('SEO page generation FAILED fetching properties: ' + propertiesResult.error.message);
  }
  if (developmentsResult.error && developmentsResult.error.type !== 'empty_result') {
    throw new Error('SEO page generation FAILED fetching developments: ' + developmentsResult.error.message);
  }

  const properties = propertiesResult.data || [];
  const developments = developmentsResult.data || [];
  let written = 0;
  const sitemapUrls = new Set();

  for (const entry of buildMarketSeoEntries(baseUrl)) {
    const outPath = path.join(DIST_SEO_DIR, entry.outRelativePath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, entry.html);
    sitemapUrls.add(entry.canonicalUrl);
    written++;
  }

  async function writeListingPages(rows, kind) {
    for (const row of rows) {
      const rep = (row.representations || [])[0];
      const listing = rep && (rep.listings || [])[0];
      if (!listing) continue;

      const contentRows = listing.listing_content || [];
      const availableLocales = genuineEditorialLocales(contentRows);
      if (!availableLocales.length) continue;

      const zone = row.zones_lite || {};
      const mediaRows = kind === 'development'
        ? (row.development_media || (listing.listing_media || []))
        : (listing.listing_media || []);
      const cover = mediaRows.slice().sort((a,b) => (b.is_cover - a.is_cover))[0];
      const imageUrl = cover && cover.media_assets
        ? await supabaseClientModule.resolveMediaUrl(cover.media_assets.original_storage_path, undefined, 60 * 60 * 24 * 30)
        : null;

      for (const locale of availableLocales) {
        const content = contentForPublicLocale(contentRows, locale);
        const html = seoGenerator.buildListingPage({
          kind,
          baseUrl,
          locale,
          availableLocales,
          id: row.id,
          title: content.title,
          description: content.description,
          priceValue: listing.price_current,
          currencyIso: listing.currency_iso,
          priceIsFrom: !!listing.price_is_from,
          zoneLabel: zone.name || null,
          cityLabel: zone.city || null,
          countryIsoCode: zone.country_iso || null,
          imageUrl,
          imageAlt: content.title
        });
        const outPath = path.join(DIST_SEO_DIR, locale, kind, `${row.id}.html`);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, html);
        sitemapUrls.add(`${baseUrl}/${locale}/${kind}/${row.id}`);
        written++;
      }
    }
  }

  await writeListingPages(properties, 'property');
  await writeListingPages(developments, 'development');

  const zonesById = {};
  properties.concat(developments).forEach(row => {
    const zone = row.zones_lite;
    if (!zone || !row.zone_lite_id) return;
    const rep = (row.representations || [])[0];
    const listing = rep && (rep.listings || [])[0];
    if (!listing) return;
    if (!zonesById[row.zone_lite_id]) zonesById[row.zone_lite_id] = { zone, prices: [], samples: [] };
    zonesById[row.zone_lite_id].prices.push(listing.price_current);
    if (zonesById[row.zone_lite_id].samples.length < 5) {
      zonesById[row.zone_lite_id].samples.push({
        kind: row.subtype ? 'property' : 'development',
        id: row.id,
        contentRows: listing.listing_content || []
      });
    }
  });

  for (const zoneId of Object.keys(zonesById)) {
    const { zone, prices, samples } = zonesById[zoneId];
    const avgPrice = prices.length ? prices.reduce((a,b) => a + b, 0) / prices.length : 0;

    for (const locale of seoGenerator.LOCALES) {
      const localizedSamples = samples.flatMap(sample => {
        const content = contentForPublicLocale(sample.contentRows, locale);
        return content && content.title
          ? [{ kind: sample.kind, id: sample.id, title: content.title }]
          : [];
      });

      const html = seoGenerator.buildZonePage({
        baseUrl,
        locale,
        zoneId,
        zoneName: zone.name,
        cityName: zone.city,
        countryIsoCode: zone.country_iso,
        listingCount: prices.length,
        avgPrice,
        currencyIso: 'EUR',
        sampleListings: localizedSamples,
        imageUrl: zoneImages.getZoneImagePath(zone.name)
      });
      const outPath = path.join(DIST_SEO_DIR, locale, 'zone', `${zoneId}.html`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html);
      sitemapUrls.add(`${baseUrl}/${locale}/zone/${zoneId}`);
      written++;
    }
  }

  writeIndexingArtifacts(baseUrl, sitemapUrls);
  console.log(`SEO pages generated: ${written} files in ${DIST_SEO_DIR}`);
  console.log('SEO indexing artifacts generated: robots.txt, sitemap.xml');
}

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = {
  main,
  normalizeBaseUrl,
  buildRobotsTxt,
  buildSitemapXml,
  buildMarketSeoEntries,
  contentForPublicLocale,
  genuineEditorialLocales,
  PERSISTED_LOCALE_BY_PUBLIC
};
