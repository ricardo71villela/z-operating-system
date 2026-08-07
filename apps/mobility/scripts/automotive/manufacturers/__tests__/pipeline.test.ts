import assert from "node:assert/strict";
import test from "node:test";

import {
  createTestManufacturerInput,
} from "./fixtures";

import {
  ManufacturerRegistry,
  runManufacturerPipeline,
} from "../index";

import type {
  ManufacturerAdapter,
  ManufacturerPipelineInput,
  ManufacturerSource,
} from "../contracts";

function createSource(
  id: string,
): ManufacturerSource {
  return {
    id,
    url: `https://example.com/${id}`,
    type: "html",
    title: id,
    language: "en",
    mimeType: "text/html",
    documentType:
      "technical_specification",
    official: true,
    discoveredFromUrl: null,
    metadata: {},
  };
}

function createAdapter():
  ManufacturerAdapter {
  return {
    id: "bmw",

    manufacturerName:
      "BMW Group",

    brandName: "BMW",

    countryCode: "DE",

    canHandle(
      input: ManufacturerPipelineInput,
    ): boolean {
      return (
        input.manufacturer === "bmw"
      );
    },

    async discoverSources(): Promise<
      ManufacturerSource[]
    > {
      return [
        createSource("source-b"),
        createSource("source-a"),
      ];
    },

    selectSources(
      sources:
        readonly ManufacturerSource[],
    ): ManufacturerSource[] {
      return sources.filter(
        (source) =>
          source.id === "source-a",
      );
    },
  };
}

test(
  "runs the minimal universal manufacturer pipeline",
  async () => {
    const registry =
      new ManufacturerRegistry();

    registry.register(
      createAdapter(),
    );

    const result =
      await runManufacturerPipeline({
        registry,

        input:
          createTestManufacturerInput({
            manufacturer: "bmw",
            brand: "BMW",

            brandSlug: "bmw",
            modelSlug: "i5",
            modelName: "i5",

            generation: "G60",

            marketCode: "PT",
            modelYear: 2026,

            documentType:
              "technical_specification",

            dryRun: true,
          }),
      });

    assert.equal(
      result.adapterId,
      "bmw",
    );

    assert.equal(
      result.manufacturerName,
      "BMW Group",
    );

    assert.equal(
      result.brandName,
      "BMW",
    );

    assert.equal(
      result.discoveredSourceCount,
      2,
    );

    assert.equal(
      result.selectedSourceCount,
      1,
    );

    assert.equal(
      result.sources.length,
      1,
    );

    assert.equal(
      result.sources[0]?.id,
      "source-a",
    );

    assert.equal(
      result.downloadedDocumentCount,
      0,
    );

    assert.equal(
      result.extractedDocumentCount,
      0,
    );

    assert.equal(
      result.generatedRecordCount,
      0,
    );

    assert.equal(
      result.stagedRecordCount,
      0,
    );

    assert.equal(
      result.dryRun,
      true,
    );

    assert.equal(
      result.success,
      true,
    );

    assert.ok(
      result.durationMs >= 0,
    );
  },
);

test(
  "propagates adapter discovery errors",
  async () => {
    const registry =
      new ManufacturerRegistry();

    const adapter:
      ManufacturerAdapter = {
        ...createAdapter(),

        async discoverSources() {
          throw new Error(
            "Discovery failed.",
          );
        },
      };

    registry.register(adapter);

    await assert.rejects(
      () =>
        runManufacturerPipeline({
          registry,

          input:
            createTestManufacturerInput({
              manufacturer: "bmw",
              brand: "BMW",

              brandSlug: "bmw",
              modelSlug: "i5",
              modelName: "i5",

              generation: "G60",

              marketCode: "PT",

              documentType:
                "technical_specification",
            }),
        }),
      /Discovery failed/,
    );
  },
);