export type RegistryNamedEntity = {
  id: string;
  name: string;
  slug: string;
};

export type RegistryVersionEntity = RegistryNamedEntity & {
  generationId: string;
  marketCode: string;
};

export type UpsertVersionInput = {
  generationId: string;
  bodyStyleId?: string | null;
  name: string;
  slug: string;
  internalCode?: string | null;
  marketCode: string;
  modelYearStart?: number | null;
  doors?: number | null;
  seats?: number | null;
  automotiveDna: string;
  dataQualityScore: number;
  sourceId: string;
};

export interface AutomotiveRegistryRepository {
  findBrandBySlug(slug: string): Promise<RegistryNamedEntity | null>;
  findModelBySlug(
    brandId: string,
    slug: string,
  ): Promise<RegistryNamedEntity | null>;
  findGenerationBySlug(
    modelId: string,
    slug: string,
  ): Promise<RegistryNamedEntity | null>;
  listVersions(
    generationId: string,
    marketCode: string,
  ): Promise<RegistryVersionEntity[]>;
  upsertVersion(input: UpsertVersionInput): Promise<string>;
}
