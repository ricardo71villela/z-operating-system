import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import * as cheerio from "cheerio";

type Options = {
  url: string;
  brandSlug: string;
  modelSlug: string;
  dryRun: boolean;
  force: boolean;
};

type ExtractedTable = {
  index: number;
  caption: string | null;
  headers: string[];
  rows: string[][];
};

type JsonLdBlock = Record<string, unknown>;

type OfficialHtmlExtraction = {
  schemaVersion: "1.0.0";

  source: {
    url: string;
    finalUrl: string;
    fetchedAt: string;
    status: number;
    contentType: string | null;
    sha256: string;
  };

  target: {
    brandSlug: string;
    modelSlug: string;
  };

    page: {
    title: string | null;
    description: string | null;
    language: string | null;
    canonicalUrl: string | null;
    headings: string[];
    paragraphs: string[];
    };

  jsonLd: JsonLdBlock[];
  tables: ExtractedTable[];

  textSignals: {
    powerValues: string[];
    torqueValues: string[];
    consumptionValues: string[];
    emissionValues: string[];
    rangeValues: string[];
  };

  reviewRequired: true;
};

const HELP = `
Z Mobility — Extract Official HTML

Usage:
  npm run automotive:extract-official-html -- \\
    --url <official-url> \\
    --brand <brand-slug> \\
    --model <model-slug> \\
    [--dry-run] \\
    [--force]

Example:
  npm run automotive:extract-official-html -- \\
    --url "https://www.audi-mediacenter.com/..." \\
    --brand audi \\
    --model a6-c9 \\
    --dry-run
`;

function getFlagValue(
  args: string[],
  flag: string,
): string | undefined {
  const index = args.indexOf(flag);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function requireFlag(
  args: string[],
  flag: string,
): string {
  const value = getFlagValue(args, flag);

  if (!value || value.startsWith("--")) {
    throw new Error(
      `Missing required option ${flag}.`,
    );
  }

  return value;
}

function assertSlug(
  value: string,
  label: string,
): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(
      `${label} must use lowercase kebab-case.`,
    );
  }
}

function parseOptions(): Options {
  const args = process.argv.slice(2);

  if (
    args.length === 0 ||
    args.includes("--help")
  ) {
    console.log(HELP);
    process.exit(0);
  }

  const url = requireFlag(args, "--url");

  try {
    const parsedUrl = new URL(url);

    if (
      parsedUrl.protocol !== "https:" &&
      parsedUrl.protocol !== "http:"
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(
      "--url must be a valid HTTP or HTTPS URL.",
    );
  }

  const brandSlug = requireFlag(
    args,
    "--brand",
  );

  const modelSlug = requireFlag(
    args,
    "--model",
  );

  assertSlug(brandSlug, "Brand slug");
  assertSlug(modelSlug, "Model slug");

  return {
    url,
    brandSlug,
    modelSlug,
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
  };
}

function findProjectRoot(
  startDirectory: string,
): string {
  let current = path.resolve(startDirectory);

  while (true) {
    const packageJsonPath = path.join(
      current,
      "package.json",
    );

    const automotivePath = path.join(
      current,
      "scripts",
      "automotive",
    );

    if (
      existsSync(packageJsonPath) &&
      existsSync(automotivePath)
    ) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error(
        "Unable to locate the project root.",
      );
    }

    current = parent;
  }
}

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
      const raw = $(element).text().trim();

      if (!raw) {
        return;
      }

      try {
        const parsed: unknown = JSON.parse(raw);

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
        // JSON-LD inválido é ignorado,
        // mas o HTML bruto fica guardado por hash.
      }
    });

  return blocks;
}

function extractTables(
  $: cheerio.CheerioAPI,
): ExtractedTable[] {
  const tables: ExtractedTable[] = [];

  $("table").each((tableIndex, table) => {
    const tableElement = $(table);

    const captionText = normalizeText(
      tableElement.find("caption").first().text(),
    );

    const rows = tableElement
      .find("tr")
      .map((_, row) => {
        return [
          $(row)
            .find("th, td")
            .map((__, cell) =>
              normalizeText($(cell).text()),
            )
            .get(),
        ];
      })
      .get()
      .filter((row) => row.length > 0);

    if (rows.length === 0) {
      return;
    }

    const explicitHeaders = tableElement
      .find("thead tr")
      .first()
      .find("th, td")
      .map((_, cell) =>
        normalizeText($(cell).text()),
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
              JSON.stringify(explicitHeaders),
          )
        : rows.slice(1);

    tables.push({
      index: tableIndex,
      caption: captionText || null,
      headers,
      rows: bodyRows,
    });
  });

  return tables;
}

function collectMatches(
  text: string,
  pattern: RegExp,
): string[] {
  return unique(
    [...text.matchAll(pattern)].map(
      (match) => normalizeText(match[0]),
    ),
  );
}

async function main(): Promise<void> {
  const options = parseOptions();

  const projectRoot = findProjectRoot(
    process.cwd(),
  );

  console.log(
    "\nZ Mobility Official HTML Extractor\n",
  );

  console.log(`URL   : ${options.url}`);
  console.log(
    `Target: ${options.brandSlug}/${options.modelSlug}`,
  );

  const response = await fetch(options.url, {
    redirect: "follow",
    headers: {
      "user-agent":
        "Z-Mobility-Official-Data-Importer/1.0",
      accept:
        "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Official page request failed with HTTP ${response.status}.`,
    );
  }

  const html = await response.text();

  const contentType =
    response.headers.get("content-type");

  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes(
      "application/xhtml+xml",
    )
  ) {
    throw new Error(
      `Expected HTML but received "${contentType}".`,
    );
  }

  const $ = cheerio.load(html);

  $(
    "script:not([type='application/ld+json']), style, noscript, svg",
  ).remove();

  const title =
    normalizeText($("title").first().text()) ||
    null;

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

const headings = unique(
  $("h1, h2, h3")
    .map((_, element) =>
      normalizeText($(element).text()),
    )
    .get()
    .filter(Boolean),
);

const paragraphs = unique(
  $("main p, article p, [role='main'] p")
    .map((_, element) =>
      normalizeText($(element).text()),
    )
    .get()
    .filter(
      (paragraph) =>
        paragraph.length >= 30 &&
        paragraph.length <= 3000,
    ),
);

const pageText = normalizeText(
  $("body").text(),
);

const extraction: OfficialHtmlExtraction = {
  schemaVersion: "1.0.0",

    source: {
      url: options.url,
      finalUrl: response.url,
      fetchedAt: new Date().toISOString(),
      status: response.status,
      contentType,
      sha256: createHash("sha256")
        .update(html)
        .digest("hex"),
    },

    target: {
      brandSlug: options.brandSlug,
      modelSlug: options.modelSlug,
    },

    page: {
      title,
      description,
      language,
      canonicalUrl,
      headings,
      paragraphs,
    },

    jsonLd: extractJsonLd($),
    tables: extractTables($),

    textSignals: {
      powerValues: collectMatches(
        pageText,
        /\b\d{2,4}(?:[.,]\d+)?\s*(?:kW|PS|hp|cv)\b/gi,
      ),

      torqueValues: collectMatches(
        pageText,
        /\b\d{2,4}(?:[.,]\d+)?\s*Nm\b/gi,
      ),

      consumptionValues: collectMatches(
        pageText,
        /\b\d{1,3}(?:[.,]\d+)?\s*(?:l\/100\s*km|kWh\/100\s*km)\b/gi,
      ),

      emissionValues: collectMatches(
        pageText,
        /\b\d{1,4}(?:[.,]\d+)?\s*g\/km\b/gi,
      ),

      rangeValues: collectMatches(
        pageText,
        /\b\d{2,4}(?:[.,]\d+)?\s*km\b/gi,
      ),
    },

    reviewRequired: true,
  };

  const relativeDestination = path.join(
    "imports",
    "official-html",
    options.brandSlug,
    `${options.modelSlug}.extracted.json`,
  );

  const destinationPath = path.join(
    projectRoot,
    relativeDestination,
  );

  console.log(
    `Tables : ${extraction.tables.length}`,
  );

  console.log(
    `JSON-LD: ${extraction.jsonLd.length}`,
  );

  console.log(
    `Output : ${relativeDestination}`,
  );

  if (options.dryRun) {
    console.log(
      "\nExtraction completed. No file was written.",
    );

    return;
  }

  if (
    existsSync(destinationPath) &&
    !options.force
  ) {
    throw new Error(
      `Refusing to overwrite ${relativeDestination}. Use --force after reviewing the existing extraction.`,
    );
  }

  await mkdir(
    path.dirname(destinationPath),
    { recursive: true },
  );

  await writeFile(
    destinationPath,
    `${JSON.stringify(
      extraction,
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `\nWritten: ${relativeDestination}`,
  );

  console.log(
    "\nThis is an extraction draft. Review is mandatory before generating ManufacturerOfficialRecord entries.",
  );
}

main().catch((error) => {
  console.error(
    "\nOfficial HTML extraction failed",
  );

  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exit(1);
});