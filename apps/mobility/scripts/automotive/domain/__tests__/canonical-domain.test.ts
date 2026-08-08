import assert from "node:assert/strict";
import test from "node:test";

import { toCanonicalAutomotiveEntityType } from "../../../../packages/automotive-domain/src";
import { mapManufacturerRecordToObservations } from "../../observations/ManufacturerRecordObservationMapper";
import { ResolvedAutomotiveProjectionEngine } from "../../resolution/ResolvedAutomotiveProjectionEngine";
import {
  normalizeVersionName,
  versionSimilarityScore,
} from "../../reconcile/version-matching";

const officialRecord = {
  externalId: "bmw-i5-edrive40-pt",
  entityType: "variant" as const,
  name: "BMW i5 eDrive40",
  countryCode: "PT",
  marketCode: "PT",
  manufacturer: "BMW AG",
  brand: "BMW",
  model: "i5",
  generation: "G60",
  variant: "eDrive40",
  officialUrl: "https://www.bmw.pt/i5",
  documentType: "technical_specification" as const,
  technicalData: {
    power_kw: 250,
    torque_nm: 430,
    range_wltp_km: 582,
  },
  metadata: {
    sourceSha256: "abc123",
    parserVersion: "test-v1",
    generationConfidence: 98,
  },
  legalReviewRequired: true,
  automaticPublicationAllowed: false,
};

test("legacy variant maps to canonical version without changing stored identity", () => {
  assert.equal(toCanonicalAutomotiveEntityType("variant"), "version");
  assert.equal(toCanonicalAutomotiveEntityType("generation"), "generation");
  assert.equal(toCanonicalAutomotiveEntityType("equipment"), null);
});

test("official technical data becomes source-aware observations", () => {
  const observations = mapManufacturerRecordToObservations({
    entityId: "version-1",
    record: officialRecord,
    sourceId: "source-bmw",
    sourceCode: "bmw_pressclub",
    observedAt: "2026-08-07T12:00:00.000Z",
  });

  assert.equal(observations.length, 3);
  const power = observations.find(
    (observation) => observation.metric === "automotive.power.output_kw",
  );
  assert.equal(power?.value, 250);
  assert.equal(power?.unit, "kW");
  assert.equal(power?.source.documentSha256, "abc123");
  assert.equal(power?.provenance.rawKey, "power_kw");
  assert.equal(power?.entityType, "version");
});

test("resolved projection preserves alternatives and reports conflicts", () => {
  const observations = mapManufacturerRecordToObservations({
    entityId: "version-1",
    record: officialRecord,
    sourceId: "source-bmw",
    observedAt: "2026-08-07T12:00:00.000Z",
  });

  const conflicting = {
    ...observations.find(
      (observation) => observation.metric === "automotive.range.wltp_km",
    )!,
    id: "range-alt",
    value: 573,
    source: {
      ...observations[0].source,
      sourceId: "source-bmw-de",
      documentType: "brochure",
    },
  };

  const projection = new ResolvedAutomotiveProjectionEngine().resolve([
    ...observations.map((observation, index) => ({
      ...observation,
      id: `observation-${index}`,
    })),
    conflicting,
  ]);

  assert.equal(projection.entityId, "version-1");
  assert.equal(projection.conflictCount, 1);
  assert.equal(
    projection.metrics["automotive.range.wltp_km"].value,
    582,
  );
  assert.equal(projection.sourceCount, 2);
});

test("version reconciliation helpers use canonical Version semantics", () => {
  assert.equal(
    normalizeVersionName("BMW i5 eDrive40", "BMW", "i5"),
    "edrive40",
  );
  assert.equal(versionSimilarityScore("edrive40", "edrive40"), 100);
  assert.ok(versionSimilarityScore("m60 xdrive", "m60 xdrive touring") >= 55);
});
