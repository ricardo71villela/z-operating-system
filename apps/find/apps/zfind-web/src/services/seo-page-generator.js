/* ============================================================
   Z FIND — STATIC SEO PAGE GENERATOR
   Six-language authority: fr · en · pt · es · de · it.
   Editorial listing pages are emitted only for genuine localized
   content supplied by the caller; interface copy is translated here.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.seoPageGenerator = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
'use strict';

const LOCALES = ['fr', 'en', 'pt', 'es', 'de', 'it'];
const MARKET_LOCALES = LOCALES.slice();
const DEFAULT_LOCALE = 'fr';
const MIN_LISTINGS_FOR_STATS = 5;
const SEO_PRESENTATION_VERSION = 'zfind-static-v1';
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600&display=swap';

const COPY = Object.freeze({
  fr: Object.freeze({ properties:'Biens', developments:'Programmes neufs', from:'À partir de ', viewFull:'Voir l’annonce complète sur Z Find →', zoneTitle:(zone,city)=>`${zone}, ${city} — Immobilier | Z Find`, zoneRich:(count,zone,city,avg,cur)=>`Explorez ${count} opportunités immobilières à ${zone}, ${city}. Prix moyen : ${avg} ${cur}.`, zoneThin:(zone,city)=>`Découvrez ${zone}, ${city} — profil du quartier et opportunités immobilières actuelles sur Z Find.`, opportunities:(count,avg,cur)=>`${count} opportunités actuellement listées. Prix moyen : ${avg} ${cur}.`, adding:zone=>`Z Find ajoute activement des opportunités à ${zone}.`, seeAll:'Voir toutes les opportunités actuelles →' }),
  en: Object.freeze({ properties:'Properties', developments:'Developments', from:'From ', viewFull:'View full listing on Z Find →', zoneTitle:(zone,city)=>`${zone}, ${city} — Real Estate | Z Find`, zoneRich:(count,zone,city,avg,cur)=>`Explore ${count} real estate opportunities in ${zone}, ${city}. Average price: ${avg} ${cur}.`, zoneThin:(zone,city)=>`Discover ${zone}, ${city} — a neighbourhood profile and current real estate opportunities from Z Find.`, opportunities:(count,avg,cur)=>`${count} opportunities currently listed. Average price: ${avg} ${cur}.`, adding:zone=>`Z Find is actively adding opportunities in ${zone}.`, seeAll:'See all current opportunities →' }),
  pt: Object.freeze({ properties:'Imóveis', developments:'Empreendimentos', from:'A partir de ', viewFull:'Ver anúncio completo no Z Find →', zoneTitle:(zone,city)=>`${zone}, ${city} — Imobiliário | Z Find`, zoneRich:(count,zone,city,avg,cur)=>`Explore ${count} oportunidades imobiliárias em ${zone}, ${city}. Preço médio: ${avg} ${cur}.`, zoneThin:(zone,city)=>`Descubra ${zone}, ${city} — perfil da zona e oportunidades imobiliárias atuais no Z Find.`, opportunities:(count,avg,cur)=>`${count} oportunidades atualmente listadas. Preço médio: ${avg} ${cur}.`, adding:zone=>`O Z Find está a adicionar ativamente oportunidades em ${zone}.`, seeAll:'Ver todas as oportunidades atuais →' }),
  es: Object.freeze({ properties:'Inmuebles', developments:'Promociones', from:'Desde ', viewFull:'Ver anuncio completo en Z Find →', zoneTitle:(zone,city)=>`${zone}, ${city} — Inmobiliario | Z Find`, zoneRich:(count,zone,city,avg,cur)=>`Explore ${count} oportunidades inmobiliarias en ${zone}, ${city}. Precio medio: ${avg} ${cur}.`, zoneThin:(zone,city)=>`Descubra ${zone}, ${city} — perfil de la zona y oportunidades inmobiliarias actuales en Z Find.`, opportunities:(count,avg,cur)=>`${count} oportunidades actualmente publicadas. Precio medio: ${avg} ${cur}.`, adding:zone=>`Z Find está incorporando activamente oportunidades en ${zone}.`, seeAll:'Ver todas las oportunidades actuales →' }),
  de: Object.freeze({ properties:'Immobilien', developments:'Neubauprojekte', from:'Ab ', viewFull:'Vollständiges Angebot auf Z Find ansehen →', zoneTitle:(zone,city)=>`${zone}, ${city} — Immobilien | Z Find`, zoneRich:(count,zone,city,avg,cur)=>`Entdecken Sie ${count} Immobilienangebote in ${zone}, ${city}. Durchschnittspreis: ${avg} ${cur}.`, zoneThin:(zone,city)=>`Entdecken Sie ${zone}, ${city} — Gebietsprofil und aktuelle Immobilienangebote auf Z Find.`, opportunities:(count,avg,cur)=>`${count} aktuell gelistete Angebote. Durchschnittspreis: ${avg} ${cur}.`, adding:zone=>`Z Find ergänzt derzeit aktiv Angebote in ${zone}.`, seeAll:'Alle aktuellen Angebote ansehen →' }),
  it: Object.freeze({ properties:'Immobili', developments:'Nuove costruzioni', from:'Da ', viewFull:'Vedi l’annuncio completo su Z Find →', zoneTitle:(zone,city)=>`${zone}, ${city} — Immobiliare | Z Find`, zoneRich:(count,zone,city,avg,cur)=>`Esplora ${count} opportunità immobiliari a ${zone}, ${city}. Prezzo medio: ${avg} ${cur}.`, zoneThin:(zone,city)=>`Scopri ${zone}, ${city} — profilo della zona e opportunità immobiliari attuali su Z Find.`, opportunities:(count,avg,cur)=>`${count} opportunità attualmente pubblicate. Prezzo medio: ${avg} ${cur}.`, adding:zone=>`Z Find sta aggiungendo attivamente opportunità in ${zone}.`, seeAll:'Vedi tutte le opportunità attuali →' })
});

function requireLocale(locale) {
  if (!LOCALES.includes(locale)) throw new Error('Unsupported SEO locale.');
  return locale;
}
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/\n/g, ' '); }
function requireBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) throw new Error('SEO page generation requires a real SITE_BASE_URL — refusing to guess canonical URLs.');
  return baseUrl.replace(/\/$/, '');
}
function buildMetaDescription(text, maxLen) {
  const limit = maxLen || 155;
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
}
function normalizeAlternates(availableLocales) {
  const requested = Array.isArray(availableLocales) && availableLocales.length ? availableLocales : LOCALES;
  const result = requested.filter((l,i,a) => LOCALES.includes(l) && a.indexOf(l) === i);
  if (!result.length) throw new Error('SEO page requires at least one genuine locale.');
  return result;
}
function hreflangLinks(baseUrl, pathForLocale, availableLocales) {
  const alternates = normalizeAlternates(availableLocales);
  const xDefault = alternates.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : alternates[0];
  return alternates.map(l => `<link rel="alternate" hreflang="${l}" href="${baseUrl}${pathForLocale(l)}">`).join('\n  ') + `\n  <link rel="alternate" hreflang="x-default" href="${baseUrl}${pathForLocale(xDefault)}">`;
}
function marketHreflangLinks(baseUrl, pathByLocale) {
  return MARKET_LOCALES.map(locale => {
    const path = pathByLocale[locale];
    if (!path) throw new Error(`Market SEO requires an exact ${locale} alternate path.`);
    return `<link rel="alternate" hreflang="${locale}" href="${baseUrl}${path}">`;
  }).join('\n  ') + `\n  <link rel="alternate" hreflang="x-default" href="${baseUrl}${pathByLocale[DEFAULT_LOCALE]}">`;
}

function presentationHead() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_URL}">
<style id="zfind-seo-page-styles" data-version="${SEO_PRESENTATION_VERSION}">
:root{--zf-white:#fff;--zf-black:#0a0a0a;--zf-50:#f8f8f6;--zf-100:#f0efe9;--zf-200:#e2e0d8;--zf-400:#9e9c94;--zf-500:#6e6c64;--zf-700:#3a3834;--zf-900:#1a1916;--zf-gold:#b8935a;--zf-gold-dark:#8b6b3a;--zf-gold-pale:#f5edd8;--zf-shadow:0 20px 70px rgba(0,0,0,.07)}
*{box-sizing:border-box}html{background:var(--zf-white)}body.zf-seo-body{margin:0;color:var(--zf-900);background:var(--zf-white);font-family:'DM Sans',Arial,sans-serif;font-weight:300;-webkit-font-smoothing:antialiased}body.zf-seo-body a{color:inherit;text-decoration:none}body.zf-seo-body a:focus-visible{outline:2px solid var(--zf-gold);outline-offset:3px}.zf-seo-wrap{width:min(1180px,calc(100% - 64px));margin:0 auto}.zf-seo-site-header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.94);backdrop-filter:blur(10px);border-bottom:1px solid var(--zf-200)}.zf-seo-nav{height:76px;display:flex;align-items:center;justify-content:space-between;gap:24px}.zf-seo-brand{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.8rem;font-weight:500;letter-spacing:.02em}.zf-seo-brand em{font-style:normal;color:var(--zf-gold)}.zf-seo-nav-cta,.zf-seo-primary{display:inline-flex;align-items:center;justify-content:center;padding:12px 20px;border:1px solid var(--zf-gold);background:var(--zf-gold);color:#fff!important;font-size:.72rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;transition:transform .2s ease,background .2s ease}.zf-seo-nav-cta:hover,.zf-seo-primary:hover{background:var(--zf-gold-dark);transform:translateY(-1px)}.zf-seo-main{padding:0 0 72px}.zf-seo-breadcrumb{padding:24px 0 18px;color:var(--zf-500);font-size:.78rem}.zf-seo-breadcrumb a{color:var(--zf-gold-dark)}.zf-seo-hero{margin-top:6px;padding:72px 64px;background:var(--zf-50);border:1px solid var(--zf-200)}.zf-seo-eyebrow{margin:0 0 18px;color:var(--zf-gold-dark);font-size:.72rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase}.zf-seo-hero h1,.zf-seo-content h1{margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(2.6rem,6vw,4.7rem);font-weight:400;line-height:1.02;letter-spacing:-.02em}.zf-seo-lead{max-width:760px;margin:24px 0 0;color:var(--zf-700);font-size:1.04rem;line-height:1.75}.zf-seo-section-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin-top:28px}.zf-seo-card{min-height:230px;padding:30px;border:1px solid var(--zf-200);background:#fff;transition:transform .2s ease,box-shadow .2s ease}.zf-seo-card:hover{transform:translateY(-3px);box-shadow:var(--zf-shadow)}.zf-seo-card h2{margin:0 0 14px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.85rem;font-weight:400}.zf-seo-card p{margin:0;color:var(--zf-500);font-size:.92rem;line-height:1.65}.zf-seo-card p+p{margin-top:20px}.zf-seo-card a{color:var(--zf-gold-dark);font-weight:500}.zf-seo-cta-row{display:flex;justify-content:flex-end;margin-top:28px}.zf-seo-content{max-width:900px;margin:30px auto 0;padding:42px;border:1px solid var(--zf-200);background:#fff}.zf-seo-content>p{color:var(--zf-700);font-size:1rem;line-height:1.75}.zf-seo-content img{display:block;width:100%;height:auto;margin:28px 0;object-fit:cover;border:1px solid var(--zf-200)}.zf-seo-content .meta{margin-top:24px;color:var(--zf-500);font-size:.82rem}.zf-seo-content .price{margin:8px 0 24px;color:var(--zf-gold-dark);font-family:'Cormorant Garamond',Georgia,serif;font-size:2rem}.zf-seo-content ul{padding-left:20px}.zf-seo-content li{margin:10px 0}.zf-seo-content li a,.zf-seo-content>p a{color:var(--zf-gold-dark);font-weight:500}
@media(max-width:820px){.zf-seo-wrap{width:min(100% - 32px,1180px)}.zf-seo-nav{height:66px}.zf-seo-nav-cta{display:none}.zf-seo-hero{padding:52px 28px}.zf-seo-section-grid{grid-template-columns:1fr}.zf-seo-card{min-height:0}.zf-seo-content{margin-top:18px;padding:28px 22px}.zf-seo-cta-row{justify-content:stretch}.zf-seo-primary{width:100%}}
</style>`;
}

function siteHeader(base, ctaHref, ctaLabel) {
  return `<header class="zf-seo-site-header">
  <div class="zf-seo-wrap zf-seo-nav">
    <a class="zf-seo-brand" href="${base}/" aria-label="Z Find">Z <em>Find</em></a>
    ${ctaHref && ctaLabel ? `<a class="zf-seo-nav-cta" href="${ctaHref}">${escapeHtml(ctaLabel)} →</a>` : ''}
  </div>
</header>`;
}

function buildMarketPage({ baseUrl, locale, marketKey, marketLabel, publicPath, pathByLocale, heroEyebrow, heroTitle, heroLead, featuredTitle, featuredIntro, searchTitle, searchIntro, guidesTitle, guidesIntro, legalLabel, rentalLabel, openInteractive, seoTitle, seoDescription, interactiveSpaPath, legalSpaPath, touristRentalSpaPath }) {
  const base = requireBaseUrl(baseUrl);
  requireLocale(locale);
  if (!publicPath || pathByLocale[locale] !== publicPath) throw new Error('Market SEO public path mismatch.');
  const canonical = base + publicPath;
  const interactiveUrl = base + interactiveSpaPath;
  const jsonLd = { '@context':'https://schema.org', '@type':'CollectionPage', name:seoTitle, description:seoDescription, url:canonical, about:{ '@type':'Place', name:marketLabel } };
  const breadcrumbLd = { '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[ { '@type':'ListItem', position:1, name:'Z Find', item:`${base}/` }, { '@type':'ListItem', position:2, name:marketLabel, item:canonical } ] };
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(seoTitle)}</title>
<meta name="description" content="${escapeAttr(seoDescription)}">
<link rel="canonical" href="${canonical}">
${marketHreflangLinks(base,pathByLocale)}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeAttr(seoTitle)}">
<meta property="og:description" content="${escapeAttr(seoDescription)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
${presentationHead()}
</head>
<body class="zf-seo-body">
${siteHeader(base, interactiveUrl, openInteractive)}
<main class="zf-seo-main zf-seo-market" data-zfind-market-key="${escapeAttr(marketKey)}">
  <div class="zf-seo-wrap">
    <nav class="zf-seo-breadcrumb" aria-label="breadcrumb"><a href="${base}/">Z Find</a> / <span>${escapeHtml(marketLabel)}</span></nav>
    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">${escapeHtml(heroEyebrow)}</p>
      <h1>${escapeHtml(heroTitle)}</h1>
      <p class="zf-seo-lead">${escapeHtml(heroLead)}</p>
    </header>
    <div class="zf-seo-section-grid">
      <section class="zf-seo-card"><h2>${escapeHtml(featuredTitle)}</h2><p>${escapeHtml(featuredIntro)}</p></section>
      <section class="zf-seo-card"><h2>${escapeHtml(searchTitle)}</h2><p>${escapeHtml(searchIntro)}</p></section>
      <section class="zf-seo-card"><h2>${escapeHtml(guidesTitle)}</h2><p>${escapeHtml(guidesIntro)}</p><p><a href="${base}${legalSpaPath}">${escapeHtml(legalLabel)}</a> · <a href="${base}${touristRentalSpaPath}">${escapeHtml(rentalLabel)}</a></p></section>
    </div>
    <div class="zf-seo-cta-row"><a class="zf-seo-primary" href="${interactiveUrl}">${escapeHtml(openInteractive)} →</a></div>
  </div>
</main>
</body>
</html>`;
}

function buildListingPage({ kind, baseUrl, locale, availableLocales, id, title, description, priceValue, currencyIso, priceIsFrom, zoneLabel, cityLabel, countryIsoCode, imageUrl, imageAlt }) {
  const base = requireBaseUrl(baseUrl);
  requireLocale(locale);
  const alternates = normalizeAlternates(availableLocales);
  if (!alternates.includes(locale)) throw new Error('Listing locale must have genuine localized content.');
  const copy = COPY[locale];
  const pathForLocale = l => `/${l}/${kind}/${id}`;
  const canonical = base + pathForLocale(locale);
  const metaDesc = buildMetaDescription(description);
  const pageTitle = `${title} — ${zoneLabel || cityLabel || ''} | Z Find`;
  const sectionLabel = kind === 'development' ? copy.developments : copy.properties;
  const interactiveUrl = `${base}/#/${locale}/${kind}/${id}`;
  const jsonLd = JSON.parse(JSON.stringify({ '@context':'https://schema.org', '@type':'RealEstateListing', name:title, description:metaDesc, url:canonical, address:{ '@type':'PostalAddress', addressLocality:cityLabel || undefined, addressRegion:zoneLabel || undefined, addressCountry:countryIsoCode || undefined }, offers:{ '@type':'Offer', price:priceValue, priceCurrency:currencyIso, priceSpecification:priceIsFrom ? { '@type':'PriceSpecification', minPrice:priceValue } : undefined, availability:'https://schema.org/InStock' }, image:imageUrl || undefined }));
  const breadcrumbLd = { '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[ { '@type':'ListItem', position:1, name:'Z Find', item:base+'/'+locale }, { '@type':'ListItem', position:2, name:sectionLabel, item:`${base}/${locale}/search` }, { '@type':'ListItem', position:3, name:title, item:canonical } ] };
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeAttr(metaDesc)}">
<link rel="canonical" href="${canonical}">
${hreflangLinks(base,pathForLocale,alternates)}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeAttr(pageTitle)}">
<meta property="og:description" content="${escapeAttr(metaDesc)}">
<meta property="og:url" content="${canonical}">
${imageUrl ? `<meta property="og:image" content="${escapeAttr(imageUrl)}">` : ''}
<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
${presentationHead()}
</head>
<body class="zf-seo-body">
${siteHeader(base, interactiveUrl, copy.viewFull.replace(/\s*→\s*$/, ''))}
<main class="zf-seo-main">
  <div class="zf-seo-wrap">
    <nav class="zf-seo-breadcrumb" aria-label="breadcrumb"><a href="${base}/#/${locale}">Z Find</a> / <a href="${base}/#/${locale}/search">${escapeHtml(sectionLabel)}</a> / <span>${escapeHtml(title)}</span></nav>
    <article class="zf-seo-content">
      <h1>${escapeHtml(title)}</h1>
      ${imageUrl ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(imageAlt || title)}" width="1200" height="675">` : ''}
      <p>${escapeHtml(description)}</p>
      <p class="meta">${escapeHtml([zoneLabel,cityLabel].filter(Boolean).join(', '))}</p>
      <p class="price">${priceIsFrom ? escapeHtml(copy.from) : ''}${priceValue != null ? `${priceValue} ${currencyIso}` : ''}</p>
      <p><a class="zf-seo-primary" href="${interactiveUrl}">${escapeHtml(copy.viewFull)}</a></p>
    </article>
  </div>
</main>
</body>
</html>`;
}

function buildZonePage({ baseUrl, locale, zoneId, zoneName, cityName, countryIsoCode, listingCount, avgPrice, currencyIso, sampleListings, imageUrl }) {
  const base = requireBaseUrl(baseUrl);
  requireLocale(locale);
  const copy = COPY[locale];
  const pathForLocale = l => `/${l}/zone/${zoneId}`;
  const canonical = base + pathForLocale(locale);
  const searchUrl = `${base}/#/${locale}/search`;
  const hasEnoughData = listingCount >= MIN_LISTINGS_FOR_STATS;
  const formattedAvg = Math.round(avgPrice).toLocaleString(locale);
  const title = copy.zoneTitle(zoneName,cityName);
  const description = buildMetaDescription(hasEnoughData ? copy.zoneRich(listingCount,zoneName,cityName,formattedAvg,currencyIso) : copy.zoneThin(zoneName,cityName));
  const absoluteImageUrl = imageUrl ? (/^https?:\/\//.test(imageUrl) ? imageUrl : base + imageUrl) : null;
  const jsonLd = JSON.parse(JSON.stringify({ '@context':'https://schema.org', '@type':'CollectionPage', name:title, description, url:canonical, about:{ '@type':'Place', name:zoneName, address:{ '@type':'PostalAddress', addressLocality:cityName, addressCountry:countryIsoCode } }, image:absoluteImageUrl || undefined }));
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(description)}">
<link rel="canonical" href="${canonical}">
${hreflangLinks(base,pathForLocale,LOCALES)}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${canonical}">
${absoluteImageUrl ? `<meta property="og:image" content="${escapeAttr(absoluteImageUrl)}">` : ''}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
${presentationHead()}
</head>
<body class="zf-seo-body">
${siteHeader(base, searchUrl, copy.seeAll.replace(/\s*→\s*$/, ''))}
<main class="zf-seo-main">
  <div class="zf-seo-wrap">
    <nav class="zf-seo-breadcrumb" aria-label="breadcrumb"><a href="${base}/#/${locale}">Z Find</a> / <span>${escapeHtml(zoneName)}, ${escapeHtml(cityName)}</span></nav>
    <article class="zf-seo-content">
      <h1>${escapeHtml(zoneName)}, ${escapeHtml(cityName)}</h1>
      ${absoluteImageUrl ? `<img src="${escapeAttr(absoluteImageUrl)}" alt="${escapeAttr(zoneName+', '+cityName)}" width="1200" height="675">` : ''}
      ${hasEnoughData ? `<p>${escapeHtml(copy.opportunities(listingCount,formattedAvg,currencyIso))}</p>` : `<p>${escapeHtml(copy.adding(zoneName))} <a href="${searchUrl}">${escapeHtml(copy.seeAll)}</a></p>`}
      ${sampleListings && sampleListings.length ? '<ul>'+sampleListings.map(l=>`<li><a href="${base}/${locale}/${l.kind}/${l.id}">${escapeHtml(l.title)}</a></li>`).join('')+'</ul>' : ''}
    </article>
  </div>
</main>
</body>
</html>`;
}

return { buildListingPage, buildZonePage, buildMarketPage, buildMetaDescription, presentationHead, MIN_LISTINGS_FOR_STATS, SEO_PRESENTATION_VERSION, LOCALES, MARKET_LOCALES, DEFAULT_LOCALE, COPY };

});
