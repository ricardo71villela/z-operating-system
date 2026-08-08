import assert from "node:assert/strict";
import test from "node:test";

import type {
  DetectedVariant,
  OfficialHtmlExtraction,
} from "../parser-types";

import {
  enrichVariantsFromParagraphs,
} from "../parsers/paragraph-parser";

function createExtraction(
  paragraphs: string[],
): OfficialHtmlExtraction {
  return {
    schemaVersion: "1.0.0",

    source: {
      url: "https://example.com/official-model",
      finalUrl:
        "https://example.com/official-model",
      fetchedAt:
        "2026-08-03T00:00:00.000Z",
      status: 200,
      contentType:
        "text/html; charset=utf-8",
      sha256: "test-sha256",
    },

    target: {
      brandSlug: "audi",
      modelSlug: "a6-c9",
    },

    page: {
      title: "Official model page",
      description: null,
      language: "en",
      canonicalUrl:
        "https://example.com/official-model",
      headings: [],
      paragraphs,
    },

    jsonLd: [],
    tables: [],

    textSignals: {
      powerValues: [],
      torqueValues: [],
      consumptionValues: [],
      emissionValues: [],
      rangeValues: [],
    },

    reviewRequired: false,
  };
}

function createVariant(
  overrides: Partial<DetectedVariant> = {},
): DetectedVariant {
  return {
    name: "A6 Sedan TFSI 150 kW",
    variant: "A6 Sedan TFSI 150 kW",

    bodyStyle: "Sedan",
    engineDescription:
      "4-cylinder turbo gasoline engine",

    displacementCc: 1984,

    powerKw: 150,
    powerPs: 204,
    torqueNm: 340,

    fuelType: "gasoline",

    transmission: null,
    drivetrain: "FWD",
    electrification: "ICE",

    acceleration0To100Sec: 8.2,
    topSpeedKmh: 244,

    consumptionCombinedL100KmMin: 6.9,
    consumptionCombinedL100KmMax: 7.8,

    co2GKmMin: 157,
    co2GKmMax: 177,

    sourceText:
      "A6 Sedan TFSI 150 kW table evidence",

    sourceTableIndex: 0,
    sourceColumnIndex: 1,

    confidence: 1,
    warnings: [],

    ...overrides,
  };
}

test(
  "enriches a missing transmission from relevant paragraph evidence",
  () => {
    const extraction = createExtraction([
      [
        "A6 Sedan TFSI 150 kW delivers 150 kW.",
        "It is coupled to a seven-speed S tronic",
        "dual-clutch transmission.",
      ].join(" "),
    ]);

    const variant = createVariant({
      transmission: null,
    });

    const result =
      enrichVariantsFromParagraphs(
        extraction,
        [variant],
      );

    assert.equal(
      result.variants.length,
      1,
    );

    assert.equal(
      result.variants[0].transmission,
      "dual_clutch",
    );
  },
);

test(
  "preserves table drivetrain evidence when paragraph evidence conflicts",
  () => {
    const extraction = createExtraction([
      [
        "A6 Sedan TFSI 150 kW delivers 150 kW",
        "with quattro all-wheel drive.",
      ].join(" "),
    ]);

    const variant = createVariant({
      drivetrain: "FWD",
    });

    const result =
      enrichVariantsFromParagraphs(
        extraction,
        [variant],
      );

    const enriched =
      result.variants[0];

    assert.equal(
      enriched.drivetrain,
      "FWD",
    );

    assert.ok(
      enriched.warnings.some(
        (warning) =>
          warning.includes(
            "Drivetrain conflict",
          ),
      ),
    );

    assert.ok(
      enriched.warnings.some(
        (warning) =>
          warning.includes(
            "The table value was preserved",
          ),
      ),
    );
  },
);

test(
  "does not create variants when the input variant collection is empty",
  () => {
    const extraction = createExtraction([
      "A6 Sedan TFSI 150 kW with quattro.",
    ]);

    const result =
      enrichVariantsFromParagraphs(
        extraction,
        [],
      );

    assert.deepEqual(
      result.variants,
      [],
    );
  },
);

test(
  "adds a warning when no sufficiently relevant paragraph exists",
  () => {
    const extraction = createExtraction([
      "General information about vehicle design and comfort.",
    ]);

    const variant =
      createVariant();

    const result =
      enrichVariantsFromParagraphs(
        extraction,
        [variant],
      );

    assert.equal(
      result.variants.length,
      1,
    );

    assert.ok(
      result.variants[0].warnings.includes(
        "No sufficiently relevant paragraph was found for enrichment.",
      ),
    );

    assert.ok(
      result.warnings.some(
        (warning) =>
          warning.includes(
            "No paragraph evidence found",
          ),
      ),
    );
  },
);