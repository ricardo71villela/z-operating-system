import { supabaseAdmin } from "../supabase-admin";

type BuildSummary = {
  foundVariants: number;
  created: number;
  skippedExisting: number;
  failed: number;
};

type VariantRow = {
  id: string;
  name: string;
  slug: string;
  market_code: string | null;
};

/**
 * @deprecated Compatibility layer for installations that still consume
 * automotive_golden_records. Registry identity is authoritative in
 * automotive_variants/automotive_versions. Factual truth is represented by
 * automotive_observations and automotive_resolved_profiles.
 */
export class GoldenRecordEngine {
  async buildVariantGoldenRecords(): Promise<BuildSummary> {
    console.warn(
      "GoldenRecordEngine is deprecated: creating compatibility pointers only.",
    );

    const { data, error } = await supabaseAdmin
      .from("automotive_variants")
      .select("id, name, slug, market_code")
      .eq("active", true);

    if (error) {
      throw new Error(`Unable to load versions: ${error.message}`);
    }

    const variants = (data ?? []) as VariantRow[];
    let created = 0;
    let skippedExisting = 0;
    let failed = 0;

    for (const variant of variants) {
      try {
        const { data: existing, error: existingError } = await supabaseAdmin
          .from("automotive_golden_records")
          .select("id")
          .eq("entity_type", "variant")
          .eq("entity_id", variant.id)
          .maybeSingle();

        if (existingError) throw new Error(existingError.message);
        if (existing) {
          skippedExisting += 1;
          continue;
        }

        const { error: insertError } = await supabaseAdmin
          .from("automotive_golden_records")
          .insert({
            entity_type: "variant",
            entity_id: variant.id,
            canonical_payload: {
              compatibility_only: true,
              registry_entity_id: variant.id,
              canonical_entity_type: "version",
              legacy_entity_type: "variant",
              display_name: variant.name,
              slug: variant.slug,
              market_code: variant.market_code,
            },
            quality_score: 0,
            completeness_score: 0,
            source_count: 0,
            last_reconciled_at: new Date().toISOString(),
          });

        if (insertError) throw new Error(insertError.message);
        created += 1;
      } catch (caught) {
        failed += 1;
        console.error(
          `Failed compatibility Golden Record for ${variant.name}:`,
          caught instanceof Error ? caught.message : caught,
        );
      }
    }

    return {
      foundVariants: variants.length,
      created,
      skippedExisting,
      failed,
    };
  }
}
