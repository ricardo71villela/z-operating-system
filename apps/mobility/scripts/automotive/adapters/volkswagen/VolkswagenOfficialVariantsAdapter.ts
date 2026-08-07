import { ManufacturerOfficialAdapter } from
  "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  volkswagenGolfMk8OfficialVariants,
} from "../../data/volkswagen/golf-mk8";

export class VolkswagenOfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "volkswagen_media",
    manufacturerName: "Volkswagen AG",
    brandName: "Volkswagen",
    countryCode: "DE",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return volkswagenGolfMk8OfficialVariants;
  }
}
