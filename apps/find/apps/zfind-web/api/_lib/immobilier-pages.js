/* ============================================================
   Z FIND — pages « Immobilier à {commune} » (France)

   Pages servies par /api/immobilier (réécriture de /fr/immobilier/...) :

     /fr/immobilier/{slug}-{insee}                    la commune : annonces,
                                                      prix, simulateurs, agences
     /fr/immobilier/{slug}-{insee}/appartements-a-vendre
     /fr/immobilier/{slug}-{insee}/maisons-a-vendre
     /fr/immobilier/{slug}-{insee}/location           annonces d'un type

   Indexation (plan SEO, lancement par zones) :
     - page commune : indexée pour les 6 grandes villes et leurs
       arrondissements (Paris, Marseille, Lyon, Toulouse, Nice, Nantes), et
       pour toute commune qui a au moins MIN_LISTINGS annonces publiées ;
     - page d'un type : indexée dès MIN_LISTINGS annonces de ce type.
   Sinon la page reste consultable mais « noindex » (pas de page mince) :
   les prix détaillés de la commune vivent sur /fr/prix-immobilier.

   Module pur : rendu HTML et règles. Les annonces et le nombre d'agences
   sont fournis par la fonction (api/immobilier.js).
   ============================================================ */
'use strict';

const P = require('./prix-pages');
const costs = require('../../src/services/acquisition-costs.js');
const rates = require('../../src/services/credit-rates.js');
const credit = require('../../src/services/credit-simulator.js');

const ROOT = '/fr/immobilier';
const MIN_LISTINGS = 3;

/* Les 6 plus grandes villes de France (INSEE) : code commune → préfixe des
   arrondissements (Paris, Marseille, Lyon) ou null. */
const TIER1 = Object.freeze({
  '75056': '751', '13055': '132', '69123': '6938', '31555': null, '06088': null, '44109': null
});
function tier1City(code) {
  const c = String(code);
  if (Object.prototype.hasOwnProperty.call(TIER1, c)) return c;
  return Object.keys(TIER1).find(city => TIER1[city] && c.startsWith(TIER1[city])) || null;
}
function isTier1(code) { return !!tier1City(code); }

/* Encadrement des loyers en vigueur (arrêtés préfectoraux). */
const RENT_CONTROL = Object.freeze({
  '75056': { area: 'Paris', since: '1er juillet 2019' },
  '69123': { area: 'Lyon et Villeurbanne', since: '1er novembre 2021' },
  '69266': { area: 'Lyon et Villeurbanne', since: '1er novembre 2021' }
});
function rentControlFor(code) {
  const city = tier1City(code);
  return RENT_CONTROL[code] || (city && RENT_CONTROL[city]) || null;
}

const TYPES = Object.freeze({
  'appartements-a-vendre': { label: 'Appartements à vendre', short: 'appartements à vendre', test: l => l.transaction === 'sale' && l.subtype === 'apartment', search: 'transactionType=sale&subtype=apartment', kind: 'A' },
  'maisons-a-vendre': { label: 'Maisons à vendre', short: 'maisons à vendre', test: l => l.transaction === 'sale' && l.subtype === 'villa', search: 'transactionType=sale&subtype=villa', kind: 'M' },
  location: { label: 'Locations', short: 'logements à louer', test: l => l.transaction === 'rent', search: 'transactionType=rent', kind: null }
});

/* « Lyon 6e Arrondissement » → « Lyon 6e » ; « Paris 1er Arrondissement » → « Paris 1er ». */
function displayName(name) { return String(name).replace(/\s+Arrondissement$/i, ''); }
function communeSlug(c) { return `${P.slugify(displayName(c.n))}-${c.c.toLowerCase()}`; }
function hubPath(c) { return `${ROOT}/${communeSlug(c)}`; }
function typePath(c, type) { return `${hubPath(c)}/${type}`; }

/* « lyon-6e-69386 », « lyon-6e-69386/location » → { code, slug, type } */
function parsePath(p) {
  const parts = String(p || '').toLowerCase().split('/').filter(Boolean);
  if (parts[0] === 'fr') parts.shift();
  if (parts[0] === 'immobilier') parts.shift();
  if (!parts.length || parts.length > 2) return null;
  const m = parts[0].match(/^(?:(.*)-)?((?:2a|2b|\d{2})\d{3}|97[1-6]\d{2})$/);
  if (!m) return null;
  if (parts[1] && !TYPES[parts[1]]) return null;
  return { code: m[2].toUpperCase(), slug: m[1] || '', type: parts[1] || null };
}

/* Annonce publique normalisée (api/immobilier.js) :
   { id, title, price, currency, transaction, rentalPeriod, subtype, typology, area, bedrooms } */
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
function priceText(l) {
  const v = `${nf.format(l.price)} ${l.currency === 'EUR' ? '€' : l.currency}`;
  return l.transaction === 'rent' ? `${v} / ${l.rentalPeriod === 'yearly' ? 'an' : l.rentalPeriod === 'seasonal' ? 'saison' : 'mois'}` : v;
}
const SUBTYPE = Object.freeze({ apartment: 'Appartement', villa: 'Maison', land: 'Terrain', commercial: 'Local', parking: 'Parking' });
/* Adresse publique d'une annonce (page servie par api/annonce.js). */
function listingPath(l) {
  const slug = P.slugify(l.title || 'annonce').slice(0, 80).replace(/-+$/, '') || 'annonce';
  return `/fr/annonce/${slug}-${String(l.id).toLowerCase()}`;
}
function listingCard(base, l) {
  const facts = [SUBTYPE[l.subtype] || null, l.typology || null, l.area ? `${nf.format(l.area)} m²` : null, l.bedrooms ? `${l.bedrooms} ch.` : null].filter(Boolean).join(' · ');
  return `<li class="zh-card"><a href="${base}${P.esc(listingPath(l))}"><strong>${P.esc(l.title)}</strong><span>${P.esc(facts)}</span><em>${P.esc(priceText(l))}</em></a></li>`;
}

/* Frais de notaire et mensualité d'un appartement de 60 m² au prix médian. */
function simulatorsSection(base, name, department, a, today) {
  const notary = P.notaryPath(department);
  if (!a) {
    return `<section class="zp-section"><h2>Simulateurs ${P.esc(P.aCommune(name))}</h2><ul class="zp-links"><li><a href="${base}${notary}">Frais de notaire — ${P.esc(department.name)}</a></li><li><a href="${base}/fr/capacite-emprunt">Capacité d’emprunt</a></li><li><a href="${base}/fr/simulateur-pret-immobilier">Simulateur de prêt</a></li><li><a href="${base}/fr/rentabilite-locative">Rentabilité locative</a></li></ul></section>`;
  }
  const price = Math.round((a.med * 60) / 1000) * 1000;
  const c = costs.estimate({ country: 'FR', price, department: department.code });
  const ref = rates.reference('FR', 20, today || new Date());
  const loan = c.total - Math.round(price * 0.1 / 1000) * 1000;
  const pay = ref ? credit.payment({ loan, ratePct: ref.ratePct, years: 20, insurancePct: 0 }) : null;
  const monthly = pay && !pay.error ? pay.monthly : null;
  return `<section class="zp-section">
      <h2>Simulateurs ${P.esc(P.aCommune(name))}</h2>
      <p>Pour un appartement de 60 m² au prix médian ${P.esc(P.deCommune(name))} (${P.eurM2(a.med)}), soit ${P.eur(price)} :</p>
      <div class="zh-sims">
        <a class="zh-sim" href="${base}${notary}"><span>Frais de notaire</span><strong>${P.eur(c.costs)}</strong><small>taux du département ${P.esc(department.name)}</small></a>
        <a class="zh-sim" href="${base}/#/fr/simulator?market=FR&amp;mode=payment&amp;price=${price}"><span>Mensualité sur 20 ans</span><strong>${monthly != null ? `${P.eur(monthly)} / mois` : '—'}</strong><small>${ref ? `apport 10 %, taux moyen ${String(ref.ratePct).replace('.', ',')} %` : 'taux de référence indisponible'}</small></a>
        <a class="zh-sim" href="${base}/#/fr/yield?market=FR&amp;mode=long&amp;price=${price}"><span>Rentabilité locative</span><strong>Calculer →</strong><small>rendement brut et net</small></a>
        <a class="zh-sim" href="${base}/fr/capacite-emprunt"><span>Capacité d’emprunt</span><strong>Calculer →</strong><small>selon vos revenus</small></a>
      </div>
      <p class="zp-small">Simulations indicatives, hors assurance emprunteur : ni offre de prêt ni conseil.</p>
    </section>`;
}

function rentControlSection(base, code) {
  const rc = rentControlFor(code);
  if (!rc) return '';
  return `<section class="zp-section"><h2>Encadrement des loyers</h2><p>Les loyers sont encadrés à ${P.esc(rc.area)} depuis le ${P.esc(rc.since)} : pour un logement loué vide ou meublé en résidence principale, le loyer de base ne peut pas dépasser le loyer de référence majoré fixé chaque année par arrêté préfectoral, selon le quartier, l’époque de construction, le nombre de pièces et le type de location. <a href="https://www.service-public.fr/particuliers/vosdroits/F1314" rel="noopener">Règles officielles sur service-public.fr</a>.</p></section>`;
}

/* Même adresse que _lib/agences-pages.js (pas de require : dépendance circulaire). */
function agencesPath(c) { return `/fr/agences-immobilieres/${P.slugify(displayName(c.n))}-${c.c.toLowerCase()}`; }

const STYLE = `<style id="zfind-hub-styles">.zh-list{list-style:none;padding:0;margin:18px 0 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}.zh-card a{display:block;height:100%;padding:20px;border:1px solid var(--zf-200);background:#fff;color:inherit}.zh-card a:hover{border-color:var(--zf-gold)}.zh-card strong{display:block;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.3rem;font-weight:500;line-height:1.25}.zh-card span{display:block;margin-top:6px;color:var(--zf-500);font-size:.86rem}.zh-card em{display:block;margin-top:10px;font-style:normal;color:var(--zf-gold-dark);font-weight:600}.zh-empty{padding:24px;border:1px dashed var(--zf-200);background:var(--zf-50);color:var(--zf-700);line-height:1.7}.zh-sims{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:12px}.zh-sim{display:block;padding:18px;border:1px solid var(--zf-200);background:#fff;color:inherit}.zh-sim:hover{border-color:var(--zf-gold)}.zh-sim span{display:block;color:var(--zf-500);font-size:.8rem;letter-spacing:.08em;text-transform:uppercase}.zh-sim strong{display:block;margin:6px 0 4px;color:var(--zf-gold-dark);font-family:'Cormorant Garamond',Georgia,serif;font-size:1.7rem;font-weight:400}.zh-sim small{color:var(--zf-500);font-size:.8rem}.zh-types{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.zs-faq details{padding:14px 0;border-bottom:1px solid var(--zf-200)}.zs-faq summary{cursor:pointer;font-weight:500}.zs-faq p{margin:10px 0 0}.zh-featured{margin-top:28px;padding:22px;border:1px solid var(--zf-200);border-top:3px solid var(--zf-gold);background:var(--zf-50)}.zh-featured h2{margin-top:0}.zh-badge{display:inline-block;margin-bottom:8px;padding:3px 9px;border-radius:2px;background:var(--zf-gold-dark);color:#fff;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase}.zh-featured .zh-list{margin-top:12px}.zh-agency{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}.zh-agency strong{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:500}.zh-note{margin:12px 0 0;color:var(--zf-500);font-size:.8rem}</style>`;

const SOURCE = 'Annonces publiées sur Z Find par des agences et promoteurs professionnels. Prix médians au m² : DVF — Demandes de valeurs foncières (DGFiP), ventes de logements anciens 2024-2025, sous licence ouverte. Frais de notaire au taux DGFiP du département (1er mai 2026). Ces chiffres ne remplacent pas une estimation de votre bien.';

/* « À la une » (mises en avant payées, migration 20261029220000) : un bloc
   séparé, signalé, jamais mêlé à la liste des annonces dont l'ordre reste
   neutre. featured : annonces de la page mises en avant ; agency :
   l'agence à la une de la commune ce mois-ci. */
function featuredBlock(base, name, featured) {
  if (!featured || !featured.length) return '';
  return `<section class="zh-featured" aria-label="Annonces à la une"><span class="zh-badge">À la une</span><h2>Annonces à la une ${P.esc(P.aCommune(name))}</h2><ul class="zh-list">${featured.slice(0, 6).map(l => listingCard(base, l)).join('')}</ul><p class="zh-note">Emplacements payés par les agences, distincts de la liste des annonces ci-dessous dont l’ordre n’est jamais modifié.</p></section>`;
}
function featuredAgencyBlock(base, name, agency) {
  if (!agency || !agency.name) return '';
  const link = agency.slug ? `<a class="zp-secondary" href="${base}/fr/agence/${P.esc(agency.slug)}">Voir l’agence →</a>` : '';
  return `<section class="zh-featured" aria-label="Agence à la une"><span class="zh-badge">Agence à la une</span><div class="zh-agency"><div><strong>${P.esc(agency.name)}</strong><p style="margin:6px 0 0">Agence partenaire de Z Find ${P.esc(P.aCommune(name))}${agency.city && agency.city !== name ? ` (${P.esc(agency.city)})` : ''}.</p></div>${link}</div><p class="zh-note">Emplacement payé par l’agence pour ce mois.</p></section>`;
}

/* La page d'une commune, ou d'un type d'annonces de la commune.
   ctx: { base, commune, department, region, city, arrondissements, neighbours, listings, agencies, type, today,
          featuredIds (ids des biens à la une), featuredAgency } */
function render(ctx) {
  const { base, commune, department, region, city, arrondissements, neighbours, agencies, type, today, featuredIds, featuredAgency } = ctx;
  const all = ctx.listings || [];
  const t = type ? TYPES[type] : null;
  const listings = t ? all.filter(t.test) : all;
  const name = displayName(commune.n);
  const a = P.latest(commune.A); const m = P.latest(commune.M);
  const path = t ? typePath(commune, type) : hubPath(commune);
  const indexable = t ? listings.length >= MIN_LISTINGS : (isTier1(commune.c) || all.length >= MIN_LISTINGS);
  const depLabel = `${department.name} (${department.code})`;
  const counts = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, all.filter(v.test).length]));
  const searchQ = encodeURIComponent(name);
  const searchHref = `${base}/#/fr/search?market=FR&amp;q=${searchQ}${t ? `&amp;${t.search.replace(/&/g, '&amp;')}` : ''}`;

  const priceLine = [a ? `${P.eurM2(a.med)} pour un appartement` : null, m ? `${P.eurM2(m.med)} pour une maison` : null].filter(Boolean).join(', ');
  const h1 = t ? `${t.label} ${P.aCommune(name)}` : `Immobilier ${P.aCommune(name)}`;
  const lead = t
    ? `${listings.length ? `${listings.length} annonce${listings.length > 1 ? 's' : ''} de ${t.short} ${P.aCommune(name)}, publiée${listings.length > 1 ? 's' : ''} par des professionnels vérifiés.` : `Aucune annonce de ${t.short} n’est publiée ${P.aCommune(name)} pour le moment.`}${t.kind && (t.kind === 'A' ? a : m) ? ` Prix médian : ${P.eurM2((t.kind === 'A' ? a : m).med)} (DVF).` : ''}`
    : `${all.length ? `${all.length} annonce${all.length > 1 ? 's' : ''} publiée${all.length > 1 ? 's' : ''} ${P.aCommune(name)} par des agences et promoteurs vérifiés. ` : ''}${priceLine ? `Prix médian au m² : ${priceLine} (ventes DVF ${(a || m).period === '2024-2025' ? '2024-2025' : (a || m).period}). ` : ''}Frais de notaire, mensualité et rentabilité calculés pour ${name}.`;
  const title = t
    ? `${t.label} ${P.aCommune(name)} (${department.code}) | Z Find`
    : `Immobilier ${P.aCommune(name)} (${department.code}) : annonces, prix au m², simulateurs | Z Find`;
  const description = t
    ? `${t.label} ${P.aCommune(name)} : annonces d’agences vérifiées${t.kind && (t.kind === 'A' ? a : m) ? `, prix médian ${P.eurM2((t.kind === 'A' ? a : m).med)}` : ''}. Frais de notaire et simulateurs pour ${name}.`
    : `Immobilier ${P.aCommune(name)} : annonces d’agences vérifiées${priceLine ? `, prix au m² (${priceLine})` : ''}, frais de notaire et simulateurs de prêt pour ${name}.`;

  const listingsBlock = listings.length
    ? `<ul class="zh-list">${listings.slice(0, 24).map(l => listingCard(base, l)).join('')}</ul>${listings.length > 24 ? `<p><a href="${searchHref}">Voir les ${listings.length} annonces →</a></p>` : ''}`
    : `<div class="zh-empty"><p style="margin:0">Z Find ouvre ${P.esc(P.aCommune(name))} : les premières agences arrivent. <a href="${searchHref}">Créez une alerte</a> pour être prévenu de chaque nouvelle annonce, ou <a href="${base}/#/fr/estimation?market=FR&amp;mode=owner">estimez votre bien</a> en attendant.</p></div>`;

  const typeLinks = t ? '' : `<div class="zh-types">${Object.entries(TYPES).map(([k, v]) => `<a class="zp-secondary" href="${base}${typePath(commune, k)}">${P.esc(v.label)}${counts[k] ? ` (${counts[k]})` : ''}</a>`).join('')}</div>`;

  const areaLinks = [];
  if (arrondissements && arrondissements.length) areaLinks.push(`<section class="zp-section"><h2>Les arrondissements ${P.esc(P.deCommune(displayName((city || commune).n)))}</h2><ul class="zp-links">${arrondissements.map(c => `<li><a href="${base}${t ? typePath(c, type) : hubPath(c)}">${P.esc(displayName(c.n))}</a></li>`).join('')}</ul></section>`);
  if (neighbours && neighbours.length) areaLinks.push(`<section class="zp-section"><h2>Immobilier dans les communes voisines</h2><ul class="zp-links">${neighbours.map(c => `<li><a href="${base}${hubPath(c)}">${P.esc(displayName(c.n))}</a></li>`).join('')}</ul></section>`);

  const faq = [];
  if (a) faq.push({ q: `Quel est le prix au m² d’un appartement ${P.aCommune(name)} ?`, r: `${P.eurM2(a.med)} (médiane DVF, ${a.n} ventes), avec une fourchette de ${P.eurM2(a.q1)} à ${P.eurM2(a.q3)}.` });
  if (a) {
    const price = Math.round((a.med * 60) / 1000) * 1000;
    const c = costs.estimate({ country: 'FR', price, department: department.code });
    faq.push({ q: `Combien de frais de notaire pour acheter ${P.aCommune(name)} ?`, r: `Pour un appartement de 60 m² au prix médian (${P.eur(price)}), environ ${P.eur(c.costs)} dans l’ancien, au taux du département ${department.name}.` });
  }
  faq.push({ q: `Combien d’annonces immobilières ${P.aCommune(name)} sur Z Find ?`, r: all.length ? `${all.length} annonce${all.length > 1 ? 's' : ''} publiée${all.length > 1 ? 's' : ''} par des professionnels, dont ${counts['appartements-a-vendre']} appartement(s) à vendre, ${counts['maisons-a-vendre']} maison(s) à vendre et ${counts.location} location(s).` : `Aucune pour le moment : Z Find ouvre ${P.aCommune(name)}. Créez une alerte pour être prévenu des premières annonces.` });

  const jsonLd = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: base + path, inLanguage: 'fr', about: { '@type': 'City', name, containedInPlace: city ? { '@type': 'City', name: displayName(city.n) } : { '@type': 'AdministrativeArea', name: department.name } }, ...(listings.length ? { mainEntity: { '@type': 'ItemList', numberOfItems: listings.length } } : {}) }];
  if (indexable) jsonLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.r } })) });

  const body = `${STYLE}
    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Immobilier · ${P.esc(depLabel)}</p>
      <h1>${P.esc(h1)}</h1>
      <p class="zf-seo-lead">${P.esc(lead)}</p>
      <div class="zp-ctas"><a class="zf-seo-primary" href="${searchHref}">${listings.length ? 'Voir les annonces et filtrer' : 'Créer une alerte'} →</a><a class="zp-secondary" href="${base}${P.communePath(commune)}">Prix au m² ${P.esc(P.deCommune(name))}</a><a class="zp-secondary" href="${base}/#/fr/estimation?market=FR&amp;mode=owner">Estimer mon bien</a></div>
      ${typeLinks}
    </header>
    ${t ? '' : featuredAgencyBlock(base, name, featuredAgency)}
    ${featuredBlock(base, name, (featuredIds || []).map(id => listings.find(l => l.id === id)).filter(Boolean))}
    <section class="zp-section"><h2>${P.esc(t ? `${t.label} ${P.aCommune(name)}` : `Annonces ${P.aCommune(name)}`)}</h2>${listingsBlock}</section>
    ${t && t.kind === null ? rentControlSection(base, commune.c) : ''}
    ${a || m ? `<div class="zp-stats">${a ? `<section class="zp-stat"><h2>Appartements</h2><p class="zp-big">${P.eurM2(a.med)}</p><p class="zp-small">Prix médian DVF · <a href="${base}${P.communePath(commune)}">évolution et détail</a></p></section>` : ''}${m ? `<section class="zp-stat"><h2>Maisons</h2><p class="zp-big">${P.eurM2(m.med)}</p><p class="zp-small">Prix médian DVF · <a href="${base}${P.communePath(commune)}">évolution et détail</a></p></section>` : ''}</div>` : ''}
    ${simulatorsSection(base, name, department, a, today)}
    ${!t ? rentControlSection(base, commune.c) : ''}
    <section class="zp-section"><h2>Professionnels ${P.esc(P.aCommune(name))}</h2><p>${agencies > 0 ? `<a href="${base}${agencesPath(commune)}">${nf.format(agencies)} agence${agencies > 1 ? 's' : ''} immobilière${agencies > 1 ? 's sont établies' : ' est établie'} ${P.esc(P.aCommune(name))}</a>. ` : ''}Vous êtes une agence ou un promoteur ? <a href="${base}/#/fr/pro">Publiez vos annonces sur Z Find</a> : trois mois offerts, Z Desk et Z Studio inclus.</p></section>
    ${areaLinks.join('\n')}
    <section class="zp-section zs-faq"><h2>Questions fréquentes</h2>${faq.map(f => `<details><summary>${P.esc(f.q)}</summary><p>${P.esc(f.r)}</p></details>`).join('')}</section>`;

  const crumbs = [{ name: 'Z Find', path: '/' }]
    .concat(region ? [{ name: region.name, path: P.regionPath(region.name) }] : [])
    .concat([{ name: department.name, path: P.depPath(department.code, department.name) }])
    .concat(city ? [{ name: `Immobilier ${P.aCommune(displayName(city.n))}`, path: hubPath(city) }] : [])
    .concat([{ name: `Immobilier ${P.aCommune(name)}`, path: hubPath(commune) }])
    .concat(t ? [{ name: t.label, path }] : []);
  return { indexable, html: P.page({ base, title, description, canonicalPath: path, indexable, breadcrumbs: crumbs, body, jsonLd, source: SOURCE }) };
}

/* Pages commune toujours indexées (6 grandes villes et arrondissements) :
   [{ c, n }] à partir des fichiers département. */
function tier1Communes(depFiles) {
  const out = [];
  for (const file of Object.values(depFiles)) {
    for (const c of (file && file.communes) || []) if (isTier1(c.c)) out.push(c);
  }
  return out;
}

module.exports = {
  featuredBlock, featuredAgencyBlock, ROOT, MIN_LISTINGS, listingPath, STYLE, TIER1, TYPES, isTier1, tier1City, rentControlFor, displayName, hubPath, typePath, parsePath, render, tier1Communes };
