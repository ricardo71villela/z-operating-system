import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMercedesOfficialSources,
  mercedesManufacturerAdapter,
} from "../mercedes";

import {
  buildPorscheOfficialSources,
  porscheManufacturerAdapter,
} from "../porsche";

import {
  ManufacturerRegistry,
} from "../registry";

import {
  registerBuiltInManufacturerAdapters,
} from "../registerBuiltInManufacturerAdapters";

const globalBase = {
  scope: {
    kind: "global" as const,
  },
  documentType: "technical_specification" as const,
  dryRun: true,
};

test(
  "discovers the Mercedes-Benz S214 source as global canonical input",
  async () => {
    const sources = await mercedesManufacturerAdapter.discoverSources({
      ...globalBase,
      manufacturer: "mercedes",
      brand: "Mercedes-Benz",
      brandSlug: "mercedes",
    });

    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.official, true);
    assert.equal(sources[0]?.metadata.modelSlug, "e-class-s214");
    assert.equal(sources[0]?.metadata.sourceMarketCode, "EU");
    assert.equal(sources[0]?.metadata.ingestionScope, "global");
    assert.equal(sources[0]?.metadata.requestedMarketCode, null);
  },
);

test(
  "keeps Mercedes-Benz source provenance separate from requested France enrichment",
  () => {
    const sources = buildMercedesOfficialSources({
      ...globalBase,
      manufacturer: "mercedes-benz",
      brand: "Mercedes-Benz",
      brandSlug: "mercedes",
      scope: {
        kind: "market" as const,
        marketCode: "FR",
      },
    });

    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.metadata.sourceMarketCode, "EU");
    assert.equal(sources[0]?.metadata.requestedMarketCode, "FR");
    assert.equal(sources[0]?.metadata.ingestionScope, "market");
  },
);

test(
  "filters Mercedes-Benz by its registered model slug",
  () => {
    const matching = buildMercedesOfficialSources({
      ...globalBase,
      manufacturer: "mercedes",
      brand: "Mercedes-Benz",
      brandSlug: "mercedes",
      modelSlug: "e-class-s214",
    });

    const missing = buildMercedesOfficialSources({
      ...globalBase,
      manufacturer: "mercedes",
      brand: "Mercedes-Benz",
      brandSlug: "mercedes",
      modelSlug: "s-class-w223",
    });

    assert.equal(matching.length, 1);
    assert.equal(missing.length, 0);
  },
);

test(
  "discovers all reviewed Porsche 911 992.2 official URLs for global ingestion",
  async () => {
    const sources = await porscheManufacturerAdapter.discoverSources({
      ...globalBase,
      manufacturer: "porsche",
      brand: "Porsche",
      brandSlug: "porsche",
    });

    assert.equal(sources.length, 4);
    assert.equal(
      new Set(sources.map((source) => source.id)).size,
      sources.length,
    );

    for (const source of sources) {
      assert.equal(source.official, true);
      assert.equal(source.metadata.modelSlug, "911-992-2");
      assert.equal(source.metadata.sourceMarketCode, "EU");
      assert.equal(source.metadata.ingestionScope, "global");
      assert.equal(source.metadata.requestedMarketCode, null);
    }
  },
);

test(
  "keeps Porsche source provenance separate from requested France enrichment",
  () => {
    const sources = buildPorscheOfficialSources({
      ...globalBase,
      manufacturer: "porsche",
      brand: "Porsche",
      brandSlug: "porsche",
      scope: {
        kind: "market" as const,
        marketCode: "FR",
      },
    });

    assert.equal(sources.length, 4);
    assert.equal(
      sources.every(
        (source) => source.metadata.sourceMarketCode === "EU",
      ),
      true,
    );
    assert.equal(
      sources.every(
        (source) => source.metadata.requestedMarketCode === "FR",
      ),
      true,
    );
  },
);

test(
  "registers Mercedes-Benz and Porsche as built-in universal adapters",
  () => {
    const registry = new ManufacturerRegistry();
    registerBuiltInManufacturerAdapters(registry);

    const mercedes = registry.resolve({
      ...globalBase,
      manufacturer: "mercedes-benz",
      brand: "Mercedes-Benz",
      brandSlug: "mercedes",
    });

    const porsche = registry.resolve({
      ...globalBase,
      manufacturer: "porsche",
      brand: "Porsche",
      brandSlug: "porsche",
    });

    assert.equal(mercedes.id, "mercedes");
    assert.equal(mercedes.sourceCode, "mercedes_media");
    assert.equal(porsche.id, "porsche");
    assert.equal(porsche.sourceCode, "porsche_newsroom");
  },
);
