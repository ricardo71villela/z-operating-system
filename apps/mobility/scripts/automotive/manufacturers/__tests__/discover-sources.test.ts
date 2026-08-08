import assert from "node:assert/strict";
import test from "node:test";

import {
  createTestManufacturerInput,
} from "./fixtures";

import {
  discoverSources,
} from "../pipeline";

import type {
  ManufacturerAdapter,
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
    id: "test",

    manufacturerName:
      "Test Manufacturer",

    brandName: "Test",

    countryCode: "PT",

    canHandle() {
      return true;
    },

    async discoverSources() {
      return [
        createSource("source-a"),
        createSource("source-b"),
      ];
    },

    selectSources(
      sources:
        readonly ManufacturerSource[],
    ) {
      return sources.filter(
        (source) =>
          source.id === "source-b",
      );
    },
  };
}

test(
  "discovers and selects manufacturer sources",
  async () => {
    const result =
      await discoverSources(
        createAdapter(),
        createTestManufacturerInput(),
      );

    assert.equal(
      result.discoveredSources.length,
      2,
    );

    assert.equal(
      result.selectedSources.length,
      1,
    );

    assert.equal(
      result.selectedSources[0]?.id,
      "source-b",
    );
  },
);

test(
  "returns independent result collections",
  async () => {
    const result =
      await discoverSources(
        createAdapter(),
        createTestManufacturerInput(),
      );

    result.discoveredSources.length = 0;

    assert.equal(
      result.selectedSources.length,
      1,
    );
  },
);

test(
  "propagates adapter discovery errors",
  async () => {
    const adapter:
      ManufacturerAdapter = {
        ...createAdapter(),

        async discoverSources() {
          throw new Error(
            "Source discovery failed.",
          );
        },
      };

    await assert.rejects(
      () =>
        discoverSources(
          adapter,
          createTestManufacturerInput(),
        ),
      /Source discovery failed/,
    );
  },
);