/* ============================================================
   Z FASHION — PRODUCT MODERATION (bounded context: fashion-domain)
   ============================================================
   Decided 2026-10-17 (task 8): a new product waits for a Z Fashion
   admin's approval before it appears on the site. Only the first
   publication is moderated — later changes of an approved product
   (price, stock, photos) show at once — and an admin can withdraw any
   product at any time, with a note the store sees. A refused or
   withdrawn product goes back to the queue when the store asks for a
   new review.

     pending  ──approve──▶ approved ──withdraw (note)──▶ rejected
        │                                                   │
        └──────refuse (note)──▶ rejected ◀──────────────────┘
                                   │
                    store asks a new review ──▶ pending

   Mirrors the fashion.products moderation columns and their checks
   (migration 20261017090000_z_fashion_product_moderation_v1.sql).
   ============================================================ */

const MODERATION_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);
const NOTE_MAX = 1000;

/** Admin decisions allowed from each status. */
const ADMIN_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['approved', 'rejected']),
  approved: Object.freeze(['rejected']),
  rejected: Object.freeze(['approved']),
});

/** Only an approved product may be shown, added to a cart or ordered. */
function isApproved(product) {
  return !!product && product.moderationStatus === 'approved';
}

function cleanNote(note) {
  if (note === undefined || note === null) return null;
  if (typeof note !== 'string') throw codeError('note_invalid', 'note must be text');
  const trimmed = note.trim();
  if (trimmed.length > NOTE_MAX) throw codeError('note_too_long', `note longer than ${NOTE_MAX} characters`);
  return trimmed || null;
}

function codeError(code, message) {
  const err = new Error(`${code}: ${message}`);
  err.code = code;
  return err;
}

/**
 * An admin's decision on a product. Returns the new moderation fields.
 * Refusing or withdrawing needs a note (shown to the store).
 *
 * @param {object} product           current product (moderationStatus)
 * @param {object} decision
 * @param {'approved'|'rejected'} decision.toStatus
 * @param {string} [decision.note]
 * @param {string} decision.adminUserId
 * @param {Date}   [decision.now]
 */
function decide(product, { toStatus, note, adminUserId, now = new Date() } = {}) {
  if (!product) throw codeError('not_found', 'no such product');
  if (!MODERATION_STATUSES.includes(toStatus) || toStatus === 'pending') throw codeError('invalid_decision', `unknown decision ${toStatus}`);
  if (!adminUserId) throw codeError('admin_required', 'an admin decides');
  const from = product.moderationStatus || 'pending';
  if (!(ADMIN_TRANSITIONS[from] || []).includes(toStatus)) {
    throw codeError('invalid_transition', `cannot go from ${from} to ${toStatus}`);
  }
  const cleaned = cleanNote(note);
  if (toStatus === 'rejected' && !cleaned) throw codeError('note_required', 'a note is required to refuse or withdraw a product');
  return Object.freeze({
    moderationStatus: toStatus,
    moderationNote: cleaned,
    moderatedAt: now.toISOString(),
    moderatedBy: adminUserId,
  });
}

/** The store asks for a new review of a refused or withdrawn product. */
function resubmit(product, { now = new Date() } = {}) {
  if (!product) throw codeError('not_found', 'no such product');
  if (product.moderationStatus !== 'rejected') throw codeError('invalid_transition', `only a refused product can be sent back for review (status ${product.moderationStatus})`);
  return Object.freeze({
    moderationStatus: 'pending',
    moderationNote: product.moderationNote || null,
    submittedAt: now.toISOString(),
  });
}

/** Moderation fields of a product the store has just created. */
function initialModeration(now = new Date()) {
  return Object.freeze({ moderationStatus: 'pending', moderationNote: null, moderatedAt: null, moderatedBy: null, submittedAt: now.toISOString() });
}

module.exports = { MODERATION_STATUSES, ADMIN_TRANSITIONS, NOTE_MAX, isApproved, decide, resubmit, initialModeration };
