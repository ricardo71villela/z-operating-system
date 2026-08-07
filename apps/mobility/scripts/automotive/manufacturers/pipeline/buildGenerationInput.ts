/**
 * Z Mobility
 * Universal Manufacturer Pipeline
 *
 * Converts an extracted official HTML document into the
 * normalized input expected by the Generation Engine.
 *
 * No parsing.
 * No mapping.
 * No filesystem access.
 * No external services.
 * No manufacturer-specific logic.
 */

import type {
  ExtractedOfficialDocument,
} from "../../documents";

import type {
  OfficialHtmlExtraction,
} from "../../generation/parser-types";

export type BuildGenerationInputOptions = {
  brandSlug: string;
  modelSlug: string;

  finalUrl?: string;
  fetchedAt?: string;
  status?: number;

  schemaVersion?: string;

  reviewRequired?: boolean;
};

type ExtractedHtmlMetadata = {
  description?: unknown;
  canonicalUrl?: unknown;
  headings?: unknown;
  jsonLd?: unknown;
  textSignals?: unknown;
};

function asNullableString(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0
    ? normalized
    : null;
}

function asStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string =>
        typeof item === "string",
    )
    .map((item) => item.trim())
    .filter(
      (item) => item.length > 0,
    );
}

function asRecordArray(
  value: unknown,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      item,
    ): item is Record<string, unknown> =>
      typeof item === "object" &&
      item !== null &&
      !Array.isArray(item),
  );
}

function readTextSignals(
  value: unknown,
): OfficialHtmlExtraction["textSignals"] {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return {
      powerValues: [],
      torqueValues: [],
      consumptionValues: [],
      emissionValues: [],
      rangeValues: [],
    };
  }

  const signals =
    value as Record<string, unknown>;

  return {
    powerValues:
      asStringArray(
        signals.powerValues,
      ),

    torqueValues:
      asStringArray(
        signals.torqueValues,
      ),

    consumptionValues:
      asStringArray(
        signals.consumptionValues,
      ),

    emissionValues:
      asStringArray(
        signals.emissionValues,
      ),

    rangeValues:
      asStringArray(
        signals.rangeValues,
      ),
  };
}

function assertHtmlDocument(
  document: ExtractedOfficialDocument,
): void {
  if (document.type !== "html") {
    throw new Error(
      `Cannot build HTML generation input from document type "${document.type}".`,
    );
  }

  if (
    !document.source.attachment.url.trim()
  ) {
    throw new Error(
      "Extracted document has no source URL.",
    );
  }
}

function assertTarget(
  options: BuildGenerationInputOptions,
): void {
  if (!options.brandSlug.trim()) {
    throw new Error(
      "Generation target requires a brand slug.",
    );
  }

  if (!options.modelSlug.trim()) {
    throw new Error(
      "Generation target requires a model slug.",
    );
  }
}

export function buildGenerationInput(
  document: ExtractedOfficialDocument,
  options: BuildGenerationInputOptions,
): OfficialHtmlExtraction {
  assertHtmlDocument(document);
  assertTarget(options);

  const metadata =
    document.metadata as ExtractedHtmlMetadata;

  const sourceUrl =
    document.source.attachment.url.trim();

  return {
    schemaVersion:
      options.schemaVersion ??
      "1.0.0",

    source: {
      url: sourceUrl,

      finalUrl:
        options.finalUrl?.trim() ||
        sourceUrl,

      fetchedAt:
        options.fetchedAt ??
        new Date().toISOString(),

      status:
        options.status ?? 200,

      contentType:
        document.source.mimeType ||
        document.source
          .attachment.mimeType ||
        null,

      sha256:
        document.source.sha256,

      sourceId:
        document.source.attachment.sourceId,

      documentType:
        document.source.attachment.sourceDocumentType,

      metadata: {
        ...(document.source.attachment.sourceMetadata ?? {}),
      },
    },

    target: {
      brandSlug:
        options.brandSlug.trim(),

      modelSlug:
        options.modelSlug.trim(),
    },

    page: {
      title:
        document.title,

      description:
        asNullableString(
          metadata.description,
        ),

      language:
        document.language,

      canonicalUrl:
        asNullableString(
          metadata.canonicalUrl,
        ),

      headings:
        asStringArray(
          metadata.headings,
        ),

      paragraphs: [
        ...document.paragraphs,
      ],
    },

    jsonLd:
      asRecordArray(
        metadata.jsonLd,
      ),

    tables: [
      ...document.tables,
    ],

    textSignals:
      readTextSignals(
        metadata.textSignals,
      ),

    reviewRequired:
      options.reviewRequired ??
      true,
  };
}