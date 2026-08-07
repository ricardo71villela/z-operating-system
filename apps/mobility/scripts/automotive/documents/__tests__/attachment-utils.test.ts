import assert from "node:assert/strict";
import test from "node:test";

import {
  extractAttachmentTitle,
  inferAttachmentType,
  isSupportedAttachment,
  normalizeAttachmentUrl,
  removeDuplicateAttachments,
} from "../attachment-utils";

import type {
  OfficialAttachment,
} from "../types";

test(
  "infers supported attachment types from URLs",
  () => {
    assert.equal(
      inferAttachmentType(
        "https://example.com/specs.pdf",
      ),
      "pdf",
    );

    assert.equal(
      inferAttachmentType(
        "https://example.com/data.xlsx?download=1",
      ),
      "xlsx",
    );

    assert.equal(
      inferAttachmentType(
        "/files/data.xls",
      ),
      "xls",
    );

    assert.equal(
      inferAttachmentType(
        "https://example.com/archive.zip#section",
      ),
      "zip",
    );

    assert.equal(
      inferAttachmentType(
        "https://example.com/document",
      ),
      "unknown",
    );
  },
);

test(
  "normalizes absolute and relative attachment URLs",
  () => {
    assert.equal(
      normalizeAttachmentUrl(
        "https://example.com/files/specs.pdf",
        "https://example.com/article",
      ),
      "https://example.com/files/specs.pdf",
    );

    assert.equal(
      normalizeAttachmentUrl(
        "../files/specs.pdf",
        "https://example.com/news/article",
      ),
      "https://example.com/files/specs.pdf",
    );
  },
);

test(
  "rejects unsupported URL schemes and empty hrefs",
  () => {
    assert.equal(
      normalizeAttachmentUrl(
        "",
        "https://example.com",
      ),
      null,
    );

    assert.equal(
      normalizeAttachmentUrl(
        "#",
        "https://example.com",
      ),
      null,
    );

    assert.equal(
      normalizeAttachmentUrl(
        "javascript:void(0)",
        "https://example.com",
      ),
      null,
    );

    assert.equal(
      normalizeAttachmentUrl(
        "mailto:test@example.com",
        "https://example.com",
      ),
      null,
    );

    assert.equal(
      normalizeAttachmentUrl(
        "tel:+351000000000",
        "https://example.com",
      ),
      null,
    );
  },
);

test(
  "extracts attachment titles using the expected priority",
  () => {
    assert.equal(
      extractAttachmentTitle(
        "Technical Specifications",
        "Fallback title",
        "https://example.com/specs.pdf",
      ),
      "Technical Specifications",
    );

    assert.equal(
      extractAttachmentTitle(
        "",
        "Fallback title",
        "https://example.com/specs.pdf",
      ),
      "Fallback title",
    );

    assert.equal(
      extractAttachmentTitle(
        "",
        "",
        "https://example.com/files/specifications.pdf",
      ),
      "specifications.pdf",
    );

    assert.equal(
      extractAttachmentTitle(
        "",
        "",
      ),
      "Untitled attachment",
    );
  },
);

test(
  "recognizes attachments by extension or relevant link text",
  () => {
    assert.equal(
      isSupportedAttachment(
        "/files/specs.pdf",
        "",
      ),
      true,
    );

    assert.equal(
      isSupportedAttachment(
        "/download?id=123",
        "Technical Data",
      ),
      true,
    );

    assert.equal(
      isSupportedAttachment(
        "/download?id=123",
        "Press Kit",
      ),
      true,
    );

    assert.equal(
      isSupportedAttachment(
        "/about",
        "Company information",
      ),
      false,
    );
  },
);

test(
  "removes duplicate attachments by URL",
  () => {
    const attachments:
      OfficialAttachment[] = [
        {
          url:
            "https://example.com/specs.pdf",
          title: "Specifications",
          type: "pdf",
        },
        {
          url:
            "https://example.com/specs.pdf",
          title: "Duplicate title",
          type: "pdf",
        },
        {
          url:
            "https://example.com/data.xlsx",
          title: "Data",
          type: "xlsx",
        },
      ];

    const result =
      removeDuplicateAttachments(
        attachments,
      );

    assert.equal(result.length, 2);

    assert.equal(
      result[0].title,
      "Specifications",
    );

    assert.equal(
      result[1].url,
      "https://example.com/data.xlsx",
    );
  },
);