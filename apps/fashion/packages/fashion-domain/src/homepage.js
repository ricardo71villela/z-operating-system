/* ============================================================
   Z FASHION — HOMEPAGE (bounded context: fashion-domain)
   ============================================================
   Owns: only the Hero-selection rule — an active Campaign wins over
   editorial content. Everything else in the Homepage composition
   (Segment tiles, Category strip, Corners directory, All Sale CTA,
   footer trust signals) is page structure, not domain logic, and is
   documented in FRAMES-AND-RECOMMENDATIONS.md rather than coded here.
   ============================================================ */

const { isActiveOn } = require('./campaign');

/**
 * @param {object[]} campaigns - Campaign records (campaign.js)
 * @param {object[]} destaques - editorial Destaque entries, ordered by
 *                                priority; shape is intentionally opaque
 *                                to this module (Destaques content is not
 *                                yet modeled — see FRAMES-AND-RECOMMENDATIONS.md)
 * @param {string} today - ISO date (YYYY-MM-DD)
 * @returns {{ type: 'campaign', campaign: object } | { type: 'destaque', destaque: object } | null}
 */
function selectHero(campaigns, destaques, today) {
  const active = campaigns.find((c) => isActiveOn(c, today));
  if (active) return { type: 'campaign', campaign: active };

  if (destaques && destaques.length > 0) {
    return { type: 'destaque', destaque: destaques[0] };
  }

  return null;
}

const DEFAULT_MINIMUM_PQS_FOR_SPONSORSHIP = 60;

/**
 * A Sponsored Destaque slot is only purchasable by a Partner clearing a
 * minimum Partner Quality Score — curation-over-price stays true even in
 * the paid slot (see FRAMES-AND-RECOMMENDATIONS.md "Sponsored Destaques").
 */
function isEligibleForSponsorship(
  partnerQualityScore,
  { minimumScore = DEFAULT_MINIMUM_PQS_FOR_SPONSORSHIP } = {}
) {
  return typeof partnerQualityScore === 'number' && partnerQualityScore >= minimumScore;
}

/**
 * @param {object[]} sponsoredSlots - { id, partnerId, startDate, endDate,
 *   partnerQualityScore } — day/week windows a Partner has purchased.
 * @param {string} today - ISO date (YYYY-MM-DD)
 * @returns {object|null} the active, quality-gated Sponsored Destaque, or
 *   null — never fabricated, and never the Corners directory, which is
 *   not a sellable slot at all (see FRAMES-AND-RECOMMENDATIONS.md).
 */
function selectSponsoredDestaque(sponsoredSlots, today, options = {}) {
  const active = (sponsoredSlots || []).filter(
    (s) => s.startDate <= today && today <= s.endDate
  );
  const eligible = active.filter((s) =>
    isEligibleForSponsorship(s.partnerQualityScore, options)
  );
  return eligible[0] || null;
}

module.exports = {
  selectHero,
  DEFAULT_MINIMUM_PQS_FOR_SPONSORSHIP,
  isEligibleForSponsorship,
  selectSponsoredDestaque,
};
