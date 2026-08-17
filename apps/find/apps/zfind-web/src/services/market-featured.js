/* ============================================================
   Z FIND — MARKET FEATURED FOUNDATION

   This is NOT the future paid-placement persistence model.

   Current authority:
   - exactly six visible positions per Country Market Page;
   - source-backed published opportunities only;
   - deterministic preview selection while the commercial assignment
     model does not yet exist;
   - no coupling to organic Search ranking;
   - no parent-country substitution for exact sub-country markets.

   A later dedicated database/commercial phase will replace only the
   assignment source, not the six-slot public product contract.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.marketFeatured = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const FEATURED_CAPACITY = 6;
  const FEATURED_SELECTION_MODE =
    'source-backed-market-preview';

  function stableAssetId(card) {
    return card && typeof card.assetId === 'string'
      ? card.assetId
      : '';
  }

  function belongsToMarket(card, market) {
    if (!card || !market || !market.searchScope) {
      return false;
    }

    const scope = market.searchScope;

    if (scope.kind === 'country_iso') {
      return (
        typeof card.countryIso === 'string' &&
        card.countryIso === scope.value
      );
    }

    if (scope.kind === 'exact_market') {
      // Exact-market authority (England, Scotland, Wales, Northern
      // Ireland, Dubai) must never be inferred from parent country ISO.
      // A4 will add an exact market-scoped read contract. Until then,
      // only a future source-backed card.marketKey may qualify.
      return (
        typeof card.marketKey === 'string' &&
        card.marketKey === scope.value
      );
    }

    return false;
  }

  function selectPreviewCards(cards, market) {
    return (Array.isArray(cards) ? cards : [])
      .filter(card => belongsToMarket(card, market))
      .slice()
      .sort((a, b) =>
        stableAssetId(a).localeCompare(stableAssetId(b), 'en')
      )
      .slice(0, FEATURED_CAPACITY);
  }

  function buildSlots(cards) {
    const safeCards = Array.isArray(cards)
      ? cards.slice(0, FEATURED_CAPACITY)
      : [];

    return Array.from(
      { length: FEATURED_CAPACITY },
      (_, index) => Object.freeze({
        position: index + 1,
        card: safeCards[index] || null
      })
    );
  }

  return Object.freeze({
    FEATURED_CAPACITY,
    FEATURED_SELECTION_MODE,
    belongsToMarket,
    selectPreviewCards,
    buildSlots
  });
});
