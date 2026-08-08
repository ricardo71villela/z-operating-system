import assert from "node:assert/strict";
import test from "node:test";

import type {
  ExtractedTable,
  OfficialHtmlExtraction,
} from "../parser-types";

import {
  parseVariantTables,
} from "../parsers/variant-table-parser";

function createExtraction(
  tables: ExtractedTable[],
): OfficialHtmlExtraction {
  return {
    schemaVersion: "1.0.0",

    source: {
      url: "https://example.com/audi-a6",
      finalUrl:
        "https://example.com/audi-a6",
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
      title: "Audi A6",
      description: null,
      language: "en",
      canonicalUrl:
        "https://example.com/audi-a6",
      headings: [],
      paragraphs: [],
    },

    jsonLd: [],

    tables,

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

function createAudiTable(): ExtractedTable {
  return {
    index: 0,

    caption:
      "Technical specifications",

    headers: [
      "Technical data",
      "Audi A6 Sedan TFSI 150 kW",
    ],

    rows: [
      [
        "Engine",
        "4-cylinder turbo gasoline engine",
      ],
      [
        "Displacement in cm³",
        "1,984",
      ],
      [
        "Drivetrain",
        "Front",
      ],
      [
        "Power output in kW (PS)",
        "150 (204)",
      ],
      [
        "Max. torque in Nm",
        "340",
      ],
      [
        "Acceleration 0 to 100 km/h in s",
        "8.2",
      ],
      [
        "Max. speed in km/h",
        "244",
      ],
      [
        "Fuel consumption, combined, in l/100 km",
        "7.8-6.9",
      ],
      [
        "CO2 emissions, combined, in g/km",
        "177-157",
      ],
    ],
  };
}

test(
  "parses a complete technical variant column",
  () => {
    const result =
      parseVariantTables(
        createExtraction([
          createAudiTable(),
        ]),
      );

    assert.equal(
      result.variants.length,
      1,
    );

    assert.equal(
      result.rejectedCandidates.length,
      0,
    );

    const variant =
      result.variants[0];

    assert.equal(
      variant.name,
      "Audi A6 Sedan TFSI 150 kW",
    );

    assert.equal(
      variant.variant,
      "A6 Sedan TFSI 150 kW",
    );

    assert.equal(
      variant.displacementCc,
      1984,
    );

    assert.equal(
      variant.powerKw,
      150,
    );

    assert.equal(
      variant.powerPs,
      204,
    );

    assert.equal(
      variant.torqueNm,
      340,
    );

    assert.equal(
      variant.fuelType,
      "gasoline",
    );

    assert.equal(
      variant.drivetrain,
      "FWD",
    );

    assert.equal(
      variant.acceleration0To100Sec,
      8.2,
    );

    assert.equal(
      variant.topSpeedKmh,
      244,
    );

    assert.equal(
      variant.consumptionCombinedL100KmMin,
      6.9,
    );

    assert.equal(
      variant.consumptionCombinedL100KmMax,
      7.8,
    );

    assert.equal(
      variant.co2GKmMin,
      157,
    );

    assert.equal(
      variant.co2GKmMax,
      177,
    );

    assert.equal(
      variant.sourceTableIndex,
      0,
    );

    assert.equal(
      variant.sourceColumnIndex,
      1,
    );

    assert.ok(
      variant.confidence > 0.8,
    );
  },
);

test(
  "normalizes compact Audi model and body-style headers",
  () => {
    const table =
      createAudiTable();

    table.headers[1] =
      "Audi A6SedanTFSI 150 kW";

    const result =
      parseVariantTables(
        createExtraction([table]),
      );

    assert.equal(
      result.variants.length,
      1,
    );

    assert.equal(
      result.variants[0].name,
      "Audi A6 Sedan TFSI 150 kW",
    );
  },
);

test(
  "detects ambiguous front and quattro configurations",
  () => {
    const table =
      createAudiTable();

    table.headers[1] =
      "Audi A6 Sedan TDI (quattro) 150 kW";

    table.rows = table.rows.map(
      (row) => {
        if (row[0] === "Engine") {
          return [
            row[0],
            "4-cylinder turbo diesel engine with MHEV plus",
          ];
        }

        if (row[0] === "Drivetrain") {
          return [
            row[0],
            "Front / quattro",
          ];
        }

        return row;
      },
    );

    const result =
      parseVariantTables(
        createExtraction([table]),
      );

    const variant =
      result.variants[0];

    assert.equal(
      variant.fuelType,
      "diesel",
    );

    assert.equal(
      variant.drivetrain,
      "AWD",
    );

    assert.equal(
      variant.electrification,
      "MHEV",
    );

    assert.ok(
      variant.warnings.includes(
        "Header and drivetrain data indicate multiple drivetrain configurations.",
      ),
    );

    assert.ok(
      variant.warnings.includes(
        "The variant header contains an optional or ambiguous quattro designation.",
      ),
    );
  },
);

test(
  "ignores tables with fewer than two columns",
  () => {
    const table: ExtractedTable = {
      index: 4,
      caption: null,
      headers: [
        "Technical data",
      ],
      rows: [],
    };

    const result =
      parseVariantTables(
        createExtraction([table]),
      );

    assert.deepEqual(
      result.variants,
      [],
    );

    assert.equal(
      result.warnings.length,
      1,
    );

    assert.equal(
      result.warnings[0],
      "Table 4 was ignored because it has fewer than two columns.",
    );
  },
);

test(
  "rejects a column with an unusable header",
  () => {
    const table =
      createAudiTable();

    table.headers[1] = "   ";

    const result =
      parseVariantTables(
        createExtraction([table]),
      );

    assert.equal(
      result.variants.length,
      0,
    );

    assert.equal(
      result.rejectedCandidates.length,
      1,
    );

    assert.deepEqual(
      result.rejectedCandidates[0].reasons,
      [
        "The variant column has no usable header.",
      ],
    );

    assert.equal(
      result.rejectedCandidates[0]
        .sourceTableIndex,
      0,
    );

    assert.equal(
      result.rejectedCandidates[0]
        .sourceColumnIndex,
      1,
    );
  },
);

test(
  "rejects a candidate without reliable power or fuel evidence",
  () => {
    const table: ExtractedTable = {
      index: 1,
      caption: null,

      headers: [
        "Technical data",
        "Unknown Variant",
      ],

      rows: [
        [
          "Drivetrain",
          "Front",
        ],
        [
          "Max. speed in km/h",
          "200",
        ],
      ],
    };

    const result =
      parseVariantTables(
        createExtraction([table]),
      );

    assert.equal(
      result.variants.length,
      0,
    );

    assert.equal(
      result.rejectedCandidates.length,
      1,
    );

    assert.deepEqual(
      result.rejectedCandidates[0].reasons,
      [
        "No reliable power or fuel evidence was detected.",
      ],
    );
  },
);