#!/usr/bin/env node
/* ============================================================
   Z FIND — SEO STATIC PAGE GENERATION
   ============================================================
   Generates real, static, indexable HTML pages for every published
   Property, Development, and Zone — one file per locale. Fetches data
   through the EXISTING services (search.js, developments.js) rather
   than writing new queries — reuse, not duplication.

   RUNS AS: a separate, explicit command — `npm run build:seo-pages` —
   never bundled into the everyday `npm run build:zfind`. Reason,
   found the hard way while building this: making it a mandatory step
   of the main build would fail the ENTIRE site build for everyone,
   every day, until SITE_BASE_URL exists (which depends on the
   not-yet-done Vercel/domain phase) — that's the wrong trade-off. The
   main site build must keep working today; SEO page generation runs
   on its own, whenever it's actually meaningful to run it.

   AUTOMATIC REGENERATION: this script is the engine. The trigger that
   makes it run automatically "the moment something is published in
   the Admin" is NOT implemented here — that requires a Supabase
   Database Webhook -> Vercel Deploy Hook, which depends on
   infrastructure not yet set up (the agreed Vercel/domain/DNS phase).
   The extension point is marked in services/admin.js's
   setListingStatus (search "SEO REGENERATION TRIGGER POINT"). Until
   that phase, this runs as part of `npm run build:zfind`.

   HONESTY NOTE: this script could not be executed against live
   Supabase data from the sandbox this was built in (network egress to
   *.supabase.co is blocked there, documented extensively earlier in
   this project). It is syntax-verified and its data-shape assumptions
   are cross-checked against the exact same services already proven
   working in the browser (Sprint 1.2/1.3) — but a live run, with real
   data, has not been observed here. Run it for real once this reaches
   an environment with Supabase network access, and verify its output
   before trusting it in production.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const DIST_SEO_DIR = path.join(__dirname, '..', 'dist', 'seo');

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) {
    throw new Error(
      'SEO deployment requires a real SITE_BASE_URL using http/https.'
    );
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

  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

function buildSitemapXml(baseUrl, urls) {
  const base = normalizeBaseUrl(baseUrl);

  const canonicalUrls = Array.from(
    new Set([
      `${base}/`,
      ...Array.from(urls || []),
    ])
  ).sort();

  const body = canonicalUrls
    .map(url => `  <url><loc>${xmlEscape(url)}</loc></url>`)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    '</urlset>',
    '',
  ].join('\n');
}

function writeIndexingArtifacts(baseUrl, urls) {
  fs.writeFileSync(
    path.join(DIST_SEO_DIR, 'robots.txt'),
    buildRobotsTxt(baseUrl)
  );

  fs.writeFileSync(
    path.join(DIST_SEO_DIR, 'sitemap.xml'),
    buildSitemapXml(baseUrl, urls)
  );
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const siteBaseUrl = process.env.SITE_BASE_URL;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'BUILD FAILED: SUPABASE_URL and SUPABASE_ANON_KEY are required for SEO generation.'
    );
  }

  if (!siteBaseUrl) {
    throw new Error(
      'BUILD FAILED: SITE_BASE_URL is required to generate SEO pages — refusing to generate guessed canonical URLs.'
    );
  }

  const baseUrl = normalizeBaseUrl(siteBaseUrl);

  // Never carry stale pages from a previous publication state into
  // a new deploy. A successful generation always starts from zero.
  fs.rmSync(DIST_SEO_DIR, {
    recursive: true,
    force: true,
  });

  fs.mkdirSync(
    DIST_SEO_DIR,
    {
      recursive: true,
    }
  );

  // Reuse the exact same UMD services already proven in the browser —
  // no new query logic here.
  const supabaseClientModule = require('../src/services/supabaseClient.js');
  global.window = global.window || {};
  window.ZFindServices = window.ZFindServices || {};
  window.ZFindServices.supabaseClient = supabaseClientModule;
  // config.js sets up the real client the same way the browser build does
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(supabaseUrl, supabaseAnonKey);
  supabaseClientModule.getSupabaseClient = () => client; // same override pattern test files already use throughout this project

  const searchService = require('../src/services/search.js');
  const developmentsService = require('../src/services/developments.js');
  const generator = require('../src/services/seo-page-generator.js');
  const zoneImages = require('../src/services/zone-images.js');

  const [propertiesResult, developmentsResult] = await Promise.all([
    searchService.search({}),
    developmentsService.listPublished(),
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

  async function writeListingPages(rows, kind) {
    for (const row of rows) {
      const rep = (row.representations || [])[0];
      const listing = rep && (rep.listings || [])[0];
      if (!listing) continue;
      const zone = row.zones_lite || {};
      const mediaRows = kind === 'development'
        ? (row.development_media || (listing.listing_media || []))
        : (listing.listing_media || []);
      const cover = mediaRows.slice().sort((a, b) => (b.is_cover - a.is_cover))[0];
      // Long expiry (30 days) — see supabaseClient.js's resolveMediaUrl
      // doc comment for exactly why static pages can't use the
      // default 1-hour signed URL.
      const imageUrl = cover && cover.media_assets
        ? await supabaseClientModule.resolveMediaUrl(cover.media_assets.original_storage_path, undefined, 60 * 60 * 24 * 30)
        : null;

      for (const locale of generator.LOCALES) {
        const contentRows = listing.listing_content || [];
        const content = contentRows.find(c => c.locale === locale) || contentRows.find(c => c.locale === 'en') || { title: row.name || '', description: '' };
        const html = generator.buildListingPage({
          kind, baseUrl, locale, id: row.id,
          title: content.title, description: content.description,
          priceValue: listing.price_current, currencyIso: listing.currency_iso, priceIsFrom: !!listing.price_is_from,
          zoneLabel: zone.name || null, cityLabel: zone.city || null, countryIsoCode: zone.country_iso || null,
          imageUrl, imageAlt: content.title,
        });
        const outPath = path.join(DIST_SEO_DIR, locale, kind, `${row.id}.html`);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, html);

        sitemapUrls.add(
          `${baseUrl}/${locale}/${kind}/${row.id}`
        );

        written++;
      }
    }
  }

  await writeListingPages(properties, 'property');
  await writeListingPages(developments, 'development');

  // Zone pages: aggregate from the SAME already-fetched data — no
  // extra query for stats.
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
      const contentRows = listing.listing_content || [];
      const enContent = contentRows.find(c => c.locale === 'en') || { title: row.name || '' };
      zonesById[row.zone_lite_id].samples.push({ kind: row.subtype ? 'property' : 'development', id: row.id, title: enContent.title });
    }
  });

  for (const zoneId of Object.keys(zonesById)) {
    const { zone, prices, samples } = zonesById[zoneId];
    const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    for (const locale of generator.LOCALES) {
      const html = generator.buildZonePage({
        baseUrl, locale, zoneId, zoneName: zone.name, cityName: zone.city, countryIsoCode: zone.country_iso,
        listingCount: prices.length, avgPrice, currencyIso: 'EUR', sampleListings: samples,
        imageUrl: zoneImages.getZoneImagePath(zone.name),
      });
      const outPath = path.join(DIST_SEO_DIR, locale, 'zone', `${zoneId}.html`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html);

      sitemapUrls.add(
        `${baseUrl}/${locale}/zone/${zoneId}`
      );

      written++;
    }
  }

  // robots.txt and sitemap.xml exist even when public inventory is
  // genuinely zero. sitemap.xml then contains only the canonical root.
  writeIndexingArtifacts(
    baseUrl,
    sitemapUrls
  );

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
};
