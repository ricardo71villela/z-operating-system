import type { RegistryReference } from './registry';

export type VerificationState = 'pending' | 'verified' | 'failed' | 'expired';

/**
 * Trust is separate from the entity itself. UI booleans such as "verified"
 * should eventually be projections of an assessment like this, not truth
 * stored on the Registry entity.
 */
export interface VerificationAssessment {
  id: string;
  subject: RegistryReference;
  verificationType: string;
  state: VerificationState;
  assessedAt: string;
  assessorId?: string | null;
  evidenceIds: string[];
  expiresAt?: string | null;
  notes?: string | null;
}
