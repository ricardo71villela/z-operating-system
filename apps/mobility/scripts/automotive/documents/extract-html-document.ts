/**
 * Z Mobility
 * Official Documents Infrastructure
 *
 * Reusable HTML document extraction engine.
 *
 * Responsibilities:
 *  - parse downloaded HTML;
 *  - extract metadata, text, paragraphs and tables;
 *  - preserve JSON-LD and technical text signals;
 *  - return an ExtractedOfficialDocument.
 *
 * No fetch.
 * No filesystem access.
 * No manufacturer-specific logic.
 */

import * as cheerio from "cheerio";

import type {
  ExtractedTable,
} from "../generation/parser-types";

import type {
  ExtractedOfficialDocument,
} from "./extracted-document-types";

import type {
  DownloadedOfficialDocument,
} from "./types";

type JsonLdBlock =
  Record<string, unknown>;

function normalizeText(
  value: string,
): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(
  values: string[],
): string[] {
  return [...new Set(values)];
}

function extractJsonLd(
  $: cheerio.CheerioAPI,
): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];

  $('script[type="application/ld+json"]')
    .each((_, element) => {
      const raw =
        $(element).text().trim();

      if (!raw) {
        return;
      }

      try {
        const parsed: unknown =
          JSON.parse(raw);

        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (
              typeof item === "object" &&
              item !== null &&
              !Array.isArray(item)
            ) {
              blocks.push(
                item as JsonLdBlock,
              );
            }
          }

          return;
        }

        if (
          typeof parsed === "object" &&
          parsed !== null
        ) {
          blocks.push(
            parsed as JsonLdBlock,
          );
        }
      } catch {
        // Invalid JSON-LD is ignored.
      }
    });

  return blocks;
}

function extractTables(
  $: cheerio.CheerioAPI,
): ExtractedTable[] {
  const tables: ExtractedTable[] = [];

  $("table").each(
    (tableIndex, table) => {
      const tableElement =
        $(table);

      const captionText =
        normalizeText(
          tableElement
            .find("caption")
            .first()
            .text(),
        );

      const rows = tableElement
        .find("tr")
        .map((_, row) => {
          return [
            $(row)
              .find("th, td")
              .map((__, cell) =>
                normalizeText(
                  $(cell).text(),
                ),
              )
              .get(),
          ];
        })
        .get()
        .filter(
          (row) => row.length > 0,
        );

      if (rows.length === 0) {
        return;
      }

      const explicitHeaders =
        tableElement
          .find("thead tr")
          .first()
          .find("th, td")
          .map((_, cell) =>
            normalizeText(
              $(cell).text(),
            ),
          )
          .get();

      const headers =
        explicitHeaders.length > 0
          ? explicitHeaders
          : rows[0];

      const bodyRows =
        explicitHeaders.length > 0
          ? rows.filter(
              (row) =>
                JSON.stringify(row) !==
                JSON.stringify(
                  explicitHeaders,
                ),
            )
          : rows.slice(1);

      tables.push({
        index: tableIndex,
        caption:
          captionText || null,
        headers,
        rows: bodyRows,
      });
    },
  );

  return tables;
}

function collectMatches(
  text: string,
  pattern: RegExp,
): string[] {
  return unique(
    [...text.matchAll(pattern)].map(
      (match) =>
        normalizeText(match[0]),
    ),
  );
}

export async function extractHtmlDocument(
  document: DownloadedOfficialDocument,
): Promise<ExtractedOfficialDocument> {
  const html =
    document.buffer.toString("utf8");

  const $ =
    cheerio.load(html);

  $(
    "script:not([type='application/ld+json']), style, noscript, svg",
  ).remove();

  const title =
    normalizeText(
      $("title").first().text(),
    ) || null;

  const description =
    normalizeText(
      $('meta[name="description"]')
        .attr("content") ?? "",
    ) || null;

  const language =
    normalizeText(
      $("html").attr("lang") ?? "",
    ) || null;

  const canonicalUrl =
    normalizeText(
      $('link[rel="canonical"]')
        .attr("href") ?? "",
    ) || null;

  const headings =
    unique(
      $("h1, h2, h3")
        .map((_, element) =>
          normalizeText(
            $(element).text(),
          ),
        )
        .get()
        .filter(Boolean),
    );

  const paragraphs =
    unique(
      $(
        "main p, article p, [role='main'] p",
      )
        .map((_, element) =>
          normalizeText(
            $(element).text(),
          ),
        )
        .get()
        .filter(
          (paragraph) =>
            paragraph.length >= 30 &&
            paragraph.length <= 3000,
        ),
    );

  const text =
    normalizeText(
      $("body").text(),
    );

  const tables =
    extractTables($);

  const jsonLd =
    extractJsonLd($);

  const textSignals = {
    powerValues:
      collectMatches(
        text,
        /\b\d{2,4}(?:[.,]\d+)?\s*(?:kW|PS|hp|cv)\b/gi,
      ),

    torqueValues:
      collectMatches(
        text,
        /\b\d{2,4}(?:[.,]\d+)?\s*Nm\b/gi,
      ),

    consumptionValues:
      collectMatches(
        text,
        /\b\d{1,3}(?:[.,]\d+)?\s*(?:l\/100\s*km|kWh\/100\s*km)\b/gi,
      ),

    emissionValues:
      collectMatches(
        text,
        /\b\d{1,4}(?:[.,]\d+)?\s*g\/km\b/gi,
      ),

    rangeValues:
      collectMatches(
        text,
        /(?<!\/)\b\d{2,4}(?:[.,]\d+)?\s*km\b/gi,
      ),
  };

  return {
    source: document,

    type: "html",

    title,

    language,

    text,

    paragraphs,

    tables,

    metadata: {
      description,
      canonicalUrl,
      headings,
      jsonLd,
      textSignals,
    },

    warnings: [],
  };
}