/* ============================================================
   Z FIND — annuaire « Agences immobilières à {commune} »

     /fr/agences-immobilieres/{slug}-{insee}

   Servi par /api/agences. Les agences viennent du registre SIRENE (INSEE,
   licence ouverte) via la vue zfind_agency_directory : personnes morales
   actives d'activité 68.31Z, sans aucun contact (ni e-mail, ni téléphone,
   ni site) et sans entrepreneur individuel.

   Indexation : page indexée dès MIN_AGENCIES agences, et toujours pour les
   6 grandes villes et leurs arrondissements ; sinon « noindex ».
   Une ville à arrondissements (Paris, Lyon, Marseille) affiche le nombre
   d'agences de chaque arrondissement, la liste détaillée vivant sur la
   page de l'arrondissement.

   Module pur : rendu et règles.
   ============================================================ */
'use strict';

const P = require('./prix-pages');
const H = require('./immobilier-pages');

const ROOT = '/fr/agences-immobilieres';
const MIN_AGENCIES = 3;
const MAX_LIST = 200;
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

function agencesPath(c) { return `${ROOT}/${P.slugify(H.displayName(c.n))}-${c.c.toLowerCase()}`; }

function parsePath(p) {
  const parts = String(p || '').toLowerCase().split('/').filter(Boolean).filter(x => x !== 'fr' && x !== 'agences-immobilieres');
  if (parts.length !== 1) return null;
  const m = parts[0].match(/^(?:(.*)-)?((?:2a|2b|\d{2})\d{3}|97[1-6]\d{2})$/);
  return m ? { code: m[2].toUpperCase(), slug: m[1] || '' } : null;
}

const NETWORKS = Object.freeze({
  'century-21': 'Century 21', orpi: 'Orpi', laforet: 'Laforêt', 'square-habitat': 'Square Habitat', foncia: 'Foncia',
  nestenn: 'Nestenn', 'guy-hoquet': 'Guy Hoquet', era: 'ERA', 'l-adresse': 'L’Adresse', 'stephane-plaza': 'Stéphane Plaza Immobilier',
  'human-immobilier': 'Human Immobilier', barnes: 'Barnes', 'sotheby-s': 'Sotheby’s International Realty', 'engel-volkers': 'Engel & Völkers',
  citya: 'Citya', nexity: 'Nexity', 'cimm-immobilier': 'Cimm Immobilier', 'arthurimmo': 'Arthurimmo', 'immobiliere-des-particuliers': 'Immobilière des Particuliers'
});
function networkName(slug) {
  if (!slug) return null;
  return NETWORKS[slug] || String(slug).split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/* Les noms du registre sont en capitales : « AGENCE DU LAC SARL » → « Agence du Lac SARL ». */
const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'sur', 'sous', 'aux', 'au', 'à', 'a', 'l', 'd', 'par', 'pour']);
const UPPER = new Set(['sas', 'sasu', 'sarl', 'eurl', 'sa', 'snc', 'sci', 'scp', 'selarl', 'gie', 'ii', 'iii', 'iv', 'cbre', 'jll', 'bnp', 'cgi', 'fnaim', 'iad', 'sca', 'sarlu']);
function niceName(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/[a-z]/.test(s)) return s; // déjà en casse mixte (nom commercial)
  let first = true;
  return s.toLowerCase().replace(/[a-zà-ÿ0-9]+(?:[’'][a-zà-ÿ0-9]+)?/g, w => {
    const base = w.replace(/[’'].*$/, '');
    let out;
    if (UPPER.has(w) || w === 'era') out = w.toUpperCase();
    else if (!first && SMALL.has(base) && !/[’']/.test(w)) out = w;
    else if (/^[ld][’'][a-zà-ÿ]/.test(w)) out = (first ? w.charAt(0).toUpperCase() : w.charAt(0)) + '’' + w.charAt(2).toUpperCase() + w.slice(3);
    else out = w.charAt(0).toUpperCase() + w.slice(1);
    first = false;
    return out;
  });
}
/* Adresse du registre : « 1 PLACE DU PORT 74500 EVIAN-LES-BAINS » → « 1 Place du Port » (la commune est déjà dans la page). */
function niceAddress(a, postcode) {
  let s = String(a.address || '').trim();
  if (postcode) s = s.replace(new RegExp(`\\s*${postcode}\\b.*$`), '');
  return niceName(s).replace(/\bBis\b/g, 'bis').replace(/\bTer\b/g, 'ter');
}

function sortAgencies(list) {
  return list.slice().sort((x, y) => (Number(!!y.network) - Number(!!x.network)) || niceName(x.display_name).localeCompare(niceName(y.display_name), 'fr'));
}

function networksOf(list) {
  const m = new Map();
  for (const a of list) if (a.network) m.set(a.network, (m.get(a.network) || 0) + 1);
  return [...m.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([slug, n]) => ({ slug, name: networkName(slug), n }));
}

const STYLE = `<style id="zfind-agences-styles">.za-list{list-style:none;padding:0;margin:18px 0 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}.za-ag{padding:18px 20px;border:1px solid var(--zf-200);background:#fff}.za-ag strong{display:block;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.28rem;font-weight:500;line-height:1.25}.za-ag span{display:block;margin-top:6px;color:var(--zf-500);font-size:.86rem;line-height:1.5}.za-ag em{display:inline-block;margin-top:8px;padding:2px 8px;background:var(--zf-gold-pale);color:var(--zf-gold-dark);font-style:normal;font-size:.74rem;letter-spacing:.04em}.za-nets{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;padding:0;list-style:none}.za-nets li{padding:6px 12px;border:1px solid var(--zf-200);background:#fff;font-size:.86rem}.za-nets b{color:var(--zf-gold-dark);font-weight:600}.za-arr{list-style:none;padding:0;margin:18px 0 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}.za-arr a{display:flex;justify-content:space-between;padding:14px 16px;border:1px solid var(--zf-200);background:#fff;color:inherit}.za-arr a:hover{border-color:var(--zf-gold)}.za-arr b{color:var(--zf-gold-dark)}.zs-faq details{padding:14px 0;border-bottom:1px solid var(--zf-200)}.zs-faq summary{cursor:pointer;font-weight:500}.zs-faq p{margin:10px 0 0}</style>`;

const SOURCE = 'Agences : répertoire SIRENE de l’INSEE (sous licence ouverte), établissements actifs d’activité 68.31Z « agences immobilières », personnes morales uniquement. Liste fournie à titre d’information, sans classement ni recommandation : Z Find n’a pas de lien avec ces agences, sauf mention contraire.';

/* ctx: { base, commune, department, region, city, agencies, total, arrondissements:[{commune, n}], neighbours:[commune], today } */
function render(ctx) {
  const { base, commune, department, region, city } = ctx;
  const name = H.displayName(commune.n);
  const isCity = !!(ctx.arrondissements && ctx.arrondissements.length);
  const all = sortAgencies(ctx.agencies || []);
  const total = ctx.total != null ? ctx.total : (isCity ? ctx.arrondissements.reduce((s, a) => s + (a.n || 0), 0) : all.length);
  const indexable = H.isTier1(commune.c) || total >= MIN_AGENCIES;
  const path = agencesPath(commune);
  const nets = networksOf(all);
  const where = P.aCommune(name);
  const title = `Agences immobilières ${where} (${department.code})${total ? ` : ${nf.format(total)} agence${total > 1 ? 's' : ''}` : ''} | Z Find`;
  const description = total
    ? `${nf.format(total)} agence${total > 1 ? 's' : ''} immobilière${total > 1 ? 's' : ''} ${where}${nets.length ? `, dont ${nets.slice(0, 3).map(n => n.name).join(', ')}` : ''}. Adresses, réseaux, prix au m² et frais de notaire pour ${name}.`
    : `Agences immobilières ${where} : annuaire, prix au m² et frais de notaire pour ${name}.`;

  const listHtml = isCity
    ? `<ul class="za-arr">${ctx.arrondissements.filter(a => a.n == null || a.n > 0).map(a => `<li><a href="${base}${agencesPath(a.commune)}"><span>${P.esc(H.displayName(a.commune.n))}</span>${a.n != null ? `<b>${nf.format(a.n)}</b>` : ''}</a></li>`).join('')}</ul>`
    : all.length
      ? `<ul class="za-list">${all.slice(0, MAX_LIST).map(a => {
        const shown = niceName(a.display_name);
        const legal = a.legal_name && niceName(a.legal_name) !== shown ? niceName(a.legal_name) : null;
        const since = a.registry_created ? String(a.registry_created).slice(0, 4) : null;
        return `<li class="za-ag"><strong>${P.esc(shown)}</strong><span>${P.esc(niceAddress(a, a.postcode))}${a.postcode ? `, ${P.esc(a.postcode)} ${P.esc(name)}` : ''}</span>${legal || since ? `<span>${P.esc([legal ? `Société ${legal}` : null, since ? `depuis ${since}` : null].filter(Boolean).join(' · '))}</span>` : ''}${a.network ? `<em>${P.esc(networkName(a.network))}</em>` : ''}</li>`;
      }).join('')}</ul>${all.length > MAX_LIST ? `<p class="zp-small">… et ${nf.format(all.length - MAX_LIST)} autres agences.</p>` : ''}`
      : `<div class="zh-empty"><p style="margin:0">Aucune agence immobilière n’est enregistrée ${P.esc(where)} au répertoire SIRENE. Les agences des communes voisines couvrent souvent ${P.esc(name)}.</p></div>`;

  const a = P.latest(commune.A); const m = P.latest(commune.M);
  const faq = [];
  faq.push({ q: `Combien d’agences immobilières ${where} ?`, r: total ? `${nf.format(total)} agence${total > 1 ? 's' : ''} immobilière${total > 1 ? 's sont enregistrées' : ' est enregistrée'} ${where} au répertoire SIRENE (personnes morales actives, activité 68.31Z)${nets.length ? `, dont ${nets.reduce((s, n) => s + n.n, 0)} sous enseigne de réseau` : ''}.` : `Aucune agence n’est enregistrée ${where} au répertoire SIRENE.` });
  if (nets.length) faq.push({ q: `Quels réseaux d’agences sont présents ${where} ?`, r: nets.slice(0, 8).map(n => `${n.name} (${n.n})`).join(', ') + '.' });
  faq.push({ q: 'Comment choisir une agence immobilière ?', r: 'Vérifiez sa carte professionnelle « transaction » (loi Hoguet), ses honoraires affichés en vitrine et sur son site, sa connaissance du quartier et ses ventes récentes. Comparez au moins deux estimations et lisez attentivement le mandat (simple ou exclusif, durée, honoraires).' });
  if (a || m) faq.push({ q: `Quel est le prix au m² ${where} ?`, r: [a ? `${P.eurM2(a.med)} pour un appartement` : null, m ? `${P.eurM2(m.med)} pour une maison` : null].filter(Boolean).join(', ') + ' (médiane des ventes DVF).' });

  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: base + path, inLanguage: 'fr',
    about: { '@type': 'City', name, containedInPlace: { '@type': 'AdministrativeArea', name: department.name } },
    ...(!isCity && all.length ? { mainEntity: { '@type': 'ItemList', numberOfItems: all.length, itemListElement: all.slice(0, 50).map((x, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'RealEstateAgent', name: niceName(x.display_name), address: { '@type': 'PostalAddress', streetAddress: niceAddress(x, x.postcode), postalCode: x.postcode || undefined, addressLocality: name, addressCountry: 'FR' } } })) } } : {})
  }];
  if (indexable) jsonLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.r } })) });

  const neighbours = (ctx.neighbours || []).slice(0, 12);
  const body = `${H.STYLE}${STYLE}
    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">Annuaire · ${P.esc(`${department.name} (${department.code})`)}</p>
      <h1>${P.esc(`Agences immobilières ${where}`)}</h1>
      <p class="zf-seo-lead">${total ? `${nf.format(total)} agence${total > 1 ? 's' : ''} immobilière${total > 1 ? 's' : ''} ${P.esc(where)}${nets.length ? `, dont ${nets.reduce((s, n) => s + n.n, 0)} sous enseigne de réseau` : ''}. ` : ''}Pour vendre, acheter ou louer ${P.esc(where)} : comparez les agences, les prix du marché et vos frais.</p>
      <div class="zp-ctas"><a class="zf-seo-primary" href="${base}/#/fr/estimation?market=FR&amp;mode=owner">Estimer mon bien →</a><a class="zp-secondary" href="${base}${H.hubPath(commune)}">Annonces ${P.esc(where)}</a><a class="zp-secondary" href="${base}${P.communePath(commune)}">Prix au m²</a></div>
    </header>
    ${nets.length ? `<section class="zp-section"><h2>Réseaux présents</h2><ul class="za-nets">${nets.slice(0, 12).map(n => `<li>${P.esc(n.name)} <b>${n.n}</b></li>`).join('')}</ul></section>` : ''}
    <section class="zp-section"><h2>${P.esc(isCity ? `Agences par arrondissement` : `Les agences ${where}`)}</h2>${listHtml}</section>
    ${a || m ? `<div class="zp-stats">${a ? `<section class="zp-stat"><h2>Appartements</h2><p class="zp-big">${P.eurM2(a.med)}</p><p class="zp-small">Prix médian DVF · <a href="${base}${P.communePath(commune)}">détail</a></p></section>` : ''}${m ? `<section class="zp-stat"><h2>Maisons</h2><p class="zp-big">${P.eurM2(m.med)}</p><p class="zp-small">Prix médian DVF · <a href="${base}${P.communePath(commune)}">détail</a></p></section>` : ''}</div>` : ''}
    <section class="zp-section"><h2>Vous êtes une agence ${P.esc(where)} ?</h2><p>Publiez vos annonces sur Z Find : trois mois offerts, sans engagement, avec Z Desk (demandes et visites) et Z Studio (photos et textes) inclus. <a href="${base}/#/fr/pro">Créer mon espace agence →</a></p></section>
    <section class="zp-section"><h2>${P.esc(`Immobilier ${where}`)}</h2><ul class="zp-links"><li><a href="${base}${H.hubPath(commune)}">Annonces ${P.esc(where)}</a></li><li><a href="${base}${P.communePath(commune)}">Prix au m² ${P.esc(P.deCommune(name))}</a></li><li><a href="${base}${P.notaryPath(department)}">Frais de notaire — ${P.esc(department.name)}</a></li><li><a href="${base}/fr/simulateur-pret-immobilier">Simulateur de prêt</a></li></ul></section>
    ${neighbours.length ? `<section class="zp-section"><h2>${P.esc(`Agences ailleurs en ${department.name}`)}</h2><ul class="zp-links">${neighbours.map(c => `<li><a href="${base}${agencesPath(c)}">${P.esc(H.displayName(c.n))}</a></li>`).join('')}</ul></section>` : ''}
    <section class="zp-section zs-faq"><h2>Questions fréquentes</h2>${faq.map(f => `<details><summary>${P.esc(f.q)}</summary><p>${P.esc(f.r)}</p></details>`).join('')}</section>`;

  const crumbs = [{ name: 'Z Find', path: '/' }]
    .concat(region ? [{ name: region.name, path: P.regionPath(region.name) }] : [])
    .concat([{ name: department.name, path: P.depPath(department.code, department.name) }])
    .concat(city ? [{ name: `Agences ${P.aCommune(H.displayName(city.n))}`, path: agencesPath(city) }] : [])
    .concat([{ name: `Agences ${where}`, path }]);
  return { indexable, html: P.page({ base, title, description, canonicalPath: path, indexable, breadcrumbs: crumbs, body, jsonLd, source: SOURCE }) };
}

module.exports = { ROOT, MIN_AGENCIES, MAX_LIST, agencesPath, parsePath, niceName, niceAddress, networkName, networksOf, sortAgencies, render };
