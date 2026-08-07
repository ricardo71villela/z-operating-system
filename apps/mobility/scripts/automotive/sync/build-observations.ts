import "dotenv/config";
import { supabaseAdmin } from "../supabase-admin";
import { buildObservationsFromImportedStaging } from "../observations/StagingObservationBuilder";
import { SupabaseObservationRepository } from "../infrastructure/supabase/SupabaseObservationRepository";

async function main() {
  const { data: staging, error } = await supabaseAdmin
    .from("automotive_staging_records")
    .select(
      "id, source_id, import_run_id, external_id, matched_entity_id, market_code, source_country_code, confidence_score, raw_payload, normalized_payload, reviewed_at, updated_at",
    )
    .eq("entity_type", "variant")
    .eq("status", "imported")
    .not("matched_entity_id", "is", null);
  if (error) throw new Error(error.message);

  const { data: sources, error: sourceError } = await supabaseAdmin
    .from("automotive_data_sources")
    .select("id, code");
  if (sourceError) throw new Error(sourceError.message);

  const sourceCodes = new Map((sources ?? []).map((row) => [String(row.id), String(row.code)]));
  const repository = new SupabaseObservationRepository();
  let observations = 0;
  let records = 0;

  for (const row of staging ?? []) {
    const payload =
      (row.normalized_payload as Record<string, unknown> | null) ??
      (row.raw_payload as Record<string, unknown> | null) ??
      {};
    const mapped = buildObservationsFromImportedStaging({
      entityId: String(row.matched_entity_id),
      sourceId: String(row.source_id),
      sourceCode: sourceCodes.get(String(row.source_id)) ?? null,
      stagingRecordId: String(row.id),
      importRunId: row.import_run_id ? String(row.import_run_id) : null,
      externalRecordId: row.external_id ? String(row.external_id) : null,
      marketCode: row.market_code ? String(row.market_code) : null,
      countryCode: row.source_country_code ? String(row.source_country_code) : null,
      payload,
      confidenceScore:
        typeof row.confidence_score === "number" ? row.confidence_score : null,
      observedAt: String(row.reviewed_at ?? row.updated_at ?? new Date().toISOString()),
    });

    observations += await repository.upsertMany(mapped);
    records += 1;
  }

  console.log({ records, observations });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
