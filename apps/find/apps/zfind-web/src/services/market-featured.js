/* ============================================================
   Z FIND — MARKET FEATURED (« À la une »)

   Authority:
   - exactly six visible positions per Country Market Page (three in
     the Search rail);
   - only PAID highlights (« mises en avant », migration
     20261029220000: zfind_public_highlights) fill them, in the rotating
     order the database returns; an unpaid listing is never labelled
     « À la une »;
   - no coupling to organic Search ranking;
   - no parent-country substitution for exact sub-country markets.

   selectPreviewCards (deterministic, unpaid) is kept only for the demo
   mode and historical tests; the runtime uses selectPaidCards.
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
  const FEATURED_SELECTION_MODE = 'paid-highlights-rotation';

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

  /** Paid highlights only, in the order of `paid` (rows from
      zfind_public_highlights: { property_id | development_id }). */
  function selectPaidCards(cards, market, paid) {
    const order = new Map();
    (Array.isArray(paid) ? paid : []).forEach((row, index) => {
      const id = row && (row.property_id || row.development_id);
      if (typeof id === 'string' && id && !order.has(id)) order.set(id, index);
    });
    return (Array.isArray(cards) ? cards : [])
      .filter(card => belongsToMarket(card, market) && order.has(stableAssetId(card)))
      .sort((a, b) => order.get(stableAssetId(a)) - order.get(stableAssetId(b)))
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
    selectPaidCards,
    buildSlots
  });
});
