/* Store payouts — see src/payouts.js header (decided 2026-10-15). */
const assert = require('assert');
const p = require('../src/payouts');

// --- payout day: Monday UTC
assert.strictEqual(p.nextPayoutDate('2026-10-19T00:00:00Z').toISOString(), '2026-10-19T00:00:00.000Z', 'a Monday at midnight is that Monday');
assert.strictEqual(p.nextPayoutDate('2026-10-19T08:00:00Z').toISOString(), '2026-10-26T00:00:00.000Z', 'later on Monday waits a week');
assert.strictEqual(p.nextPayoutDate('2026-10-16T12:00:00Z').toISOString(), '2026-10-19T00:00:00.000Z');

// --- amounts: commission on what the Client kept
assert.deepStrictEqual(p.payoutAmounts(15500), { grossMinorUnits: 15500, refundedMinorUnits: 0, keptMinorUnits: 15500, commissionRatePercent: 8, commissionMinorUnits: 1240, netMinorUnits: 14260 });
assert.deepStrictEqual(p.payoutAmounts(15500, 6000), { grossMinorUnits: 15500, refundedMinorUnits: 6000, keptMinorUnits: 9500, commissionRatePercent: 10, commissionMinorUnits: 950, netMinorUnits: 8550 },
  'a return lowers the ticket, and its tier');
assert.strictEqual(p.payoutAmounts(5000, 5000).netMinorUnits, 0);
assert.strictEqual(p.payoutAmounts(5000, 5000).commissionMinorUnits, 0, 'nothing kept, no commission');
assert.throws(() => p.payoutAmounts(-1), /non-negative/);

// --- states
const now = new Date('2026-11-10T10:00:00Z');
assert.strictEqual(p.payoutLine({ grossMinorUnits: 10000, deliveredAt: null, now }).state, 'awaiting_delivery');
let line = p.payoutLine({ grossMinorUnits: 10000, deliveredAt: '2026-11-01T09:00:00Z', now });
assert.strictEqual(line.state, 'return_window');
assert.strictEqual(line.eligibleAt, '2026-11-15T09:00:00.000Z');
assert.strictEqual(line.expectedPayoutDate, '2026-11-16T00:00:00.000Z', 'first Monday after the window');
line = p.payoutLine({ grossMinorUnits: 10000, deliveredAt: '2026-10-20T09:00:00Z', now });
assert.strictEqual(line.state, 'due');
assert.strictEqual(line.netMinorUnits, 9000);
assert.strictEqual(line.expectedPayoutDate, '2026-11-16T00:00:00.000Z', 'due now, next Monday');
assert.strictEqual(p.payoutLine({ grossMinorUnits: 10000, deliveredAt: '2026-10-20T09:00:00Z', openReturns: 1, now }).state, 'return_in_progress');
assert.strictEqual(p.payoutLine({ grossMinorUnits: 10000, refundedMinorUnits: 10000, deliveredAt: '2026-10-20T09:00:00Z', now }).state, 'nothing_due');
line = p.payoutLine({ grossMinorUnits: 10000, deliveredAt: '2026-10-20T09:00:00Z', transfer: { status: 'transferred' }, now });
assert.strictEqual(line.state, 'transferred');
assert.strictEqual(line.expectedPayoutDate, null);
assert.strictEqual(p.payoutLine({ grossMinorUnits: 10000, deliveredAt: '2026-10-20T09:00:00Z', transfer: { status: 'failed' }, now }).state, 'due', 'a failed transfer is retried');

// --- summary
const lines = [
  p.payoutLine({ grossMinorUnits: 10000, deliveredAt: '2026-10-20T09:00:00Z', now }),
  p.payoutLine({ grossMinorUnits: 20000, deliveredAt: null, now }),
  p.payoutLine({ grossMinorUnits: 5000, deliveredAt: '2026-10-01T09:00:00Z', transfer: { status: 'transferred' }, now }),
];
assert.deepStrictEqual(p.payoutSummary(lines), { dueMinorUnits: 9000, upcomingMinorUnits: 18400, transferredMinorUnits: 4500 });

console.log('payouts.js: all invariant checks passed.');
