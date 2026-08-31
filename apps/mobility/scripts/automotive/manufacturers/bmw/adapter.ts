import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import type {
  ManufacturerAdapter,
  ManufacturerPipelineInput,
  ManufacturerSource,
} from "../contracts";

import {
  parseBmwVariants,
} from "./parseVariants";

const BMW_PT_CATALOG_URL =
  "https://www.bmw.pt/pt/all-models.html";

const BMW_DISCOVERY_MARKET_CODE = "PT";

function normalizeUrl(
  href: string,
  baseUrl: string,
): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (url.hostname !== "www.bmw.pt") {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveModelSlug(url: string): string {
  const pathname = new URL(url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const allModelsIndex = parts.indexOf("all-models");
  const candidates =
    allModelsIndex >= 0
      ? parts.slice(allModelsIndex + 1)
      : parts;

  const ignored = new Set([
    "bmw-i",
    "bmw-x-series",
    "bmw-m",
    "bmw-z",
    "bmw-2-series",
    "bmw-3-series",
    "bmw-4-series",
    "bmw-5-series",
    "bmw-7-series",
    "bmw-8-series",
  ]);

  for (const part of candidates) {
    const clean = part.replace(/\.html.*$/i, "");
    if (
      clean &&
      !ignored.has(clean) &&
      !/^(?:dados-tecnicos|technical-data|visao-geral|overview)/i.test(clean)
    ) {
      return slugify(clean);
    }
  }

  return slugify(
    candidates.at(-1)?.replace(/\.html.*$/i, "") ??
      "unknown-model",
  );
}

function deriveVariantSlug(url: string): string | null {
  const pathname = new URL(url).pathname;
  const suffix = pathname.match(/\.html\/([^/]+)\.bmw$/i)?.[1];
  return suffix ? slugify(suffix) : null;
}

function extractCardText(
  $: cheerio.CheerioAPI,
  element: Element,
): string {
  const anchor = $(element);
  const container = anchor.closest(
    "article, li, [class*='card'], [class*='model'], [data-testid]",
  );

  const text = (
    container.length > 0
      ? container.text()
      : anchor.text()
  )
    .replace(/\s+/g, " ")
    .trim();

  const imageAlt =
    anchor.find("img[alt]").first().attr("alt")?.trim() ?? "";

  return [imageAlt, text]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveModelName(
  cardText: string,
  modelSlug: string,
): string {
  const match = cardText.match(
    /BMW\s+((?:i|X|M|Z)?\d+[A-Za-z0-9 ]*|S[eé]rie\s+\d+)/i,
  );

  if (match?.[1]) {
    return match[1].trim();
  }

  return modelSlug
    .split("-")
    .map((part) =>
      part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

function deriveVariantName(
  cardText: string,
  variantSlug: string | null,
): string | null {
  const match = cardText.match(
    /BMW\s+([A-Z0-9][A-Za-z0-9+ -]*(?:xDrive|sDrive|eDrive|M Sport|Touring|Coup[eé]|Cabrio|Berlina)?)/,
  );

  if (match?.[1]) {
    return match[1].trim();
  }

  return variantSlug;
}

function isCandidateModelUrl(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();
  return (
    pathname.includes("/pt/all-models/") &&
    pathname.includes(".html") &&
    !pathname.endsWith("/all-models.html") &&
    !/(privacy|legal|cookies|contact|configurator|used-cars)/.test(pathname)
  );
}

async function fetchCatalogHtml(): Promise<string> {
  const response = await fetch(BMW_PT_CATALOG_URL, {
    redirect: "follow",
    headers: {
      "user-agent": "Z-Mobility-Official-Data-Importer/1.0",
      accept: "text/html,application/xhtml+xml,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(
      `BMW catalogue request failed with HTTP ${response.status}.`,
    );
  }

  return response.text();
}

function discoverCatalogSources(
  html: string,
  input: ManufacturerPipelineInput,
): ManufacturerSource[] {
  const $ = cheerio.load(html);
  const byUrl = new Map<string, ManufacturerSource>();
  const modelFilter = input.modelSlug?.trim().toLowerCase();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const url = normalizeUrl(href, BMW_PT_CATALOG_URL);

    if (!url || !isCandidateModelUrl(url)) {
      return;
    }

    const modelSlug = deriveModelSlug(url);
    if (modelFilter && modelSlug !== modelFilter) {
      return;
    }

    const variantSlug = deriveVariantSlug(url);
    const cardText = extractCardText($, element);
    const modelName =
      input.modelName ?? deriveModelName(cardText, modelSlug);
    const variantName = deriveVariantName(cardText, variantSlug);

    const source: ManufacturerSource = {
      id: `bmw-pt-${modelSlug}-${variantSlug ?? slugify(url)}`,
      url,
      type: "html",
      title: variantName
        ? `BMW ${variantName} official page`
        : `BMW ${modelName} official page`,
      language: "pt",
      mimeType: "text/html",
      documentType: input.documentType,
      official: true,
      discoveredFromUrl: BMW_PT_CATALOG_URL,
      metadata: {
        manufacturer: "BMW Group",
        brand: "BMW",
        modelName,
        modelSlug,
        variantName,
        variantSlug,
        generation: input.generation ?? null,
        marketCode: BMW_DISCOVERY_MARKET_CODE,
        ingestionScope: input.scope?.kind ?? (input.marketCode ? "market" : "global"),
        requestedMarketCode:
          input.scope?.kind === "market"
            ? input.scope.marketCode
            : input.marketCode ?? null,
        modelYear: input.modelYear ?? null,
        catalogUrl: BMW_PT_CATALOG_URL,
      },
    };

    const existing = byUrl.get(url);
    if (!existing || variantSlug) {
      byUrl.set(url, source);
    }
  });

  return [...byUrl.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

function requestedMarketCode(
  input: ManufacturerPipelineInput,
): string | null {
  if (input.scope?.kind === "market") {
    return input.scope.marketCode.trim().toUpperCase();
  }

  return input.marketCode?.trim().toUpperCase() ?? null;
}

export const bmwManufacturerAdapter: ManufacturerAdapter = {
  id: "bmw",
  manufacturerName: "BMW Group",
  brandName: "BMW",
  countryCode: "DE",
  sourceCode: "bmw_pressclub",
  parseVariants: parseBmwVariants,

  canHandle(input): boolean {
    return input.manufacturer.trim().toLowerCase() === "bmw";
  },

  async discoverSources(input): Promise<ManufacturerSource[]> {
    if (input.sources && input.sources.length > 0) {
      return [...input.sources];
    }

    const marketCode = requestedMarketCode(input);
    if (marketCode && marketCode !== BMW_DISCOVERY_MARKET_CODE) {
      throw new Error(
        `BMW market enrichment is not configured for market "${marketCode}". Global canonical ingestion is available without --market.`,
      );
    }

    const html = await fetchCatalogHtml();
    const sources = discoverCatalogSources(html, input);

    if (sources.length === 0) {
      throw new Error(
        input.modelSlug
          ? `No BMW catalogue source was found for model "${input.modelSlug}".`
          : "No BMW model sources were discovered in the official catalogue.",
      );
    }

    return sources;
  },

  selectSources(sources): ManufacturerSource[] {
    const groups = new Map<string, ManufacturerSource[]>();

    for (const source of sources.filter((item) => item.official)) {
      const modelSlug =
        typeof source.metadata.modelSlug === "string"
          ? source.metadata.modelSlug
          : source.id;
      const group = groups.get(modelSlug) ?? [];
      group.push(source);
      groups.set(modelSlug, group);
    }

    const selected: ManufacturerSource[] = [];
    for (const group of groups.values()) {
      const technical = group.filter((source) =>
        /(dados-tecnicos|technical-data|\.html\/[^/]+\.bmw)/i.test(source.url),
      );
      selected.push(...(technical.length > 0 ? technical : group));
    }

    return selected.sort((a, b) => a.id.localeCompare(b.id));
  },

  selectAttachments(attachments) {
    const excluded = [
      "corrupcao",
      "corrupção",
      "infracoes",
      "infrações",
      "credito",
      "crédito",
      "privacy",
      "privacidade",
      "legal",
      "cookies",
      "compliance",
      "consumer",
      "consumidor",
    ];

    return attachments.filter((attachment) => {
      if (attachment.type === "html") return true;
      const text = `${attachment.title} ${attachment.url}`.toLowerCase();
      return !excluded.some((term) => text.includes(term));
    });
  },
};
