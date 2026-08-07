/**
 * Z Mobility
 * Universal Manufacturer Pipeline
 *
 * Describes one official manufacturer source
 * before extraction or document processing.
 */

export type ManufacturerSourceType =
  | "html"
  | "pdf"
  | "xlsx"
  | "xls"
  | "zip"
  | "json"
  | "xml"
  | "api"
  | "unknown";

export interface ManufacturerSource {
  /**
   * Stable identifier within a pipeline execution.
   */
  id: string;

  /**
   * Official source URL.
   */
  url: string;

  /**
   * Source format.
   */
  type: ManufacturerSourceType;

  /**
   * Human-readable title.
   */
  title: string | null;

  /**
   * ISO language code when known.
   */
  language: string | null;

  /**
   * MIME type if already known.
   */
  mimeType: string | null;

  /**
   * Manufacturer-specific classification.
   *
   * Examples:
   *  - press_kit
   *  - technical_specification
   *  - price_list
   *  - product_page
   */
  documentType: string | null;

  /**
   * Indicates whether the source is official.
   */
  official: boolean;

  /**
   * URL where this source was discovered.
   */
  discoveredFromUrl: string | null;

  /**
   * Adapter-specific metadata.
   */
  metadata: Record<string, unknown>;
}