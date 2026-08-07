import { ManufacturerOfficialAdapter } from
  "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  bmwI5G60OfficialVariants,
} from "../../data/bmw/i5-g60";

export class BmwOfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "bmw_pressclub",
    manufacturerName: "BMW Group",
    brandName: "BMW",
    countryCode: "DE",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return bmwI5G60OfficialVariants;
  }
}