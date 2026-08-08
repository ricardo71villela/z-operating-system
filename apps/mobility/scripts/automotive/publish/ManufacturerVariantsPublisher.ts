import { slugify } from "../config";
import { supabaseAdmin } from "../supabase-admin";
import { StagingStateTransitionService } from "./StagingStateTransitionService";

type PublishMode = "dry_run" | "apply";

type PublishSummary = {
  inspected: number;
  linked: number;
  created: number;
  skipped: number;
  failed: number;
  mode: PublishMode;
};

type StagingVariant = {
  id: string;
  source_id: string;
  external_id: string | null;
  raw_name: string | null;
  market_code: string | null;
  status: string;
  confidence_score: number | null;
  raw_payload: Record<string, unknown> | null;
  normalized_payload: Record<string, unknown> | null;
};

type ReconciliationRecord = {
  staging_record_id: string;
  candidate_entity_id: string | null;
  decision:
    | "pending"
    | "match_existing"
    | "create_new"
    | "merge"
    | "reject"
    | "manual_review";
  match_score: number | null;
  decision_notes: string | null;
};

type ResolvedHierarchy = {
  generationId: string;
  bodyStyleId: string | null;
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

function readNumber(
  payload: Record<string, unknown>,
  key: string,
): number | null {
  const value = payload[key];

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

export class ManufacturerVariantsPublisher {
  private readonly transitions = new StagingStateTransitionService();
  async publish(
    sourceCodes: string[],
    mode: PublishMode = "dry_run",
  ): Promise<PublishSummary> {
    const sourceIds =
    await this.getSourceIds(sourceCodes);

    console.log("Publisher source codes:", sourceCodes);
    console.log("Publisher source IDs:", sourceIds);

    const records =
    await this.getStagingVariants(sourceIds);

    console.log(
    "Publisher eligible staging records:",
    records.map((record) => ({
        id: record.id,
        name: record.raw_name,
        status: record.status,
        sourceId: record.source_id,
    })),
    );

    let linked = 0;
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const record of records) {
      try {
        const reconciliation =
          await this.getReconciliation(record.id);

        if (!reconciliation) {
          console.log(
            `SKIP ${record.raw_name ?? record.id}: ` +
              "no reconciliation decision",
          );

          skipped += 1;
          continue;
        }

        if (
          reconciliation.decision ===
            "match_existing" &&
          reconciliation.candidate_entity_id
        ) {
          console.log(
            `${mode === "dry_run"
              ? "WOULD LINK"
              : "LINK"}: ` +
              `${record.raw_name ?? record.id} → ` +
              reconciliation.candidate_entity_id,
          );

          if (mode === "apply") {
            await this.markImported(
              record.id,
              reconciliation.candidate_entity_id,
            );

            await this.resolveQueue(record.id);
          }

          linked += 1;
          continue;
        }

        if (
          reconciliation.decision === "create_new"
        ) {
          if (record.status !== "approved") {
            console.log(
              `SKIP ${record.raw_name ?? record.id}: ` +
                "create_new requires status=approved; " +
                `current status=${record.status}`,
            );

            skipped += 1;
            continue;
          }

          const hierarchy =
            await this.resolveHierarchy(record);

          if (!hierarchy) {
            console.log(
              `SKIP ${record.raw_name ?? record.id}: ` +
                "brand, model or generation could not be resolved",
            );

            skipped += 1;
            continue;
          }

          if (mode === "dry_run") {
            console.log(
              `WOULD CREATE: ${
                record.raw_name ?? record.id
              }`,
            );

            created += 1;
            continue;
          }

          const variantId =
            await this.createOrUpdateVariant(
              record,
              hierarchy,
            );

          await this.markImported(
            record.id,
            variantId,
          );

          await this.resolveQueue(record.id);

          console.log(
            `CREATE: ${
              record.raw_name ?? record.id
            } → ${variantId}`,
          );

          created += 1;
          continue;
        }

        console.log(
          `SKIP ${record.raw_name ?? record.id}: ` +
            `decision=${reconciliation.decision}`,
        );

        skipped += 1;
      } catch (error) {
        failed += 1;

        console.error(
          `FAILED ${record.raw_name ?? record.id}:`,
          error instanceof Error
            ? error.message
            : error,
        );
      }
    }

    return {
      inspected: records.length,
      linked,
      created,
      skipped,
      failed,
      mode,
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

    const rows =
      (data ?? []) as unknown as {
        id: string;
        code: string;
      }[];

    const foundCodes = new Set(
      rows.map((row) => row.code),
    );

    const missing = sourceCodes.filter(
      (code) => !foundCodes.has(code),
    );

    if (missing.length > 0) {
      throw new Error(
        `Missing data sources: ${missing.join(", ")}`,
      );
    }

    return rows.map((row) => row.id);
  }

  private async getStagingVariants(
    sourceIds: string[],
  ): Promise<StagingVariant[]> {
    const { data, error } = await supabaseAdmin
      .from("automotive_staging_records")
      .select(
        [
          "id",
          "source_id",
          "external_id",
          "raw_name",
          "market_code",
          "status",
          "confidence_score",
          "raw_payload",
          "normalized_payload",
        ].join(","),
      )
      .in("source_id", sourceIds)
      .eq("entity_type", "variant")
      .in("status", [
        "matched",
        "approved",
        "new_candidate",
        "conflict",
      ])
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      throw new Error(
        `Unable to load staging variants: ${error.message}`,
      );
    }

    return (
      data ?? []
    ) as unknown as StagingVariant[];
  }

  private async getReconciliation(
    stagingRecordId: string,
  ): Promise<ReconciliationRecord | null> {
    const { data, error } = await supabaseAdmin
      .from("automotive_reconciliation_queue")
      .select(
        [
          "staging_record_id",
          "candidate_entity_id",
          "decision",
          "match_score",
          "decision_notes",
        ].join(","),
      )
      .eq("staging_record_id", stagingRecordId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Unable to load reconciliation: ${error.message}`,
      );
    }

    return data as unknown as
      | ReconciliationRecord
      | null;
  }

  private async resolveHierarchy(
    record: StagingVariant,
  ): Promise<ResolvedHierarchy | null> {
    const payload =
      record.normalized_payload ??
      record.raw_payload ??
      {};

    const brandName =
      readString(payload, "brand");

    const modelName =
      readString(payload, "model");

    const generationName =
      readString(payload, "generation");

    const bodyStyleCode =
      readString(payload, "body_style");

    if (
      !brandName ||
      !modelName ||
      !generationName
    ) {
      return null;
    }

    const { data: brand, error: brandError } =
      await supabaseAdmin
        .from("automotive_brands")
        .select("id")
        .eq("slug", slugify(brandName))
        .maybeSingle();

    if (brandError) {
      throw new Error(
        `Unable to resolve brand: ${brandError.message}`,
      );
    }

    if (!brand) {
      return null;
    }

    const { data: model, error: modelError } =
      await supabaseAdmin
        .from("automotive_models")
        .select("id")
        .eq("brand_id", brand.id)
        .eq("slug", slugify(modelName))
        .maybeSingle();

    if (modelError) {
      throw new Error(
        `Unable to resolve model: ${modelError.message}`,
      );
    }

    if (!model) {
      return null;
    }

    const {
      data: generation,
      error: generationError,
    } = await supabaseAdmin
      .from("automotive_generations")
      .select("id")
      .eq("model_id", model.id)
      .eq("slug", slugify(generationName))
      .maybeSingle();

    if (generationError) {
      throw new Error(
        `Unable to resolve generation: ${generationError.message}`,
      );
    }

    if (!generation) {
      return null;
    }

    let bodyStyleId: string | null = null;

    if (bodyStyleCode) {
      const {
        data: bodyStyle,
        error: bodyStyleError,
      } = await supabaseAdmin
        .from("automotive_body_styles")
        .select("id")
        .eq("code", bodyStyleCode)
        .maybeSingle();

      if (bodyStyleError) {
        throw new Error(
          `Unable to resolve body style: ${bodyStyleError.message}`,
        );
      }

      bodyStyleId = bodyStyle?.id ?? null;
    }

    return {
      generationId: generation.id,
      bodyStyleId,
    };
  }

  private async createOrUpdateVariant(
    record: StagingVariant,
    hierarchy: ResolvedHierarchy,
  ): Promise<string> {
    const payload =
      record.normalized_payload ??
      record.raw_payload ??
      {};

    const variantName =
      readString(payload, "variant") ??
      record.raw_name;

    if (!variantName) {
      throw new Error(
        "Variant name is missing.",
      );
    }

    const marketCode =
      record.market_code ??
      readString(payload, "market_code") ??
      "EU";

    const modelYear =
      readNumber(payload, "model_year");

    const automotiveDna =
      readString(payload, "automotive_dna") ??
      record.external_id ??
      `AUTO-${slugify(variantName)}-${marketCode}`;

    const { data, error } = await supabaseAdmin
      .from("automotive_variants")
      .upsert(
        {
          generation_id:
            hierarchy.generationId,

          body_style_id:
            hierarchy.bodyStyleId,

          name: variantName,

          slug: slugify(variantName),

          internal_code:
            readString(
              payload,
              "internal_code",
            ),

          market_code: marketCode,

          model_year_start:
            modelYear,

          doors:
            readNumber(payload, "doors"),

          seats:
            readNumber(payload, "seats"),

          automotive_dna:
            automotiveDna,

          active: true,

          data_quality_score:
            record.confidence_score ?? 90,

          source_id:
            record.source_id,
        },
        {
          onConflict:
            "generation_id,slug,market_code",
        },
      )
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(
        `Unable to publish variant "${variantName}": ${
          error?.message ?? "unknown error"
        }`,
      );
    }

    return data.id;
  }

  private async markImported(
    stagingRecordId: string,
    variantId: string,
  ): Promise<void> {
    await this.transitions.transition(
      stagingRecordId,
      "imported",
      {
        matched_entity_type: "variant",
        canonical_entity_type: "version",
        matched_entity_id: variantId,
        reviewed_at: new Date().toISOString(),
      },
      {
        reason: `Published as automotive version ${variantId}.`,
        actorType: "manufacturer_versions_publisher",
      },
    );
  }

  private async resolveQueue(
    stagingRecordId: string,
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("automotive_reconciliation_queue")
      .update({
        resolved_at: new Date().toISOString(),
      })
      .eq(
        "staging_record_id",
        stagingRecordId,
      );

    if (error) {
      throw new Error(
        `Unable to resolve reconciliation queue: ${error.message}`,
      );
    }
  }
}