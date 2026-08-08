import type {
  ManufacturerAdapter,
  ManufacturerPipelineInput,
  ManufacturerPipelineResult,
  ManufacturerSource,
} from "./contracts";

import type {
  DownloadedOfficialDocument,
  ExtractedOfficialDocument,
  OfficialAttachment,
} from "../documents";

import type {
  DetectedVariant,
  GenerationReport,
  RejectedCandidate,
} from "../generation/parser-types";

import type {
  ManufacturerOfficialRecord,
} from "../core/manufacturer-types";

export interface ManufacturerPipelineContext {
  /**
   * Active manufacturer adapter.
   */
  adapter: ManufacturerAdapter;

  /**
   * Pipeline execution input.
   */
  input: ManufacturerPipelineInput;

  /**
   * Sources discovered from the manufacturer website.
   */
  discoveredSources: ManufacturerSource[];

  /**
   * Sources selected for processing.
   */
  selectedSources: ManufacturerSource[];

  /**
   * Attachments discovered inside the selected sources.
   */
  attachments: OfficialAttachment[];

  /**
   * Downloaded official documents.
   */
  documents: DownloadedOfficialDocument[];

  /**
   * Structured document extraction.
   */
  extractedDocuments: ExtractedOfficialDocument[];

  /**
   * Variants detected by the Generation Engine.
   */
  detectedVariants: DetectedVariant[];

  /**
   * Official records generated from the detected variants.
   */
  officialRecords: ManufacturerOfficialRecord[];

  /**
   * Candidates rejected during generation.
   */
  rejectedCandidates: RejectedCandidate[];

  /**
   * Generation report produced by the Generation Engine.
   */
  generationReport?: GenerationReport;

  /** Per-document reports retained for manufacturer-wide runs. */
  generationReports: GenerationReport[];

  /**
   * Final pipeline execution result.
   */
  result: ManufacturerPipelineResult;
}