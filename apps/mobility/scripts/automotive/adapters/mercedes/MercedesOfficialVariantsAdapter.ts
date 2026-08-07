import { ManufacturerOfficialAdapter } from
  "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  mercedesEClassS214OfficialVariants,
} from "../../data/mercedes/e-class-s214";

export class MercedesOfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "mercedes_media",
    manufacturerName: "Mercedes-Benz Group AG",
    brandName: "Mercedes-Benz",
    countryCode: "DE",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return mercedesEClassS214OfficialVariants;
  }
}