import assert from "node:assert/strict";
import test from "node:test";

import {
  downloadOfficialDocument,
} from "../download-official-document";

import type {
  OfficialAttachment,
} from "../types";

test("downloads an attachment into memory", async () => {
  const originalFetch = global.fetch;

  global.fetch = async () =>
  ({
    ok: true,
    status: 200,
    headers: {
      get(name: string) {
        if (name === "content-type") {
          return "application/pdf";
        }
        return null;
      },
    },
    arrayBuffer: async () =>
      Buffer.from("hello world"),
  }) as unknown as Response;

  const attachment: OfficialAttachment = {
    url: "https://example.com/spec.pdf",
    title: "Specification",
    type: "pdf",
  };

  const result =
    await downloadOfficialDocument(
      attachment,
    );

  assert.equal(
    result.attachment.url,
    attachment.url,
  );

  assert.equal(
    result.mimeType,
    "application/pdf",
  );

  assert.equal(
    result.sizeBytes,
    11,
  );

  assert.equal(
    result.sha256.length,
    64,
  );

  global.fetch = originalFetch;
});