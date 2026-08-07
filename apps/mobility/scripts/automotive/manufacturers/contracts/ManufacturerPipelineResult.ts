import type {
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import type {
  ManufacturerSource,
} from "./ManufacturerSource";

/** Structured result returned by one manufacturer execution. */
export interface ManufacturerPipelineResult {
  adapterId: string;
  manufacturerName: string;
  brandName: string;
  sources: ManufacturerSource[];
  discoveredSourceCount: number;
  selectedSourceCount: number;
  downloadedDocumentCount: number;
  extractedDocumentCount: number;
  generatedRecordCount: number;
  stagedRecordCount: number;
  records: ManufacturerOfficialRecord[];
  warnings: string[];
  dryRun: boolean;
  durationMs: number;
  success: boolean;
}
