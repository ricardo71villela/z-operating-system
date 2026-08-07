/**
 * Z Mobility
 * Universal Manufacturer Pipeline
 *
 * Downloads attachments not already cached by source inspection.
 */

import type {
  PipelineStage,
} from "../../pipeline";

import {
  downloadOfficialDocument,
} from "../../documents";

import type {
  DownloadedOfficialDocument,
} from "../../documents";

import type {
  ManufacturerPipelineContext,
} from "../ManufacturerPipelineContext";

export const downloadDocumentsStage:
  PipelineStage<ManufacturerPipelineContext> = {
    id: "download-documents",
    name: "Download Official Documents",

    async execute(context): Promise<void> {
      const documents:
        DownloadedOfficialDocument[] = [
          ...context.documents,
        ];

      const downloadedUrls =
        new Set(
          documents.map(
            (document) =>
              document.attachment.url,
          ),
        );

      for (const attachment of context.attachments) {
        if (downloadedUrls.has(attachment.url)) {
          continue;
        }

        try {
          const document =
            await downloadOfficialDocument(
              attachment,
            );

          documents.push(document);
          downloadedUrls.add(
            attachment.url,
          );
        } catch (error) {
          context.result.warnings.push(
            error instanceof Error
              ? error.message
              : "Document download failed.",
          );
        }
      }

      context.documents = documents;
      context.result.downloadedDocumentCount =
        documents.length;
    },
  };
