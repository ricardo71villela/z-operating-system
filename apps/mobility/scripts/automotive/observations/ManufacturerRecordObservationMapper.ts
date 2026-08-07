import type {
  AutomotiveObservation,
  ObservationScalar,
} from "../../../packages/automotive-domain/src";
import type { ManufacturerOfficialRecord } from "../core/manufacturer-types";
import { resolveAutomotiveMetric } from "./metric-catalog";

export type ManufacturerRecordObservationMapperInput = {
  entityId: string;
  record: ManufacturerOfficialRecord;
  sourceId?: string | null;
  sourceCode?: string | null;
  stagingRecordId?: string | null;
  importRunId?: string | null;
  observedAt?: string;
};

type FlattenedTechnicalValue = {
  path: string;
  value: ObservationScalar;
};

function flattenTechnicalData(
  input: Record<string, unknown>,
  prefix = "",
): FlattenedTechnicalValue[] {
  const result: FlattenedTechnicalValue[] = [];

  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      result.push({ path, value });
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      result.push(
        ...flattenTechnicalData(
          value as Record<string, unknown>,
          path,
        ),
      );
    }
  }

  return result;
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function readMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string,
): number | null {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

export function mapManufacturerRecordToObservations({
  entityId,
  record,
  sourceId = null,
  sourceCode = null,
  stagingRecordId = null,
  importRunId = null,
  observedAt = new Date().toISOString(),
}: ManufacturerRecordObservationMapperInput): AutomotiveObservation[] {
  const technicalData = record.technicalData ?? {};
  const values = flattenTechnicalData(technicalData);
  const confidence =
    readMetadataNumber(record.metadata, "generationConfidence") ??
    readMetadataNumber(record.metadata, "generation_confidence") ??
    null;

  return values.map(({ path, value }) => {
    const metric = resolveAutomotiveMetric(path, value);

    return {
      entityId,
      entityType: "version",
      metric: metric.key,
      value,
      unit: metric.unit ?? null,
      status: "recorded",
      confidenceScore: confidence,
      source: {
        sourceId,
        sourceCode,
        sourceType: "manufacturer",
        documentType: record.documentType,
        documentUrl: record.officialUrl,
        documentSha256:
          readMetadataString(record.metadata, "sourceSha256") ??
          readMetadataString(record.metadata, "source_sha256"),
        language:
          readMetadataString(record.metadata, "sourceLanguage") ??
          readMetadataString(record.metadata, "source_language"),
        countryCode: record.countryCode ?? null,
        marketCode: record.marketCode ?? null,
      },
      provenance: {
        externalRecordId: record.externalId,
        stagingRecordId,
        importRunId,
        extractionPath: path,
        rawKey: path,
        rawValue: value,
        parserVersion:
          readMetadataString(record.metadata, "parserVersion") ??
          readMetadataString(record.metadata, "parser_version"),
        metadata: record.metadata ?? {},
      },
      validity: {
        observedAt,
      },
    };
  });
}
