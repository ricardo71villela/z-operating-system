/* ============================================================
   Z FIND — PROFESSIONALS PAGE (#/{lang}/pro)

   What Z Find offers agencies, networks and developers, and how the
   portal earns money. Prices are not published yet ("on request") until
   the commercial terms are decided. Z Find is 100 % professional:
   no private sellers.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.proOffer = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const COPY = Object.freeze({
    fr: Object.freeze({
      eyebrow: 'Espace professionnels',
      title: 'Z Find pour les agences et les promoteurs',
      lead: 'Le portail immobilier 100 % professionnel pour la France, la Belgique et le Luxembourg : uniquement des agences, réseaux, mandataires et promoteurs identifiés — aucune annonce de particulier.',
      offersTitle: 'Ce que vous obtenez',
      offers: [
        { title: 'Publication et page agence', body: 'Vos annonces et programmes neufs, votre page agence, vos coordonnées et la réception des demandes des acheteurs et locataires.', model: 'Abonnement mensuel par agence' },
        { title: 'Mise en avant « À la une »', body: 'Des emplacements dédiés, séparés des résultats : 6 sur chaque page marché, 3 à côté des résultats de recherche. Toujours signalés « À la une ».', model: 'Par emplacement et par semaine' },
        { title: 'Programmes neufs', body: 'Page programme avec lots, plans et prix, et mise en avant sur la page du marché concerné.', model: 'Forfait par programme' },
        { title: 'Contacts vendeurs', body: 'L’estimation gratuite de Z Find reçoit des demandes de propriétaires (projet, délai, coordonnées) ; elles sont proposées aux agences partenaires de la commune.', model: 'Par contact, ou inclus dans l’offre premium' },
        { title: 'Avis vérifiés et alertes', body: 'Des avis laissés uniquement par des personnes qui vous ont contacté via Z Find, et des alertes e-mail qui ramènent les acheteurs vers vos nouvelles annonces.', model: 'Inclus' }
      ],
      rulesTitle: 'Nos règles',
      rules: [
        'Aucun particulier : chaque annonce vient d’un professionnel identifié.',
        'Résultats neutres : une mise en avant payée n’est jamais mélangée aux résultats de recherche ni ne change leur ordre.',
        'Chaque mise en avant porte la mention « À la une ».',
        'Les avis sont relus avant publication ; un avis négatif légitime n’est jamais retiré.'
      ],
      pricesTitle: 'Tarifs',
      prices: 'Tarifs de lancement sur demande.',
      contact: 'Nous contacter', demo: 'Voir la démonstration des emplacements « À la une »'
    }),
    en: Object.freeze({
      eyebrow: 'For professionals',
      title: 'Z Find for agencies and developers',
      lead: 'The 100% professional property portal for France, Belgium and Luxembourg: only identified agencies, networks, agents and developers — no private listings.',
      offersTitle: 'What you get',
      offers: [
        { title: 'Listings and agency page', body: 'Your listings and new developments, your agency page, your contact details and the enquiries of buyers and tenants.', model: 'Monthly subscription per agency' },
        { title: '"Featured" placements', body: 'Dedicated slots, separate from the results: 6 on each market page, 3 next to the search results. Always marked "Featured".', model: 'Per slot and per week' },
        { title: 'New developments', body: 'Development page with units, plans and prices, and a highlight on the market page.', model: 'Fixed fee per development' },
        { title: 'Seller leads', body: 'Z Find’s free valuation receives requests from owners (plans, timing, contact details); they are offered to partner agencies in the municipality.', model: 'Per lead, or included in the premium plan' },
        { title: 'Verified reviews and alerts', body: 'Reviews only from people who contacted you through Z Find, and e-mail alerts that bring buyers back to your new listings.', model: 'Included' }
      ],
      rulesTitle: 'Our rules',
      rules: [
        'No private sellers: every listing comes from an identified professional.',
        'Neutral results: a paid placement is never mixed into search results nor changes their order.',
        'Every paid placement is marked "Featured".',
        'Reviews are checked before publication; a legitimate negative review is never removed.'
      ],
      pricesTitle: 'Prices',
      prices: 'Launch prices on request.',
      contact: 'Contact us', demo: 'See the "Featured" placements demonstration'
    })
  });

  function copyFor(lang) { return COPY[lang] || COPY.en; }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pageHTML(lang) {
    const c = copyFor(lang);
    const subject = encodeURIComponent(lang === 'fr' ? 'Z Find Pro — demande d’information' : 'Z Find Pro — information request');
    return `
      <div class="wrap zpro">
        <p class="eyebrow">${esc(c.eyebrow)}</p>
        <h1>${esc(c.title)}</h1>
        <p class="zpro-lead">${esc(c.lead)}</p>
        <h2>${esc(c.offersTitle)}</h2>
        <div class="zpro-grid">
          ${c.offers.map(o => `<article class="zpro-card"><h3>${esc(o.title)}</h3><p>${esc(o.body)}</p><p class="zpro-model">${esc(o.model)}</p></article>`).join('')}
        </div>
        <h2>${esc(c.rulesTitle)}</h2>
        <ul class="zpro-rules">${c.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <h2>${esc(c.pricesTitle)}</h2>
        <p>${esc(c.prices)}</p>
        <div class="zpro-actions">
          <a class="btn btn-gold" href="mailto:hello@zfind.online?subject=${subject}">${esc(c.contact)}</a>
          <a class="btn btn-outline" href="#/${lang}/market/FR?demo=1">${esc(c.demo)}</a>
        </div>
      </div>`;
  }

  function render(rootEl, lang) {
    if (!rootEl) return false;
    rootEl.innerHTML = pageHTML(lang);
    return true;
  }

  return Object.freeze({ COPY, pageHTML, render });
});
