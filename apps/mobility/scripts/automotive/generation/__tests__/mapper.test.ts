import assert from "node:assert/strict";
import test from "node:test";

import {
  mapDetectedVariant,
} from "../mapper";

import type {
  DetectedVariant,
  MappingOptions,
} from "../parser-types";

function createVariant(): DetectedVariant {
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

    transmission: "dual_clutch",
    drivetrain: "FWD",
    electrification: "ICE",

    acceleration0To100Sec: 8.2,
    topSpeedKmh: 244,

    consumptionCombinedL100KmMin: 6.9,
    consumptionCombinedL100KmMax: 7.8,

    co2GKmMin: 157,
    co2GKmMax: 177,

    sourceText: "table",

    sourceTableIndex: 0,
    sourceColumnIndex: 1,

    confidence: 1,
    warnings: [],
  };
}

const options: MappingOptions = {
  brandSlug: "audi",
  modelSlug: "a6-c9",

  manufacturerName: "Audi AG",
  brandName: "Audi",

  countryCode: "DE",
  marketCode: "PT",

  modelName: "A6 C9",

  generation: "C9",

  modelYear: 2026,

  officialUrl: "https://audi.com",

  documentType: "model_range",

  sourceTitle: "Official",

  sourceDescription: null,

  sourceLanguage: "en",

  sourceSha256: "abc",

  extractionSchemaVersion: "1.0.0",
};

test(
  "creates a deterministic external id",
  () => {
    const record =
      mapDetectedVariant(
        createVariant(),
        options,
      );

    assert.ok(
      record.externalId.startsWith(
        "audi-a6-c9",
      ),
    );

    assert.equal(
      record.externalParentId,
      "audi-a6-c9-pt-2026",
    );
  },
);

test(
  "preserves technical data",
  () => {
    const record =
      mapDetectedVariant(
        createVariant(),
        options,
      );

    assert.equal(
      record.technicalData?.power_kw,
      150,
    );

    assert.equal(
      record.technicalData?.fuel_type,
      "gasoline",
    );

    assert.equal(
      record.technicalData?.transmission,
      "dual_clutch",
    );
  },
);

test(
  "preserves metadata",
  () => {
    const record =
      mapDetectedVariant(
        createVariant(),
        options,
      );

    assert.equal(
      record.metadata?.source_language,
      "en",
    );

    assert.equal(
      record.metadata?.source_sha256,
      "abc",
    );
  },
);

test(
  "always requires legal review",
  () => {
    const record =
      mapDetectedVariant(
        createVariant(),
        options,
      );

    assert.equal(
      record.legalReviewRequired,
      true,
    );

    assert.equal(
      record.automaticPublicationAllowed,
      false,
    );
  },
);

test(
  "mapping is deterministic",
  () => {
    const first =
      mapDetectedVariant(
        createVariant(),
        options,
      );

    const second =
      mapDetectedVariant(
        createVariant(),
        options,
      );

    assert.deepEqual(
      first,
      second,
    );
  },
);