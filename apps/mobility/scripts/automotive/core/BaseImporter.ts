import type {
  AdapterContext,
  ImportSummary,
  NormalizedAutomotiveRecord,
} from "./types";

import { supabaseAdmin } from "../supabase-admin";
import { AutomotiveNormalizer } from "../normalize/AutomotiveNormalizer";
import { BaseAdapter } from "./BaseAdapter";

export class BaseImporter {
  private readonly normalizer =
    new AutomotiveNormalizer();

  async run(adapter: BaseAdapter): Promise<ImportSummary> {
    const source = await this.getSource(
      adapter.sourceCode,
    );

    const run = await this.createImportRun(
      source.id,
      adapter.entityType,
    );

    const context: AdapterContext = {
      sourceId: source.id,
      importRunId: run.id,
    };

    let received = 0;
    let inserted = 0;
    let updated = 0;
    let rejected = 0;

    try {
      const externalRecords =
        await adapter.fetchRecords(context);

      received = externalRecords.length;

      for (const externalRecord of externalRecords) {
        const normalized =
          this.normalizer.normalize(externalRecord);

        if (normalized.validationErrors.length > 0) {
          rejected += 1;
        }

        const existed = await this.withRetry(
          () =>
            this.stagingRecordExists(
              source.id,
              normalized.entityType,
              normalized.externalId,
            ),
          `inspect staging record ${normalized.externalId}`,
        );

        await this.withRetry(
          () =>
            this.saveStagingRecord(
              source.id,
              run.id,
              normalized,
            ),
          `save staging record ${normalized.externalId}`,
        );

        if (existed) {
          updated += 1;
        } else {
          inserted += 1;
        }

        const processed =
          inserted + updated + rejected;

        if (processed % 100 === 0) {
          console.log(
            `Processed ${processed}/${received} records...`,
          );

          await new Promise((resolve) =>
            setTimeout(resolve, 250),
          );
        }
      }

      await this.finishImportRun(run.id, {
        received,
        inserted,
        updated,
        rejected,
      });

      return {
        received,
        inserted,
        updated,
        rejected,
      };
    } catch (error) {
      await this.failImportRun(run.id, error);
      throw error;
    }
  }

  private async getSource(sourceCode: string) {
    const { data, error } = await supabaseAdmin
    .from("automotive_data_sources")
    .select("id, code")
    .eq("code", sourceCode)
    .maybeSingle();

    if (error) {
    throw new Error(
        `Failed to query automotive_data_sources for "${sourceCode}": ${error.message}`
    );
    }

    if (!data) {
    throw new Error(
        `Automotive source "${sourceCode}" does not exist in automotive_data_sources.\n` +
        `Did you execute the corresponding insert-<manufacturer>-source.sql file?`
    );
    }

    return data;
  }

  private async createImportRun(
    sourceId: string,
    entityType: string,
  ) {
    const { data, error } = await supabaseAdmin
      .from("automotive_import_runs")
      .insert({
        source_id: sourceId,
        entity_type: entityType,
        status: "running",
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(
        `Unable to create import run: ${
          error?.message ?? "unknown error"
        }`,
      );
    }

    return data;
  }

  private async stagingRecordExists(
    sourceId: string,
    entityType: string,
    externalId: string,
  ): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from("automotive_staging_records")
      .select("id")
      .eq("source_id", sourceId)
      .eq("entity_type", entityType)
      .eq("external_id", externalId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Unable to inspect staging record: ${error.message}`,
      );
    }

    return Boolean(data);
  }

  private async saveStagingRecord(
    sourceId: string,
    importRunId: string,
    record: NormalizedAutomotiveRecord,
  ): Promise<void> {
    const status =
      record.validationErrors.length > 0
        ? "conflict"
        : "normalized";

    const { error } = await supabaseAdmin
      .from("automotive_staging_records")
      .upsert(
        {
          source_id: sourceId,
          import_run_id: importRunId,
          entity_type: record.entityType,
          external_id: record.externalId,
          external_parent_id:
            record.externalParentId ?? null,
          raw_name: record.rawName ?? null,
          normalized_name: record.normalizedName,
          raw_payload: record.payload,
          normalized_payload:
            record.normalizedPayload,
          source_country_code:
            record.countryCode ?? null,
          market_code: record.marketCode ?? null,
          status,
          validation_errors:
            record.validationErrors,
          validation_warnings:
            record.validationWarnings,
        },
        {
          onConflict:
            "source_id,entity_type,external_id",
        },
      );

    if (error) {
      throw new Error(
        `Unable to save staging record "${record.externalId}": ${error.message}`,
      );
    }
  }

  private async finishImportRun(
    runId: string,
    summary: ImportSummary,
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("automotive_import_runs")
      .update({
        status:
          summary.rejected > 0
            ? "partial"
            : "completed",
        completed_at: new Date().toISOString(),
        rows_received: summary.received,
        rows_inserted: summary.inserted,
        rows_updated: summary.updated,
        rows_rejected: summary.rejected,
      })
      .eq("id", runId);

    if (error) {
      throw new Error(
        `Unable to finish import run: ${error.message}`,
      );
    }
  }

  private async failImportRun(
    runId: string,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown importer error";

    await supabaseAdmin
      .from("automotive_import_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", runId);
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    label: string,
    attempts = 5,
  ): Promise<T> {
    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= attempts;
      attempt += 1
    ) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === attempts) {
          break;
        }

        const delayMs =
          500 * 2 ** (attempt - 1);

        console.warn(
          `Retry ${attempt}/${attempts - 1} for ${label} in ${delayMs}ms...`,
        );

        await new Promise((resolve) =>
          setTimeout(resolve, delayMs),
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Operation failed: ${label}`);
  }
}