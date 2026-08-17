/* ============================================================
   Z FIND — services/seo-page-generator.js
   ============================================================
   Pure functions: given real data (already fetched — this file makes
   no network calls), produce a complete, static, indexable HTML page
   with real JSON-LD, canonical URL, hreflang alternates, and a real
   meta description. Deliberately separated from data-fetching (see
   scripts/generate-seo-pages.js) so this file — where all the actual
   SEO-correctness logic lives — is fully unit-testable with mock
   data, no Supabase/network dependency at all.

   SITE_BASE_URL is required, not guessed — the real domain is tied to
   the not-yet-done Vercel/DNS phase. Every function here fails loudly
   if it's missing, rather than silently emitting a placeholder/wrong
   canonical URL (a wrong canonical is worse than none: it actively
   misdirects search engines).

   Auto-regeneration trigger: NOT implemented here. The correct trigger
   is "on publish/unpublish in the Admin" via a Supabase Database
   Webhook -> Vercel Deploy Hook, which requires infrastructure not
   yet set up (the agreed Vercel/domain/DNS phase). The extension
   point for that is marked in services/admin.js's setListingStatus —
   search for "SEO REGENERATION TRIGGER POINT". Until then, these
   pages regenerate whenever `npm run build:zfind` runs.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.seoPageGenerator = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

const LOCALES = ['en', 'pt', 'fr'];
const MARKET_LOCALES = ['fr', 'en', 'pt', 'es', 'de', 'it'];

/*
 * Legacy renderer keeps the three complete Phase-3 translations.
 * The Phase-4 canonical renderer expands through public-locales
 * only when genuine localized presentation/content exists.
 */
const DEFAULT_LOCALE = 'fr';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/\n/g, ' '); }

function requireBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) {
    throw new Error('SEO page generation requires a real SITE_BASE_URL (e.g. https://zfind.pt) — refusing to generate a page with a guessed or missing canonical URL.');
  }
  return baseUrl.replace(/\/$/, '');
}

/** Builds a short, real meta description from actual content —
    truncated cleanly, never padded with invented text. */
function buildMetaDescription(text, maxLen) {
  const limit = maxLen || 155;
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
}

function hreflangLinks(baseUrl, pathForLocale) {
  return LOCALES.map(l => `<link rel="alternate" hreflang="${l}" href="${baseUrl}${pathForLocale(l)}">`).join('\n  ')
    + `\n  <link rel="alternate" hreflang="x-default" href="${baseUrl}${pathForLocale(DEFAULT_LOCALE)}">`;
}

function marketHreflangLinks(baseUrl, pathByLocale) {
  return MARKET_LOCALES
    .map(locale => {
      const path = pathByLocale[locale];
      if (!path) {
        throw new Error(
          `Market SEO requires an exact ${locale} alternate path.`
        );
      }
      return `<link rel="alternate" hreflang="${locale}" href="${baseUrl}${path}">`;
    })
    .join('\n  ')
    + `\n  <link rel="alternate" hreflang="x-default" href="${baseUrl}${pathByLocale[DEFAULT_LOCALE]}">`;
}

function buildMarketPage({
  baseUrl,
  locale,
  marketKey,
  marketLabel,
  publicPath,
  pathByLocale,
  heroEyebrow,
  heroTitle,
  heroLead,
  featuredTitle,
  featuredIntro,
  searchTitle,
  searchIntro,
  guidesTitle,
  guidesIntro,
  legalLabel,
  rentalLabel,
  openInteractive,
  seoTitle,
  seoDescription,
  interactiveSpaPath,
  legalSpaPath,
  touristRentalSpaPath
}) {
  const base = requireBaseUrl(baseUrl);

  if (!MARKET_LOCALES.includes(locale)) {
    throw new Error('Unsupported Market SEO locale.');
  }

  if (!publicPath || pathByLocale[locale] !== publicPath) {
    throw new Error('Market SEO public path mismatch.');
  }

  const canonical = base + publicPath;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: seoTitle,
    description: seoDescription,
    url: canonical,
    about: {
      '@type': 'Place',
      name: marketLabel
    }
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Z Find',
        item: `${base}/`
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: marketLabel,
        item: canonical
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(seoTitle)}</title>
<meta name="description" content="${escapeAttr(seoDescription)}">
<link rel="canonical" href="${canonical}">
${marketHreflangLinks(base, pathByLocale)}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeAttr(seoTitle)}">
<meta property="og:description" content="${escapeAttr(seoDescription)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
</head>
<body>
<main data-zfind-market-key="${escapeAttr(marketKey)}">
  <nav aria-label="breadcrumb">
    <a href="${base}/">Z Find</a> /
    <span>${escapeHtml(marketLabel)}</span>
  </nav>

  <header>
    <p>${escapeHtml(heroEyebrow)}</p>
    <h1>${escapeHtml(heroTitle)}</h1>
    <p>${escapeHtml(heroLead)}</p>
  </header>

  <section>
    <h2>${escapeHtml(featuredTitle)}</h2>
    <p>${escapeHtml(featuredIntro)}</p>
  </section>

  <section>
    <h2>${escapeHtml(searchTitle)}</h2>
    <p>${escapeHtml(searchIntro)}</p>
  </section>

  <section>
    <h2>${escapeHtml(guidesTitle)}</h2>
    <p>${escapeHtml(guidesIntro)}</p>
    <p>
      <a href="${base}${legalSpaPath}">${escapeHtml(legalLabel)}</a>
      ·
      <a href="${base}${touristRentalSpaPath}">${escapeHtml(rentalLabel)}</a>
    </p>
  </section>

  <p>
    <a href="${base}${interactiveSpaPath}">
      ${escapeHtml(openInteractive)} →
    </a>
  </p>

</main>
</body>
</html>`;
}

/** Property/Development share the same JSON-LD shape closely enough
    (schema.org has no dedicated "Development" type — RealEstateListing
    covers both; a Development's own "offers" describes its starting
    price, matching price_is_from semantics already used elsewhere in
    this codebase). kind is 'property' | 'development', purely for the
    URL path and breadcrumb label — never fabricates data either way. */
function buildListingPage({ kind, baseUrl, locale, id, title, description, priceValue, currencyIso, priceIsFrom, zoneLabel, cityLabel, countryIsoCode, imageUrl, imageAlt }) {
  const base = requireBaseUrl(baseUrl);
  const pathForLocale = l => `/${l}/${kind}/${id}`;
  const canonical = base + pathForLocale(locale);
  const metaDesc = buildMetaDescription(description);
  const pageTitle = `${title} — ${zoneLabel || cityLabel || ''} | Z Find`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: title,
    description: metaDesc,
    url: canonical,
    address: {
      '@type': 'PostalAddress',
      addressLocality: cityLabel || undefined,
      addressRegion: zoneLabel || undefined,
      addressCountry: countryIsoCode || undefined,
    },
    offers: {
      '@type': 'Offer',
      price: priceValue,
      priceCurrency: currencyIso,
      priceSpecification: priceIsFrom ? { '@type': 'PriceSpecification', minPrice: priceValue } : undefined,
      availability: 'https://schema.org/InStock',
    },
    image: imageUrl || undefined,
  };
  // Never emit `undefined` fields as literal JSON — remove them,
  // rather than let JSON.stringify silently drop nested undefineds
  // inconsistently across engines.
  const jsonLdClean = JSON.parse(JSON.stringify(jsonLd));

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Z Find', item: base + '/' + locale },
      { '@type': 'ListItem', position: 2, name: kind === 'development' ? 'Developments' : 'Properties', item: `${base}/${locale}/search` },
      { '@type': 'ListItem', position: 3, name: title, item: canonical },
    ],
  };

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeAttr(metaDesc)}">
<link rel="canonical" href="${canonical}">
${hreflangLinks(base, pathForLocale)}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeAttr(pageTitle)}">
<meta property="og:description" content="${escapeAttr(metaDesc)}">
<meta property="og:url" content="${canonical}">
${imageUrl ? `<meta property="og:image" content="${escapeAttr(imageUrl)}">` : ''}
<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${JSON.stringify(jsonLdClean)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
</head>
<body>
<main>
  <nav aria-label="breadcrumb"><a href="${base}/#/${locale}">Z Find</a> / <a href="${base}/#/${locale}/search">${kind === 'development' ? 'Developments' : 'Properties'}</a> / <span>${escapeHtml(title)}</span></nav>
  <h1>${escapeHtml(title)}</h1>
  ${imageUrl ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(imageAlt || title)}" width="1200" height="675">` : ''}
  <p>${escapeHtml(description)}</p>
  <p class="meta">${escapeHtml([zoneLabel, cityLabel].filter(Boolean).join(', '))}</p>
  <p class="price">${priceIsFrom ? 'From ' : ''}${priceValue != null ? `${priceValue} ${currencyIso}` : ''}</p>
  <p><a href="${base}/#/${locale}/${kind}/${id}">${'View full listing on Z Find →'}</a></p>
  <!-- The link above points into the interactive SPA (hash route) —
       this static page IS the canonical, indexable URL a search
       engine or a shared link lands on; the SPA is where a visitor
       who wants to filter, save, or contact actually operates.
       These are deliberately two different URLs for the same
       content, not a duplicate — see vercel.json's routing. -->
</main>
</body>
</html>`;
}

/** Zone pages: honest about thin inventory (see the module's own
    design principle — never a statistic derived from 1-2 listings
    presented as a market average). `listingCount` decides which
    template branch renders; `sampleListings` (already mapped, real
    card view-models) are shown only when there are enough to be
    meaningful. */
const MIN_LISTINGS_FOR_STATS = 5;

function buildZonePage({ baseUrl, locale, zoneId, zoneName, cityName, countryIsoCode, listingCount, avgPrice, currencyIso, sampleListings, imageUrl }) {
  const base = requireBaseUrl(baseUrl);
  const pathForLocale = l => `/${l}/zone/${zoneId}`;
  const canonical = base + pathForLocale(locale);
  const hasEnoughData = listingCount >= MIN_LISTINGS_FOR_STATS;
  const title = `${zoneName}, ${cityName} — Real Estate | Z Find`;
  const description = hasEnoughData
    ? buildMetaDescription(`Explore ${listingCount} real estate opportunities in ${zoneName}, ${cityName}. Average price: ${Math.round(avgPrice).toLocaleString(locale)} ${currencyIso}.`)
    : buildMetaDescription(`Discover ${zoneName}, ${cityName} — a neighbourhood profile and current real estate opportunities from Z Find.`);
  const absoluteImageUrl = imageUrl ? (/^https?:\/\//.test(imageUrl) ? imageUrl : base + imageUrl) : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: canonical,
    about: { '@type': 'Place', name: zoneName, address: { '@type': 'PostalAddress', addressLocality: cityName, addressCountry: countryIsoCode } },
    image: absoluteImageUrl || undefined,
  };
  const jsonLdClean = JSON.parse(JSON.stringify(jsonLd));

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(description)}">
<link rel="canonical" href="${canonical}">
${hreflangLinks(base, pathForLocale)}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${canonical}">
${absoluteImageUrl ? `<meta property="og:image" content="${escapeAttr(absoluteImageUrl)}">` : ''}
<script type="application/ld+json">${JSON.stringify(jsonLdClean)}</script>
</head>
<body>
<main>
  <h1>${escapeHtml(zoneName)}, ${escapeHtml(cityName)}</h1>
  ${absoluteImageUrl ? `<img src="${escapeAttr(absoluteImageUrl)}" alt="${escapeAttr(zoneName + ', ' + cityName)}" width="1200" height="675">` : ''}
  ${hasEnoughData
    ? `<p>${listingCount} opportunities currently listed. Average price: ${Math.round(avgPrice).toLocaleString(locale)} ${currencyIso}.</p>`
    : `<p>Z Find is actively adding opportunities in ${escapeHtml(zoneName)}. <a href="${base}/#/${locale}/search">See all current opportunities →</a></p>`}
  ${sampleListings && sampleListings.length ? '<ul>' + sampleListings.map(l => `<li><a href="${base}/${locale}/${l.kind}/${l.id}">${escapeHtml(l.title)}</a></li>`).join('') + '</ul>' : ''}
</main>
</body>
</html>`;
}

return {
  buildListingPage,
  buildZonePage,
  buildMarketPage,
  buildMetaDescription,
  MIN_LISTINGS_FOR_STATS,
  LOCALES,
  MARKET_LOCALES,
  DEFAULT_LOCALE
};

});
