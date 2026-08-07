/**
 * Z Mobility
 * Official Records Generation Engine
 *
 * Maps detected variants to ManufacturerOfficialRecord.
 *
 * No parsing.
 * No filesystem access.
 * No external services.
 */

import type {
  ManufacturerOfficialRecord,
} from "../core/manufacturer-types";

import type {
  DetectedVariant,
  MappingOptions,
} from "./parser-types";

import {
  slugify,
} from "./utils";

function createExternalId(
  variant: DetectedVariant,
  options: MappingOptions,
): string {
  const powerPart =
    variant.powerKw !== null
      ? `${variant.powerKw}kw`
      : "power-unknown";

  const drivetrainPart =
    variant.drivetrain?.toLowerCase() ??
    "drive-unknown";

  const bodyStylePart =
    variant.bodyStyle?.toLowerCase() ??
    "body-unknown";

  return slugify(
    [
      options.brandSlug,
      options.modelSlug,
      options.marketCode,
      options.modelYear ?? "year-unknown",
      bodyStylePart,
      variant.variant,
      powerPart,
      drivetrainPart,
    ].join("-"),
  );
}

function createExternalParentId(
  options: MappingOptions,
): string {
  return slugify(
    [
      options.brandSlug,
      options.modelSlug,
      options.marketCode,
      options.modelYear ?? "year-unknown",
    ].join("-"),
  );
}

function createTechnicalData(
  variant: DetectedVariant,
): Record<string, unknown> {
  return {
    engine_description:
      variant.engineDescription,

    displacement_cc:
      variant.displacementCc,

    power_kw:
      variant.powerKw,

    power_ps:
      variant.powerPs,

    torque_nm:
      variant.torqueNm,

    fuel_type:
      variant.fuelType,

    transmission:
      variant.transmission,

    drivetrain:
      variant.drivetrain,

    electrification:
      variant.electrification,

    acceleration_0_100_kmh_s:
      variant.acceleration0To100Sec,

    top_speed_kmh:
      variant.topSpeedKmh,

    combined_fuel_consumption_l_100km_min:
      variant.consumptionCombinedL100KmMin,

    combined_fuel_consumption_l_100km_max:
      variant.consumptionCombinedL100KmMax,

    combined_co2_g_km_min:
      variant.co2GKmMin,

    combined_co2_g_km_max:
      variant.co2GKmMax,
  };
}

function createMetadata(
  variant: DetectedVariant,
  options: MappingOptions,
): Record<string, unknown> {
  return {
    source_title:
      options.sourceTitle ?? null,

    source_description:
      options.sourceDescription ?? null,

    source_language:
      options.sourceLanguage ?? null,

    source_sha256:
      options.sourceSha256 ?? null,

    extraction_schema_version:
      options.extractionSchemaVersion ?? null,

    generation_confidence:
      variant.confidence,

    generation_warnings:
      [...variant.warnings],

    source_table_index:
      variant.sourceTableIndex,

    source_column_index:
      variant.sourceColumnIndex,

    raw_source_text:
      variant.sourceText,
  };
}

export function mapDetectedVariant(
  variant: DetectedVariant,
  options: MappingOptions,
): ManufacturerOfficialRecord {
  return {
    externalId: createExternalId(
      variant,
      options,
    ),

    externalParentId:
      createExternalParentId(options),

    entityType: "variant",

    name: variant.name,

    countryCode:
      options.countryCode,

    marketCode:
      options.marketCode,

    manufacturer:
      options.manufacturerName,

    brand:
      options.brandName,

    model:
      options.modelName,

    generation:
      options.generation,

    variant:
      variant.variant,

    officialVariantCode:
      null,

    bodyStyle:
      variant.bodyStyle,

    modelYear:
      options.modelYear ?? null,

    officialUrl:
      options.officialUrl,

    documentType:
      options.documentType,

    technicalData:
      createTechnicalData(variant),

    metadata:
      createMetadata(
        variant,
        options,
      ),

    legalReviewRequired:
      true,

    automaticPublicationAllowed:
      false,
  };
}

export function mapDetectedVariants(
  variants: readonly DetectedVariant[],
  options: MappingOptions,
): ManufacturerOfficialRecord[] {
  const records = variants.map(
    (variant) =>
      mapDetectedVariant(
        variant,
        options,
      ),
  );

  const externalIds = new Set<string>();

  for (const record of records) {
    if (externalIds.has(record.externalId)) {
      throw new Error(
        `Duplicate generated externalId: "${record.externalId}".`,
      );
    }

    externalIds.add(record.externalId);
  }

  return records;
}