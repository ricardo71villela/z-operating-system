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

const STATE_TRANSITIONS = Object.freeze({
  representation: Object.freeze({
    proposed: Object.freeze(['active', 'disputed']),
    active: Object.freeze(['ended', 'disputed']),
    disputed: Object.freeze(['active', 'ended']),
    ended: Object.freeze([])
  }),

  listing: Object.freeze({
    draft: Object.freeze(['incomplete', 'pending_review', 'archived']),
    incomplete: Object.freeze(['draft', 'pending_review', 'archived']),
    pending_review: Object.freeze(['incomplete', 'ready', 'archived']),
    ready: Object.freeze(['pending_review', 'published', 'archived']),
    published: Object.freeze(['suspended', 'archived']),
    suspended: Object.freeze(['ready', 'archived']),
    archived: Object.freeze([])
  })
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

function canTransition(machine, fromState, toState) {
  assertState(machine, fromState);
  assertState(machine, toState);

  const machineTransitions = STATE_TRANSITIONS[machine];
  if (!machineTransitions) return false;

  return (machineTransitions[fromState] || []).includes(toState);
}

function assertTransition(machine, fromState, toState) {
  if (!canTransition(machine, fromState, toState)) {
    throw new Error(
      `Invalid ${machine} transition: ${fromState} -> ${toState}`
    );
  }
  return toState;
}

module.exports = {
  STATE_MACHINES,
  STATE_TRANSITIONS,
  assertState,
  canTransition,
  assertTransition,
  createTransition
};
