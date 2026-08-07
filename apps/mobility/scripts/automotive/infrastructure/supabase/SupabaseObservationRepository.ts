import type { AutomotiveObservation } from "../../../../packages/automotive-domain/src";
import type { ObservationRepository } from "../../ports/ObservationRepository";
import { supabaseAdmin } from "../../supabase-admin";

function toRow(observation: AutomotiveObservation) {
  return {
    entity_id: observation.entityId,
    entity_type: observation.entityType,
    metric_key: observation.metric,
    value_json: observation.value,
    unit: observation.unit ?? null,
    status: observation.status,
    confidence_score: observation.confidenceScore ?? null,
    source_id: observation.source.sourceId ?? null,
    source_code: observation.source.sourceCode ?? null,
    source_type: observation.source.sourceType ?? null,
    document_type: observation.source.documentType ?? null,
    document_url: observation.source.documentUrl ?? null,
    document_sha256: observation.source.documentSha256 ?? null,
    language: observation.source.language ?? null,
    country_code: observation.source.countryCode ?? null,
    market_code: observation.source.marketCode ?? null,
    external_record_id: observation.provenance.externalRecordId ?? null,
    staging_record_id: observation.provenance.stagingRecordId ?? null,
    import_run_id: observation.provenance.importRunId ?? null,
    extraction_path: observation.provenance.extractionPath ?? null,
    raw_key: observation.provenance.rawKey ?? null,
    raw_value_json: observation.provenance.rawValue ?? null,
    parser_version: observation.provenance.parserVersion ?? null,
    provenance_json: observation.provenance.metadata ?? {},
    observed_at: observation.validity.observedAt,
    valid_from: observation.validity.validFrom ?? null,
    valid_to: observation.validity.validTo ?? null,
  };
}

function fromRow(row: Record<string, unknown>): AutomotiveObservation {
  return {
    id: String(row.id),
    entityId: String(row.entity_id),
    entityType: row.entity_type as AutomotiveObservation["entityType"],
    metric: row.metric_key as AutomotiveObservation["metric"],
    value: row.value_json as AutomotiveObservation["value"],
    unit: (row.unit as string | null) ?? null,
    status: row.status as AutomotiveObservation["status"],
    confidenceScore: (row.confidence_score as number | null) ?? null,
    source: {
      sourceId: (row.source_id as string | null) ?? null,
      sourceCode: (row.source_code as string | null) ?? null,
      sourceType: (row.source_type as string | null) ?? null,
      documentType: (row.document_type as string | null) ?? null,
      documentUrl: (row.document_url as string | null) ?? null,
      documentSha256: (row.document_sha256 as string | null) ?? null,
      language: (row.language as string | null) ?? null,
      countryCode: (row.country_code as string | null) ?? null,
      marketCode: (row.market_code as string | null) ?? null,
    },
    provenance: {
      externalRecordId: (row.external_record_id as string | null) ?? null,
      stagingRecordId: (row.staging_record_id as string | null) ?? null,
      importRunId: (row.import_run_id as string | null) ?? null,
      extractionPath: (row.extraction_path as string | null) ?? null,
      rawKey: (row.raw_key as string | null) ?? null,
      rawValue: row.raw_value_json,
      parserVersion: (row.parser_version as string | null) ?? null,
      metadata: (row.provenance_json as Record<string, unknown>) ?? {},
    },
    validity: {
      observedAt: String(row.observed_at),
      validFrom: (row.valid_from as string | null) ?? null,
      validTo: (row.valid_to as string | null) ?? null,
    },
  };
}

export class SupabaseObservationRepository implements ObservationRepository {
  async upsertMany(observations: AutomotiveObservation[]): Promise<number> {
    if (observations.length === 0) return 0;

    const { error } = await supabaseAdmin
      .from("automotive_observations")
      .upsert(observations.map(toRow), {
        onConflict:
          "entity_id,metric_key,source_id,external_record_id,extraction_path,observed_at",
      });

    if (error) {
      throw new Error(`Unable to persist observations: ${error.message}`);
    }

    return observations.length;
  }

  async listForEntity(entityId: string): Promise<AutomotiveObservation[]> {
    const { data, error } = await supabaseAdmin
      .from("automotive_observations")
      .select("*")
      .eq("entity_id", entityId)
      .in("status", ["recorded", "validated"])
      .order("observed_at", { ascending: false });

    if (error) {
      throw new Error(`Unable to load observations: ${error.message}`);
    }

    return (data ?? []).map((row) => fromRow(row as Record<string, unknown>));
  }
}
