/* ============================================================
   Z FIND — PROFESSIONALS PAGE (#/{lang}/pro)

   What Z Find offers agencies, networks and developers, and how the
   portal earns money: one public launch price list (approved 3 Oct 2026,
   subject to revision), the same in FR / BE / LU, no minimum term, and the
   "Founder" launch offer. Z Find is 100 % professional: no private sellers.
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

  /* Launch price list (approved 3 Oct 2026, subject to revision). Prices
     excl. VAT, monthly, no minimum term, identical in FR / BE / LU. */
  const PRICES = Object.freeze({
    essentiel: 99, pro: 199, networkDiscountPct: 20, networkFrom: 3,
    featuredMarketWeek: 49, featuredSearchWeek: 29, developmentMonth: 149, sellerLead: 29,
    founderMonth: 99, founderWave2Month: 129, founderFreeMonths: 3, founderPriceMonths: 12,
    founderSeatsPerCountry: 50, founderDevelopers: 10, founderMinLeads: 5, founderExtensionMonths: 3
  });

  /* Self sign-up lives in the Partner app (#inscription opens the form). */
  const SIGNUP_URL = 'https://partner.zfind.online/#inscription';

  const COPY = Object.freeze({
    fr: Object.freeze({
      eyebrow: 'Espace professionnels',
      title: 'Z Find pour les agences et les promoteurs',
      lead: 'Le portail immobilier 100 % professionnel pour la France, la Belgique et le Luxembourg : uniquement des agences, réseaux, mandataires et promoteurs identifiés — aucune annonce de particulier. Une grille de prix publique, la même pour tous, sans engagement.',
      offersTitle: 'Ce que vous obtenez',
      offers: [
        { title: 'Publication et page agence', body: 'Vos annonces et programmes neufs, votre page agence, vos coordonnées, la réception des demandes des acheteurs et locataires et vos statistiques chaque mois.', model: 'Abonnement Essentiel ou Pro' },
        { title: 'Mise en avant « À la une »', body: 'Des emplacements dédiés, séparés des résultats : 6 sur chaque page marché, 3 à côté des résultats de recherche. Toujours signalés « À la une ».', model: 'Par emplacement et par semaine' },
        { title: 'Programmes neufs', body: 'Page programme avec lots, plans et prix, et une semaine « À la une » au lancement.', model: 'Par programme et par mois' },
        { title: 'Contacts vendeurs', body: 'L’estimation gratuite de Z Find reçoit des demandes de propriétaires (projet, délai, coordonnées). Seuls ceux qui acceptent expressément d’être mis en relation avec une agence sont transmis, à une seule agence partenaire de leur commune.', model: 'Par contact exclusif' },
        { title: 'Avis vérifiés et alertes', body: 'Des avis laissés uniquement par des personnes qui vous ont contacté via Z Find, et des alertes e-mail qui ramènent les acheteurs vers vos nouvelles annonces.', model: 'Inclus' }
      ],
      rulesTitle: 'Nos règles',
      rules: [
        'Aucun particulier : chaque annonce vient d’un professionnel identifié.',
        'Résultats neutres : une mise en avant payée n’est jamais mélangée aux résultats de recherche ni ne change leur ordre.',
        'Chaque mise en avant porte la mention « À la une ».',
        'Les avis sont relus avant publication ; un avis négatif légitime n’est jamais retiré.',
        'Prix publics, identiques pour toutes les agences, sans engagement de durée.'
      ],
      pricesTitle: 'Tarifs',
      pricesNote: 'Tarifs de lancement, susceptibles d’évoluer. Prix hors TVA, mensuels et sans engagement, identiques en France, en Belgique et au Luxembourg ; la TVA du pays s’ajoute.',
      priceRows: p => [
        ['Essentiel', `${p.essentiel} € HT / mois`, 'Jusqu’à 50 annonces actives, page agence, demandes des acheteurs et locataires, statistiques mensuelles, avis vérifiés, alertes'],
        ['Pro', `${p.pro} € HT / mois`, 'Annonces illimitées, une semaine « À la une » par mois, premier destinataire des contacts vendeurs de votre commune'],
        ['Réseaux et multi-agences', `−${p.networkDiscountPct} % dès ${p.networkFrom} agences`, 'Facture unique ; accord-cadre pour les réseaux nationaux sur proposition'],
        ['« À la une » — page marché', `${p.featuredMarketWeek} € HT / emplacement / semaine`, '6 emplacements par pays'],
        ['« À la une » — à côté de la recherche', `${p.featuredSearchWeek} € HT / emplacement / semaine`, '3 emplacements, jamais dans les résultats'],
        ['Programme neuf', `${p.developmentMonth} € HT / programme / mois`, 'Page programme et une semaine « À la une » au lancement'],
        ['Contact vendeur', `${p.sellerLead} € HT / contact`, 'Propriétaire ayant accepté la mise en relation, transmis à une seule agence']
      ],
      pricesHead: ['Offre', 'Prix', 'Inclus'],
      founderTitle: 'Offre de lancement « Fondateur »',
      founder: p => [
        `${p.founderFreeMonths} mois gratuits dès votre inscription : l’offre Pro complète, sans carte bancaire ni engagement.`,
        `Garantie : moins de ${p.founderMinLeads} contacts reçus via Z Find pendant ces ${p.founderFreeMonths} mois ? La gratuité est renouvelée pour ${p.founderExtensionMonths} mois de plus, une fois.`,
        `1re vague — les ${p.founderSeatsPerCountry} premières agences de chaque pays : ensuite, l’offre Pro au prix de l’Essentiel, ${p.founderMonth} € HT par mois au lieu de ${p.pro} €, garantis ${p.founderPriceMonths} mois.`,
        `2e vague — les agences suivantes : l’offre Pro à ${p.founderWave2Month} € HT par mois au lieu de ${p.pro} €, garantis ${p.founderPriceMonths} mois.`,
        `Toujours sans engagement. ${p.founderDevelopers} promoteurs fondateurs : programmes neufs gratuits pendant la période gratuite.`,
        `« À la une » offert pendant la période gratuite, en rotation entre les fondateurs.`
      ],
      founderAsk: 'En contrepartie : vous publiez tout votre portefeuille, vous répondez aux demandes sous 24 heures et vous nous autorisez à citer votre agence comme référence.',
      contact: 'Devenir agence fondatrice', signup: 'Inscrire mon agence', write: 'Nous écrire', demo: 'Voir la démonstration des emplacements « À la une »',
      mailSubject: 'Z Find Pro — offre Fondateur'
    }),
    en: Object.freeze({
      eyebrow: 'For professionals',
      title: 'Z Find for agencies and developers',
      lead: 'The 100% professional property portal for France, Belgium and Luxembourg: only identified agencies, networks, agents and developers — no private listings. One public price list, the same for everyone, with no minimum term.',
      offersTitle: 'What you get',
      offers: [
        { title: 'Listings and agency page', body: 'Your listings and new developments, your agency page, your contact details, the enquiries of buyers and tenants, and your statistics every month.', model: 'Essentiel or Pro subscription' },
        { title: '"Featured" placements', body: 'Dedicated slots, separate from the results: 6 on each market page, 3 next to the search results. Always marked "Featured".', model: 'Per slot and per week' },
        { title: 'New developments', body: 'Development page with units, plans and prices, and one "Featured" week at launch.', model: 'Per development and per month' },
        { title: 'Seller leads', body: 'Z Find’s free valuation receives requests from owners (plans, timing, contact details). Only those who expressly agree to be put in touch with an agency are passed on, to a single partner agency in their municipality.', model: 'Per exclusive lead' },
        { title: 'Verified reviews and alerts', body: 'Reviews only from people who contacted you through Z Find, and e-mail alerts that bring buyers back to your new listings.', model: 'Included' }
      ],
      rulesTitle: 'Our rules',
      rules: [
        'No private sellers: every listing comes from an identified professional.',
        'Neutral results: a paid placement is never mixed into search results nor changes their order.',
        'Every paid placement is marked "Featured".',
        'Reviews are checked before publication; a legitimate negative review is never removed.',
        'Public prices, the same for every agency, with no minimum term.'
      ],
      pricesTitle: 'Prices',
      pricesNote: 'Launch prices, subject to change. Prices excluding VAT, monthly and with no minimum term, the same in France, Belgium and Luxembourg; the country’s VAT is added.',
      priceRows: p => [
        ['Essentiel', `€${p.essentiel} excl. VAT / month`, 'Up to 50 active listings, agency page, buyer and tenant enquiries, monthly statistics, verified reviews, alerts'],
        ['Pro', `€${p.pro} excl. VAT / month`, 'Unlimited listings, one "Featured" week a month, first to receive the seller leads of your municipality'],
        ['Networks and multi-agency', `−${p.networkDiscountPct}% from ${p.networkFrom} agencies`, 'Single invoice; framework agreement for national networks on proposal'],
        ['"Featured" — market page', `€${p.featuredMarketWeek} excl. VAT / slot / week`, '6 slots per country'],
        ['"Featured" — next to search', `€${p.featuredSearchWeek} excl. VAT / slot / week`, '3 slots, never inside the results'],
        ['New development', `€${p.developmentMonth} excl. VAT / development / month`, 'Development page and one "Featured" week at launch'],
        ['Seller lead', `€${p.sellerLead} excl. VAT / lead`, 'Owner who agreed to be put in touch, passed on to a single agency']
      ],
      pricesHead: ['Offer', 'Price', 'Included'],
      founderTitle: '"Founder" launch offer',
      founder: p => [
        `${p.founderFreeMonths} months free from sign-up: the full Pro plan, no card and no commitment.`,
        `Guarantee: fewer than ${p.founderMinLeads} enquiries through Z Find during those ${p.founderFreeMonths} months? The free period is renewed for ${p.founderExtensionMonths} more months, once.`,
        `First wave — the first ${p.founderSeatsPerCountry} agencies in each country: then the Pro plan at the Essentiel price, €${p.founderMonth} excl. VAT a month instead of €${p.pro}, guaranteed for ${p.founderPriceMonths} months.`,
        `Second wave — the following agencies: the Pro plan at €${p.founderWave2Month} excl. VAT a month instead of €${p.pro}, guaranteed for ${p.founderPriceMonths} months.`,
        `Always with no minimum term. ${p.founderDevelopers} founding developers: new developments free during the free period.`,
        '"Featured" slots free during the free period, rotating among founders.'
      ],
      founderAsk: 'In return: you publish your whole portfolio, answer enquiries within 24 hours and let us name your agency as a reference.',
      contact: 'Become a founding agency', signup: 'Register my agency', write: 'Write to us', demo: 'See the "Featured" placements demonstration',
      mailSubject: 'Z Find Pro — Founder offer'
    })
  });

  function copyFor(lang) { return COPY[lang] || COPY.en; }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pageHTML(lang) {
    const c = copyFor(lang);
    const subject = encodeURIComponent(c.mailSubject);
    return `
      <div class="wrap zpro">
        <p class="eyebrow">${esc(c.eyebrow)}</p>
        <h1>${esc(c.title)}</h1>
        <p class="zpro-lead">${esc(c.lead)}</p>
        <section class="zpro-founder">
          <h2>${esc(c.founderTitle)}</h2>
          <ul>${c.founder(PRICES).map(f => `<li>${esc(f)}</li>`).join('')}</ul>
          <p>${esc(c.founderAsk)}</p>
          <div class="zpro-actions">
            <a class="btn btn-gold" href="${SIGNUP_URL}">${esc(c.signup)}</a>
            <a class="btn btn-outline" href="mailto:hello@zfind.online?subject=${subject}">${esc(c.write)}</a>
          </div>
        </section>
        <h2>${esc(c.offersTitle)}</h2>
        <div class="zpro-grid">
          ${c.offers.map(o => `<article class="zpro-card"><h3>${esc(o.title)}</h3><p>${esc(o.body)}</p><p class="zpro-model">${esc(o.model)}</p></article>`).join('')}
        </div>
        <h2>${esc(c.pricesTitle)}</h2>
        <div class="zpro-table-wrap"><table class="zpro-prices">
          <thead><tr>${c.pricesHead.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${c.priceRows(PRICES).map(r => `<tr><th scope="row">${esc(r[0])}</th><td class="zpro-price">${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="zpro-note">${esc(c.pricesNote)}</p>
        <h2>${esc(c.rulesTitle)}</h2>
        <ul class="zpro-rules">${c.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <div class="zpro-actions">
          <a class="btn btn-gold" href="${SIGNUP_URL}">${esc(c.signup)}</a>
          <a class="btn btn-outline" href="#/${lang}/market/FR?demo=1">${esc(c.demo)}</a>
        </div>
      </div>`;
  }

  function render(rootEl, lang) {
    if (!rootEl) return false;
    rootEl.innerHTML = pageHTML(lang);
    return true;
  }

  return Object.freeze({ COPY, PRICES, SIGNUP_URL, pageHTML, render });
});
