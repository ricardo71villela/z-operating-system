import { ManufacturerOfficialAdapter } from
  "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  seatLeonMk4OfficialVariants,
} from "../../data/seat/leon-mk4";

export class SEATOfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "seat_media_center",
    manufacturerName: "SEAT S.A.",
    brandName: "SEAT",
    countryCode: "ES",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return seatLeonMk4OfficialVariants;
  }
}
