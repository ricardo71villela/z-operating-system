const assert = require('assert');
const m = require('../src/moderation');
const { priceCart } = require('../src/checkout');

const now = new Date('2026-10-17T10:00:00Z');
const pending = { id: 'p', moderationStatus: 'pending' };

// New products wait.
assert.deepStrictEqual({ ...m.initialModeration(now) }, { moderationStatus: 'pending', moderationNote: null, moderatedAt: null, moderatedBy: null, submittedAt: now.toISOString() });
assert.strictEqual(m.isApproved(pending), false);
assert.strictEqual(m.isApproved({ moderationStatus: 'approved' }), true);
assert.strictEqual(m.isApproved({}), false, 'a product without a status is never shown');
assert.strictEqual(m.isApproved(null), false);

// Approve.
const ok = m.decide(pending, { toStatus: 'approved', adminUserId: 'admin', now });
assert.strictEqual(ok.moderationStatus, 'approved');
assert.strictEqual(ok.moderatedBy, 'admin');
assert.strictEqual(ok.moderatedAt, now.toISOString());

// Refuse needs a note; whitespace is not a note.
assert.throws(() => m.decide(pending, { toStatus: 'rejected', adminUserId: 'admin' }), /note_required/);
assert.throws(() => m.decide(pending, { toStatus: 'rejected', note: '   ', adminUserId: 'admin' }), /note_required/);
assert.throws(() => m.decide(pending, { toStatus: 'rejected', note: 'x'.repeat(1001), adminUserId: 'admin' }), /note_too_long/);
const no = m.decide(pending, { toStatus: 'rejected', note: '  Photo floue  ', adminUserId: 'admin', now });
assert.strictEqual(no.moderationNote, 'Photo floue');

// Withdraw an approved product (note required); reinstate a refused one.
assert.throws(() => m.decide({ moderationStatus: 'approved' }, { toStatus: 'rejected', adminUserId: 'admin' }), /note_required/);
assert.strictEqual(m.decide({ moderationStatus: 'approved' }, { toStatus: 'rejected', note: 'Contrefaçon signalée', adminUserId: 'a' }).moderationStatus, 'rejected');
assert.strictEqual(m.decide({ moderationStatus: 'rejected' }, { toStatus: 'approved', adminUserId: 'a' }).moderationStatus, 'approved');

// Invalid moves.
assert.throws(() => m.decide({ moderationStatus: 'approved' }, { toStatus: 'approved', adminUserId: 'a' }), /invalid_transition/);
assert.throws(() => m.decide(pending, { toStatus: 'pending', adminUserId: 'a' }), /invalid_decision/);
assert.throws(() => m.decide(pending, { toStatus: 'approved' }), /admin_required/);

// The store sends a refused product back for review; the last note stays visible.
const back = m.resubmit({ moderationStatus: 'rejected', moderationNote: 'Photo floue' }, { now });
assert.deepStrictEqual({ ...back }, { moderationStatus: 'pending', moderationNote: 'Photo floue', submittedAt: now.toISOString() });
assert.throws(() => m.resubmit(pending), /invalid_transition/);
assert.throws(() => m.resubmit({ moderationStatus: 'approved' }), /invalid_transition/);

// A product that is not approved cannot be bought.
const priced = priceCart({
  items: [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 1 }],
  productsById: { a: { id: 'a', partnerId: 'S', moderationStatus: 'approved' }, b: { id: 'b', partnerId: 'S', moderationStatus: 'pending' } },
  pricesById: { a: 1000, b: 1000 },
  stockById: { a: { quantityAvailable: 5, quantityReserved: 0 }, b: { quantityAvailable: 5, quantityReserved: 0 } },
  activePartnerIds: ['S'],
});
assert.deepStrictEqual(priced.lines.map((l) => l.status), ['ok', 'unavailable']);
assert.strictEqual(priced.totalMinorUnits, 1000);

console.log('Z_FASHION_MODERATION=PASS');
