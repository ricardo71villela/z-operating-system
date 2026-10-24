/* ============================================================
   Z FIND — pages « Prix de l'immobilier » Belgique et Luxembourg

     /fr/prix-immobilier/belgique                       pays, régions, provinces
     /fr/prix-immobilier/belgique/{slug}-{code}         province (ou Bruxelles-Capitale)
     /fr/prix-immobilier/belgique/{slug}-{nis}          commune
     /fr/prix-immobilier/luxembourg                     pays et communes
     /fr/prix-immobilier/luxembourg/{slug}              commune (quartiers pour Luxembourg-Ville)

   Données : public/market-data/be/index.json (Statbel — prix de vente
   médians, prix total, par commune) et lu/index.json (Observatoire de
   l'Habitat — prix au m², actes enregistrés et annonces).

   Module pur (aucun accès réseau), partagé par api/prix-immobilier.js et
   la génération du sitemap au build.
   ============================================================ */
'use strict';

const P = require('./prix-pages');
const costs = require('../../src/services/acquisition-costs.js');
const rates = require('../../src/services/credit-rates.js');
const credit = require('../../src/services/credit-simulator.js');

const { esc, eur, eurM2, pct, signed, slugify, aCommune, deCommune } = P;
const BE_ROOT = '/fr/prix-immobilier/belgique';
const LU_ROOT = '/fr/prix-immobilier/luxembourg';
const MIN_SALES = P.MIN_SALES;
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

const BE_SOURCE = 'Source : Statbel (Direction générale Statistique) — prix de vente des biens immobiliers d’après les actes enregistrés par le SPF Finances. Prix totaux médians (pas au m²) ; fourchette = 1er et 3e quartiles. Ces chiffres ne remplacent pas une estimation de votre bien.';
const LU_SOURCE = 'Source : Observatoire de l’Habitat — Ministère du Logement (data.public.lu). Prix au m² des ventes enregistrées (actes notariés) et des annonces publiées, sur les 12 derniers mois disponibles. Ces chiffres ne remplacent pas une estimation de votre bien.';

const BE_TYPES = Object.freeze([
  ['M', 'Maisons'], ['M23', 'Maisons 2 ou 3 façades'], ['M4', 'Maisons 4 façades (villas)'], ['A', 'Appartements']
]);
const BE_YEARS = ['2021', '2022', '2023', '2024', '2025'];

/* ---------------- Belgique ---------------- */

/* Statbel publie le nom néerlandais des communes flamandes : on affiche
   aussi l'exonyme français des villes principales (« Anvers (Antwerpen) »). */
const BE_FR_NAMES = Object.freeze({
  Antwerpen: 'Anvers', Gent: 'Gand', Brugge: 'Bruges', Leuven: 'Louvain', Mechelen: 'Malines', Kortrijk: 'Courtrai',
  Aalst: 'Alost', Oostende: 'Ostende', Ieper: 'Ypres', Tongeren: 'Tongres', 'Sint-Niklaas': 'Saint-Nicolas',
  Halle: 'Hal', Vilvoorde: 'Vilvorde', Dendermonde: 'Termonde', Ronse: 'Renaix', Geraardsbergen: 'Grammont',
  Tienen: 'Tirlemont', Lier: 'Lierre', Oudenaarde: 'Audenarde', Diksmuide: 'Dixmude', Veurne: 'Furnes',
  Menen: 'Menin', Roeselare: 'Roulers', 'Sint-Truiden': 'Saint-Trond', Zoutleeuw: 'Léau', Landen: 'Landen'
});
function beName(c) { const fr = BE_FR_NAMES[c.n]; return fr && fr !== c.n ? `${fr} (${c.n})` : c.n; }

function beStat(row, type, period) {
  const v = row && row[type] && row[type][period];
  return Array.isArray(v) && v[0] ? { n: v[0], q1: v[1], med: v[2], q3: v[3], period } : null;
}
function beSales(row, year) { return ((beStat(row, 'M', year) || {}).n || 0) + ((beStat(row, 'A', year) || {}).n || 0); }

function beIndex(data) {
  const L = data.levels || {};
  const byCode = {};
  for (const lvl of Object.keys(L)) for (const r of L[lvl]) byCode[r.c] = Object.assign({ level: lvl }, r);
  const groups = (L.province || []).concat((L.region || []).filter(r => r.c === '4000'));
  const groupOf = commune => {
    const arr = byCode[commune.p];
    if (!arr) return null;
    return byCode[arr.p] || null;
  };
  return { data, byCode, groups, communes: L.commune || [], arrondissements: L.arrondissement || [], national: (L.pays || [])[0], groupOf };
}
function beGroupName(g) { return g.c === '4000' ? 'Bruxelles-Capitale' : g.n.replace(/^Province (de |du |d’|d')/, '').replace(/^\w/, c => c.toUpperCase()); }
function beGroupLabel(g) { return g.c === '4000' ? 'la Région de Bruxelles-Capitale' : g.n.replace(/^Province/, 'la province'); }
function beGroupPath(g) { return `${BE_ROOT}/${slugify(g.c === '4000' ? 'bruxelles-capitale' : g.n)}-${g.c}`; }
function beCommunePath(c) { return `${BE_ROOT}/${slugify(c.n)}-${c.c}`; }
function beIndexable(c, year) { return beSales(c, year) >= MIN_SALES; }

function beCard(label, s) {
  if (!s || !s.med || s.n < MIN_SALES) return `<section class="zp-stat"><h2>${esc(label)}</h2><p class="zp-small">Pas assez de ventes publiées pour donner un prix.</p></section>`;
  return `<section class="zp-stat"><h2>${esc(label)}</h2><p class="zp-big">${eur(s.med)}</p><p class="zp-small">Fourchette : ${eur(s.q1)} à ${eur(s.q3)}<br>${nf.format(s.n)} vente${s.n > 1 ? 's' : ''} en ${s.period}</p></section>`;
}
function beCell(s) { return s && s.med && s.n >= MIN_SALES ? eur(s.med) : '—'; }

function beBudget(base, code, name, house, apt, today) {
  const region = costs.belgianRegionFromRefnis(code);
  if (!region) return '';
  const rows = [['Maison', house], ['Appartement', apt]].filter(([, s]) => s && s.med && s.n >= MIN_SALES).map(([label, s]) => {
    const c = costs.estimate({ country: 'BE', price: s.med, region, ownHome: true });
    return c && !c.error ? { label, price: s.med, costs: c.costs, total: c.total } : null;
  }).filter(Boolean);
  if (!rows.length) return '';
  const regionName = { WAL: 'Wallonie', VLG: 'Flandre', BRU: 'Bruxelles-Capitale' }[region];
  return `<section class="zp-section">
      <h2>Quel budget pour acheter ${esc(aCommune(name))} ?</h2>
      <p>Frais d’achat d’une habitation propre et unique au prix médian ${esc(deCommune(name))} (${esc(regionName)}) : droits d’enregistrement régionaux, honoraires du notaire et frais administratifs.</p>
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Bien</th><th>Prix médian</th><th>Frais d’achat</th><th>Coût total</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.label}</td><td>${eur(r.price)}</td><td>${eur(r.costs)}</td><td>${eur(r.total)}</td></tr>`).join('')}</tbody></table></div>
      <div class="zp-ctas"><a class="zp-secondary" href="${base}/#/fr/simulator?market=BE&amp;mode=payment&amp;price=${rows[0].price}">Simuler le crédit</a><a class="zp-secondary" href="${base}/fr/frais-achat-immobilier-belgique">Détail des frais d’achat en Belgique</a><a class="zp-secondary" href="${base}/#/fr/yield?market=BE&amp;mode=long&amp;price=${rows[0].price}">Rentabilité locative</a></div>
      <p class="zp-small">Estimation indicative : ni offre de prêt ni conseil. Le notaire confirme le montant exact.</p>
    </section>`;
}

function beCommune({ base, index, commune, today }) {
  const year = index.data.latestYear;
  const sem = index.data.latestSemester;
  const group = index.groupOf(commune);
  const arr = index.byCode[commune.p];
  const nat = index.national;
  const name = beName(commune);
  const house = beStat(commune, 'M', year); const apt = beStat(commune, 'A', year);
  const gHouse = group && beStat(group, 'M', year); const gApt = group && beStat(group, 'A', year);
  const ok = s => s && s.med && s.n >= MIN_SALES;
  const lead = [];
  if (ok(house)) lead.push(`Le prix médian d’une maison ${aCommune(name)} est de ${eur(house.med)} en ${year}${ok(gHouse) ? `, soit ${signed(pct(house.med, gHouse.med))} par rapport à ${beGroupLabel(group)} (${eur(gHouse.med)})` : ''}.`);
  if (ok(apt)) lead.push(`Pour un appartement, la médiane est de ${eur(apt.med)}${ok(gApt) ? ` (${beGroupLabel(group)} : ${eur(gApt.med)})` : ''}.`);
  if (!lead.length) lead.push(`Trop peu de ventes ont été publiées ${aCommune(name)} pour donner un prix fiable ; les prix de ${group ? beGroupLabel(group) : 'la province'} donnent un ordre de grandeur.`);
  const semH = beStat(commune, 'M', sem);
  const first = beStat(commune, 'M', '2021');
  const tr = ok(house) && first && first.n >= MIN_SALES ? pct(house.med, first.med) : null;
  const path = beCommunePath(commune);
  const indexable = beIndexable(commune, year);
  const title = `Prix immobilier ${name} ${year} : maisons et appartements | Z Find`;
  const description = ok(house) || ok(apt)
    ? `Prix de l’immobilier ${aCommune(name)} (${group ? beGroupName(group) : 'Belgique'}) : ${ok(house) ? `maison ${eur(house.med)}` : ''}${ok(house) && ok(apt) ? ', ' : ''}${ok(apt) ? `appartement ${eur(apt.med)}` : ''} (médianes Statbel ${year}). Évolution depuis 2021 et frais d’achat.`
    : `Prix de l’immobilier ${aCommune(name)} (Belgique) : repères de la province, évolution et estimation gratuite.`;
  const faq = [];
  if (ok(house)) faq.push({ q: `Quel est le prix d’une maison ${aCommune(name)} ?`, a: `${eur(house.med)} en ${year} (prix médian Statbel, ${house.n} ventes), avec une fourchette de ${eur(house.q1)} à ${eur(house.q3)}.` });
  if (ok(apt)) faq.push({ q: `Quel est le prix d’un appartement ${aCommune(name)} ?`, a: `${eur(apt.med)} en ${year} (prix médian Statbel, ${apt.n} ventes), avec une fourchette de ${eur(apt.q1)} à ${eur(apt.q3)}.` });
  if (tr != null) faq.push({ q: `Les prix augmentent-ils ${aCommune(name)} ?`, a: `Le prix médian des maisons a évolué de ${signed(tr)} entre 2021 et ${year}.` });
  const neighbours = index.communes.filter(c => c.p === commune.p && c.c !== commune.c && beIndexable(c, year))
    .sort((a, b) => beSales(b, year) - beSales(a, year)).slice(0, 15);
  const cmpRows = [[name, commune, null], arr && [arr.n, arr, null], group && [group.c === '4000' ? 'Région de Bruxelles-Capitale' : group.n, group, beGroupPath(group)], nat && ['Belgique', nat, BE_ROOT]].filter(Boolean);
  const body = `    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Prix de l’immobilier · ${esc(group ? (group.c === '4000' ? 'Bruxelles-Capitale' : group.n) : 'Belgique')}</p>
      <h1>Prix de l’immobilier ${esc(aCommune(name))}</h1>
      <p class="zf-seo-lead">${esc(lead.join(' '))}</p>
      <div class="zp-ctas"><a class="zf-seo-primary" href="${base}/#/fr/estimation?market=BE&amp;mode=owner">Estimer mon bien ${esc(aCommune(name))} →</a><a class="zp-secondary" href="${base}/#/fr/search?market=BE">Voir les annonces</a></div>
    </header>
    <div class="zp-stats">${BE_TYPES.map(([t, l]) => beCard(l, beStat(commune, t, year))).join('')}</div>
    ${semH && semH.n >= MIN_SALES ? `<p class="zp-small" style="margin-top:14px">Premier semestre ${esc(sem.slice(0, 4))} : maison ${eur(semH.med)} (${nf.format(semH.n)} ventes).</p>` : ''}
    <section class="zp-section">
      <h2>Évolution des prix ${esc(aCommune(name))}</h2>
      ${tr != null ? `<p>Prix médian des maisons : ${esc(signed(tr))} entre 2021 et ${esc(year)}.</p>` : ''}
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Année</th><th>Maisons</th><th>Appartements</th><th>Ventes</th></tr></thead><tbody>${BE_YEARS.map(y => `<tr><td>${y}</td><td>${beCell(beStat(commune, 'M', y))}</td><td>${beCell(beStat(commune, 'A', y))}</td><td>${nf.format(beSales(commune, y))}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section class="zp-section">
      <h2>${esc(name)} comparée à la province et à la Belgique</h2>
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th></th><th>Maisons</th><th>Appartements</th></tr></thead><tbody>${cmpRows.map(([n, r, p]) => `<tr><td>${p ? `<a href="${base}${p}">${esc(n)}</a>` : esc(n)}</td><td>${beCell(beStat(r, 'M', year))}</td><td>${beCell(beStat(r, 'A', year))}</td></tr>`).join('')}</tbody></table></div>
    </section>
    ${beBudget(base, commune.c, name, house, apt, today)}
    <section class="zp-section">
      <h2>Vendre ou acheter ${esc(aCommune(name))}</h2>
      <p>Une médiane décrit le marché, pas votre bien : l’état, la surface, le PEB ou le jardin font varier le prix. L’<a href="${base}/fr/estimation-immobiliere">estimation Z Find</a> en tient compte et vous donne une fourchette immédiatement. Pour les règles d’achat, consultez le <a href="${base}/fr/guides/immobilier-belgique">guide de l’immobilier en Belgique</a>.</p>
      <p>Vous êtes une agence immobilière ? <a href="${base}/#/fr/pro">Publiez vos annonces sur Z Find</a>.</p>
    </section>
    ${neighbours.length ? `<section class="zp-section"><h2>Prix dans les communes voisines</h2><ul class="zp-links">${neighbours.map(n => `<li><a href="${base}${beCommunePath(n)}">${esc(beName(n))}</a></li>`).join('')}</ul>${group ? `<p><a href="${base}${beGroupPath(group)}">Toutes les communes — ${esc(beGroupName(group))} →</a></p>` : ''}</section>` : ''}`;
  const jsonLd = [{ '@context': 'https://schema.org', '@type': 'WebPage', name: title, url: base + path, inLanguage: 'fr', about: { '@type': 'City', name, containedInPlace: { '@type': 'Country', name: 'Belgique' } } }];
  if (faq.length && indexable) jsonLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  const crumbs = [{ name: 'Z Find', path: '/' }, { name: 'Prix de l’immobilier', path: P.ROOT_PATH }, { name: 'Belgique', path: BE_ROOT }];
  if (group) crumbs.push({ name: beGroupName(group), path: beGroupPath(group) });
  crumbs.push({ name, path });
  return P.page({ base, title, description, canonicalPath: path, indexable, breadcrumbs: crumbs, body, jsonLd, market: 'BE', source: BE_SOURCE });
}

function beGroup({ base, index, group }) {
  const year = index.data.latestYear;
  const name = beGroupName(group);
  const arrs = new Set(index.arrondissements.filter(a => a.p === group.c).map(a => a.c));
  const communes = index.communes.filter(c => arrs.has(c.p)).sort((a, b) => beSales(b, year) - beSales(a, year) || a.n.localeCompare(b.n, 'fr'));
  const house = beStat(group, 'M', year); const apt = beStat(group, 'A', year);
  const path = beGroupPath(group);
  const title = `Prix immobilier ${group.c === '4000' ? 'Bruxelles-Capitale' : `province de ${name}`} : prix par commune ${year} | Z Find`;
  const description = `Prix de l’immobilier dans ${beGroupLabel(group)} : maison ${eur(house && house.med)}, appartement ${eur(apt && apt.med)} (médianes Statbel ${year}). Prix de ${communes.length} communes et évolution depuis 2021.`;
  const body = `    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Prix de l’immobilier · Belgique</p>
      <h1>Prix de l’immobilier : ${esc(group.c === '4000' ? 'Bruxelles-Capitale' : `province de ${name}`)}</h1>
      <p class="zf-seo-lead">Prix médian d’une maison dans ${esc(beGroupLabel(group))} : ${eur(house && house.med)} en ${esc(year)} ; appartement : ${eur(apt && apt.med)}. Retrouvez ci-dessous le prix de chaque commune.</p>
      <div class="zp-ctas"><a class="zf-seo-primary" href="${base}/#/fr/estimation?market=BE&amp;mode=owner">Estimer mon bien →</a></div>
    </header>
    <div class="zp-stats">${BE_TYPES.map(([t, l]) => beCard(l, beStat(group, t, year))).join('')}</div>
    <section class="zp-section"><h2>Évolution des prix</h2><div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Année</th><th>Maisons</th><th>Appartements</th><th>Ventes</th></tr></thead><tbody>${BE_YEARS.map(y => `<tr><td>${y}</td><td>${beCell(beStat(group, 'M', y))}</td><td>${beCell(beStat(group, 'A', y))}</td><td>${nf.format(beSales(group, y))}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="zp-section"><h2>Prix par commune</h2><div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Commune</th><th>Maisons</th><th>Appartements</th><th>Ventes ${esc(year)}</th></tr></thead><tbody>${communes.map(c => `<tr><td><a href="${base}${beCommunePath(c)}">${esc(beName(c))}</a></td><td>${beCell(beStat(c, 'M', year))}</td><td>${beCell(beStat(c, 'A', year))}</td><td>${nf.format(beSales(c, year))}</td></tr>`).join('')}</tbody></table></div></section>`;
  return P.page({
    base, title, description, canonicalPath: path, indexable: true, body, market: 'BE', source: BE_SOURCE,
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: base + path, inLanguage: 'fr', about: { '@type': 'AdministrativeArea', name } }],
    breadcrumbs: [{ name: 'Z Find', path: '/' }, { name: 'Prix de l’immobilier', path: P.ROOT_PATH }, { name: 'Belgique', path: BE_ROOT }, { name, path }]
  });
}

function beCountry({ base, index }) {
  const year = index.data.latestYear;
  const nat = index.national;
  const house = beStat(nat, 'M', year); const apt = beStat(nat, 'A', year);
  const groups = index.groups.slice().sort((a, b) => beGroupName(a).localeCompare(beGroupName(b), 'fr'));
  const top = index.communes.slice().sort((a, b) => beSales(b, year) - beSales(a, year)).slice(0, 40);
  const title = `Prix de l’immobilier en Belgique ${year} : par province et par commune | Z Find`;
  const description = `Prix de l’immobilier en Belgique : maison ${eur(house && house.med)}, appartement ${eur(apt && apt.med)} (médianes Statbel ${year}). Prix par région, province et pour 565 communes.`;
  const body = `    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Prix de l’immobilier · Belgique</p>
      <h1>Prix de l’immobilier en Belgique</h1>
      <p class="zf-seo-lead">Prix médian d’une maison : ${eur(house && house.med)} en ${esc(year)} ; appartement : ${eur(apt && apt.med)}. Choisissez une province pour voir le prix de chaque commune, d’après les ventes enregistrées.</p>
      <div class="zp-ctas"><a class="zf-seo-primary" href="${base}/#/fr/estimation?market=BE&amp;mode=owner">Estimer mon bien →</a><a class="zp-secondary" href="${base}/fr/frais-achat-immobilier-belgique">Frais d’achat en Belgique</a></div>
    </header>
    <div class="zp-stats">${BE_TYPES.map(([t, l]) => beCard(l, beStat(nat, t, year))).join('')}</div>
    <section class="zp-section"><h2>Prix par province</h2><div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Province</th><th>Maisons</th><th>Appartements</th></tr></thead><tbody>${groups.map(g => `<tr><td><a href="${base}${beGroupPath(g)}">${esc(beGroupName(g))}</a></td><td>${beCell(beStat(g, 'M', year))}</td><td>${beCell(beStat(g, 'A', year))}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="zp-section"><h2>Les communes les plus actives</h2><ul class="zp-links">${top.map(c => `<li><a href="${base}${beCommunePath(c)}">${esc(beName(c))}</a></li>`).join('')}</ul></section>
    <section class="zp-section"><h2>Autres pays</h2><ul class="zp-links"><li><a href="${base}${P.ROOT_PATH}">Prix de l’immobilier en France</a></li><li><a href="${base}${LU_ROOT}">Prix de l’immobilier au Luxembourg</a></li></ul></section>`;
  return P.page({
    base, title, description, canonicalPath: BE_ROOT, indexable: true, body, market: 'BE', source: BE_SOURCE,
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: base + BE_ROOT, inLanguage: 'fr', about: { '@type': 'Country', name: 'Belgique' } }],
    breadcrumbs: [{ name: 'Z Find', path: '/' }, { name: 'Prix de l’immobilier', path: P.ROOT_PATH }, { name: 'Belgique', path: BE_ROOT }]
  });
}

/* ---------------- Luxembourg ---------------- */

const LU_YEARS = ['2021', '2022', '2023', '2024', '2025'];
function luLast(values) {
  if (!values) return null;
  const key = Object.keys(values).find(k => !/^\d{4}$/.test(k));
  return key ? Object.assign({ period: key }, luVal(values[key])) : null;
}
function luVal(v) { return Array.isArray(v) ? { n: v[0], m2: v[1], avg: v[2], low: v[3], high: v[4] } : {}; }
function luYear(values, y) { return values && values[y] ? Object.assign({ period: y }, luVal(values[y])) : null; }
function luOk(s) { return !!(s && s.m2); }
function luPeriodLabel(p) {
  if (!p) return '';
  const q = p.match(/12 mois au (\d{4})T(\d)/);
  if (q) return `sur 12 mois, au ${q[2] === '1' ? '1er' : `${q[2]}e`} trimestre ${q[1]}`;
  const m = p.match(/\((\d{2})\/(\d{4})-(\d{2})\/(\d{4})\)/);
  if (m) return `de ${m[1]}/${m[2]} à ${m[3]}/${m[4]}`;
  return `en ${p}`;
}
function luSlug(code, c) { return slugify(c.n) || slugify(code.replace(/^LU-/, '')); }
function luPath(code, c) { return `${LU_ROOT}/${luSlug(code, c)}`; }
function luFigures(c) {
  return { regA: luLast(c.reg && c.reg.A), regN: luLast(c.reg && c.reg.N), askA: luLast(c.ask && c.ask.A), askM: luLast(c.ask && c.ask.M) };
}
function luIndexable(c) { const f = luFigures(c); return [f.regA, f.regN, f.askA, f.askM].some(luOk); }
function luCard(label, s, kind) {
  if (!luOk(s)) return `<section class="zp-stat"><h2>${esc(label)}</h2><p class="zp-small">Pas de prix publié pour cette période.</p></section>`;
  const range = s.low && s.high ? `Fourchette : ${eurM2(s.low)} à ${eurM2(s.high)}<br>` : '';
  const avg = s.avg ? `Prix moyen annoncé : ${eur(s.avg)}<br>` : '';
  return `<section class="zp-stat"><h2>${esc(label)}</h2><p class="zp-big">${eurM2(s.m2)}</p><p class="zp-small">${range}${avg}${s.n ? `${nf.format(s.n)} ${kind} ` : ''}${esc(luPeriodLabel(s.period))}</p></section>`;
}
function luCell(s) { return luOk(s) ? eurM2(s.m2) : '—'; }

function luBudget(base, name, regA, askA, today) {
  const ref = luOk(regA) ? regA : luOk(askA) ? askA : null;
  if (!ref) return '';
  const price = Math.round(ref.m2 * 70 / 1000) * 1000;
  const c1 = costs.estimate({ country: 'LU', price, ownHome: true, buyers: 1 });
  const c0 = costs.estimate({ country: 'LU', price, ownHome: false });
  const r = rates.reference('LU', 25, today || new Date());
  const deposit = Math.round(price * 0.2 / 1000) * 1000;
  const loan = Math.max(0, c1.total - deposit);
  const pay = r ? credit.payment({ loan, ratePct: r.ratePct, years: 25, insurancePct: 0 }) : null;
  return `<section class="zp-section">
      <h2>Quel budget pour acheter ${esc(aCommune(name))} ?</h2>
      <p>Appartement de 70 m² au prix ${ref === regA ? 'des ventes enregistrées' : 'annoncé'} ${esc(deCommune(name))} : ${eur(price)}. Droits d’enregistrement et de transcription (7 %) : ${eur(c0.costs)}, ramenés à ${eur(c1.costs)} pour une résidence principale grâce au crédit d’impôt « Bëllegen Akt » (1 acquéreur).${pay && !pay.error ? ` Avec 20 % d’apport et un prêt sur 25 ans au taux moyen de ${String(r.ratePct).replace('.', ',')} % (${esc(r.source.name)}, ${esc(rates.periodLabel(r.period, 'fr'))}), la mensualité est d’environ ${eur(pay.monthly)}, hors assurance.` : ''}</p>
      <div class="zp-ctas"><a class="zp-secondary" href="${base}/#/fr/simulator?market=LU&amp;mode=payment&amp;price=${price}">Simuler le crédit</a><a class="zp-secondary" href="${base}/fr/frais-achat-immobilier-luxembourg">Frais d’achat au Luxembourg</a><a class="zp-secondary" href="${base}/#/fr/yield?market=LU&amp;mode=long&amp;price=${price}">Rentabilité locative</a></div>
      <p class="zp-small">Estimation indicative, honoraires du notaire non inclus : ni offre de prêt ni conseil.</p>
    </section>`;
}

function luCommune({ base, data, code, commune, today }) {
  const isCity = slugify(commune.n) === 'luxembourg';
  const name = isCity ? 'Luxembourg-Ville' : commune.n;
  const f = luFigures(commune);
  const nat = luFigures((data.national || {}).LU || {});
  const path = luPath(code, commune);
  const indexable = luIndexable(commune);
  const lead = [];
  if (luOk(f.regA)) lead.push(`Les appartements existants se sont vendus ${eurM2(f.regA.m2)} ${aCommune(name)} ${luPeriodLabel(f.regA.period)}, d’après les actes enregistrés${luOk(nat.regA) ? ` (pays : ${eurM2(nat.regA.m2)})` : ''}.`);
  if (luOk(f.askM)) lead.push(`Les maisons sont annoncées autour de ${eurM2(f.askM.m2)}${f.askM.avg ? `, soit ${eur(f.askM.avg)} en moyenne` : ''}.`);
  if (luOk(f.askA) && !luOk(f.regA)) lead.push(`Les appartements sont annoncés autour de ${eurM2(f.askA.m2)}.`);
  if (!lead.length) lead.push(`Trop peu de ventes et d’annonces sont publiées ${aCommune(name)} pour donner un prix ; les prix du canton${commune.canton ? ` ${deCommune(commune.canton)}` : ''} et du pays donnent un ordre de grandeur.`);
  const title = `Prix immobilier ${isCity ? name : `${name} (Luxembourg)`} : prix au m² ${new Date(today || Date.now()).getFullYear()} | Z Find`;
  const description = `Prix de l’immobilier ${aCommune(name)} : ${luOk(f.regA) ? `appartement ${eurM2(f.regA.m2)} (ventes)` : ''}${luOk(f.regA) && luOk(f.askM) ? ', ' : ''}${luOk(f.askM) ? `maison ${eurM2(f.askM.m2)} (annonces)` : ''}${luOk(f.regA) || luOk(f.askM) ? '' : 'repères de prix'} — Observatoire de l’Habitat. Évolution, frais d’achat et Bëllegen Akt.`;
  const faq = [];
  if (luOk(f.regA)) faq.push({ q: `Quel est le prix au m² d’un appartement ${aCommune(name)} ?`, a: `${eurM2(f.regA.m2)} pour un appartement existant (ventes enregistrées ${luPeriodLabel(f.regA.period)}, Observatoire de l’Habitat).` });
  if (luOk(f.askM)) faq.push({ q: `Combien coûte une maison ${aCommune(name)} ?`, a: `Les maisons sont annoncées autour de ${eurM2(f.askM.m2)}${f.askM.avg ? `, pour un prix moyen de ${eur(f.askM.avg)}` : ''} (${luPeriodLabel(f.askM.period)}).` });
  const districts = isCity ? Object.entries(data.districts || {}).sort((a, b) => a[0].localeCompare(b[0], 'fr')) : [];
  const others = Object.entries(data.communes || {}).filter(([k, c]) => k !== code && c.canton && c.canton === commune.canton && luIndexable(c));
  const body = `    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Prix de l’immobilier · Luxembourg${commune.canton ? ` · canton ${esc(deCommune(commune.canton))}` : ''}</p>
      <h1>Prix de l’immobilier ${esc(aCommune(name))}</h1>
      <p class="zf-seo-lead">${esc(lead.join(' '))}</p>
      <div class="zp-ctas"><a class="zf-seo-primary" href="${base}/#/fr/estimation?market=LU&amp;mode=owner">Estimer mon bien ${esc(aCommune(name))} →</a><a class="zp-secondary" href="${base}/#/fr/search?market=LU">Voir les annonces</a></div>
    </header>
    <div class="zp-stats">${luCard('Appartements existants (ventes)', f.regA, 'ventes')}${luCard('Appartements neufs VEFA (ventes)', f.regN, 'ventes')}${luCard('Appartements (annonces)', f.askA, 'annonces')}${luCard('Maisons (annonces)', f.askM, 'annonces')}</div>
    <section class="zp-section">
      <h2>Évolution des prix ${esc(aCommune(name))}</h2>
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Année</th><th>Appart. existants (ventes)</th><th>Appart. neufs (ventes)</th><th>Appart. (annonces)</th><th>Maisons (annonces)</th></tr></thead><tbody>${LU_YEARS.map(y => `<tr><td>${y}</td><td>${luCell(luYear(commune.reg && commune.reg.A, y))}</td><td>${luCell(luYear(commune.reg && commune.reg.N, y))}</td><td>${luCell(luYear(commune.ask && commune.ask.A, y))}</td><td>${luCell(luYear(commune.ask && commune.ask.M, y))}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section class="zp-section">
      <h2>${esc(name)} comparée à l’ensemble du pays</h2>
      <div class="zp-table-wrap"><table class="zp-table"><thead><tr><th></th><th>Appart. existants</th><th>Appart. neufs</th><th>Maisons (annonces)</th></tr></thead><tbody><tr><td>${esc(name)}</td><td>${luCell(f.regA)}</td><td>${luCell(f.regN)}</td><td>${luCell(f.askM)}</td></tr><tr><td><a href="${base}${LU_ROOT}">Luxembourg (pays)</a></td><td>${luCell(nat.regA)}</td><td>${luCell(nat.regN)}</td><td>${luCell(nat.askM)}</td></tr></tbody></table></div>
    </section>
    ${districts.length ? `<section class="zp-section"><h2>Prix annoncés par quartier de Luxembourg-Ville</h2><div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Quartier</th><th>Appartements</th><th>Maisons</th></tr></thead><tbody>${districts.map(([n, d]) => `<tr><td>${esc(n)}</td><td>${luCell(luLast(d.ask && d.ask.A))}</td><td>${luCell(luLast(d.ask && d.ask.M))}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    ${luBudget(base, name, f.regA, f.askA, today)}
    <section class="zp-section">
      <h2>Vendre ou acheter ${esc(aCommune(name))}</h2>
      <p>Un prix au m² décrit le marché, pas votre bien. L’<a href="${base}/fr/estimation-immobiliere">estimation Z Find</a> vous donne une fourchette immédiatement. Vous êtes une agence immobilière ? <a href="${base}/#/fr/pro">Publiez vos annonces sur Z Find</a>.</p>
    </section>
    ${others.length ? `<section class="zp-section"><h2>Prix dans le canton${commune.canton ? ` ${esc(deCommune(commune.canton))}` : ''}</h2><ul class="zp-links">${others.map(([k, c]) => `<li><a href="${base}${luPath(k, c)}">${esc(c.n)}</a></li>`).join('')}</ul><p><a href="${base}${LU_ROOT}">Toutes les communes du Luxembourg →</a></p></section>` : ''}`;
  const jsonLd = [{ '@context': 'https://schema.org', '@type': 'WebPage', name: title, url: base + path, inLanguage: 'fr', about: { '@type': 'City', name, containedInPlace: { '@type': 'Country', name: 'Luxembourg' } } }];
  if (faq.length && indexable) jsonLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(q => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })) });
  return P.page({
    base, title, description, canonicalPath: path, indexable, body, jsonLd, market: 'LU', source: LU_SOURCE,
    breadcrumbs: [{ name: 'Z Find', path: '/' }, { name: 'Prix de l’immobilier', path: P.ROOT_PATH }, { name: 'Luxembourg', path: LU_ROOT }, { name, path }]
  });
}

function luCountry({ base, data }) {
  const nat = luFigures((data.national || {}).LU || {});
  const rows = Object.entries(data.communes || {}).sort((a, b) => a[1].n.localeCompare(b[1].n, 'fr'));
  const title = 'Prix de l’immobilier au Luxembourg : prix au m² par commune | Z Find';
  const description = `Prix de l’immobilier au Luxembourg : appartement existant ${eurM2(nat.regA && nat.regA.m2)}, neuf ${eurM2(nat.regN && nat.regN.m2)} (ventes enregistrées, Observatoire de l’Habitat). Prix au m² des 100 communes et des quartiers de Luxembourg-Ville.`;
  const body = `    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Prix de l’immobilier · Luxembourg</p>
      <h1>Prix de l’immobilier au Luxembourg</h1>
      <p class="zf-seo-lead">Prix au m² d’un appartement existant : ${eurM2(nat.regA && nat.regA.m2)} ; appartement neuf (VEFA) : ${eurM2(nat.regN && nat.regN.m2)}, ${esc(luPeriodLabel(nat.regA && nat.regA.period))}, d’après les actes de vente enregistrés. Choisissez une commune pour le détail.</p>
      <div class="zp-ctas"><a class="zf-seo-primary" href="${base}/#/fr/estimation?market=LU&amp;mode=owner">Estimer mon bien →</a><a class="zp-secondary" href="${base}/fr/frais-achat-immobilier-luxembourg">Frais d’achat et Bëllegen Akt</a></div>
    </header>
    <div class="zp-stats">${luCard('Appartements existants (ventes)', nat.regA, 'ventes')}${luCard('Appartements neufs VEFA (ventes)', nat.regN, 'ventes')}</div>
    <section class="zp-section"><h2>Prix au m² par commune</h2><div class="zp-table-wrap"><table class="zp-table"><thead><tr><th>Commune</th><th>Canton</th><th>Appart. existants (ventes)</th><th>Appart. (annonces)</th><th>Maisons (annonces)</th></tr></thead><tbody>${rows.map(([k, c]) => { const f = luFigures(c); return `<tr><td>${luIndexable(c) ? `<a href="${base}${luPath(k, c)}">${esc(c.n)}</a>` : esc(c.n)}</td><td>${esc(c.canton || '')}</td><td>${luCell(f.regA)}</td><td>${luCell(f.askA)}</td><td>${luCell(f.askM)}</td></tr>`; }).join('')}</tbody></table></div></section>
    <section class="zp-section"><h2>Autres pays</h2><ul class="zp-links"><li><a href="${base}${P.ROOT_PATH}">Prix de l’immobilier en France</a></li><li><a href="${base}${BE_ROOT}">Prix de l’immobilier en Belgique</a></li></ul></section>`;
  return P.page({
    base, title, description, canonicalPath: LU_ROOT, indexable: true, body, market: 'LU', source: LU_SOURCE,
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: base + LU_ROOT, inLanguage: 'fr', about: { '@type': 'Country', name: 'Luxembourg' } }],
    breadcrumbs: [{ name: 'Z Find', path: '/' }, { name: 'Prix de l’immobilier', path: P.ROOT_PATH }, { name: 'Luxembourg', path: LU_ROOT }]
  });
}

/* ---------------- routage et sitemap ---------------- */

/* parts : segments après /fr/prix-immobilier/ (« belgique », « namur-92094 »…).
   Retour : { status:200, html } | { redirect } | null (introuvable). */
function route(parts, { base, be, lu, today }) {
  const [country, slugCode, extra] = parts;
  if (extra) return null;
  if (country === 'belgique' && be) {
    const index = beIndex(be);
    if (!slugCode) return { html: beCountry({ base, index }) };
    const m = String(slugCode).match(/^(?:(.*)-)?(\d{4,5})$/);
    if (!m) return null;
    const row = index.byCode[m[2]];
    if (!row) return null;
    if (row.level === 'commune') {
      const canonical = beCommunePath(row);
      if (`${BE_ROOT}/${slugCode}` !== canonical) return { redirect: canonical };
      return { html: beCommune({ base, index, commune: row, today }), indexable: beIndexable(row, be.latestYear) };
    }
    const group = index.groups.find(g => g.c === row.c);
    if (!group) return null;
    const canonical = beGroupPath(group);
    if (`${BE_ROOT}/${slugCode}` !== canonical) return { redirect: canonical };
    return { html: beGroup({ base, index, group }) };
  }
  if (country === 'luxembourg' && lu) {
    if (!slugCode) return { html: luCountry({ base, data: lu }) };
    const hit = Object.entries(lu.communes || {}).find(([k, c]) => luSlug(k, c) === slugCode);
    if (!hit) return null;
    return { html: luCommune({ base, data: lu, code: hit[0], commune: hit[1], today }) };
  }
  return null;
}

function sitemapPaths(be, lu) {
  const out = [];
  if (be) {
    const index = beIndex(be);
    out.push(BE_ROOT);
    for (const g of index.groups) out.push(beGroupPath(g));
    for (const c of index.communes) if (beIndexable(c, be.latestYear)) out.push(beCommunePath(c));
  }
  if (lu) {
    out.push(LU_ROOT);
    for (const [k, c] of Object.entries(lu.communes || {})) if (luIndexable(c)) out.push(luPath(k, c));
  }
  return out;
}

module.exports = { BE_ROOT, LU_ROOT, route, sitemapPaths, beIndex, beCommunePath, beGroupPath, luPath, luIndexable, luPeriodLabel };
