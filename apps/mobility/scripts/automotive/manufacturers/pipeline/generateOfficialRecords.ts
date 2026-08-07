/**
 * Z Mobility
 * Universal Manufacturer Pipeline
 *
 * Generates records for every extracted HTML document and consolidates
 * the manufacturer-wide result deterministically.
 */

import {
  buildGenerationReport,
  runGenerationEngine,
} from "../../generation";

import type {
  ExtractedOfficialDocument,
} from "../../documents";

import type {
  ManufacturerOfficialRecord,
  OfficialDocumentType,
} from "../../core/manufacturer-types";

import type {
  DetectedVariant,
  RejectedCandidate,
} from "../../generation/parser-types";

import type {
  ManufacturerPipelineContext,
} from "../ManufacturerPipelineContext";

import {
  buildGenerationInput,
} from "./buildGenerationInput";

function metadataString(
  document: ExtractedOfficialDocument,
  key: string,
): string | null {
  const value =
    document.source.attachment.sourceMetadata?.[key];

  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function metadataNumber(
  document: ExtractedOfficialDocument,
  key: string,
): number | undefined {
  const value =
    document.source.attachment.sourceMetadata?.[key];

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function resolveDocumentType(
  context: ManufacturerPipelineContext,
  document: ExtractedOfficialDocument,
): OfficialDocumentType {
  const value =
    document.source.attachment.sourceDocumentType;

  return (
    value === "press_kit" ||
    value === "technical_specification" ||
    value === "model_range" ||
    value === "brochure" ||
    value === "price_list" ||
    value === "homologation" ||
    value === "other"
  )
    ? value
    : context.input.documentType;
}

function uniqueByExternalId(
  records: readonly ManufacturerOfficialRecord[],
): ManufacturerOfficialRecord[] {
  const byExternalId =
    new Map<string, ManufacturerOfficialRecord>();

  for (const record of records) {
    if (!byExternalId.has(record.externalId)) {
      byExternalId.set(record.externalId, record);
    }
  }

  return [...byExternalId.values()].sort((a, b) =>
    a.externalId.localeCompare(b.externalId),
  );
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function generateOfficialRecords(
  context: ManufacturerPipelineContext,
): Promise<void> {
  context.detectedVariants = [];
  context.officialRecords = [];
  context.rejectedCandidates = [];
  context.generationReport = undefined;
  context.generationReports = [];

  const htmlDocuments =
    context.extractedDocuments.filter(
      (document) => document.type === "html",
    );

  if (htmlDocuments.length === 0) {
    context.result.warnings.push(
      "No extracted HTML document is available for official record generation.",
    );
    return;
  }

  const allVariants: DetectedVariant[] = [];
  const allRecords: ManufacturerOfficialRecord[] = [];
  const allRejected: RejectedCandidate[] = [];
  const allWarnings: string[] = [];
  const minimumConfidence = context.input.minConfidence ?? 0;

  for (const document of htmlDocuments) {
    const modelSlug =
      metadataString(document, "modelSlug") ??
      context.input.modelSlug ??
      null;
    const modelName =
      metadataString(document, "modelName") ??
      metadataString(document, "model") ??
      context.input.modelName ??
      null;

    if (!modelSlug || !modelName) {
      allWarnings.push(
        `Document "${document.source.attachment.url}" has no model identity and was skipped.`,
      );
      continue;
    }

    const extraction = buildGenerationInput(
      document,
      {
        brandSlug: context.input.brandSlug,
        modelSlug,
        finalUrl: document.source.attachment.url,
        schemaVersion: "1.0.0",
        reviewRequired: true,
      },
    );

    const generationResult = runGenerationEngine({
      extraction,
      variantParser:
        context.adapter.parseVariants,
      mapping: {
        brandSlug: context.input.brandSlug,
        modelSlug,
        manufacturerName:
          context.adapter.manufacturerName,
        brandName:
          context.adapter.brandName,
        countryCode:
          context.adapter.countryCode,
        marketCode:
          context.input.marketCode,
        modelName,
        generation:
          metadataString(document, "generation") ??
          context.input.generation ??
          null,
        modelYear:
          metadataNumber(document, "modelYear") ??
          context.input.modelYear,
        officialUrl:
          document.source.attachment.url,
        documentType:
          resolveDocumentType(context, document),
        sourceTitle: document.title,
        sourceDescription:
          typeof document.metadata.description === "string"
            ? document.metadata.description
            : null,
        sourceLanguage: document.language,
        sourceSha256: document.source.sha256,
        extractionSchemaVersion:
          extraction.schemaVersion,
      },
    });

    const acceptedRecords =
      generationResult.officialRecords.filter(
        (_, index) =>
          (generationResult.detectedVariants[index]?.confidence ?? 0) >=
          minimumConfidence,
      );

    const acceptedExternalIds = new Set(
      acceptedRecords.map((record) => record.externalId),
    );
    const acceptedVariants =
      generationResult.detectedVariants.filter(
        (_, index) =>
          acceptedExternalIds.has(
            generationResult.officialRecords[index]?.externalId ?? "",
          ),
      );

    allVariants.push(...acceptedVariants);
    allRecords.push(...acceptedRecords);
    allRejected.push(
      ...generationResult.rejectedCandidates,
    );
    allWarnings.push(
      ...generationResult.generationReport.warnings,
    );
    context.generationReports.push(
      generationResult.generationReport,
    );
  }

  context.detectedVariants = [...allVariants];
  context.officialRecords = uniqueByExternalId(allRecords);
  context.rejectedCandidates = [...allRejected];

  const firstReport = context.generationReports[0];
  if (firstReport) {
    context.generationReport = buildGenerationReport({
      source: firstReport.source,
      target: {
        brandSlug: context.input.brandSlug,
        modelSlug:
          context.input.modelSlug ??
          "manufacturer-catalog",
      },
      detectedVariants:
        context.detectedVariants,
      acceptedRecords:
        context.officialRecords,
      rejectedCandidates:
        context.rejectedCandidates,
      warnings: uniqueStrings(allWarnings),
    });
  }

  context.result.warnings.push(
    ...uniqueStrings(allWarnings),
  );
}
