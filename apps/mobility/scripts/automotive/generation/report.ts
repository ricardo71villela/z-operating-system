/**
 * Z Mobility
 * Official Records Generation Engine
 *
 * Builds the final generation report.
 *
 * No parsing.
 * No mapping.
 * No filesystem access.
 * No external services.
 */

import type {
  DetectedVariant,
  GenerationReport,
  RejectedCandidate,
} from "./parser-types";

import type {
  ManufacturerOfficialRecord,
} from "../core/manufacturer-types";

import {
  unique,
} from "./utils";

const GENERATION_REPORT_SCHEMA_VERSION =
  "1.0.0";

export type BuildGenerationReportInput = {
  source: GenerationReport["source"];
  target: GenerationReport["target"];

  detectedVariants:
    readonly DetectedVariant[];

  acceptedRecords:
    readonly ManufacturerOfficialRecord[];

  rejectedCandidates:
    readonly RejectedCandidate[];

  warnings:
    readonly string[];

  generatedAt?: string;
};

export function buildGenerationReport(
  input: BuildGenerationReportInput,
): GenerationReport {
  const warnings = unique(
    input.warnings
      .map((warning) => warning.trim())
      .filter(
        (warning) => warning.length > 0,
      ),
  );

  const detectedVariants = [
    ...input.detectedVariants,
  ];

  const acceptedRecords = [
    ...input.acceptedRecords,
  ];

  const rejectedCandidates = [
    ...input.rejectedCandidates,
  ];

  return {
    schemaVersion:
      GENERATION_REPORT_SCHEMA_VERSION,

    source: input.source,
    target: input.target,

    generatedAt:
      input.generatedAt ??
      new Date().toISOString(),

    detectedVariants,
    acceptedRecords,
    rejectedCandidates,
    warnings,

    summary: {
      candidates:
        detectedVariants.length,

      accepted:
        acceptedRecords.length,

      rejected:
        rejectedCandidates.length,

      warnings:
        warnings.length,
    },
  };
}