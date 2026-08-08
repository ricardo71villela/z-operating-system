import type { AutomotiveRegistryEntityType } from "./registry";

export type ObservationScalar = string | number | boolean;
export type ObservationValue = ObservationScalar | null;

export type ObservationStatus =
  | "recorded"
  | "validated"
  | "superseded"
  | "archived";

export type ObservationRelation =
  | "supports"
  | "contradicts"
  | "supersedes"
  | "duplicates";

export type AutomotiveMetricKey = `automotive.${string}`;

export type AutomotiveMetricDefinition = {
  key: AutomotiveMetricKey;
  label: string;
  valueType: "number" | "string" | "boolean";
  unit?: string | null;
  description?: string | null;
};

export type AutomotiveObservationSource = {
  sourceId?: string | null;
  sourceCode?: string | null;
  sourceType?: string | null;
  documentType?: string | null;
  documentUrl?: string | null;
  documentSha256?: string | null;
  language?: string | null;
  countryCode?: string | null;
  marketCode?: string | null;
};

export type AutomotiveObservationProvenance = {
  externalRecordId?: string | null;
  stagingRecordId?: string | null;
  importRunId?: string | null;
  extractionPath?: string | null;
  rawKey?: string | null;
  rawValue?: unknown;
  parserVersion?: string | null;
  metadata?: Record<string, unknown>;
};

export type ObservationValidity = {
  validFrom?: string | null;
  validTo?: string | null;
  observedAt: string;
};

export type AutomotiveObservation = {
  id?: string;
  entityId: string;
  entityType: AutomotiveRegistryEntityType;
  metric: AutomotiveMetricKey;
  value: ObservationValue;
  unit?: string | null;
  status: ObservationStatus;
  confidenceScore?: number | null;
  source: AutomotiveObservationSource;
  provenance: AutomotiveObservationProvenance;
  validity: ObservationValidity;
};

export type ResolvedMetric = {
  metric: AutomotiveMetricKey;
  selectedObservationId?: string | null;
  value: ObservationValue;
  unit?: string | null;
  confidenceScore?: number | null;
  sourceCount: number;
  alternativeObservationIds: string[];
};

export type ResolvedAutomotiveProjection = {
  entityId: string;
  entityType: AutomotiveRegistryEntityType;
  metrics: Record<string, ResolvedMetric>;
  sourceCount: number;
  observationCount: number;
  conflictCount: number;
  resolvedAt: string;
  policyVersion: string;
};
