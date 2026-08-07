import type { AutomotiveObservation, ObservationScalar } from "../../../packages/automotive-domain/src";
import { resolveAutomotiveMetric } from "./metric-catalog";

export type ImportedStagingObservationInput = {
  entityId: string;
  sourceId: string;
  sourceCode?: string | null;
  stagingRecordId: string;
  importRunId?: string | null;
  externalRecordId?: string | null;
  marketCode?: string | null;
  countryCode?: string | null;
  payload: Record<string, unknown>;
  confidenceScore?: number | null;
  observedAt: string;
};

const CONTROL_KEYS = new Set([
  "manufacturer",
  "brand",
  "model",
  "generation",
  "variant",
  "body_style",
  "model_year",
  "official_url",
  "official_document_type",
  "source_is_official",
  "publisher",
  "legal_review_required",
  "automatic_publication_allowed",
  "metadata",
  "normalized_name",
  "normalized_country_code",
  "market_code",
  "automotive_dna",
  "internal_code",
]);

function flatten(
  input: Record<string, unknown>,
  prefix = "",
): Array<{ path: string; value: ObservationScalar }> {
  const output: Array<{ path: string; value: ObservationScalar }> = [];
  for (const [key, value] of Object.entries(input)) {
    if (!prefix && CONTROL_KEYS.has(key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      output.push({ path, value });
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      output.push(...flatten(value as Record<string, unknown>, path));
    }
  }
  return output;
}

function metadataString(payload: Record<string, unknown>, key: string): string | null {
  const metadata = payload.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildObservationsFromImportedStaging(
  input: ImportedStagingObservationInput,
): AutomotiveObservation[] {
  const documentUrl =
    typeof input.payload.official_url === "string" ? input.payload.official_url : null;
  const documentType =
    typeof input.payload.official_document_type === "string"
      ? input.payload.official_document_type
      : null;

  return flatten(input.payload).map(({ path, value }) => {
    const metric = resolveAutomotiveMetric(path, value);
    return {
      entityId: input.entityId,
      entityType: "version",
      metric: metric.key,
      value,
      unit: metric.unit ?? null,
      status: "recorded",
      confidenceScore: input.confidenceScore ?? null,
      source: {
        sourceId: input.sourceId,
        sourceCode: input.sourceCode ?? null,
        sourceType: "manufacturer",
        documentType,
        documentUrl,
        documentSha256:
          metadataString(input.payload, "sourceSha256") ??
          metadataString(input.payload, "source_sha256"),
        language:
          metadataString(input.payload, "sourceLanguage") ??
          metadataString(input.payload, "source_language"),
        countryCode: input.countryCode ?? null,
        marketCode: input.marketCode ?? null,
      },
      provenance: {
        externalRecordId: input.externalRecordId ?? null,
        stagingRecordId: input.stagingRecordId,
        importRunId: input.importRunId ?? null,
        extractionPath: path,
        rawKey: path,
        rawValue: value,
        parserVersion:
          metadataString(input.payload, "parserVersion") ??
          metadataString(input.payload, "parser_version"),
        metadata:
          input.payload.metadata &&
          typeof input.payload.metadata === "object" &&
          !Array.isArray(input.payload.metadata)
            ? (input.payload.metadata as Record<string, unknown>)
            : {},
      },
      validity: { observedAt: input.observedAt },
    };
  });
}
