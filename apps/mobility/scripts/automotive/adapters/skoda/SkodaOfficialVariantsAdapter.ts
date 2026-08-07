import { ManufacturerOfficialAdapter } from
  "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  skodaOctaviaMk4OfficialVariants,
} from "../../data/skoda/octavia-mk4";

export class SkodaOfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "skoda_storyboard",
    manufacturerName: "Škoda Auto a.s.",
    brandName: "Škoda",
    countryCode: "CZ",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return skodaOctaviaMk4OfficialVariants;
  }
}
