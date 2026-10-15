/* ============================================================
   Z FASHION PARTNER — store payouts (Stripe Connect)
   ============================================================
   Weekly run: every due ticket (delivered > 14 days ago, no open
   return) is claimed in the database, then transferred to the store's
   connected account, funded by the Order's own charge
   (source_transaction). Never twice: the claim locks the ticket, and
   before any retry the run asks Stripe whether a transfer for this
   Order and store already exists.
   ============================================================ */

const { nextPayoutDate, payoutSummary } = require('../../../packages/fashion-domain/src/payouts');

/** Stripe account object -> the status columns we keep. */
function accountStatus(account) {
  return {
    stripeAccountId: account.id,
    detailsSubmitted: !!account.details_submitted,
    transfersActive: !!(account.capabilities && account.capabilities.transfers === 'active'),
    payoutsEnabled: !!account.payouts_enabled,
    requirementsDue: (account.requirements && account.requirements.currently_due) || [],
  };
}

async function refreshAccount({ pool, db, stripe }, partnerId) {
  const saved = await db.getPayoutAccountPg(pool, partnerId);
  if (!saved) return null;
  const account = await stripe.retrieveAccount(saved.stripeAccountId);
  return db.upsertPayoutAccountPg(pool, partnerId, accountStatus(account));
}

/** Adds the expected payout date to each line (payouts.js rule). */
function withExpectedDates(lines, now = new Date()) {
  return lines.map((l) => {
    let expected = null;
    if (l.state === 'return_window' && l.eligibleAt) expected = nextPayoutDate(l.eligibleAt).toISOString();
    else if (l.state === 'due' || l.state === 'return_in_progress') expected = nextPayoutDate(now).toISOString();
    return { ...l, expectedPayoutDate: expected };
  });
}

function summarize(lines) {
  return payoutSummary(lines);
}

async function runPayouts({ pool, db, stripe, now = new Date(), log = console }) {
  const due = (await db.listPayoutLinesPg(pool, null)).filter((l) => l.state === 'due');
  const result = { due: due.length, transferred: 0, transferredMinorUnits: 0, waitingForAccount: 0, failed: 0, skipped: 0 };

  // Fresh account status for every store with something due.
  const partnerIds = [...new Set(due.map((l) => l.partnerId))];
  for (const partnerId of partnerIds) {
    try { await refreshAccount({ pool, db, stripe }, partnerId); } catch (err) { log.error('payouts: account refresh failed', partnerId, err.code || err.message); }
  }

  for (const line of due) {
    const claim = await db.claimPartnerTransferPg(pool, line.orderId, line.partnerId);
    if (!claim) {
      const account = await db.getPayoutAccountPg(pool, line.partnerId);
      if (!account || !account.transfersActive) result.waitingForAccount += 1; else result.skipped += 1;
      continue;
    }
    const transferGroup = `order_${claim.orderId}`;
    try {
      const existing = await stripe.listTransfers({ transferGroup, destination: claim.stripeAccountId });
      let transfer = (existing.data || []).find((t) => t.metadata && t.metadata.partner_id === claim.partnerId && !t.reversed);
      if (!transfer) {
        let sourceTransaction = null;
        if (claim.paymentIntentId) {
          const intent = await stripe.retrievePaymentIntent(claim.paymentIntentId);
          sourceTransaction = typeof intent.latest_charge === 'string' ? intent.latest_charge : (intent.latest_charge && intent.latest_charge.id) || null;
        }
        transfer = await stripe.createTransfer({
          amountMinorUnits: claim.netMinorUnits, destination: claim.stripeAccountId, transferGroup,
          sourceTransaction, orderId: claim.orderId, partnerId: claim.partnerId, attempt: claim.attempt,
        });
      }
      await db.completePartnerTransferPg(pool, claim.orderId, claim.partnerId, transfer.id);
      result.transferred += 1;
      result.transferredMinorUnits += claim.netMinorUnits;
    } catch (err) {
      result.failed += 1;
      const reason = err.stripeCode || err.code || err.message;
      log.error('payouts: transfer failed', claim.orderId, claim.partnerId, reason);
      await db.failPartnerTransferPg(pool, claim.orderId, claim.partnerId, String(reason));
    }
  }
  return result;
}

module.exports = { accountStatus, refreshAccount, withExpectedDates, summarize, runPayouts };
