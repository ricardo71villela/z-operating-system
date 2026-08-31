import type {
  OfficialDocumentType,
} from "../../core/manufacturer-types";

import type {
  ManufacturerSource,
} from "./ManufacturerSource";

import type {
  ManufacturerIngestionScope,
} from "./IngestionScope";

/**
 * Input for one execution of the Universal Manufacturer Pipeline.
 *
 * The normal unit of execution is a complete manufacturer catalogue.
 * Market enrichment is explicit and optional; global canonical ingestion
 * must never require a marketplace/country code.
 */
export interface ManufacturerPipelineInput {
  manufacturer: string;
  brand: string;
  brandSlug: string;

  /** Optional single-model diagnostic filter. */
  modelSlug?: string;

  /** Optional human-readable model name for diagnostic runs. */
  modelName?: string;

  /** Optional generation filter for diagnostic runs. */
  generation?: string | null;

  /**
   * Ingestion scope. Omitted means global canonical ingestion.
   * A market scope carries availability/localisation context without
   * changing the canonical automotive identity.
   */
  scope?: ManufacturerIngestionScope;

  /**
   * Legacy compatibility alias for market-scoped runs.
   * New callers should use scope.kind = "market".
   */
  marketCode?: string;

  modelYear?: number;
  documentType: OfficialDocumentType;
  sources?: ManufacturerSource[];
  minConfidence?: number;
  verbose?: boolean;
  dryRun?: boolean;
}
