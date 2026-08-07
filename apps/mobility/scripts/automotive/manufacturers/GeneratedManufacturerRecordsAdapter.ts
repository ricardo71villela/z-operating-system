import {
  ManufacturerOfficialAdapter,
} from "../adapters/manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../core/manufacturer-types";

export class GeneratedManufacturerRecordsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig;

  constructor(
    config: ManufacturerAdapterConfig,
    private readonly records:
      readonly ManufacturerOfficialRecord[],
  ) {
    super();
    this.config = config;
  }

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return [...this.records];
  }
}
