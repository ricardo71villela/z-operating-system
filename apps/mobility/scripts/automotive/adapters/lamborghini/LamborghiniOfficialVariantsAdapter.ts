import { ManufacturerOfficialAdapter } from
  "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  lamborghiniRevueltoOfficialVariants,
} from "../../data/lamborghini/revuelto";

export class LamborghiniOfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "lamborghini_media",
    manufacturerName: "Automobili Lamborghini S.p.A.",
    brandName: "Lamborghini",
    countryCode: "IT",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return lamborghiniRevueltoOfficialVariants;
  }
}
