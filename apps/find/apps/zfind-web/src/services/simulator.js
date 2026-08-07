/* ============================================================
   Z FIND — services/simulator.js
   ============================================================
   Acquisition-cost simulator (IMT + Imposto do Selo for Portugal
   today). Explicitly NOT an investment/yield/valuation tool — those
   were rejected in PRODUCT-AUDIT-V1.md as a credibility risk without
   real transaction data. This calculates known, public tax formulas
   only — the same "rules-based, never speculative" pattern already
   validated in Z-IMOVEIS-COMPETITIVE-FINDINGS.md.

   ARCHITECTURE — country-aware from day one, per explicit instruction
   ("é um portal internacional, lógica geográfica adequada a cada
   país"): every country's rules live in their own entry in
   COUNTRY_RULES, keyed by ISO code. Adding a second country is a data
   addition (a new entry in this object), never a rewrite of the
   calculation engine or the UI layer that calls it.

   SOURCING — Portugal's IMT brackets below are taken from the
   Autoridade Tributária's official 2026 practical tables (Ofício
   Circulado n.º 40129/2026), for Continental Portugal, Habitação
   Própria e Permanente (owner-occupied primary residence) ONLY.
   Deduction constants ("parcela a abater") for each progressive
   bracket are derived from the AT's own published "taxa média no
   limite" (average rate at the bracket ceiling) — this derivation was
   cross-validated against an independently published worked example
   (€180,000 HPP → €2,508.98 IMT) before being trusted here; the
   derived formula produces €2,508.90, an 8-cent difference consistent
   with rounding in the source's published percentages, not a
   methodology error.

   SCOPE, EXPLICITLY: Continental Portugal, HPP, fiscal resident,
   standard (non-Jovem) case for the progressive brackets; the two top
   brackets (flat-rate, no deduction needed) are included as published.
   Second-home/non-HPP, Açores/Madeira, non-resident, and Jovem
   exemption are NOT implemented — never silently approximated. The
   UI must refuse to answer for cases outside this scope rather than
   guess. Extending scope is a data change to PT_TAX_BRACKETS_HPP,
   done only when re-sourced and re-validated the same way.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.simulator = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

// Continental Portugal, HPP, resident, standard case. Source: AT
// Ofício Circulado 40129/2026. See module header for exact scope.
const PT_IMT_HPP_BRACKETS = [
  { upper: 106346, rate: 0.00, deduction: 0 },
  { upper: 145470, rate: 0.02, deduction: 2126.92 },
  { upper: 198347, rate: 0.05, deduction: 6491.10 },
  { upper: 330539, rate: 0.07, deduction: 10457.92 },
  // 330,539–660,982 at 8%: the AT source did not publish an explicit
  // "taxa média no limite" for this bracket — the deduction below is
  // derived by mathematical continuity with the 7% bracket above
  // (a progressive table's deduction is always exactly the value that
  // makes tax continuous at the boundary; this is a property of how
  // such tables are built, not an assumption about the actual rate).
  // Flagged to the user as needing direct AT confirmation above
  // €330,539 — see NEEDS_AT_CONFIRMATION_ABOVE.
  { upper: 660982, rate: 0.08, deduction: 13762.26 },
];
// Above 660,982: flat rates on the FULL value, no deduction — the
// source states these explicitly as "taxa única sobre o valor total",
// nothing derived here.
const PT_IMT_HPP_FLAT_ABOVE_660982 = { upper: 1150853, rate: 0.06 };
const PT_IMT_HPP_FLAT_ABOVE_1150853 = { rate: 0.075 };

const NEEDS_AT_CONFIRMATION_ABOVE = 330539;

const PT_STAMP_DUTY_RATE = 0.008; // Imposto do Selo on the transaction, standard case, no exemption applied

// Non-resident flat IMT rate, Decreto-Lei n.º 97/2026 (published 20
// May 2026, part of "Construir Portugal"), verified via web search —
// this is genuinely after this simulator's original training-era
// knowledge, not something to have assumed. A flat rate, no bracket
// table, no deduction-derivation risk — much simpler and safer to
// implement directly than the resident case above. Applies to
// transmissions between 1 Jan 2026 and 31 Dec 2029.
const PT_IMT_NON_RESIDENT_FLAT_RATE = 0.075;

function calculatePT({ propertyValue, isHPP, isResident }) {
  const warnings = [];
  if (typeof propertyValue !== 'number' || propertyValue <= 0) {
    return { data: null, error: { type: 'invalid_input', message: 'Indique um valor de imóvel válido.' } };
  }

  if (isResident === false) {
    // Checked BEFORE the isHPP gate below, deliberately: a non-resident
    // cannot logically be buying "habitação própria e permanente" in
    // Portugal (HPP requires it to actually be their primary home) —
    // DL 97/2026's flat 7.5% rate applies to their residential
    // purchase regardless of the HPP checkbox's state. Gating on isHPP
    // first would incorrectly reject the exact case this branch
    // exists to handle.
    const imt = propertyValue * PT_IMT_NON_RESIDENT_FLAT_RATE;
    const stampDuty = propertyValue * PT_STAMP_DUTY_RATE;
    return {
      data: {
        countryIso: 'PT',
        propertyValue,
        imt: Math.round(imt * 100) / 100,
        stampDuty: Math.round(stampDuty * 100) / 100,
        total: Math.round((imt + stampDuty) * 100) / 100,
        warnings: ['Existem 3 exceções a esta taxa fixa (tornar-se residente fiscal, tornar-se residente fiscal nos 2 anos seguintes com direito a reembolso da diferença, ou arrendamento de longa duração a renda moderada) — nenhuma delas é aplicada automaticamente aqui. Confirme se se enquadra em alguma antes de assumir este valor como definitivo.'],
        disclaimer: 'Estimativa informativa, não vinculativa. Taxa fixa de IMT de 7,5% para não residentes fiscais, introduzida pelo Decreto-Lei n.º 97/2026 (20 de maio de 2026), aplicável a transmissões entre 1 de janeiro de 2026 e 31 de dezembro de 2029. Confirme sempre o valor exato junto da AT ou de um profissional antes da escritura.',
        scope: 'Portugal Continental · Habitação · Não residente fiscal',
      },
      error: null,
    };
  }

  if (!isHPP) {
    return { data: null, error: { type: 'out_of_scope', message: 'Este simulador cobre apenas habitação própria e permanente. Para segunda habitação, contacte um consultor.' } };
  }

  let imt = 0;
  if (propertyValue > PT_IMT_HPP_FLAT_ABOVE_660982.upper) {
    imt = propertyValue * PT_IMT_HPP_FLAT_ABOVE_1150853.rate;
  } else if (propertyValue > 660982) {
    imt = propertyValue * PT_IMT_HPP_FLAT_ABOVE_660982.rate;
  } else {
    const bracket = PT_IMT_HPP_BRACKETS.find(b => propertyValue <= b.upper);
    imt = Math.max(0, propertyValue * bracket.rate - bracket.deduction);
  }

  if (propertyValue > NEEDS_AT_CONFIRMATION_ABOVE) {
    warnings.push('Para valores acima de 330.539€, o cálculo usa uma parcela a abater derivada por continuidade matemática, não publicada diretamente pela AT — confirme sempre o valor exato antes da escritura.');
  }

  const stampDuty = propertyValue * PT_STAMP_DUTY_RATE;

  return {
    data: {
      countryIso: 'PT',
      propertyValue,
      imt: Math.round(imt * 100) / 100,
      stampDuty: Math.round(stampDuty * 100) / 100,
      total: Math.round((imt + stampDuty) * 100) / 100,
      warnings,
      disclaimer: 'Estimativa informativa, não vinculativa. Baseada nas tabelas práticas de IMT da Autoridade Tributária em vigor para 2026 (Continente, habitação própria e permanente, residente fiscal). Confirme sempre o valor exato junto da AT ou de um profissional antes da escritura.',
      scope: 'Portugal Continental · Habitação própria e permanente · Residente fiscal',
    },
    error: null,
  };
}

/** One entry per country. Adding a second country: add its entry
    here, implement its own calculate() using its own real, sourced
    rules — never reuse another country's formula shape by default. */
const COUNTRY_RULES = {
  PT: { calculate: calculatePT, label: 'Portugal' },
};

function calculateAcquisitionCosts(countryIso, input) {
  const country = COUNTRY_RULES[countryIso];
  if (!country) {
    return { data: null, error: { type: 'unsupported_country', message: `Simulador ainda não disponível para ${countryIso}.` } };
  }
  return country.calculate(input);
}

function supportedCountries() {
  return Object.keys(COUNTRY_RULES).map(iso => ({ iso, label: COUNTRY_RULES[iso].label }));
}

return { calculateAcquisitionCosts, supportedCountries };

});
