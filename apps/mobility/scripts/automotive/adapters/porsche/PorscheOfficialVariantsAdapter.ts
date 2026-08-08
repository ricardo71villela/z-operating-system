import { ManufacturerOfficialAdapter } from
  "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  porsche9119922OfficialVariants,
  type PorscheOfficialVariantRecord,
} from "../../data/porsche/911-992-2";

export class PorscheOfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "porsche_newsroom",
    manufacturerName: "Porsche AG",
    brandName: "Porsche",
    countryCode: "DE",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return porsche9119922OfficialVariants.map(
      (variant: PorscheOfficialVariantRecord) => ({
        externalId: variant.externalId,

        externalParentId:
          `PORSCHE-911-${variant.generation
            .replace(".", "")
            .toUpperCase()}`,

        entityType: "variant",

        name: variant.name,

        countryCode: "DE",
        marketCode: variant.marketCode,

        manufacturer: "Porsche AG",
        brand: "Porsche",

        model: variant.model,
        generation: variant.generation,
        variant: variant.name,
        bodyStyle: variant.bodyStyle,
        modelYear: variant.modelYear ?? null,

        officialUrl: variant.officialUrl,
        documentType:
          variant.officialDocumentType,

        legalReviewRequired:
          variant.legalReviewRequired,

        automaticPublicationAllowed: false,

        technicalData: {
          displacement_cc:
            variant.displacementCc ?? null,

          power_kw: variant.powerKw ?? null,
          power_ps: variant.powerPs ?? null,
          torque_nm: variant.torqueNm ?? null,

          acceleration_0_100_seconds:
            variant.acceleration0100Seconds ??
            null,

          top_speed_kmh:
            variant.topSpeedKmh ?? null,

          fuel_type:
            variant.fuelType ?? null,

          transmission:
            variant.transmission ?? null,

          drivetrain:
            variant.drivetrain ?? null,
        },

        metadata: {
          catalogue: "Porsche 911 992.2",
          source_kind: "manufacturer_official",
        },
      }),
    );
  }
}