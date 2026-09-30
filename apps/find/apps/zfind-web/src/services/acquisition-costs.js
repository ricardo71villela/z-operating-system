/* ============================================================
   Z FIND — ACQUISITION COSTS AND MONTHLY PAYMENT (FR / BE / LU)

   Rules-based estimates of what a buyer pays on top of the price, and of
   the monthly loan payment. Public rates only, never a valuation.

   France (2026)
     Existing home ("ancien"): droits de mutation 6.31825 % (the ~80+
     departments that raised their share to 5 % in 2025) or 5.80665 %
     for a first-time buyer of a main residence (exempt from the raise),
     notary emoluments on the official scale (3.870 % / 1.596 % / 1.064 %
     / 0.799 %, + 20 % VAT), contribution de sécurité immobilière 0.1 %,
     ~1 200 € of disbursements.
     New home ("neuf", VEFA): taxe de publicité foncière 0.715 % instead of
     the transfer duties; same emoluments, CSI and disbursements.
   Belgium (2026) — registration duties by region
     Wallonia 3 % for the buyer's sole own home, otherwise 12.5 %;
     Flanders 2 % for the sole own home, otherwise 12 %;
     Brussels 12.5 % after a 200 000 € allowance for an own home priced
     up to 600 000 €. Notary fees on the official scale (4.56 % … 0.057 %,
     + 21 % VAT) and ~1 200 € of administrative costs.
   Luxembourg (2026)
     Registration 6 % + transcription 1 % = 7 %; "Bëllegen Akt" tax credit
     of up to 30 000 € per buyer for a main residence. Notary fees are not
     included (shown as such).

   Sources: notaires / service-public (France, 2025 DMTO reform),
   housing-service.be (June 2026, regional duties and notary scale),
   guichet.public.lu (Bëllegen Akt). Every result says it is an estimate.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.acquisitionCosts = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const FR = Object.freeze({
    DMTO_STANDARD: 0.0631825,
    DMTO_FIRST_BUYER: 0.0580665,
    NEW_BUILD_TAX: 0.00715,
    EMOLUMENT_SCALE: [[6500, 0.0387], [17000, 0.01596], [60000, 0.01064], [Infinity, 0.00799]],
    VAT: 0.20,
    CSI: 0.001,
    DISBURSEMENTS: 1200
  });
  const BE = Object.freeze({
    REGIONS: Object.freeze({
      WAL: { ownHome: 0.03, other: 0.125 },
      VLG: { ownHome: 0.02, other: 0.12 },
      BRU: { ownHome: 0.125, other: 0.125, allowance: 200000, allowanceCeiling: 600000 }
    }),
    NOTARY_SCALE: [[7500, 0.0456], [17500, 0.0285], [30000, 0.0228], [45500, 0.0171], [64100, 0.0114], [250100, 0.0057], [Infinity, 0.00057]],
    VAT: 0.21,
    ADMIN: 1200
  });
  const LU = Object.freeze({ DUTIES: 0.07, CREDIT_PER_BUYER: 30000 });

  const round = v => Math.round(v);

  function scale(price, brackets) {
    let total = 0;
    let lower = 0;
    for (const [upper, rate] of brackets) {
      if (price <= lower) break;
      total += (Math.min(price, upper) - lower) * rate;
      lower = upper;
    }
    return total;
  }

  /* REFNIS commune code → Belgian region (Brussels 21xxx; Flemish
     provinces 1, 23-24, 3, 4, 7; Walloon provinces 25, 5, 6, 8, 9). */
  function belgianRegionFromRefnis(code) {
    const c = String(code || '');
    if (!/^\d{5}$/.test(c)) return null;
    if (c.startsWith('21')) return 'BRU';
    if (c.startsWith('23') || c.startsWith('24') || /^[1347]/.test(c)) return 'VLG';
    if (c.startsWith('25') || /^[5689]/.test(c)) return 'WAL';
    return null;
  }

  /* input: { country, price, newBuild, firstBuyer, region, ownHome, buyers } */
  function estimate(input) {
    const price = Number(input && input.price);
    if (!Number.isFinite(price) || price <= 0) return { error: 'invalid_price' };
    const country = input.country;
    const lines = [];
    if (country === 'FR') {
      const duties = input.newBuild ? price * FR.NEW_BUILD_TAX : price * (input.firstBuyer ? FR.DMTO_FIRST_BUYER : FR.DMTO_STANDARD);
      const emoluments = scale(price, FR.EMOLUMENT_SCALE) * (1 + FR.VAT);
      lines.push({ key: input.newBuild ? 'publicityTax' : 'transferDuties', amount: round(duties) });
      lines.push({ key: 'notaryFees', amount: round(emoluments) });
      lines.push({ key: 'securityContribution', amount: round(price * FR.CSI) });
      lines.push({ key: 'disbursements', amount: FR.DISBURSEMENTS });
    } else if (country === 'BE') {
      const rules = BE.REGIONS[input.region];
      if (!rules) return { error: 'region_required' };
      let base = price;
      if (input.region === 'BRU' && input.ownHome && price <= rules.allowanceCeiling) base = Math.max(0, price - rules.allowance);
      const rate = input.ownHome ? rules.ownHome : rules.other;
      lines.push({ key: 'registrationDuties', amount: round(base * rate), rate });
      lines.push({ key: 'notaryFees', amount: round(scale(price, BE.NOTARY_SCALE) * (1 + BE.VAT)) });
      lines.push({ key: 'adminCosts', amount: BE.ADMIN });
    } else if (country === 'LU') {
      const duties = price * LU.DUTIES;
      const buyers = Math.min(2, Math.max(1, Number(input.buyers) || 1));
      const credit = input.ownHome ? Math.min(duties, LU.CREDIT_PER_BUYER * buyers) : 0;
      lines.push({ key: 'registrationDuties', amount: round(duties) });
      if (credit) lines.push({ key: 'taxCredit', amount: -round(credit) });
    } else {
      return { error: 'unsupported_country' };
    }
    const costs = lines.reduce((sum, line) => sum + line.amount, 0);
    return {
      country,
      price: round(price),
      lines,
      costs: round(costs),
      costsRate: costs / price,
      total: round(price + costs),
      notaryIncluded: country !== 'LU'
    };
  }

  /* Monthly payment of a fixed-rate loan (annual nominal rate in %, years). */
  function monthlyPayment(principal, annualRatePct, years) {
    const p = Number(principal), n = Math.round(Number(years) * 12), r = Number(annualRatePct) / 100 / 12;
    if (!(p > 0) || !(n > 0) || !(r >= 0)) return 0;
    if (r === 0) return p / n;
    return p * r / (1 - Math.pow(1 + r, -n));
  }

  function financing(input) {
    const costs = estimate(input);
    if (costs.error) return costs;
    const deposit = Math.max(0, Number(input.deposit) || 0);
    const loan = Math.max(0, costs.total - deposit);
    const monthly = monthlyPayment(loan, input.ratePct, input.years);
    return Object.assign({}, costs, {
      deposit: round(deposit),
      loan: round(loan),
      ratePct: Number(input.ratePct),
      years: Number(input.years),
      monthly: round(monthly),
      interest: round(monthly * Math.round(Number(input.years) * 12) - loan)
    });
  }

  const COPY = Object.freeze({
    fr: Object.freeze({
      title: 'Financement et frais d’achat',
      deposit: 'Apport', rate: 'Taux du crédit (%)', years: 'Durée (ans)',
      newBuild: 'Logement neuf (VEFA)', firstBuyer: 'Premier achat de résidence principale',
      region: 'Région', regions: { WAL: 'Wallonie', VLG: 'Flandre', BRU: 'Bruxelles-Capitale' },
      ownHome: { BE: 'Habitation propre et unique', LU: 'Résidence principale' },
      buyers: 'Acheteurs', buyersOptions: { 1: '1 personne', 2: '2 personnes' },
      lines: {
        transferDuties: 'Droits de mutation', publicityTax: 'Taxe de publicité foncière', notaryFees: 'Émoluments / honoraires du notaire',
        securityContribution: 'Contribution de sécurité immobilière', disbursements: 'Débours et formalités (estimation)',
        registrationDuties: 'Droits d’enregistrement', adminCosts: 'Frais administratifs (estimation)', taxCredit: 'Crédit d’impôt « Bëllegen Akt »'
      },
      costs: 'Frais d’achat estimés', total: 'Coût total du projet', loan: 'Montant emprunté', monthly: 'Mensualité estimée',
      perMonth: '/mois', notaryExcluded: 'Hors honoraires du notaire.',
      note: 'Estimation indicative sur les barèmes publics 2026, hors assurance et frais de garantie. Le notaire confirme le montant exact.'
    }),
    en: Object.freeze({
      title: 'Financing and purchase costs',
      deposit: 'Deposit', rate: 'Loan rate (%)', years: 'Term (years)',
      newBuild: 'New-build (off-plan)', firstBuyer: 'First purchase of a main residence',
      region: 'Region', regions: { WAL: 'Wallonia', VLG: 'Flanders', BRU: 'Brussels-Capital' },
      ownHome: { BE: 'Sole own home', LU: 'Main residence' },
      buyers: 'Buyers', buyersOptions: { 1: '1 person', 2: '2 people' },
      lines: {
        transferDuties: 'Transfer duties', publicityTax: 'Land registration tax', notaryFees: 'Notary fees',
        securityContribution: 'Land registry contribution', disbursements: 'Disbursements (estimate)',
        registrationDuties: 'Registration duties', adminCosts: 'Administrative costs (estimate)', taxCredit: '“Bëllegen Akt” tax credit'
      },
      costs: 'Estimated purchase costs', total: 'Total project cost', loan: 'Loan amount', monthly: 'Estimated monthly payment',
      perMonth: '/month', notaryExcluded: 'Notary fees not included.',
      note: 'Indicative estimate on the 2026 public scales, excluding insurance and guarantee costs. The notary confirms the exact amount.'
    })
  });

  return Object.freeze({ estimate, financing, monthlyPayment, belgianRegionFromRefnis, COPY, _internals: Object.freeze({ scale, FR, BE, LU }) });
});
