import type { RegistryReference } from './registry';

export type ObservationStatus = 'recorded' | 'validated' | 'superseded' | 'archived';
export type ObservationMethod = 'manual' | 'api' | 'import' | 'document' | 'ai_assisted';

export interface ObservationSourceReference {
  sourceId: string;
  sourceType: string;
  sourceUri?: string | null;
  publisher?: string | null;
  retrievedAt?: string | null;
  documentHash?: string | null;
}

export interface ObservationProvenance {
  method: ObservationMethod;
  confidence?: number | null;
  rawReference?: string | null;
  notes?: string | null;
}

/**
 * A Data Observation is a claim/measurement about a canonical entity at a
 * given time. It is intentionally NOT the Registry identity and NOT Trust.
 */
export interface Observation<TValue = unknown> {
  id: string;
  subject: RegistryReference;
  metric: string;
  value: TValue;
  unit?: string | null;
  marketCode?: string | null;
  locale?: string | null;
  observedAt: string;
  validFrom?: string | null;
  validTo?: string | null;
  status: ObservationStatus;
  source: ObservationSourceReference;
  provenance: ObservationProvenance;
}

export function observation<TValue>(value: Observation<TValue>): Observation<TValue> {
  if (!value.id.trim()) throw new Error('observation id is required');
  if (!value.metric.trim()) throw new Error('observation metric is required');
  if (!value.source.sourceId.trim()) throw new Error('observation sourceId is required');
  if (Number.isNaN(Date.parse(value.observedAt))) throw new Error('observedAt must be an ISO-compatible timestamp');
  const confidence = value.provenance.confidence;
  if (confidence != null && (confidence < 0 || confidence > 1)) {
    throw new Error('confidence must be between 0 and 1');
  }
  return { ...value };
}
