/* ============================================================
   Z FIND — pages « Prix de l'immobilier » par commune (France)

   Pages indexables, servies par /api/prix-immobilier à partir des
   fichiers publics public/market-data/fr (médianes DVF — DGFiP,
   licence ouverte, calculées par build_market_data.py) :

     /fr/prix-immobilier/france                    → la France et ses départements
     /fr/prix-immobilier/france/{slug}-{dep}       → un département et ses communes
     /fr/prix-immobilier/france/{slug}-{insee}     → une commune

   Une commune avec moins de MIN_SALES ventes sur la période cumulée
   reste consultable mais n'est pas indexée (noindex) ni listée dans le
   sitemap : pas de page « mince ».

   Ce module est pur (aucun accès réseau) : rendu HTML, slugs, liste des
   URL du sitemap. Il est partagé par la fonction et par la génération du
   sitemap au build.
   ============================================================ */
'use strict';

const seo = require('../../src/services/seo-page-generator.js');
const costs = require('../../src/services/acquisition-costs.js');
const rates = require('../../src/services/credit-rates.js');
const credit = require('../../src/services/credit-simulator.js');

const MIN_SALES = 5;
const YEARS = ['2021', '2022', '2023', '2024', '2025'];
const COMBINED = '2024-2025';
const BIG_CITY_PREFIX = Object.freeze({ '75056': '751', '69123': '6938', '13055': '132' });

/* « à Évian » / « au Havre » / « aux Gets » ; « d’Évian » / « du Havre » / « des Gets ». */
function aCommune(name) {
  const m = String(name).match(/^(Le|Les) (.*)$/);
  if (m) return `${m[1] === 'Le' ? 'au' : 'aux'} ${m[2]}`;
  return `à ${name}`;
}
function deCommune(name) {
  const m = String(name).match(/^(Le|Les) (.*)$/);
  if (m) return `${m[1] === 'Le' ? 'du' : 'des'} ${m[2]}`;
  return /^[aeiouyhàâäéèêëîïôöûüÿœæ]/i.test(String(name).normalize('NFC')) ? `d’${name}` : `de ${name}`;
}

function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
function eur(v) { return v == null ? '—' : `${nf.format(v)} €`; }
function eurM2(v) { return v == null ? '—' : `${nf.format(v)} €/m²`; }
function pct(a, b) { return a && b ? Math.round(((a - b) / b) * 100) : null; }
function signed(p) { return p == null ? '' : `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)} %`; }

/* [ventes, q1, médiane, q3] pour une année ; null si absent. */
function stat(block, period) {
  const v = block && block[period];
  return Array.isArray(v) && v.length >= 4 ? { n: v[0], q1: v[1], med: v[2], q3: v[3] } : null;
}

/* Dernière année avec assez de ventes, sinon la période cumulée 2024-2025. */
function latest(block) {
  for (const y of YEARS.slice().reverse()) {
    const s = stat(block, y);
    if (s && s.n >= MIN_SALES) return Object.assign({ period: y }, s);
  }
  const c = stat(block, COMBINED);
  return c && c.n > 0 ? Object.assign({ period: COMBINED }, c) : null;
}

function salesCount(row) {
  return ['A', 'M'].reduce((sum, k) => sum + ((stat(row[k], COMBINED) || {}).n || 0), 0);
}

function isIndexable(commune) { return salesCount(commune) >= MIN_SALES; }

const ROOT_PATH = '/fr/prix-immobilier/france';
function depPath(code, name) { return `${ROOT_PATH}/${slugify(name)}-${code.toLowerCase()}`; }
function communePath(c) { return `${ROOT_PATH}/${slugify(c.n)}-${c.c.toLowerCase()}`; }
function regionPath(name) { return `${ROOT_PATH}/region-${slugify(name)}`; }
/* Simulateur de frais de notaire du département (simulator-landing-pages.js). */
function notaryPath(d) { return `/fr/frais-de-notaire/${slugify(d.name)}-${String(d.code).toLowerCase()}`; }

/* « en Bretagne », « dans les Hauts-de-France », « dans le Grand Est ». */
const REGION_IN = Object.freeze({ 'Hauts-de-France': 'dans les Hauts-de-France', 'Grand Est': 'dans le Grand Est', 'Pays de la Loire': 'dans les Pays de la Loire' });
function enRegion(name) { return REGION_IN[name] || `en ${name}`; }

/* Ville à arrondissements (Paris, Lyon, Marseille) d'un code d'arrondissement. */
function cityOfArrondissement(code) {
  return Object.keys(BIG_CITY_PREFIX).find(city => String(code).startsWith(BIG_CITY_PREFIX[city]) && code !== city) || null;
}

/* Régions métropolitaines à plusieurs départements couverts par DVF (les
   régions d'outre-mer n'ont qu'un département : leur page département suffit).
   [{ code, name, slug, departments: [{ code, name, A, M }] }] */
function regionsOf(index) {
  const skip = new Set(index.notUnderDvf || []);
  const byCode = new Map();
  for (const [code, d] of Object.entries(index.departments || {})) {
    if (!d.region || !d.regionName) continue;
    if (!byCode.has(d.region)) byCode.set(d.region, { code: d.region, name: d.regionName, slug: slugify(d.regionName), departments: [], excluded: [] });
    (skip.has(code) ? byCode.get(d.region).excluded : byCode.get(d.region).departments).push(Object.assign({ code }, d));
  }
  return [...byCode.values()]
    .filter(r => r.departments.length + r.excluded.length > 1 && r.departments.length > 0)
    .sort((x, y) => x.name.localeCompare(y.name, 'fr'));
}
function regionOfDepartment(index, depCode) {
  const d = (index.departments || {})[depCode];
  return d ? regionsOf(index).find(r => r.code === d.region) || null : null;
}

/* Prix de référence d'un ensemble de départements pour une période :
   moyenne des médianes départementales pondérée par le nombre de ventes
   (DVF ne publie pas de médiane régionale). { n, med } ou null. */
function weighted(rows, kind, period) {
  let n = 0; let sum = 0;
  for (const r of rows) {
    const st = stat(r[kind], period);
    if (st && st.n > 0 && st.med) { n += st.n; sum += st.n * st.med; }
  }
  return n >= MIN_SALES ? { period, n, med: Math.round(sum / n / 10) * 10 } : null;
}
function regionLatest(region, kind) { return weighted(region.departments, kind, COMBINED); }

/* « france », « france/haute-savoie-74 », « france/evian-les-bains-74119 » */
function parsePath(p) {
  const parts = String(p || '').toLowerCase().split('/').filter(Boolean);
  if (parts[0] === 'fr') parts.shift();
  if (parts[0] === 'prix-immobilier') parts.shift();
  if (!parts.length || parts[0] !== 'france') return { kind: parts.length ? 'unknown' : 'root' };
  if (parts.length === 1) return { kind: 'country' };
  if (parts.length !== 2) return { kind: 'unknown' };
  if (/^region-[a-z0-9-]+$/.test(parts[1])) return { kind: 'region', slug: parts[1].slice('region-'.length) };
  const m = parts[1].match(/^(?:(.*)-)?(2a|2b|97[1-6]|\d{2}|(?:2a|2b|\d{2})\d{3}|97[1-6]\d{2})$/);
  if (!m) return { kind: 'unknown' };
  const code = m[2].toUpperCase();
  return { kind: code.length >= 5 ? 'commune' : 'department', code, slug: m[1] || '' };
}

function depOfCommune(code) {
  return code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2);
}

const FR_SOURCE = 'Source : DVF — Demandes de valeurs foncières (DGFiP), ventes de logements anciens enregistrées par l’administration fiscale, sous licence ouverte. Prix médians au m² calculés par Z Find ; fourchette = 1er et 3e quartiles. L’Alsace-Moselle et Mayotte ne sont pas couvertes par DVF. Ces chiffres ne remplacent pas une estimation de votre bien.';

function page({ base, title, description, canonicalPath, indexable, breadcrumbs, body, jsonLd, market, source }) {
  const mk = market || 'FR';
  const canonical = base + canonicalPath;
  const crumbsLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: base + b.path }))
  };
  const lds = [crumbsLd].concat(jsonLd || []).map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(seo.buildMetaDescription(description, 158))}">
<meta name="robots" content="${indexable ? 'index,follow' : 'noindex,follow'}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Z Find">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(seo.buildMetaDescription(description, 158))}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary">
${lds}
${seo.presentationHead()}
<style id="zfind-prix-styles">.zp-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin-top:28px}.zp-stat{padding:28px;border:1px solid var(--zf-200);background:#fff}.zp-stat h2{margin:0 0 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.6rem;font-weight:400}.zp-big{margin:6px 0 4px;color:var(--zf-gold-dark);font-family:'Cormorant Garamond',Georgia,serif;font-size:2.6rem;line-height:1.1}.zp-small{margin:0;color:var(--zf-500);font-size:.88rem;line-height:1.6}.zp-section{margin-top:34px}.zp-section h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:2rem;font-weight:400;margin:0 0 12px}.zp-section p{color:var(--zf-700);line-height:1.75;max-width:820px}.zp-table-wrap{overflow-x:auto;border:1px solid var(--zf-200)}.zp-table{width:100%;border-collapse:collapse;font-size:.92rem;font-variant-numeric:tabular-nums}.zp-table th,.zp-table td{padding:10px 14px;border-bottom:1px solid var(--zf-100);text-align:right;white-space:nowrap}.zp-table th:first-child,.zp-table td:first-child{text-align:left;white-space:normal}.zp-table thead th{background:var(--zf-50);font-weight:500;color:var(--zf-700)}.zp-table a{color:var(--zf-gold-dark);font-weight:500}.zp-links{display:flex;flex-wrap:wrap;gap:8px 18px;padding:0;list-style:none}.zp-links a{color:var(--zf-gold-dark);font-weight:500}.zp-ctas{display:flex;flex-wrap:wrap;gap:14px;margin-top:28px}.zp-secondary{display:inline-flex;align-items:center;padding:12px 20px;border:1px solid var(--zf-gold);color:var(--zf-gold-dark)!important;font-size:.72rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase}.zp-source{margin-top:34px;color:var(--zf-500);font-size:.8rem;line-height:1.6}@media(max-width:820px){.zp-stats{grid-template-columns:1fr}}</style>
</head>
<body class="zf-seo-body">
<header class="zf-seo-site-header">
  <div class="zf-seo-wrap zf-seo-nav">
    <a class="zf-seo-brand" href="${base}/" aria-label="Z Find">Z <em>Find</em></a>
    <a class="zf-seo-nav-cta" href="${base}/#/fr/estimation?market=${mk}&amp;mode=owner">Estimer mon bien →</a>
  </div>
</header>
<main class="zf-seo-main">
  <div class="zf-seo-wrap">
    <nav class="zf-seo-breadcrumb" aria-label="Fil d’Ariane">${breadcrumbs.map((b, i) => i === breadcrumbs.length - 1 ? `<span>${esc(b.name)}</span>` : `<a href="${base}${b.path}">${esc(b.name)}</a>`).join(' / ')}</nav>
${body}
    <p class="zp-source">${esc(source || FR_SOURCE)}</p>
  </div>
</main>
</body>
</html>`;
}

function statCard(label, s) {
  if (!s) return `<section class="zp-stat"><h2>${esc(label)}</h2><p class="zp-small">Pas assez de ventes enregistrées pour publier un prix.</p></section>`;
  return `<section class="zp-stat"><h2>${esc(label)}</h2><p class="zp-big">${eurM2(s.med)}</p><p class="zp-small">Fourchette : ${eurM2(s.q1)} à ${eurM2(s.q3)}<br>${nf.format(s.n)} vente${s.n > 1 ? 's' : ''} en ${s.period === COMBINED ? '2024-2025' : s.period}</p></section>`;
}

function periodLabel(p) { return p === COMBINED ? 'en 2024-2025' : `en ${p}`; }

function evolutionRows(row) {
  return YEARS.map(y => {
    const a = stat(row.A, y); const m = stat(row.M, y);
    if (!a && !m) return '';
    return `<tr><td>${y}</td><td>${a && a.n >= MIN_SALES ? eurM2(a.med) : '—'}</td><td>${m && m.n >= MIN_SALES ? eurM2(m.med) : '—'}</td><td>${nf.format(((a || {}).n || 0) + ((m || {}).n || 0))}</td></tr>`;
  }).join('');
}

function trend(block) {
  const ok = YEARS.filter(y => { const v = stat(block, y); return v && v.n >= MIN_SALES; });
  if (ok.length < 2) return null;
  const from = ok[0]; const to = ok[ok.length - 1];
  return { from, to, change: pct(stat(block, to).med, stat(block, from).med) };
}

/* Budget d'un bien type au prix médian, calculé avec les simulateurs Z Find
   (frais d'acquisition et taux de référence publiés ; aucun chiffre inventé :
   sans taux de référence en cours de validité, pas de mensualité). */
const TYPICAL = Object.freeze({ A: { m2: 60, label: 'Appartement de 60 m²' }, M: { m2: 100, label: 'Maison de 100 m²' } });
const LOAN_YEARS = 20;
const DEPOSIT_SHARE = 0.1;
function budget(kind, s, today, depCode) {
  if (!s) return null;
  const price = Math.round((s.med * TYPICAL[kind].m2) / 1000) * 1000;
  const c = costs.estimate({ country: 'FR', price, department: depCode || null });
  if (!c || c.error) return null;
  const ref = rates.reference('FR', LOAN_YEARS, today || new Date());
  const deposit = Math.round(price * DEPOSIT_SHARE / 1000) * 1000;
  const loan = c.total - deposit;
  const pay = ref ? credit.payment({ loan, ratePct: ref.ratePct, years: LOAN_YEARS, insurancePct: 0 }) : null;
  return { kind, label: TYPICAL[kind].label, price, costs: c.costs, total: c.total, deposit, loan, ref, monthly: pay && !pay.error ? pay.monthly : null };
}

function budgetSection(base, name, a, m, today, department) {
  const depCode = department && department.code;
  const rows = [budget('A', a, today, depCode), budget('M', m, today, depCode)].filter(Boolean);
  if (!rows.length) return '';
  const ref = rows[0].ref;
  return `<section class="zp-section">
      <h2>Quel budget pour acheter ${esc(aCommune(name))} ?</h2>
      <p>Pour un bien au prix médian ${esc(deCommune(name))}, avec un apport de 10 % et un prêt sur ${LOAN_YEARS} ans${ref ? ` au taux moyen de ${String(ref.ratePct).replace('.', ',')} % (${esc(ref.source.name)}, ${esc(rates.periodLabel(ref.period, 'fr'))})` : ''}, hors assurance emprunteur :</p>
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Bien type</th><th>Prix</th><th>Frais d’achat (notaire)</th><th>Emprunt</th><th>Mensualité</th></tr></thead><tbody>${rows.map(r =>
        `<tr><td>${esc(r.label)}</td><td>${eur(r.price)}</td><td>${eur(r.costs)}</td><td>${eur(r.loan)}</td><td>${r.monthly != null ? `${eur(r.monthly)} / mois` : '—'}</td></tr>`).join('')}</tbody></table></div>
      <div class="zp-ctas">${rows.map(r => `<a class="zp-secondary" href="${base}/#/fr/simulator?market=FR&amp;mode=payment&amp;price=${r.price}">Simuler le crédit — ${esc(r.label.toLowerCase())}</a>`).join('')}<a class="zp-secondary" href="${base}/#/fr/simulator?market=FR&amp;mode=capacity">Calculer ma capacité d’emprunt</a><a class="zp-secondary" href="${base}/#/fr/yield?market=FR&amp;mode=long&amp;price=${rows[0].price}">Calculer la rentabilité locative</a></div>
      <p class="zp-small">Simulation indicative : ni offre de prêt ni conseil. Frais d’achat calculés pour un logement ancien (droits de mutation${department ? ` au taux ${department.code === '75' ? 'de Paris' : `du département ${esc(department.name)}`}` : ''}, émoluments du notaire, débours) — <a href="${base}${department ? notaryPath(department) : '/fr/frais-de-notaire'}">frais de notaire ${department ? (department.code === '75' ? 'à Paris' : `— ${esc(department.name)} (${esc(department.code)})`) : 'en détail'}</a>, <a href="${base}/fr/capacite-emprunt">capacité d’emprunt</a>.</p>
    </section>`;
}

/* Même période (2024-2025) pour toutes les lignes d'une comparaison. */
function combined(row, kind) {
  const st = row ? stat(row[kind], COMBINED) : null;
  return st && st.n >= MIN_SALES ? st : null;
}
/* Tableau « commune / ville / département / région / France » :
   rows = [{ label, href, A, M }] où A et M sont des { med } ou null. */
function comparisonTable(base, title, rows, note) {
  return `    <section class="zp-section">
      <h2>${esc(title)}</h2>
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th></th><th>Appartements</th><th>Maisons</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${r.href ? `<a href="${base}${r.href}">${esc(r.label)}</a>` : `<strong>${esc(r.label)}</strong>`}</td><td>${r.A ? eurM2(r.A.med) : '—'}</td><td>${r.M ? eurM2(r.M.med) : '—'}</td></tr>`).join('\n        ')}
      </tbody></table></div>
      <p class="zp-small">${esc(note)}</p>
    </section>`;
}
function joinFr(items) {
  const xs = items.filter(Boolean);
  return xs.length > 1 ? `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}` : (xs[0] || '');
}
const COMPARE_NOTE = 'Prix médians au m² des ventes 2024-2025 (DVF). Pour une région, moyenne des médianes de ses départements pondérée par le nombre de ventes.';

/* Arrondissements d'une ville (Paris, Lyon, Marseille), du plus cher au moins cher. */
function arrondissementsSection(base, city, communes) {
  const prefix = BIG_CITY_PREFIX[city.c];
  if (!prefix) return '';
  const arr = communes.filter(c => c.c !== city.c && c.c.startsWith(prefix));
  if (!arr.length) return '';
  const rows = arr.map(c => ({ c, a: combined(c, 'A'), m: combined(c, 'M') }))
    .sort((x, y) => ((y.a || {}).med || 0) - ((x.a || {}).med || 0) || x.c.n.localeCompare(y.c.n, 'fr', { numeric: true }));
  return `    <section class="zp-section">
      <h2>Prix au m² par arrondissement ${esc(deCommune(city.n))}</h2>
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Arrondissement</th><th>Appartements</th><th>Maisons</th><th>Ventes 2024-2025</th></tr></thead><tbody>${rows.map(r =>
        `<tr><td><a href="${base}${communePath(r.c)}">${esc(r.c.n)}</a></td><td>${r.a ? eurM2(r.a.med) : '—'}</td><td>${r.m ? eurM2(r.m.med) : '—'}</td><td>${nf.format(salesCount(r.c))}</td></tr>`).join('')}</tbody></table></div>
    </section>`;
}

function renderCommune({ base, commune, department, national, neighbours, agencies, today, region, city, communes }) {
  const a = latest(commune.A); const m = latest(commune.M);
  const depA = latest(department.A); const depM = latest(department.M);
  const name = commune.n;
  const depLabel = `${department.name} (${department.code})`;
  const sentences = [];
  if (a) {
    const d = depA ? pct(a.med, depA.med) : null;
    sentences.push(`Le prix médian d’un appartement ${aCommune(name)} est de ${eurM2(a.med)} ${periodLabel(a.period)}` +
      (d != null ? `, ${d === 0 ? 'au niveau de' : `soit ${signed(d)} par rapport à`} la médiane du département (${eurM2(depA.med)}).` : '.'));
  }
  if (m) {
    const d = depM ? pct(m.med, depM.med) : null;
    sentences.push(`Pour une maison, la médiane est de ${eurM2(m.med)} ${periodLabel(m.period)}` +
      (d != null ? ` (département : ${eurM2(depM.med)}).` : '.'));
  }
  if (!a && !m) sentences.push(`Trop peu de ventes ont été enregistrées ${aCommune(name)} ces dernières années pour publier un prix fiable. Les prix du département (${depLabel}) donnent un ordre de grandeur.`);
  const tA = trend(commune.A); const tM = trend(commune.M);
  const trends = [];
  if (tA && tA.change != null) trends.push(`appartements ${signed(tA.change)} entre ${tA.from} et ${tA.to}`);
  if (tM && tM.change != null) trends.push(`maisons ${signed(tM.change)} entre ${tM.from} et ${tM.to}`);
  const indexable = isIndexable(commune);
  const path = communePath(commune);
  const title = `Prix immobilier ${name} (${department.code}) : prix au m² ${a || m ? (a || m).period.slice(-4) : ''} | Z Find`.replace(/\s+\|/, ' |');
  const description = a || m
    ? `Prix de l’immobilier ${aCommune(name)} : ${a ? `${eurM2(a.med)} pour un appartement` : ''}${a && m ? ', ' : ''}${m ? `${eurM2(m.med)} pour une maison` : ''} (médianes DVF). Évolution depuis 2021, comparaison avec ${department.name} et estimation gratuite.`
    : `Prix de l’immobilier ${aCommune(name)} (${depLabel}) : repères de prix du département, évolution et estimation gratuite de votre bien sur Z Find.`;
  const faq = [];
  if (a) faq.push({ q: `Quel est le prix au m² d’un appartement ${aCommune(name)} ?`, r: `${eurM2(a.med)} (médiane DVF ${a.period === COMBINED ? '2024-2025' : a.period}, ${a.n} ventes), avec une fourchette de ${eurM2(a.q1)} à ${eurM2(a.q3)}.` });
  if (m) faq.push({ q: `Quel est le prix au m² d’une maison ${aCommune(name)} ?`, r: `${eurM2(m.med)} (médiane DVF ${m.period === COMBINED ? '2024-2025' : m.period}, ${m.n} ventes), avec une fourchette de ${eurM2(m.q1)} à ${eurM2(m.q3)}.` });
  if (trends.length) faq.push({ q: `Les prix de l’immobilier augmentent-ils ${aCommune(name)} ?`, r: `Prix médians au m² : ${trends.join(' ; ')}.` });
  const jsonLd = [{ '@context': 'https://schema.org', '@type': 'WebPage', name: title, url: base + path, inLanguage: 'fr', about: { '@type': 'City', name, containedInPlace: city ? { '@type': 'City', name: city.n } : { '@type': 'AdministrativeArea', name: department.name } } }];
  if (faq.length && indexable) jsonLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.r } })) });
  const nationalA = latest(national.A); const nationalM = latest(national.M);
  const body = `    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Prix de l’immobilier · ${esc(depLabel)}</p>
      <h1>Prix de l’immobilier ${esc(aCommune(name))}</h1>
      <p class="zf-seo-lead">${esc(sentences.join(' '))}</p>
      <div class="zp-ctas"><a class="zf-seo-primary" href="${base}/#/fr/estimation?market=FR&amp;mode=owner">Estimer mon bien ${esc(aCommune(name))} →</a><a class="zp-secondary" href="${base}/#/fr/search?market=FR">Voir les annonces</a></div>
    </header>
    <div class="zp-stats">${statCard('Appartements', a)}${statCard('Maisons', m)}</div>
    <section class="zp-section">
      <h2>Évolution des prix ${esc(aCommune(name))}</h2>
      ${trends.length ? `<p>Prix médians au m² : ${esc(trends.join(' ; '))}.</p>` : ''}
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Année</th><th>Appartements</th><th>Maisons</th><th>Ventes</th></tr></thead><tbody>${evolutionRows(commune)}</tbody></table></div>
    </section>
${comparisonTable(base, `Prix ${aCommune(name)} comparés ${joinFr([city ? `à ${city.n}` : null, 'au département', region ? `à la région ${region.name}` : null, 'à la France'])}`, [
      { label: name, A: combined(commune, 'A'), M: combined(commune, 'M') },
      city ? { label: city.n, href: communePath(city), A: combined(city, 'A'), M: combined(city, 'M') } : null,
      { label: `${department.name} (${department.code})`, href: depPath(department.code, department.name), A: combined(department, 'A'), M: combined(department, 'M') },
      region ? { label: region.name, href: regionPath(region.name), A: regionLatest(region, 'A'), M: regionLatest(region, 'M') } : null,
      { label: 'France', href: ROOT_PATH, A: combined(national, 'A'), M: combined(national, 'M') }
    ].filter(Boolean), COMPARE_NOTE)}
${communes ? arrondissementsSection(base, commune, communes) : ''}
    ${budgetSection(base, name, a, m, today, department)}
    <section class="zp-section">
      <h2>Vendre ou acheter ${esc(aCommune(name))}</h2>
      <p>Une médiane décrit le marché, pas votre bien : l’étage, l’état, la vue ou le terrain font varier le prix. L’<a href="${base}/fr/estimation-immobiliere">estimation Z Find</a> tient compte de ces critères et vous donne une fourchette immédiatement, puis un rapport détaillé par e-mail.</p>
      ${agencies > 0 ? `<p>${nf.format(agencies)} agence${agencies > 1 ? 's' : ''} immobilière${agencies > 1 ? 's sont établies' : ' est établie'} ${esc(aCommune(name))}. Vous êtes une agence ? <a href="${base}/#/fr/pro">Publiez vos annonces sur Z Find</a>.</p>` : `<p>Vous êtes une agence immobilière ? <a href="${base}/#/fr/pro">Publiez vos annonces sur Z Find</a>.</p>`}
    </section>
    ${neighbours.length ? `<section class="zp-section"><h2>Prix dans les autres communes du département</h2><ul class="zp-links">${neighbours.map(n => `<li><a href="${base}${communePath(n)}">${esc(n.n)}</a></li>`).join('')}</ul><p><a href="${base}${depPath(department.code, department.name)}">Toutes les communes — ${esc(department.name)} (${esc(department.code)}) →</a></p></section>` : ''}`;
  return page({
    base, title, description, canonicalPath: path, indexable, jsonLd, body,
    breadcrumbs: [{ name: 'Z Find', path: '/' }, { name: 'Prix de l’immobilier', path: ROOT_PATH }]
      .concat(region ? [{ name: region.name, path: regionPath(region.name) }] : [])
      .concat([{ name: department.name, path: depPath(department.code, department.name) }])
      .concat(city ? [{ name: city.n, path: communePath(city) }] : [])
      .concat([{ name, path }])
  });
}

function renderDepartment({ base, department, communes, national, region }) {
  const a = latest(department.A); const m = latest(department.M);
  const path = depPath(department.code, department.name);
  const rows = communes.slice().sort((x, y) => salesCount(y) - salesCount(x) || x.n.localeCompare(y.n, 'fr'));
  const nationalA = latest(national.A); const nationalM = latest(national.M);
  const title = `Prix immobilier ${department.name} (${department.code}) : prix au m² par commune | Z Find`;
  const description = `Prix de l’immobilier, ${department.name} (${department.code}) : ${a ? `${eurM2(a.med)} pour un appartement` : ''}${a && m ? ', ' : ''}${m ? `${eurM2(m.med)} pour une maison` : ''} (médianes DVF). Prix au m² de ${communes.length} communes et évolution depuis 2021.`;
  const body = `    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Prix de l’immobilier · ${region ? `<a href="${base}${regionPath(region.name)}">${esc(region.name)}</a>` : esc(department.regionName || 'France')}</p>
      <h1>Prix de l’immobilier : ${esc(department.name)} (${esc(department.code)})</h1>
      <p class="zf-seo-lead">${a ? `Prix médian d’un appartement : ${eurM2(a.med)} ${periodLabel(a.period)}${nationalA ? ` (France : ${eurM2(nationalA.med)})` : ''}. ` : ''}${m ? `Maison : ${eurM2(m.med)}${nationalM ? ` (France : ${eurM2(nationalM.med)})` : ''}.` : ''} Retrouvez ci-dessous le prix au m² de chaque commune.</p>
      <div class="zp-ctas"><a class="zf-seo-primary" href="${base}/#/fr/estimation?market=FR&amp;mode=owner">Estimer mon bien →</a><a class="zp-secondary" href="${base}${notaryPath(department)}">Frais de notaire — ${esc(department.name)}</a></div>
    </header>
    <div class="zp-stats">${statCard('Appartements', a)}${statCard('Maisons', m)}</div>
${comparisonTable(base, `Prix dans le département comparés ${joinFr([region ? `à la région ${region.name}` : null, 'à la France'])}`, [
      { label: `${department.name} (${department.code})`, A: combined(department, 'A'), M: combined(department, 'M') },
      region ? { label: region.name, href: regionPath(region.name), A: regionLatest(region, 'A'), M: regionLatest(region, 'M') } : null,
      { label: 'France', href: ROOT_PATH, A: combined(national, 'A'), M: combined(national, 'M') }
    ].filter(Boolean), COMPARE_NOTE)}
    <section class="zp-section"><h2>Évolution des prix dans le département</h2><div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Année</th><th>Appartements</th><th>Maisons</th><th>Ventes</th></tr></thead><tbody>${evolutionRows(department)}</tbody></table></div></section>
    <section class="zp-section"><h2>Prix au m² par commune</h2>
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Commune</th><th>Appartements</th><th>Maisons</th><th>Ventes 2024-2025</th></tr></thead><tbody>${rows.map(c => {
        const ca = latest(c.A); const cm = latest(c.M);
        return `<tr><td><a href="${base}${communePath(c)}">${esc(c.n)}</a></td><td>${ca && ca.n >= MIN_SALES ? eurM2(ca.med) : '—'}</td><td>${cm && cm.n >= MIN_SALES ? eurM2(cm.med) : '—'}</td><td>${nf.format(salesCount(c))}</td></tr>`;
      }).join('')}</tbody></table></div>
    </section>`;
  return page({
    base, title, description, canonicalPath: path, indexable: true, body,
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: base + path, inLanguage: 'fr', about: { '@type': 'AdministrativeArea', name: department.name } }],
    breadcrumbs: [{ name: 'Z Find', path: '/' }, { name: 'Prix de l’immobilier', path: ROOT_PATH }]
      .concat(region ? [{ name: region.name, path: regionPath(region.name) }] : [])
      .concat([{ name: department.name, path }])
  });
}

function regionCard(label, s) {
  if (!s) return `<section class="zp-stat"><h2>${esc(label)}</h2><p class="zp-small">Pas assez de ventes enregistrées pour publier un prix.</p></section>`;
  return `<section class="zp-stat"><h2>${esc(label)}</h2><p class="zp-big">${eurM2(s.med)}</p><p class="zp-small">Prix de référence régional<br>${nf.format(s.n)} vente${s.n > 1 ? 's' : ''} en 2024-2025</p></section>`;
}

function renderRegion({ base, region, index, regions }) {
  const a = regionLatest(region, 'A'); const m = regionLatest(region, 'M');
  const nationalA = combined(index.national, 'A'); const nationalM = combined(index.national, 'M');
  const path = regionPath(region.name);
  const where = enRegion(region.name);
  const deps = region.departments.slice().sort((x, y) => x.code.localeCompare(y.code, 'fr', { numeric: true }));
  const ranked = deps.map(d => ({ d, a: combined(d, 'A'), m: combined(d, 'M') })).filter(x => x.a)
    .sort((x, y) => y.a.med - x.a.med);
  const evolution = YEARS.map(y => {
    const ya = weighted(region.departments, 'A', y); const ym = weighted(region.departments, 'M', y);
    if (!ya && !ym) return '';
    return `<tr><td>${y}</td><td>${ya ? eurM2(ya.med) : '—'}</td><td>${ym ? eurM2(ym.med) : '—'}</td><td>${nf.format(((ya || {}).n || 0) + ((ym || {}).n || 0))}</td></tr>`;
  }).join('');
  const first = YEARS.find(y => weighted(region.departments, 'A', y)); const last = YEARS.slice().reverse().find(y => weighted(region.departments, 'A', y));
  const change = first && last && first !== last ? pct(weighted(region.departments, 'A', last).med, weighted(region.departments, 'A', first).med) : null;
  const title = `Prix immobilier ${region.name} : prix au m² par département et commune | Z Find`;
  const description = `Prix de l’immobilier ${where} : ${a ? `${eurM2(a.med)} pour un appartement` : ''}${a && m ? ', ' : ''}${m ? `${eurM2(m.med)} pour une maison` : ''} (DVF 2024-2025). Prix au m² des ${deps.length} départements et de leurs communes, évolution depuis 2021.`;
  const faq = [];
  if (a) faq.push({ q: `Quel est le prix au m² d’un appartement ${where} ?`, r: `${eurM2(a.med)} en 2024-2025 (moyenne des prix médians des départements pondérée par les ${nf.format(a.n)} ventes), contre ${nationalA ? eurM2(nationalA.med) : '—'} pour la France.` });
  if (ranked.length > 1) faq.push({ q: `Quel est le département le plus cher ${where} ?`, r: `${ranked[0].d.name} (${eurM2(ranked[0].a.med)} pour un appartement), le moins cher étant ${ranked[ranked.length - 1].d.name} (${eurM2(ranked[ranked.length - 1].a.med)}).` });
  if (change != null) faq.push({ q: `Les prix de l’immobilier augmentent-ils ${where} ?`, r: `Appartements : ${signed(change)} entre ${first} et ${last}.` });
  const others = (regions || []).filter(r => r.code !== region.code);
  const body = `    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Prix de l’immobilier · Région</p>
      <h1>Prix de l’immobilier ${esc(where)}</h1>
      <p class="zf-seo-lead">${a ? `Prix de référence d’un appartement ancien : ${eurM2(a.med)}${nationalA ? ` (France : ${eurM2(nationalA.med)})` : ''}. ` : ''}${m ? `Maison : ${eurM2(m.med)}${nationalM ? ` (France : ${eurM2(nationalM.med)})` : ''}. ` : ''}Comparez les ${deps.length} départements de la région, puis chaque commune.</p>
      <div class="zp-ctas"><a class="zf-seo-primary" href="${base}/#/fr/estimation?market=FR&amp;mode=owner">Estimer mon bien →</a><a class="zp-secondary" href="${base}/fr/simulateurs-immobiliers">Simulateurs immobiliers</a></div>
    </header>
    <div class="zp-stats">${regionCard('Appartements', a)}${regionCard('Maisons', m)}</div>
    <section class="zp-section"><h2>Prix au m² par département</h2>
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Département</th><th>Appartements</th><th>Maisons</th><th>Ventes 2024-2025</th></tr></thead><tbody>${deps.map(d => {
        const da = combined(d, 'A'); const dm = combined(d, 'M');
        return `<tr><td><a href="${base}${depPath(d.code, d.name)}">${esc(d.name)} (${esc(d.code)})</a></td><td>${da ? eurM2(da.med) : '—'}</td><td>${dm ? eurM2(dm.med) : '—'}</td><td>${nf.format(((da || {}).n || 0) + ((dm || {}).n || 0))}</td></tr>`;
      }).join('')}${region.excluded.map(d => `<tr><td>${esc(d.name)} (${esc(d.code)})</td><td colspan="3">Hors DVF (Alsace-Moselle)</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section class="zp-section"><h2>Évolution des prix ${esc(where)}</h2><div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Année</th><th>Appartements</th><th>Maisons</th><th>Ventes</th></tr></thead><tbody>${evolution}</tbody></table></div></section>
${comparisonTable(base, `${region.name} comparée à la France`, [
      { label: region.name, A: a, M: m },
      { label: 'France', href: ROOT_PATH, A: nationalA, M: nationalM }
    ], COMPARE_NOTE)}
    ${others.length ? `<section class="zp-section"><h2>Prix dans les autres régions</h2><ul class="zp-links">${others.map(r => `<li><a href="${base}${regionPath(r.name)}">${esc(r.name)}</a></li>`).join('')}</ul></section>` : ''}`;
  const jsonLd = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: base + path, inLanguage: 'fr', about: { '@type': 'AdministrativeArea', name: region.name, containedInPlace: { '@type': 'Country', name: 'France' } } }];
  if (faq.length) jsonLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.r } })) });
  return page({
    base, title, description, canonicalPath: path, indexable: true, body, jsonLd,
    breadcrumbs: [{ name: 'Z Find', path: '/' }, { name: 'Prix de l’immobilier', path: ROOT_PATH }, { name: region.name, path }]
  });
}

function renderCountry({ base, index }) {
  const a = latest(index.national.A); const m = latest(index.national.M);
  const deps = Object.entries(index.departments).map(([code, d]) => Object.assign({ code }, d))
    .sort((x, y) => x.code.localeCompare(y.code, 'fr', { numeric: true }));
  const covered = new Set(index.notUnderDvf || []);
  const title = 'Prix de l’immobilier en France : prix au m² par département et par commune | Z Find';
  const description = `Prix de l’immobilier en France : ${a ? `${eurM2(a.med)} pour un appartement` : ''}${a && m ? ', ' : ''}${m ? `${eurM2(m.med)} pour une maison` : ''} (médianes DVF). Prix au m² de chaque région, département et de près de 26 000 communes.`;
  const body = `    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Prix de l’immobilier · France</p>
      <h1>Prix de l’immobilier en France</h1>
      <p class="zf-seo-lead">${a ? `Prix médian d’un appartement ancien : ${eurM2(a.med)} ${periodLabel(a.period)}. ` : ''}${m ? `Maison : ${eurM2(m.med)}. ` : ''}Choisissez un département pour voir le prix au m² de chaque commune, calculé à partir des ventes réellement enregistrées.</p>
      <div class="zp-ctas"><a class="zf-seo-primary" href="${base}/#/fr/estimation?market=FR&amp;mode=owner">Estimer mon bien →</a></div>
    </header>
    <div class="zp-stats">${statCard('Appartements', a)}${statCard('Maisons', m)}</div>
    <section class="zp-section"><h2>Prix au m² par région</h2>
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Région</th><th>Appartements</th><th>Maisons</th></tr></thead><tbody>${regionsOf(index).map(r => {
        const ra = regionLatest(r, 'A'); const rm = regionLatest(r, 'M');
        return `<tr><td><a href="${base}${regionPath(r.name)}">${esc(r.name)}</a></td><td>${ra ? eurM2(ra.med) : '—'}</td><td>${rm ? eurM2(rm.med) : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="zp-small">${esc(COMPARE_NOTE)}</p>
    </section>
    <section class="zp-section"><h2>Prix au m² par département</h2>
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Département</th><th>Appartements</th><th>Maisons</th></tr></thead><tbody>${deps.map(d => {
        if (covered.has(d.code)) return `<tr><td>${esc(d.name)} (${esc(d.code)})</td><td colspan="2">Hors DVF</td></tr>`;
        const da = latest(d.A); const dm = latest(d.M);
        return `<tr><td><a href="${base}${depPath(d.code, d.name)}">${esc(d.name)} (${esc(d.code)})</a></td><td>${da ? eurM2(da.med) : '—'}</td><td>${dm ? eurM2(dm.med) : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>
    </section>
    <section class="zp-section"><h2>Autres pays</h2><ul class="zp-links"><li><a href="${base}/fr/prix-immobilier/belgique">Prix de l’immobilier en Belgique</a></li><li><a href="${base}/fr/prix-immobilier/luxembourg">Prix de l’immobilier au Luxembourg</a></li></ul></section>`;
  return page({
    base, title, description, canonicalPath: ROOT_PATH, indexable: true, body,
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: base + ROOT_PATH, inLanguage: 'fr', about: { '@type': 'Country', name: 'France' } }],
    breadcrumbs: [{ name: 'Z Find', path: '/' }, { name: 'Prix de l’immobilier', path: ROOT_PATH }]
  });
}

/* Communes voisines : les plus actives du département (hors la commune). */
function neighboursOf(commune, communes, max) {
  return communes.filter(c => c.c !== commune.c && isIndexable(c))
    .sort((x, y) => salesCount(y) - salesCount(x)).slice(0, max || 15);
}

/* URL du sitemap (pages indexables uniquement). depFiles : { code: {communes} }. */
function sitemapPaths(index, depFiles) {
  const out = [ROOT_PATH].concat(regionsOf(index).map(r => regionPath(r.name)));
  const skip = new Set(index.notUnderDvf || []);
  for (const [code, d] of Object.entries(index.departments)) {
    if (skip.has(code) || !depFiles[code]) continue;
    out.push(depPath(code, d.name));
    for (const c of depFiles[code].communes || []) if (isIndexable(c)) out.push(communePath(c));
  }
  return out;
}

module.exports = {
  notaryPath, page, esc, eur, eurM2, pct, signed, aCommune, deCommune, MIN_SALES, ROOT_PATH, BIG_CITY_PREFIX, slugify, parsePath, depOfCommune, depPath, communePath, latest, isIndexable,
  salesCount, neighboursOf, renderCommune, renderDepartment, renderCountry, renderRegion, sitemapPaths,
  regionsOf, regionOfDepartment, regionPath, regionLatest, cityOfArrondissement, enRegion
};
