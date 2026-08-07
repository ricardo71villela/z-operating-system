/**
 * Z Mobility
 * Official Documents Infrastructure
 *
 * Shared document and attachment contracts.
 */

export type OfficialAttachmentType =
  | "html"
  | "pdf"
  | "xlsx"
  | "xls"
  | "zip"
  | "unknown";

export type OfficialAttachment = {
  url: string;
  title: string;
  type: OfficialAttachmentType;
  language?: string;
  mimeType?: string;
  sizeBytes?: number;

  /** Identity and provenance of the ManufacturerSource. */
  sourceId?: string;
  sourceDocumentType?: string | null;
  sourceMetadata?: Record<string, unknown>;
};

export type DownloadedOfficialDocument = {
  attachment: OfficialAttachment;
  buffer: Buffer;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
};
