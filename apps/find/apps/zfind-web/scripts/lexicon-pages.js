/* ============================================================
   Z FIND — lexique immobilier / real estate glossary (SEO, FR + EN)

   Pages statiques générées au build :

     /fr/lexique-immobilier                 sommaire par catégorie et A–Z
     /fr/lexique-immobilier/{slug}          une page par terme
     /en/real-estate-glossary               glossary index
     /en/real-estate-glossary/{slug}        one page per term

   Sources :
     content/lexique/lexique_immobilier_fr.csv   base éditoriale (import)
     content/lexique/lexique_immobilier_en.json  traduction anglaise,
                                                 indexée par le slug FR

   Chaque terme FR a son équivalent EN (hreflang croisés). Les « termes
   liés » ne deviennent des liens que lorsque le terme existe dans le
   lexique ; les autres sont ignorés (pas de lien mort). Les termes liés
   aux simulateurs renvoient vers les outils gratuits de Z Find.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const seo = require('../src/services/seo-page-generator.js');

const CONTENT_DIR = path.join(__dirname, '..', 'content', 'lexique');
const FR_HUB = '/fr/lexique-immobilier';
const EN_HUB = '/en/real-estate-glossary';

const CATEGORY_ORDER = Object.freeze([
  'Estimation et valeur immobilière',
  'Achat et vente immobilière',
  'Financement immobilier',
  'Investissement immobilier',
  'Fiscalité immobilière',
  'Location et gestion locative',
  'Copropriété et urbanisme',
  'Terrain et urbanisme',
  'Surfaces et caractéristiques du bien',
  'Diagnostics et performance énergétique',
  'Construction, état et rénovation',
  'Droit immobilier',
  'Belgique et Luxembourg'
]);
const CATEGORY_EN = Object.freeze({
  'Estimation et valeur immobilière': 'Valuation and property value',
  'Achat et vente immobilière': 'Buying and selling',
  'Financement immobilier': 'Mortgages and financing',
  'Investissement immobilier': 'Property investment',
  'Fiscalité immobilière': 'Property tax',
  'Location et gestion locative': 'Renting and letting',
  'Copropriété et urbanisme': 'Co-ownership and planning',
  'Terrain et urbanisme': 'Land and planning',
  'Surfaces et caractéristiques du bien': 'Floor areas and property features',
  'Diagnostics et performance énergétique': 'Surveys and energy performance',
  'Construction, état et rénovation': 'Construction and renovation',
  'Droit immobilier': 'Property law',
  'Belgique et Luxembourg': 'Belgium and Luxembourg'
});

/* Outils Z Find proposés depuis un terme. */
const TOOLS = Object.freeze({
  frais: { fr: ['/fr/frais-de-notaire', 'Calculer les frais de notaire'], en: ['/#/en/simulator?market=FR&mode=payment', 'Estimate purchase costs and repayments'] },
  pret: { fr: ['/fr/simulateur-pret-immobilier', 'Simuler un prêt immobilier'], en: ['/#/en/simulator?market=FR&mode=payment', 'Mortgage calculator'] },
  capacite: { fr: ['/fr/capacite-emprunt', 'Calculer sa capacité d’emprunt'], en: ['/#/en/simulator?market=FR&mode=capacity', 'How much can I borrow?'] },
  rentabilite: { fr: ['/fr/rentabilite-locative', 'Calculer la rentabilité locative'], en: ['/#/en/yield?market=FR&mode=long', 'Rental yield calculator'] },
  estimation: { fr: ['/fr/estimation-immobiliere', 'Estimer un bien gratuitement'], en: ['/#/en/estimation?market=FR&mode=owner', 'Free property valuation'] },
  prix: { fr: ['/fr/prix-immobilier/france', 'Prix au m² par commune'], en: ['/fr/prix-immobilier/france', 'Price per m² by town in France (in French)'] },
  guide: { fr: ['/fr/guides/immobilier-france', 'Guide juridique de l’immobilier en France'], en: ['/fr/guides/immobilier-france', 'Legal guide to French property (in French)'] }
});
const TERM_TOOLS = Object.freeze({
  'valeur-venale': ['estimation', 'prix'],
  'frais-acquisition': ['frais', 'pret'],
  'droit-de-mutation': ['frais'],
  'notaire': ['frais', 'guide'],
  'acte-authentique-de-vente': ['frais', 'guide'],
  'budget-acquisition': ['frais', 'capacite'],
  'frais-mainlevee': ['frais'],
  'capacite-emprunt': ['capacite', 'pret'],
  'taux-endettement': ['capacite', 'pret'],
  'apport-personnel': ['capacite', 'pret'],
  'credit-immobilier': ['pret', 'capacite'],
  'pret-amortissable': ['pret'],
  'pret-taux-fixe': ['pret'],
  'condition-suspensive': ['pret', 'guide'],
  'compromis-sous-condition': ['pret', 'guide'],
  'rendement-locatif-brut': ['rentabilite'],
  'vacance-locative': ['rentabilite'],
  'loi-pinel': ['rentabilite'],
  'charges-recuperables': ['rentabilite', 'guide'],
  'encadrement-loyers': ['rentabilite', 'guide'],
  'offre-achat': ['estimation', 'prix'],
  'mandat-de-vente': ['estimation'],
  'mandat-exclusif': ['estimation'],
  'mandat-simple': ['estimation'],
  'annonce-immobiliere': ['estimation', 'prix'],
  'plus-value-immobiliere': ['estimation', 'prix'],
  'honoraires-agence': ['estimation'],
  'commission-agence': ['estimation']
});
const DEFAULT_TOOLS = Object.freeze(['guide', 'estimation']);
const EXTRA_RELATED = Object.freeze({ 'valeur-venale': ['offre-achat', 'plus-value-immobiliere', 'mandat-de-vente'] });

/* CSV RFC 4180 (guillemets, virgules et retours à la ligne dans les champs). */
function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v !== '')) rows.push(row);
  const head = rows.shift().map(h => h.trim());
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

const list = v => String(v || '').split(';').map(s => s.trim()).filter(Boolean);
function norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function sortKey(v) { return norm(v); }

/* Termes FR + EN, validés. */
function loadLexicon(dir) {
  const base = dir || CONTENT_DIR;
  const rows = parseCsv(fs.readFileSync(path.join(base, 'lexique_immobilier_fr.csv'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(base, 'lexique_immobilier_en.json'), 'utf8'));
  const seenFr = new Set(), seenEn = new Set();
  const terms = rows.map(r => {
    const slug = r.slug;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`LEXIQUE: slug invalide « ${slug} »`);
    if (seenFr.has(slug)) throw new Error(`LEXIQUE: slug en double « ${slug} »`);
    seenFr.add(slug);
    if (!r.terme || !r.definition) throw new Error(`LEXIQUE: terme ou définition manquant (${slug})`);
    if (!CATEGORY_EN[r.categorie]) throw new Error(`LEXIQUE: catégorie inconnue « ${r.categorie} » (${slug})`);
    const t = en[slug];
    if (!t || !t.slug || !t.term || !t.definition || !t.title || !t.description) throw new Error(`LEXIQUE: traduction anglaise manquante (${slug})`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.slug) || seenEn.has(t.slug)) throw new Error(`LEXIQUE: slug anglais invalide ou en double (${t.slug})`);
    seenEn.add(t.slug);
    return {
      slug, slugEn: t.slug,
      term: r.terme, termEn: t.term,
      definition: r.definition, definitionEn: t.definition,
      category: r.categorie, categoryEn: CATEGORY_EN[r.categorie],
      synonyms: list(r.synonymes), synonymsEn: t.synonyms || [],
      title: r.title_seo || r.terme, titleEn: t.title,
      description: r.meta_description || r.definition, descriptionEn: t.description,
      relatedNames: list(r.termes_lies),
      revised: /^\d{4}-\d{2}-\d{2}$/.test(r.date_revision) ? r.date_revision : null,
      status: r.statut_editorial || ''
    };
  });
  const extra = Object.keys(en).filter(k => !seenFr.has(k));
  if (extra.length) throw new Error(`LEXIQUE: traductions sans terme français (${extra.join(', ')})`);

  // Index des noms : terme, terme sans parenthèse, sigle entre parenthèses, synonymes.
  const index = new Map();
  const add = (name, slug) => { const k = norm(name); if (k && !index.has(k)) index.set(k, slug); };
  for (const t of terms) add(t.term, t.slug);
  for (const t of terms) {
    add(t.term.replace(/\s*\([^)]*\)\s*/g, ' '), t.slug);
    (t.term.match(/\(([^)]+)\)/g) || []).forEach(m => add(m.slice(1, -1), t.slug));
    t.synonyms.forEach(s => add(s, t.slug));
  }
  const bySlug = new Map(terms.map(t => [t.slug, t]));
  for (const t of terms) {
    t.related = [...new Set(t.relatedNames.map(n => index.get(norm(n))).filter(s => s && s !== t.slug))].map(s => bySlug.get(s));
  }
  // Termes liés de la base absents du lexique (« Estimation immobilière »,
  // « Prix au mètre carré ») : équivalents présents.
  for (const [slug, extra] of Object.entries(EXTRA_RELATED)) {
    const t = bySlug.get(slug);
    if (t) extra.map(s => bySlug.get(s)).filter(o => o && !t.related.includes(o)).forEach(o => t.related.push(o));
  }
  // Maillage : au moins 4 termes liés, complétés par la même catégorie.
  for (const t of terms) {
    for (const o of terms) {
      if (t.related.length >= 4) break;
      if (o !== t && o.category === t.category && !t.related.includes(o)) t.related.push(o);
    }
  }
  return terms;
}

const STYLE = `<style id="zfind-lexicon-styles">
.zl-letters{display:flex;flex-wrap:wrap;gap:6px;margin:24px 0 8px;padding:0;list-style:none}.zl-letters a{display:inline-block;min-width:32px;padding:6px 8px;border:1px solid var(--zf-200);text-align:center;font-weight:500;color:var(--zf-gold-dark)}
.zl-cat{margin:44px 0 0}.zl-cat h2,.zl-az h2{margin:0 0 14px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.9rem;font-weight:400}
.zl-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin:0;padding:0;list-style:none}.zl-list a{display:block;height:100%;padding:16px 18px;border:1px solid var(--zf-200);background:#fff}.zl-list strong{display:block;margin-bottom:6px;color:var(--zf-900);font-weight:600}.zl-list span{color:var(--zf-500);font-size:.88rem;line-height:1.55}
.zl-az{margin-top:56px}.zl-az h3{margin:22px 0 8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:400;scroll-margin-top:96px}.zl-az ul{columns:3 240px;margin:0;padding:0;list-style:none}.zl-az li{margin:0 0 6px;break-inside:avoid}.zl-az a{color:var(--zf-700)}
.zl-term{max-width:820px}.zl-term .zl-def{margin:28px 0 24px;font-size:1.15rem;line-height:1.75;color:var(--zf-800,#2b2925)}.zl-meta{margin:0 0 28px;color:var(--zf-500);font-size:.9rem;line-height:1.7}.zl-meta strong{color:var(--zf-700)}
.zl-box{margin:28px 0;padding:20px 22px;border:1px solid var(--zf-200);background:var(--zf-50)}.zl-box h2{margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:400}.zl-box ul{display:flex;flex-wrap:wrap;gap:8px 20px;margin:0;padding:0;list-style:none}.zl-box a{color:var(--zf-gold-dark);font-weight:500}
.zl-note{margin-top:28px;padding:12px 16px;border-left:3px solid var(--zf-gold);background:var(--zf-gold-pale);color:var(--zf-700);font-size:.86rem;line-height:1.6}
.zl-lang{margin-left:auto;margin-right:16px;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--zf-500)}
</style>`;

const UI = Object.freeze({
  fr: {
    htmlLang: 'fr', ogLocale: 'fr_FR', hub: FR_HUB, home: 'Z Find', hubCrumb: 'Lexique immobilier',
    cta: ['/#/fr/estimation?market=FR&mode=owner', 'Estimer mon bien →'], other: 'English',
    breadcrumbLabel: 'Fil d’Ariane', aka: 'Aussi appelé', category: 'Catégorie', revised: 'Mise à jour',
    related: 'Termes liés', tools: 'Outils gratuits Z Find', back: '← Tout le lexique immobilier', az: 'De A à Z',
    note: 'Définition générale fournie à titre informatif. Les règles applicables dépendent de votre situation, du pays et des textes en vigueur : vérifiez-les auprès d’un professionnel (notaire, avocat, agent immobilier).',
    hubTitle: 'Lexique immobilier : définitions de A à Z | Z Find',
    hubH1: 'Lexique immobilier',
    hubEyebrow: 'Définitions · achat, vente, crédit, location, urbanisme',
    hubLead: 'Les mots de l’immobilier expliqués simplement : estimation, compromis, frais de notaire, crédit, copropriété, diagnostics, urbanisme et location. Chaque définition renvoie aux simulateurs gratuits de Z Find.',
    hubDescription: 'Lexique immobilier de Z Find : définitions claires des termes de l’achat, de la vente, du crédit, de la location, de la copropriété, des diagnostics et de l’urbanisme.',
    setName: 'Lexique immobilier Z Find',
    date: d => new Date(d + 'T00:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  },
  en: {
    htmlLang: 'en', ogLocale: 'en_GB', hub: EN_HUB, home: 'Z Find', hubCrumb: 'Real estate glossary',
    cta: ['/#/en/estimation?market=FR&mode=owner', 'Value my property →'], other: 'Français',
    breadcrumbLabel: 'Breadcrumb', aka: 'Also known as', category: 'Category', revised: 'Updated',
    related: 'Related terms', tools: 'Free Z Find tools', back: '← Full real estate glossary', az: 'A to Z',
    note: 'General definition provided for information only. The rules that apply depend on your situation, the country and the law in force: check them with a professional (notary, lawyer, estate agent).',
    hubTitle: 'Real estate glossary: French property terms explained | Z Find',
    hubH1: 'Real estate glossary',
    hubEyebrow: 'French property terms · buying, selling, mortgages, renting, planning',
    hubLead: 'French property vocabulary explained in plain English: valuation, preliminary sale agreement, notary fees, mortgages, co-ownership, surveys, planning and renting. Each term keeps its French name and links to the free Z Find calculators.',
    hubDescription: 'Z Find real estate glossary: clear English definitions of French property terms for buying, selling, mortgages, renting, co-ownership, surveys and planning.',
    setName: 'Z Find real estate glossary',
    date: d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  }
});

const pick = (t, lang) => lang === 'fr'
  ? { slug: t.slug, term: t.term, definition: t.definition, category: t.category, synonyms: t.synonyms, title: t.title, description: t.description, path: `${FR_HUB}/${t.slug}` }
  : { slug: t.slugEn, term: t.termEn, definition: t.definitionEn, category: t.categoryEn, synonyms: t.synonymsEn, title: t.titleEn, description: t.descriptionEn, path: `${EN_HUB}/${t.slugEn}` };

function shell({ base, lang, pathName, altPath, title, description, crumbs, jsonLd, main, ogType }) {
  const ui = UI[lang];
  const canonical = base + pathName;
  const desc = seo.buildMetaDescription(description, 158);
  const frPath = lang === 'fr' ? pathName : altPath;
  const enPath = lang === 'en' ? pathName : altPath;
  const lds = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: base + c.path })) }].concat(jsonLd || []);
  return `<!DOCTYPE html>
<html lang="${ui.htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" hreflang="fr" href="${esc(base + frPath)}">
<link rel="alternate" hreflang="en" href="${esc(base + enPath)}">
<link rel="alternate" hreflang="x-default" href="${esc(base + frPath)}">
<meta property="og:type" content="${ogType || 'article'}">
<meta property="og:site_name" content="Z Find">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(base)}/brand/z-find-logo-gold.png">
<meta property="og:locale" content="${ui.ogLocale}">
<meta name="twitter:card" content="summary">
${lds.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
${seo.presentationHead()}
${STYLE}
</head>
<body class="zf-seo-body">
<header class="zf-seo-site-header">
  <div class="zf-seo-wrap zf-seo-nav">
    <a class="zf-seo-brand" href="${base}/" aria-label="Z Find">Z <em>Find</em></a>
    <a class="zl-lang" href="${esc(base + altPath)}" hreflang="${lang === 'fr' ? 'en' : 'fr'}" lang="${lang === 'fr' ? 'en' : 'fr'}">${ui.other}</a>
    <a class="zf-seo-nav-cta" href="${esc(base + ui.cta[0])}">${esc(ui.cta[1])}</a>
  </div>
</header>
<main class="zf-seo-main zf-guide">
  <div class="zf-seo-wrap">
    <nav class="zf-seo-breadcrumb" aria-label="${esc(ui.breadcrumbLabel)}">${crumbs.map((c, i) => i === crumbs.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${esc(base + c.path)}">${esc(c.name)}</a>`).join(' / ')}</nav>
${main}
  </div>
</main>
</body>
</html>`;
}

function letterOf(term) { const c = norm(term).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; }

function hubPage(base, lang, terms) {
  const ui = UI[lang];
  const items = terms.map(t => ({ t, v: pick(t, lang) }));
  const byCat = CATEGORY_ORDER.map(cat => ({ cat, label: lang === 'fr' ? cat : CATEGORY_EN[cat], items: items.filter(x => x.t.category === cat).sort((a, b) => sortKey(a.v.term).localeCompare(sortKey(b.v.term))) })).filter(g => g.items.length);
  const alpha = items.slice().sort((a, b) => sortKey(a.v.term).localeCompare(sortKey(b.v.term)));
  const letters = [...new Set(alpha.map(x => letterOf(x.v.term)))];
  const short = s => (s.length > 150 ? s.slice(0, s.lastIndexOf(' ', 147)) + '…' : s);
  const main = `    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">${esc(ui.hubEyebrow)}</p>
      <h1>${esc(ui.hubH1)}</h1>
      <p class="zf-seo-lead">${esc(ui.hubLead)}</p>
      <ul class="zl-letters">${letters.map(l => `<li><a href="#${lang}-${l}">${l}</a></li>`).join('')}</ul>
    </header>
${byCat.map(g => `    <section class="zl-cat"><h2>${esc(g.label)}</h2><ul class="zl-list">${g.items.map(x => `<li><a href="${esc(base + x.v.path)}"><strong>${esc(x.v.term)}</strong><span>${esc(short(x.v.definition))}</span></a></li>`).join('')}</ul></section>`).join('\n')}
    <section class="zl-az"><h2>${esc(ui.az)}</h2>${letters.map(l => `<h3 id="${lang}-${l}">${l}</h3><ul>${alpha.filter(x => letterOf(x.v.term) === l).map(x => `<li><a href="${esc(base + x.v.path)}">${esc(x.v.term)}</a></li>`).join('')}</ul>`).join('')}</section>`;
  const hubPath = ui.hub;
  return {
    path: hubPath, lang,
    html: shell({ base, lang, pathName: hubPath, altPath: lang === 'fr' ? EN_HUB : FR_HUB, title: ui.hubTitle, description: ui.hubDescription, ogType: 'website',
      crumbs: [{ name: ui.home, path: '/' }, { name: ui.hubCrumb, path: hubPath }], main,
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'DefinedTermSet', '@id': base + hubPath, name: ui.setName, url: base + hubPath, inLanguage: lang,
        hasDefinedTerm: items.map(x => ({ '@type': 'DefinedTerm', name: x.v.term, url: base + x.v.path })) }] })
  };
}

function termPage(base, lang, t) {
  const ui = UI[lang];
  const v = pick(t, lang);
  const other = pick(t, lang === 'fr' ? 'en' : 'fr');
  const tools = (TERM_TOOLS[t.slug] || DEFAULT_TOOLS).map(k => TOOLS[k][lang]);
  const meta = [
    v.synonyms.length ? `<strong>${esc(ui.aka)} :</strong> ${v.synonyms.map(esc).join(', ')}` : '',
    `<strong>${esc(ui.category)} :</strong> ${esc(v.category)}`,
    t.revised ? `<strong>${esc(ui.revised)} :</strong> <time datetime="${t.revised}">${esc(ui.date(t.revised))}</time>` : ''
  ].filter(Boolean).join('<br>');
  const fix = s => (lang === 'en' ? s.replace(/ :<\/strong>/g, ':</strong>') : s);
  const main = `    <article class="zl-term">
      <header class="zf-seo-hero">
        <p class="zf-seo-eyebrow">${esc(ui.hubCrumb)}</p>
        <h1>${esc(v.term)}</h1>
      </header>
      <p class="zl-def">${esc(v.definition)}</p>
      <p class="zl-meta">${fix(meta)}</p>
${t.related.length ? `      <section class="zl-box"><h2>${esc(ui.related)}</h2><ul>${t.related.map(r => { const rv = pick(r, lang); return `<li><a href="${esc(base + rv.path)}">${esc(rv.term)}</a></li>`; }).join('')}</ul></section>` : ''}
      <section class="zl-box"><h2>${esc(ui.tools)}</h2><ul>${tools.map(([p, l]) => `<li><a href="${esc(base + p)}">${esc(l)}</a></li>`).join('')}</ul></section>
      <p class="zl-note">${esc(ui.note)}</p>
      <p><a href="${esc(base + ui.hub)}">${esc(ui.back)}</a></p>
    </article>`;
  return {
    path: v.path, lang, slug: t.slug,
    html: shell({ base, lang, pathName: v.path, altPath: other.path, title: `${v.title} | Z Find`, description: v.description,
      crumbs: [{ name: ui.home, path: '/' }, { name: ui.hubCrumb, path: ui.hub }, { name: v.term, path: v.path }], main,
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'DefinedTerm', '@id': base + v.path, name: v.term, description: v.definition, url: base + v.path, inLanguage: lang,
        alternateName: v.synonyms.length ? v.synonyms : undefined,
        inDefinedTermSet: { '@type': 'DefinedTermSet', '@id': base + ui.hub, name: ui.setName, url: base + ui.hub },
        dateModified: t.revised || undefined }] })
  };
}

/* Toutes les pages du lexique, FR puis EN : [{ path, lang, html }]. */
function buildLexiconPages(baseUrl, options) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('Lexicon pages require a real SITE_BASE_URL.');
  const terms = loadLexicon(options && options.contentDir);
  const pages = [];
  for (const lang of ['fr', 'en']) {
    pages.push(hubPage(base, lang, terms));
    for (const t of terms) pages.push(termPage(base, lang, t));
  }
  return pages;
}

module.exports = { FR_HUB, EN_HUB, CATEGORY_EN, TERM_TOOLS, parseCsv, loadLexicon, buildLexiconPages };
