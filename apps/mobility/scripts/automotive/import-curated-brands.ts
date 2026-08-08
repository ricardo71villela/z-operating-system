import "dotenv/config";

import { curatedBrands } from "./data/brands";
import { curatedManufacturers } from "./data/manufacturers";
import { slugify } from "./config";
import { supabaseAdmin } from "./supabase-admin";

type SavedManufacturer = {
  id: string;
  slug: string;
};

function normalizeAlias(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

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
        entity_type: "manufacturers_and_brands",
        status: "running",
        rows_received:
          curatedManufacturers.length + curatedBrands.length,
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
    const manufacturerMap = new Map<
      string,
      SavedManufacturer
    >();

    for (const manufacturer of curatedManufacturers) {
      const { data: existing } = await supabaseAdmin
        .from("automotive_manufacturers")
        .select("id")
        .eq("slug", manufacturer.slug)
        .maybeSingle();

      const { data: saved, error } = await supabaseAdmin
        .from("automotive_manufacturers")
        .upsert(
          {
            name: manufacturer.name,
            slug: manufacturer.slug,
            legal_name: manufacturer.legalName ?? null,
            country_code: manufacturer.countryCode,
            headquarters_city:
              manufacturer.headquartersCity ?? null,
            founded_year: manufacturer.foundedYear ?? null,
            website_url: manufacturer.websiteUrl ?? null,
            active: true,
            data_quality_score: 90,
            source_id: source.id,
          },
          {
            onConflict: "slug",
          },
        )
        .select("id, slug")
        .single();

      if (error || !saved) {
        console.error(
          `Unable to save manufacturer ${manufacturer.name}:`,
          error?.message,
        );
        rejected += 1;
        continue;
      }

      manufacturerMap.set(saved.slug, saved);

      if (existing) {
        updated += 1;
      } else {
        inserted += 1;
      }

      console.log(`✓ Manufacturer: ${manufacturer.name}`);
    }

    for (const brand of curatedBrands) {
      const brandSlug = slugify(brand.name);

      let manufacturerId: string | null = null;

      if (brand.manufacturerSlug) {
        manufacturerId =
          manufacturerMap.get(brand.manufacturerSlug)?.id ??
          null;

        if (!manufacturerId) {
          const { data: existingManufacturer } =
            await supabaseAdmin
              .from("automotive_manufacturers")
              .select("id")
              .eq("slug", brand.manufacturerSlug)
              .maybeSingle();

          manufacturerId =
            existingManufacturer?.id ?? null;
        }
      }

      const { data: existingBrand } = await supabaseAdmin
        .from("automotive_brands")
        .select("id")
        .eq("slug", brandSlug)
        .maybeSingle();

      const { data: savedBrand, error: brandError } =
        await supabaseAdmin
          .from("automotive_brands")
          .upsert(
            {
              manufacturer_id: manufacturerId,
              name: brand.name,
              slug: brandSlug,
              country_code: brand.countryCode,
              market_segment: brand.segment,
              is_electric_brand: brand.electric ?? false,
              is_historic: brand.historic ?? false,
              active: true,
              data_quality_score: 80,
              source_id: source.id,
            },
            {
              onConflict: "slug",
            },
          )
          .select("id")
          .single();

      if (brandError || !savedBrand) {
        console.error(
          `Unable to save brand ${brand.name}:`,
          brandError?.message,
        );
        rejected += 1;
        continue;
      }

      if (existingBrand) {
        updated += 1;
      } else {
        inserted += 1;
      }

      const aliases = Array.from(
        new Set([brand.name, ...(brand.aliases ?? [])]),
      );

      for (const alias of aliases) {
        const { error: aliasError } = await supabaseAdmin
          .from("automotive_brand_aliases")
          .upsert(
            {
              brand_id: savedBrand.id,
              alias,
              normalized_alias: normalizeAlias(alias),
              source: "z_mobility_curated",
            },
            {
              onConflict: "normalized_alias",
            },
          );

        if (aliasError) {
          console.error(
            `Unable to save alias "${alias}":`,
            aliasError.message,
          );
        }
      }

      console.log(`✓ Brand: ${brand.name}`);
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

    console.log("\nImport completed");
    console.log({
      manufacturers: curatedManufacturers.length,
      brands: curatedBrands.length,
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