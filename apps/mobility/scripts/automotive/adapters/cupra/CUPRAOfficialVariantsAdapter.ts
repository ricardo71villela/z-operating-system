import { ManufacturerOfficialAdapter } from
  "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  cupraFormentorOfficialVariants,
} from "../../data/cupra/formentor";

export class CUPRAOfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "cupra_media",
    manufacturerName: "CUPRA",
    brandName: "CUPRA",
    countryCode: "ES",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return cupraFormentorOfficialVariants;
  }
}
