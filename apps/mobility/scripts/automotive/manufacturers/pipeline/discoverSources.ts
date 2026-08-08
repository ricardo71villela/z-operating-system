/**
 * Z Mobility
 * Universal Manufacturer Pipeline
 *
 * Discover Sources Stage
 *
 * Responsibilities:
 *  - ask the adapter to discover official sources;
 *  - ask the adapter to select relevant sources;
 *  - store both collections in the pipeline context.
 *
 * During the migration to the Pipeline Engine,
 * the legacy discoverSources() helper is kept
 * for backwards compatibility with existing tests
 * and callers.
 */

import type {
  PipelineStage,
} from "../../pipeline";

import type {
  ManufacturerAdapter,
  ManufacturerPipelineInput,
  ManufacturerSource,
} from "../contracts";

import type {
  ManufacturerPipelineContext,
} from "../ManufacturerPipelineContext";

export interface DiscoverSourcesResult {
  discoveredSources: ManufacturerSource[];
  selectedSources: ManufacturerSource[];
}

/**
 * ------------------------------------------------------------------
 * Legacy helper
 * ------------------------------------------------------------------
 * Temporary compatibility layer.
 * Will be removed once every caller uses
 * discoverSourcesStage.
 */
export async function discoverSources(
  adapter: ManufacturerAdapter,
  input: ManufacturerPipelineInput,
): Promise<DiscoverSourcesResult> {

  const discoveredSources =
    await adapter.discoverSources(
      input,
    );

  const selectedSources =
    adapter.selectSources(
      discoveredSources,
    );

  return {
    discoveredSources: [
      ...discoveredSources,
    ],

    selectedSources: [
      ...selectedSources,
    ],
  };
}

/**
 * ------------------------------------------------------------------
 * Pipeline Stage
 * ------------------------------------------------------------------
 */

export const discoverSourcesStage:
  PipelineStage<ManufacturerPipelineContext> = {

  id: "discover-sources",

  name: "Discover Official Sources",

  async execute(
    context,
  ): Promise<void> {

    const {
      discoveredSources,
      selectedSources,
    } = await discoverSources(
      context.adapter,
      context.input,
    );

    context.discoveredSources = [
      ...discoveredSources,
    ];

    context.selectedSources = [
      ...selectedSources,
    ];

    context.result.sources = [
      ...selectedSources,
    ];

    context.result.discoveredSourceCount =
      discoveredSources.length;

    context.result.selectedSourceCount =
      selectedSources.length;

  },

};