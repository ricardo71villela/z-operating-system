import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverOfficialAttachments,
} from "../discover-official-attachments";

test("discovers an absolute PDF attachment", () => {
  const html = `
    <a href="https://example.com/specifications.pdf">
      Specifications
    </a>
  `;

  const attachments =
    discoverOfficialAttachments(
      html,
      "https://example.com/article",
    );

  assert.equal(attachments.length, 1);
  assert.equal(
    attachments[0].url,
    "https://example.com/specifications.pdf",
  );
  assert.equal(attachments[0].type, "pdf");
  assert.equal(
    attachments[0].title,
    "Specifications",
  );
});

test("discovers a relative attachment", () => {
  const html = `
    <a href="../files/specs.pdf">
      Technical Data
    </a>
  `;

  const attachments =
    discoverOfficialAttachments(
      html,
      "https://example.com/news/article",
    );

  assert.equal(attachments.length, 1);
  assert.equal(
    attachments[0].url,
    "https://example.com/files/specs.pdf",
  );
});

test("discovers xlsx attachments", () => {
  const html = `
    <a href="/files/data.xlsx">XLSX</a>
  `;

  const attachments =
    discoverOfficialAttachments(
      html,
      "https://example.com/article",
    );

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].type, "xlsx");
});

test("discovers zip attachments", () => {
  const html = `
    <a href="/files/archive.zip">Download</a>
  `;

  const attachments =
    discoverOfficialAttachments(
      html,
      "https://example.com/article",
    );

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].type, "zip");
});

test("discovers attachments by link text", () => {
  const html = `
    <a href="/download?id=123">
      Technical Data
    </a>
  `;

  const attachments =
    discoverOfficialAttachments(
      html,
      "https://example.com/article",
    );

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].type, "unknown");
});

test("ignores javascript links", () => {
  const html = `
    <a href="javascript:void(0)">
      Specifications
    </a>
  `;

  const attachments =
    discoverOfficialAttachments(
      html,
      "https://example.com/article",
    );

  assert.equal(attachments.length, 0);
});

test("ignores mailto links", () => {
  const html = `
    <a href="mailto:test@example.com">
      PDF
    </a>
  `;

  const attachments =
    discoverOfficialAttachments(
      html,
      "https://example.com/article",
    );

  assert.equal(attachments.length, 0);
});

test("removes duplicate attachments", () => {
  const html = `
    <a href="/files/specs.pdf">
      Specifications
    </a>

    <a href="/files/specs.pdf#download">
      Duplicate
    </a>
  `;

  const attachments =
    discoverOfficialAttachments(
      html,
      "https://example.com/article",
    );

  assert.equal(attachments.length, 1);
});

test("returns an empty collection when no attachments exist", () => {
  const attachments =
    discoverOfficialAttachments(
      "<html><body>No files</body></html>",
      "https://example.com/article",
    );

  assert.deepEqual(attachments, []);
});
