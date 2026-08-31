import {
  audiManufacturerAdapter,
} from "./audi";

import {
  bmwManufacturerAdapter,
} from "./bmw";

import {
  mercedesManufacturerAdapter,
} from "./mercedes";

import {
  porscheManufacturerAdapter,
} from "./porsche";

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

  registry.register(
    mercedesManufacturerAdapter,
  );

  registry.register(
    porscheManufacturerAdapter,
  );
}
