/* ============================================================
   Z FIND — services/verification.js
   ============================================================
   Admin adapter for Z Find-owned Verification audit truth.

   Verification assessments are append-only.

   The database command derives assessor_profile_id from auth.uid().
   The browser never supplies assessor identity.

   This service must never:
   - update/delete an assessment;
   - calculate or assign Trust;
   - write partners.trust_level.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./supabaseClient')
    );
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.verification = factory(
      root.ZFindServices.supabaseClient
    );
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;

const VERIFICATION_SUBJECTS = Object.freeze([
  'partner',
  'representation',
  'property',
  'development'
]);

const VERIFICATION_OUTCOMES = Object.freeze([
  'pending',
  'verified',
  'partially_verified',
  'failed',
  'expired'
]);

function validationError(context, message) {
  return {
    data: null,
    error: {
      type: 'validation_error',
      context,
      message
    }
  };
}

function validateSubject(subjectType, subjectId, context) {
  if (!VERIFICATION_SUBJECTS.includes(subjectType)) {
    return validationError(
      context,
      `Unsupported verification subject: ${subjectType}`
    );
  }

  if (!subjectId || typeof subjectId !== 'string') {
    return validationError(
      context,
      'Verification requires a non-empty subject id.'
    );
  }

  return null;
}

async function listVerificationAssessments(
  subjectType,
  subjectId
) {
  const context =
    'verification.listVerificationAssessments';

  const subjectError =
    validateSubject(
      subjectType,
      subjectId,
      context
    );

  if (subjectError) return subjectError;

  const client = getSupabaseClient();

  return safeQuery(
    () => client.rpc(
      'zfind_list_verification_assessments',
      {
        p_subject_type: subjectType,
        p_subject_id: subjectId
      }
    ),
    context
  );
}

async function createVerificationAssessment({
  subjectType,
  subjectId,
  verificationKind,
  outcome = 'pending',
  confidence = null,
  sourceReference = null,
  evidence = {},
  expiresAt = null
}) {
  const context =
    'verification.createVerificationAssessment';

  const subjectError =
    validateSubject(
      subjectType,
      subjectId,
      context
    );

  if (subjectError) return subjectError;

  if (
    !verificationKind ||
    typeof verificationKind !== 'string'
  ) {
    return validationError(
      context,
      'Verification assessment requires verificationKind.'
    );
  }

  if (!VERIFICATION_OUTCOMES.includes(outcome)) {
    return validationError(
      context,
      `Invalid verification outcome: ${outcome}`
    );
  }

  if (
    confidence !== null &&
    (
      typeof confidence !== 'number' ||
      confidence < 0 ||
      confidence > 1
    )
  ) {
    return validationError(
      context,
      'Verification confidence must be between 0 and 1.'
    );
  }

  const client = getSupabaseClient();

  return safeQuery(
    () => client.rpc(
      'zfind_create_verification_assessment',
      {
        p_subject_type: subjectType,
        p_subject_id: subjectId,
        p_verification_kind: verificationKind,
        p_outcome: outcome,
        p_confidence: confidence,
        p_source_reference: sourceReference,
        p_evidence: evidence || {},
        p_expires_at: expiresAt
      }
    ),
    context
  );
}

return {
  VERIFICATION_SUBJECTS,
  VERIFICATION_OUTCOMES,
  listVerificationAssessments,
  createVerificationAssessment
};

});
