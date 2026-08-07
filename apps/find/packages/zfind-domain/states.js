'use strict';

/**
 * Z Find keeps distinct state machines. ZOS governs how transitions are
 * recorded/audited; it does not impose one lifecycle on all entities.
 */
const STATE_MACHINES = Object.freeze({
  representation: Object.freeze(['proposed', 'active', 'ended', 'disputed']),
  listing: Object.freeze(['draft', 'incomplete', 'pending_review', 'ready', 'published', 'suspended', 'archived']),
  observation: Object.freeze(['recorded', 'validated', 'superseded', 'archived']),
  verification: Object.freeze(['pending', 'verified', 'partially_verified', 'failed', 'expired']),
});

function assertState(machine, state) {
  const allowed = STATE_MACHINES[machine];
  if (!allowed) throw new Error(`Unknown state machine: ${machine}`);
  if (!allowed.includes(state)) throw new Error(`Invalid ${machine} state: ${state}`);
  return state;
}

function createTransition({ machine, entityId, fromState = null, toState, actorId = null, reason = null, metadata = {} }) {
  if (!entityId) throw new Error('State transition requires entityId');
  if (fromState !== null) assertState(machine, fromState);
  assertState(machine, toState);
  return {
    machine,
    entityId,
    fromState,
    toState,
    actorId,
    reason,
    metadata: metadata || {},
  };
}

module.exports = { STATE_MACHINES, assertState, createTransition };
