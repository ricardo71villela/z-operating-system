/* ============================================================
   Z FASHION — CORNER CONFIG (bounded context: fashion-domain)
   ============================================================
   Owns: what a Partner may actually customize about their Corner.
   Per the "Stakeholder-pragmatic design" corollary (Z-FASHION-
   STRATEGY.md): when Partner wants full custom layout and Platform
   needs consistent components to scale, the resolution is
   configuration within a shared component system, not custom code
   per Partner. This module encodes that by construction — the schema
   below is the entire surface a Partner can configure; there is no
   escape hatch to arbitrary layout or markup.
   ============================================================ */

const MAX_BYLINE_LENGTH = 140;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * @param {object} input
 * @param {string} input.partnerId
 * @param {string} input.displayName
 * @param {string} [input.byline] - short, in the Partner's own voice, per
 *   BRAND-VOICE.md (e.g. "Atelier fondé en 2015 à Paris") — capped, never
 *   a free-form content block.
 * @param {string} [input.accentColor] - hex; the only color a Partner
 *   controls, everything else (typography, spacing, component shapes)
 *   stays platform-owned.
 * @param {string} input.logoUrl
 */
function createCornerConfig(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    throw new Error('createCornerConfig: input must be an object');
  }
  if (!input.partnerId) errors.push('partnerId is required');
  if (!input.displayName) errors.push('displayName is required');
  if (!input.logoUrl) errors.push('logoUrl is required');

  if (input.byline && input.byline.length > MAX_BYLINE_LENGTH) {
    errors.push(
      `byline exceeds ${MAX_BYLINE_LENGTH} characters (${input.byline.length}) — ` +
      'this is a short identity line, not a content block; longer storytelling ' +
      'belongs in Destaques editorial content, not the Corner header.'
    );
  }

  if (input.accentColor && !HEX_COLOR_RE.test(input.accentColor)) {
    errors.push(`accentColor "${input.accentColor}" is not a valid 6-digit hex color`);
  }

  if (errors.length > 0) {
    throw new Error(`createCornerConfig: invalid Corner config —\n  ${errors.join('\n  ')}`);
  }

  return Object.freeze({
    partnerId: input.partnerId,
    displayName: input.displayName,
    byline: input.byline || null,
    accentColor: input.accentColor || null,
    logoUrl: input.logoUrl,
  });
}

module.exports = { MAX_BYLINE_LENGTH, createCornerConfig };
