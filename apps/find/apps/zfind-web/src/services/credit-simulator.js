/* ============================================================
   Z FIND — MORTGAGE SIMULATOR (#/{lang}/simulator?market=FR&mode=capacity)

   Two tools on one page, for France, Belgium and Luxembourg:
     capacity  "Ma capacité d'emprunt" — how much can be borrowed from the
               household income, and the property price it allows once
               the purchase costs are paid (acquisition-costs.js)
     payment   "Mensualités d'un projet" — monthly payment, loan amount
               and effort rate for a given price

   Safeguards:
   - The interest rate is prefilled ONLY with an official average rate
     that is still valid (credit-rates.js: source, month, expiry date).
     When there is none, the field stays empty and the visitor types the
     rate offered by their bank or broker. The source and month of the
     rate are always written under the field.
   - Every result carries the warning that this is not a loan offer nor
     advice, and does not replace a bank or a credit broker.
   - Arithmetic only: fixed-rate amortising loan, constant payments,
     optional borrower insurance as a % of the capital per year.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./credit-rates'), require('./acquisition-costs'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.creditSimulator = factory(root.ZFindServices.creditRates, root.ZFindServices.acquisitionCosts);
  }
})(typeof window !== 'undefined' ? window : this, function (rates, acquisition) {
  'use strict';

  const MARKETS = Object.freeze(['FR', 'BE', 'LU']);
  const MODES = Object.freeze(['capacity', 'payment']);

  /* France: HCSF rule (effort rate 35 % insurance included, 25 years).
     Belgium / Luxembourg: no legal effort-rate cap; 35 % is a common
     starting point that the visitor can change. */
  const RULES = Object.freeze({
    FR: Object.freeze({ durations: [10, 15, 20, 25], defaultYears: 25, defaultRatio: 35, legalRatio: 35 }),
    BE: Object.freeze({ durations: [10, 15, 20, 25, 30], defaultYears: 25, defaultRatio: 35, legalRatio: null }),
    LU: Object.freeze({ durations: [10, 15, 20, 25, 30], defaultYears: 25, defaultRatio: 35, legalRatio: null })
  });

  const round = v => Math.round(v);

  /* Monthly payment for 1 € borrowed (fixed rate, constant payments). */
  function annuityFactor(ratePct, years) {
    const n = Math.round(Number(years) * 12), r = Number(ratePct) / 100 / 12;
    if (!(n > 0) || !(r >= 0)) return 0;
    if (r === 0) return 1 / n;
    return r / (1 - Math.pow(1 + r, -n));
  }

  function validRate(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 15;
  }

  /* input: { loan, ratePct, years, insurancePct } */
  function payment(input) {
    const loan = Math.max(0, Number(input.loan) || 0);
    if (!validRate(input.ratePct)) return { error: 'rate_required' };
    const years = Number(input.years);
    if (!(years > 0)) return { error: 'years_required' };
    const ins = Math.max(0, Number(input.insurancePct) || 0);
    const months = Math.round(years * 12);
    const monthlyLoan = loan * annuityFactor(input.ratePct, years);
    const monthlyInsurance = loan * ins / 100 / 12;
    return {
      loan: round(loan), ratePct: Number(input.ratePct), years, insurancePct: ins,
      monthlyLoan: round(monthlyLoan), monthlyInsurance: round(monthlyInsurance), monthly: round(monthlyLoan + monthlyInsurance),
      interest: round(monthlyLoan * months - loan), insurance: round(monthlyInsurance * months)
    };
  }

  function costsFor(costsInput, price) {
    if (!acquisition || !(price > 0)) return null;
    const r = acquisition.estimate(Object.assign({}, costsInput, { price }));
    return r && !r.error ? r : null;
  }

  /* Highest price such that price + purchase costs <= budget. */
  function maxPriceFor(budget, costsInput) {
    if (!(budget > 0) || !costsFor(costsInput, budget)) return null;
    let lo = 0, hi = budget;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const c = costsFor(costsInput, mid);
      if (mid + c.costs <= budget) lo = mid; else hi = mid;
    }
    const price = Math.floor(lo / 1000) * 1000;
    const c = costsFor(costsInput, price);
    return c ? { price, costs: c.costs, notaryIncluded: c.notaryIncluded } : null;
  }

  /* input: { market, income, otherLoans, ratioPct, deposit, ratePct, years, insurancePct, costs: {…acquisition options} } */
  function capacity(input) {
    const income = Number(input.income);
    if (!(income > 0)) return { error: 'income_required' };
    if (!validRate(input.ratePct)) return { error: 'rate_required' };
    const years = Number(input.years);
    const ratio = Math.min(60, Math.max(1, Number(input.ratioPct) || 35));
    const ins = Math.max(0, Number(input.insurancePct) || 0);
    const maxMonthly = Math.max(0, income * ratio / 100 - Math.max(0, Number(input.otherLoans) || 0));
    const perEuro = annuityFactor(input.ratePct, years) + ins / 100 / 12;
    const maxLoan = perEuro > 0 ? Math.floor(maxMonthly / perEuro / 1000) * 1000 : 0;
    const deposit = Math.max(0, Number(input.deposit) || 0);
    const budget = maxLoan + deposit;
    const pay = payment({ loan: maxLoan, ratePct: input.ratePct, years, insurancePct: ins });
    const costsInput = Object.assign({ country: input.market }, input.costs || {});
    const priced = maxPriceFor(budget, costsInput);
    return {
      market: input.market, ratioPct: ratio, maxMonthly: round(maxMonthly), maxLoan, deposit: round(deposit), budget: round(budget),
      maxPrice: priced ? priced.price : null, costs: priced ? priced.costs : null, notaryIncluded: priced ? priced.notaryIncluded : true,
      costsMissing: !priced && budget > 0, monthly: pay.monthly, interest: pay.interest, insurance: pay.insurance,
      ltv: priced && priced.price > 0 ? maxLoan / priced.price : null
    };
  }

  /* input: { market, price, deposit, income, ratioPct, ratePct, years, insurancePct, costs } */
  function project(input) {
    const price = Number(input.price);
    if (!(price > 0)) return { error: 'price_required' };
    if (!validRate(input.ratePct)) return { error: 'rate_required' };
    const c = costsFor(Object.assign({ country: input.market }, input.costs || {}), price);
    const costs = c ? c.costs : null;
    const deposit = Math.max(0, Number(input.deposit) || 0);
    const loan = Math.max(0, price + (costs || 0) - deposit);
    const pay = payment({ loan, ratePct: input.ratePct, years: input.years, insurancePct: input.insurancePct });
    const income = Number(input.income);
    const ratio = Number(input.ratioPct) || 35;
    const effort = income > 0 ? (pay.monthly + Math.max(0, Number(input.otherLoans) || 0)) / income : null;
    return Object.assign({}, pay, {
      market: input.market, price: round(price), costs, costsMissing: !c, notaryIncluded: c ? c.notaryIncluded : true, deposit: round(deposit),
      effortPct: effort == null ? null : effort * 100, overRatio: effort != null && effort * 100 > ratio + 1e-9, ratioPct: ratio,
      ltv: loan / price
    });
  }

  /* ---------------------------------------------------------------- copy */

  const COPY = Object.freeze({
    fr: Object.freeze({
      eyebrow: 'Simulateur de crédit immobilier',
      title: 'Combien pouvez-vous emprunter ?',
      lead: 'Votre capacité d’emprunt et vos mensualités, frais d’achat compris, en France, en Belgique et au Luxembourg.',
      modes: { capacity: 'Ma capacité d’emprunt', payment: 'Mensualités d’un projet' },
      markets: { FR: 'France', BE: 'Belgique', LU: 'Luxembourg' },
      income: 'Revenus nets mensuels du foyer (€)', incomeOptional: 'Revenus nets mensuels du foyer (€, facultatif)',
      otherLoans: 'Autres crédits en cours (€ / mois)', deposit: 'Apport personnel (€)', ratio: 'Taux d’endettement maximal (%)',
      price: 'Prix du bien (€)', years: 'Durée du prêt', yearsUnit: n => `${n} ans`,
      rate: 'Taux du crédit (% / an, hors assurance)', insurance: 'Assurance emprunteur (% du capital / an, facultatif)',
      costsTitle: 'Frais d’achat',
      newBuild: 'Logement neuf (VEFA)', firstBuyer: 'Premier achat de résidence principale',
      region: 'Région', regionPick: 'Choisissez…', regions: { WAL: 'Wallonie', VLG: 'Flandre', BRU: 'Bruxelles-Capitale' },
      ownHome: { BE: 'Habitation propre et unique', LU: 'Résidence principale' },
      buyers: 'Acheteurs', buyersOptions: { 1: '1 personne', 2: '2 personnes' },
      rateHint: (ref, monthLabel) => ref.measure === 'average_by_fixation'
        ? `Taux fixe moyen des nouveaux prêts au logement en ${monthLabel} (fixation initiale ${fixationLabel(ref.years, 'fr')}) — source : ${ref.source.name}. Votre taux dépendra de votre dossier et de la banque.`
        : `Taux moyen observé en ${monthLabel} pour un prêt sur ${ref.years} ans, hors assurance — source : ${ref.source.name}. Votre taux dépendra de votre dossier et de la banque.`,
      rateEdited: 'Taux saisi par vous.', rateReset: r => `Reprendre le taux moyen (${r})`,
      rateMissing: {
        no_source: m => `Pas de taux moyen officiel récent pour ${m === 'BE' ? 'la Belgique' : m === 'LU' ? 'le Luxembourg' : 'la France'} : saisissez le taux proposé par votre banque ou votre courtier.`,
        expired: () => 'Le dernier taux moyen publié est trop ancien pour être affiché : saisissez le taux proposé par votre banque ou votre courtier.',
        duration: () => 'Pas de taux moyen publié pour cette durée : saisissez le taux proposé par votre banque ou votre courtier.'
      },
      enterRate: 'Indiquez un taux pour lancer le calcul.', enterIncome: 'Indiquez les revenus du foyer pour lancer le calcul.', enterPrice: 'Indiquez le prix du bien.',
      capTitle: 'Votre capacité d’emprunt estimée', payTitle: 'Votre mensualité estimée',
      maxLoan: 'Montant empruntable', maxMonthly: (ratio) => `Mensualité maximale (${ratio} % des revenus, moins les autres crédits)`,
      budget: 'Budget total avec l’apport', maxPrice: 'Prix de bien accessible, frais d’achat payés', costs: 'Frais d’achat estimés',
      notaryExcluded: '(hors honoraires du notaire)', costsMissing: 'Choisissez la région pour estimer les frais d’achat et le prix accessible.',
      interest: 'Coût total des intérêts', insuranceCost: 'Coût total de l’assurance', ltv: 'Part du prix financée par le prêt',
      priceRow: 'Prix du bien', depositRow: 'Apport', loan: 'Montant à emprunter', monthlyLoan: 'Mensualité du crédit', monthlyInsurance: 'Assurance emprunteur',
      perMonth: '/mois', effort: 'Taux d’effort', effortOver: (r) => `au-dessus de ${r} %`, effortOk: (r) => `sous ${r} %`,
      depositCovers: 'Votre apport couvre le prix et les frais : aucun prêt nécessaire.',
      noInsurance: 'Hors assurance emprunteur, frais de garantie et frais de dossier.',
      rules: {
        FR: 'Règle du Haut Conseil de stabilité financière : taux d’effort de 35 % maximum, assurance comprise, et durée de 25 ans maximum (27 ans dans le neuf avec différé) ; les banques ne peuvent y déroger que pour une petite partie de leurs prêts.',
        BE: 'En Belgique, la banque examine surtout le revenu qui reste disponible après la mensualité. La Banque nationale encadre la part du prix financée : en principe 90 % maximum pour l’habitation propre, 80 % pour un investissement locatif, avec des exceptions limitées. Les frais d’achat sont en général à couvrir par l’apport.',
        LU: 'Au Luxembourg, la CSSF plafonne la part du prix financée par le prêt : jusqu’à 100 % pour une première résidence principale, 90 % pour une autre résidence principale et 80 % pour les autres achats, dont l’investissement locatif.'
      },
      ratioNoteFR: 'Au-delà de 35 %, un prêt n’est possible qu’à titre dérogatoire.',
      warningTitle: 'À lire avant de vous engager',
      warning: [
        'Simulation indicative et non contractuelle. Elle ne constitue ni une offre de prêt ni un conseil en crédit, et ne remplace pas l’étude de votre dossier par une banque ou un courtier en crédit (en France, un intermédiaire en opérations de banque immatriculé à l’ORIAS ; en Belgique, un intermédiaire inscrit auprès de la FSMA).',
        'Le taux, l’assurance, les garanties et les frais réels dépendent de votre situation et de l’établissement prêteur. Z Find n’est ni un établissement de crédit ni un intermédiaire en crédit.',
        'Un crédit vous engage et doit être remboursé. Vérifiez vos capacités de remboursement avant de vous engager.'
      ],
      sourcesTitle: 'Taux de référence',
      sourceLine: (name, month, url) => `${name}, ${month}. Un taux moyen n’est affiché que tant que sa publication est récente ; au-delà, c’est à vous de saisir le taux proposé par votre banque.`,
      sourceNone: 'Aucun taux moyen officiel récent n’est disponible pour ce marché : saisissez le taux proposé par votre banque ou votre courtier.',
      sourceLink: 'Voir la source', costsSource: 'Frais d’achat : barèmes publics 2026 (droits, émoluments du notaire), estimation.'
    }),
    en: Object.freeze({
      eyebrow: 'Mortgage simulator',
      title: 'How much can you borrow?',
      lead: 'Your borrowing capacity and monthly payments, purchase costs included, in France, Belgium and Luxembourg.',
      modes: { capacity: 'My borrowing capacity', payment: 'Payments for a property' },
      markets: { FR: 'France', BE: 'Belgium', LU: 'Luxembourg' },
      income: 'Household net monthly income (€)', incomeOptional: 'Household net monthly income (€, optional)',
      otherLoans: 'Other loans (€ / month)', deposit: 'Deposit (€)', ratio: 'Maximum debt-to-income ratio (%)',
      price: 'Property price (€)', years: 'Loan term', yearsUnit: n => `${n} years`,
      rate: 'Loan rate (% / year, excluding insurance)', insurance: 'Borrower insurance (% of capital / year, optional)',
      costsTitle: 'Purchase costs',
      newBuild: 'New-build (off-plan)', firstBuyer: 'First purchase of a main residence',
      region: 'Region', regionPick: 'Choose…', regions: { WAL: 'Wallonia', VLG: 'Flanders', BRU: 'Brussels-Capital' },
      ownHome: { BE: 'Sole own home', LU: 'Main residence' },
      buyers: 'Buyers', buyersOptions: { 1: '1 person', 2: '2 people' },
      rateHint: (ref, monthLabel) => ref.measure === 'average_by_fixation'
        ? `Average fixed rate on new housing loans in ${monthLabel} (initial fixation ${fixationLabel(ref.years, 'en')}) — source: ${ref.source.name}. Your rate will depend on your profile and the bank.`
        : `Average rate observed in ${monthLabel} for a ${ref.years}-year loan, excluding insurance — source: ${ref.source.name}. Your rate will depend on your profile and the bank.`,
      rateEdited: 'Rate entered by you.', rateReset: r => `Use the average rate (${r})`,
      rateMissing: {
        no_source: m => `No recent official average rate for ${m === 'BE' ? 'Belgium' : m === 'LU' ? 'Luxembourg' : 'France'}: enter the rate offered by your bank or broker.`,
        expired: () => 'The latest published average rate is too old to be shown: enter the rate offered by your bank or broker.',
        duration: () => 'No average rate is published for this term: enter the rate offered by your bank or broker.'
      },
      enterRate: 'Enter a rate to run the calculation.', enterIncome: 'Enter the household income to run the calculation.', enterPrice: 'Enter the property price.',
      capTitle: 'Your estimated borrowing capacity', payTitle: 'Your estimated monthly payment',
      maxLoan: 'Amount you can borrow', maxMonthly: (ratio) => `Maximum monthly payment (${ratio}% of income, minus other loans)`,
      budget: 'Total budget with deposit', maxPrice: 'Affordable property price, purchase costs paid', costs: 'Estimated purchase costs',
      notaryExcluded: '(notary fees not included)', costsMissing: 'Choose the region to estimate the purchase costs and the affordable price.',
      interest: 'Total interest', insuranceCost: 'Total insurance cost', ltv: 'Share of the price financed by the loan',
      priceRow: 'Property price', depositRow: 'Deposit', loan: 'Loan amount', monthlyLoan: 'Loan payment', monthlyInsurance: 'Borrower insurance',
      perMonth: '/month', effort: 'Debt-to-income ratio', effortOver: (r) => `above ${r}%`, effortOk: (r) => `below ${r}%`,
      depositCovers: 'Your deposit covers the price and the costs: no loan needed.',
      noInsurance: 'Excluding borrower insurance, guarantee and arrangement fees.',
      rules: {
        FR: 'French financial stability council (HCSF) rule: debt-to-income ratio of 35% at most, insurance included, and a 25-year maximum term (27 years for new-builds with deferral); banks may depart from it for only a small share of their loans.',
        BE: 'In Belgium, the bank looks mainly at the income left after the payment. The National Bank caps the share of the price financed: in principle 90% for an own home and 80% for a buy-to-let, with limited exceptions. Purchase costs are usually paid from the deposit.',
        LU: 'In Luxembourg, the CSSF caps the share of the price financed by the loan: up to 100% for a first main residence, 90% for another main residence and 80% for other purchases, including buy-to-let.'
      },
      ratioNoteFR: 'Above 35%, a loan is only possible as an exception.',
      warningTitle: 'Read before you commit',
      warning: [
        'Indicative, non-binding simulation. It is neither a loan offer nor credit advice, and does not replace the review of your application by a bank or a credit broker (in France, a banking intermediary registered with ORIAS; in Belgium, an intermediary registered with the FSMA).',
        'The actual rate, insurance, guarantees and fees depend on your situation and on the lender. Z Find is neither a credit institution nor a credit intermediary.',
        'A loan is a commitment and must be repaid. Check that you can afford the repayments before committing.'
      ],
      sourcesTitle: 'Reference rates',
      sourceLine: (name, month) => `${name}, ${month}. An average rate is shown only while its publication is recent; after that, you enter the rate offered by your bank.`,
      sourceNone: 'No recent official average rate is available for this market: enter the rate offered by your bank or broker.',
      sourceLink: 'See the source', costsSource: 'Purchase costs: 2026 public scales (duties, notary fees), estimate.'
    })
  });

  function copyFor(lang) { return COPY[lang] || COPY.en; }

  function fixationLabel(years, lang) {
    const span = { 15: [10, 15], 20: [15, 20], 25: [20, 25], 30: [25, 30] }[years];
    if (!span) return '';
    return lang === 'fr' ? `de plus de ${span[0]} à ${span[1]} ans` : `over ${span[0]} up to ${span[1]} years`;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function locale(lang) { return lang === 'fr' ? 'fr-FR' : 'en-IE'; }
  function money(v, lang) {
    const n = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(v);
    return lang === 'fr' ? `${n} €` : `€${n}`;
  }
  function pctLabel(v, lang, digits) {
    return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: digits == null ? 2 : digits, maximumFractionDigits: digits == null ? 2 : digits }).format(v) + (lang === 'fr' ? ' %' : '%');
  }

  function normalise(query) {
    const q = query || {};
    const market = MARKETS.includes(String(q.market || '').toUpperCase()) ? String(q.market).toUpperCase() : 'FR';
    const mode = MODES.includes(q.mode) ? q.mode : 'capacity';
    const price = Number(q.price) > 0 ? Math.round(Number(q.price)) : null;
    return { market, mode, price };
  }

  /* ---------------------------------------------------------------- page */

  function rateHintHTML(lang, market, years, today, edited) {
    const c = copyFor(lang);
    const ref = rates.reference(market, years, today);
    if (ref && !edited) return `<span data-credit-rate-state="reference">${esc(c.rateHint(ref, rates.periodLabel(ref.period, lang)))}</span>`;
    if (edited) return `<span data-credit-rate-state="edited">${esc(c.rateEdited)}</span>${ref ? ` <button type="button" class="credit-linkbtn" data-credit-rate-reset>${esc(c.rateReset(pctLabel(ref.ratePct, lang)))}</button>` : ''}`;
    const reason = rates.missingReason(market, years, today) || 'no_source';
    return `<span data-credit-rate-state="missing">${esc(c.rateMissing[reason](market))}</span>`;
  }

  function costsFieldsHTML(lang, market) {
    const c = copyFor(lang);
    const opt = (v, label, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
    let inner;
    if (market === 'FR') {
      inner = `<label class="est-check"><input type="checkbox" data-credit="firstBuyer"> ${esc(c.firstBuyer)}</label>
        <label class="est-check"><input type="checkbox" data-credit="newBuild"> ${esc(c.newBuild)}</label>`;
    } else if (market === 'BE') {
      inner = `<div class="est-field"><label for="cr-region">${esc(c.region)}</label><select id="cr-region" data-credit="region">${opt('', c.regionPick, true)}${['WAL', 'VLG', 'BRU'].map(r => opt(r, c.regions[r], false)).join('')}</select></div>
        <label class="est-check"><input type="checkbox" data-credit="ownHome" checked> ${esc(c.ownHome.BE)}</label>`;
    } else {
      inner = `<label class="est-check"><input type="checkbox" data-credit="ownHome" checked> ${esc(c.ownHome.LU)}</label>
        <div class="est-field"><label for="cr-buyers">${esc(c.buyers)}</label><select id="cr-buyers" data-credit="buyers">${opt(1, c.buyersOptions[1], true)}${opt(2, c.buyersOptions[2], false)}</select></div>`;
    }
    return `<fieldset class="est-features credit-costs"><legend>${esc(c.costsTitle)}</legend>${inner}</fieldset>`;
  }

  function sourcesHTML(lang, market, today) {
    const c = copyFor(lang);
    const m = rates.DATA.markets[market];
    const fresh = rates.isFresh(market, today);
    const line = fresh
      ? `${esc(c.sourceLine(m.source.name, rates.periodLabel(m.period, lang)))} <a href="${esc(m.source.url)}" target="_blank" rel="noopener">${esc(c.sourceLink)}</a>`
      : esc(c.sourceNone);
    return `<p class="est-muted" data-credit-source>${esc(c.sourcesTitle)}${lang === 'fr' ? ' : ' : ': '}${line}</p><p class="est-muted">${esc(c.costsSource)}</p>`;
  }

  function pageHTML(lang, query, today) {
    const c = copyFor(lang);
    const q = normalise(query);
    const rule = RULES[q.market];
    const years = q.mode === 'capacity' ? rule.defaultYears : Math.min(20, rule.defaultYears);
    const ref = rates.reference(q.market, years, today);
    const link = (market, mode) => `#/${lang}/simulator?market=${market}&mode=${mode}${q.price && mode === 'payment' ? `&price=${q.price}` : ''}`;
    const num = (key, label, value, attrs) => `<div class="est-field"><label for="cr-${key}">${esc(label)}</label><input id="cr-${key}" type="number" data-credit="${key}" value="${value == null ? '' : value}" ${attrs || 'inputmode="numeric" min="0" step="100"'}></div>`;
    const yearsSelect = `<div class="est-field"><label for="cr-years">${esc(c.years)}</label><select id="cr-years" data-credit="years">${rule.durations.map(y => `<option value="${y}"${y === years ? ' selected' : ''}>${esc(c.yearsUnit(y))}</option>`).join('')}</select></div>`;
    const rateField = `<div class="est-field credit-rate"><label for="cr-rate">${esc(c.rate)}</label>
      <input id="cr-rate" type="number" inputmode="decimal" min="0.1" max="15" step="0.01" data-credit="ratePct" value="${ref ? ref.ratePct : ''}" placeholder="${lang === 'fr' ? 'ex. 3,50' : 'e.g. 3.50'}">
      <p class="credit-rate-hint" data-credit-rate-hint>${rateHintHTML(lang, q.market, years, today, false)}</p></div>`;
    const fields = q.mode === 'capacity'
      ? `<div class="est-row">${num('income', c.income, 4500)}${num('otherLoans', c.otherLoans, 0)}</div>
         <div class="est-row">${num('deposit', c.deposit, 50000, 'inputmode="numeric" min="0" step="1000"')}${num('ratioPct', c.ratio, rule.defaultRatio, 'inputmode="decimal" min="10" max="60" step="1"')}</div>`
      : `<div class="est-row">${num('price', c.price, q.price || 400000, 'inputmode="numeric" min="10000" step="1000"')}${num('deposit', c.deposit, q.price ? Math.round(q.price * 0.1 / 1000) * 1000 : 40000, 'inputmode="numeric" min="0" step="1000"')}</div>
         <div class="est-row">${num('income', c.incomeOptional, '')}${num('otherLoans', c.otherLoans, 0)}</div>`;
    return `
      <div class="wrap est-page credit-page" data-credit-page data-market="${q.market}" data-mode="${q.mode}">
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
            <form class="est-form" data-credit-form novalidate>
              ${fields}
              <div class="est-row">${yearsSelect}${num('insurancePct', c.insurance, '', 'inputmode="decimal" min="0" max="2" step="0.01"')}</div>
              ${rateField}
              ${costsFieldsHTML(lang, q.market)}
            </form>
          </div>
          <div class="est-col est-col-output">
            <section class="est-result credit-result" data-credit-result aria-live="polite"></section>
          </div>
        </div>
        <section class="credit-warning" data-credit-warning>
          <h2>${esc(c.warningTitle)}</h2>
          ${c.warning.map(w => `<p>${esc(w)}</p>`).join('')}
          ${sourcesHTML(lang, q.market, today)}
        </section>
      </div>`;
  }

  function row(label, value, cls) {
    return `<li${cls ? ` class="${cls}"` : ''}><span>${label}</span><strong>${value}</strong></li>`;
  }

  function resultHTML(lang, mode, market, r) {
    const c = copyFor(lang);
    const note = `<p class="est-muted">${esc(c.noInsurance)}</p><p class="est-muted">${esc(c.rules[market])}</p><p class="est-muted credit-short-warning">${esc(c.warning[2])}</p>`;
    if (r.error) {
      const msg = r.error === 'rate_required' ? c.enterRate : r.error === 'income_required' ? c.enterIncome : c.enterPrice;
      return `<h2 class="est-report-title">${esc(mode === 'capacity' ? c.capTitle : c.payTitle)}</h2><p class="credit-prompt" data-credit-prompt>${esc(msg)}</p>${note}`;
    }
    const m = v => esc(money(v, lang));
    if (mode === 'capacity') {
      const rows = [
        row(esc(c.maxMonthly(r.ratioPct)), m(r.maxMonthly) + esc(c.perMonth)),
        row(esc(c.budget), m(r.budget)),
        r.maxPrice != null ? row(esc(c.costs) + (r.notaryIncluded ? '' : ' ' + esc(c.notaryExcluded)), m(r.costs)) : '',
        r.maxPrice != null ? row(esc(c.maxPrice), m(r.maxPrice), 'credit-key') : '',
        r.ltv != null ? row(esc(c.ltv), esc(pctLabel(r.ltv * 100, lang, 0))) : '',
        row(esc(c.interest), m(r.interest)),
        r.insurance ? row(esc(c.insuranceCost), m(r.insurance)) : ''
      ].join('');
      return `<h2 class="est-report-title">${esc(c.capTitle)}</h2>
        <p class="est-range" data-credit-main><strong>${m(r.maxLoan)}</strong></p>
        <p class="est-central">${esc(c.maxLoan)}</p>
        <ul class="est-adj">${rows}</ul>
        ${r.costsMissing ? `<p class="est-error">${esc(c.costsMissing)}</p>` : ''}
        ${market === 'FR' && r.ratioPct > 35 ? `<p class="est-error">${esc(c.ratioNoteFR)}</p>` : ''}
        ${note}`;
    }
    if (r.loan <= 0) {
      return `<h2 class="est-report-title">${esc(c.payTitle)}</h2><p class="credit-prompt">${esc(c.depositCovers)}</p>${note}`;
    }
    const rows = [
      row(esc(c.priceRow), m(r.price)),
      r.costs != null ? row(esc(c.costs) + (r.notaryIncluded ? '' : ' ' + esc(c.notaryExcluded)), m(r.costs)) : '',
      row(esc(c.depositRow), '− ' + m(r.deposit)),
      row(esc(c.loan), m(r.loan), 'credit-key'),
      row(esc(c.monthlyLoan), m(r.monthlyLoan) + esc(c.perMonth)),
      r.monthlyInsurance ? row(esc(c.monthlyInsurance), m(r.monthlyInsurance) + esc(c.perMonth)) : '',
      row(esc(c.interest), m(r.interest)),
      r.insurance ? row(esc(c.insuranceCost), m(r.insurance)) : '',
      r.effortPct != null ? row(esc(c.effort), `${esc(pctLabel(r.effortPct, lang, 1))} <span class="est-badge ${r.overRatio ? 'est-badge-low' : 'est-badge-high'}">${esc(r.overRatio ? c.effortOver(r.ratioPct) : c.effortOk(r.ratioPct))}</span>`) : ''
    ].join('');
    return `<h2 class="est-report-title">${esc(c.payTitle)}</h2>
      <p class="est-range" data-credit-main><strong>${m(r.monthly)}</strong><span>${esc(c.perMonth)}</span></p>
      <ul class="est-adj">${rows}</ul>
      ${r.costsMissing ? `<p class="est-error">${esc(c.costsMissing)}</p>` : ''}
      ${note}`;
  }

  function readForm(form, market, mode) {
    const f = name => form.querySelector(`[data-credit="${name}"]`);
    const val = name => (f(name) ? f(name).value : '');
    const numv = name => { const v = val(name); return v === '' ? null : Number(String(v).replace(',', '.')); };
    const checked = name => !!(f(name) && f(name).checked);
    const costs = market === 'FR' ? { firstBuyer: checked('firstBuyer'), newBuild: checked('newBuild') }
      : market === 'BE' ? { region: val('region') || undefined, ownHome: checked('ownHome') }
        : { ownHome: checked('ownHome'), buyers: Number(val('buyers')) || 1 };
    const input = {
      market, income: numv('income'), otherLoans: numv('otherLoans') || 0, deposit: numv('deposit') || 0,
      ratioPct: numv('ratioPct') || RULES[market].defaultRatio, price: numv('price'),
      ratePct: numv('ratePct'), years: Number(val('years')), insurancePct: numv('insurancePct') || 0, costs
    };
    return mode === 'capacity' ? capacity(input) : project(input);
  }

  function render(rootEl, lang, query, options) {
    if (!rootEl) return false;
    const today = options && options.today ? options.today : new Date();
    const q = normalise(query);
    rootEl.innerHTML = pageHTML(lang, q, today);
    const page = rootEl.querySelector('[data-credit-page]');
    const form = page.querySelector('[data-credit-form]');
    const out = page.querySelector('[data-credit-result]');
    const rateInput = form.querySelector('[data-credit="ratePct"]');
    const yearsSelect = form.querySelector('[data-credit="years"]');
    const hint = form.querySelector('[data-credit-rate-hint]');
    let edited = false;

    function syncRate() {
      const ref = rates.reference(q.market, yearsSelect.value, today);
      if (!edited) rateInput.value = ref ? String(ref.ratePct) : '';
      hint.innerHTML = rateHintHTML(lang, q.market, yearsSelect.value, today, edited);
    }
    function update() { out.innerHTML = resultHTML(lang, q.mode, q.market, readForm(form, q.market, q.mode)); }

    form.addEventListener('submit', e => { e.preventDefault(); update(); });
    form.addEventListener('input', e => {
      if (e.target === rateInput) {
        const ref = rates.reference(q.market, yearsSelect.value, today);
        edited = rateInput.value !== '' && !(ref && Number(rateInput.value) === ref.ratePct);
        hint.innerHTML = rateHintHTML(lang, q.market, yearsSelect.value, today, edited);
      }
      update();
    });
    form.addEventListener('change', e => { if (e.target === yearsSelect) syncRate(); update(); });
    hint.addEventListener('click', e => {
      if (!e.target.closest('[data-credit-rate-reset]')) return;
      edited = false; syncRate(); update();
    });
    update();
    return true;
  }

  return Object.freeze({
    MARKETS, MODES, RULES, COPY,
    annuityFactor, payment, capacity, project, maxPriceFor,
    pageHTML, resultHTML, render, normalise, rateHintHTML,
    _internals: Object.freeze({ fixationLabel, pctLabel, money })
  });
});
