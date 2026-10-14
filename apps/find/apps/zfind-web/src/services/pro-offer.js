/* ============================================================
   Z FIND — PROFESSIONALS PAGE (#/{lang}/pro)

   What Z Find offers agencies, networks and developers, and how the
   portal earns money: the agency subscription grid validated by the owner
   (Essentiel ≤ 25 listings / Pro 26–75 / Premium > 75; 3 months free then
   the price guaranteed 1 year; 129 € instead of 99 € for the Essentiel tier
   after the first 6 months from LAUNCH_DATE), paid highlights, exclusive
   seller leads, the same in FR / BE / LU. Single source of truth for prices:
   the public site, the Partner sign-up and the Admin all read PRICES.
   Z Find is 100 % professional: no private sellers.
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

  /* Agency subscription grid VALIDATED by the owner (14 Oct 2026). Prices
     excl. VAT, monthly, identical in FR / BE / LU. Three tiers by the number
     of active listings; every tier: 3 months free, then the price is
     guaranteed for 1 year (the free months count from the public launch, or
     from sign-up if later). Paid highlights (« mises en avant ») only appear
     in their dedicated slots, never inside the search results. Seller leads
     (estimation tool) are each sold to ONE agency only. */
  const PRICES = Object.freeze({
    // Subscriptions
    essentiel: 99, essentielLater: 129, essentielMaxListings: 25,
    pro: 149, proMaxListings: 75, proHighlightsPerMonth: 1,
    premium: 199, premiumHighlightsPerMonth: 3,
    freeMonths: 3, priceGuaranteeMonths: 12, launchRateMonths: 6,
    // Mises en avant (dedicated slots only)
    highlight7Days: 9, highlight30Days: 29, highlightPack: 119, highlightPackSize: 5, agencyFeaturedMonth: 99,
    // Seller leads from the estimation tool (exclusive: one agency per lead)
    sellerLead: 49, sellerLeadQualified: 79, qualifiedLeadProjectMonths: 6,
    // Programmes neufs (developers): 199 € per programme per month, validated
    // by the owner on 14 Oct 2026.
    developmentMonth: 199
  });

  /* Public launch date of Z Find (ISO 'YYYY-MM-DD'). The 99 € « Essentiel »
     rate applies to agencies that sign up within the first
     PRICES.launchRateMonths months after this date; 129 € after.
     Set by the owner on 14 Oct 2026: public launch on 1 December 2026, so
     the 99 € rate applies to sign-ups up to 31 May 2027. If it is ever set
     back to null, the rule is shown as text and every sign-up gets 99 €. */
  const LAUNCH_DATE = '2026-12-01';

  /* Self sign-up lives in the Partner app (#inscription opens the form). */
  const SIGNUP_URL = 'https://partner.zfind.online/#inscription';

  function parseDate(v) {
    if (!v) return null;
    const d = v instanceof Date ? new Date(v.getTime()) : new Date(String(v).length === 10 ? `${v}T00:00:00Z` : v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  /** End of the launch window (launch date + 6 months), or null when the launch date is not set. */
  function launchRateEndsAt(launchDate) {
    const d = parseDate(launchDate === undefined ? LAUNCH_DATE : launchDate);
    if (!d) return null;
    d.setUTCMonth(d.getUTCMonth() + PRICES.launchRateMonths);
    return d;
  }
  /** Monthly « Essentiel » price for an agency that signed up on signupDate (99 € in the launch window, else 129 €). */
  function essentielPriceFor(signupDate, launchDate) {
    const end = launchRateEndsAt(launchDate);
    const at = parseDate(signupDate) || new Date();
    return end && at >= end ? PRICES.essentielLater : PRICES.essentiel;
  }
  /** Tier key for a number of active listings: essentiel (≤ 25), pro (26–75), premium (> 75). */
  function tierFor(listings) {
    const n = Number(listings) || 0;
    if (n <= PRICES.essentielMaxListings) return 'essentiel';
    if (n <= PRICES.proMaxListings) return 'pro';
    return 'premium';
  }
  const TIER_NAMES = Object.freeze({ essentiel: 'Essentiel', pro: 'Pro', premium: 'Premium' });
  function dateLabel(d, lang) {
    const t = d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return lang === 'fr' && d.getUTCDate() === 1 ? t.replace(/^1 /, '1er ') : t;
  }
  /** « à compter du lancement public de Z Find, le 1 décembre 2026 » (or without the date when LAUNCH_DATE is null). */
  function launchStartText(lang) {
    const d = parseDate(LAUNCH_DATE);
    if (lang === 'fr') return d ? `à compter du lancement public de Z Find, le ${dateLabel(d, 'fr')}` : 'à compter du lancement public de Z Find';
    return d ? `from Z Find’s public launch on ${dateLabel(d, 'en')}` : 'from Z Find’s public launch';
  }
  /** « pour les agences inscrites dans les 6 premiers mois » or « … inscrites jusqu’au 13 avril 2027 ». */
  function launchWindowText(lang, launchDate) {
    const end = launchRateEndsAt(launchDate);
    if (lang === 'fr') {
      if (!end) return `pour les agences inscrites dans les ${PRICES.launchRateMonths} premiers mois après le lancement de Z Find`;
      const last = new Date(end.getTime() - 86400000);
      return `pour les agences inscrites jusqu’au ${dateLabel(last, 'fr')}`;
    }
    if (!end) return `for agencies joining in the first ${PRICES.launchRateMonths} months after Z Find’s launch`;
    return `for agencies joining by ${dateLabel(new Date(end.getTime() - 86400000), 'en')}`;
  }
  /** One line per tier, in French, for the Partner sign-up and banner. */
  function tierLinesFr(p, essentielPrice) {
    const e = essentielPrice == null
      ? `${p.essentiel} € HT / mois (${launchWindowText('fr')}, puis ${p.essentielLater} €)`
      : `${essentielPrice} € HT / mois`;
    return [
      ['Essentiel — jusqu’à 25 annonces', e],
      ['Pro — 26 à 75 annonces', `${p.pro} € HT / mois, 1 mise en avant par mois incluse`],
      ['Premium — plus de 75 annonces', `${p.premium} € HT / mois, 3 mises en avant par mois incluses`]
    ];
  }

  const COPY = Object.freeze({
    fr: Object.freeze({
      eyebrow: 'Espace professionnels',
      title: 'Z Find pour les agences et les promoteurs',
      lead: 'Le portail immobilier 100 % professionnel pour la France, la Belgique et le Luxembourg : uniquement des agences, réseaux, mandataires et promoteurs identifiés — aucune annonce de particulier. Une grille de prix publique, la même pour tous.',
      offersTitle: 'Ce que vous obtenez',
      offers: [
        { title: 'Publication et page agence', body: 'Vos annonces et programmes neufs, votre page agence, vos coordonnées, la réception des demandes des acheteurs et locataires et vos statistiques chaque mois.', model: 'Abonnement Essentiel, Pro ou Premium selon le nombre d’annonces' },
        { title: 'Mise en avant « À la une »', body: 'Des emplacements dédiés, séparés des résultats : 6 sur chaque page marché, 3 à côté des résultats de recherche. Toujours signalés « À la une », jamais mélangés aux résultats de recherche.', model: 'À partir de 9 € HT les 7 jours' },
        { title: 'Programmes neufs', body: 'Page programme avec lots, plans et prix, et une semaine « À la une » au lancement.', model: 'Par programme et par mois' },
        { title: 'Contacts vendeurs', body: 'L’estimation gratuite de Z Find reçoit des demandes de propriétaires (projet, délai, coordonnées). Seuls ceux qui acceptent expressément d’être mis en relation avec une agence sont transmis, à une seule agence partenaire de leur commune.', model: 'Par contact exclusif, à partir de 49 € HT' },
        { title: 'Avis vérifiés et alertes', body: 'Des avis laissés uniquement par des personnes qui vous ont contacté via Z Find, et des alertes e-mail qui ramènent les acheteurs vers vos nouvelles annonces.', model: 'Inclus' }
      ],
      rulesTitle: 'Nos règles',
      rules: [
        'Aucun particulier : chaque annonce vient d’un professionnel identifié.',
        'Résultats neutres : une mise en avant payée n’est jamais mélangée aux résultats de recherche ni ne change leur ordre.',
        'Chaque mise en avant porte la mention « À la une ».',
        'Chaque contact vendeur est transmis à une seule agence.',
        'Les avis sont relus avant publication ; un avis négatif légitime n’est jamais retiré.',
        'Prix publics, identiques pour toutes les agences, sans engagement de durée.'
      ],
      pricesTitle: 'Tarifs',
      pricesNote: 'Prix hors TVA, identiques en France, en Belgique et au Luxembourg ; la TVA du pays s’ajoute. Abonnements mensuels sans engagement de durée.',
      plansTitle: 'Abonnements agences',
      planRows: p => [
        ['Essentiel', `${p.essentiel} € HT / mois`, `Jusqu’à ${p.essentielMaxListings} annonces actives : page agence, demandes des acheteurs et locataires, statistiques mensuelles, avis vérifiés, alertes. ${p.essentiel} € ${launchWindowText('fr')}, ${p.essentielLater} € HT / mois pour les agences inscrites ensuite.`],
        ['Pro', `${p.pro} € HT / mois`, `De ${p.essentielMaxListings + 1} à ${p.proMaxListings} annonces actives, tout l’Essentiel et ${p.proHighlightsPerMonth} mise en avant par mois incluse.`],
        ['Premium', `${p.premium} € HT / mois`, `Plus de ${p.proMaxListings} annonces actives, tout l’Essentiel et ${p.premiumHighlightsPerMonth} mises en avant par mois incluses.`]
      ],
      highlightsTitle: 'Mises en avant « À la une »',
      highlightsNote: 'Affichées uniquement dans les emplacements « À la une », jamais mélangées aux résultats de recherche.',
      highlightRows: p => [
        ['Mise en avant 7 jours', `${p.highlight7Days} € HT`, 'Une annonce dans un emplacement « À la une » pendant 7 jours'],
        ['Mise en avant 30 jours', `${p.highlight30Days} € HT`, 'Une annonce dans un emplacement « À la une » pendant 30 jours'],
        [`Pack de ${p.highlightPackSize} mises en avant`, `${p.highlightPack} € HT`, `${p.highlightPackSize} mises en avant de 30 jours`],
        ['Agence à la une', `${p.agencyFeaturedMonth} € HT / commune / mois`, 'Votre agence présentée « À la une » sur la page d’une commune']
      ],
      leadsTitle: 'Contacts vendeurs',
      leadRows: p => [
        ['Contact vendeur', `${p.sellerLead} € HT / contact`, 'Propriétaire ayant demandé une estimation et accepté la mise en relation'],
        ['Contact vendeur qualifié', `${p.sellerLeadQualified} € HT / contact`, `Numéro de téléphone et projet de vente dans les ${p.qualifiedLeadProjectMonths} mois`]
      ],
      leadsNote: 'Chaque contact est transmis à une seule agence partenaire de la commune du bien.',
      developersTitle: 'Promoteurs',
      developerRows: p => [
        ['Programme neuf', `${p.developmentMonth} € HT / programme / mois`, 'Page programme avec lots, plans et prix, et une semaine « À la une » au lancement']
      ],
      pricesHead: ['Offre', 'Prix', 'Inclus'],
      launchTitle: 'Offre de lancement',
      launch: p => [
        `${p.freeMonths} mois gratuits ${launchStartText('fr')} (ou de votre inscription, si elle est postérieure), quel que soit votre abonnement, sans carte bancaire ni engagement.`,
        `Ensuite, votre prix est garanti pendant 1 an.`,
        `Essentiel à ${p.essentiel} € HT par mois ${launchWindowText('fr')} (${p.essentielLater} € HT par mois ensuite).`
      ],
      contact: 'Inscrire mon agence', signup: 'Inscrire mon agence', write: 'Nous écrire', demo: 'Voir la démonstration des emplacements « À la une »',
      mailSubject: 'Z Find Pro — inscription agence'
    }),
    en: Object.freeze({
      eyebrow: 'For professionals',
      title: 'Z Find for agencies and developers',
      lead: 'The 100% professional property portal for France, Belgium and Luxembourg: only identified agencies, networks, agents and developers — no private listings. One public price list, the same for everyone.',
      offersTitle: 'What you get',
      offers: [
        { title: 'Listings and agency page', body: 'Your listings and new developments, your agency page, your contact details, the enquiries of buyers and tenants, and your statistics every month.', model: 'Essentiel, Pro or Premium subscription depending on your number of listings' },
        { title: '"Featured" placements', body: 'Dedicated slots, separate from the results: 6 on each market page, 3 next to the search results. Always marked "Featured", never mixed into the search results.', model: 'From €9 excl. VAT for 7 days' },
        { title: 'New developments', body: 'Development page with units, plans and prices, and one "Featured" week at launch.', model: 'Per development and per month' },
        { title: 'Seller leads', body: 'Z Find’s free valuation receives requests from owners (plans, timing, contact details). Only those who expressly agree to be put in touch with an agency are passed on, to a single partner agency in their municipality.', model: 'Per exclusive lead, from €49 excl. VAT' },
        { title: 'Verified reviews and alerts', body: 'Reviews only from people who contacted you through Z Find, and e-mail alerts that bring buyers back to your new listings.', model: 'Included' }
      ],
      rulesTitle: 'Our rules',
      rules: [
        'No private sellers: every listing comes from an identified professional.',
        'Neutral results: a paid placement is never mixed into search results nor changes their order.',
        'Every paid placement is marked "Featured".',
        'Every seller lead is passed on to a single agency.',
        'Reviews are checked before publication; a legitimate negative review is never removed.',
        'Public prices, the same for every agency, with no minimum term.'
      ],
      pricesTitle: 'Prices',
      pricesNote: 'Prices excluding VAT, the same in France, Belgium and Luxembourg; the country’s VAT is added. Monthly subscriptions with no minimum term.',
      plansTitle: 'Agency subscriptions',
      planRows: p => [
        ['Essentiel', `€${p.essentiel} excl. VAT / month`, `Up to ${p.essentielMaxListings} active listings: agency page, buyer and tenant enquiries, monthly statistics, verified reviews, alerts. €${p.essentiel} ${launchWindowText('en')}, €${p.essentielLater} excl. VAT / month for agencies joining later.`],
        ['Pro', `€${p.pro} excl. VAT / month`, `${p.essentielMaxListings + 1} to ${p.proMaxListings} active listings, everything in Essentiel and ${p.proHighlightsPerMonth} featured placement a month included.`],
        ['Premium', `€${p.premium} excl. VAT / month`, `More than ${p.proMaxListings} active listings, everything in Essentiel and ${p.premiumHighlightsPerMonth} featured placements a month included.`]
      ],
      highlightsTitle: '"Featured" placements',
      highlightsNote: 'Shown only in the "Featured" slots, never mixed into the search results.',
      highlightRows: p => [
        ['Featured, 7 days', `€${p.highlight7Days} excl. VAT`, 'One listing in a "Featured" slot for 7 days'],
        ['Featured, 30 days', `€${p.highlight30Days} excl. VAT`, 'One listing in a "Featured" slot for 30 days'],
        [`Pack of ${p.highlightPackSize}`, `€${p.highlightPack} excl. VAT`, `${p.highlightPackSize} featured placements of 30 days`],
        ['Featured agency', `€${p.agencyFeaturedMonth} excl. VAT / municipality / month`, 'Your agency shown as "Featured" on a municipality page']
      ],
      leadsTitle: 'Seller leads',
      leadRows: p => [
        ['Seller lead', `€${p.sellerLead} excl. VAT / lead`, 'Owner who asked for a valuation and agreed to be put in touch'],
        ['Qualified seller lead', `€${p.sellerLeadQualified} excl. VAT / lead`, `Phone number and a plan to sell within ${p.qualifiedLeadProjectMonths} months`]
      ],
      leadsNote: 'Every lead is passed on to a single partner agency in the property’s municipality.',
      developersTitle: 'Developers',
      developerRows: p => [
        ['New development', `€${p.developmentMonth} excl. VAT / development / month`, 'Development page with units, plans and prices, and one "Featured" week at launch']
      ],
      pricesHead: ['Offer', 'Price', 'Included'],
      launchTitle: 'Launch offer',
      launch: p => [
        `${p.freeMonths} months free ${launchStartText('en')} (or from your sign-up, if later), whatever your subscription, no card and no commitment.`,
        'Then your price is guaranteed for 1 year.',
        `Essentiel at €${p.essentiel} excl. VAT a month ${launchWindowText('en')} (€${p.essentielLater} excl. VAT a month after that).`
      ],
      contact: 'Register my agency', signup: 'Register my agency', write: 'Write to us', demo: 'See the "Featured" placements demonstration',
      mailSubject: 'Z Find Pro — agency registration'
    })
  });

  function copyFor(lang) { return COPY[lang] || COPY.en; }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function priceTable(c, title, rows, note) {
    return `
        <h3 class="zpro-subtitle">${esc(title)}</h3>
        <div class="zpro-table-wrap"><table class="zpro-prices">
          <thead><tr>${c.pricesHead.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr><th scope="row">${esc(r[0])}</th><td class="zpro-price">${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody>
        </table></div>${note ? `<p class="zpro-note">${esc(note)}</p>` : ''}`;
  }

  function pageHTML(lang) {
    const c = copyFor(lang);
    const subject = encodeURIComponent(c.mailSubject);
    return `
      <div class="wrap zpro">
        <p class="eyebrow">${esc(c.eyebrow)}</p>
        <h1>${esc(c.title)}</h1>
        <p class="zpro-lead">${esc(c.lead)}</p>
        <section class="zpro-launch">
          <h2>${esc(c.launchTitle)}</h2>
          <ul>${c.launch(PRICES).map(f => `<li>${esc(f)}</li>`).join('')}</ul>
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
        ${priceTable(c, c.plansTitle, c.planRows(PRICES))}
        ${priceTable(c, c.highlightsTitle, c.highlightRows(PRICES), c.highlightsNote)}
        ${priceTable(c, c.leadsTitle, c.leadRows(PRICES), c.leadsNote)}
        ${priceTable(c, c.developersTitle, c.developerRows(PRICES))}
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

  return Object.freeze({ COPY, PRICES, LAUNCH_DATE, TIER_NAMES, SIGNUP_URL, pageHTML, render,
    launchRateEndsAt, essentielPriceFor, tierFor, launchWindowText, launchStartText, tierLinesFr });
});
