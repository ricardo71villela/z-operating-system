import "dotenv/config";

import { supabaseAdmin } from "../supabase-admin";
import { SupabaseObservationRepository } from "../infrastructure/supabase/SupabaseObservationRepository";
import { SupabaseResolvedProjectionRepository } from "../infrastructure/supabase/SupabaseResolvedProjectionRepository";
import { ResolvedAutomotiveProjectionEngine } from "../resolution/ResolvedAutomotiveProjectionEngine";

async function main() {
  const { data, error } = await supabaseAdmin
    .from("automotive_observations")
    .select("entity_id")
    .in("status", ["recorded", "validated"]);

  if (error) {
    throw new Error(`Unable to find observed entities: ${error.message}`);
  }

  const entityIds = Array.from(
    new Set((data ?? []).map((row) => String(row.entity_id))),
  );

  const observations = new SupabaseObservationRepository();
  const projections = new SupabaseResolvedProjectionRepository();
  const engine = new ResolvedAutomotiveProjectionEngine();

  let built = 0;
  let skipped = 0;

  for (const entityId of entityIds) {
    const entityObservations = await observations.listForEntity(entityId);
    if (entityObservations.length === 0) {
      skipped += 1;
      continue;
    }

    const projection = engine.resolve(entityObservations);
    await projections.upsert(projection);
    built += 1;
  }

  console.log({ inspected: entityIds.length, built, skipped });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
