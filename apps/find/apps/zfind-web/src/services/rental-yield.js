/* ============================================================
   Z FIND — RENTAL YIELD SIMULATOR (#/{lang}/yield?market=FR&mode=long)

   Profitability of a rental investment in France, Belgium and
   Luxembourg, for a long-term let (unfurnished or furnished) or a
   short-term / tourist let.

   Principles (rigour first):
   - Z Find never estimates a rent, an occupancy rate or a charge: every
     operating figure is the visitor's own. Until the price and the rent
     are given, the page shows the method, not a number.
   - What Z Find does compute is public and sourced: the purchase costs
     (acquisition-costs.js, investment = no main-residence relief) and,
     when the purchase is financed, the loan payment with the official
     dated reference rate (credit-rates.js, never an expired figure).
   - Every result shows its formula and is "before income tax": rental
     taxation depends on the regime and the household; the visitor may
     enter their own tax estimate. Each market's rules (energy rating,
     rent ceiling, tourist-let limits, taxation regime) are stated with
     the facts checked in October 2026.

   Definitions
     Gross yield  = annual rent (full year, before vacancy) ÷ purchase price
                    (short-term: expected bookings ÷ purchase price)
     Net yield    = (rent collected − owner's charges) ÷ total cost
                    total cost = price + purchase costs + works + furniture
     Cash flow    = rent collected − charges − loan payments (− the tax
                    entered by the visitor), per month
     Return on deposit = annual cash flow ÷ deposit (financed purchase)
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./acquisition-costs'), require('./credit-rates'), require('./credit-simulator'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.rentalYield = factory(root.ZFindServices.acquisitionCosts, root.ZFindServices.creditRates, root.ZFindServices.creditSimulator);
  }
})(typeof window !== 'undefined' ? window : this, function (acquisition, rates, credit) {
  'use strict';

  const MARKETS = Object.freeze(['FR', 'BE', 'LU']);
  const MODES = Object.freeze(['long', 'short']);
  const DPE = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  const LU_RENT_CAP = 0.05; // annual rent <= 5 % of the capital invested (law of 21 Sept. 2006, revised 1 Aug. 2024)
  const DURATIONS = Object.freeze({ FR: [10, 15, 20, 25], BE: [10, 15, 20, 25, 30], LU: [10, 15, 20, 25, 30] });

  const round = v => Math.round(v);
  const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const pos = v => Math.max(0, num(v) || 0);
  const pct = (v, max) => Math.min(max == null ? 100 : max, pos(v)) / 100;

  /* Interest paid during the first 12 months of a fixed-rate loan. */
  function firstYearInterest(loan, ratePct, years) {
    const r = Number(ratePct) / 100 / 12;
    const pay = loan * credit.annuityFactor(ratePct, years);
    let balance = loan, interest = 0;
    for (let m = 0; m < Math.min(12, Math.round(years * 12)); m++) {
      const i = balance * r;
      interest += i;
      balance -= pay - i;
    }
    return interest;
  }

  /* input: { market, mode, price, works, furniture, furnished, costs:{newBuild, region},
     rent, vacancyMonths, nightly, occupancyPct, platformPct, cleaning, utilities,
     propertyTax, coownership, insurance, managementPct, maintenance, incomeTax,
     financed, deposit, ratePct, years, insurancePct } */
  function compute(input) {
    const market = MARKETS.includes(input.market) ? input.market : 'FR';
    const mode = MODES.includes(input.mode) ? input.mode : 'long';
    const price = num(input.price);
    if (!(price > 0)) return { error: 'price_required' };

    // Revenue.
    let grossAnnual, collected;
    if (mode === 'long') {
      const rent = num(input.rent);
      if (!(rent > 0)) return { error: 'rent_required' };
      const vacancy = Math.min(12, pos(input.vacancyMonths));
      grossAnnual = rent * 12;
      collected = rent * (12 - vacancy);
    } else {
      const nightly = num(input.nightly);
      const occupancy = pct(input.occupancyPct);
      if (!(nightly > 0)) return { error: 'nightly_required' };
      if (!(occupancy > 0)) return { error: 'occupancy_required' };
      grossAnnual = nightly * 365 * occupancy;
      collected = grossAnnual * (1 - pct(input.platformPct));
    }

    // Purchase.
    const costsInput = Object.assign({ country: market, price, ownHome: false, firstBuyer: false, buyers: 1 },
      market === 'FR' ? { newBuild: !!(input.costs && input.costs.newBuild) } : {},
      market === 'BE' ? { region: input.costs && input.costs.region } : {});
    const c = acquisition.estimate(costsInput);
    const costs = c && !c.error ? c.costs : null;
    const works = pos(input.works);
    const furniture = (mode === 'short' || input.furnished) ? pos(input.furniture) : 0;
    const totalCost = price + (costs || 0) + works + furniture;

    // Owner's annual charges.
    const management = collected * pct(input.managementPct);
    const charges = {
      propertyTax: pos(input.propertyTax), coownership: pos(input.coownership), insurance: pos(input.insurance),
      management, maintenance: pos(input.maintenance),
      cleaning: mode === 'short' ? pos(input.cleaning) : 0, utilities: mode === 'short' ? pos(input.utilities) : 0
    };
    const chargesTotal = Object.values(charges).reduce((s, v) => s + v, 0);
    const netOperating = collected - chargesTotal;

    // Financing.
    let loan = null;
    if (input.financed) {
      if (!(num(input.ratePct) > 0 && num(input.ratePct) <= 15)) return { error: 'rate_required', partial: true };
      const deposit = pos(input.deposit);
      const amount = Math.max(0, totalCost - deposit);
      const p = credit.payment({ loan: amount, ratePct: input.ratePct, years: input.years, insurancePct: input.insurancePct });
      loan = {
        deposit: round(deposit), amount: round(amount), ratePct: Number(input.ratePct), years: Number(input.years),
        monthly: p.monthly, monthlyInsurance: p.monthlyInsurance, annual: p.monthly * 12,
        interestYear1: round(firstYearInterest(amount, input.ratePct, input.years)), totalInterest: p.interest
      };
    }
    const incomeTax = num(input.incomeTax);
    const cashflowAnnual = netOperating - (loan ? loan.annual : 0) - (incomeTax || 0);

    // Luxembourg: legal rent ceiling (unfurnished long-term let), recent purchase.
    let luCap = null;
    if (market === 'LU' && mode === 'long') {
      const capital = price + (costs || 0) + works;
      luCap = { monthly: round(capital * LU_RENT_CAP / 12), over: !input.furnished && num(input.rent) * 12 > capital * LU_RENT_CAP + 1e-9, furnished: !!input.furnished, notaryExcluded: true };
    }

    return {
      market, mode, price: round(price), costs, costsMissing: costs == null, notaryIncluded: c && !c.error ? c.notaryIncluded : true,
      works: round(works), furniture: round(furniture), totalCost: round(totalCost),
      grossAnnual: round(grossAnnual), collected: round(collected), charges, chargesTotal: round(chargesTotal), netOperating: round(netOperating),
      grossYield: grossAnnual / price, netYield: netOperating / totalCost,
      loan, incomeTax: incomeTax == null ? null : round(incomeTax),
      cashflowAnnual: round(cashflowAnnual), cashflowMonthly: round(cashflowAnnual / 12),
      returnOnDeposit: loan && loan.deposit > 0 ? cashflowAnnual / loan.deposit : null,
      luCap, dpe: DPE.includes(input.dpe) ? input.dpe : null
    };
  }

  /* France: what the energy rating means for letting, by mode. */
  function dpeStatus(dpe, mode) {
    if (!dpe) return null;
    if (mode === 'long') {
      if (dpe === 'G') return { level: 'block', key: 'G' };
      if (dpe === 'F') return { level: 'warn', key: 'F' };
      if (dpe === 'E') return { level: 'warn', key: 'E' };
      return null;
    }
    if (dpe === 'F' || dpe === 'G') return { level: 'warn', key: 'touristFG' };
    if (dpe === 'E') return { level: 'warn', key: 'touristE' };
    return null;
  }

  /* ---------------------------------------------------------------- copy */

  const COPY = Object.freeze({
    fr: Object.freeze({
      eyebrow: 'Simulateur de rentabilité locative',
      title: 'Ce bien est-il rentable ?',
      lead: 'Rendement brut et net, cash-flow et effort d’épargne d’un investissement locatif en France, en Belgique et au Luxembourg — avec vos propres chiffres.',
      modes: { long: 'Location longue durée', short: 'Location courte durée' },
      markets: { FR: 'France', BE: 'Belgique', LU: 'Luxembourg' },
      buyTitle: 'L’achat', rentTitle: 'Les loyers', chargesTitle: 'Les charges annuelles du propriétaire', financeTitle: 'Le financement',
      price: 'Prix d’achat (€)', works: 'Travaux (€)', furniture: 'Mobilier et équipement (€)',
      newBuild: 'Logement neuf (VEFA)', region: 'Région', regionPick: 'Choisissez…', regions: { WAL: 'Wallonie', VLG: 'Flandre', BRU: 'Bruxelles-Capitale' },
      dpeLabel: 'Classe DPE', dpeUnknown: 'Je ne sais pas',
      rent: 'Loyer mensuel hors charges (€)', furnished: 'Location meublée', vacancy: 'Vacance locative (mois par an)',
      nightly: 'Prix moyen par nuit (€)', occupancy: 'Taux d’occupation (% des nuits de l’année)', platform: 'Commission des plateformes (%)',
      cleaning: 'Ménage, linge et consommables (€ / an)', utilities: 'Énergie, internet, abonnements (€ / an)',
      propertyTax: { FR: 'Taxe foncière (€ / an)', BE: 'Précompte immobilier (€ / an)', LU: 'Impôt foncier (€ / an)' },
      coownership: 'Charges de copropriété non récupérables (€ / an)', insurance: { FR: 'Assurance propriétaire non occupant (€ / an)', BE: 'Assurance du propriétaire (€ / an)', LU: 'Assurance du propriétaire (€ / an)' },
      management: { long: 'Gestion locative (% des loyers encaissés)', short: 'Conciergerie (% des revenus encaissés)' },
      maintenance: 'Entretien et réparations (€ / an)', incomeTax: 'Impôt sur ces loyers (€ / an, facultatif)', incomeTaxHint: 'Votre estimation ou celle de votre comptable ; laissez vide pour un résultat avant impôt.',
      financed: 'Achat financé par un crédit', deposit: 'Apport (€)', years: 'Durée du prêt', yearsUnit: n => `${n} ans`,
      rate: 'Taux du crédit (% / an, hors assurance)', loanInsurance: 'Assurance emprunteur (% du capital / an, facultatif)',
      methodTitle: 'Comment ça marche',
      method: ['Indiquez le prix et le loyer (ou le prix par nuit et le taux d’occupation) : ce sont vos hypothèses, Z Find n’estime aucun loyer à votre place.',
        'Z Find calcule les frais d’achat selon les barèmes publics du pays (investissement locatif, sans abattement « résidence principale »).',
        'Ajoutez les charges et, si besoin, le crédit : vous obtenez le rendement brut, le rendement net et le cash-flow mensuel.'],
      need: { price_required: 'Indiquez le prix d’achat.', rent_required: 'Indiquez le loyer mensuel hors charges.', nightly_required: 'Indiquez le prix moyen par nuit.', occupancy_required: 'Indiquez le taux d’occupation.', rate_required: 'Indiquez le taux du crédit, ou décochez le financement.' },
      resultTitle: 'Rentabilité estimée',
      grossYield: 'Rendement brut', netYield: 'Rendement net de charges', cashflow: 'Cash-flow mensuel', beforeTax: 'avant impôt', afterTax: 'après votre impôt',
      perMonth: '/mois', perYear: '/an',
      rows: {
        price: 'Prix d’achat', costs: 'Frais d’achat estimés', notaryExcluded: '(hors honoraires du notaire)', works: 'Travaux', furniture: 'Mobilier et équipement', totalCost: 'Coût total de l’opération',
        grossLong: 'Loyers annuels (année pleine)', grossShort: 'Réservations annuelles attendues (avant commissions)', collectedLong: 'Loyers encaissés (après vacance)', collectedShort: 'Revenus encaissés (après commissions)',
        charges: 'Charges du propriétaire', netOperating: 'Résultat avant crédit et impôt',
        loan: 'Montant emprunté', loanMonthly: 'Mensualité du crédit (assurance comprise)', interestYear1: 'Intérêts de la 1re année', incomeTax: 'Impôt saisi',
        cashflowYear: 'Cash-flow annuel', returnOnDeposit: 'Rendement de l’apport (cash-flow ÷ apport)'
      },
      costsMissing: 'Choisissez la région pour calculer les frais d’achat.',
      negative: m => `Effort d’épargne : ${m} par mois à prévoir de votre poche.`,
      luCap: (v) => `Plafond légal indicatif du loyer (5 % du capital investi par an) : ${v} par mois.`,
      luCapOver: 'Le loyer saisi semble dépasser ce plafond : faites vérifier le calcul officiel (frais de notaire compris). Un loyer supérieur au plafond peut être réduit à la demande du locataire devant la commission des loyers.',
      luCapFurnished: 'En location meublée, un supplément pour le mobilier peut s’ajouter à ce plafond.',
      luCapNote: 'Calcul pour un achat récent : prix, droits d’enregistrement et travaux d’amélioration ; le calcul officiel ajoute les frais de notaire, réévalue le capital et applique une décote de vétusté.',
      dpe: {
        G: 'Logement classé G : il est considéré comme non décent et ne peut plus être loué en résidence principale (nouveau bail ou renouvellement) depuis le 1er janvier 2025.',
        F: 'Logement classé F : il ne pourra plus être loué en résidence principale à partir du 1er janvier 2028 (nouveau bail ou renouvellement). Prévoyez des travaux.',
        E: 'Logement classé E : il ne pourra plus être loué en résidence principale à partir du 1er janvier 2034.',
        touristFG: 'Meublé de tourisme classé F ou G : une nouvelle autorisation de changement d’usage exige un DPE entre A et E, et au 1er janvier 2034 tout meublé de tourisme (hors résidence principale) devra être classé entre A et D.',
        touristE: 'Meublé de tourisme classé E : au 1er janvier 2034, tout meublé de tourisme (hors résidence principale) devra être classé entre A et D.'
      },
      formulas: [
        'Rendement brut = loyers annuels (ou réservations annuelles) ÷ prix d’achat.',
        'Rendement net = (revenus encaissés − charges du propriétaire) ÷ coût total de l’opération.',
        'Cash-flow = revenus encaissés − charges − mensualités du crédit − impôt saisi. Le capital remboursé chaque mois est compté comme une dépense, alors qu’il augmente votre patrimoine.'
      ],
      rulesTitle: 'À savoir avant d’investir',
      rules: {
        FR: {
          long: [
            'Performance énergétique : depuis le 1er janvier 2025, un logement classé G au DPE ne peut plus être proposé à la location en résidence principale ; ce sera le cas des logements classés F au 1er janvier 2028, puis E au 1er janvier 2034. Le loyer d’un logement classé F ou G ne peut plus être augmenté depuis août 2022. Un projet de loi adopté par le Sénat en juillet 2026 pourrait permettre de relouer un logement F ou G contre un engagement de travaux ; il n’est pas encore définitif.',
            'Dans certaines villes, le loyer est plafonné (encadrement des loyers) et, en zone tendue, la hausse du loyer à la relocation est limitée.',
            'Fiscalité : location nue — revenus fonciers, micro-foncier avec abattement de 30 % si les loyers ne dépassent pas 15 000 € par an, sinon régime réel (charges et intérêts déductibles). Location meublée (LMNP) — micro-BIC avec abattement de 50 % jusqu’à 77 700 € de recettes, ou régime réel avec amortissement du bien ; depuis 2025, les amortissements déduits sont en principe réintégrés dans le calcul de la plus-value à la revente. Depuis 2026, le statut du bailleur privé (dispositif « Jeanbrun ») permet aussi d’amortir un logement loué nu, sous conditions (logement neuf ou ancien avec travaux importants, plafonds de loyer, engagement de location). S’y ajoutent les prélèvements sociaux.'
          ],
          short: [
            'Meublé de tourisme : enregistrement obligatoire sur le téléservice national depuis le 20 mai 2026, partout en France ; une résidence principale ne peut être louée plus de 120 jours par an (90 si la commune le décide) ; dans certaines communes, louer une résidence secondaire exige une autorisation de changement d’usage. Le règlement de copropriété peut aussi l’interdire.',
            'Performance énergétique : une nouvelle autorisation de changement d’usage exige un DPE entre A et E ; au 1er janvier 2034, tout meublé de tourisme (hors résidence principale) devra être classé entre A et D.',
            'Fiscalité (revenus 2025 et suivants) : micro-BIC avec abattement de 30 % jusqu’à 15 000 € de recettes pour un meublé de tourisme non classé, 50 % jusqu’à 77 700 € s’il est classé ; ou régime réel. S’y ajoutent les prélèvements sociaux. La taxe de séjour est payée par les voyageurs et reversée à la commune.'
          ]
        },
        BE: {
          long: [
            'Le bail de résidence principale doit être enregistré (gratuitement) ; la garantie locative est plafonnée selon la Région et sa forme (2 ou 3 mois de loyer).',
            'Selon la Région, des obligations de rénovation énergétique peuvent s’appliquer après l’achat : en Flandre, un logement acheté avec un label PEB E ou F doit atteindre au moins le label D dans les six ans.',
            'Fiscalité : un logement loué à un particulier qui y habite est en principe imposé sur son revenu cadastral indexé, majoré de 40 %, et non sur le loyer réel ; le précompte immobilier reste dû par le propriétaire.'
          ],
          short: [
            'Les hébergements touristiques doivent être déclarés ou enregistrés auprès de la Région, et certaines communes ajoutent leurs propres règles (autorisation, taxe).',
            'Fiscalité : l’imposition d’une location touristique dépend des services offerts et peut différer du régime du revenu cadastral ; faites-la vérifier par un comptable.'
          ]
        },
        LU: {
          long: [
            'Plafond légal : le loyer annuel d’un logement non meublé ne peut dépasser 5 % du capital investi (prix, frais d’acte et travaux d’amélioration, réévalués et décotés pour vétusté) ; en meublé, un supplément pour le mobilier est possible.',
            'Aucun crédit d’impôt « Bëllegen Akt » pour un achat destiné à la location : il est réservé à la résidence principale.',
            'Fiscalité : le loyer, diminué des intérêts d’emprunt, des frais et de l’amortissement, s’ajoute au revenu imposable au barème progressif. L’amortissement accéléré de 6 % réservé aux acquisitions de 2024 et du 1er semestre 2025 n’a pas été reconduit ; un nouveau régime (6 % pendant six ans, base jusqu’à 600 000 € par immeuble) a été annoncé en juillet 2026, sous réserve du vote de la loi.'
          ],
          short: [
            'Location touristique : renseignez-vous auprès de la commune sur les autorisations et les règles locales ; le règlement de copropriété peut l’interdire.',
            'Aucun crédit d’impôt « Bëllegen Akt » pour un achat destiné à la location.',
            'Fiscalité : les revenus, diminués des frais et de l’amortissement, s’ajoutent au revenu imposable au barème progressif.'
          ]
        }
      },
      warning: [
        'Simulation indicative fondée sur vos propres hypothèses. Elle ne constitue ni un conseil en investissement, ni un conseil fiscal, ni une offre de prêt. Les loyers, charges, règles locales et la fiscalité réels doivent être vérifiés auprès d’un professionnel (agence, notaire, comptable, banque ou courtier).',
        'Un crédit vous engage et doit être remboursé. Vérifiez vos capacités de remboursement avant de vous engager.'
      ],
      costsSource: 'Frais d’achat : barèmes publics 2026 pour un investissement locatif, estimation.',
      checked: 'Règles vérifiées en octobre 2026.'
    }),
    en: Object.freeze({
      eyebrow: 'Rental yield simulator',
      title: 'Is this property a good rental investment?',
      lead: 'Gross and net yield, cash flow and monthly top-up of a rental investment in France, Belgium and Luxembourg — with your own figures.',
      modes: { long: 'Long-term let', short: 'Short-term let' },
      markets: { FR: 'France', BE: 'Belgium', LU: 'Luxembourg' },
      buyTitle: 'The purchase', rentTitle: 'The rent', chargesTitle: 'Owner’s annual charges', financeTitle: 'Financing',
      price: 'Purchase price (€)', works: 'Works (€)', furniture: 'Furniture and equipment (€)',
      newBuild: 'New-build (off-plan)', region: 'Region', regionPick: 'Choose…', regions: { WAL: 'Wallonia', VLG: 'Flanders', BRU: 'Brussels-Capital' },
      dpeLabel: 'Energy rating (DPE)', dpeUnknown: 'I don’t know',
      rent: 'Monthly rent excluding charges (€)', furnished: 'Furnished let', vacancy: 'Vacancy (months per year)',
      nightly: 'Average price per night (€)', occupancy: 'Occupancy (% of the nights in the year)', platform: 'Platform commission (%)',
      cleaning: 'Cleaning, linen and supplies (€ / year)', utilities: 'Energy, internet, subscriptions (€ / year)',
      propertyTax: { FR: 'Property tax — taxe foncière (€ / year)', BE: 'Property tax — précompte immobilier (€ / year)', LU: 'Property tax — impôt foncier (€ / year)' },
      coownership: 'Non-recoverable service charges (€ / year)', insurance: { FR: 'Landlord insurance (€ / year)', BE: 'Landlord insurance (€ / year)', LU: 'Landlord insurance (€ / year)' },
      management: { long: 'Letting management (% of rent collected)', short: 'Concierge service (% of income collected)' },
      maintenance: 'Maintenance and repairs (€ / year)', incomeTax: 'Tax on this rent (€ / year, optional)', incomeTaxHint: 'Your own or your accountant’s estimate; leave empty for a pre-tax result.',
      financed: 'Purchase financed with a loan', deposit: 'Deposit (€)', years: 'Loan term', yearsUnit: n => `${n} years`,
      rate: 'Loan rate (% / year, excluding insurance)', loanInsurance: 'Borrower insurance (% of capital / year, optional)',
      methodTitle: 'How it works',
      method: ['Enter the price and the rent (or the price per night and the occupancy): these are your assumptions — Z Find never estimates a rent for you.',
        'Z Find computes the purchase costs on the country’s public scales (rental investment, no main-residence relief).',
        'Add the charges and, if needed, the loan: you get the gross yield, the net yield and the monthly cash flow.'],
      need: { price_required: 'Enter the purchase price.', rent_required: 'Enter the monthly rent excluding charges.', nightly_required: 'Enter the average price per night.', occupancy_required: 'Enter the occupancy rate.', rate_required: 'Enter the loan rate, or untick the financing.' },
      resultTitle: 'Estimated return',
      grossYield: 'Gross yield', netYield: 'Net yield after charges', cashflow: 'Monthly cash flow', beforeTax: 'before tax', afterTax: 'after your tax',
      perMonth: '/month', perYear: '/year',
      rows: {
        price: 'Purchase price', costs: 'Estimated purchase costs', notaryExcluded: '(notary fees not included)', works: 'Works', furniture: 'Furniture and equipment', totalCost: 'Total cost of the operation',
        grossLong: 'Annual rent (full year)', grossShort: 'Expected annual bookings (before commissions)', collectedLong: 'Rent collected (after vacancy)', collectedShort: 'Income collected (after commissions)',
        charges: 'Owner’s charges', netOperating: 'Result before loan and tax',
        loan: 'Loan amount', loanMonthly: 'Loan payment (insurance included)', interestYear1: 'Interest in year 1', incomeTax: 'Tax entered',
        cashflowYear: 'Annual cash flow', returnOnDeposit: 'Return on deposit (cash flow ÷ deposit)'
      },
      costsMissing: 'Choose the region to compute the purchase costs.',
      negative: m => `Monthly top-up: ${m} to pay from your own pocket.`,
      luCap: (v) => `Indicative legal rent ceiling (5% of the capital invested per year): ${v} per month.`,
      luCapOver: 'The rent entered seems to be above this ceiling: have the official calculation checked (notary fees included). A rent above the ceiling can be reduced at the tenant’s request by the rent commission.',
      luCapFurnished: 'For a furnished let, a supplement for the furniture may be added to this ceiling.',
      luCapNote: 'Computed for a recent purchase: price, registration duties and improvement works; the official calculation adds the notary fees, revalues the capital and deducts a wear-and-tear discount.',
      dpe: {
        G: 'Rated G: the home counts as substandard and can no longer be let as a main residence (new lease or renewal) since 1 January 2025.',
        F: 'Rated F: the home can no longer be let as a main residence from 1 January 2028 (new lease or renewal). Plan for works.',
        E: 'Rated E: the home can no longer be let as a main residence from 1 January 2034.',
        touristFG: 'Tourist let rated F or G: a new change-of-use authorisation requires a DPE between A and E, and from 1 January 2034 every tourist let (other than a main residence) must be rated A to D.',
        touristE: 'Tourist let rated E: from 1 January 2034 every tourist let (other than a main residence) must be rated A to D.'
      },
      formulas: [
        'Gross yield = annual rent (or annual bookings) ÷ purchase price.',
        'Net yield = (income collected − owner’s charges) ÷ total cost of the operation.',
        'Cash flow = income collected − charges − loan payments − tax entered. The capital repaid each month counts as an outflow, although it adds to your wealth.'
      ],
      rulesTitle: 'Good to know before investing',
      rules: {
        FR: {
          long: [
            'Energy performance: since 1 January 2025, a home rated G can no longer be let as a main residence; homes rated F follow on 1 January 2028, then E on 1 January 2034. The rent of a home rated F or G cannot be increased since August 2022. A bill passed by the Senate in July 2026 could allow F or G homes to be re-let against a commitment to works; it is not final yet.',
            'In some cities rents are capped (rent control) and, in high-demand areas, the rent increase between two tenants is limited.',
            'Tax: unfurnished let — property income, “micro-foncier” with a 30% flat allowance if rents do not exceed €15,000 a year, otherwise the actual-expenses regime (charges and interest deductible). Furnished let (LMNP) — “micro-BIC” with a 50% allowance up to €77,700 of receipts, or the actual regime with depreciation of the property; since 2025, the depreciation deducted is in principle added back when computing the capital gain on resale. Since 2026, the private landlord status (“Jeanbrun” scheme) also allows depreciation of an unfurnished let, under conditions (new home or older home with major works, rent caps, letting commitment). Social levies come on top.'
          ],
          short: [
            'Tourist let: registration on the national online service is compulsory throughout France since 20 May 2026; a main residence cannot be let for more than 120 days a year (90 if the municipality so decides); in some municipalities, letting a second home requires a change-of-use authorisation. The building’s co-ownership rules may also forbid it.',
            'Energy performance: a new change-of-use authorisation requires a DPE between A and E; from 1 January 2034, every tourist let (other than a main residence) must be rated A to D.',
            'Tax (2025 income onwards): “micro-BIC” with a 30% allowance up to €15,000 of receipts for an unclassified tourist let, 50% up to €77,700 if classified; or the actual regime. Social levies come on top. The tourist tax is paid by guests and passed on to the municipality.'
          ]
        },
        BE: {
          long: [
            'A main-residence lease must be registered (free of charge); the rental deposit is capped depending on the Region and its form (2 or 3 months of rent).',
            'Depending on the Region, energy renovation obligations may apply after the purchase: in Flanders, a home bought with EPC label E or F must reach at least label D within six years.',
            'Tax: a home let to a private person who lives in it is in principle taxed on its indexed cadastral income plus 40%, not on the actual rent; the owner still pays the property tax (précompte immobilier).'
          ],
          short: [
            'Tourist accommodation must be declared or registered with the Region, and some municipalities add their own rules (permit, tax).',
            'Tax: the taxation of a tourist let depends on the services offered and may differ from the cadastral-income regime; have it checked by an accountant.'
          ]
        },
        LU: {
          long: [
            'Legal ceiling: the annual rent of an unfurnished home cannot exceed 5% of the capital invested (price, deed costs and improvement works, revalued and discounted for wear and tear); for a furnished let, a furniture supplement is possible.',
            'No “Bëllegen Akt” tax credit for a purchase intended for letting: it is reserved for the main residence.',
            'Tax: the rent, less loan interest, expenses and depreciation, is added to taxable income at the progressive rate. The 6% accelerated depreciation reserved for purchases in 2024 and the first half of 2025 was not renewed; a new regime (6% for six years, base up to €600,000 per building) was announced in July 2026, subject to the law being voted.'
          ],
          short: [
            'Tourist let: check authorisations and local rules with the municipality; the co-ownership rules may forbid it.',
            'No “Bëllegen Akt” tax credit for a purchase intended for letting.',
            'Tax: the income, less expenses and depreciation, is added to taxable income at the progressive rate.'
          ]
        }
      },
      warning: [
        'Indicative simulation based on your own assumptions. It is neither investment advice, nor tax advice, nor a loan offer. The actual rent, charges, local rules and taxation must be checked with a professional (agency, notary, accountant, bank or broker).',
        'A loan is a commitment and must be repaid. Check that you can afford the repayments before committing.'
      ],
      costsSource: 'Purchase costs: 2026 public scales for a rental investment, estimate.',
      checked: 'Rules checked in October 2026.'
    })
  });

  function copyFor(lang) { return COPY[lang] || COPY.en; }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function locale(lang) { return lang === 'fr' ? 'fr-FR' : 'en-IE'; }
  function money(v, lang) {
    const n = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(Math.abs(v));
    const sign = v < 0 ? '− ' : '';
    return lang === 'fr' ? `${sign}${n} €` : `${sign}€${n}`;
  }
  function pctLabel(v, lang) {
    return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v * 100) + (lang === 'fr' ? ' %' : '%');
  }

  function normalise(query) {
    const q = query || {};
    const market = MARKETS.includes(String(q.market || '').toUpperCase()) ? String(q.market).toUpperCase() : 'FR';
    const mode = MODES.includes(q.mode) ? q.mode : 'long';
    const price = Number(q.price) > 0 ? Math.round(Number(q.price)) : null;
    return { market, mode, price };
  }

  /* ---------------------------------------------------------------- page */

  function field(key, label, attrs, value, hint) {
    return `<div class="est-field"><label for="ry-${key}">${esc(label)}</label><input id="ry-${key}" type="number" data-ry="${key}" value="${value == null ? '' : value}" ${attrs}>${hint ? `<p class="credit-rate-hint">${esc(hint)}</p>` : ''}</div>`;
  }
  const EUR = 'inputmode="numeric" min="0" step="100"';
  const PCT = 'inputmode="decimal" min="0" max="100" step="0.1"';

  function pageHTML(lang, query, today) {
    const c = copyFor(lang);
    const q = normalise(query);
    const years = 20;
    const ref = rates.reference(q.market, years, today);
    const link = (market, mode) => `#/${lang}/yield?market=${market}&mode=${mode}${q.price ? `&price=${q.price}` : ''}`;
    const opt = (v, label, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
    const costsOptions = q.market === 'FR'
      ? `<div class="est-row"><div class="est-field"><label for="ry-dpe">${esc(c.dpeLabel)}</label><select id="ry-dpe" data-ry="dpe">${opt('', c.dpeUnknown, true)}${DPE.map(d => opt(d, d, false)).join('')}</select></div>
          <label class="est-check est-lift"><input type="checkbox" data-ry="newBuild"> ${esc(c.newBuild)}</label></div>`
      : q.market === 'BE'
        ? `<div class="est-field"><label for="ry-region">${esc(c.region)}</label><select id="ry-region" data-ry="region">${opt('', c.regionPick, true)}${['WAL', 'VLG', 'BRU'].map(r => opt(r, c.regions[r], false)).join('')}</select></div>`
        : '';
    const rentFields = q.mode === 'long'
      ? `<div class="est-row">${field('rent', c.rent, EUR)}${field('vacancy', c.vacancy, 'inputmode="decimal" min="0" max="12" step="0.5"', 1)}</div>
         <label class="est-check"><input type="checkbox" data-ry="furnished"> ${esc(c.furnished)}</label>`
      : `<div class="est-row">${field('nightly', c.nightly, 'inputmode="numeric" min="0" step="5"')}${field('occupancy', c.occupancy, PCT)}</div>
         <div class="est-row">${field('platform', c.platform, PCT)}${field('cleaning', c.cleaning, EUR)}</div>
         ${field('utilities', c.utilities, EUR)}`;
    return `
      <div class="wrap est-page credit-page yield-page" data-yield-page data-market="${q.market}" data-mode="${q.mode}">
        <div class="est-head">
          <p class="eyebrow">${esc(c.eyebrow)}</p>
          <h1>${esc(c.title)}</h1>
          <p class="est-lead">${esc(c.lead)}</p>
          <div class="est-switches">
            <nav class="est-modes" aria-label="${esc(c.eyebrow)}">${MODES.map(m => `<a href="${link(q.market, m)}"${m === q.mode ? ' class="active" aria-current="page"' : ''}>${esc(c.modes[m])}</a>`).join('')}</nav>
            <nav class="est-markets">${MARKETS.map(m => `<a href="${link(m, q.mode)}"${m === q.market ? ' class="active" aria-current="page"' : ''}>${esc(c.markets[m])}</a>`).join('')}</nav>
          </div>
        </div>
        <div class="est-grid">
          <div class="est-col est-col-inputs">
            <form class="est-form" data-yield-form novalidate>
              <fieldset class="yield-group"><legend>${esc(c.buyTitle)}</legend>
                <div class="est-row">${field('price', c.price, 'inputmode="numeric" min="10000" step="1000"', q.price)}${field('works', c.works, EUR)}</div>
                <div data-ry-furniture${q.mode === 'long' ? ' hidden' : ''}>${field('furniture', c.furniture, EUR)}</div>
                ${costsOptions}
              </fieldset>
              <fieldset class="yield-group"><legend>${esc(c.rentTitle)}</legend>${rentFields}</fieldset>
              <fieldset class="yield-group"><legend>${esc(c.chargesTitle)}</legend>
                <div class="est-row">${field('propertyTax', c.propertyTax[q.market], EUR)}${field('coownership', c.coownership, EUR)}</div>
                <div class="est-row">${field('insurance', c.insurance[q.market], EUR)}${field('maintenance', c.maintenance, EUR)}</div>
                <div class="est-row">${field('management', c.management[q.mode], PCT)}${field('incomeTax', c.incomeTax, EUR)}</div>
                <p class="credit-rate-hint">${esc(c.incomeTaxHint)}</p>
              </fieldset>
              <fieldset class="yield-group"><legend>${esc(c.financeTitle)}</legend>
                <label class="est-check"><input type="checkbox" data-ry="financed"> ${esc(c.financed)}</label>
                <div data-ry-loan hidden>
                  <div class="est-row">${field('deposit', c.deposit, 'inputmode="numeric" min="0" step="1000"')}<div class="est-field"><label for="ry-years">${esc(c.years)}</label><select id="ry-years" data-ry="years">${DURATIONS[q.market].map(y => opt(y, c.yearsUnit(y), y === years)).join('')}</select></div></div>
                  <div class="est-row"><div class="est-field credit-rate"><label for="ry-rate">${esc(c.rate)}</label><input id="ry-rate" type="number" inputmode="decimal" min="0.1" max="15" step="0.01" data-ry="rate" value="${ref ? ref.ratePct : ''}"></div>${field('loanInsurance', c.loanInsurance, 'inputmode="decimal" min="0" max="2" step="0.01"')}</div>
                  <p class="credit-rate-hint" data-ry-rate-hint>${credit.rateHintHTML(lang, q.market, years, today, false)}</p>
                </div>
              </fieldset>
            </form>
          </div>
          <div class="est-col est-col-output">
            <section class="est-result credit-result yield-result" data-yield-result aria-live="polite"></section>
          </div>
        </div>
        <section class="credit-warning" data-yield-rules>
          <h2>${esc(c.rulesTitle)} — ${esc(c.markets[q.market])}</h2>
          ${c.rules[q.market][q.mode].map(r => `<p>${esc(r)}</p>`).join('')}
          ${c.warning.map(w => `<p>${esc(w)}</p>`).join('')}
          <p class="est-muted">${esc(c.costsSource)} ${esc(c.checked)}</p>
        </section>
      </div>`;
  }

  function row(label, value, cls) {
    return `<li${cls ? ` class="${cls}"` : ''}><span>${label}</span><strong>${value}</strong></li>`;
  }

  function methodHTML(lang, need) {
    const c = copyFor(lang);
    return `<h2 class="est-report-title">${esc(c.methodTitle)}</h2>
      <ol class="est-steps">${c.method.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      ${need ? `<p class="credit-prompt" data-yield-prompt>${esc(c.need[need])}</p>` : ''}
      <ul class="yield-formulas">${c.formulas.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`;
  }

  function resultHTML(lang, r) {
    const c = copyFor(lang);
    if (r.error) return methodHTML(lang, r.error);
    const m = v => esc(money(v, lang));
    const R = c.rows;
    const taxLabel = r.incomeTax == null ? c.beforeTax : c.afterTax;
    const dpe = r.market === 'FR' ? dpeStatus(r.dpe, r.mode) : null;
    const rows = [
      row(esc(R.price), m(r.price)),
      r.costs != null ? row(esc(R.costs) + (r.notaryIncluded ? '' : ' ' + esc(R.notaryExcluded)), m(r.costs)) : '',
      r.works ? row(esc(R.works), m(r.works)) : '',
      r.furniture ? row(esc(R.furniture), m(r.furniture)) : '',
      row(esc(R.totalCost), m(r.totalCost), 'credit-key'),
      row(esc(r.mode === 'long' ? R.grossLong : R.grossShort), m(r.grossAnnual)),
      row(esc(r.mode === 'long' ? R.collectedLong : R.collectedShort), m(r.collected)),
      row(esc(R.charges), '− ' + m(r.chargesTotal)),
      row(esc(R.netOperating), m(r.netOperating)),
      r.loan ? row(esc(R.loan), m(r.loan.amount)) : '',
      r.loan ? row(esc(R.loanMonthly), m(r.loan.monthly) + esc(c.perMonth)) : '',
      r.loan ? row(esc(R.interestYear1), m(r.loan.interestYear1)) : '',
      r.incomeTax != null ? row(esc(R.incomeTax), '− ' + m(r.incomeTax)) : '',
      row(esc(R.cashflowYear), m(r.cashflowAnnual), 'credit-key'),
      r.returnOnDeposit != null ? row(esc(R.returnOnDeposit), esc(pctLabel(r.returnOnDeposit, lang))) : ''
    ].join('');
    const lu = r.luCap
      ? `<div class="yield-note${r.luCap.over ? ' yield-note-alert' : ''}" data-yield-lu-cap><p>${esc(c.luCap(money(r.luCap.monthly, lang)))}</p>
          ${r.luCap.over ? `<p><strong>${esc(c.luCapOver)}</strong></p>` : ''}${r.luCap.furnished ? `<p>${esc(c.luCapFurnished)}</p>` : ''}<p class="est-muted">${esc(c.luCapNote)}</p></div>`
      : '';
    return `<h2 class="est-report-title">${esc(c.resultTitle)}</h2>
      ${dpe ? `<div class="yield-note${dpe.level === 'block' ? ' yield-note-alert' : ''}" data-yield-dpe="${dpe.key}"><p><strong>${esc(c.dpe[dpe.key])}</strong></p></div>` : ''}
      <div class="yield-kpis">
        <div class="yield-kpi"><span>${esc(c.grossYield)}</span><strong data-yield-gross>${esc(pctLabel(r.grossYield, lang))}</strong></div>
        <div class="yield-kpi"><span>${esc(c.netYield)}</span><strong data-yield-net>${esc(pctLabel(r.netYield, lang))}</strong></div>
        <div class="yield-kpi${r.cashflowMonthly < 0 ? ' yield-kpi-neg' : ''}"><span>${esc(c.cashflow)} <em>${esc(taxLabel)}</em></span><strong data-yield-cashflow>${m(r.cashflowMonthly)}<small>${esc(c.perMonth)}</small></strong></div>
      </div>
      ${r.cashflowMonthly < 0 ? `<p class="est-muted"><strong>${esc(c.negative(money(-r.cashflowMonthly, lang)))}</strong></p>` : ''}
      <ul class="est-adj">${rows}</ul>
      ${r.costsMissing ? `<p class="est-error">${esc(c.costsMissing)}</p>` : ''}
      ${lu}
      <ul class="yield-formulas">${c.formulas.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      ${r.loan ? `<p class="est-muted credit-short-warning">${esc(c.warning[1])}</p>` : ''}`;
  }

  function readForm(form, q) {
    const el = k => form.querySelector(`[data-ry="${k}"]`);
    const v = k => (el(k) ? String(el(k).value).replace(',', '.') : '');
    const on = k => !!(el(k) && el(k).checked);
    return {
      market: q.market, mode: q.mode, price: v('price'), works: v('works'), furniture: v('furniture'), furnished: on('furnished'),
      costs: { newBuild: on('newBuild'), region: v('region') || undefined }, dpe: v('dpe') || null,
      rent: v('rent'), vacancyMonths: v('vacancy'), nightly: v('nightly'), occupancyPct: v('occupancy'), platformPct: v('platform'),
      cleaning: v('cleaning'), utilities: v('utilities'), propertyTax: v('propertyTax'), coownership: v('coownership'), insurance: v('insurance'),
      managementPct: v('management'), maintenance: v('maintenance'), incomeTax: v('incomeTax'),
      financed: on('financed'), deposit: v('deposit'), ratePct: v('rate'), years: Number(v('years')) || 20, insurancePct: v('loanInsurance')
    };
  }

  function render(rootEl, lang, query, options) {
    if (!rootEl) return false;
    const today = options && options.today ? options.today : new Date();
    const q = normalise(query);
    rootEl.innerHTML = pageHTML(lang, q, today);
    const form = rootEl.querySelector('[data-yield-form]');
    const out = rootEl.querySelector('[data-yield-result]');
    const rateInput = form.querySelector('[data-ry="rate"]');
    const yearsSelect = form.querySelector('[data-ry="years"]');
    const hint = form.querySelector('[data-ry-rate-hint]');
    let edited = false;

    function sync() {
      const furnished = q.mode === 'short' || !!(form.querySelector('[data-ry="furnished"]') || {}).checked;
      form.querySelector('[data-ry-furniture]').hidden = !furnished;
      form.querySelector('[data-ry-loan]').hidden = !form.querySelector('[data-ry="financed"]').checked;
    }
    function update() { sync(); out.innerHTML = resultHTML(lang, compute(readForm(form, q))); }

    form.addEventListener('submit', e => { e.preventDefault(); update(); });
    form.addEventListener('input', e => {
      if (e.target === rateInput) {
        const ref = rates.reference(q.market, yearsSelect.value, today);
        edited = rateInput.value !== '' && !(ref && Number(rateInput.value) === ref.ratePct);
        hint.innerHTML = credit.rateHintHTML(lang, q.market, yearsSelect.value, today, edited);
      }
      update();
    });
    form.addEventListener('change', e => {
      if (e.target === yearsSelect && !edited) {
        const ref = rates.reference(q.market, yearsSelect.value, today);
        rateInput.value = ref ? String(ref.ratePct) : '';
        hint.innerHTML = credit.rateHintHTML(lang, q.market, yearsSelect.value, today, false);
      }
      update();
    });
    hint.addEventListener('click', e => {
      if (!e.target.closest('[data-credit-rate-reset]')) return;
      edited = false;
      const ref = rates.reference(q.market, yearsSelect.value, today);
      rateInput.value = ref ? String(ref.ratePct) : '';
      hint.innerHTML = credit.rateHintHTML(lang, q.market, yearsSelect.value, today, false);
      update();
    });
    update();
    return true;
  }

  return Object.freeze({
    MARKETS, MODES, DPE, LU_RENT_CAP, COPY,
    compute, dpeStatus, firstYearInterest, pageHTML, resultHTML, render, normalise,
    _internals: Object.freeze({ money, pctLabel })
  });
});
