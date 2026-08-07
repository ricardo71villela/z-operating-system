/* ============================================================
   Z FIND — REVIEW WORKFLOW + CHANGE PROPOSALS
   ============================================================
   Two distinct queues, sharing one resolve() lifecycle:

   ReviewItem answers: "which canonical entity (if any) does this
   source record correspond to?" — used when reconciliation itself is
   uncertain (geometry-only match, or an alternate/prior-code match).
   These NEVER auto-apply, per the hard rule: the engine must never
   auto-apply uncertain geometric or alternate-code matches.

   ChangeProposal answers: "given we know what this is, is this
   specific structural change (merge, split, rename, code
   replacement, boundary change) approved?" — used even when
   reconciliation is CERTAIN (exact code match) but the nature of the
   change itself is significant enough to warrant a human decision.
   ============================================================ */

let _reviewSeq = 0, _proposalSeq = 0;

/* ---------------- Review items (reconciliation uncertainty) ---------------- */
function createReviewItem({ sourceRecord, reason, candidateMatches, confidence, canonicalCandidates, recommendedAction }) {
  return {
    id: `review:${++_reviewSeq}`,
    sourceRecord,
    reason,
    candidateMatches: candidateMatches || [],
    confidence,
    canonicalCandidates: canonicalCandidates || [],
    recommendedAction,
    reviewer: null,
    resolution: null,      // 'accepted' | 'rejected' | 'reassigned'
    resolvedAt: null,
    status: 'pending',     // pending | resolved
  };
}

function resolveReviewItem(item, { reviewer, resolution, note }) {
  if (item.status === 'resolved') throw new Error(`Review item ${item.id} already resolved`);
  item.reviewer = reviewer;
  item.resolution = resolution;
  item.resolutionNote = note || null;
  item.resolvedAt = new Date().toISOString();
  item.status = 'resolved';
  return item;
}

/* ---------------- Change proposals (structural change significance) ---------------- */
function createChangeProposal({ type, predecessors, successors, batchId, provenance, detail }) {
  const validTypes = ['merge', 'split', 'code_replacement', 'renamed', 'boundary_change'];
  if (!validTypes.includes(type)) throw new Error(`Invalid proposal type: ${type}`);
  return {
    id: `proposal:${++_proposalSeq}`,
    type,
    predecessors: predecessors || [],
    successors: successors || [],
    batchId,
    provenance,
    detail: detail || null,
    reviewer: null,
    status: 'proposed',   // proposed | approved | rejected
    resolvedAt: null,
  };
}

function resolveProposal(proposal, { reviewer, decision }) {
  if (proposal.status !== 'proposed') throw new Error(`Proposal ${proposal.id} already resolved`);
  if (!['approved', 'rejected'].includes(decision)) throw new Error(`Invalid decision: ${decision}`);
  proposal.reviewer = reviewer;
  proposal.status = decision;
  proposal.resolvedAt = new Date().toISOString();
  return proposal;
}

/* ---------------- Merge / split detection over a batch's normalized records ----------------
   Runs AFTER normalization, BEFORE reconciliation-driven change
   detection. Detected merges/splits are pulled OUT of the normal
   changeType flow entirely — they become proposals, never an
   auto-applied changeType. */
function detectMergeSplit(normalizedRecords, batchId, sourceId) {
  const proposals = [];
  const consumedCodes = new Set(); // records fully explained by a merge/split proposal

  // Merge: one incoming record whose priorCodes lists 2+ predecessors.
  for (const rec of normalizedRecords) {
    if (rec.priorCodes && rec.priorCodes.length > 1) {
      proposals.push(createChangeProposal({
        type: 'merge',
        predecessors: rec.priorCodes,
        successors: [rec.code],
        batchId,
        provenance: { sourceId, batchId },
        detail: `${rec.priorCodes.length} predecessor codes merged into ${rec.code}`,
      }));
      consumedCodes.add(rec.code);
    }
  }

  // Split: the same priorCode referenced by 2+ DIFFERENT incoming records.
  const priorCodeToSuccessors = {};
  for (const rec of normalizedRecords) {
    for (const p of (rec.priorCodes || [])) {
      (priorCodeToSuccessors[p] = priorCodeToSuccessors[p] || []).push(rec.code);
    }
  }
  for (const [priorCode, successors] of Object.entries(priorCodeToSuccessors)) {
    if (successors.length > 1) {
      proposals.push(createChangeProposal({
        type: 'split',
        predecessors: [priorCode],
        successors,
        batchId,
        provenance: { sourceId, batchId },
        detail: `${priorCode} split into ${successors.length} successor codes`,
      }));
      successors.forEach(c => consumedCodes.add(c));
    }
  }

  return { proposals, consumedCodes };
}

module.exports = {
  createReviewItem, resolveReviewItem,
  createChangeProposal, resolveProposal,
  detectMergeSplit,
};
