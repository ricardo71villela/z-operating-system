import { ManufacturerOfficialAdapter } from
  "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  bentleyContinentalGtOfficialVariants,
} from "../../data/bentley/continental-gt";

export class BentleyOfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "bentley_media",
    manufacturerName: "Bentley Motors Limited",
    brandName: "Bentley",
    countryCode: "GB",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return bentleyContinentalGtOfficialVariants;
  }
}
