import {
  audiManufacturerAdapter,
} from "./audi";

import {
  bmwManufacturerAdapter,
} from "./bmw";

import type {
  ManufacturerRegistry,
} from "./registry";

/**
 * Registers manufacturer adapters bundled
 * with the Z Mobility ingestion system.
 */
export function registerBuiltInManufacturerAdapters(
  registry: ManufacturerRegistry,
): void {
  registry.register(
    audiManufacturerAdapter,
  );

  registry.register(
    bmwManufacturerAdapter,
  );
}
