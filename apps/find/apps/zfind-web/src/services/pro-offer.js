/* ============================================================
   Z FIND — PROFESSIONALS PAGE (#/{lang}/pro)

   What Z Find offers agencies, networks and developers, and how the
   portal earns money: the agency subscription grid validated by the owner
   (Essentiel ≤ 25 listings / Plus ≤ 50 / Pro ≤ 75 / Premium > 75; 3 months free then
   the price guaranteed 1 year; Z Desk and Z Studio included), paid highlights, exclusive
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

  /* Agency subscription grid VALIDATED by the owner (28 Oct 2026, replaces
     the 14 Oct grid). Prices excl. VAT, monthly, identical in FR / BE / LU.
     Four tiers by the number of active listings: Essentiel ≤ 25 (99 €),
     Plus ≤ 50 (129 €), Pro ≤ 75 (149 €), Premium > 75 (199 €, no ceiling).
     Every tier: 3 months free, then the price is guaranteed for 1 year (the
     free months count from the public launch, or from sign-up if later), and
     Z Desk Lite + the Z Studio app are included in the subscription (« inclus »,
     never « gratuit »). Paid highlights (« mises en avant ») only appear in
     their dedicated slots, never inside the search results. Seller leads
     (estimation tool) are each sold to ONE agency only. */
  const PRICES = Object.freeze({
    // Subscriptions
    essentiel: 99, essentielMaxListings: 25,
    plus: 129, plusMaxListings: 50,
    pro: 149, proMaxListings: 75, proHighlightsPerMonth: 1,
    premium: 199, premiumHighlightsPerMonth: 3,
    freeMonths: 3, priceGuaranteeMonths: 12,
    // Mises en avant (dedicated slots only)
    highlight7Days: 9, highlight30Days: 29, highlightPack: 119, highlightPackSize: 5, agencyFeaturedMonth: 99,
    // Seller leads from the estimation tool (exclusive: one agency per lead)
    sellerLead: 49, sellerLeadQualified: 79, qualifiedLeadProjectMonths: 6,
    // Programmes neufs (developers): 199 € per programme per month, validated
    // by the owner on 14 Oct 2026.
    developmentMonth: 199
  });

  /* Public launch date of Z Find (ISO 'YYYY-MM-DD'), set by the owner on
     14 Oct 2026. The 3 free months count from this date (or from sign-up if
     later). If it is ever set back to null, the rule is shown without a date. */
  const LAUNCH_DATE = '2026-12-01';

  /* Self sign-up lives in the Partner app (#inscription opens the form). */
  const SIGNUP_URL = 'https://partner.zfind.online/#inscription';

  /* Tools included in every agency subscription. */
  const DESK_URL = 'https://desk.zfind.online';
  const STUDIO_URL = 'https://zstudio.space';

  function parseDate(v) {
    if (!v) return null;
    const d = v instanceof Date ? new Date(v.getTime()) : new Date(String(v).length === 10 ? `${v}T00:00:00Z` : v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const TIERS = Object.freeze(['essentiel', 'plus', 'pro', 'premium']);
  const TIER_NAMES = Object.freeze({ essentiel: 'Essentiel', plus: 'Plus', pro: 'Pro', premium: 'Premium' });
  /** Tier key for a number of active listings: essentiel (≤ 25), plus (26–50), pro (51–75), premium (> 75). */
  function tierFor(listings) {
    const n = Number(listings) || 0;
    if (n <= PRICES.essentielMaxListings) return 'essentiel';
    if (n <= PRICES.plusMaxListings) return 'plus';
    if (n <= PRICES.proMaxListings) return 'pro';
    return 'premium';
  }
  /** Monthly price (€ HT) of a tier key. */
  function priceFor(tier) { return PRICES[tier] == null ? null : PRICES[tier]; }
  /** Monthly price (€ HT) for a number of active listings. */
  function priceForListings(listings) { return priceFor(tierFor(listings)); }
  /** Listing range of a tier: { min, max } (max null = no ceiling). */
  function tierRange(tier) {
    const bounds = { essentiel: [0, PRICES.essentielMaxListings], plus: [PRICES.essentielMaxListings + 1, PRICES.plusMaxListings], pro: [PRICES.plusMaxListings + 1, PRICES.proMaxListings], premium: [PRICES.proMaxListings + 1, null] }[tier];
    return bounds ? { min: bounds[0], max: bounds[1] } : null;
  }
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
  /** One line per tier, in French, for the Partner sign-up and banner. */
  function tierLinesFr(p) {
    const q = p || PRICES;
    return [
      [`Essentiel — jusqu’à ${q.essentielMaxListings} annonces`, `${q.essentiel} € HT / mois`],
      [`Plus — ${q.essentielMaxListings + 1} à ${q.plusMaxListings} annonces`, `${q.plus} € HT / mois`],
      [`Pro — ${q.plusMaxListings + 1} à ${q.proMaxListings} annonces`, `${q.pro} € HT / mois, ${q.proHighlightsPerMonth} mise en avant par mois incluse`],
      [`Premium — plus de ${q.proMaxListings} annonces, sans plafond`, `${q.premium} € HT / mois, ${q.premiumHighlightsPerMonth} mises en avant par mois incluses`]
    ];
  }
  /** Short one-line grid, in French: « Essentiel 99 € HT / mois (jusqu’à 25) · Plus … ». */
  function gridTextFr(p) {
    const q = p || PRICES;
    return `Essentiel ${q.essentiel} € HT / mois (jusqu’à ${q.essentielMaxListings} annonces), Plus ${q.plus} € HT (jusqu’à ${q.plusMaxListings}), Pro ${q.pro} € HT (jusqu’à ${q.proMaxListings}), Premium ${q.premium} € HT (au-delà, sans plafond)`;
  }
  /** What every subscription includes, in French (Partner sign-up, banner, outreach). */
  const INCLUDED_FR = 'Z Desk (vos demandes de contact et de visite réunies, avec notification immédiate) et l’application Z Studio (photos, visuels et textes pour vos annonces et vos réseaux) inclus dans l’abonnement';

  const COPY = Object.freeze({
    fr: Object.freeze({
      eyebrow: 'Espace professionnels',
      title: 'Z Find pour les agences et les promoteurs',
      lead: 'Le portail immobilier 100 % professionnel pour la France, la Belgique et le Luxembourg : uniquement des agences, réseaux, mandataires et promoteurs identifiés — aucune annonce de particulier. Une grille de prix publique, la même pour tous.',
      offersTitle: 'Ce que vous obtenez',
      offers: [
        { title: 'Publication et page agence', body: 'Vos annonces et programmes neufs, votre page agence, vos coordonnées, la réception des demandes des acheteurs et locataires et vos statistiques chaque mois.', model: 'Abonnement Essentiel, Plus, Pro ou Premium selon le nombre d’annonces' },
        { title: 'Z Desk et Z Studio inclus', body: 'Z Desk réunit les demandes de contact et de visite de vos annonces dans une seule boîte, avec une notification immédiate : vous confirmez une visite ou répondez en un clic. L’application Z Studio (zstudio.space) transforme vos photos en visuels, carrousels et textes prêts à publier : connectez-vous avec l’e-mail de votre compte Z Find, l’accès complet est activé.', model: 'Inclus dans l’abonnement' },
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
        ['Essentiel', `${p.essentiel} € HT / mois`, `Jusqu’à ${p.essentielMaxListings} annonces actives : page agence, demandes des acheteurs et locataires, statistiques mensuelles, avis vérifiés, alertes, Z Desk et Z Studio inclus.`],
        ['Plus', `${p.plus} € HT / mois`, `De ${p.essentielMaxListings + 1} à ${p.plusMaxListings} annonces actives, tout l’Essentiel.`],
        ['Pro', `${p.pro} € HT / mois`, `De ${p.plusMaxListings + 1} à ${p.proMaxListings} annonces actives, tout l’Essentiel et ${p.proHighlightsPerMonth} mise en avant par mois incluse.`],
        ['Premium', `${p.premium} € HT / mois`, `Plus de ${p.proMaxListings} annonces actives, sans plafond : tout l’Essentiel et ${p.premiumHighlightsPerMonth} mises en avant par mois incluses.`]
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
        `${p.freeMonths} mois offerts ${launchStartText('fr')} (ou de votre inscription, si elle est postérieure), quel que soit votre abonnement, sans carte bancaire ni engagement.`,
        `Ensuite, votre prix est garanti pendant 1 an : ${p.essentiel} € HT par mois jusqu’à ${p.essentielMaxListings} annonces, ${p.plus} € jusqu’à ${p.plusMaxListings}, ${p.pro} € jusqu’à ${p.proMaxListings}, ${p.premium} € au-delà.`,
        'Z Desk et l’application Z Studio sont inclus dans l’abonnement, pendant les mois offerts comme ensuite.'
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
        { title: 'Listings and agency page', body: 'Your listings and new developments, your agency page, your contact details, the enquiries of buyers and tenants, and your statistics every month.', model: 'Essentiel, Plus, Pro or Premium subscription depending on your number of listings' },
        { title: 'Z Desk and Z Studio included', body: 'Z Desk brings the contact and viewing requests for your listings into one inbox, with an instant notification: confirm a viewing or reply in one click. The Z Studio app (zstudio.space) turns your photos into visuals, carousels and texts ready to post: sign in with your Z Find account e-mail and full access is on.', model: 'Included in the subscription' },
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
        ['Essentiel', `€${p.essentiel} excl. VAT / month`, `Up to ${p.essentielMaxListings} active listings: agency page, buyer and tenant enquiries, monthly statistics, verified reviews, alerts, Z Desk and Z Studio included.`],
        ['Plus', `€${p.plus} excl. VAT / month`, `${p.essentielMaxListings + 1} to ${p.plusMaxListings} active listings, everything in Essentiel.`],
        ['Pro', `€${p.pro} excl. VAT / month`, `${p.plusMaxListings + 1} to ${p.proMaxListings} active listings, everything in Essentiel and ${p.proHighlightsPerMonth} featured placement a month included.`],
        ['Premium', `€${p.premium} excl. VAT / month`, `More than ${p.proMaxListings} active listings, no ceiling: everything in Essentiel and ${p.premiumHighlightsPerMonth} featured placements a month included.`]
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
        `Then your price is guaranteed for 1 year: €${p.essentiel} excl. VAT a month up to ${p.essentielMaxListings} listings, €${p.plus} up to ${p.plusMaxListings}, €${p.pro} up to ${p.proMaxListings}, €${p.premium} above.`,
        'Z Desk and the Z Studio app are included in the subscription, during the free months and after.'
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

  return Object.freeze({ COPY, PRICES, LAUNCH_DATE, TIERS, TIER_NAMES, SIGNUP_URL, DESK_URL, STUDIO_URL, INCLUDED_FR, pageHTML, render,
    tierFor, priceFor, priceForListings, tierRange, launchStartText, tierLinesFr, gridTextFr });
});
