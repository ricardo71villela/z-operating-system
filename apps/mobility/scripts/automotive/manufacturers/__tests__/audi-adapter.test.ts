import assert from "node:assert/strict";
import test from "node:test";

import {
  audiManufacturerAdapter,
  buildAudiOfficialSources,
} from "../audi";

import {
  ManufacturerRegistry,
} from "../registry";

import {
  registerBuiltInManufacturerAdapters,
} from "../registerBuiltInManufacturerAdapters";

const globalInput = {
  manufacturer: "audi",
  brand: "Audi",
  brandSlug: "audi",
  scope: {
    kind: "global" as const,
  },
  documentType: "technical_specification" as const,
  dryRun: true,
};

test(
  "discovers the repository-backed Audi official source manifest for a global run",
  async () => {
    const sources =
      await audiManufacturerAdapter.discoverSources(globalInput);

    assert.ok(sources.length > 0);
    assert.equal(
      new Set(sources.map((source) => source.id)).size,
      sources.length,
    );

    for (const source of sources) {
      assert.equal(source.official, true);
      assert.equal(source.metadata.ingestionScope, "global");
      assert.equal(source.metadata.requestedMarketCode, null);
      assert.equal(typeof source.metadata.modelSlug, "string");
      assert.equal(typeof source.metadata.modelName, "string");
    }
  },
);

test(
  "supports an Audi model diagnostic filter without turning it into market scope",
  () => {
    const sources = buildAudiOfficialSources({
      ...globalInput,
      modelSlug: "a6-c9",
    });

    assert.ok(sources.length > 0);
    assert.equal(
      sources.every(
        (source) => source.metadata.modelSlug === "a6-c9",
      ),
      true,
    );
    assert.equal(
      sources.every(
        (source) => source.metadata.ingestionScope === "global",
      ),
      true,
    );
  },
);

test(
  "keeps source provenance separate from an optional requested market",
  () => {
    const sources = buildAudiOfficialSources({
      ...globalInput,
      scope: {
        kind: "market" as const,
        marketCode: "FR",
      },
    });

    assert.ok(sources.length > 0);
    assert.equal(sources[0]?.metadata.ingestionScope, "market");
    assert.equal(sources[0]?.metadata.requestedMarketCode, "FR");
    assert.notEqual(
      sources[0]?.metadata.sourceMarketCode,
      sources[0]?.metadata.requestedMarketCode,
    );
  },
);

test(
  "registers Audi as a built-in Universal Manufacturer Pipeline adapter",
  () => {
    const registry = new ManufacturerRegistry();
    registerBuiltInManufacturerAdapters(registry);

    const adapter = registry.resolve(globalInput);

    assert.equal(adapter.id, "audi");
    assert.equal(adapter.sourceCode, "audi_media");
  },
);
