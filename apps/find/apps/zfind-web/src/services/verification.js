/* ============================================================
   Z FIND — services/verification.js
   ============================================================
   Admin application adapter for Verification assessments.

   Verification assessments are append-only audit records.
   This service may:
   - list existing assessments;
   - append a new assessment.

   This service must never:
   - update an existing assessment;
   - delete an assessment;
   - calculate or assign a Trust Score;
   - write partners.trust_level.

   Access remains subject to verification_assessments RLS.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./supabaseClient'),
      require('./auth')
    );
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.verification = factory(
      root.ZFindServices.supabaseClient,
      root.ZFindServices.auth
    );
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule, authModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;

const VERIFICATION_TARGET_COLUMNS = Object.freeze({
  partner: 'partner_id',
  representation: 'representation_id',
  property: 'property_id',
  development: 'development_id'
});

const VERIFICATION_OUTCOMES = Object.freeze([
  'pending',
  'verified',
  'partially_verified',
  'failed',
  'expired'
]);

const ASSESSMENT_SELECT =
  'id, subject_type, partner_id, representation_id, property_id, development_id, ' +
  'verification_kind, outcome, confidence, source_reference, evidence, ' +
  'assessor_profile_id, assessed_at, expires_at';


function validateSubject(subjectType, subjectId) {
  const targetColumn = VERIFICATION_TARGET_COLUMNS[subjectType];

  if (!targetColumn) {
    return {
      targetColumn: null,
      error: {
        type: 'validation_error',
        context: 'verification',
        message: `Unsupported verification subject: ${subjectType}`
      }
    };
  }

  if (!subjectId || typeof subjectId !== 'string') {
    return {
      targetColumn: null,
      error: {
        type: 'validation_error',
        context: 'verification',
        message: 'Verification requires a non-empty subject id.'
      }
    };
  }

  return { targetColumn, error: null };
}


async function listVerificationAssessments(subjectType, subjectId) {
  const validation = validateSubject(subjectType, subjectId);
  if (validation.error) {
    return { data: null, error: validation.error };
  }

  const client = getSupabaseClient();

  return safeQuery(
    () => client
      .from('verification_assessments')
      .select(ASSESSMENT_SELECT)
      .eq('subject_type', subjectType)
      .eq(validation.targetColumn, subjectId)
      .order('assessed_at', { ascending: false }),
    'verification.listVerificationAssessments'
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
  const validation = validateSubject(subjectType, subjectId);
  if (validation.error) {
    return { data: null, error: validation.error };
  }

  if (!verificationKind || typeof verificationKind !== 'string') {
    return {
      data: null,
      error: {
        type: 'validation_error',
        context: 'verification.createVerificationAssessment',
        message: 'Verification assessment requires verificationKind.'
      }
    };
  }

  if (!VERIFICATION_OUTCOMES.includes(outcome)) {
    return {
      data: null,
      error: {
        type: 'validation_error',
        context: 'verification.createVerificationAssessment',
        message: `Invalid verification outcome: ${outcome}`
      }
    };
  }

  if (
    confidence !== null &&
    (
      typeof confidence !== 'number' ||
      confidence < 0 ||
      confidence > 1
    )
  ) {
    return {
      data: null,
      error: {
        type: 'validation_error',
        context: 'verification.createVerificationAssessment',
        message: 'Verification confidence must be between 0 and 1.'
      }
    };
  }

  const { data: profile, error: profileError } =
    await authModule.getCurrentProfile();

  if (profileError) {
    return { data: null, error: profileError };
  }

  if (!profile || !profile.id) {
    return {
      data: null,
      error: {
        type: 'malformed_response',
        context: 'verification.createVerificationAssessment',
        message: 'Authenticated admin profile did not contain an id.'
      }
    };
  }

  const row = {
    subject_type: subjectType,
    verification_kind: verificationKind,
    outcome,
    confidence,
    source_reference: sourceReference,
    evidence: evidence || {},
    assessor_profile_id: profile.id,
    expires_at: expiresAt
  };

  row[validation.targetColumn] = subjectId;

  const client = getSupabaseClient();

  return safeQuery(
    () => client
      .from('verification_assessments')
      .insert(row)
      .select(ASSESSMENT_SELECT)
      .single(),
    'verification.createVerificationAssessment'
  );
}


return {
  VERIFICATION_TARGET_COLUMNS,
  VERIFICATION_OUTCOMES,
  listVerificationAssessments,
  createVerificationAssessment
};

});
