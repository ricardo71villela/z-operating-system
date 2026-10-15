/* ============================================================
   Z FASHION — STORE PAYOUTS (bounded context: fashion-domain)
   ============================================================
   Decided 2026-10-15 (Ricardo): a store is paid every week for its
   CLOSED sales — a ticket whose parcel was delivered and whose 14-day
   return window has ended, with no return still in progress. The
   store never has to give money back, and always sees how much it
   will receive and when.

   - Amount: what the Client kept (ticket − refunded returns), minus
     the Z Fashion commission computed on that kept amount with the
     ticket tiers (commission.js). A fully returned ticket pays nothing
     and costs the store nothing.
   - Stripe processing fees are paid by Z Fashion (inside the
     commission); the monthly subscription is billed separately, never
     deducted here.
   - Payout day: Monday (UTC). A ticket that becomes due is paid on the
     first Monday on or after that moment.

   Mirrored by fashion.partner_payout_lines() in SQL
   (migration 20261016150000_z_fashion_store_payouts_v1.sql).
   ============================================================ */

const { ticketCommissionRatePercent, ticketCommissionOwedMinorUnits } = require('./commission');

const RETURN_WINDOW_DAYS = 14;
const PAYOUT_WEEKDAY = 1; // Monday (UTC)

const STATES = Object.freeze([
  'awaiting_delivery',   // paid, parcel not delivered yet
  'return_window',       // delivered, the Client can still return items
  'return_in_progress',  // window over but a return is still open
  'due',                 // closed sale: paid at the next payout run
  'transferred',         // sent to the store's Stripe account
  'nothing_due',         // everything was returned
]);

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * 86400000);
}

/** First payout day (Monday 00:00 UTC) on or after `date`. */
function nextPayoutDate(date) {
  const d = new Date(date);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (day.getTime() < d.getTime()) day.setUTCDate(day.getUTCDate() + 1);
  while (day.getUTCDay() !== PAYOUT_WEEKDAY) day.setUTCDate(day.getUTCDate() + 1);
  return day;
}

/** Kept amount, commission and net for one ticket. */
function payoutAmounts(grossMinorUnits, refundedMinorUnits = 0) {
  if (!Number.isInteger(grossMinorUnits) || grossMinorUnits < 0) throw new Error('payoutAmounts: gross must be a non-negative integer');
  if (!Number.isInteger(refundedMinorUnits) || refundedMinorUnits < 0) throw new Error('payoutAmounts: refunded must be a non-negative integer');
  const kept = Math.max(0, grossMinorUnits - refundedMinorUnits);
  const commissionRatePercent = ticketCommissionRatePercent(kept);
  const commissionMinorUnits = ticketCommissionOwedMinorUnits(kept);
  return { grossMinorUnits, refundedMinorUnits, keptMinorUnits: kept, commissionRatePercent, commissionMinorUnits, netMinorUnits: kept - commissionMinorUnits };
}

/**
 * @param {object} args
 * @param {number} args.grossMinorUnits      the store's ticket
 * @param {number} [args.refundedMinorUnits] refunds of this store's returned items
 * @param {string|null} args.deliveredAt     shipment delivered_at
 * @param {number} [args.openReturns]        returns requested / approved / in transit
 * @param {object|null} [args.transfer]      { status: 'transferred'|'nothing_due'|... }
 * @param {Date} [args.now]
 */
function payoutLine({ grossMinorUnits, refundedMinorUnits = 0, deliveredAt, openReturns = 0, transfer = null, now = new Date() }) {
  const amounts = payoutAmounts(grossMinorUnits, refundedMinorUnits);
  const eligibleAt = deliveredAt ? addDays(deliveredAt, RETURN_WINDOW_DAYS) : null;
  let state;
  if (transfer && (transfer.status === 'transferred' || transfer.status === 'nothing_due')) state = transfer.status;
  else if (!deliveredAt) state = 'awaiting_delivery';
  else if (eligibleAt.getTime() > now.getTime()) state = 'return_window';
  else if (openReturns > 0) state = 'return_in_progress';
  else state = amounts.netMinorUnits > 0 ? 'due' : 'nothing_due';
  return {
    ...amounts,
    state,
    eligibleAt: eligibleAt ? eligibleAt.toISOString() : null,
    expectedPayoutDate: state === 'transferred' || state === 'nothing_due' || !eligibleAt
      ? null
      : nextPayoutDate(state === 'return_window' ? eligibleAt : now).toISOString(),
  };
}

/** Totals for the store's dashboard. */
function payoutSummary(lines) {
  const sum = (states) => lines.filter((l) => states.includes(l.state)).reduce((s, l) => s + l.netMinorUnits, 0);
  return {
    dueMinorUnits: sum(['due']),
    upcomingMinorUnits: sum(['awaiting_delivery', 'return_window', 'return_in_progress']),
    transferredMinorUnits: sum(['transferred']),
  };
}

module.exports = { RETURN_WINDOW_DAYS, PAYOUT_WEEKDAY, STATES, nextPayoutDate, payoutAmounts, payoutLine, payoutSummary };
