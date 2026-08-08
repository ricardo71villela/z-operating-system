import type {
  DownloadedOfficialDocument,
} from "./types";

import type {
  ExtractedTable,
} from "../generation/parser-types";

export type ExtractedOfficialDocumentType =
  | "html"
  | "pdf"
  | "xlsx"
  | "xls"
  | "zip"
  | "json"
  | "xml"
  | "unknown";

export interface ExtractedOfficialDocument {
  source: DownloadedOfficialDocument;

  type: ExtractedOfficialDocumentType;

  title: string | null;

  language: string | null;

  text: string;

  paragraphs: string[];

  tables: ExtractedTable[];

  metadata: Record<string, unknown>;

  warnings: string[];
}