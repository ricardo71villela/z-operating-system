import type { AutomotiveRegistryEntityType } from "../../../packages/automotive-domain/src";

/**
 * Legacy ingestion entity vocabulary. `variant` remains on RAW/staging and
 * legacy database surfaces; the canonical domain name is `version`.
 */
export type AutomotiveEntityType =
  | "manufacturer"
  | "brand"
  | "model"
  | "generation"
  | "variant"
  | "engine"
  | "transmission"
  | "colour"
  | "equipment"
  | "option"
  | "package";

export type CanonicalAutomotiveEntityType = AutomotiveRegistryEntityType;

export type StagingStatus =
  | "pending"
  | "normalized"
  | "matched"
  | "new_candidate"
  | "conflict"
  | "approved"
  | "rejected"
  | "imported";

export type ReconciliationDecision =
  | "pending"
  | "match_existing"
  | "create_new"
  | "merge"
  | "reject"
  | "manual_review";

export type MatchMethod =
  | "external_id"
  | "exact_slug"
  | "exact_name"
  | "alias"
  | "parent_and_name"
  | "fuzzy"
  | "manual";

export type ExternalAutomotiveRecord = {
  entityType: AutomotiveEntityType;
  externalId: string;
  externalParentId?: string | null;
  rawName?: string | null;
  countryCode?: string | null;
  marketCode?: string | null;
  payload: Record<string, unknown>;
};

export type NormalizedAutomotiveRecord =
  ExternalAutomotiveRecord & {
    normalizedName: string | null;
    normalizedPayload: Record<string, unknown>;
    validationErrors: string[];
    validationWarnings: string[];
  };

export type AdapterContext = {
  importRunId: string;
  sourceId: string;
};

export type ImportSummary = {
  received: number;
  inserted: number;
  updated: number;
  rejected: number;
};

export type ReconciliationResult = {
  decision: ReconciliationDecision;
  candidateEntityType: AutomotiveEntityType;
  candidateEntityId: string | null;
  matchMethod: MatchMethod | null;
  matchScore: number;
  notes?: string;
};