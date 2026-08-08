import { slugify } from "../config";
import { supabaseAdmin } from "../supabase-admin";
import { StagingStateTransitionService } from "../publish/StagingStateTransitionService";

type StagingVariantRecord = {
  id: string;
  raw_name: string | null;
  market_code: string | null;
  normalized_payload: Record<string, unknown> | null;
  raw_payload: Record<string, unknown> | null;
};

type ReconciliationDecision =
  | "match_existing"
  | "create_new"
  | "manual_review"
  | "reject";

type ReconciliationResult = {
  decision: ReconciliationDecision;
  candidateEntityId: string | null;
  matchMethod:
    | "exact_slug"
    | "parent_and_name"
    | "fuzzy"
    | null;
  matchScore: number;
  notes: string;
};

type NamedEntity = {
  id: string;
  name: string;
  slug: string;
};

function readString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  return cleaned || null;
}

function normalizeVariantName(
  value: string,
  brand: string,
  model: string,
): string {
  let normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

  const prefixes = [
    `${brand.toLowerCase()} ${model.toLowerCase()} `,
    `${model.toLowerCase()} `,
    `${brand.toLowerCase()} `,
  ];

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

    return normalized
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(
  left: string,
  right: string,
): number {
  if (left === right) {
    return 100;
  }

  const leftWords = new Set(left.split(" "));
  const rightWords = new Set(right.split(" "));

  const intersection = [...leftWords].filter((word) =>
    rightWords.has(word),
  ).length;

  const union = new Set([
    ...leftWords,
    ...rightWords,
  ]).size;

  return union === 0
    ? 0
    : Math.round((intersection / union) * 100);
}

export class ReconciliationEngineV2 {
  private readonly transitions = new StagingStateTransitionService();
  async reconcilePendingManufacturerVariants(
    sourceCodes: string[],
  ): Promise<{
    processed: number;
    matched: number;
    newCandidates: number;
    manualReview: number;
    rejected: number;
  }> {
    const sourceIds =
      await this.getSourceIds(sourceCodes);

    const { data, error } = await supabaseAdmin
      .from("automotive_staging_records")
      .select(
        [
          "id",
          "raw_name",
          "market_code",
          "normalized_payload",
          "raw_payload",
        ].join(","),
      )
      .in("source_id", sourceIds)
      .eq("entity_type", "variant")
      .in("status", [
        "normalized",
        "matched",
        "new_candidate",
        "conflict",
      ]);

    if (error) {
      throw new Error(
        `Unable to load staging variants: ${error.message}`,
      );
    }

    const records =
      (data ?? []) as unknown as StagingVariantRecord[];

    let matched = 0;
    let newCandidates = 0;
    let manualReview = 0;
    let rejected = 0;

    for (const record of records) {
      const result =
        await this.reconcileVariant(record);

      await this.saveResult(record.id, result);

      if (result.decision === "match_existing") {
        matched += 1;
      } else if (result.decision === "create_new") {
        newCandidates += 1;
      } else if (
        result.decision === "manual_review"
      ) {
        manualReview += 1;
      } else {
        rejected += 1;
      }

      console.log(
        `${record.raw_name ?? record.id}: ` +
          `${result.decision} (${result.matchScore})`,
      );
    }

    return {
      processed: records.length,
      matched,
      newCandidates,
      manualReview,
      rejected,
    };
  }

  private async reconcileVariant(
    record: StagingVariantRecord,
  ): Promise<ReconciliationResult> {
    const payload =
      record.normalized_payload ??
      record.raw_payload ??
      {};

    const brandName = readString(payload, "brand");
    const modelName = readString(payload, "model");
    const generationName =
      readString(payload, "generation");
    const variantName =
      readString(payload, "variant") ??
      record.raw_name;

    if (
      !brandName ||
      !modelName ||
      !generationName ||
      !variantName
    ) {
      return {
        decision: "reject",
        candidateEntityId: null,
        matchMethod: null,
        matchScore: 0,
        notes:
          "Missing brand, model, generation or variant name.",
      };
    }

    const brand = await this.findBrand(brandName);

    if (!brand) {
      return {
        decision: "manual_review",
        candidateEntityId: null,
        matchMethod: null,
        matchScore: 20,
        notes: `Brand not found: ${brandName}`,
      };
    }

    const model = await this.findModel(
      brand.id,
      modelName,
    );

    if (!model) {
      return {
        decision: "manual_review",
        candidateEntityId: null,
        matchMethod: null,
        matchScore: 30,
        notes: `Model not found: ${brand.name} ${modelName}`,
      };
    }

    const generation = await this.findGeneration(
      model.id,
      generationName,
    );

    if (!generation) {
      return {
        decision: "manual_review",
        candidateEntityId: null,
        matchMethod: null,
        matchScore: 40,
        notes:
          `Generation not found: ${brand.name} ` +
          `${model.name} ${generationName}`,
      };
    }

    const variants =
      await this.getGenerationVariants(
        generation.id,
        record.market_code ?? "EU",
      );

    if (variants.length === 0) {
      return {
        decision: "create_new",
        candidateEntityId: null,
        matchMethod: "parent_and_name",
        matchScore: 90,
        notes:
          "Hierarchy matched and no variants exist.",
      };
    }

    const incomingName = normalizeVariantName(
      variantName,
      brand.name,
      model.name,
    );

    const incomingSlug = slugify(incomingName);

    const exact = variants.find(
      (variant) =>
        slugify(
          normalizeVariantName(
            variant.name,
            brand.name,
            model.name,
          ),
        ) === incomingSlug,
    );

    if (exact) {
      return {
        decision: "match_existing",
        candidateEntityId: exact.id,
        matchMethod: "exact_slug",
        matchScore: 100,
        notes: "Exact normalized variant match.",
      };
    }

    const best = variants
      .map((variant) => ({
        variant,
        score: similarityScore(
          incomingName,
          normalizeVariantName(
            variant.name,
            brand.name,
            model.name,
          ),
        ),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (best && best.score >= 85) {
      return {
        decision: "match_existing",
        candidateEntityId: best.variant.id,
        matchMethod: "fuzzy",
        matchScore: best.score,
        notes:
          `High-confidence match with "${best.variant.name}".`,
      };
    }

    if (best && best.score >= 55) {
      return {
        decision: "manual_review",
        candidateEntityId: best.variant.id,
        matchMethod: "fuzzy",
        matchScore: best.score,
        notes:
          `Possible match with "${best.variant.name}".`,
      };
    }

    return {
      decision: "create_new",
      candidateEntityId: null,
      matchMethod: "parent_and_name",
      matchScore: 90,
      notes:
        "Hierarchy matched but no similar variant exists.",
    };
  }

  private async getSourceIds(
    sourceCodes: string[],
  ): Promise<string[]> {
    const { data, error } = await supabaseAdmin
      .from("automotive_data_sources")
      .select("id, code")
      .in("code", sourceCodes);

    if (error) {
      throw new Error(
        `Unable to load data sources: ${error.message}`,
      );
    }

    return (data ?? []).map((source) => source.id);
  }

  private async findBrand(
    name: string,
  ): Promise<NamedEntity | null> {
    return this.findBySlug(
      "automotive_brands",
      slugify(name),
    );
  }

  private async findModel(
    brandId: string,
    name: string,
  ): Promise<NamedEntity | null> {
    const { data, error } = await supabaseAdmin
      .from("automotive_models")
      .select("id, name, slug")
      .eq("brand_id", brandId)
      .eq("slug", slugify(name))
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data as NamedEntity | null;
  }

  private async findGeneration(
    modelId: string,
    name: string,
  ): Promise<NamedEntity | null> {
    const { data, error } = await supabaseAdmin
      .from("automotive_generations")
      .select("id, name, slug")
      .eq("model_id", modelId)
      .eq("slug", slugify(name))
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data as NamedEntity | null;
  }

  private async findBySlug(
    table: string,
    slug: string,
  ): Promise<NamedEntity | null> {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data as NamedEntity | null;
  }

  private async getGenerationVariants(
    generationId: string,
    marketCode: string,
  ): Promise<NamedEntity[]> {
    const { data, error } = await supabaseAdmin
      .from("automotive_variants")
      .select("id, name, slug")
      .eq("generation_id", generationId)
      .eq("market_code", marketCode);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as NamedEntity[];
  }

  private async saveResult(
    stagingRecordId: string,
    result: ReconciliationResult,
  ): Promise<void> {
    const status =
      result.decision === "match_existing"
        ? "matched"
        : result.decision === "create_new"
          ? "new_candidate"
          : result.decision === "reject"
            ? "rejected"
            : "conflict";

    await this.transitions.transition(
      stagingRecordId,
      status,
      {
        confidence_score: result.matchScore,
        matched_entity_type: result.candidateEntityId ? "variant" : null,
        canonical_entity_type: result.candidateEntityId ? "version" : null,
        matched_entity_id: result.candidateEntityId,
        review_notes: result.notes,
      },
      {
        reason: result.notes,
        actorType: "reconciliation_engine_v2",
        metadata: { decision: result.decision, matchMethod: result.matchMethod },
      },
    );

    await supabaseAdmin
      .from("automotive_reconciliation_queue")
      .delete()
      .eq("staging_record_id", stagingRecordId);

    const { error: queueError } =
      await supabaseAdmin
        .from("automotive_reconciliation_queue")
        .insert({
          staging_record_id: stagingRecordId,
          candidate_entity_type: "variant",
          canonical_entity_type: "version",
          candidate_entity_id:
            result.candidateEntityId,
          match_method: result.matchMethod,
          match_score: result.matchScore,
          decision: result.decision,
          decision_notes: result.notes,
          resolved_at:
            result.decision === "match_existing"
              ? new Date().toISOString()
              : null,
        });

    if (queueError) {
      throw new Error(queueError.message);
    }
  }
}