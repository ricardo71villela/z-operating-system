/* ============================================================
   Z FIND — guides juridiques en pages indexables (SEO)

   Les guides (achat, vente, location, location touristique) ne vivent
   que dans des vues de l'application (routes « # ») que les moteurs
   n'indexent pas. Ce module en fait, au build, des pages statiques :

     /fr/guides                                 sommaire
     /fr/guides/immobilier-france               view-legal-fr
     /fr/guides/location-touristique-france     view-tourist-rental-fr
     /fr/guides/immobilier-belgique             view-legal-belgium
     /fr/guides/location-touristique-belgique   view-tourist-rental-belgium

   Le contenu est exactement celui publié dans l'application : il passe
   par la même mise en forme publique (scripts/launch-surface.js : guides
   des marchés de lancement seulement, sans marqueurs éditoriaux). Les
   boutons de navigation de l'application deviennent de vrais liens ; la
   FAQ du guide alimente un FAQPage JSON-LD.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { buildPublicBody, splitViews } = require('./launch-surface');
const launchScope = require('../src/services/launch-scope.js');
const marketRegistry = require('../src/services/market-registry.js');
const seo = require('../src/services/seo-page-generator.js');

const HUB = '/fr/guides';
const GUIDES = Object.freeze([
  Object.freeze({
    view: 'legal-fr', path: '/fr/guides/immobilier-france', crumb: 'Acheter, vendre et louer en France',
    title: 'Acheter, vendre, louer en France : guide juridique et fiscal 2026 | Z Find',
    description: 'Compromis, acte authentique, frais de notaire, plus-values, taxe foncière, bail, copropriété, achat par un étranger : le guide juridique et fiscal de l’immobilier en France, à jour 2026.',
    card: 'Compromis, notaire, frais, plus-values, location, copropriété, acheteur étranger.'
  }),
  Object.freeze({
    view: 'tourist-rental-fr', path: '/fr/guides/location-touristique-france', crumb: 'Location touristique en France',
    title: 'Location meublée touristique en France : règles 2026 (Airbnb) | Z Find',
    description: 'Meublé de tourisme en France : numéro d’enregistrement, plafond de 120 jours pour la résidence principale, DPE, changement d’usage et fiscalité après la loi Le Meur. Guide 2026.',
    card: 'Enregistrement, 120 jours, DPE, changement d’usage, fiscalité des meublés de tourisme.'
  }),
  Object.freeze({
    view: 'legal-belgium', path: '/fr/guides/immobilier-belgique', crumb: 'Acheter, vendre et louer en Belgique',
    title: 'Acheter, vendre, louer en Belgique : guide juridique 2026 | Z Find',
    description: 'Compromis, acte notarié, droits d’enregistrement par région, précompte immobilier, bail et copropriété : le guide juridique de l’immobilier en Belgique (Wallonie, Flandre, Bruxelles).',
    card: 'Compromis, notaire, droits d’enregistrement par région, bail, copropriété.'
  }),
  Object.freeze({
    view: 'tourist-rental-belgium', path: '/fr/guides/location-touristique-belgique', crumb: 'Location touristique en Belgique',
    title: 'Location touristique en Belgique : règles 2026 par région | Z Find',
    description: 'Hébergement touristique en Belgique : enregistrement à Bruxelles, en Flandre et en Wallonie, règles incendie, urbanisme, copropriété et taxes locales. Guide 2026.',
    card: 'Règles de Bruxelles, de Wallonie et de Flandre pour la location de courte durée.'
  })
]);

const SPA_LINKS = Object.freeze({ search: '/#/fr/search?market=FR' });

/* Le même corps public que le site (scripts/build.js). */
function publicBody(srcDir) {
  const body = fs.readFileSync(path.join(srcDir || path.join(__dirname, '..', 'src'), 'body.html'), 'utf8');
  const fallback = marketRegistry.getMarket(launchScope.DEFAULT_MARKET_KEY);
  return buildPublicBody(body, {
    scope: 'launch',
    launchLocales: launchScope.LAUNCH_LOCALES,
    publicGuideRoutes: launchScope.publicGuideRoutes(marketRegistry.listMarkets()),
    defaultGuideRoutes: { legal: fallback.legalRoute, rental: fallback.touristRentalRoute }
  }).html;
}

function decode(text) {
  return String(text).replace(/<[^>]+>/g, '').replace(/&#x27;/g, '’').replace(/&#39;/g, '’').replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Les boutons et liens « navigate('vue') » deviennent de vrais liens. */
function staticLinks(html, base, routeToPath) {
  const target = view => (routeToPath[view] ? base + routeToPath[view] : SPA_LINKS[view] ? base + SPA_LINKS[view] : null);
  let out = html.replace(/<button\b([^>]*?)\s*onclick="navigate\('([a-z0-9-]+)'\)[^"]*"([^>]*)>([\s\S]*?)<\/button>/g, (all, before, view, after, inner) => {
    const href = target(view);
    if (!href) return '';
    const cls = (`${before} ${after}`.match(/class="([^"]*)"/) || [])[1] || 'btn btn-outline';
    if (/\bdisabled\b/.test(`${before} ${after}`)) return '';
    return `<a class="${cls}" href="${href}">${inner.trim()}</a>`;
  });
  out = out.replace(/<a\s+href="#"\s*onclick="navigate\('([a-z0-9-]+)'\)[^"]*"\s*>/g, (all, view) => {
    const href = target(view);
    return href ? `<a href="${href}">` : '<a>';
  });
  return out;
}

/* FAQ du guide : la liste de la section « Questions fréquentes ». */
function faqOf(html) {
  const sections = html.split(/<div class="legal-section"/);
  const faqSection = sections.find(s => /<h2>\s*QUESTIONS FRÉQUENTES\s*<\/h2>/i.test(s));
  if (!faqSection) return [];
  return [...faqSection.matchAll(/<li><strong>([\s\S]*?)<\/strong>([\s\S]*?)<\/li>/g)]
    .map(m => ({ q: decode(m[1]), a: decode(m[2]) }))
    .filter(f => f.q.endsWith('?') && f.a.length > 10);
}

function viewContent(viewHtml) {
  const start = viewHtml.indexOf('>') + 1;
  const end = viewHtml.lastIndexOf('</section>');
  return viewHtml.slice(start, end > start ? end : undefined)
    .replace(/<strong>\s*Juridiction\s*:\s*<\/strong>/g, '');
}

const STYLE = `<style id="zfind-guide-styles">
.zf-guide .legal-page{padding:8px 0 60px}.zf-guide .legal-header{max-width:820px;margin:0 0 40px}.zf-guide .legal-header .eyebrow{margin:0 0 14px;color:var(--zf-gold-dark);font-size:.72rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase}.zf-guide .legal-header h1{margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(2.4rem,5vw,4rem);font-weight:400;line-height:1.05}.zf-guide .legal-header p{color:var(--zf-700);line-height:1.7}.zf-guide .disclaimer{margin-top:18px;padding:12px 18px;background:var(--zf-50);border:1px solid var(--zf-200);color:var(--zf-500);font-size:.82rem}
.zf-guide .legal-callout{margin:16px 0;padding:14px 18px;background:var(--zf-gold-pale);border-left:3px solid var(--zf-gold);color:var(--zf-700);font-size:.9rem;line-height:1.6}.zf-guide .legal-callout a{margin:4px 6px 4px 0}
.zf-guide .btn{display:inline-flex;align-items:center;padding:10px 16px;border:1px solid var(--zf-gold);color:var(--zf-gold-dark);font-size:.72rem;font-weight:500;letter-spacing:.1em;text-transform:uppercase}.zf-guide .btn-gold{background:var(--zf-gold);color:#fff!important}
.zf-guide .legal-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:56px;align-items:start}.zf-guide .legal-toc{position:sticky;top:96px}.zf-guide .legal-toc a{display:block;padding:7px 0 7px 12px;border-left:2px solid var(--zf-200);color:var(--zf-500);font-size:.8rem;line-height:1.4}.zf-guide .legal-toc a:hover{color:var(--zf-900);border-left-color:var(--zf-gold)}
.zf-guide .legal-section{margin-bottom:52px;scroll-margin-top:96px}.zf-guide .section-num{color:var(--zf-gold-dark);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase}.zf-guide .legal-section h2{margin:6px 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:2rem;font-weight:400;text-transform:lowercase}.zf-guide .legal-section h2::first-letter{text-transform:uppercase}.zf-guide .legal-section h3{font-size:1.05rem;font-weight:600}
.zf-guide .legal-content p,.zf-guide .legal-content li{color:var(--zf-700);line-height:1.75;font-size:.97rem}.zf-guide .legal-list{padding-left:22px}.zf-guide .legal-list li{margin:8px 0}.zf-guide .legal-content a{color:var(--zf-gold-dark);font-weight:500}.zf-guide strong{font-weight:600;color:var(--zf-900)}
.zf-guide .legal-table,.zf-guide table{width:100%;border-collapse:collapse;font-size:.88rem;margin:16px 0}.zf-guide th,.zf-guide td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--zf-200);vertical-align:top}.zf-guide th{color:var(--zf-500);font-weight:600;font-size:.75rem;text-transform:uppercase}.zf-guide .table-wrap,.zf-guide .legal-table-wrap{overflow-x:auto}
.zf-guide .legal-card{padding:18px 20px;margin-bottom:14px;background:var(--zf-50);border:1px solid var(--zf-200)}
.zf-guide .legal-cta{margin-top:56px;padding:44px 32px;background:var(--zf-900);color:#fff;text-align:center}.zf-guide .legal-cta h3{margin:0 0 10px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.7rem;font-weight:400;color:#fff}.zf-guide .legal-cta p{color:#d6d3cc}.zf-guide .legal-cta .btn{margin:6px;color:#fff}
.zg-tools{display:flex;flex-wrap:wrap;gap:8px 20px;padding:0;list-style:none}.zg-tools a{color:var(--zf-gold-dark);font-weight:500}.zg-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:28px}.zg-card{display:block;padding:26px;border:1px solid var(--zf-200);background:#fff}.zg-card h2{margin:0 0 8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.6rem;font-weight:400}.zg-card p{margin:0;color:var(--zf-500);font-size:.92rem;line-height:1.6}
@media(max-width:900px){.zf-guide .legal-layout{grid-template-columns:1fr;gap:24px}.zf-guide .legal-toc{position:static;display:flex;flex-wrap:wrap;gap:4px 14px}.zf-guide .legal-toc a{border-left:0;padding:4px 0}}
</style>`;

const TOOLS = Object.freeze([
  ['/fr/frais-de-notaire', 'Calculer les frais de notaire'], ['/fr/frais-achat-immobilier-belgique', 'Frais d’achat en Belgique'],
  ['/fr/simulateur-pret-immobilier', 'Simulateur de prêt'], ['/fr/capacite-emprunt', 'Capacité d’emprunt'],
  ['/fr/rentabilite-locative', 'Rentabilité locative'], ['/fr/estimation-immobiliere', 'Estimation gratuite'],
  ['/fr/prix-immobilier/france', 'Prix au m² par commune'], ['/fr/lexique-immobilier', 'Lexique immobilier']
]);

function shell({ base, pathName, title, description, crumbs, jsonLd, main }) {
  const canonical = base + pathName;
  const desc = seo.buildMetaDescription(description, 158);
  const lds = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: base + c.path })) }].concat(jsonLd || []);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Z Find">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(base)}/brand/z-find-logo-gold.png">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary">
${lds.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
${seo.presentationHead()}
${STYLE}
</head>
<body class="zf-seo-body">
<header class="zf-seo-site-header">
  <div class="zf-seo-wrap zf-seo-nav">
    <a class="zf-seo-brand" href="${base}/" aria-label="Z Find">Z <em>Find</em></a>
    <a class="zf-seo-nav-cta" href="${base}/#/fr/estimation?market=FR&amp;mode=owner">Estimer mon bien →</a>
  </div>
</header>
<main class="zf-seo-main zf-guide">
  <div class="zf-seo-wrap">
    <nav class="zf-seo-breadcrumb" aria-label="Fil d’Ariane">${crumbs.map((c, i) => i === crumbs.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${base}${c.path}">${esc(c.name)}</a>`).join(' / ')}</nav>
${main}
    <section style="margin-top:40px"><h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;font-size:1.8rem">Outils gratuits Z Find</h2><ul class="zg-tools">${TOOLS.map(([p, l]) => `<li><a href="${base}${p}">${esc(l)}</a></li>`).join('')}</ul></section>
  </div>
</main>
</body>
</html>`;
}

/* Pages des guides publiés : [{ path, html, faqCount }]. */
function buildGuidePages(baseUrl, options) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('Guide pages require a real SITE_BASE_URL.');
  const body = (options && options.publicBodyHtml) || publicBody(options && options.srcDir);
  const views = Object.fromEntries(splitViews(body).filter(p => p.view).map(p => [p.view, p.html]));
  const published = GUIDES.filter(g => views[g.view]);
  const routeToPath = Object.fromEntries(published.map(g => [g.view, g.path]));
  const hubCrumb = { name: 'Guides', path: HUB };
  const pages = published.map(g => {
    const raw = viewContent(views[g.view]);
    const faq = faqOf(raw);
    const html = staticLinks(raw, base, routeToPath);
    if (/onclick=|navigate\(/.test(html)) throw new Error(`GUIDE PAGES: application navigation left in ${g.view}`);
    const h1 = decode((html.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || g.crumb);
    const jsonLd = [{ '@context': 'https://schema.org', '@type': 'Article', headline: h1, description: g.description, inLanguage: 'fr', url: base + g.path,
      publisher: { '@type': 'Organization', name: 'Z Find', url: `${base}/`, logo: { '@type': 'ImageObject', url: `${base}/brand/z-find-logo-gold.png` } } }];
    if (faq.length) jsonLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
    return {
      path: g.path, view: g.view, faqCount: faq.length,
      html: shell({ base, pathName: g.path, title: g.title, description: g.description, crumbs: [{ name: 'Z Find', path: '/' }, hubCrumb, { name: g.crumb, path: g.path }], jsonLd, main: html })
    };
  });
  if (!pages.length) return [];
  const hubMain = `    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Guides juridiques · France et Belgique</p>
      <h1>Guides de l’immobilier</h1>
      <p class="zf-seo-lead">Acheter, vendre, louer ou mettre en location touristique : les règles juridiques et fiscales expliquées pays par pays, avec leurs sources.</p>
    </header>
    <section class="zg-cards">${published.map(g => `<a class="zg-card" href="${base}${g.path}"><h2>${esc(g.crumb)} →</h2><p>${esc(g.card)}</p></a>`).join('')}</section>`;
  pages.unshift({
    path: HUB, view: null, faqCount: 0,
    html: shell({ base, pathName: HUB, title: 'Guides juridiques de l’immobilier : France et Belgique | Z Find',
      description: 'Guides juridiques et fiscaux pour acheter, vendre, louer et louer en courte durée en France et en Belgique : notaire, frais, impôts, bail, copropriété, règles locales.',
      crumbs: [{ name: 'Z Find', path: '/' }, hubCrumb], main: hubMain,
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Guides de l’immobilier', url: base + HUB, inLanguage: 'fr' }] })
  });
  return pages;
}

module.exports = { GUIDES, HUB, buildGuidePages, faqOf, staticLinks, publicBody };
