/**
 * Z Mobility
 * Official Records Generation Engine
 *
 * Parser domain types only.
 *
 * No business logic.
 * No filesystem access.
 * No external services.
 */

import type {
  ManufacturerOfficialRecord,
  OfficialDocumentType, 
} from "../core/manufacturer-types";

export type ExtractedTable = {
  index: number;
  caption: string | null;
  headers: string[];
  rows: string[][];
};

export type OfficialHtmlExtraction = {
  schemaVersion: string;

  source: {
    url: string;
    finalUrl: string;
    fetchedAt: string;
    status: number;
    contentType: string | null;
    sha256: string;
    sourceId?: string;
    documentType?: string | null;
    metadata?: Record<string, unknown>;
  };

  target: {
    brandSlug: string;
    modelSlug: string;
  };

  page: {
    title: string | null;
    description: string | null;
    language: string | null;
    canonicalUrl: string | null;
    headings: string[];
    paragraphs: string[];
  };

  jsonLd: Record<string, unknown>[];

  tables: ExtractedTable[];

  textSignals: {
    powerValues: string[];
    torqueValues: string[];
    consumptionValues: string[];
    emissionValues: string[];
    rangeValues: string[];
  };

  reviewRequired: boolean;
};

export type BrandModelManifest = {
  slug: string;
  name: string;
  exportName?: string;
};

export type BrandManifest = {
  slug: string;
  displayName: string;
  legalName: string;
  countryCode: string;

  sourceCode: string;
  sourceName: string;
  websiteUrl: string;

  models: BrandModelManifest[];
};

export type NumericRange = {
  min: number | null;
  max: number | null;
};

export type DetectedVariant = {
  name: string;
  variant: string;

  bodyStyle: string | null;

  engineDescription: string | null;
  displacementCc: number | null;

  powerKw: number | null;
  powerPs: number | null;
  torqueNm: number | null;

  fuelType: string | null;
  transmission: string | null;
  drivetrain: string | null;
  electrification: string | null;

  acceleration0To100Sec: number | null;
  topSpeedKmh: number | null;

  consumptionCombinedL100KmMin: number | null;
  consumptionCombinedL100KmMax: number | null;

  co2GKmMin: number | null;
  co2GKmMax: number | null;

  sourceText: string;

  sourceTableIndex: number | null;
  sourceColumnIndex: number | null;

  confidence: number;

  warnings: string[];
};

export type RejectedCandidate = {
  sourceText: string;
  reasons: string[];
  sourceTableIndex: number | null;
  sourceColumnIndex: number | null;
};

export type GenerationSummary = {
  candidates: number;
  accepted: number;
  rejected: number;
  warnings: number;
};

export type GenerationReport = {
  schemaVersion: string;

  source: OfficialHtmlExtraction["source"];
  target: OfficialHtmlExtraction["target"];

  generatedAt: string;

  detectedVariants: DetectedVariant[];

  acceptedRecords: ManufacturerOfficialRecord[];

  rejectedCandidates: RejectedCandidate[];

  warnings: string[];

  summary: GenerationSummary;
};

export type GenerateOfficialRecordsOptions = {
  inputPath: string;
  outputPath?: string;

  marketCode: string;
  modelYear?: number;

  minConfidence: number;

  dryRun: boolean;
  force: boolean;
};

export type VariantTableParseResult = {
  variants: DetectedVariant[];
  rejectedCandidates: RejectedCandidate[];
  warnings: string[];
};

export type ParagraphEnrichmentResult = {
  variants: DetectedVariant[];
  warnings: string[];
};

export type FuelType =
  | "gasoline"
  | "diesel"
  | "hybrid"
  | "plug_in_hybrid"
  | "electric"
  | "hydrogen";

export type Transmission =
  | "manual"
  | "automatic"
  | "dual_clutch";

export type Drivetrain =
  | "FWD"
  | "RWD"
  | "AWD";

export type BodyStyle =
  | "Sedan"
  | "Avant"
  | "Sportback"
  | "SUV"
  | "Coupe"
  | "Cabriolet"
  | "Roadster";

export type Electrification =
  | "ICE"
  | "MHEV"
  | "PHEV"
  | "BEV"
  | "FCEV";

  export type MappingOptions = {
  brandSlug: string;
  modelSlug: string;

  manufacturerName: string;
  brandName: string;

  countryCode: string;
  marketCode?: string | null;

  modelName: string;
  generation: string | null;

  modelYear?: number;

  officialUrl: string;

  documentType: OfficialDocumentType;

  sourceTitle?: string | null;
  sourceDescription?: string | null;
  sourceLanguage?: string | null;
  sourceSha256?: string | null;

  extractionSchemaVersion?: string | null;
};
