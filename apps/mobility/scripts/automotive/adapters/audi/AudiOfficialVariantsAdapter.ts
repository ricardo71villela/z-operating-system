import {
  ManufacturerOfficialAdapter,
} from "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  AudiOfficialVariants,
} from "../../data/audi";

export class AudiOfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "audi_media",
    manufacturerName: "Audi AG",
    brandName: "Audi",
    countryCode: "DE",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return AudiOfficialVariants;
  }
}
