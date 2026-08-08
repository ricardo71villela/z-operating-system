/* ============================================================
   Z FIND — VERSIONED CANONICAL STORE
   ============================================================
   Replaces the Phase 3 proof-of-concept's flat {entities:{...}}
   object. Two structures, never conflated:

     current  — the current-state projection for this Geography import
                bounded context (what most reads want)
     history  — an APPEND-ONLY log of every mutation, including
                confirmations of unchanged records. Never edited,
                never deleted from. It is the authoritative mutation
                history for this local import store; it is NOT a second
                global ZOS Registry. `current` is derived from it.

   Rollback is implemented as a COMPENSATING append to history (a new
   entry that restores a prior `before` state), never as deletion of
   past entries — the history of "we rolled this back" is itself
   preserved, which is what makes this auditable.
   ============================================================ */

let _seq = 0;
function nextSeq() { return ++_seq; }

function createVersionedStore() {
  return {
    current: {},   // entityId -> current record
    history: [],   // append-only: [{seq, entityId, batchId, changeType, before, after, validFrom, timestamp, provenance}]
  };
}

/**
 * Records a mutation. `changeType` includes 'confirmed' for unchanged
 * records seen-but-not-modified — audit queries need to be able to
 * answer "was this checked against source X and found stable?", not
 * only "when did this last change?".
 */
function recordChange(store, { entityId, batchId, changeType, before, after, provenance }) {
  const entry = {
    seq: nextSeq(),
    entityId,
    batchId,
    changeType,
    before: before ? { ...before } : null,
    after: after ? { ...after } : null,
    validFrom: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    provenance,
  };
  store.history.push(entry);

  if (after) {
    store.current[entityId] = {
      ...after,
      lastChangedBatchId: changeType === 'confirmed'
        ? (store.current[entityId] ? store.current[entityId].lastChangedBatchId : null)
        : batchId,
      lastSeenBatchId: batchId,
    };
  }
  return entry;
}

function getCurrent(store, entityId) {
  return store.current[entityId] || null;
}

function getHistory(store, entityId) {
  return store.history.filter(h => h.entityId === entityId).sort((a,b) => a.seq - b.seq);
}

function getChangesByBatch(store, batchId) {
  return store.history.filter(h => h.batchId === batchId).sort((a,b) => a.seq - b.seq);
}

/** Temporal query by wall-clock time. NOTE: resolution is limited to
    the millisecond (ISO timestamp precision) — if multiple changes to
    the same entity occur within the same millisecond (plausible in a
    fast batch pipeline), use getStateAtSeq() below instead, which is
    exact. */
function getStateAt(store, entityId, isoTimestamp) {
  const relevant = getHistory(store, entityId).filter(h => h.validFrom <= isoTimestamp);
  if (!relevant.length) return null;
  return relevant[relevant.length - 1].after;
}

/** Precise temporal query by sequence number — exact, immune to
    timestamp resolution limits. Use currentSeq(store) to capture a
    checkpoint to query against later. */
function currentSeq(store) {
  return store.history.length ? store.history[store.history.length - 1].seq : 0;
}
function getStateAtSeq(store, entityId, seq) {
  const relevant = getHistory(store, entityId).filter(h => h.seq <= seq);
  if (!relevant.length) return null;
  return relevant[relevant.length - 1].after;
}

/**
 * Real rollback: for every history entry belonging to this batch, in
 * reverse order, append a COMPENSATING entry restoring `before`. If
 * `before` is null (the entity was created by this batch), the
 * compensating entry deactivates it rather than deleting it — nothing
 * ever disappears from history or from `current` silently.
 */
function rollbackBatch(store, batchId, revertingBatchId) {
  const entries = getChangesByBatch(store, batchId).filter(h => h.changeType !== 'confirmed').reverse();
  const compensated = [];
  const skipped = [];

  for (const entry of entries) {
    if (entry.before === null) {
      // This batch CREATED the entity — compensate by deactivating, never deleting.
      const deactivated = { ...entry.after, status: 'inactive' };
      recordChange(store, {
        entityId: entry.entityId, batchId: revertingBatchId, changeType: 'reverted_creation',
        before: entry.after, after: deactivated, provenance: { revertsBatch: batchId },
      });
      compensated.push(entry.entityId);
    } else {
      recordChange(store, {
        entityId: entry.entityId, batchId: revertingBatchId, changeType: 'reverted',
        before: entry.after, after: entry.before, provenance: { revertsBatch: batchId },
      });
      compensated.push(entry.entityId);
    }
  }
  return { compensated, skipped };
}

module.exports = {
  createVersionedStore, recordChange, getCurrent, getHistory,
  getChangesByBatch, getStateAt, currentSeq, getStateAtSeq, rollbackBatch,
};
