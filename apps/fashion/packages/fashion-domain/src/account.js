/* ============================================================
   Z FASHION — CLIENT ACCOUNT (bounded context: fashion-domain)
   ============================================================
   Owns: Wishlist (Client ↔ Product) and Corner Follow (Client ↔
   Partner) — the two concrete account-side mechanics identified in
   both the earlier architecture reflection (2026-08-21, "Conta do
   Cliente") and the customer-side audit's "Conta do Cliente —
   inexistente" finding. Order history is deliberately NOT built here:
   it is a query over fashion.orders now that carts/orders carry
   clientUserId (see cart.js), not a new domain concept requiring its
   own module — see ACCOUNT-AND-IDENTITY.md.

   Same in-memory-list-of-immutable-records shape as cart.js — pure
   functions, no I/O, the SQL migration mirrors this exactly as two
   simple join tables (fashion.wishlist_items, fashion.corner_follows).

   Client identity itself (clientUserId) is NOT defined here — it is
   whatever the ZOS canonical identity bridge (zos.persons /
   zos.registry_bindings, per 20260809213000_zos_identity_bridge_v1.sql)
   resolves to, the same reuse-not-rebuild discipline
   ZOS-ALIGNMENT.md already applies to Partner/Organization identity.
   Z Fashion is not yet a registered domain_code in that bridge — see
   ACCOUNT-AND-IDENTITY.md "Open" for what registering it requires.
   ============================================================ */

function emptyWishlist() {
  return Object.freeze({ items: [] });
}

/**
 * @param {object} wishlist - emptyWishlist() shape
 * @param {string} clientUserId
 * @param {string} productId
 * @param {Date} [now]
 */
function addWishlistItem(wishlist, clientUserId, productId, { now = new Date() } = {}) {
  if (!clientUserId) throw new Error('addWishlistItem: clientUserId is required');
  if (!productId) throw new Error('addWishlistItem: productId is required');

  // Idempotent — adding a Product already on the wishlist is a no-op,
  // never a duplicate row a Client would see twice.
  const already = wishlist.items.some((i) => i.clientUserId === clientUserId && i.productId === productId);
  if (already) return wishlist;

  return Object.freeze({
    items: [...wishlist.items, Object.freeze({ clientUserId, productId, addedAt: now.toISOString() })],
  });
}

/**
 * @param {object} wishlist
 * @param {string} clientUserId
 * @param {string} productId
 */
function removeWishlistItem(wishlist, clientUserId, productId) {
  return Object.freeze({
    items: wishlist.items.filter((i) => !(i.clientUserId === clientUserId && i.productId === productId)),
  });
}

/** @returns {string[]} productIds this Client has wishlisted, most recent first */
function listWishlistProductIds(wishlist, clientUserId) {
  return wishlist.items
    .filter((i) => i.clientUserId === clientUserId)
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1))
    .map((i) => i.productId);
}

/** @returns {boolean} whether this exact Client/Product pair is wishlisted */
function isWishlisted(wishlist, clientUserId, productId) {
  return wishlist.items.some((i) => i.clientUserId === clientUserId && i.productId === productId);
}

function emptyCornerFollows() {
  return Object.freeze({ items: [] });
}

/**
 * Following a Corner is the account-side mechanic that makes "Nouvelle
 * Collection" Destaques (BRAND-VOICE.md) and back-in-stock-style
 * notifications meaningful per-Client, rather than every Client seeing
 * identical unpersonalized Homepage content — see the architecture
 * reflection's distinction between public-entrance curation (never
 * personalized) and authenticated-account personalization (legitimate
 * here).
 *
 * @param {object} follows - emptyCornerFollows() shape
 * @param {string} clientUserId
 * @param {string} partnerId
 * @param {Date} [now]
 */
function followCorner(follows, clientUserId, partnerId, { now = new Date() } = {}) {
  if (!clientUserId) throw new Error('followCorner: clientUserId is required');
  if (!partnerId) throw new Error('followCorner: partnerId is required');

  const already = follows.items.some((i) => i.clientUserId === clientUserId && i.partnerId === partnerId);
  if (already) return follows;

  return Object.freeze({
    items: [...follows.items, Object.freeze({ clientUserId, partnerId, followedAt: now.toISOString() })],
  });
}

function unfollowCorner(follows, clientUserId, partnerId) {
  return Object.freeze({
    items: follows.items.filter((i) => !(i.clientUserId === clientUserId && i.partnerId === partnerId)),
  });
}

/** @returns {string[]} partnerIds this Client follows */
function listFollowedPartnerIds(follows, clientUserId) {
  return follows.items.filter((i) => i.clientUserId === clientUserId).map((i) => i.partnerId);
}

module.exports = {
  emptyWishlist,
  addWishlistItem,
  removeWishlistItem,
  listWishlistProductIds,
  isWishlisted,
  emptyCornerFollows,
  followCorner,
  unfollowCorner,
  listFollowedPartnerIds,
};
