import type {
  OfficialDocumentType,
} from "../../core/manufacturer-types";

import type {
  ManufacturerSource,
} from "./ManufacturerSource";

/**
 * Input for one execution of the Universal Manufacturer Pipeline.
 *
 * The normal unit of execution is a complete manufacturer/market.
 * modelSlug and modelName are optional diagnostic filters.
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

  marketCode: string;
  modelYear?: number;
  documentType: OfficialDocumentType;
  sources?: ManufacturerSource[];
  minConfidence?: number;
  verbose?: boolean;
  dryRun?: boolean;
}
