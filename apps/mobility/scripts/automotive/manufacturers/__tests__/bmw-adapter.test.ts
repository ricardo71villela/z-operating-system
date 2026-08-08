import assert from "node:assert/strict";
import test from "node:test";

import {
  bmwManufacturerAdapter,
  parseBmwVariants,
} from "../bmw";

import type {
  OfficialHtmlExtraction,
} from "../../generation/parser-types";

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

test(
  "discovers a complete BMW catalogue and supports an optional model filter",
  async () => {
    global.fetch = async () =>
      new Response(`
        <html>
          <body>
            <article>
              <a href="/pt/all-models/bmw-i/i5/dados-tecnicos-do-bmw-i5.html/i5-edrive40.bmw">
                <img alt="BMW i5 eDrive40" />
              </a>
            </article>
            <article>
              <a href="/pt/all-models/bmw-x-series/x1/dados-tecnicos.html/x1-xdrive30e.bmw">
                <img alt="BMW X1 xDrive30e" />
              </a>
            </article>
          </body>
        </html>
      `, {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      });

    const allSources =
      await bmwManufacturerAdapter.discoverSources({
        manufacturer: "bmw",
        brand: "BMW",
        brandSlug: "bmw",
        marketCode: "PT",
        documentType: "technical_specification",
        dryRun: true,
      });

    assert.equal(allSources.length, 2);
    assert.deepEqual(
      allSources.map((source) => source.metadata.modelSlug),
      ["i5", "x1"],
    );

    const filtered =
      await bmwManufacturerAdapter.discoverSources({
        manufacturer: "bmw",
        brand: "BMW",
        brandSlug: "bmw",
        modelSlug: "i5",
        marketCode: "PT",
        documentType: "technical_specification",
        dryRun: true,
      });

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.metadata.modelSlug, "i5");
  },
);

test(
  "parses a BMW technical page into a detected variant",
  () => {
    const extraction: OfficialHtmlExtraction = {
      schemaVersion: "1.0.0",
      source: {
        url: "https://www.bmw.pt/i5.html/i5-edrive40.bmw",
        finalUrl: "https://www.bmw.pt/i5.html/i5-edrive40.bmw",
        fetchedAt: "2026-08-04T00:00:00.000Z",
        status: 200,
        contentType: "text/html",
        sha256: "test",
        sourceId: "bmw-pt-i5-edrive40",
        documentType: "technical_specification",
        metadata: {
          modelSlug: "i5",
          modelName: "i5",
          variantName: "i5 eDrive40",
        },
      },
      target: {
        brandSlug: "bmw",
        modelSlug: "i5",
      },
      page: {
        title: "BMW i5: Motores e dados técnicos",
        description: null,
        language: "pt",
        canonicalUrl: null,
        headings: ["BMW i5 eDrive40"],
        paragraphs: [],
      },
      jsonLd: [],
      tables: [
        {
          index: 0,
          caption: "Motorização combinada",
          headers: ["Motorização combinada"],
          rows: [
            ["Tipo de Combustível", "Elétrico"],
            ["Potência em kW (cv)", "250 (340)"],
            ["Binário em Nm", "430"],
            ["Transmissão", "Automática"],
            ["Tração", "Tração traseira"],
            ["Aceleração 0–100 km/h em seg.", "6,0"],
            ["Velocidade máxima em km/h", "193"],
          ],
        },
      ],
      textSignals: {
        powerValues: ["250 kW", "340 cv"],
        torqueValues: ["430 Nm"],
        consumptionValues: [],
        emissionValues: [],
        rangeValues: [],
      },
      reviewRequired: true,
    };

    const result = parseBmwVariants(extraction);

    assert.equal(result.variants.length, 1);
    assert.equal(result.variants[0]?.powerKw, 250);
    assert.equal(result.variants[0]?.powerPs, 340);
    assert.equal(result.variants[0]?.torqueNm, 430);
    assert.equal(result.variants[0]?.fuelType, "electric");
  },
);
