import type {
  AutomotiveRegistryRepository,
  RegistryNamedEntity,
  RegistryVersionEntity,
  UpsertVersionInput,
} from "../../ports/AutomotiveRegistryRepository";
import { supabaseAdmin } from "../../supabase-admin";

export class SupabaseAutomotiveRegistryRepository
  implements AutomotiveRegistryRepository
{
  async findBrandBySlug(slug: string): Promise<RegistryNamedEntity | null> {
    return this.findNamed("automotive_brands", { slug });
  }

  async findModelBySlug(
    brandId: string,
    slug: string,
  ): Promise<RegistryNamedEntity | null> {
    return this.findNamed("automotive_models", { brand_id: brandId, slug });
  }

  async findGenerationBySlug(
    modelId: string,
    slug: string,
  ): Promise<RegistryNamedEntity | null> {
    return this.findNamed("automotive_generations", { model_id: modelId, slug });
  }

  async listVersions(
    generationId: string,
    marketCode: string,
  ): Promise<RegistryVersionEntity[]> {
    const { data, error } = await supabaseAdmin
      .from("automotive_variants")
      .select("id, name, slug, generation_id, market_code")
      .eq("generation_id", generationId)
      .eq("market_code", marketCode);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      generationId: String(row.generation_id),
      marketCode: String(row.market_code),
    }));
  }

  async upsertVersion(input: UpsertVersionInput): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("automotive_variants")
      .upsert(
        {
          generation_id: input.generationId,
          body_style_id: input.bodyStyleId ?? null,
          name: input.name,
          slug: input.slug,
          internal_code: input.internalCode ?? null,
          market_code: input.marketCode,
          model_year_start: input.modelYearStart ?? null,
          doors: input.doors ?? null,
          seats: input.seats ?? null,
          automotive_dna: input.automotiveDna,
          active: true,
          data_quality_score: input.dataQualityScore,
          source_id: input.sourceId,
        },
        { onConflict: "generation_id,slug,market_code" },
      )
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to upsert automotive version.");
    }

    return String(data.id);
  }

  private async findNamed(
    table: string,
    filters: Record<string, string>,
  ): Promise<RegistryNamedEntity | null> {
    let query = supabaseAdmin.from(table).select("id, name, slug");
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    return data as RegistryNamedEntity | null;
  }
}
