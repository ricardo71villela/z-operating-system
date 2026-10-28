/* ============================================================
   Z FIND — guides juridiques en pages indexables (SEO), v2

   Le contenu juridique reste celui publié dans l'application (vues SPA,
   mise en forme publique de scripts/launch-surface.js). Ce module le
   transforme, au build, en vraies pages éditoriales :

     /fr/guides                                   sommaire
     /fr/guides/immobilier-france                 guide France : l'essentiel,
                                                  les chapitres, la FAQ
     /fr/guides/immobilier-france/{chapitre}      un chapitre par page
                                                  (acheter, vendre, plus-values,
                                                  impôts, location, copropriété,
                                                  acheteur étranger)
     /fr/guides/location-touristique-france       guide d'une page
     /fr/guides/immobilier-belgique               guide d'une page
     /fr/guides/location-touristique-belgique     guide d'une page

   Nettoyage : plus de mentions internes (« Niveau : NATIONAL »,
   « Juridiction », « Module séparé »), titres en minuscules, glossaire
   remplacé par le lexique immobilier, dont les termes sont liés dans le
   texte (première occurrence). Chaque page propose les simulateurs utiles,
   le chapitre précédent et le suivant.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { buildPublicBody, splitViews } = require('./launch-surface');
const launchScope = require('../src/services/launch-scope.js');
const marketRegistry = require('../src/services/market-registry.js');
const seo = require('../src/services/seo-page-generator.js');
const lexicon = require('./lexicon-pages.js');

const HUB = '/fr/guides';
const FR_GUIDE = '/fr/guides/immobilier-france';

const GUIDES = Object.freeze([
  Object.freeze({
    view: 'legal-fr', path: FR_GUIDE, crumb: 'Immobilier en France', chaptered: true,
    h1: 'Acheter, vendre et louer en France : le guide 2026',
    title: 'Acheter, vendre, louer en France : guide juridique et fiscal 2026 | Z Find',
    description: 'Compromis, acte authentique, frais de notaire, plus-values, taxe foncière, bail, copropriété, achat par un étranger : le guide juridique et fiscal de l’immobilier en France, à jour 2026.',
    card: 'Compromis, notaire, frais, plus-values, location, copropriété, acheteur étranger.'
  }),
  Object.freeze({
    view: 'tourist-rental-fr', path: '/fr/guides/location-touristique-france', crumb: 'Location touristique en France',
    h1: 'Location meublée touristique en France : les règles 2026',
    title: 'Location meublée touristique en France : règles 2026 (Airbnb) | Z Find',
    description: 'Meublé de tourisme en France : numéro d’enregistrement, plafond de 120 jours pour la résidence principale, DPE, changement d’usage et fiscalité après la loi Le Meur. Guide 2026.',
    card: 'Enregistrement, 120 jours, DPE, changement d’usage, fiscalité des meublés de tourisme.'
  }),
  Object.freeze({
    view: 'legal-belgium', path: '/fr/guides/immobilier-belgique', crumb: 'Immobilier en Belgique',
    h1: 'Acheter, vendre et louer en Belgique : le guide 2026',
    title: 'Acheter, vendre, louer en Belgique : guide juridique 2026 | Z Find',
    description: 'Compromis, acte notarié, droits d’enregistrement par région, précompte immobilier, bail et copropriété : le guide juridique de l’immobilier en Belgique (Wallonie, Flandre, Bruxelles).',
    card: 'Compromis, notaire, droits d’enregistrement par région, bail, copropriété.'
  }),
  Object.freeze({
    view: 'tourist-rental-belgium', path: '/fr/guides/location-touristique-belgique', crumb: 'Location touristique en Belgique',
    h1: 'Location touristique en Belgique : les règles 2026 par région',
    title: 'Location touristique en Belgique : règles 2026 par région | Z Find',
    description: 'Hébergement touristique en Belgique : enregistrement à Bruxelles, en Flandre et en Wallonie, règles incendie, urbanisme, copropriété et taxes locales. Guide 2026.',
    card: 'Règles de Bruxelles, de Wallonie et de Flandre pour la location de courte durée.'
  })
]);

/* Chapitres du guide France (sections de la vue legal-fr). */
const FR_CHAPTERS = Object.freeze([
  { id: 'fr-lg-a', slug: 'acheter', name: 'Acheter', h1: 'Acheter un bien immobilier en France',
    title: 'Acheter un bien immobilier en France : étapes, frais et délais (2026) | Z Find',
    description: 'Offre d’achat, compromis, délai de rétractation de 10 jours, diagnostics, prêt, acte authentique et frais de notaire : les étapes d’un achat immobilier en France en 2026.',
    tools: ['frais', 'capacite', 'pret', 'prix'] },
  { id: 'fr-lg-b', slug: 'vendre', name: 'Vendre', h1: 'Vendre un bien immobilier en France',
    title: 'Vendre un bien immobilier en France : obligations et coûts (2026) | Z Find',
    description: 'Diagnostics, devoir d’information, coûts du vendeur, rôle du notaire : ce qu’il faut savoir pour vendre un bien immobilier en France en 2026.',
    tools: ['estimation', 'prix', 'frais'] },
  { id: 'fr-lg-c', slug: 'plus-values', name: 'Plus-values', h1: 'La plus-value immobilière en France',
    title: 'Plus-value immobilière en France : calcul, abattements, exonérations (2026) | Z Find',
    description: 'Résidence principale exonérée, abattements pour durée de détention, surtaxe, non-résidents, SCI : comment la plus-value immobilière est taxée en France en 2026.',
    tools: ['estimation', 'prix'] },
  { id: 'fr-lg-d', slug: 'impots', name: 'Impôts', h1: 'Les impôts de l’immobilier en France',
    title: 'Impôts immobiliers en France : frais d’achat, taxe foncière, IFI (2026) | Z Find',
    description: 'Droits de mutation à l’achat, taxe foncière, taxe d’habitation des résidences secondaires, IFI : les impôts liés à l’achat et à la détention d’un bien en France en 2026.',
    tools: ['frais', 'rentabilite'] },
  { id: 'fr-lg-e', slug: 'location', name: 'Louer', h1: 'Louer un logement en France',
    title: 'Louer un logement en France : bail, dépôt de garantie, préavis (2026) | Z Find',
    description: 'Durée du bail, dépôt de garantie, congé, révision du loyer, zones tendues et encadrement des loyers : les règles de la location résidentielle en France en 2026.',
    tools: ['rentabilite', 'estimation'] },
  { id: 'fr-lg-f', slug: 'copropriete', name: 'Copropriété', h1: 'La copropriété en France',
    title: 'Copropriété en France : syndic, charges, assemblée générale (2026) | Z Find',
    description: 'Syndic, conseil syndical, charges, fonds de travaux, majorités en assemblée générale, plan pluriannuel de travaux : le fonctionnement d’une copropriété en France.',
    tools: ['frais', 'estimation'] },
  { id: 'fr-lg-g', slug: 'acheteur-etranger', name: 'Acheteur étranger', h1: 'Acheter en France quand on est étranger',
    title: 'Acheter en France quand on est étranger : règles et fiscalité (2026) | Z Find',
    description: 'Aucune restriction générale de nationalité, terres agricoles, séjour, contrôles anti-blanchiment et représentation fiscale : acheter un bien en France depuis l’étranger.',
    tools: ['frais', 'capacite', 'prix'] }
]);
const FR_FAQ_ID = 'fr-lg-h';
const FR_GLOSSARY_ID = 'fr-lg-i';

const TOOLS = Object.freeze({
  frais: ['/fr/frais-de-notaire', 'Calculer les frais de notaire'],
  fraisBe: ['/fr/frais-achat-immobilier-belgique', 'Frais d’achat en Belgique'],
  pret: ['/fr/simulateur-pret-immobilier', 'Simuler un prêt immobilier'],
  capacite: ['/fr/capacite-emprunt', 'Calculer sa capacité d’emprunt'],
  rentabilite: ['/fr/rentabilite-locative', 'Calculer la rentabilité locative'],
  estimation: ['/fr/estimation-immobiliere', 'Estimer un bien gratuitement'],
  prix: ['/fr/prix-immobilier/france', 'Prix au m² par commune'],
  prixBe: ['/fr/prix-immobilier/belgique', 'Prix de l’immobilier en Belgique']
});
const GUIDE_TOOLS = Object.freeze({
  'legal-fr': ['frais', 'pret', 'capacite', 'estimation', 'prix'],
  'tourist-rental-fr': ['rentabilite', 'estimation', 'frais', 'prix'],
  'legal-belgium': ['fraisBe', 'prixBe', 'pret', 'estimation', 'frais'],
  'tourist-rental-belgium': ['rentabilite', 'prixBe', 'estimation', 'frais']
});

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
function slugify(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[’']/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
/* « ACHETER UN BIEN IMMOBILIER » → « Acheter un bien immobilier ». */
function sentenceCase(text) {
  const t = decode(text);
  if (t !== t.toUpperCase()) return t;
  const lower = t.toLocaleLowerCase('fr');
  return lower.charAt(0).toLocaleUpperCase('fr') + lower.slice(1);
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

/* Vue SPA → { h1, lead, updated, sections: [{ id, title, html }] }. */
function parseView(viewHtml) {
  const h1 = decode((viewHtml.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || '');
  const header = (viewHtml.match(/<div class="legal-header">([\s\S]*?)<div class="legal-layout">/) || [])[1] || '';
  const lead = decode((header.match(/<h1>[\s\S]*?<\/h1>\s*<p>([\s\S]*?)<\/p>/) || [])[1] || '');
  const upd = decode(viewHtml).match(/Règles vérifiées jusqu’(?:en|au) ([^.]+)\./);
  const content = viewHtml.slice(viewHtml.indexOf('<div class="legal-content">'));
  const sections = content.split(/<div class="legal-section"/).slice(1).map(part => {
    const id = (part.match(/^\s*id="([^"]+)"/) || [])[1] || '';
    const title = sentenceCase((part.match(/<h2>([\s\S]*?)<\/h2>/) || [])[1] || '');
    let html = part.replace(/^[^>]*>/, '');
    html = html.replace(/<div class="section-num">[\s\S]*?<\/div>/, '').replace(/<h2>[\s\S]*?<\/h2>/, '');
    // Dernier </div> de la section (et fermetures du gabarit après la dernière).
    html = html.replace(/(<\/div>\s*)+(<\/section>[\s\S]*)?$/, '');
    return { id, title, html: html.trim() };
  });
  return { h1, lead, updated: upd ? upd[1] : null, sections };
}

/* Nettoyage éditorial d'une section : mentions internes retirées, notes
   « à confirmer » mises en forme, intertitres repérables (ancres). */
function cleanSection(html, base, guidePath) {
  const chapterOf = Object.fromEntries(FR_CHAPTERS.map(c => [c.id.slice(-1).toUpperCase(), c]));
  let out = html
    .replace(/voir section ([A-G])\b/g, (all, letter) => {
      const c = chapterOf[letter];
      return c && base && guidePath ? `voir le chapitre <a href="${base}${guidePath}/${c.slug}">${c.name}</a>` : `voir le chapitre ${c ? c.name : letter}`;
    })
    .replace(/<p>\s*<strong>\s*Niveau\s*:[\s\S]*?<\/p>/gi, '')
    .replace(/<p><strong>(Encadrement national|Encadrement local)\s*\((?:NATIONAL|MUNICIPAL|LOCAL)\)\s*:<\/strong><\/p>/g, '<p><strong>$1 :</strong></p>')
    .replace(/\s*\((?:NATIONAL|MUNICIPAL|DÉPARTEMENTAL|RÉGIONAL)\)\s*/g, ' ')
    .replace(/<p><strong>(À confirmer localement|Ne jamais assimiler automatiquement)([\s\S]*?)<\/p>/g, (all, label, rest) =>
      `<p class="zg-note"><strong>${label === 'À confirmer localement' ? 'À vérifier pour votre bien' : label}${rest}</p>`);
  const used = new Set();
  out = out.replace(/<p><strong>([^<]{3,90}?)\s*:?\s*<\/strong>/g, (all, label) => {
    let id = slugify(decode(label)).slice(0, 60) || 'section';
    while (used.has(id)) id += '-2';
    used.add(id);
    return `<p id="${id}"><strong>${label}</strong>`;
  });
  // Le texte qui suit un intertitre commence par une majuscule.
  out = out.replace(/(<p id="[^"]+"><strong>[^<]+<\/strong>)\s*([a-zàâäéèêëîïôöûüç])/g, (all, head, ch) => `${head} ${ch.toLocaleUpperCase('fr')}`);
  return out;
}

/* Intertitres d'une section (pour « Dans ce chapitre »). */
function subheadings(html) {
  return [...html.matchAll(/<p id="([^"]+)"><strong>([^<]+)<\/strong>/g)]
    .map(m => ({ id: m[1], label: decode(m[2]).replace(/\s*:\s*$/, '') }))
    .filter(h => !/^À vérifier|^Ne jamais/.test(h.label));
}

/* ---------------- lien vers le lexique (première occurrence) ---------------- */
let LEXICON_CACHE = null;
function lexiconNames() {
  if (LEXICON_CACHE) return LEXICON_CACHE;
  const out = [];
  for (const t of lexicon.loadLexicon()) {
    const href = `${lexicon.FR_HUB}/${t.slug}`;
    const names = new Set([t.term.replace(/\s*\([^)]*\)\s*/g, ' ').trim()]);
    (t.term.match(/\(([A-Z][A-Z0-9’' -]{1,10})\)/g) || []).forEach(m => names.add(m.slice(1, -1)));
    t.synonyms.filter(s => /^[A-Z]{2,6}$/.test(s)).forEach(s => names.add(s));
    for (const name of names) if (name.length >= 3) out.push({ name, href, slug: t.slug, term: t.term });
  }
  out.sort((a, b) => b.name.length - a.name.length);
  LEXICON_CACHE = out;
  return out;
}
function nameRegex(name) {
  const body = name.split('').map(c => (/[’']/.test(c) ? "(?:’|'|&#x27;|&#39;)" : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
  const caseFlag = /^[A-Z0-9 ]+$/.test(name) ? '' : 'i';
  return new RegExp(`(^|[^\\p{L}\\p{N}])(${body})(?![\\p{L}\\p{N}])`, `u${caseFlag}`);
}
/* Lie la première occurrence de chaque terme du lexique dans le texte des
   paragraphes et listes (jamais dans un lien ni un titre). « linked » est
   partagé par la page : un terme n'est lié qu'une fois. */
function linkLexicon(html, base, linked, max) {
  const limit = max || 30;
  const tokens = html.split(/(<[^>]+>)/);
  let inA = 0; let inHead = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.startsWith('<')) {
      if (/^<a\b/i.test(tok)) inA++; else if (/^<\/a>/i.test(tok)) inA = Math.max(0, inA - 1);
      if (/^<h[1-6]\b/i.test(tok)) inHead++; else if (/^<\/h[1-6]>/i.test(tok)) inHead = Math.max(0, inHead - 1);
      continue;
    }
    if (inA || inHead || !tok.trim()) continue;
    let text = tok;
    const links = [];
    for (const n of lexiconNames()) {
      if (linked.size >= limit) break;
      if (linked.has(n.slug)) continue;
      const m = text.match(nameRegex(n.name));
      if (!m) continue;
      const at = m.index + m[1].length;
      links.push(`<a class="zg-term" href="${base}${n.href}">${m[2]}</a>`);
      text = `${text.slice(0, at)}\u0000${links.length - 1}\u0000${text.slice(at + m[2].length)}`;
      linked.set(n.slug, n);
    }
    tokens[i] = text.replace(/\u0000(\d+)\u0000/g, (all, k) => links[Number(k)]);
  }
  return tokens.join('');
}

/* ---------------- gabarit ---------------- */
const STYLE = `<style id="zfind-guide-styles">
.zg{max-width:1180px}.zg-head{max-width:820px;margin:8px 0 34px}.zg-eyebrow{margin:0 0 14px;color:var(--zf-gold-dark);font-size:.72rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase}.zg-head h1{margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(2.3rem,5vw,3.8rem);font-weight:400;line-height:1.05}.zg-lead{margin:0;color:var(--zf-700);font-size:1.08rem;line-height:1.7}.zg-meta{margin:14px 0 0;color:var(--zf-500);font-size:.82rem}
.zg-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:56px;align-items:start}.zg-aside{position:sticky;top:96px;display:grid;gap:18px}
.zg-box{padding:20px 22px;border:1px solid var(--zf-200);background:var(--zf-50)}.zg-box h2{margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;font-weight:400}.zg-box ul,.zg-box ol{margin:0;padding:0;list-style:none}.zg-box li{margin:0 0 8px;font-size:.9rem;line-height:1.45}.zg-box a{color:var(--zf-gold-dark);font-weight:500}.zg-box li.on a{color:var(--zf-900);font-weight:600}
.zg-body{max-width:760px}.zg-body p,.zg-body li{color:var(--zf-700);font-size:1rem;line-height:1.8}.zg-body p{margin:0 0 16px}.zg-body p[id]{scroll-margin-top:96px}.zg-body p[id]>strong:first-child{display:block;margin:30px 0 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:500;color:var(--zf-900)}.zg-body ol,.zg-body ul{margin:0 0 20px;padding-left:22px}.zg-body li{margin:0 0 10px}.zg-body strong{font-weight:600;color:var(--zf-900)}.zg-body a{color:var(--zf-gold-dark);font-weight:500}.zg-body a.zg-term{color:inherit;font-weight:inherit;border-bottom:1px dotted var(--zf-gold)}.zg-body a.zg-term:hover{color:var(--zf-gold-dark)}
.zg-body h2{margin:44px 0 14px;font-family:'Cormorant Garamond',Georgia,serif;font-size:2rem;font-weight:400;scroll-margin-top:96px}.zg-body h3{margin:24px 0 8px;font-size:1.05rem;font-weight:600}.zg-body table{width:100%;border-collapse:collapse;font-size:.9rem;margin:16px 0}.zg-body th,.zg-body td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--zf-200);vertical-align:top}.zg-body .table-wrap,.zg-body .legal-table-wrap{overflow-x:auto}
.zg-body .zg-note{margin:22px 0;padding:14px 18px;border-left:3px solid var(--zf-gold);background:var(--zf-gold-pale);font-size:.93rem}.zg-body .zg-note strong{display:inline!important;margin:0!important;font-family:inherit!important;font-size:inherit!important}
.zg-body .legal-card{margin:0 0 14px;padding:16px 20px;border:1px solid var(--zf-200);background:#fff}.zg-body .legal-card h3{margin-top:0}.zg-body .legal-callout{margin:16px 0;padding:14px 18px;background:var(--zf-gold-pale);border-left:3px solid var(--zf-gold)}.zg-body .btn{display:inline-flex;margin:4px 6px 4px 0;padding:8px 14px;border:1px solid var(--zf-gold);color:var(--zf-gold-dark);font-size:.72rem;letter-spacing:.1em;text-transform:uppercase}
.zg-pager{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:44px 0 0}.zg-pager a{display:block;padding:18px 20px;border:1px solid var(--zf-200);background:#fff}.zg-pager a span{display:block;color:var(--zf-500);font-size:.75rem;letter-spacing:.12em;text-transform:uppercase}.zg-pager a strong{display:block;margin-top:6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;font-weight:500}.zg-pager .next{text-align:right;grid-column:2}
.zg-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;margin:8px 0 0}.zg-card{display:block;padding:22px 24px;border:1px solid var(--zf-200);background:#fff;transition:box-shadow .2s}.zg-card:hover{box-shadow:var(--zf-shadow)}.zg-card .n{color:var(--zf-gold-dark);font-size:.72rem;letter-spacing:.16em;text-transform:uppercase}.zg-card h3{margin:6px 0 8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.6rem;font-weight:400}.zg-card p{margin:0;color:var(--zf-500);font-size:.9rem;line-height:1.55}
.zg-faq details{border-bottom:1px solid var(--zf-200);padding:14px 0}.zg-faq summary{cursor:pointer;font-weight:600;color:var(--zf-900);line-height:1.5}.zg-faq details p{margin:10px 0 0}
.zg-chips{display:flex;flex-wrap:wrap;gap:8px}.zg-chips a{padding:6px 10px;border:1px solid var(--zf-200);background:#fff;font-size:.82rem;color:var(--zf-700)!important;font-weight:400!important}
.zg-disclaimer{margin:40px 0 0;padding:14px 18px;border:1px solid var(--zf-200);color:var(--zf-500);font-size:.82rem;line-height:1.6}
@media(max-width:960px){.zg-layout{grid-template-columns:1fr;gap:28px}.zg-aside{position:static}.zg-pager{grid-template-columns:1fr}.zg-pager .next{grid-column:1}}
</style>`;

const DISCLAIMER = 'Information générale à caractère informatif, à jour à la date indiquée. Elle ne constitue pas un conseil juridique, fiscal ou financier et ne remplace pas l’analyse d’un professionnel (notaire, avocat, conseiller fiscal).';

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
<main class="zf-seo-main">
  <div class="zf-seo-wrap zg">
    <nav class="zf-seo-breadcrumb" aria-label="Fil d’Ariane">${crumbs.map((c, i) => i === crumbs.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${base}${c.path}">${esc(c.name)}</a>`).join(' / ')}</nav>
${main}
  </div>
</main>
</body>
</html>`;
}

function toolsBox(base, keys) {
  return `<section class="zg-box zg-tools"><h2>Outils gratuits</h2><ul>${keys.map(k => TOOLS[k]).filter(Boolean).map(([p, l]) => `<li><a href="${base}${p}">${esc(l)}</a></li>`).join('')}</ul></section>`;
}
function termsBox(base, linked) {
  if (!linked.size) return '';
  const items = [...linked.values()].sort((a, b) => a.term.localeCompare(b.term, 'fr'));
  return `<section class="zg-box"><h2>Termes du lexique</h2><div class="zg-chips">${items.map(n => `<a href="${base}${n.href}">${esc(n.term)}</a>`).join('')}</div><p style="margin:12px 0 0;font-size:.85rem"><a href="${base}${lexicon.FR_HUB}">Tout le lexique immobilier →</a></p></section>`;
}
function readingMinutes(html) { return Math.max(2, Math.round(decode(html).split(' ').length / 220)); }
function updatedText(updated) { return updated ? `Règles vérifiées jusqu’${/^\d/.test(updated) ? 'au' : 'en'} ${updated}` : 'Mis à jour en 2026'; }
function articleLd(base, pathName, headline, description, updated) {
  return { '@context': 'https://schema.org', '@type': 'Article', headline, description, inLanguage: 'fr', url: base + pathName,
    publisher: { '@type': 'Organization', name: 'Z Find', url: `${base}/`, logo: { '@type': 'ImageObject', url: `${base}/brand/z-find-logo-gold.png` } },
    ...(updated ? { dateModified: '2026-08' } : {}) };
}
function faqLd(faq) {
  return faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : [];
}
function faqSection(faq, title) {
  if (!faq.length) return '';
  return `<section class="zg-faq"><h2 id="questions-frequentes">${esc(title || 'Questions fréquentes')}</h2>${faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>`;
}

/* ---------------- pages ---------------- */
function chapterPages(base, guide, parsed, routeToPath, faq) {
  const byId = Object.fromEntries(parsed.sections.map(s => [s.id, s]));
  const chapters = FR_CHAPTERS.filter(c => byId[c.id]);
  const hubCrumb = { name: 'Guides', path: HUB };
  const guideCrumb = { name: guide.crumb, path: guide.path };
  const pages = chapters.map((c, i) => {
    const linked = new Map();
    const raw = cleanSection(staticLinks(byId[c.id].html, base, routeToPath), base, guide.path);
    const body = linkLexicon(raw, base, linked);
    const subs = subheadings(raw);
    const prev = chapters[i - 1]; const next = chapters[i + 1];
    const p = `${guide.path}/${c.slug}`;
    const main = `    <header class="zg-head">
      <p class="zg-eyebrow">Guide · Immobilier en France · Chapitre ${i + 1} sur ${chapters.length}</p>
      <h1>${esc(c.h1)}</h1>
      <p class="zg-lead">${esc(c.description)}</p>
      <p class="zg-meta">${esc(updatedText(parsed.updated))} · Lecture ${readingMinutes(body)} min</p>
    </header>
    <div class="zg-layout">
      <article class="zg-body">
${body}
        <nav class="zg-pager" aria-label="Chapitres">${prev ? `<a href="${base}${guide.path}/${prev.slug}"><span>← Chapitre précédent</span><strong>${esc(prev.h1)}</strong></a>` : ''}${next ? `<a class="next" href="${base}${guide.path}/${next.slug}"><span>Chapitre suivant →</span><strong>${esc(next.h1)}</strong></a>` : `<a class="next" href="${base}${guide.path}#questions-frequentes"><span>Pour finir →</span><strong>Questions fréquentes</strong></a>`}</nav>
        <p class="zg-disclaimer">${esc(DISCLAIMER)}</p>
      </article>
      <aside class="zg-aside">
        ${subs.length ? `<section class="zg-box"><h2>Dans ce chapitre</h2><ul>${subs.map(s => `<li><a href="#${s.id}">${esc(s.label)}</a></li>`).join('')}</ul></section>` : ''}
        <section class="zg-box"><h2>Le guide</h2><ol>${chapters.map(o => `<li${o === c ? ' class="on"' : ''}><a href="${base}${guide.path}/${o.slug}">${esc(o.h1)}</a></li>`).join('')}<li><a href="${base}${guide.path}#questions-frequentes">Questions fréquentes</a></li></ol></section>
        ${toolsBox(base, c.tools)}
        ${termsBox(base, linked)}
      </aside>
    </div>`;
    return {
      path: p, view: guide.view, chapter: c.slug, faqCount: 0,
      html: shell({ base, pathName: p, title: c.title, description: c.description,
        crumbs: [{ name: 'Z Find', path: '/' }, hubCrumb, guideCrumb, { name: c.name, path: p }],
        jsonLd: [articleLd(base, p, c.h1, c.description, parsed.updated)], main })
    };
  });
  // Page d'entrée du guide : chapitres + FAQ.
  const main = `    <header class="zg-head">
      <p class="zg-eyebrow">Guide juridique · France</p>
      <h1>${esc(guide.h1)}</h1>
      <p class="zg-lead">${esc(parsed.lead || guide.description)} Le guide est découpé en ${chapters.length} chapitres : lisez celui qui correspond à votre projet.</p>
      <p class="zg-meta">${esc(updatedText(parsed.updated))}</p>
    </header>
    <div class="zg-layout">
      <div class="zg-body">
        <h2>Les chapitres</h2>
        <div class="zg-cards">${chapters.map((c, i) => {
          const subs = subheadings(cleanSection(byId[c.id].html)).slice(0, 4).map(s => s.label);
          return `<a class="zg-card" href="${base}${guide.path}/${c.slug}"><span class="n">Chapitre ${i + 1}</span><h3>${esc(c.h1)}</h3><p>${esc(subs.length ? subs.join(' · ') : c.description)}</p></a>`;
        }).join('')}</div>
        ${faqSection(faq)}
        <h2>Aller plus loin</h2>
        <ul>
          <li><a href="${base}${routeToPath['tourist-rental-fr'] || '/fr/guides/location-touristique-france'}">Location meublée touristique en France : les règles 2026</a></li>
          <li><a href="${base}${routeToPath['legal-belgium'] || '/fr/guides/immobilier-belgique'}">Acheter, vendre et louer en Belgique</a></li>
          <li><a href="${base}${lexicon.FR_HUB}">Lexique immobilier : 150 termes expliqués</a></li>
          <li><a href="${base}/fr/prix-immobilier/france">Prix de l’immobilier par région, département et commune</a></li>
        </ul>
        <p class="zg-disclaimer">${esc(DISCLAIMER)}</p>
      </div>
      <aside class="zg-aside">${toolsBox(base, GUIDE_TOOLS[guide.view])}</aside>
    </div>`;
  const entry = {
    path: guide.path, view: guide.view, chapter: null, faqCount: faq.length,
    html: shell({ base, pathName: guide.path, title: guide.title, description: guide.description,
      crumbs: [{ name: 'Z Find', path: '/' }, hubCrumb, guideCrumb],
      jsonLd: [articleLd(base, guide.path, guide.h1, guide.description, parsed.updated)].concat(faqLd(faq)), main })
  };
  return [entry].concat(pages);
}

function singlePage(base, guide, parsed, routeToPath, faq) {
  const linked = new Map();
  const sections = parsed.sections.map(s => {
    const raw = cleanSection(staticLinks(s.html, base, routeToPath), base, guide.path);
    const id = s.id || slugify(s.title);
    const title = /^Module séparé/i.test(s.title) ? 'Le régime du meublé de tourisme' : s.title;
    return { id, title, raw };
  });
  const body = sections.map(s => `<h2 id="${esc(s.id)}">${esc(s.title)}</h2>\n${linkLexicon(s.raw, base, linked)}`).join('\n');
  const toc = sections.length > 1 ? sections.map(s => ({ id: s.id, label: s.title })) : subheadings(sections[0] ? sections[0].raw : '').map(h => ({ id: h.id, label: h.label }));
  const others = GUIDES.filter(g => g !== guide && routeToPath[g.view]);
  const main = `    <header class="zg-head">
      <p class="zg-eyebrow">Guide juridique · ${/belgi/.test(guide.view) ? 'Belgique' : 'France'}</p>
      <h1>${esc(guide.h1)}</h1>
      <p class="zg-lead">${esc(parsed.lead || guide.description)}</p>
      <p class="zg-meta">${esc(updatedText(parsed.updated))} · Lecture ${readingMinutes(body)} min</p>
    </header>
    <div class="zg-layout">
      <article class="zg-body">
${body}
        ${faqSection(faq)}
        <p class="zg-disclaimer">${esc(DISCLAIMER)}</p>
      </article>
      <aside class="zg-aside">
        ${toc.length ? `<section class="zg-box"><h2>Dans ce guide</h2><ul>${toc.map(s => `<li><a href="#${esc(s.id)}">${esc(s.label)}</a></li>`).join('')}</ul></section>` : ''}
        ${toolsBox(base, GUIDE_TOOLS[guide.view])}
        <section class="zg-box"><h2>Autres guides</h2><ul>${others.map(g => `<li><a href="${base}${g.path}">${esc(g.h1)}</a></li>`).join('')}</ul></section>
        ${termsBox(base, linked)}
      </aside>
    </div>`;
  return [{
    path: guide.path, view: guide.view, chapter: null, faqCount: faq.length,
    html: shell({ base, pathName: guide.path, title: guide.title, description: guide.description,
      crumbs: [{ name: 'Z Find', path: '/' }, { name: 'Guides', path: HUB }, { name: guide.crumb, path: guide.path }],
      jsonLd: [articleLd(base, guide.path, guide.h1, guide.description, parsed.updated)].concat(faqLd(faq)), main })
  }];
}

/* Pages des guides publiés : [{ path, view, chapter, html, faqCount }]. */
function buildGuidePages(baseUrl, options) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('Guide pages require a real SITE_BASE_URL.');
  const bodyHtml = (options && options.publicBodyHtml) || publicBody(options && options.srcDir);
  const views = Object.fromEntries(splitViews(bodyHtml).filter(p => p.view).map(p => [p.view, p.html]));
  const published = GUIDES.filter(g => views[g.view]);
  const routeToPath = Object.fromEntries(published.map(g => [g.view, g.path]));
  const pages = [];
  for (const g of published) {
    const parsed = parseView(views[g.view]);
    const faq = faqOf(views[g.view]);
    parsed.sections = parsed.sections.filter(s => s.id !== FR_GLOSSARY_ID && s.id !== FR_FAQ_ID && !/^Glossaire$/i.test(s.title) && !/^Questions fréquentes$/i.test(s.title));
    const built = g.chaptered ? chapterPages(base, g, parsed, routeToPath, faq) : singlePage(base, g, parsed, routeToPath, faq);
    for (const p of built) {
      if (/onclick=|navigate\(/.test(p.html)) throw new Error(`GUIDE PAGES: application navigation left in ${p.path}`);
      if (/Niveau\s*:\s*<\/strong>|Niveau : NATIONAL|MODULE SÉPARÉ/.test(p.html)) throw new Error(`GUIDE PAGES: internal marker left in ${p.path}`);
    }
    pages.push(...built);
  }
  if (!pages.length) return [];
  const hubMain = `    <header class="zg-head">
      <p class="zg-eyebrow">Guides juridiques · France et Belgique</p>
      <h1>Guides de l’immobilier</h1>
      <p class="zg-lead">Acheter, vendre, louer ou mettre en location touristique : les règles juridiques et fiscales expliquées pays par pays, chapitre par chapitre.</p>
    </header>
    <div class="zg-cards">${published.map(g => `<a class="zg-card" href="${base}${g.path}"><span class="n">${/belgi/.test(g.view) ? 'Belgique' : 'France'}</span><h3>${esc(g.h1)}</h3><p>${esc(g.card)}</p></a>`).join('')}</div>
    ${routeToPath['legal-fr'] ? `<section class="zg-body" style="margin-top:40px"><h2>Les chapitres du guide France</h2><ul>${FR_CHAPTERS.map(c => `<li><a href="${base}${FR_GUIDE}/${c.slug}">${esc(c.h1)}</a></li>`).join('')}</ul></section>` : ''}
    <section class="zg-body" style="margin-top:24px"><h2>Le vocabulaire</h2><p><a href="${base}${lexicon.FR_HUB}">Lexique immobilier</a> · <a href="${base}${lexicon.EN_HUB}" hreflang="en" lang="en">Real estate glossary</a></p></section>`;
  pages.unshift({
    path: HUB, view: null, chapter: null, faqCount: 0,
    html: shell({ base, pathName: HUB, title: 'Guides juridiques de l’immobilier : France et Belgique | Z Find',
      description: 'Guides juridiques et fiscaux pour acheter, vendre, louer et louer en courte durée en France et en Belgique : notaire, frais, impôts, bail, copropriété, règles locales.',
      crumbs: [{ name: 'Z Find', path: '/' }, { name: 'Guides', path: HUB }], main: hubMain,
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Guides de l’immobilier', url: base + HUB, inLanguage: 'fr' }] })
  });
  return pages;
}

module.exports = { GUIDES, FR_CHAPTERS, HUB, buildGuidePages, faqOf, staticLinks, publicBody, parseView, cleanSection, linkLexicon, sentenceCase };
