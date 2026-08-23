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

function buildMarketPage({ baseUrl, locale, marketKey, marketLabel, publicPath, pathByLocale, heroEyebrow, heroTitle, heroLead, featuredTitle, featuredIntro, searchTitle, searchIntro, guidesTitle, guidesIntro, legalLabel, rentalLabel, openInteractive, seoTitle, seoDescription, interactiveSpaPath, legalSpaPath, touristRentalSpaPath }) {
  const base = requireBaseUrl(baseUrl);
  requireLocale(locale);
  if (!publicPath || pathByLocale[locale] !== publicPath) throw new Error('Market SEO public path mismatch.');
  const canonical = base + publicPath;
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
</head>
<body>
<main data-zfind-market-key="${escapeAttr(marketKey)}">
  <nav aria-label="breadcrumb"><a href="${base}/">Z Find</a> / <span>${escapeHtml(marketLabel)}</span></nav>
  <header><p>${escapeHtml(heroEyebrow)}</p><h1>${escapeHtml(heroTitle)}</h1><p>${escapeHtml(heroLead)}</p></header>
  <section><h2>${escapeHtml(featuredTitle)}</h2><p>${escapeHtml(featuredIntro)}</p></section>
  <section><h2>${escapeHtml(searchTitle)}</h2><p>${escapeHtml(searchIntro)}</p></section>
  <section><h2>${escapeHtml(guidesTitle)}</h2><p>${escapeHtml(guidesIntro)}</p><p><a href="${base}${legalSpaPath}">${escapeHtml(legalLabel)}</a> · <a href="${base}${touristRentalSpaPath}">${escapeHtml(rentalLabel)}</a></p></section>
  <p><a href="${base}${interactiveSpaPath}">${escapeHtml(openInteractive)} →</a></p>
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
</head>
<body>
<main>
  <nav aria-label="breadcrumb"><a href="${base}/#/${locale}">Z Find</a> / <a href="${base}/#/${locale}/search">${escapeHtml(sectionLabel)}</a> / <span>${escapeHtml(title)}</span></nav>
  <h1>${escapeHtml(title)}</h1>
  ${imageUrl ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(imageAlt || title)}" width="1200" height="675">` : ''}
  <p>${escapeHtml(description)}</p>
  <p class="meta">${escapeHtml([zoneLabel,cityLabel].filter(Boolean).join(', '))}</p>
  <p class="price">${priceIsFrom ? escapeHtml(copy.from) : ''}${priceValue != null ? `${priceValue} ${currencyIso}` : ''}</p>
  <p><a href="${base}/#/${locale}/${kind}/${id}">${escapeHtml(copy.viewFull)}</a></p>
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
</head>
<body>
<main>
  <h1>${escapeHtml(zoneName)}, ${escapeHtml(cityName)}</h1>
  ${absoluteImageUrl ? `<img src="${escapeAttr(absoluteImageUrl)}" alt="${escapeAttr(zoneName+', '+cityName)}" width="1200" height="675">` : ''}
  ${hasEnoughData ? `<p>${escapeHtml(copy.opportunities(listingCount,formattedAvg,currencyIso))}</p>` : `<p>${escapeHtml(copy.adding(zoneName))} <a href="${base}/#/${locale}/search">${escapeHtml(copy.seeAll)}</a></p>`}
  ${sampleListings && sampleListings.length ? '<ul>'+sampleListings.map(l=>`<li><a href="${base}/${locale}/${l.kind}/${l.id}">${escapeHtml(l.title)}</a></li>`).join('')+'</ul>' : ''}
</main>
</body>
</html>`;
}

return { buildListingPage, buildZonePage, buildMarketPage, buildMetaDescription, MIN_LISTINGS_FOR_STATS, LOCALES, MARKET_LOCALES, DEFAULT_LOCALE, COPY };

});
