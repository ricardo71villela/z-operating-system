/**
 * Z Mobility
 * Universal Official Records Generation Engine
 *
 * Responsibilities:
 *  - detect variant candidates from extracted tables;
 *  - enrich detected variants with paragraph evidence;
 *  - map accepted variants to official records;
 *  - build the deterministic generation report.
 *
 * No filesystem access.
 * No network access.
 * No external services.
 * No manufacturer-specific source discovery.
 */

import {
  mapDetectedVariants,
} from "./mapper";

import type {
  ManufacturerOfficialRecord,
} from "../core/manufacturer-types";

import type {
  DetectedVariant,
  GenerationReport,
  MappingOptions,
  OfficialHtmlExtraction,
  RejectedCandidate,
  VariantTableParseResult,
} from "./parser-types";

import {
  enrichVariantsFromParagraphs,
} from "./parsers/paragraph-parser";

import {
  parseVariantTables,
} from "./parsers/variant-table-parser";

import {
  buildGenerationReport,
} from "./report";

export type RunGenerationEngineOptions = {
  extraction: OfficialHtmlExtraction;
  mapping: MappingOptions;
  variantParser?: (
    extraction: OfficialHtmlExtraction,
  ) => VariantTableParseResult;
};

export type GenerationEngineResult = {
  detectedVariants: DetectedVariant[];

  officialRecords:
    ManufacturerOfficialRecord[];

  rejectedCandidates:
    RejectedCandidate[];

  generationReport: GenerationReport;
};

/**
 * Executes the complete, deterministic Generation Engine.
 */
export function runGenerationEngine(
  options: RunGenerationEngineOptions,
): GenerationEngineResult {
  const {
    extraction,
    mapping,
  } = options;

  const tableParsing =
    (options.variantParser ??
      parseVariantTables)(
      extraction,
    );

  const paragraphEnrichment =
    enrichVariantsFromParagraphs(
      extraction,
      tableParsing.variants,
    );

  const detectedVariants = [
    ...paragraphEnrichment.variants,
  ];

  const rejectedCandidates = [
    ...tableParsing.rejectedCandidates,
  ];

  const officialRecords =
    mapDetectedVariants(
      detectedVariants,
      mapping,
    );

  const warnings = [
    ...tableParsing.warnings,
    ...paragraphEnrichment.warnings,
  ];

  const generationReport =
    buildGenerationReport({
      source:
        extraction.source,

      target:
        extraction.target,

      detectedVariants,

      acceptedRecords:
        officialRecords,

      rejectedCandidates,

      warnings,
    });

  return {
    detectedVariants,
    officialRecords,
    rejectedCandidates,
    generationReport,
  };
}