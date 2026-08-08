import { config } from "dotenv";

config({ path: ".env.local" });

import { curatedModels } from "./data/models";
import { slugify } from "./config";
import { supabaseAdmin } from "./supabase-admin";

async function main() {
  const { data: source, error: sourceError } =
    await supabaseAdmin
      .from("automotive_data_sources")
      .select("id")
      .eq("code", "z_mobility_curated")
      .single();

  if (sourceError || !source) {
    throw new Error(
      `Unable to find curated source: ${
        sourceError?.message ?? "unknown error"
      }`,
    );
  }

  const { data: run, error: runError } =
    await supabaseAdmin
      .from("automotive_import_runs")
      .insert({
        source_id: source.id,
        entity_type: "models",
        status: "running",
        rows_received: curatedModels.length,
      })
      .select("id")
      .single();

  if (runError || !run) {
    throw new Error(
      `Unable to create import run: ${
        runError?.message ?? "unknown error"
      }`,
    );
  }

  let inserted = 0;
  let updated = 0;
  let rejected = 0;

  try {
    for (const model of curatedModels) {
      const { data: brand, error: brandError } =
        await supabaseAdmin
          .from("automotive_brands")
          .select("id, name")
          .eq("slug", model.brandSlug)
          .maybeSingle();

      if (brandError || !brand) {
        console.error(
          `Brand not found for model ${model.name}: ${model.brandSlug}`,
        );
        rejected += 1;
        continue;
      }

      const modelSlug = slugify(model.name);

      const { data: existing } = await supabaseAdmin
        .from("automotive_models")
        .select("id")
        .eq("brand_id", brand.id)
        .eq("slug", modelSlug)
        .maybeSingle();

      const { error: modelError } = await supabaseAdmin
        .from("automotive_models")
        .upsert(
          {
            brand_id: brand.id,
            name: model.name,
            slug: modelSlug,
            internal_code: model.internalCode ?? null,
            production_start_year:
              model.productionStartYear ?? null,
            production_end_year:
              model.productionEndYear ?? null,
            active: !(model.discontinued ?? false),
            discontinued: model.discontinued ?? false,
            data_quality_score: 75,
            source_id: source.id,
          },
          {
            onConflict: "brand_id,slug",
          },
        );

      if (modelError) {
        console.error(
          `Unable to save ${brand.name} ${model.name}:`,
          modelError.message,
        );
        rejected += 1;
        continue;
      }

      if (existing) {
        updated += 1;
      } else {
        inserted += 1;
      }

      console.log(`✓ ${brand.name}: ${model.name}`);
    }

    await supabaseAdmin
      .from("automotive_import_runs")
      .update({
        status: rejected > 0 ? "partial" : "completed",
        completed_at: new Date().toISOString(),
        rows_inserted: inserted,
        rows_updated: updated,
        rows_rejected: rejected,
      })
      .eq("id", run.id);

    console.log("\nModels import completed");
    console.log({
      received: curatedModels.length,
      inserted,
      updated,
      rejected,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown import error";

    await supabaseAdmin
      .from("automotive_import_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", run.id);

    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});