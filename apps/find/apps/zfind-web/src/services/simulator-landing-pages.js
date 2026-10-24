/* ============================================================
   Z FIND — pages publiques des simulateurs (SEO)

   Les simulateurs du site vivent dans des routes « # » que les moteurs de
   recherche n'indexent pas. Ce module produit, au build, des pages HTML
   statiques et indexables pour les recherches correspondantes :

     /fr/simulateurs-immobiliers               sommaire
     /fr/frais-de-notaire                      France
     /fr/frais-achat-immobilier-belgique       Belgique (3 régions)
     /fr/frais-achat-immobilier-luxembourg     Luxembourg (Bëllegen Akt)
     /fr/simulateur-pret-immobilier            mensualité
     /fr/capacite-emprunt                      capacité d'emprunt
     /fr/rentabilite-locative                  rendement brut et net
     /fr/estimation-immobiliere                estimation gratuite

   Chaque page a un calculateur qui fonctionne dans la page (mêmes
   modules que les simulateurs : acquisition-costs.js et credit-rates.js,
   intégrés au HTML), des tableaux d'exemples calculés au build, une FAQ
   (JSON-LD FAQPage) et un lien vers le simulateur complet.

   Aucun chiffre inventé : frais selon les barèmes publics du module,
   taux de référence publié et daté ; sans taux en cours de validité, les
   tableaux de mensualités ne sont pas publiés.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const seo = require('./seo-page-generator.js');
const costs = require('./acquisition-costs.js');
const rates = require('./credit-rates.js');
const credit = require('./credit-simulator.js');

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const eur = v => (v == null ? '—' : `${nf.format(Math.round(v))} €`);
const pct = (v, d) => `${(v * 100).toFixed(d == null ? 2 : d).replace('.', ',')} %`;
const rateTxt = r => `${String(r).replace('.', ',')} %`;
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const PAGES = Object.freeze({
  hub: '/fr/simulateurs-immobiliers',
  notaire: '/fr/frais-de-notaire',
  belgique: '/fr/frais-achat-immobilier-belgique',
  luxembourg: '/fr/frais-achat-immobilier-luxembourg',
  pret: '/fr/simulateur-pret-immobilier',
  capacite: '/fr/capacite-emprunt',
  rentabilite: '/fr/rentabilite-locative',
  estimation: '/fr/estimation-immobiliere'
});
const SPA = Object.freeze({
  pret: '/#/fr/simulator?market=FR&mode=payment',
  capacite: '/#/fr/simulator?market=FR&mode=capacity',
  rentabilite: '/#/fr/yield?market=FR&mode=long',
  estimation: '/#/fr/estimation?market=FR&mode=owner',
  acheteur: '/#/fr/estimation?market=FR&mode=buyer',
  frais: '/#/fr/simulator?market=FR&mode=payment'
});
const PRICE_HUB = '/fr/prix-immobilier/france';
const BIG_CITIES = Object.freeze([
  ['Paris', 'paris-75056'], ['Lyon', 'lyon-69123'], ['Marseille', 'marseille-13055'], ['Toulouse', 'toulouse-31555'],
  ['Bordeaux', 'bordeaux-33063'], ['Nice', 'nice-06088'], ['Nantes', 'nantes-44109'], ['Annecy', 'annecy-74010']
]);

const LABELS = Object.freeze({
  transferDuties: 'Droits de mutation (« frais de notaire » au sens strict)',
  publicityTax: 'Taxe de publicité foncière (neuf)',
  notaryFees: 'Émoluments du notaire (TTC)',
  securityContribution: 'Contribution de sécurité immobilière',
  disbursements: 'Débours et formalités (forfait)',
  registrationDuties: 'Droits d’enregistrement',
  adminCosts: 'Frais administratifs (forfait)',
  taxCredit: 'Crédit d’impôt « Bëllegen Akt »'
});

/* ---------- gabarit commun ---------- */

const STYLE = `<style id="zfind-sim-styles">.zs-calc{margin-top:28px;padding:32px;border:1px solid var(--zf-200);background:#fff}.zs-calc h2,.zs-section h2{margin:0 0 14px;font-family:'Cormorant Garamond',Georgia,serif;font-size:2rem;font-weight:400}.zs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}.zs-field label{display:block;margin-bottom:6px;color:var(--zf-700);font-size:.85rem;font-weight:500}.zs-field input,.zs-field select{width:100%;padding:11px 12px;border:1px solid var(--zf-200);background:#fff;font:inherit;font-size:1rem}.zs-check{display:flex;gap:8px;align-items:center;color:var(--zf-700);font-size:.9rem}.zs-out{margin-top:22px;padding:22px;background:var(--zf-50);border:1px solid var(--zf-200)}.zs-big{margin:0;color:var(--zf-gold-dark);font-family:'Cormorant Garamond',Georgia,serif;font-size:2.4rem;line-height:1.15}.zs-lines{margin:12px 0 0;padding:0;list-style:none;color:var(--zf-700);font-size:.92rem;line-height:1.8}.zs-lines li{display:flex;justify-content:space-between;gap:16px;border-bottom:1px dashed var(--zf-200)}.zs-section{margin-top:36px}.zs-section p,.zs-section li{color:var(--zf-700);line-height:1.75;max-width:840px}.zs-table-wrap{overflow-x:auto;border:1px solid var(--zf-200)}.zs-table{width:100%;border-collapse:collapse;font-size:.92rem;font-variant-numeric:tabular-nums}.zs-table th,.zs-table td{padding:10px 14px;border-bottom:1px solid var(--zf-100);text-align:right;white-space:nowrap}.zs-table th:first-child,.zs-table td:first-child{text-align:left}.zs-table thead th{background:var(--zf-50);font-weight:500;color:var(--zf-700)}.zs-faq details{padding:14px 0;border-bottom:1px solid var(--zf-200)}.zs-faq summary{cursor:pointer;font-weight:500;color:var(--zf-900)}.zs-faq p{margin:10px 0 0}.zs-links{display:flex;flex-wrap:wrap;gap:8px 20px;padding:0;list-style:none}.zs-links a,.zs-section a{color:var(--zf-gold-dark);font-weight:500}.zs-ctas{display:flex;flex-wrap:wrap;gap:14px;margin-top:24px}.zs-small{color:var(--zf-500);font-size:.8rem;line-height:1.6}.zs-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:28px}.zs-card{display:block;padding:26px;border:1px solid var(--zf-200);background:#fff}.zs-card h2{margin:0 0 8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.6rem;font-weight:400}.zs-card p{margin:0;color:var(--zf-500);font-size:.92rem;line-height:1.6}@media(max-width:820px){.zs-calc{padding:22px}}</style>`;

function ld(o) { return `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`; }

function shell({ base, pathName, title, description, crumb, eyebrow, h1, lead, body, faq, scripts, ctaHref, ctaLabel }) {
  const canonical = base + pathName;
  const desc = seo.buildMetaDescription(description, 158);
  const breadcrumbs = pathName === PAGES.hub
    ? [{ name: 'Z Find', path: '/' }, { name: 'Simulateurs immobiliers', path: PAGES.hub }]
    : [{ name: 'Z Find', path: '/' }, { name: 'Simulateurs immobiliers', path: PAGES.hub }, { name: crumb, path: pathName }];
  const lds = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbs.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: base + b.path })) },
    { '@context': 'https://schema.org', '@type': pathName === PAGES.hub ? 'CollectionPage' : 'WebApplication', name: h1, url: canonical, inLanguage: 'fr', ...(pathName === PAGES.hub ? {} : { applicationCategory: 'FinanceApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } }) }
  ];
  if (faq && faq.length) lds.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  const others = [
    [PAGES.notaire, 'Frais de notaire'], [PAGES.pret, 'Simulateur de prêt'], [PAGES.capacite, 'Capacité d’emprunt'],
    [PAGES.rentabilite, 'Rentabilité locative'], [PAGES.estimation, 'Estimation gratuite'], [PAGES.belgique, 'Frais d’achat en Belgique'],
    [PAGES.luxembourg, 'Frais d’achat au Luxembourg'], [PRICE_HUB, 'Prix au m² par commune'], ['/fr/guides', 'Guides juridiques (France, Belgique)']
  ].filter(([p]) => p !== pathName);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Z Find">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(base)}/brand/z-find-logo-gold.png">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary">
${lds.map(ld).join('\n')}
${seo.presentationHead()}
${STYLE}
</head>
<body class="zf-seo-body">
<header class="zf-seo-site-header">
  <div class="zf-seo-wrap zf-seo-nav">
    <a class="zf-seo-brand" href="${base}/" aria-label="Z Find">Z <em>Find</em></a>
    <a class="zf-seo-nav-cta" href="${base}${SPA.estimation}">Estimer mon bien →</a>
  </div>
</header>
<main class="zf-seo-main">
  <div class="zf-seo-wrap">
    <nav class="zf-seo-breadcrumb" aria-label="Fil d’Ariane">${breadcrumbs.map((b, i) => i === breadcrumbs.length - 1 ? `<span>${esc(b.name)}</span>` : `<a href="${base}${b.path}">${esc(b.name)}</a>`).join(' / ')}</nav>
    <header class="zf-seo-hero">
      <p class="zf-seo-eyebrow">${esc(eyebrow)}</p>
      <h1>${esc(h1)}</h1>
      <p class="zf-seo-lead">${esc(lead)}</p>
      ${ctaHref ? `<div class="zs-ctas"><a class="zf-seo-primary" href="${base}${ctaHref}">${esc(ctaLabel)} →</a></div>` : ''}
    </header>
${body}
${faq && faq.length ? `    <section class="zs-section zs-faq"><h2>Questions fréquentes</h2>${faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>` : ''}
    <section class="zs-section"><h2>Autres outils Z Find</h2><ul class="zs-links">${others.map(([p, l]) => `<li><a href="${base}${p}">${esc(l)}</a></li>`).join('')}</ul></section>
    <p class="zs-small" style="margin-top:30px">Simulations indicatives, gratuites et sans inscription : ni offre de prêt, ni conseil juridique, fiscal ou financier. Consultez un notaire, une banque ou un courtier pour votre situation.</p>
  </div>
</main>
${scripts || ''}
</body>
</html>`;
}

function table(head, rows) {
  return `<div class="zs-table-wrap"><table class="zs-table"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/* Les modules de calcul, intégrés tels quels dans la page (aucune
   dépendance réseau, mêmes résultats que les simulateurs du site). */
function engineScript() {
  const dir = __dirname;
  const src = ['credit-rates.js', 'acquisition-costs.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  return `<script>${src.replace(/<\/script/gi, '<\\/script')}</script>
<script>
(function(){var S=window.ZFindServices||{};window.ZS={c:S.acquisitionCosts,r:S.creditRates,
nf:new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}),
eur:function(v){return v==null||!isFinite(v)?'—':window.ZS.nf.format(Math.round(v))+' €';},
num:function(f,n){var el=f.querySelector('[name="'+n+'"]');if(!el)return 0;var v=String(el.value).replace(/\\s/g,'').replace(',','.');return Number(v)||0;},
on:function(f,n){var el=f.querySelector('[name="'+n+'"]');return !!(el&&el.checked);},
val:function(f,n){var el=f.querySelector('[name="'+n+'"]');return el?el.value:'';},
annuity:function(rate,years){var n=Math.round(years*12),r=rate/100/12;if(!(n>0))return 0;return r===0?1/n:r/(1-Math.pow(1+r,-n));},
lines:function(list){return '<ul class="zs-lines">'+list.map(function(l){return '<li><span>'+l[0]+'</span><strong>'+l[1]+'</strong></li>';}).join('')+'</ul>';},
bind:function(id,fn){var f=document.getElementById(id);if(!f)return;var run=function(){f.querySelector('[data-out]').innerHTML=fn(f);};f.addEventListener('input',run);f.addEventListener('change',run);f.addEventListener('submit',function(e){e.preventDefault();run();});run();}};})();
</script>`;
}

function field(name, label, value, extra) {
  return `<div class="zs-field"><label for="f-${name}">${esc(label)}</label><input id="f-${name}" name="${name}" inputmode="decimal" value="${esc(value)}" ${extra || ''}></div>`;
}

const LABELS_JS = JSON.stringify(LABELS);

/* ---------- données de référence ---------- */

function refRate(market, years, today) { return rates.reference(market, years, today); }
function rateNote(ref) {
  return ref ? `taux moyen de ${rateTxt(ref.ratePct)} sur ${ref.years} ans (${ref.source.name}, ${rates.periodLabel(ref.period, 'fr')})` : '';
}

/* ---------- pages ---------- */

function pageNotaire(base) {
  const prices = [100000, 150000, 200000, 250000, 300000, 400000, 500000, 750000, 1000000];
  const rows = prices.map(p => {
    const a = costs.estimate({ country: 'FR', price: p });
    const f = costs.estimate({ country: 'FR', price: p, firstBuyer: true });
    const n = costs.estimate({ country: 'FR', price: p, newBuild: true });
    return [eur(p), `${eur(a.costs)} <span class="zs-small">(${pct(a.costsRate, 1)})</span>`, eur(f.costs), `${eur(n.costs)} <span class="zs-small">(${pct(n.costsRate, 1)})</span>`];
  });
  const ex = costs.estimate({ country: 'FR', price: 250000 });
  const faq = [
    { q: 'Comment calculer les frais de notaire ?', a: `Pour un logement ancien, ils comprennent les droits de mutation (${pct(0.063185, 4)} du prix dans la plupart des départements), les émoluments du notaire selon le barème officiel, la contribution de sécurité immobilière (0,1 %) et environ 1 200 € de débours. Pour 250 000 €, le total est d’environ ${eur(ex.costs)}, soit ${pct(ex.costsRate, 1)}.` },
    { q: 'Quels sont les frais de notaire dans le neuf ?', a: 'Dans le neuf (VEFA), les droits de mutation sont remplacés par la taxe de publicité foncière de 0,715 % : les frais tombent à environ 2 à 3 % du prix.' },
    { q: 'Les primo-accédants paient-ils moins de frais de notaire ?', a: `Oui depuis la réforme de 2025 : un primo-accédant qui achète sa résidence principale reste au taux de ${pct(0.0580665, 4)} au lieu de ${pct(0.063185, 4)} dans les départements qui ont relevé leur taux.` },
    { q: 'Les frais de notaire peuvent-ils être financés par le prêt ?', a: 'Certaines banques les financent, mais la plupart demandent que l’apport couvre au moins les frais de notaire et de garantie.' }
  ];
  const body = `    <form class="zs-calc" id="calc-notaire" novalidate>
      <h2>Calculer mes frais de notaire</h2>
      <div class="zs-grid">${field('price', 'Prix du bien (€)', '250000')}
        <div class="zs-field"><label for="f-type">Type de bien</label><select id="f-type" name="type"><option value="old">Ancien</option><option value="new">Neuf (VEFA)</option></select></div></div>
      <p class="zs-check" style="margin-top:14px"><input type="checkbox" id="f-first" name="first"><label for="f-first">Primo-accédant, résidence principale</label></p>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}${SPA.pret}">Simuler le prêt avec ces frais →</a></div>
    </form>
    <section class="zs-section"><h2>Frais de notaire selon le prix</h2>
      ${table(['Prix', 'Ancien', 'Ancien, primo-accédant', 'Neuf'], rows)}
      <p class="zs-small">Barèmes 2026 appliqués par les simulateurs Z Find (droits de mutation après la réforme 2025, émoluments réglementés + TVA 20 %, CSI 0,1 %, débours forfaitaires).</p>
    </section>
    <section class="zs-section"><h2>Ce que contiennent les « frais de notaire »</h2>
      <p>Près de 80 % des frais de notaire sont des taxes reversées à l’État et aux collectivités : les droits de mutation. Le notaire perçoit des émoluments fixés par un barème national dégressif (3,870 % jusqu’à 6 500 €, puis 1,596 %, 1,064 % et 0,799 % au-delà de 60 000 €), auxquels s’ajoutent la TVA, la contribution de sécurité immobilière et les débours (cadastre, état hypothécaire, formalités).</p>
      <p>Pour connaître le prix des biens d’une commune avant de calculer, consultez les <a href="${base}${PRICE_HUB}">prix de l’immobilier par commune</a>.</p>
    </section>`;
  const script = `${engineScript()}<script>ZS.bind('calc-notaire',function(f){var p=ZS.num(f,'price');var r=ZS.c.estimate({country:'FR',price:p,newBuild:ZS.val(f,'type')==='new',firstBuyer:ZS.on(f,'first')});if(r.error)return '<p>Indiquez un prix.</p>';var L=${LABELS_JS};return '<p class="zs-big">'+ZS.eur(r.costs)+'</p><p>soit '+(r.costsRate*100).toFixed(2).replace('.',',')+' % du prix — coût total '+ZS.eur(r.total)+'</p>'+ZS.lines(r.lines.map(function(l){return [L[l.key]||l.key,ZS.eur(l.amount)];}));});</script>`;
  return { path: PAGES.notaire, html: shell({
    base, pathName: PAGES.notaire, crumb: 'Frais de notaire', eyebrow: 'Simulateur gratuit · France 2026',
    title: 'Frais de notaire 2026 : calcul gratuit (ancien, neuf, primo-accédant) | Z Find',
    description: `Calculez vos frais de notaire 2026 : environ ${pct(ex.costsRate, 1)} du prix dans l’ancien, 2 à 3 % dans le neuf. Détail des droits de mutation, émoluments et débours, tableau par prix.`,
    h1: 'Calcul des frais de notaire 2026', lead: 'Droits de mutation, émoluments, débours : le détail exact de ce que vous paierez en plus du prix, dans l’ancien comme dans le neuf, avec le taux réduit des primo-accédants.',
    body, faq, scripts: script
  }) };
}

function pageBelgique(base) {
  const prices = [200000, 300000, 400000, 500000, 750000];
  const regions = [['WAL', 'Wallonie'], ['VLG', 'Flandre'], ['BRU', 'Bruxelles']];
  const rows = prices.map(p => [eur(p)].concat(regions.map(([r]) => eur(costs.estimate({ country: 'BE', price: p, region: r, ownHome: true }).costs))));
  const ex = costs.estimate({ country: 'BE', price: 300000, region: 'WAL', ownHome: true });
  const faq = [
    { q: 'Quels sont les droits d’enregistrement en Wallonie ?', a: '3 % pour l’achat de votre seule habitation propre, 12,5 % dans les autres cas (2026).' },
    { q: 'Quels sont les droits d’enregistrement en Flandre ?', a: '2 % pour l’achat de votre seule habitation propre, 12 % dans les autres cas (2026).' },
    { q: 'Quel abattement à Bruxelles ?', a: 'Les droits de 12,5 % ne sont pas dus sur les premiers 200 000 € pour l’achat de votre habitation propre, si le prix ne dépasse pas 600 000 €.' },
    { q: 'Combien coûte le notaire en Belgique ?', a: `Les honoraires suivent un barème légal dégressif, plus 21 % de TVA et environ 1 200 € de frais administratifs. Pour une habitation propre de 300 000 € en Wallonie, le total des frais est d’environ ${eur(ex.costs)}.` }
  ];
  const body = `    <form class="zs-calc" id="calc-be" novalidate>
      <h2>Calculer mes frais d’achat en Belgique</h2>
      <div class="zs-grid">${field('price', 'Prix du bien (€)', '300000')}
        <div class="zs-field"><label for="f-region">Région</label><select id="f-region" name="region"><option value="WAL">Wallonie</option><option value="VLG">Flandre</option><option value="BRU">Bruxelles-Capitale</option></select></div></div>
      <p class="zs-check" style="margin-top:14px"><input type="checkbox" id="f-own" name="own" checked><label for="f-own">Seule habitation propre (je vais y habiter)</label></p>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}/#/fr/simulator?market=BE&amp;mode=payment">Simuler le prêt en Belgique →</a></div>
    </form>
    <section class="zs-section"><h2>Frais d’achat d’une habitation propre par région</h2>
      ${table(['Prix', 'Wallonie', 'Flandre', 'Bruxelles'], rows)}
      <p class="zs-small">Droits d’enregistrement régionaux 2026, honoraires du notaire au barème légal + TVA 21 %, frais administratifs forfaitaires.</p>
    </section>`;
  const script = `${engineScript()}<script>ZS.bind('calc-be',function(f){var r=ZS.c.estimate({country:'BE',price:ZS.num(f,'price'),region:ZS.val(f,'region'),ownHome:ZS.on(f,'own')});if(r.error)return '<p>Indiquez un prix.</p>';var L=${LABELS_JS};return '<p class="zs-big">'+ZS.eur(r.costs)+'</p><p>soit '+(r.costsRate*100).toFixed(2).replace('.',',')+' % du prix — coût total '+ZS.eur(r.total)+'</p>'+ZS.lines(r.lines.map(function(l){return [L[l.key]||l.key,ZS.eur(l.amount)];}));});</script>`;
  return { path: PAGES.belgique, html: shell({
    base, pathName: PAGES.belgique, crumb: 'Frais d’achat en Belgique', eyebrow: 'Simulateur gratuit · Belgique 2026',
    title: 'Frais de notaire et droits d’enregistrement en Belgique 2026 : calcul | Z Find',
    description: 'Calculez les frais d’achat d’un bien en Belgique en 2026 : droits d’enregistrement en Wallonie (3 %), Flandre (2 %) et Bruxelles (abattement 200 000 €), honoraires du notaire et frais administratifs.',
    h1: 'Frais d’achat immobilier en Belgique', lead: 'Droits d’enregistrement de votre région, honoraires du notaire et frais administratifs : le coût réel d’un achat en Wallonie, en Flandre ou à Bruxelles.',
    body, faq, scripts: script
  }) };
}

function pageLuxembourg(base, today) {
  const prices = [500000, 750000, 1000000, 1250000];
  const rows = prices.map(p => [eur(p), eur(costs.estimate({ country: 'LU', price: p }).costs), eur(costs.estimate({ country: 'LU', price: p, ownHome: true, buyers: 1 }).costs), eur(costs.estimate({ country: 'LU', price: p, ownHome: true, buyers: 2 }).costs)]);
  const ref = refRate('LU', 25, today);
  const faq = [
    { q: 'Quels sont les frais d’enregistrement au Luxembourg ?', a: '7 % du prix : 6 % de droits d’enregistrement et 1 % de droits de transcription.' },
    { q: 'Qu’est-ce que le Bëllegen Akt ?', a: 'Un crédit d’impôt sur les droits d’enregistrement, jusqu’à 40 000 € par acquéreur, pour l’achat de sa résidence principale. Il ne s’applique pas à un investissement locatif.' },
    { q: 'Les honoraires du notaire sont-ils inclus ?', a: 'Non : ce calcul couvre les droits d’enregistrement et de transcription ; les honoraires du notaire s’y ajoutent.' }
  ];
  const body = `    <form class="zs-calc" id="calc-lu" novalidate>
      <h2>Calculer mes droits d’enregistrement au Luxembourg</h2>
      <div class="zs-grid">${field('price', 'Prix du bien (€)', '750000')}
        <div class="zs-field"><label for="f-buyers">Nombre d’acquéreurs</label><select id="f-buyers" name="buyers"><option value="1">1</option><option value="2" selected>2</option></select></div></div>
      <p class="zs-check" style="margin-top:14px"><input type="checkbox" id="f-own" name="own" checked><label for="f-own">Résidence principale (Bëllegen Akt)</label></p>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}/#/fr/simulator?market=LU&amp;mode=payment">Simuler le prêt au Luxembourg →</a></div>
    </form>
    <section class="zs-section"><h2>Droits à payer selon le prix</h2>
      ${table(['Prix', 'Sans crédit d’impôt', 'Résidence principale, 1 acquéreur', 'Résidence principale, 2 acquéreurs'], rows)}
      ${ref ? `<p>Pour financer l’achat, le ${esc(rateNote(ref))} sert de référence dans le <a href="${base}/#/fr/simulator?market=LU&amp;mode=payment">simulateur de prêt Z Find</a>.</p>` : ''}
    </section>`;
  const script = `${engineScript()}<script>ZS.bind('calc-lu',function(f){var r=ZS.c.estimate({country:'LU',price:ZS.num(f,'price'),ownHome:ZS.on(f,'own'),buyers:Number(ZS.val(f,'buyers'))});if(r.error)return '<p>Indiquez un prix.</p>';var L=${LABELS_JS};return '<p class="zs-big">'+ZS.eur(r.costs)+'</p><p>Honoraires du notaire non inclus.</p>'+ZS.lines(r.lines.map(function(l){return [L[l.key]||l.key,ZS.eur(l.amount)];}));});</script>`;
  return { path: PAGES.luxembourg, html: shell({
    base, pathName: PAGES.luxembourg, crumb: 'Frais d’achat au Luxembourg', eyebrow: 'Simulateur gratuit · Luxembourg 2026',
    title: 'Frais d’achat immobilier au Luxembourg 2026 : 7 % et Bëllegen Akt | Z Find',
    description: 'Calculez les droits d’enregistrement et de transcription (7 %) d’un achat immobilier au Luxembourg et le crédit d’impôt Bëllegen Akt (jusqu’à 40 000 € par acquéreur).',
    h1: 'Frais d’achat immobilier au Luxembourg', lead: 'Droits d’enregistrement et de transcription, crédit d’impôt Bëllegen Akt : ce que coûte réellement un achat au Grand-Duché.',
    body, faq, scripts: script
  }) };
}

function pagePret(base, today) {
  const ref20 = refRate('FR', 20, today);
  const durations = [15, 20, 25];
  const refs = durations.map(y => refRate('FR', y, today));
  const loans = [100000, 150000, 200000, 250000, 300000, 400000, 500000];
  const hasRates = refs.every(Boolean);
  const rows = hasRates ? loans.map(l => [eur(l)].concat(refs.map(r => eur(credit.payment({ loan: l, ratePct: r.ratePct, years: r.years, insurancePct: 0 }).monthly)))) : [];
  const ex = ref20 ? credit.payment({ loan: 200000, ratePct: ref20.ratePct, years: 20, insurancePct: 0 }) : null;
  const faq = [
    { q: 'Comment calculer la mensualité d’un prêt immobilier ?', a: 'Mensualité = capital × t / (1 − (1 + t)^−n), où t est le taux annuel divisé par 12 et n le nombre de mois. L’assurance emprunteur s’ajoute.' + (ex ? ` Exemple : 200 000 € sur 20 ans à ${rateTxt(ref20.ratePct)} donnent ${eur(ex.monthly)} par mois hors assurance, soit ${eur(ex.interest)} d’intérêts.` : '') },
    { q: 'Quel est le taux moyen d’un prêt immobilier ?', a: hasRates ? `${refs.map(r => `${rateTxt(r.ratePct)} sur ${r.years} ans`).join(', ')} (${ref20.source.name}, ${rates.periodLabel(ref20.period, 'fr')}).` : 'Le simulateur Z Find affiche le dernier taux moyen publié par l’Observatoire Crédit Logement / CSA.' },
    { q: 'Faut-il un apport pour emprunter ?', a: 'Les banques demandent en général au moins 10 % du prix, pour couvrir les frais de notaire et de garantie.' },
    { q: 'Quelle durée choisir ?', a: 'Plus la durée est longue, plus la mensualité baisse mais plus le coût des intérêts augmente. En France, la durée est plafonnée à 25 ans (27 ans avec différé pour le neuf).' }
  ];
  const body = `    <form class="zs-calc" id="calc-pret" novalidate>
      <h2>Calculer ma mensualité</h2>
      <div class="zs-grid">${field('price', 'Prix du bien (€)', '250000')}${field('deposit', 'Apport (€)', '25000')}
        <div class="zs-field"><label for="f-years">Durée</label><select id="f-years" name="years">${[15, 20, 25].map(y => `<option value="${y}"${y === 20 ? ' selected' : ''}>${y} ans</option>`).join('')}</select></div>
        ${field('rate', 'Taux annuel (%)', ref20 ? String(ref20.ratePct).replace('.', ',') : '')}${field('ins', 'Assurance (% / an)', '0,30')}</div>
      <p class="zs-check" style="margin-top:14px"><input type="checkbox" id="f-costs" name="costs" checked><label for="f-costs">Ajouter les frais de notaire (ancien) au financement</label></p>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}${SPA.pret}">Ouvrir le simulateur complet →</a><a class="zf-seo-primary" href="${base}${SPA.capacite}">Calculer ma capacité d’emprunt →</a></div>
    </form>
    ${hasRates ? `<section class="zs-section"><h2>Mensualités selon le montant emprunté</h2>
      ${table(['Montant emprunté'].concat(refs.map(r => `${r.years} ans (${rateTxt(r.ratePct)})`)), rows)}
      <p class="zs-small">Hors assurance emprunteur. Taux moyens ${esc(ref20.source.name)}, ${esc(rates.periodLabel(ref20.period, 'fr'))}.</p>
    </section>` : ''}
    <section class="zs-section"><h2>Préparer son financement</h2>
      <p>Commencez par le <a href="${base}${PRICE_HUB}">prix au m² de la commune</a> visée, ajoutez les <a href="${base}${PAGES.notaire}">frais de notaire</a>, puis vérifiez que la mensualité reste sous 35 % de vos revenus (règle du HCSF, assurance comprise).</p>
    </section>`;
  const script = `${engineScript()}<script>ZS.bind('calc-pret',function(f){var p=ZS.num(f,'price'),d=ZS.num(f,'deposit'),y=Number(ZS.val(f,'years')),t=ZS.num(f,'rate'),i=ZS.num(f,'ins');if(!(p>0)||!(t>0))return '<p>Indiquez un prix et un taux.</p>';var c=ZS.on(f,'costs')?ZS.c.estimate({country:'FR',price:p}).costs:0;var loan=Math.max(0,p+c-d);var m=loan*ZS.annuity(t,y),a=loan*i/100/12;var n=y*12;return '<p class="zs-big">'+ZS.eur(m+a)+' / mois</p>'+ZS.lines([['Montant emprunté',ZS.eur(loan)],['dont frais de notaire',ZS.eur(c)],['Mensualité hors assurance',ZS.eur(m)],['Assurance',ZS.eur(a)+' / mois'],['Coût des intérêts',ZS.eur(m*n-loan)],['Coût de l’assurance',ZS.eur(a*n)],['Revenus nets conseillés (35 %)',ZS.eur((m+a)/0.35)+' / mois']]);});</script>`;
  return { path: PAGES.pret, html: shell({
    base, pathName: PAGES.pret, crumb: 'Simulateur de prêt immobilier', eyebrow: 'Simulateur gratuit · Taux 2026',
    title: 'Simulateur de prêt immobilier 2026 : mensualité et coût du crédit | Z Find',
    description: `Simulez gratuitement votre prêt immobilier : mensualité, coût des intérêts et de l’assurance, frais de notaire inclus${ref20 ? `, au taux moyen de ${rateTxt(ref20.ratePct)} sur 20 ans` : ''}. Tableau des mensualités de 100 000 à 500 000 €.`,
    h1: 'Simulateur de prêt immobilier', lead: 'Mensualité, coût total du crédit et revenus nécessaires, avec les frais de notaire et le dernier taux moyen publié.',
    body, faq, scripts: script
  }) };
}

function pageCapacite(base, today) {
  const ref25 = refRate('FR', 25, today);
  const refs = [20, 25].map(y => refRate('FR', y, today));
  const incomes = [2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000];
  const hasRates = refs.every(Boolean);
  const rows = hasRates ? incomes.map(inc => [eur(inc)].concat(refs.map(r => eur(credit.capacity({ market: 'FR', income: inc, ratioPct: 35, ratePct: r.ratePct, years: r.years, insurancePct: 0.3, deposit: 0 }).maxLoan)))) : [];
  const ex = ref25 ? credit.capacity({ market: 'FR', income: 4000, ratioPct: 35, ratePct: ref25.ratePct, years: 25, insurancePct: 0.3, deposit: 30000 }) : null;
  const faq = [
    { q: 'Combien puis-je emprunter avec mon salaire ?', a: 'Votre mensualité, assurance comprise, ne doit pas dépasser 35 % de vos revenus nets (règle du HCSF), sur 25 ans au plus.' + (ex ? ` Avec 4 000 € de revenus nets par mois, cela représente ${eur(ex.maxMonthly)} par mois, soit environ ${eur(ex.maxLoan)} empruntables sur 25 ans à ${rateTxt(ref25.ratePct)}.` : '') },
    { q: 'Comment est calculé le taux d’endettement ?', a: 'Taux d’endettement = (toutes les mensualités de crédit + la nouvelle mensualité assurance comprise) / revenus nets mensuels avant impôt.' },
    { q: 'Quel prix de bien puis-je viser ?', a: ex && ex.maxPrice ? `Ajoutez votre apport au montant empruntable, puis retirez les frais de notaire. Avec 30 000 € d’apport dans l’exemple ci-dessus, le prix maximal est d’environ ${eur(ex.maxPrice)} dans l’ancien.` : 'Ajoutez votre apport au montant empruntable, puis retirez les frais de notaire.' }
  ];
  const body = `    <form class="zs-calc" id="calc-cap" novalidate>
      <h2>Calculer ma capacité d’emprunt</h2>
      <div class="zs-grid">${field('income', 'Revenus nets du foyer (€ / mois)', '4000')}${field('loans', 'Crédits en cours (€ / mois)', '0')}${field('deposit', 'Apport (€)', '30000')}
        <div class="zs-field"><label for="f-years">Durée</label><select id="f-years" name="years">${[15, 20, 25].map(y => `<option value="${y}"${y === 25 ? ' selected' : ''}>${y} ans</option>`).join('')}</select></div>
        ${field('rate', 'Taux annuel (%)', ref25 ? String(ref25.ratePct).replace('.', ',') : '')}${field('ins', 'Assurance (% / an)', '0,30')}</div>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}${SPA.capacite}">Ouvrir le simulateur complet →</a></div>
    </form>
    ${hasRates ? `<section class="zs-section"><h2>Montant empruntable selon les revenus</h2>
      ${table(['Revenus nets / mois'].concat(refs.map(r => `${r.years} ans (${rateTxt(r.ratePct)})`)), rows)}
      <p class="zs-small">Taux d’endettement de 35 %, assurance 0,30 % par an, sans autre crédit. Taux moyens ${esc(refs[0].source.name)}, ${esc(rates.periodLabel(refs[0].period, 'fr'))}.</p>
    </section>` : ''}`;
  const script = `${engineScript()}<script>ZS.bind('calc-cap',function(f){var inc=ZS.num(f,'income'),o=ZS.num(f,'loans'),d=ZS.num(f,'deposit'),y=Number(ZS.val(f,'years')),t=ZS.num(f,'rate'),i=ZS.num(f,'ins');if(!(inc>0)||!(t>0))return '<p>Indiquez vos revenus et un taux.</p>';var max=Math.max(0,inc*0.35-o),per=ZS.annuity(t,y)+i/100/12,loan=per>0?Math.floor(max/per/1000)*1000:0,budget=loan+d;var lo=0,hi=budget;for(var k=0;k<60;k++){var mid=(lo+hi)/2,c=ZS.c.estimate({country:'FR',price:mid});if(!c.error&&mid+c.costs<=budget)lo=mid;else hi=mid;}var price=Math.floor(lo/1000)*1000;return '<p class="zs-big">'+ZS.eur(loan)+'</p><p>empruntables sur '+y+' ans</p>'+ZS.lines([['Mensualité maximale (35 %)',ZS.eur(max)+' / mois'],['Budget avec apport',ZS.eur(budget)],['Prix maximal du bien (ancien, frais inclus)',ZS.eur(price)]]);});</script>`;
  return { path: PAGES.capacite, html: shell({
    base, pathName: PAGES.capacite, crumb: 'Capacité d’emprunt', eyebrow: 'Simulateur gratuit · Règle des 35 %',
    title: 'Capacité d’emprunt 2026 : combien puis-je emprunter ? | Z Find',
    description: 'Calculez combien vous pouvez emprunter selon vos revenus, vos crédits en cours et votre apport (règle des 35 % du HCSF), et le prix maximal du bien frais de notaire inclus.',
    h1: 'Calculer sa capacité d’emprunt', lead: 'Combien pouvez-vous emprunter, et pour quel prix de bien ? La règle des 35 % appliquée à vos revenus, avec le dernier taux moyen publié et les frais de notaire.',
    body, faq, scripts: script
  }) };
}

function pageRentabilite(base) {
  const faq = [
    { q: 'Comment calculer la rentabilité locative brute ?', a: 'Rentabilité brute = loyer annuel / prix d’achat × 100. Un studio acheté 150 000 € et loué 650 € par mois rapporte 7 800 € par an, soit 5,2 % brut.' },
    { q: 'Et la rentabilité nette ?', a: 'Rentabilité nette = (loyer annuel − charges non récupérables − taxe foncière − assurance − gestion − entretien) / (prix + frais de notaire + travaux) × 100. Elle est en général inférieure de 1 à 2 points à la rentabilité brute.' },
    { q: 'Quelle est une bonne rentabilité locative ?', a: 'Elle dépend de la ville : là où le prix au m² est élevé, la rentabilité brute est généralement plus faible. Comparez toujours avec le prix au m² de la commune, la demande locative et le risque de vacance.' }
  ];
  const body = `    <form class="zs-calc" id="calc-rent" novalidate>
      <h2>Calculer la rentabilité de mon investissement</h2>
      <div class="zs-grid">${field('price', 'Prix d’achat (€)', '150000')}${field('works', 'Travaux (€)', '0')}${field('rent', 'Loyer mensuel hors charges (€)', '650')}${field('charges', 'Charges non récupérables (€ / an)', '600')}${field('tax', 'Taxe foncière (€ / an)', '700')}${field('other', 'Assurance, gestion, entretien (€ / an)', '500')}</div>
      <div class="zs-out" data-out aria-live="polite"></div>
      <div class="zs-ctas"><a class="zf-seo-primary" href="${base}${SPA.rentabilite}">Simulateur complet (fiscalité, crédit, cash-flow) →</a></div>
    </form>
    <section class="zs-section"><h2>Brute, nette, nette-nette</h2>
      <p>La rentabilité brute compare le loyer au prix ; la nette retire les charges du propriétaire et ajoute les frais d’achat au prix ; la nette-nette (ou nette de fiscalité) déduit en plus l’impôt sur les loyers. Le simulateur complet de Z Find calcule aussi le cash-flow mensuel avec un crédit, en location nue, meublée ou saisonnière.</p>
      <p>Pour situer un prix d’achat, consultez le <a href="${base}${PRICE_HUB}">prix au m² par commune</a>.</p>
    </section>`;
  const script = `${engineScript()}<script>ZS.bind('calc-rent',function(f){var p=ZS.num(f,'price'),w=ZS.num(f,'works'),r=ZS.num(f,'rent')*12,ch=ZS.num(f,'charges')+ZS.num(f,'tax')+ZS.num(f,'other');if(!(p>0)||!(r>0))return '<p>Indiquez un prix et un loyer.</p>';var c=ZS.c.estimate({country:'FR',price:p}).costs,inv=p+c+w;var pc=function(v){return (v*100).toFixed(2).replace('.',',')+' %';};return '<p class="zs-big">'+pc((r-ch)/inv)+' net</p><p>'+pc(r/p)+' brut</p>'+ZS.lines([['Loyers annuels',ZS.eur(r)],['Charges annuelles',ZS.eur(ch)],['Frais de notaire',ZS.eur(c)],['Investissement total',ZS.eur(inv)],['Revenu net avant impôt',ZS.eur(r-ch)+' / an']]);});</script>`;
  return { path: PAGES.rentabilite, html: shell({
    base, pathName: PAGES.rentabilite, crumb: 'Rentabilité locative', eyebrow: 'Simulateur gratuit · Investissement locatif',
    title: 'Calcul de rentabilité locative brute et nette : simulateur gratuit | Z Find',
    description: 'Calculez la rentabilité locative brute et nette d’un investissement immobilier : loyers, charges, taxe foncière, frais de notaire et travaux. Simulateur complet avec crédit et fiscalité.',
    h1: 'Calcul de la rentabilité locative', lead: 'Rendement brut et net de votre investissement, frais de notaire et charges compris, en quelques secondes.',
    body, faq, scripts: script
  }) };
}

function pageEstimation(base) {
  const faq = [
    { q: 'Comment estimer gratuitement mon bien ?', a: 'Indiquez la commune, la surface et les caractéristiques du bien : Z Find affiche immédiatement une fourchette de prix calculée à partir des ventes officielles de la commune, sans inscription. Un rapport détaillé peut vous être envoyé par e-mail.' },
    { q: 'D’où viennent les prix utilisés ?', a: 'Des ventes enregistrées par l’administration fiscale (DVF, DGFiP) en France, et des statistiques officielles en Belgique et au Luxembourg.' },
    { q: 'L’estimation remplace-t-elle l’avis d’un professionnel ?', a: 'Non. Elle donne un ordre de grandeur fiable ; une agence qui visite le bien affine le prix selon son état, sa vue et ses atouts.' }
  ];
  const body = `    <section class="zs-cards">
      <a class="zs-card" href="${base}${SPA.estimation}"><h2>Estimer mon bien →</h2><p>Propriétaire : une fourchette de prix immédiate pour votre appartement ou votre maison, puis un rapport détaillé par e-mail.</p></a>
      <a class="zs-card" href="${base}${SPA.acheteur}"><h2>Vérifier un prix →</h2><p>Acheteur : situez le prix demandé par rapport aux ventes réelles de la commune avant de faire une offre.</p></a>
      <a class="zs-card" href="${base}${PRICE_HUB}"><h2>Prix au m² par commune →</h2><p>Les prix médians des appartements et des maisons, commune par commune, depuis 2021.</p></a>
    </section>
    <section class="zs-section"><h2>Prix de l’immobilier dans les grandes villes</h2><ul class="zs-links">${BIG_CITIES.map(([n, s]) => `<li><a href="${base}${PRICE_HUB}/${s}">${esc(n)}</a></li>`).join('')}</ul></section>
    <section class="zs-section"><h2>Comment fonctionne l’estimation Z Find</h2>
      <p>L’estimation part des prix médians au m² des ventes réelles de la commune, puis les ajuste selon le type de bien, la surface, l’étage, l’état et les extérieurs. Le résultat est une fourchette, jamais un prix unique : c’est la façon honnête de décrire un marché.</p>
      <p>Une fois le prix connu, calculez les <a href="${base}${PAGES.notaire}">frais de notaire</a>, votre <a href="${base}${PAGES.capacite}">capacité d’emprunt</a> ou la <a href="${base}${PAGES.rentabilite}">rentabilité locative</a>.</p>
    </section>`;
  return { path: PAGES.estimation, html: shell({
    base, pathName: PAGES.estimation, crumb: 'Estimation immobilière', eyebrow: 'Gratuit · Sans inscription · France, Belgique, Luxembourg',
    title: 'Estimation immobilière gratuite en ligne : appartement et maison | Z Find',
    description: 'Estimez gratuitement votre appartement ou votre maison en France, en Belgique et au Luxembourg : fourchette de prix immédiate à partir des ventes officielles, sans inscription.',
    h1: 'Estimation immobilière gratuite', lead: 'Une fourchette de prix immédiate, calculée à partir des prix de vente officiels de la commune, sans inscription.',
    body, faq, ctaHref: SPA.estimation, ctaLabel: 'Estimer mon bien'
  }) };
}

function pageHub(base) {
  const cards = [
    [PAGES.estimation, 'Estimation immobilière', 'La valeur de votre bien à partir des ventes réelles de la commune.'],
    [PAGES.notaire, 'Frais de notaire', 'Ancien, neuf, primo-accédant : le détail exact des frais en France.'],
    [PAGES.pret, 'Simulateur de prêt', 'Mensualité, coût du crédit et revenus nécessaires.'],
    [PAGES.capacite, 'Capacité d’emprunt', 'Combien emprunter selon vos revenus, et pour quel prix de bien.'],
    [PAGES.rentabilite, 'Rentabilité locative', 'Rendement brut et net d’un investissement.'],
    [PAGES.belgique, 'Frais d’achat en Belgique', 'Droits d’enregistrement en Wallonie, Flandre et Bruxelles.'],
    [PAGES.luxembourg, 'Frais d’achat au Luxembourg', 'Droits de 7 % et crédit d’impôt Bëllegen Akt.'],
    [PRICE_HUB, 'Prix au m² par commune', 'Les prix médians de près de 26 000 communes.']
  ];
  const body = `    <section class="zs-cards">${cards.map(([p, t, d]) => `<a class="zs-card" href="${base}${p}"><h2>${esc(t)} →</h2><p>${esc(d)}</p></a>`).join('')}</section>`;
  return { path: PAGES.hub, html: shell({
    base, pathName: PAGES.hub, crumb: 'Simulateurs immobiliers', eyebrow: 'Outils gratuits · France, Belgique, Luxembourg',
    title: 'Simulateurs immobiliers gratuits : frais de notaire, prêt, rentabilité | Z Find',
    description: 'Tous les simulateurs immobiliers gratuits de Z Find : estimation, frais de notaire, prêt immobilier, capacité d’emprunt, rentabilité locative, frais d’achat en Belgique et au Luxembourg.',
    h1: 'Simulateurs immobiliers gratuits', lead: 'Estimer, financer, investir : les calculs essentiels d’un projet immobilier, avec les barèmes et les taux publiés.',
    body
  }) };
}

/* Toutes les pages : [{ path, html }]. today fixe la date des taux. */
function buildSimulatorPages(baseUrl, today) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('Simulator pages require a real SITE_BASE_URL.');
  const t = today || new Date();
  return [pageHub(base), pageNotaire(base), pageBelgique(base), pageLuxembourg(base, t), pagePret(base, t), pageCapacite(base, t), pageRentabilite(base), pageEstimation(base)];
}

module.exports = { PAGES, buildSimulatorPages };
