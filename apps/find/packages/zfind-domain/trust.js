'use strict';

const VERIFICATION_OUTCOMES = Object.freeze(['pending', 'verified', 'partially_verified', 'failed', 'expired']);
const VERIFICATION_SUBJECTS = Object.freeze(['partner', 'representation', 'property', 'development']);

function createVerificationAssessment({ subjectType, subjectId, verificationKind, outcome = 'pending', confidence = null, sourceReference = null, evidence = {}, expiresAt = null }) {
  if (!VERIFICATION_SUBJECTS.includes(subjectType)) throw new Error(`Unsupported verification subject: ${subjectType}`);
  if (!subjectId) throw new Error('Verification assessment requires subjectId');
  if (!verificationKind) throw new Error('Verification assessment requires verificationKind');
  if (!VERIFICATION_OUTCOMES.includes(outcome)) throw new Error(`Invalid verification outcome: ${outcome}`);
  if (confidence !== null && (confidence < 0 || confidence > 1)) throw new Error('Verification confidence must be between 0 and 1');
  return { subjectType, subjectId, verificationKind, outcome, confidence, sourceReference, evidence: evidence || {}, expiresAt };
}

module.exports = { VERIFICATION_OUTCOMES, VERIFICATION_SUBJECTS, createVerificationAssessment };
