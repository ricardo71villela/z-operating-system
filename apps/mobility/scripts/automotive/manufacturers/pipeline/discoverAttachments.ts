/**
 * Z Mobility
 * Universal Manufacturer Pipeline
 *
 * Discovers attachments while preserving source identity.
 * HTML pages inspected here are cached in context.documents so the
 * download stage does not request them a second time.
 */

import type {
  PipelineStage,
} from "../../pipeline";

import {
  discoverOfficialAttachments,
  downloadOfficialDocument,
} from "../../documents";

import type {
  OfficialAttachment,
} from "../../documents";

import type {
  ManufacturerPipelineContext,
} from "../ManufacturerPipelineContext";

function createSourceAttachment(
  source:
    ManufacturerPipelineContext[
      "selectedSources"
    ][number],
): OfficialAttachment {
  return {
    url: source.url,
    title:
      source.title ??
      `${source.id} official source`,
    type:
      source.type === "html" ||
      source.type === "pdf" ||
      source.type === "xlsx" ||
      source.type === "xls" ||
      source.type === "zip"
        ? source.type
        : "unknown",
    language:
      source.language ?? undefined,
    mimeType:
      source.mimeType ?? undefined,
    sourceId: source.id,
    sourceDocumentType:
      source.documentType,
    sourceMetadata: {
      ...source.metadata,
    },
  };
}

function inheritSourceIdentity(
  attachment: OfficialAttachment,
  sourceAttachment: OfficialAttachment,
): OfficialAttachment {
  return {
    ...attachment,
    language:
      attachment.language ??
      sourceAttachment.language,
    sourceId:
      sourceAttachment.sourceId,
    sourceDocumentType:
      sourceAttachment.sourceDocumentType,
    sourceMetadata: {
      ...(sourceAttachment.sourceMetadata ?? {}),
    },
  };
}

function deduplicateAttachments(
  attachments:
    readonly OfficialAttachment[],
): OfficialAttachment[] {
  const byUrl =
    new Map<string, OfficialAttachment>();

  for (const attachment of attachments) {
    if (!byUrl.has(attachment.url)) {
      byUrl.set(
        attachment.url,
        attachment,
      );
    }
  }

  return [...byUrl.values()];
}

export const discoverAttachmentsStage:
  PipelineStage<ManufacturerPipelineContext> = {
    id: "discover-attachments",
    name: "Discover Official Attachments",

    async execute(context): Promise<void> {
      const attachments:
        OfficialAttachment[] = [];

      for (
        const source of context.selectedSources
      ) {
        const sourceAttachment =
          createSourceAttachment(source);

        attachments.push(sourceAttachment);

        if (source.type !== "html") {
          continue;
        }

        try {
          const downloadedHtml =
            await downloadOfficialDocument(
              sourceAttachment,
            );

          context.documents.push(
            downloadedHtml,
          );

          const html =
            downloadedHtml.buffer.toString(
              "utf8",
            );

          const discoveredAttachments =
            discoverOfficialAttachments(
              html,
              source.url,
            ).map((attachment) =>
              inheritSourceIdentity(
                attachment,
                sourceAttachment,
              ),
            );

          attachments.push(
            ...discoveredAttachments,
          );
        } catch (error) {
          context.result.warnings.push(
            error instanceof Error
              ? error.message
              : `HTML source inspection failed for "${source.url}".`,
          );
        }
      }

      const deduplicated =
        deduplicateAttachments(
          attachments,
        );

      context.attachments =
        context.adapter.selectAttachments
          ? context.adapter.selectAttachments(
              deduplicated,
            )
          : deduplicated;
    },
  };
