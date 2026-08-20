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

module.exports = { selectHero };
