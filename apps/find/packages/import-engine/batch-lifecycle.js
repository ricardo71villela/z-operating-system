/* ============================================================
   Z FIND — BATCH LIFECYCLE STATE MACHINE
   ============================================================ */

const STATES = [
  'created', 'parsing', 'validating', 'ready_for_review', 'approved',
  'applying', 'completed', 'partially_completed', 'failed', 'reverted',
];

/* Allowed transitions. Anything not listed here is illegal and
   transition() will throw — this is what makes the lifecycle a real
   state machine rather than a status string anyone can overwrite. */
const TRANSITIONS = {
  created:              ['parsing', 'failed'],
  parsing:              ['validating', 'failed'],
  validating:           ['ready_for_review', 'failed'],
  ready_for_review:     ['approved', 'failed'],
  approved:             ['applying', 'failed'],
  applying:             ['completed', 'partially_completed', 'failed'],
  completed:            ['reverted'],
  partially_completed:  ['reverted', 'applying'], // may resume applying remaining changes
  failed:               ['parsing', 'validating', 'applying'], // retry re-enters the stage that failed
  reverted:             [],
};

function createBatchState(batchId) {
  return { batchId, state: 'created', history: [{ state:'created', at: new Date().toISOString() }] };
}

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function transition(batchState, toState, meta) {
  if (!canTransition(batchState.state, toState)) {
    throw new Error(`Illegal batch transition: ${batchState.state} -> ${toState}`);
  }
  batchState.state = toState;
  batchState.history.push({ state: toState, at: new Date().toISOString(), meta: meta || null });
  return batchState;
}

module.exports = { STATES, TRANSITIONS, createBatchState, canTransition, transition };
