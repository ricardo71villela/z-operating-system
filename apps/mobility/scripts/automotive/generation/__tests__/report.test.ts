import assert from "node:assert/strict";
import test from "node:test";

import { buildGenerationReport } from "../report";

test("builds a deterministic report summary and deduplicates warnings", () => {
  const report = buildGenerationReport({
    source: {
      url: "https://example.test/bmw",
      finalUrl: "https://example.test/bmw",
      fetchedAt: "2026-08-07T19:59:00.000Z",
      status: 200,
      contentType: "text/html",
      sha256: "abc123",
      sourceId: "source-1",
      documentType: "technical_specification",
    },
    target: {
      brandSlug: "bmw",
      modelSlug: "i5",
    },
    detectedVariants: [],
    acceptedRecords: [],
    rejectedCandidates: [],
    warnings: [" review ", "review", ""],
    generatedAt: "2026-08-07T20:00:00.000Z",
  });

  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.generatedAt, "2026-08-07T20:00:00.000Z");
  assert.deepEqual(report.warnings, ["review"]);
  assert.deepEqual(report.summary, {
    candidates: 0,
    accepted: 0,
    rejected: 0,
    warnings: 1,
  });
});
