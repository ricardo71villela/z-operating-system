/* ============================================================
   Z FIND — GEOGRAPHY IMPORT PORT
   ============================================================
   Formal boundary:

     Import Engine
        -> Approved Change Set
        -> Geography Import Port   (this file)
        -> Geography-owned validation
        -> Geography application result

   The import engine NEVER writes into a canonical store's internals
   directly through this port — it only ever submits Commands, and
   only ever receives back Acknowledgements or Rejections. This file
   plays the role Geography itself would play in production (its own
   validation, its own idempotency enforcement, its own store) — kept
   separate from import-engine-v2.js so the boundary is real, not
   just a comment.
   ============================================================ */

const { recordChange, getCurrent } = require('./canonical-store-v2');

/* ---------------- 8. Change-set command types ---------------- */
const COMMAND_TYPES = [
  'create_location', 'update_localized_name', 'update_coordinates',
  'add_or_replace_external_code', 'change_parent', 'deactivate_location',
  'propose_succession', 'add_provenance', 'confirm_unchanged_seen',
];

function createCommand(type, payload, idempotencyKey) {
  if (!COMMAND_TYPES.includes(type)) throw new Error(`Unknown Geography command type: ${type}`);
  return { type, payload, idempotencyKey };
}

/** Deterministic idempotency key: same batch + same entity + same
    command type always produces the same key, so resubmission (e.g.
    after a crash) is safe — the port recognizes and skips it. */
function makeIdempotencyKey(batchId, entityId, commandType) {
  return `${batchId}:${entityId}:${commandType}`;
}

/* ---------------- Geography-owned validation ----------------
   This is deliberately separate from the import engine's own
   validation (validateStructural in import-engine-v2.js). The import
   engine validates that a SOURCE record is well-formed; Geography
   validates that a COMMAND is safe to apply to canonical state —
   different concerns, different failure modes. */
function validateCommand(command, store) {
  const errors = [];
  const p = command.payload;

  switch (command.type) {
    case 'create_location':
      if (!p.entityId || !p.entityType || !p.code || !p.countryIso) errors.push('missing_required_fields');
      if (getCurrent(store, p.entityId)) errors.push('entity_already_exists');
      break;
    case 'update_localized_name':
    case 'update_coordinates':
    case 'change_parent':
    case 'deactivate_location':
      if (!p.entityId) errors.push('missing_entity_id');
      if (!getCurrent(store, p.entityId)) errors.push('entity_not_found');
      break;
    case 'add_or_replace_external_code':
      if (!p.entityId || !p.code) errors.push('missing_required_fields');
      break;
    case 'propose_succession':
      if (!p.predecessors || !p.successors) errors.push('missing_predecessors_or_successors');
      break;
    case 'add_provenance':
      if (!p.entityId || !p.provenance) errors.push('missing_required_fields');
      break;
    case 'confirm_unchanged_seen':
      if (!p.entityId) errors.push('missing_entity_id');
      if (!getCurrent(store, p.entityId)) errors.push('entity_not_found');
      break;
  }
  return { valid: errors.length === 0, errors };
}

/* ---------------- The port itself ---------------- */
function createGeographyPort(store) {
  const processedKeys = new Map(); // idempotencyKey -> prior result, for safe resubmission

  function submit(command) {
    if (processedKeys.has(command.idempotencyKey)) {
      const prior = processedKeys.get(command.idempotencyKey);
      return { ...prior, replay: true };
    }

    const validation = validateCommand(command, store);
    if (!validation.valid) {
      const result = { accepted: false, command, errors: validation.errors };
      processedKeys.set(command.idempotencyKey, result);
      return result;
    }

    const result = applyCommand(command, store);
    processedKeys.set(command.idempotencyKey, result);
    return result;
  }

  function submitBatch(commands) {
    const results = commands.map(submit);
    return {
      accepted: results.filter(r => r.accepted),
      rejected: results.filter(r => !r.accepted),
    };
  }

  return { submit, submitBatch, _processedKeys: processedKeys };
}

function applyCommand(command, store) {
  const p = command.payload;
  const batchId = p.batchId;

  switch (command.type) {
    case 'create_location': {
      const after = { entityId:p.entityId, entityType:p.entityType, code:p.code, countryIso:p.countryIso, parentCode:p.parentCode||null, names:p.names||{}, geometry:p.geometry||null, status:'active' };
      recordChange(store, { entityId:p.entityId, batchId, changeType:'new', before:null, after, provenance:p.provenance });
      return { accepted: true, command, entityId: p.entityId };
    }
    case 'update_localized_name': {
      const before = getCurrent(store, p.entityId);
      const after = { ...before, names: { ...before.names, ...p.names } };
      recordChange(store, { entityId:p.entityId, batchId, changeType:'renamed', before, after, provenance:p.provenance });
      return { accepted: true, command, entityId: p.entityId };
    }
    case 'update_coordinates': {
      const before = getCurrent(store, p.entityId);
      const after = { ...before, geometry: p.geometry };
      recordChange(store, { entityId:p.entityId, batchId, changeType:'geometry_changed', before, after, provenance:p.provenance });
      return { accepted: true, command, entityId: p.entityId };
    }
    case 'add_or_replace_external_code': {
      const before = getCurrent(store, p.entityId) || null;
      const after = before ? { ...before, code: p.code } : { entityId:p.entityId, code:p.code, status:'active' };
      recordChange(store, { entityId:p.entityId, batchId, changeType:'code_changed', before, after, provenance:p.provenance });
      return { accepted: true, command, entityId: p.entityId };
    }
    case 'change_parent': {
      const before = getCurrent(store, p.entityId);
      const after = { ...before, parentCode: p.parentCode, parentEntityType: p.parentEntityType };
      recordChange(store, { entityId:p.entityId, batchId, changeType:'updated', before, after, provenance:p.provenance });
      return { accepted: true, command, entityId: p.entityId };
    }
    case 'deactivate_location': {
      const before = getCurrent(store, p.entityId);
      const after = { ...before, status: 'inactive' };
      recordChange(store, { entityId:p.entityId, batchId, changeType:'deprecated', before, after, provenance:p.provenance });
      return { accepted: true, command, entityId: p.entityId };
    }
    case 'propose_succession': {
      // Recorded as an audit entry only — actual predecessor/successor
      // entities are mutated via their own commands once a
      // ChangeProposal (see review-workflow.js) is approved. The port
      // never executes a merge/split by itself.
      return { accepted: true, command, note: 'succession_proposal_logged_not_executed' };
    }
    case 'add_provenance': {
      const before = getCurrent(store, p.entityId);
      if (!before) return { accepted: false, command, errors: ['entity_not_found'] };
      const after = { ...before };
      recordChange(store, { entityId:p.entityId, batchId, changeType:'confirmed', before, after, provenance:p.provenance });
      return { accepted: true, command, entityId: p.entityId };
    }
    case 'confirm_unchanged_seen': {
      const before = getCurrent(store, p.entityId);
      recordChange(store, { entityId:p.entityId, batchId, changeType:'confirmed', before, after: before, provenance:p.provenance });
      return { accepted: true, command, entityId: p.entityId };
    }
    default:
      return { accepted: false, command, errors: ['unhandled_command_type'] };
  }
}

module.exports = { COMMAND_TYPES, createCommand, makeIdempotencyKey, validateCommand, createGeographyPort };
