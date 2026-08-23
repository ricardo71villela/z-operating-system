/* Run with: node apps/fashion/packages/fashion-domain/tests/account.test.js */

const assert = require('assert');
const {
  emptyWishlist, addWishlistItem, removeWishlistItem, listWishlistProductIds, isWishlisted,
  emptyCornerFollows, followCorner, unfollowCorner, listFollowedPartnerIds,
} = require('../src/account');

// --- Wishlist ---
let wishlist = emptyWishlist();
assert.throws(() => addWishlistItem(wishlist, null, 'prod_shoe'), /clientUserId is required/);
assert.throws(() => addWishlistItem(wishlist, 'client_ines', null), /productId is required/);

wishlist = addWishlistItem(wishlist, 'client_ines', 'prod_shoe', { now: new Date('2026-08-20T10:00:00.000Z') });
wishlist = addWishlistItem(wishlist, 'client_ines', 'prod_bag', { now: new Date('2026-08-21T10:00:00.000Z') });
wishlist = addWishlistItem(wishlist, 'client_tiago', 'prod_shoe', { now: new Date('2026-08-21T11:00:00.000Z') });

assert.strictEqual(isWishlisted(wishlist, 'client_ines', 'prod_shoe'), true);
assert.strictEqual(isWishlisted(wishlist, 'client_ines', 'prod_perfume'), false);

// Each Client only ever sees their own wishlist — never another
// Client's items, even for the same Product.
assert.deepStrictEqual(listWishlistProductIds(wishlist, 'client_ines'), ['prod_bag', 'prod_shoe']); // most recent first
assert.deepStrictEqual(listWishlistProductIds(wishlist, 'client_tiago'), ['prod_shoe']);

// Adding the same Product twice is idempotent — never a duplicate entry.
const beforeDupe = wishlist.items.length;
wishlist = addWishlistItem(wishlist, 'client_ines', 'prod_shoe');
assert.strictEqual(wishlist.items.length, beforeDupe);

// Removing only affects the exact Client/Product pair.
wishlist = removeWishlistItem(wishlist, 'client_ines', 'prod_shoe');
assert.strictEqual(isWishlisted(wishlist, 'client_ines', 'prod_shoe'), false);
assert.strictEqual(isWishlisted(wishlist, 'client_tiago', 'prod_shoe'), true); // untouched

// --- Corner Follows ---
let follows = emptyCornerFollows();
assert.throws(() => followCorner(follows, null, 'partner_a'), /clientUserId is required/);
assert.throws(() => followCorner(follows, 'client_ines', null), /partnerId is required/);

follows = followCorner(follows, 'client_ines', 'partner_atelier');
follows = followCorner(follows, 'client_ines', 'partner_corbin');
assert.deepStrictEqual(listFollowedPartnerIds(follows, 'client_ines').sort(), ['partner_atelier', 'partner_corbin']);
assert.deepStrictEqual(listFollowedPartnerIds(follows, 'client_tiago'), []);

// Idempotent, same as Wishlist.
const beforeDupeFollow = follows.items.length;
follows = followCorner(follows, 'client_ines', 'partner_atelier');
assert.strictEqual(follows.items.length, beforeDupeFollow);

follows = unfollowCorner(follows, 'client_ines', 'partner_atelier');
assert.deepStrictEqual(listFollowedPartnerIds(follows, 'client_ines'), ['partner_corbin']);

console.log('account.js: all invariant checks passed.');
