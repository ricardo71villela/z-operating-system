/* ============================================================
   Z FASHION — ONBOARDING (bounded context: fashion-domain)
   ============================================================
   Owns: the Partner application state machine. A Partner cannot
   reach 'active' without satisfying the gates already established
   elsewhere in this domain — this module enforces that as a
   transition precondition, not as a UI checklist someone could skip.
   ============================================================ */

const STATUSES = Object.freeze([
  'applied', 'under_review', 'approved', 'rejected', 'active', 'suspended',
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  applied: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: ['active'],
  active: ['suspended'],
  suspended: ['active'],
  rejected: [],
});

const FEED_RELIABILITY_TIERS = Object.freeze(['live', 'degraded']);

function createApplication(partnerId, { now = new Date() } = {}) {
  if (!partnerId) throw new Error('createApplication: partnerId is required');
  return Object.freeze({
    partnerId,
    status: 'applied',
    feedReliabilityTier: null,
    history: [{ status: 'applied', at: now.toISOString() }],
  });
}

/**
 * @param {object} application - createApplication() shape
 * @param {string} toStatus
 * @param {object} context
 * @param {object} [context.partner] - required when toStatus === 'active'
 *   (partner.js Partner record) — checked for the minor-safe gate.
 * @param {string} [context.feedReliabilityTier] - required when
 *   toStatus === 'active', per STOCK-FEED-CONTRACT.md's degraded-mode
 *   distinction — a Partner never reaches 'active' without declaring which
 *   tier they operate at.
 * @param {Date} [context.now]
 */
function transition(application, toStatus, context = {}) {
  const { partner, feedReliabilityTier, now = new Date() } = context;
  const allowed = ALLOWED_TRANSITIONS[application.status] || [];

  if (!allowed.includes(toStatus)) {
    throw new Error(
      `transition: cannot move from "${application.status}" to "${toStatus}" — ` +
      `allowed: ${allowed.length ? allowed.join(', ') : '(terminal state)'}`
    );
  }

  if (toStatus === 'active') {
    if (!feedReliabilityTier || !FEED_RELIABILITY_TIERS.includes(feedReliabilityTier)) {
      throw new Error(
        'transition: cannot activate a Partner without a declared feed ' +
        'reliability tier ("live" or "degraded") — see STOCK-FEED-CONTRACT.md. ' +
        'Never defaults to "live" silently.'
      );
    }
    if (!partner) {
      throw new Error('transition: activating a Partner requires the Partner record, to verify compliance gates');
    }
    if (
      (partner.ageSegments.includes('baby') || partner.ageSegments.includes('children') || partner.ageSegments.includes('youth')) &&
      !partner.minorSafeDataAcknowledged
    ) {
      throw new Error(
        'transition: cannot activate a Partner declaring baby/children/youth ' +
        'eligibility without the minor-safe data acknowledgment — same gate ' +
        'as createPartner(), re-checked here because a Partner record could ' +
        'in principle be constructed elsewhere without going through it.'
      );
    }
  }

  return Object.freeze({
    ...application,
    status: toStatus,
    feedReliabilityTier: toStatus === 'active' ? feedReliabilityTier : application.feedReliabilityTier,
    history: [...application.history, { status: toStatus, at: now.toISOString() }],
  });
}

/* Back-office review decisions (2026-10-15). The transition graph and
   activation gates stay in transition() above and in the database
   trigger; this only adds what a human decision must carry:
   - rejecting or suspending a store requires a note, because the store
     is shown why;
   - activating requires the stock mode (feed reliability tier);
   - notes are plain text, at most 1000 characters.
   Returns { field, code } pairs, empty when the decision is complete. */
const DECISIONS_REQUIRING_NOTE = Object.freeze(['rejected', 'suspended']);
const MAX_DECISION_NOTE_LENGTH = 1000;

function reviewDecisionErrors({ toStatus, note, feedReliabilityTier } = {}) {
  const errors = [];
  if (!STATUSES.includes(toStatus) || toStatus === 'applied') errors.push({ field: 'toStatus', code: 'unknown_value' });
  const text = typeof note === 'string' ? note.trim() : '';
  if (DECISIONS_REQUIRING_NOTE.includes(toStatus) && text.length === 0) errors.push({ field: 'note', code: 'required' });
  if (text.length > MAX_DECISION_NOTE_LENGTH) errors.push({ field: 'note', code: 'too_long' });
  if (toStatus === 'active' && !FEED_RELIABILITY_TIERS.includes(feedReliabilityTier)) {
    errors.push({ field: 'feedReliabilityTier', code: 'required' });
  }
  return errors;
}

module.exports = {
  STATUSES, ALLOWED_TRANSITIONS, FEED_RELIABILITY_TIERS, createApplication, transition,
  DECISIONS_REQUIRING_NOTE, MAX_DECISION_NOTE_LENGTH, reviewDecisionErrors,
};
