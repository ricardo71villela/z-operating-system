import type {
  ManufacturerPipelineInput,
} from "./ManufacturerPipelineInput";

import type {
  ManufacturerSource,
} from "./ManufacturerSource";

import type {
  OfficialHtmlExtraction,
  VariantTableParseResult,
} from "../../generation/parser-types";

import type {
  OfficialAttachment,
} from "../../documents";

/**
 * Contract implemented by every manufacturer adapter.
 *
 * The Universal Manufacturer Pipeline must never contain
 * manufacturer-specific conditions. All brand-specific
 * behaviour belongs here.
 */
export interface ManufacturerAdapter {
  /**
   * Stable adapter identifier.
   *
   * Examples:
   * bmw
   * audi
   * mercedes
   */
  readonly id: string;

  /**
   * Human-readable manufacturer name.
   */
  readonly manufacturerName: string;

  /**
   * Human-readable brand name.
   */
  readonly brandName: string;

  /**
   * Manufacturer country code.
   */
  readonly countryCode: string;

  /** Source code used by the staging importer. */
  readonly sourceCode?: string;

  /**
   * Returns true when this adapter can process the input.
   */
  canHandle(
    input: ManufacturerPipelineInput,
  ): boolean;

  /**
   * Discovers the official sources required for one
   * pipeline execution.
   *
   * When the input already contains sources, the adapter
   * may preserve, validate or enrich them.
   */
  discoverSources(
    input: ManufacturerPipelineInput,
  ): Promise<ManufacturerSource[]>;

  /**
   * Selects and prioritizes the sources that should
   * continue through the pipeline.
   *
   * This method must be deterministic.
   */
  selectSources(
    sources: readonly ManufacturerSource[],
  ): ManufacturerSource[];

  /** Optional manufacturer-specific attachment selection. */
  selectAttachments?(
    attachments: readonly OfficialAttachment[],
  ): OfficialAttachment[];

  /** Optional manufacturer-specific variant parser. */
  parseVariants?(
    extraction: OfficialHtmlExtraction,
  ): VariantTableParseResult;
}