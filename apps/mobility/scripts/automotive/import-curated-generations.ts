import { curatedGenerations } from "./data/generations";
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
        entity_type: "generations",
        status: "running",
        rows_received: curatedGenerations.length,
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
    for (const generation of curatedGenerations) {
      const { data: brand, error: brandError } =
        await supabaseAdmin
          .from("automotive_brands")
          .select("id, name")
          .eq("slug", generation.brandSlug)
          .maybeSingle();

      if (brandError || !brand) {
        console.error(
          `Brand not found: ${generation.brandSlug}`,
        );
        rejected += 1;
        continue;
      }

      const { data: model, error: modelError } =
        await supabaseAdmin
          .from("automotive_models")
          .select("id, name")
          .eq("brand_id", brand.id)
          .eq("slug", generation.modelSlug)
          .maybeSingle();

      if (modelError || !model) {
        console.error(
          `Model not found: ${brand.name} / ${generation.modelSlug}`,
        );
        rejected += 1;
        continue;
      }

      const generationSlug = slugify(generation.name);

      const { data: existing } = await supabaseAdmin
        .from("automotive_generations")
        .select("id")
        .eq("model_id", model.id)
        .eq("slug", generationSlug)
        .maybeSingle();

      const { error: saveError } = await supabaseAdmin
        .from("automotive_generations")
        .upsert(
          {
            model_id: model.id,
            name: generation.name,
            slug: generationSlug,
            generation_code:
              generation.generationCode ?? null,
            platform_code:
              generation.platformCode ?? null,
            production_start:
              generation.productionStart ?? null,
            production_end:
              generation.productionEnd ?? null,
            model_year_start:
              generation.modelYearStart ?? null,
            model_year_end:
              generation.modelYearEnd ?? null,
            facelift: generation.facelift ?? false,
            active: true,
            data_quality_score: 80,
            source_id: source.id,
          },
          {
            onConflict: "model_id,slug",
          },
        );

      if (saveError) {
        console.error(
          `Unable to save ${brand.name} ${model.name} ${generation.name}:`,
          saveError.message,
        );
        rejected += 1;
        continue;
      }

      if (existing) {
        updated += 1;
      } else {
        inserted += 1;
      }

      console.log(
        `✓ ${brand.name}: ${model.name} — ${generation.name}`,
      );
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

    console.log("\nGenerations import completed");
    console.log({
      received: curatedGenerations.length,
      inserted,
      updated,
      rejected,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown generations import error";

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