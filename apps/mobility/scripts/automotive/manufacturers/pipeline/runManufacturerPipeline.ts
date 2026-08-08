/**
 * Z Mobility
 * Universal Manufacturer Pipeline
 *
 * Universal Runner
 *
 * Responsibilities:
 *  - resolve the appropriate manufacturer adapter;
 *  - create the execution context;
 *  - execute pipeline stages;
 *  - return a deterministic execution result.
 */

import {
  executeStage,
} from "../../pipeline";

import type {
  ManufacturerPipelineInput,
  ManufacturerPipelineResult,
} from "../contracts";

import type {
  ManufacturerPipelineContext,
} from "../ManufacturerPipelineContext";

import {
  ManufacturerRegistry,
} from "../registry";

import {
  discoverAttachmentsStage,
} from "./discoverAttachments";

import {
  discoverSourcesStage,
} from "./discoverSources";

import {
  downloadDocumentsStage,
} from "./downloadDocuments";

import {
  extractDocumentsStage,
} from "./extractDocuments";

import {
  generateOfficialRecords,
} from "./generateOfficialRecords";

export type RunManufacturerPipelineOptions = {
  registry: ManufacturerRegistry;
  input: ManufacturerPipelineInput;
};

export async function runManufacturerPipeline(
  options: RunManufacturerPipelineOptions,
): Promise<ManufacturerPipelineResult> {
  const startedAt = Date.now();

  const adapter =
    options.registry.resolve(
      options.input,
    );

  const result: ManufacturerPipelineResult = {
    adapterId: adapter.id,

    manufacturerName:
      adapter.manufacturerName,

    brandName:
      adapter.brandName,

    sources: [],

    discoveredSourceCount: 0,

    selectedSourceCount: 0,

    downloadedDocumentCount: 0,

    extractedDocumentCount: 0,

    generatedRecordCount: 0,

    stagedRecordCount: 0,

    records: [],

    warnings: [],

    dryRun:
      options.input.dryRun ?? false,

    durationMs: 0,

    success: true,
  };

  const context: ManufacturerPipelineContext = {
    adapter,

    input: options.input,

    discoveredSources: [],

    selectedSources: [],

    attachments: [],

    documents: [],

    extractedDocuments: [],

    detectedVariants: [],

    officialRecords: [],

    rejectedCandidates: [],

    generationReport: undefined,

    generationReports: [],

    result,
  };

  await executeStage(
    discoverSourcesStage,
    context,
  );

  await executeStage(
    discoverAttachmentsStage,
    context,
  );

  await executeStage(
    downloadDocumentsStage,
    context,
  );

  await executeStage(
    extractDocumentsStage,
    context,
  );

  await generateOfficialRecords(
    context,
  );

  result.generatedRecordCount =
    context.officialRecords.length;

  result.records = [
    ...context.officialRecords,
  ];

  result.durationMs =
    Date.now() - startedAt;

  return result;
}