import { supabaseAdmin } from "../supabase-admin";

type GoldenRecordRow = {
  id: string;
  entity_id: string;
};

type ImportedStagingRow = {
  id: string;
  source_id: string;
  matched_entity_id: string;
  confidence_score: number | null;
  raw_payload: Record<string, unknown> | null;
  normalized_payload: Record<string, unknown> | null;
  reviewed_at: string | null;
  updated_at: string | null;
};

type GoldenSourcesSummary = {
  goldenRecords: number;
  stagingRecords: number;
  insertedOrUpdated: number;
  sourceCountsUpdated: number;
  skipped: number;
  failed: number;
};

export class GoldenSourcesBuilder {
  async buildVariantSources(): Promise<GoldenSourcesSummary> {
    const goldenRecords =
      await this.loadVariantGoldenRecords();

    const goldenByEntityId = new Map(
      goldenRecords.map((record) => [
        record.entity_id,
        record,
      ]),
    );

    const stagingRecords =
      await this.loadImportedVariantRecords();

    let insertedOrUpdated = 0;
    let skipped = 0;
    let failed = 0;

    const affectedGoldenRecordIds = new Set<string>();

    for (const stagingRecord of stagingRecords) {
      const goldenRecord = goldenByEntityId.get(
        stagingRecord.matched_entity_id,
      );

      if (!goldenRecord) {
        console.warn(
          `SKIP staging ${stagingRecord.id}: ` +
            `no Golden Record for entity ` +
            stagingRecord.matched_entity_id,
        );

        skipped += 1;
        continue;
      }

      try {
        const payload =
          stagingRecord.normalized_payload ??
          stagingRecord.raw_payload ??
          {};

        const confidence =
          stagingRecord.confidence_score ?? 0;

        const { error } = await supabaseAdmin
          .from("automotive_golden_sources")
          .upsert(
            {
              golden_record_id: goldenRecord.id,
              source_id: stagingRecord.source_id,
              staging_record_id: stagingRecord.id,
              payload,
              confidence_score: confidence,
              is_primary: false,
              active: true,
              imported_at:
                stagingRecord.reviewed_at ??
                stagingRecord.updated_at ??
                new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
            },
            {
              onConflict:
                "golden_record_id,source_id,staging_record_id",
            },
          );

        if (error) {
          throw new Error(error.message);
        }

        affectedGoldenRecordIds.add(goldenRecord.id);
        insertedOrUpdated += 1;

        console.log(
          `SOURCE LINKED: staging ${stagingRecord.id} ` +
            `→ golden ${goldenRecord.id}`,
        );
      } catch (error) {
        failed += 1;

        console.error(
          `FAILED staging ${stagingRecord.id}:`,
          error instanceof Error
            ? error.message
            : error,
        );
      }
    }

    let sourceCountsUpdated = 0;

    for (const goldenRecordId of affectedGoldenRecordIds) {
      try {
        await this.updateSourceCount(goldenRecordId);
        sourceCountsUpdated += 1;
      } catch (error) {
        failed += 1;

        console.error(
          `FAILED source count for ${goldenRecordId}:`,
          error instanceof Error
            ? error.message
            : error,
        );
      }
    }

    return {
      goldenRecords: goldenRecords.length,
      stagingRecords: stagingRecords.length,
      insertedOrUpdated,
      sourceCountsUpdated,
      skipped,
      failed,
    };
  }

  private async loadVariantGoldenRecords():
    Promise<GoldenRecordRow[]> {
    const { data, error } = await supabaseAdmin
      .from("automotive_golden_records")
      .select("id, entity_id")
      .eq("entity_type", "variant");

    if (error) {
      throw new Error(
        `Unable to load Golden Records: ${error.message}`,
      );
    }

    return (
      data ?? []
    ) as unknown as GoldenRecordRow[];
  }

  private async loadImportedVariantRecords():
    Promise<ImportedStagingRow[]> {
    const { data, error } = await supabaseAdmin
      .from("automotive_staging_records")
      .select(
        [
          "id",
          "source_id",
          "matched_entity_id",
          "confidence_score",
          "raw_payload",
          "normalized_payload",
          "reviewed_at",
          "updated_at",
        ].join(","),
      )
      .eq("entity_type", "variant")
      .eq("status", "imported")
      .not("matched_entity_id", "is", null);

    if (error) {
      throw new Error(
        `Unable to load imported staging records: ${error.message}`,
      );
    }

    return (
      data ?? []
    ) as unknown as ImportedStagingRow[];
  }

  private async updateSourceCount(
    goldenRecordId: string,
  ): Promise<void> {
    const {
      count,
      error: countError,
    } = await supabaseAdmin
      .from("automotive_golden_sources")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("golden_record_id", goldenRecordId)
      .eq("active", true);

    if (countError) {
      throw new Error(countError.message);
    }

    const { error: updateError } = await supabaseAdmin
      .from("automotive_golden_records")
      .update({
        source_count: count ?? 0,
        last_reconciled_at:
          new Date().toISOString(),
      })
      .eq("id", goldenRecordId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }
}