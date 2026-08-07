import type { AutomotiveEntityType } from "./types";

export type OfficialDocumentType =
  | "press_kit"
  | "technical_specification"
  | "model_range"
  | "brochure"
  | "price_list"
  | "homologation"
  | "other";

export type ManufacturerOfficialRecord = {
  externalId: string;
  externalParentId?: string | null;

  entityType: AutomotiveEntityType;

  name: string;
  countryCode?: string | null;
  marketCode?: string | null;

  manufacturer: string;
  brand: string;

  model?: string | null;
  generation?: string | null;
  variant?: string | null;
  officialVariantCode?: string | null;

  bodyStyle?: string | null;
  modelYear?: number | null;

  officialUrl: string;
  documentType: OfficialDocumentType;

  /*
   * A camada oficial de ingestão preserva os campos originais
   * de cada fabricante. A normalização forte acontece depois,
   * no pipeline de normalização, Registry resolution e Observations.
   */
  technicalData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;

  legalReviewRequired: boolean;
  automaticPublicationAllowed: boolean;
};

export type ManufacturerAdapterConfig = {
  sourceCode: string;
  manufacturerName: string;
  brandName: string;
  countryCode: string;
  entityType: AutomotiveEntityType;
};