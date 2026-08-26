/* ============================================================
   Z FASHION — CAMPAIGN (bounded context: fashion-domain)
   ============================================================
   Owns: Campaign types and scheduling. Soldes and Black Friday are
   distinct types on purpose (MARKETS-AND-I18N.md) — Soldes dates are
   fixed by French law (arrêté du 27 mai 2019, Code de commerce
   L.310-3) and verified against a registered official-windows table
   below; Black Friday has no such constraint. Conflating the two into
   one generic "sale event" type was the mistake this file exists to
   make structurally impossible.

   A Product attaches to zero or more Campaigns independently of its
   Category/Brand/Partner (see product.js — campaignIds is a plain
   array on Product, this module owns Campaign definitions themselves).
   ============================================================ */

const CAMPAIGN_TYPES = Object.freeze([
  'destaques',
  'saldos',
  'vendas_privadas',
  'novas_colecoes',
  'soldes',
  'black_friday',
]);

/* Official French Soldes windows, national dates (Code de commerce
   L.310-3, arrêté du 27 mai 2019). Regional exceptions exist (Alsace-
   Moselle starts ~1 week earlier; Corsica and Overseas territories
   have their own calendars; the 2026 summer window was extended by
   one week due to a heatwave) — deliberately NOT modeled here, same
   discipline Geography applied to Region being optional: this table
   is the France-national baseline, not the full territorial matrix.
   Extend per-country, per-year as real launch markets require it —
   never invent a window that hasn't actually been decreed. */
const OFFICIAL_SOLDES_WINDOWS = Object.freeze({
  // Keyed by ISO-3166-1 alpha-2 code, matching the Geography/database convention.
  FR: Object.freeze([
    { year: 2026, season: 'winter', startDate: '2026-01-07', endDate: '2026-02-03' },
    // Summer 2026 was extended from 2026-07-21 to 2026-07-28 by
    // government decision (heatwave-driven footfall relief).
    { year: 2026, season: 'summer', startDate: '2026-06-24', endDate: '2026-07-28' },
    { year: 2027, season: 'winter', startDate: '2027-01-06', endDate: '2027-02-02' },
  ]),
});

/**
 * Creates a Campaign record. Throws on any violation of the
 * invariants resolved in DOMAIN-SKETCH.md / MARKETS-AND-I18N.md.
 *
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.type       - one of CAMPAIGN_TYPES
 * @param {string} input.startDate  - ISO date (YYYY-MM-DD)
 * @param {string} input.endDate    - ISO date (YYYY-MM-DD)
 * @param {string} [input.countryIso] - ISO-3166-1 alpha-2, required iff type === 'soldes'
 */
function createCampaign(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    throw new Error('createCampaign: input must be an object');
  }
  if (!input.id) errors.push('id is required');
  if (!CAMPAIGN_TYPES.includes(input.type)) {
    errors.push(`type must be one of ${CAMPAIGN_TYPES.join(', ')}`);
  }
  if (!input.startDate || !input.endDate) {
    errors.push('startDate and endDate are required (ISO YYYY-MM-DD)');
  }

  if (input.type === 'soldes') {
    if (!input.countryIso) {
      errors.push('type "soldes" requires countryIso — the legal window is per-country');
    } else {
      const windows = OFFICIAL_SOLDES_WINDOWS[input.countryIso] || [];
      const matches = windows.some(
        (w) => w.startDate === input.startDate && w.endDate === input.endDate
      );
      if (!matches) {
        errors.push(
          `type "soldes" dates ${input.startDate}..${input.endDate} do not match ` +
          `any registered official window for ${input.countryIso}. Soldes dates are ` +
          'fixed by law, not chosen — register the real decreed window in ' +
          'OFFICIAL_SOLDES_WINDOWS before creating this campaign; never invent one.'
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`createCampaign: invalid Campaign —\n  ${errors.join('\n  ')}`);
  }

  return Object.freeze({
    id: input.id,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    countryIso: input.countryIso || null,
  });
}

/** True if `date` (ISO YYYY-MM-DD) falls within the Campaign's window, inclusive. */
function isActiveOn(campaign, date) {
  return date >= campaign.startDate && date <= campaign.endDate;
}

module.exports = {
  CAMPAIGN_TYPES,
  OFFICIAL_SOLDES_WINDOWS,
  createCampaign,
  isActiveOn,
};
