/* ============================================================
   Z FIND — page d'une annonce : /fr/annonce/{titre}-{uuid}

   Servie par /api/annonce (réécriture de /fr/annonce/...). Remplace pour
   le français la page statique /fr/property/{id} générée au build : une
   annonce publiée est indexable dès sa publication, sans redéploiement,
   et retirée (410) dès qu'elle ne l'est plus.

   Contenu : photos, prix, caractéristiques, description, prix au m²
   comparé à la médiane DVF de la commune, frais de notaire au taux du
   département, mensualité indicative, encadrement des loyers, agence,
   annonces de la même commune, lien vers la page « Immobilier à ».

   Module pur : rendu HTML et règles. Les données viennent de la
   fonction (api/annonce.js).
   ============================================================ */
'use strict';

const P = require('./prix-pages');
const H = require('./immobilier-pages');
const costs = require('../../src/services/acquisition-costs.js');
const rates = require('../../src/services/credit-rates.js');
const credit = require('../../src/services/credit-simulator.js');

const ROOT = '/fr/annonce';
const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const MIN_DESCRIPTION = 60;
const MAX_IMAGES = 12;

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const SUBTYPE = Object.freeze({ apartment: 'Appartement', villa: 'Maison', land: 'Terrain', commercial: 'Local commercial', parking: 'Parking' });
const SCHEMA_TYPE = Object.freeze({ apartment: 'Apartment', villa: 'SingleFamilyResidence', land: 'Place', commercial: 'Place', parking: 'Place' });
const CONDITION = Object.freeze({ new: 'Neuf', renovated: 'Rénové', good: 'Bon état', to_renovate: 'À rénover', to_refresh: 'À rafraîchir' });

const listingPath = H.listingPath;

/* « appartement-t3-lyon-6e-0f…-…» → id ; un uuid seul est aussi accepté
   (ancienne adresse /fr/property/{id}, redirigée vers l'adresse canonique). */
function idFromPath(p) {
  const s = String(p || '').toLowerCase().split('/').filter(Boolean).filter(x => x !== 'fr' && x !== 'annonce' && x !== 'property');
  if (s.length !== 1) return null;
  const m = s[0].match(UUID);
  return m ? m[1] : null;
}

/* Code postal d'arrondissement → code commune INSEE de l'arrondissement
   (75016/75116 → 75116, 69006 → 69386, 13008 → 13208), sinon null. */
function arrondissementCode(cityCode, postalCode) {
  const cp = String(postalCode || '');
  if (cityCode === '75056' && /^75(0(0[1-9]|1\d|20)|116)$/.test(cp)) return cp === '75116' || cp === '75016' ? '75116' : `751${cp.slice(3)}`;
  if (cityCode === '69123' && /^6900[1-9]$/.test(cp)) return `6938${cp.slice(4)}`;
  if (cityCode === '13055' && /^130(0[1-9]|1[0-6])$/.test(cp)) return `132${cp.slice(3)}`;
  return null;
}

function priceText(l) {
  const v = `${l.priceIsFrom ? 'à partir de ' : ''}${nf.format(l.price)} ${l.currency === 'EUR' ? '€' : l.currency}`;
  return l.transaction === 'rent' ? `${v} / ${l.rentalPeriod === 'yearly' ? 'an' : l.rentalPeriod === 'seasonal' ? 'saison' : 'mois'}` : v;
}

function typeLabel(l) {
  const kind = SUBTYPE[l.subtype] || 'Bien';
  return `${kind}${l.typology ? ` ${l.typology}` : ''}`;
}

/* Caractéristiques affichées : [label, valeur] (vides retirées). */
function facts(l) {
  return [
    ['Type', typeLabel(l)],
    ['Transaction', l.transaction === 'rent' ? 'Location' : 'Vente'],
    ['Surface', l.area ? `${nf.format(l.area)} m²` : null],
    ['Terrain', l.plotArea ? `${nf.format(l.plotArea)} m²` : null],
    ['Chambres', l.bedrooms ? String(l.bedrooms) : null],
    ['Salles de bains', l.bathrooms ? String(l.bathrooms) : null],
    ['Étage', l.floor != null && l.subtype === 'apartment' ? (l.floor === 0 ? 'Rez-de-chaussée' : `${l.floor}e`) : null],
    ['Année de construction', l.yearBuilt ? String(l.yearBuilt) : null],
    ['État', CONDITION[l.condition] || null],
    ['DPE', l.energy ? String(l.energy).toUpperCase() : null],
    ['Charges de copropriété', l.condoFee ? `${nf.format(l.condoFee)} € / mois` : null],
    ['Référence', l.reference || null]
  ].filter(f => f[1]);
}

/* La page est indexée quand l'annonce est publiée, réelle (contrôle qualité
   déjà appliqué par la fonction), dans le périmètre FR/BE/LU, avec un
   titre, un prix et une description qui ne soit pas une ligne. */
function isIndexable(l) {
  return !!(l && l.published && ['FR', 'BE', 'LU'].includes(String(l.country || '').toUpperCase())
    && String(l.title || '').trim() && Number(l.price) > 0 && String(l.description || '').trim().length >= MIN_DESCRIPTION);
}

function paragraphs(text) {
  return String(text || '').split(/\n{2,}|\r\n\r\n/).map(s => s.trim()).filter(Boolean)
    .map(s => `<p>${P.esc(s).replace(/\r?\n/g, '<br>')}</p>`).join('');
}

/* Prix au m² de l'annonce et écart à la médiane DVF de la commune. */
function marketComparison(l, commune) {
  if (l.transaction !== 'sale' || !l.area || !commune || !['apartment', 'villa'].includes(l.subtype)) return null;
  const block = P.latest(l.subtype === 'apartment' ? commune.A : commune.M);
  if (!block || !block.med) return null;
  const perM2 = Math.round(l.price / l.area);
  const gap = Math.round(((perM2 - block.med) / block.med) * 100);
  return { perM2, med: block.med, n: block.n, period: block.period, gap };
}

function simulators(base, l, department, today) {
  if (l.transaction !== 'sale' || String(l.country).toUpperCase() !== 'FR' || !department) return '';
  const c = costs.estimate({ country: 'FR', price: l.price, department: department.code });
  const ref = rates.reference('FR', 20, today || new Date());
  const loan = c.total - Math.round(l.price * 0.1 / 1000) * 1000;
  const pay = ref ? credit.payment({ loan, ratePct: ref.ratePct, years: 20, insurancePct: 0 }) : null;
  const monthly = pay && !pay.error ? pay.monthly : null;
  return `<section class="zp-section"><h2>Budget d’achat</h2>
      <div class="zh-sims">
        <a class="zh-sim" href="${base}${P.notaryPath(department)}"><span>Frais de notaire</span><strong>${P.eur(c.costs)}</strong><small>dans l’ancien, taux du département ${P.esc(department.name)}</small></a>
        <a class="zh-sim" href="${base}/#/fr/simulator?market=FR&amp;mode=payment&amp;price=${Math.round(l.price)}"><span>Mensualité sur 20 ans</span><strong>${monthly != null ? `${P.eur(monthly)} / mois` : '—'}</strong><small>${ref ? `apport 10 %, taux moyen ${String(ref.ratePct).replace('.', ',')} %` : 'taux de référence indisponible'}</small></a>
        <a class="zh-sim" href="${base}/#/fr/yield?market=FR&amp;mode=long&amp;price=${Math.round(l.price)}"><span>Rentabilité locative</span><strong>Calculer →</strong><small>rendement brut et net</small></a>
      </div>
      <p class="zp-small">Coût total estimé : ${P.eur(c.total)} (prix + frais de notaire). Simulations indicatives, hors assurance emprunteur : ni offre de prêt ni conseil.</p>
    </section>`;
}

const STYLE = `<style id="zfind-annonce-styles">.za-gallery{display:grid;grid-template-columns:2fr 1fr;gap:8px;margin:22px 0 0}.za-gallery img{width:100%;height:100%;object-fit:cover;display:block;background:var(--zf-100)}.za-gallery .za-main{aspect-ratio:4/3;grid-row:span 2}.za-gallery .za-side{aspect-ratio:4/3}.za-more{display:flex;gap:8px;overflow-x:auto;margin-top:8px;scroll-snap-type:x mandatory}.za-more img{flex:0 0 46%;max-width:280px;height:auto;aspect-ratio:4/3;object-fit:cover;scroll-snap-align:start;background:var(--zf-100)}.za-price{font-family:'Cormorant Garamond',Georgia,serif;font-size:2.4rem;color:var(--zf-gold-dark);margin:14px 0 0;line-height:1.1}.za-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:40px;align-items:start}.za-aside{position:sticky;top:96px;margin-top:34px;padding:24px;border:1px solid var(--zf-200);background:#fff}.za-aside h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;font-size:1.5rem;margin:0 0 6px}.za-aside p{margin:0 0 14px;color:var(--zf-600);font-size:.92rem;line-height:1.6}.za-aside .zf-seo-primary{display:block;text-align:center}.za-facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0 24px;margin:0}.za-facts div{padding:10px 0;border-bottom:1px solid var(--zf-100)}.za-facts dt{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--zf-500)}.za-facts dd{margin:2px 0 0;color:var(--zf-800)}.za-desc p{max-width:760px}.za-gap{font-weight:600}.za-sticky{display:none}@media(max-width:900px){.za-layout{grid-template-columns:1fr;gap:0}.za-aside{position:static}.za-facts{grid-template-columns:repeat(2,minmax(0,1fr))}.za-sticky{display:block;position:fixed;left:16px;right:16px;bottom:16px;z-index:30;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.18)}.zf-seo-main{padding-bottom:84px}.za-gallery{grid-template-columns:1fr}.za-gallery .za-side{display:none}}</style>`;

const SOURCE = 'Annonce publiée sur Z Find par un professionnel de l’immobilier, qui en est responsable. Prix médians au m² : DVF — Demandes de valeurs foncières (DGFiP), ventes de logements anciens, sous licence ouverte. Frais de notaire au taux DGFiP du département (1er mai 2026). Ces chiffres sont indicatifs.';

/* ctx: { base, listing, commune, department, region, city, similar, today }
   listing: { id, title, description, price, currency, priceIsFrom, transaction,
              rentalPeriod, subtype, typology, area, plotArea, bedrooms, bathrooms,
              floor, yearBuilt, condition, energy, condoFee, reference, postalCode,
              locality, country, createdAt, published, agency: { name } | null,
              images: [url] } */
function render(ctx) {
  const { base, listing: l, commune, department, region, city, today } = ctx;
  const similar = (ctx.similar || []).filter(s => s.id !== l.id).slice(0, 6);
  const path = listingPath(l);
  const indexable = isIndexable(l);
  const place = commune ? H.displayName(commune.n) : (l.locality || '');
  const where = place ? ` ${P.aCommune(place)}` : '';
  const title = `${typeLabel(l)}${l.area ? ` ${nf.format(l.area)} m²` : ''} ${l.transaction === 'rent' ? 'à louer' : 'à vendre'}${where}${l.postalCode ? ` (${l.postalCode})` : ''} — ${priceText(l)} | Z Find`;
  const description = `${l.title}. ${String(l.description || '').replace(/\s+/g, ' ').trim()}`;
  const contactHref = `${base}/#/fr/property/${P.esc(l.id)}`;
  const images = (l.images || []).slice(0, MAX_IMAGES);
  const cmp = marketComparison(l, commune);
  const rc = l.transaction === 'rent' && commune ? H.rentControlFor(commune.c) : null;

  const gallery = images.length
    ? `<div class="za-gallery"><img class="za-main" src="${P.esc(images[0])}" alt="${P.esc(l.title)}" width="1200" height="900" fetchpriority="high">${images.slice(1, 3).map((src, i) => `<img class="za-side" src="${P.esc(src)}" alt="${P.esc(`${l.title} — photo ${i + 2}`)}" width="600" height="450" loading="lazy">`).join('')}</div>${images.length > 3 ? `<div class="za-more">${images.slice(3).map((src, i) => `<img src="${P.esc(src)}" alt="${P.esc(`${l.title} — photo ${i + 4}`)}" width="600" height="450" loading="lazy">`).join('')}</div>` : ''}`
    : '';

  const factsHtml = `<dl class="za-facts">${facts(l).map(([k, v]) => `<div><dt>${P.esc(k)}</dt><dd>${P.esc(v)}</dd></div>`).join('')}</dl>`;

  const cmpHtml = cmp ? `<section class="zp-section"><h2>Prix au m²</h2><p>Ce bien est affiché à <b>${P.eurM2(cmp.perM2)}</b>. Le prix médian ${l.subtype === 'apartment' ? 'des appartements' : 'des maisons'} ${P.esc(P.deCommune(place))} est de ${P.eurM2(cmp.med)} (DVF, ${nf.format(cmp.n)} ventes${cmp.period ? `, ${P.esc(cmp.period)}` : ''}) : <span class="za-gap">${cmp.gap === 0 ? 'au niveau de la médiane' : `${Math.abs(cmp.gap)} % ${cmp.gap > 0 ? 'au-dessus' : 'en dessous'} de la médiane`}</span>. Un écart s’explique souvent par l’état, l’étage, la vue ou l’emplacement exact. <a href="${base}${P.communePath(commune)}">Prix au m² ${P.esc(P.deCommune(place))} en détail</a>.</p></section>` : '';

  const rcHtml = rc ? `<section class="zp-section"><h2>Encadrement des loyers</h2><p>Les loyers sont encadrés à ${P.esc(rc.area)} depuis le ${P.esc(rc.since)} : l’annonce doit indiquer le loyer de référence et le loyer de référence majoré. <a href="https://www.service-public.fr/particuliers/vosdroits/F1314" rel="noopener">Règles officielles</a>.</p></section>` : '';

  const agencyName = l.agency && l.agency.name ? l.agency.name : null;
  const aside = `<aside class="za-aside"><h2>${agencyName ? P.esc(agencyName) : 'Professionnel vérifié'}</h2><p>${agencyName ? 'Agence immobilière vérifiée par Z Find. ' : ''}Posez vos questions ou demandez une visite : l’agence vous répond directement.</p><a class="zf-seo-primary" href="${contactHref}">Contacter l’agence →</a><p style="margin:14px 0 0" class="zp-small">Réponse moyenne sous 48 h. Gratuit et sans engagement.</p></aside>`;

  const similarHtml = similar.length
    ? `<section class="zp-section"><h2>Autres annonces${P.esc(where)}</h2><ul class="zh-list">${similar.map(s => `<li class="zh-card"><a href="${base}${listingPath(s)}"><strong>${P.esc(s.title)}</strong><span>${P.esc([SUBTYPE[s.subtype] || null, s.typology || null, s.area ? `${nf.format(s.area)} m²` : null].filter(Boolean).join(' · '))}</span><em>${P.esc(priceText(s))}</em></a></li>`).join('')}</ul></section>`
    : '';

  const placeLinks = commune
    ? `<section class="zp-section"><h2>${P.esc(`Immobilier ${P.aCommune(place)}`)}</h2><ul class="zp-links"><li><a href="${base}${H.hubPath(commune)}">Toutes les annonces ${P.esc(P.aCommune(place))}</a></li><li><a href="${base}${P.communePath(commune)}">Prix au m² ${P.esc(P.deCommune(place))}</a></li>${department ? `<li><a href="${base}${P.notaryPath(department)}">Frais de notaire — ${P.esc(department.name)}</a></li>` : ''}<li><a href="${base}/#/fr/estimation?market=FR&amp;mode=owner">Estimer mon bien</a></li></ul></section>`
    : '';

  const body = `${H.STYLE}${STYLE}
    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">${P.esc([typeLabel(l), l.transaction === 'rent' ? 'Location' : 'Vente', [place, l.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</p>
      <h1>${P.esc(l.title)}</h1>
      <p class="za-price">${P.esc(priceText(l))}</p>
      ${gallery}
    </header>
    <div class="za-layout">
      <div>
        <section class="zp-section"><h2>Caractéristiques</h2>${factsHtml}</section>
        <section class="zp-section za-desc"><h2>Description</h2>${paragraphs(l.description) || '<p>Description à venir : contactez l’agence pour en savoir plus.</p>'}</section>
        ${cmpHtml}
        ${simulators(base, l, department, today)}
        ${rcHtml}
      </div>
      ${aside}
    </div>
    ${similarHtml}
    ${placeLinks}
    <a class="zf-seo-primary za-sticky" href="${contactHref}">Contacter l’agence →</a>`;

  const residence = {
    '@type': SCHEMA_TYPE[l.subtype] || 'Accommodation',
    name: l.title,
    ...(l.area ? { floorSize: { '@type': 'QuantitativeValue', value: Number(l.area), unitCode: 'MTK' } } : {}),
    ...(l.bedrooms ? { numberOfBedrooms: l.bedrooms } : {}),
    ...(l.bathrooms ? { numberOfBathroomsTotal: l.bathrooms } : {}),
    ...(l.yearBuilt ? { yearBuilt: l.yearBuilt } : {}),
    address: { '@type': 'PostalAddress', ...(place ? { addressLocality: place } : {}), ...(l.postalCode ? { postalCode: l.postalCode } : {}), addressCountry: String(l.country || 'FR').toUpperCase() }
  };
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'RealEstateListing', name: l.title, url: base + path,
    description: String(l.description || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    ...(l.createdAt ? { datePosted: String(l.createdAt).slice(0, 10) } : {}),
    ...(images.length ? { image: images } : {}),
    about: residence,
    offers: {
      '@type': 'Offer', price: Number(l.price), priceCurrency: l.currency || 'EUR', availability: 'https://schema.org/InStock',
      businessFunction: l.transaction === 'rent' ? 'http://purl.org/goodrelations/v1#LeaseOut' : 'http://purl.org/goodrelations/v1#Sell',
      ...(agencyName ? { seller: { '@type': 'RealEstateAgent', name: agencyName } } : {})
    }
  }];

  const crumbs = [{ name: 'Z Find', path: '/' }]
    .concat(region ? [{ name: region.name, path: P.regionPath(region.name) }] : [])
    .concat(department ? [{ name: department.name, path: P.depPath(department.code, department.name) }] : [])
    .concat(city ? [{ name: `Immobilier ${P.aCommune(H.displayName(city.n))}`, path: H.hubPath(city) }] : [])
    .concat(commune ? [{ name: `Immobilier ${P.aCommune(place)}`, path: H.hubPath(commune) }] : [])
    .concat([{ name: l.title, path }]);

  return { indexable, path, html: P.page({ base, title, description, canonicalPath: path, indexable, breadcrumbs: crumbs, body, jsonLd, source: SOURCE, image: images[0] || null }) };
}

/* Annonce retirée : 410, noindex, avec les liens utiles de la commune. */
function renderGone(base, commune) {
  const place = commune ? H.displayName(commune.n) : null;
  const body = `<header class="zf-seo-hero"><p class="zf-seo-eyebrow">Annonce retirée</p><h1>Cette annonce n’est plus disponible</h1><p class="zf-seo-lead">Le bien a été vendu, loué ou retiré par l’agence.${place ? ` D’autres biens vous attendent ${P.esc(P.aCommune(place))}.` : ''}</p><div class="zp-ctas">${commune ? `<a class="zf-seo-primary" href="${base}${H.hubPath(commune)}">Immobilier ${P.esc(P.aCommune(place))} →</a>` : `<a class="zf-seo-primary" href="${base}/#/fr/search">Rechercher un bien →</a>`}<a class="zp-secondary" href="${base}/#/fr/search">Créer une alerte</a></div></header>`;
  return P.page({ base, title: 'Annonce retirée | Z Find', description: 'Cette annonce immobilière n’est plus disponible sur Z Find.', canonicalPath: ROOT, indexable: false, breadcrumbs: [{ name: 'Z Find', path: '/' }, { name: 'Annonce retirée', path: ROOT }], body, jsonLd: [], source: SOURCE });
}

module.exports = { ROOT, MIN_DESCRIPTION, listingPath, idFromPath, arrondissementCode, isIndexable, facts, marketComparison, render, renderGone, priceText };
