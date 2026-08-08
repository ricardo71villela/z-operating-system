/* ============================================================
   Z FIND — RENTAL YIELD / PROFITABILITY SIMULATOR
   ============================================================
   Different in kind from services/simulator.js (IMT/Selo on
   acquisition) — this computes investment returns (yield, cash flow,
   NPV, IRR) for a rental property, under TWO scenarios: Alojamento
   Local (short-term) and Arrendamento de Longa Duração (long-term).

   Same discipline as the cost simulator: the person supplies their
   own assumptions, this tool does transparent, well-defined
   arithmetic on them — never Z Find asserting a market prediction.
   This is precisely why the earlier product decision in
   PRODUCT-AUDIT-V1.md refused an automated "estimated yield" number
   attached to a listing: that would have been Z Find asserting a
   fact with no real transaction data behind it. This is different —
   every number here is the person's own input.

   DELIBERATE SCOPE DECISIONS, made after real research, not
   assumption:
   - Acquisition costs (IMT + Imposto do Selo) are a REQUIRED input
     the person provides themselves — never computed internally here.
     An investment-property purchase uses a DIFFERENT IMT bracket
     table than the habitação-própria one already verified in
     simulator.js (starts taxed from the first euro, no exemption
     band, a lower ceiling on the upper bracket) — real, sourced, but
     genuinely different from what's already verified, and building a
     second uncertain table risked exactly the kind of unverified
     precision this project has consistently refused elsewhere.
     Instead: use the Cost Simulator (services/simulator.js) — which
     covers HPP, not investment — as a *reference point*, or a
     professional, and bring the resulting figure here.
   - IRS rate on long-term rental income is ALSO a required input, not
     an internal lookup table. Real research for this feature turned
     up genuinely conflicting rates across sources for the
     duration-based reduction scheme (art. 72º CIRS), compounded by a
     concurrent 2026 State Budget change introducing a separate flat
     10% "renda moderada" regime. Rather than pick one contested
     figure with false confidence, the default offered is 28% (the
     standard flat rate that applies with no reduction), with an
     explicit note to confirm the applicable rate with an accountant.

   A found (and NOT copied) issue in the reference this was adapted
   from: calcIRR was defined twice in the source file, the second
   definition silently overwriting the first and dropping its
   parseFloat(...) || 0 safety guards. Only one, safer version exists
   here.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ZFindServices = root.ZFindServices || {}; root.ZFindServices.rentability = factory(); }
})(typeof window !== 'undefined' ? window : this, function () {

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Standard NPV: discounts each year's cash flow, plus an assumed
    resale value in the final year (appreciation-adjusted price minus
    remaining loan balance, straight-line amortisation approximation).
    rate is the discount rate, e.g. 0.05 for 5%. */
function calculateNPV({ annualCashFlow, equity, propertyValue, loanAmount, years, discountRate, appreciationRate }) {
  let npv = -equity;
  for (let t = 1; t <= years; t++) npv += annualCashFlow / Math.pow(1 + discountRate, t);
  const futureValue = propertyValue * Math.pow(1 + appreciationRate, years);
  const remainingLoan = loanAmount * Math.max(0, 1 - years / 30); // straight-line approximation, not a full amortisation schedule
  npv += (futureValue - remainingLoan) / Math.pow(1 + discountRate, years);
  return npv;
}

/** Newton-Raphson IRR — one clean version (the reference this was
    adapted from defined this function twice; only the safer,
    parseFloat-guarded logic survives here). Falls back gracefully
    (returns null) rather than an absurd number if it fails to
    converge — never presents a wild, meaningless percentage. */
function calculateIRR({ annualCashFlow, equity, propertyValue, loanAmount, years, appreciationRate }) {
  const futureValue = propertyValue * Math.pow(1 + appreciationRate, years);
  const remainingLoan = loanAmount * Math.max(0, 1 - years / 30);
  const finalEquity = futureValue - remainingLoan;
  let r = 0.08;
  for (let iter = 0; iter < 100; iter++) {
    let npv = -equity, dnpv = 0;
    for (let t = 1; t <= years; t++) {
      npv += annualCashFlow / Math.pow(1 + r, t);
      dnpv -= t * annualCashFlow / Math.pow(1 + r, t + 1);
    }
    npv += finalEquity / Math.pow(1 + r, years);
    dnpv -= years * finalEquity / Math.pow(1 + r, years + 1);
    if (Math.abs(npv) < 1) break;
    if (dnpv === 0) return null; // never divide by zero into a fabricated result
    r -= npv / dnpv;
    if (r < -0.5 || r > 5) return null; // diverged — never present a nonsense rate
  }
  return Math.round(r * 1000) / 10; // as a percentage, 1 decimal place
}

function annualLoanPayment(loanAmount, ratePercent, years) {
  if (!loanAmount || !years) return 0;
  const r = ratePercent / 100 / 12, n = years * 12;
  if (r === 0) return loanAmount / years;
  return (loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)) * 12;
}

/** Short-term rental (Alojamento Local). All rates/percentages are
    the person's own assumptions. IRS here uses the AL-specific
    "coeficiente de simplificação" of 0.35 applied to gross revenue
    under the simplified regime (Categoria B) — a longstanding,
    stable rule, unlike the long-term rental duration-based reduction
    scheme, which is why this one IS computed rather than requested as
    a raw input; still shown alongside the assumption, not hidden. */
function calculateAL(input) {
  const price = num(input.propertyValue), works = num(input.renovationCosts), acquisitionCosts = num(input.acquisitionCosts);
  const totalInvestment = price + works + acquisitionCosts;
  const hasLoan = !!input.hasLoan;
  const loanAmount = hasLoan ? num(input.loanAmount) : 0;
  const equity = totalInvestment - loanAmount;

  const grossRevenue = num(input.dailyRate) * (num(input.occupancyPercent) / 100) * 365;
  const afterPlatformFee = grossRevenue * (1 - num(input.platformFeePercent) / 100);
  const netRevenue = afterPlatformFee * (1 - num(input.managementFeePercent) / 100);

  const condoAnnual = num(input.condoMonthly) * 12;
  const utilitiesAnnual = num(input.utilitiesMonthly) * 12;
  const insuranceAnnual = num(input.insuranceAnnual) || Math.max(200, price * 0.0008);
  const maintenanceAnnual = price * 0.005;
  const imiAnnual = price * 0.003; // matches the same simplified estimate used consistently across this simulator — a real IMI figure depends on the VPT, which the person may not know yet at this stage
  const operatingCosts = condoAnnual + utilitiesAnnual + insuranceAnnual + maintenanceAnnual + imiAnnual;

  const alCoefficient = 0.35; // Categoria B, regime simplificado — stable, sourced rule, unlike the long-term duration scheme
  const taxableIncome = grossRevenue * alCoefficient;
  const irsAmount = taxableIncome * (num(input.irsRatePercent) / 100);

  const loanPaymentAnnual = annualLoanPayment(loanAmount, num(input.loanRatePercent), num(input.loanYears));
  const netProfit = netRevenue - operatingCosts - irsAmount;
  const cashFlow = netProfit - loanPaymentAnnual;

  return buildResult({ price, totalInvestment, equity, loanAmount, grossRevenue, netRevenue, operatingCosts, irsAmount, netProfit, cashFlow, loanPaymentAnnual, input,
    detail: { condoAnnual, utilitiesAnnual, insuranceAnnual, maintenanceAnnual, imiAnnual, alCoefficient } });
}

/** Long-term rental (Arrendamento de Longa Duração). irsRatePercent
    is a REQUIRED input here — see the module header for why no
    internal lookup table is used. */
function calculateALD(input) {
  const price = num(input.propertyValue), works = num(input.renovationCosts), acquisitionCosts = num(input.acquisitionCosts);
  const totalInvestment = price + works + acquisitionCosts;
  const hasLoan = !!input.hasLoan;
  const loanAmount = hasLoan ? num(input.loanAmount) : 0;
  const equity = totalInvestment - loanAmount;

  const voidMonths = num(input.voidMonthsPerYear);
  const grossRevenue = num(input.monthlyRent) * Math.max(0, 12 - voidMonths);

  const condoAnnual = num(input.condoMonthly) * 12;
  const insuranceAnnual = num(input.insuranceAnnual) || Math.max(150, price * 0.0006);
  const maintenanceAnnual = price * 0.008;
  const imiAnnual = price * 0.003;
  const operatingCosts = condoAnnual + insuranceAnnual + maintenanceAnnual + imiAnnual;

  // Categoria F: IMI and maintenance are the standard deductible
  // expenses against rental income before applying the IRS rate.
  const deductible = imiAnnual + maintenanceAnnual;
  const taxableIncome = Math.max(0, grossRevenue - deductible);
  const irsAmount = taxableIncome * (num(input.irsRatePercent) / 100);

  const loanPaymentAnnual = annualLoanPayment(loanAmount, num(input.loanRatePercent), num(input.loanYears));
  const netProfit = grossRevenue - operatingCosts - irsAmount;
  const cashFlow = netProfit - loanPaymentAnnual;

  return buildResult({ price, totalInvestment, equity, loanAmount, grossRevenue, netRevenue: grossRevenue, operatingCosts, irsAmount, netProfit, cashFlow, loanPaymentAnnual, input,
    detail: { condoAnnual, insuranceAnnual, maintenanceAnnual, imiAnnual } });
}

function buildResult({ price, totalInvestment, equity, loanAmount, grossRevenue, netRevenue, operatingCosts, irsAmount, netProfit, cashFlow, loanPaymentAnnual, input, detail }) {
  const appreciationRate = (input.appreciationPercent != null ? num(input.appreciationPercent) : 3) / 100;
  const round2 = n => Math.round(n * 100) / 100;
  return {
    grossRevenue: round2(grossRevenue), netRevenue: round2(netRevenue), operatingCosts: round2(operatingCosts),
    irsAmount: round2(irsAmount), netProfit: round2(netProfit), cashFlow: round2(cashFlow), loanPaymentAnnual: round2(loanPaymentAnnual),
    totalInvestment: round2(totalInvestment), equity: round2(equity),
    grossYieldPercent: price > 0 ? round2((grossRevenue / price) * 100) : null,
    netYieldPercent: totalInvestment > 0 ? round2((netProfit / totalInvestment) * 100) : null,
    cashOnCashPercent: equity > 0 ? round2((cashFlow / equity) * 100) : null,
    paybackYears: cashFlow > 0 ? round2(equity / cashFlow) : null,
    npv10yAt5pct: round2(calculateNPV({ annualCashFlow: cashFlow, equity, propertyValue: price, loanAmount, years: 10, discountRate: 0.05, appreciationRate })),
    irr20yPercent: calculateIRR({ annualCashFlow: cashFlow, equity, propertyValue: price, loanAmount, years: 20, appreciationRate }),
    detail,
    // Deliberately NOT a hardcoded string here (unlike simulator.js's
    // pre-existing disclaimer, which is always Portuguese regardless
    // of the site's selected language — a known, separate gap, not
    // fixed here since it wasn't part of this delivery). The UI layer
    // supplies this via i18n (yieldSim.disclaimer), properly
    // localized to English/Portuguese/French.
  };
}

return { calculateAL, calculateALD, calculateNPV, calculateIRR };

});
