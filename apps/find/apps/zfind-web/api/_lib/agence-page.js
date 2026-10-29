/* ============================================================
   Z FIND — page publique d'une agence partenaire : /fr/agence/{slug}

   Servie par /api/agences?agence={slug} (réécriture de /fr/agence/...).
   Contenu : logo, présentation, coordonnées, horaires, annonces publiées
   de l'agence sur Z Find, liens vers les pages locales. L'agence remplit
   sa fiche dans l'espace Partner (« Ma page agence »).

   Module pur : rendu HTML et règles. Les données viennent de la
   fonction (api/agences.js).
   ============================================================ */
'use strict';

const P = require('./prix-pages');
const H = require('./immobilier-pages');

const ROOT = '/fr/agence';
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MIN_DESCRIPTION = 80;
const MAX_LISTINGS = 60;
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

function agencyPath(slug) { return `${ROOT}/${slug}`; }
function slugFromQuery(v) {
  const s = String(v || '').toLowerCase().split('/').filter(Boolean).filter(x => x !== 'fr' && x !== 'agence')[0] || '';
  return SLUG_RE.test(s) && s.length <= 80 ? s : null;
}

/** Page indexable : agence active, page publique, et du contenu (présentation ou annonces). */
function isIndexable(ctx) {
  const pr = ctx.profile || {};
  return !!(ctx.partner && ctx.partner.status === 'active' && pr.public_page !== false
    && ((pr.description && pr.description.trim().length >= MIN_DESCRIPTION) || (ctx.listings || []).length > 0));
}

function paragraphs(text) {
  return String(text || '').split(/\n{2,}|\r\n\r\n/).map(t => t.trim()).filter(Boolean).map(t => `<p>${P.esc(t).replace(/\n/g, '<br>')}</p>`).join('');
}
function telHref(phone) { return 'tel:' + String(phone || '').replace(/[^\d+]/g, ''); }
function countryName(c) { return { FR: 'France', BE: 'Belgique', LU: 'Luxembourg' }[c] || ''; }

const STYLE = `<style id="zfind-agence-styles">.zg-head{display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:center}.zg-logo{width:120px;height:120px;object-fit:contain;background:#fff;border:1px solid var(--zf-200);padding:10px}.zg-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:40px;margin-top:34px;align-items:start}.zg-card{padding:24px;border:1px solid var(--zf-200);background:#fff}.zg-card h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.6rem;font-weight:400;margin:0 0 12px}.zg-card dl{margin:0;display:grid;gap:12px}.zg-card dt{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--zf-500)}.zg-card dd{margin:2px 0 0;color:var(--zf-900);line-height:1.5;white-space:pre-line}.zg-card a{color:var(--zf-gold-dark);font-weight:500}.zg-list{list-style:none;padding:0;margin:18px 0 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}.zg-item a{display:block;height:100%;border:1px solid var(--zf-200);background:#fff;color:inherit}.zg-item a:hover{border-color:var(--zf-gold)}.zg-item img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--zf-50)}.zg-item div{padding:16px}.zg-item strong{display:block;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.25rem;font-weight:500;line-height:1.25}.zg-item span{display:block;margin-top:6px;color:var(--zf-500);font-size:.86rem}.zg-item em{display:block;margin-top:8px;font-style:normal;color:var(--zf-gold-dark);font-weight:600}.zg-badge{display:inline-block;margin-top:10px;padding:3px 10px;background:var(--zf-gold-pale);color:var(--zf-gold-dark);font-size:.74rem;letter-spacing:.06em;text-transform:uppercase}@media(max-width:860px){.zg-grid{grid-template-columns:1fr}.zg-head{grid-template-columns:1fr}.zg-logo{width:96px;height:96px}}</style>`;

const SUBTYPE = Object.freeze({ apartment: 'Appartement', villa: 'Maison', land: 'Terrain', commercial: 'Local', parking: 'Parking' });
function priceText(l) {
  const v = `${nf.format(l.price)} ${l.currency === 'EUR' ? '€' : l.currency}`;
  return l.transaction === 'rent' ? `${v} / ${l.rentalPeriod === 'yearly' ? 'an' : 'mois'}` : v;
}
function listingItem(base, l) {
  const facts = [SUBTYPE[l.subtype] || null, l.typology || null, l.area ? `${nf.format(l.area)} m²` : null, l.locality || null].filter(Boolean).join(' · ');
  return `<li class="zg-item"><a href="${base}${P.esc(H.listingPath(l))}">${l.image ? `<img src="${P.esc(l.image)}" alt="${P.esc(l.title)}" loading="lazy">` : ''}<div><strong>${P.esc(l.title)}</strong><span>${P.esc(facts)}</span><em>${P.esc(priceText(l))}</em></div></a></li>`;
}

/**
 * ctx = { base, partner: { id, name, status }, profile: zfind_partner_profiles row,
 *         logoUrl, listings: [annonce normalisée + image], localPages: [{ name, path }] }
 */
function render(ctx) {
  const { base } = ctx;
  const pr = ctx.profile || {};
  const name = ctx.partner.name;
  const city = pr.city || null;
  const path = agencyPath(pr.slug);
  const listings = (ctx.listings || []).slice(0, MAX_LISTINGS);
  const sale = listings.filter(l => l.transaction !== 'rent').length;
  const rent = listings.length - sale;
  const indexable = isIndexable(ctx);
  const where = city ? ` ${P.aCommune(city)}` : '';
  const title = `${name}${city ? ` — agence immobilière ${P.aCommune(city)}` : ' — agence immobilière'}${listings.length ? ` : ${listings.length} annonce${listings.length > 1 ? 's' : ''}` : ''} | Z Find`;
  const description = (pr.description && pr.description.trim())
    ? `${name}${where} : ${pr.description.trim()}`
    : `${name}, agence immobilière partenaire de Z Find${where}${listings.length ? ` : ${listings.length} annonce${listings.length > 1 ? 's' : ''} en ligne` : ''}. Coordonnées, horaires et annonces.`;
  const address = [pr.address, [pr.postcode, city].filter(Boolean).join(' '), countryName(pr.country)].filter(Boolean).join('\n');

  const contact = [
    address ? `<div><dt>Adresse</dt><dd>${P.esc(address)}</dd></div>` : '',
    pr.phone ? `<div><dt>Téléphone</dt><dd><a href="${P.esc(telHref(pr.phone))}">${P.esc(pr.phone)}</a></dd></div>` : '',
    pr.email ? `<div><dt>E-mail</dt><dd><a href="mailto:${P.esc(pr.email)}">${P.esc(pr.email)}</a></dd></div>` : '',
    pr.website ? `<div><dt>Site web</dt><dd><a href="${P.esc(pr.website)}" rel="noopener nofollow" target="_blank">${P.esc(pr.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></dd></div>` : '',
    pr.opening_hours ? `<div><dt>Horaires</dt><dd>${P.esc(pr.opening_hours)}</dd></div>` : ''
  ].join('');

  const listHtml = listings.length
    ? `<ul class="zg-list">${listings.map(l => listingItem(base, l)).join('')}</ul>`
    : `<div class="zh-empty"><p style="margin:0">${P.esc(name)} n’a pas d’annonce publiée sur Z Find en ce moment. Contactez l’agence pour connaître ses biens disponibles.</p></div>`;

  const local = (ctx.localPages || []).slice(0, 8);
  const body = `${H.STYLE}${STYLE}
    <header class="zf-seo-hero">
      <div class="zg-head">
        ${ctx.logoUrl ? `<img class="zg-logo" src="${P.esc(ctx.logoUrl)}" alt="Logo ${P.esc(name)}">` : ''}
        <div>
          <p class="zf-seo-eyebrow">Agence immobilière${city ? ` · ${P.esc(city)}` : ''}</p>
          <h1>${P.esc(name)}</h1>
          <p class="zf-seo-lead">${listings.length ? `${listings.length} annonce${listings.length > 1 ? 's' : ''} sur Z Find${sale && rent ? ` (${sale} à vendre, ${rent} à louer)` : ''}.` : 'Agence partenaire de Z Find.'} Toutes les annonces de Z Find viennent de professionnels identifiés.</p>
          <span class="zg-badge">Professionnel vérifié</span>
        </div>
      </div>
    </header>
    <div class="zg-grid">
      <div>
        ${pr.description ? `<section class="zp-section" style="margin-top:0"><h2>${P.esc(`L’agence`)}</h2>${paragraphs(pr.description)}</section>` : ''}
        <section class="zp-section"${pr.description ? '' : ' style="margin-top:0"'}><h2>Annonces de l’agence</h2>${listHtml}</section>
        ${local.length ? `<section class="zp-section"><h2>Le marché local</h2><ul class="zp-links">${local.map(x => `<li><a href="${base}${P.esc(x.path)}">${P.esc(x.name)}</a></li>`).join('')}</ul></section>` : ''}
      </div>
      <aside class="zg-card"><h2>Contacter l’agence</h2>${contact ? `<dl>${contact}</dl>` : '<p class="zp-small">Coordonnées bientôt disponibles.</p>'}<p class="zp-small" style="margin-top:16px">Depuis une annonce, le bouton « Contacter l’agence » envoie votre message directement à l’agence.</p></aside>
    </div>
    <section class="zp-section"><h2>Vous êtes une agence ?</h2><p>Publiez vos annonces sur Z Find : trois mois offerts, sans engagement, avec Z Desk et Z Studio inclus. <a href="${base}/#/fr/pro">Créer mon espace agence →</a></p></section>`;

  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'RealEstateAgent', name, url: base + path,
    ...(ctx.logoUrl ? { logo: ctx.logoUrl, image: ctx.logoUrl } : {}),
    ...(pr.description ? { description: pr.description.slice(0, 500) } : {}),
    ...(pr.phone ? { telephone: pr.phone } : {}),
    ...(pr.email ? { email: pr.email } : {}),
    ...(pr.website ? { sameAs: [pr.website] } : {}),
    ...(address ? { address: { '@type': 'PostalAddress', ...(pr.address ? { streetAddress: pr.address } : {}), ...(pr.postcode ? { postalCode: pr.postcode } : {}), ...(city ? { addressLocality: city } : {}), addressCountry: pr.country || 'FR' } } : {}),
    ...(listings.length ? { makesOffer: listings.slice(0, 20).map(l => ({ '@type': 'Offer', url: base + H.listingPath(l), price: l.price, priceCurrency: l.currency || 'EUR', name: l.title })) } : {})
  }];
  const crumbs = [{ name: 'Z Find', path: '/' }, { name: name, path }];
  return { indexable, html: P.page({ base, title, description, canonicalPath: path, indexable, breadcrumbs: crumbs, body, jsonLd, image: ctx.logoUrl || undefined, source: 'Fiche remplie par l’agence dans son espace Z Find. Annonces publiées par l’agence et vérifiées par Z Find.' }) };
}

module.exports = { ROOT, MIN_DESCRIPTION, agencyPath, slugFromQuery, isIndexable, render };
