import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  mapDetectedVariants,
} from "../mapper";

import type {
  MappingOptions,
  OfficialHtmlExtraction,
} from "../parser-types";

import {
  enrichVariantsFromParagraphs,
} from "../parsers/paragraph-parser";

import {
  parseVariantTables,
} from "../parsers/variant-table-parser";

import {
  buildGenerationReport,
} from "../report";

import {
  findProjectRoot,
  loadJsonFile,
  unique,
} from "../utils";

test(
  "runs the complete Audi Generation Engine pipeline",
  async () => {
    const projectRoot =
      findProjectRoot(process.cwd());

    const fixturePath = path.join(
      projectRoot,
      "imports",
      "official-html",
      "audi",
      "a6-c9.extracted.json",
    );

    const extraction =
      await loadJsonFile<OfficialHtmlExtraction>(
        fixturePath,
      );

    const tableResult =
      parseVariantTables(extraction);

    const paragraphResult =
      enrichVariantsFromParagraphs(
        extraction,
        tableResult.variants,
      );

    const mappingOptions:
      MappingOptions = {
        brandSlug:
          extraction.target.brandSlug,

        modelSlug:
          extraction.target.modelSlug,

        manufacturerName:
          "Audi AG",

        brandName:
          "Audi",

        countryCode:
          "DE",

        marketCode:
          "PT",

        modelName:
          "A6 C9",

        generation:
          "C9",

        modelYear:
          2026,

        officialUrl:
          extraction.source.finalUrl ||
          extraction.source.url,

        documentType:
          "model_range",

        sourceTitle:
          extraction.page.title,

        sourceDescription:
          extraction.page.description,

        sourceLanguage:
          extraction.page.language,

        sourceSha256:
          extraction.source.sha256,

        extractionSchemaVersion:
          extraction.schemaVersion,
      };

    const acceptedRecords =
      mapDetectedVariants(
        paragraphResult.variants,
        mappingOptions,
      );

    const warnings = unique([
      ...tableResult.warnings,
      ...paragraphResult.warnings,

      ...(extraction.reviewRequired
        ? [
            "The source extraction is marked as requiring manual review.",
          ]
        : []),
    ]);

    const report =
      buildGenerationReport({
        source:
          extraction.source,

        target:
          extraction.target,

        detectedVariants:
          paragraphResult.variants,

        acceptedRecords,

        rejectedCandidates:
          tableResult.rejectedCandidates,

        warnings,

        generatedAt:
          "2026-08-03T00:00:00.000Z",
      });

    assert.ok(
      report.detectedVariants.length > 0,
      "The pipeline should detect at least one variant.",
    );

    assert.equal(
      report.detectedVariants.length,
      3,
    );

    assert.equal(
      report.acceptedRecords.length,
      report.detectedVariants.length,
    );

    assert.equal(
      report.rejectedCandidates.length,
      0,
    );

    const externalIds =
      report.acceptedRecords.map(
        (record) => record.externalId,
      );

    assert.equal(
      new Set(externalIds).size,
      externalIds.length,
      "Every generated externalId must be unique.",
    );

    assert.ok(
      report.detectedVariants.every(
        (variant) =>
          variant.confidence >= 0 &&
          variant.confidence <= 1,
      ),
      "Every confidence value must be between 0 and 1.",
    );

    assert.ok(
      report.acceptedRecords.every(
        (record) =>
          record.officialUrl.length > 0,
      ),
      "Every record must include an official URL.",
    );

    assert.ok(
      report.acceptedRecords.every(
        (record) =>
          record.documentType ===
          "model_range",
      ),
      "Every record must include the expected document type.",
    );

    assert.ok(
      report.acceptedRecords.every(
        (record) =>
          record.legalReviewRequired ===
            true &&
          record.automaticPublicationAllowed ===
            false,
      ),
      "Generated records must require legal review and prohibit automatic publication.",
    );

    assert.equal(
      report.summary.candidates,
      report.detectedVariants.length,
    );

    assert.equal(
      report.summary.accepted,
      report.acceptedRecords.length,
    );

    assert.equal(
      report.summary.rejected,
      report.rejectedCandidates.length,
    );

    assert.equal(
      report.summary.warnings,
      report.warnings.length,
    );

    assert.equal(
      report.generatedAt,
      "2026-08-03T00:00:00.000Z",
    );
  },
);