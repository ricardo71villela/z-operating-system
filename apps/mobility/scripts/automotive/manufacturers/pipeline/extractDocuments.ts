/**
 * Z Mobility
 * Universal Manufacturer Pipeline
 *
 * Extract Documents Stage
 *
 * Responsibilities:
 *  - extract supported downloaded documents;
 *  - continue when one document cannot be extracted;
 *  - store extracted documents in the pipeline context;
 *  - update execution metrics and warnings.
 *
 * Current support:
 *  - HTML
 *
 * No generation.
 * No validation.
 * No publishing.
 */

import type {
  PipelineStage,
} from "../../pipeline";

import {
  extractHtmlDocument,
} from "../../documents";

import type {
  ExtractedOfficialDocument,
} from "../../documents";

import type {
  ManufacturerPipelineContext,
} from "../ManufacturerPipelineContext";

function isHtmlDocument(
  mimeType: string,
): boolean {
  const normalizedMimeType =
    mimeType.toLowerCase();

  return (
    normalizedMimeType.includes(
      "text/html",
    ) ||
    normalizedMimeType.includes(
      "application/xhtml+xml",
    )
  );
}

export const extractDocumentsStage:
  PipelineStage<ManufacturerPipelineContext> = {
    id: "extract-documents",

    name: "Extract Official Documents",

    async execute(
      context,
    ): Promise<void> {
      const extractedDocuments:
        ExtractedOfficialDocument[] = [];

      for (
        const document of context.documents
      ) {
        if (
          !isHtmlDocument(
            document.mimeType,
          )
        ) {
          context.result.warnings.push(
            `Unsupported document MIME type "${document.mimeType}" for "${document.attachment.url}".`,
          );

          continue;
        }

        try {
          const extractedDocument =
            await extractHtmlDocument(
              document,
            );

          extractedDocuments.push(
            extractedDocument,
          );
        } catch (error) {
          context.result.warnings.push(
            error instanceof Error
              ? error.message
              : `Document extraction failed for "${document.attachment.url}".`,
          );
        }
      }

      context.extractedDocuments = [
        ...extractedDocuments,
      ];

      context.result.extractedDocumentCount =
        extractedDocuments.length;
    },
  };