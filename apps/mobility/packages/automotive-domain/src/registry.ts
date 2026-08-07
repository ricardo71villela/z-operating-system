export type AutomotiveRegistryEntityType =
  | "manufacturer"
  | "brand"
  | "model"
  | "generation"
  | "version"
  | "vehicle";

export type LegacyAutomotiveEntityType =
  | AutomotiveRegistryEntityType
  | "variant"
  | "engine"
  | "transmission"
  | "colour"
  | "equipment"
  | "option"
  | "package";

export type ExternalReference = {
  system: string;
  externalId: string;
  url?: string | null;
  marketCode?: string | null;
};

export type RegistryProvenanceRef = {
  sourceId?: string | null;
  sourceUrl?: string | null;
  observedAt?: string | null;
};

export type AutomotiveRegistryIdentity = {
  id: string;
  entityType: AutomotiveRegistryEntityType;
  canonicalName: string;
  slug?: string | null;
  externalReferences?: ExternalReference[];
  provenance?: RegistryProvenanceRef[];
};

export type Manufacturer = AutomotiveRegistryIdentity & {
  entityType: "manufacturer";
};

export type Brand = AutomotiveRegistryIdentity & {
  entityType: "brand";
  manufacturerId?: string | null;
};

export type Model = AutomotiveRegistryIdentity & {
  entityType: "model";
  brandId: string;
};

export type Generation = AutomotiveRegistryIdentity & {
  entityType: "generation";
  modelId: string;
  generationCode?: string | null;
};

export type Version = AutomotiveRegistryIdentity & {
  entityType: "version";
  generationId: string;
  marketCode?: string | null;
  modelYearStart?: number | null;
  modelYearEnd?: number | null;
  automotiveDna?: string | null;
};

export type Vehicle = AutomotiveRegistryIdentity & {
  entityType: "vehicle";
  versionId?: string | null;
  vin?: string | null;
};

export function toCanonicalAutomotiveEntityType(
  entityType: LegacyAutomotiveEntityType,
): AutomotiveRegistryEntityType | null {
  if (entityType === "variant") {
    return "version";
  }

  if (
    entityType === "manufacturer" ||
    entityType === "brand" ||
    entityType === "model" ||
    entityType === "generation" ||
    entityType === "version" ||
    entityType === "vehicle"
  ) {
    return entityType;
  }

  return null;
}
