import type {
  ManufacturerAdapter,
  ManufacturerPipelineInput,
  ManufacturerSource,
} from "../contracts";

import {
  porsche9119922OfficialVariants,
} from "../../data/porsche/911-992-2";

const PORSCHE_MODEL_SLUG = "911-992-2";
const PORSCHE_MODEL_NAME = "911";

function requestedMarketCode(
  input: ManufacturerPipelineInput,
): string | null {
  if (input.scope?.kind === "market") {
    return input.scope.marketCode.trim().toUpperCase();
  }

  if (input.scope?.kind === "global") {
    return null;
  }

  return input.marketCode?.trim().toUpperCase() ?? null;
}

function ingestionScope(
  input: ManufacturerPipelineInput,
): "global" | "market" {
  if (input.scope) return input.scope.kind;
  return input.marketCode ? "market" : "global";
}

function hashUrl(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildPorscheOfficialSources(
  input: ManufacturerPipelineInput,
): ManufacturerSource[] {
  const modelFilter = input.modelSlug?.trim().toLowerCase();

  if (modelFilter && modelFilter !== PORSCHE_MODEL_SLUG) {
    return [];
  }

  const requestedMarket = requestedMarketCode(input);
  const byUrl = new Map<string, ManufacturerSource>();

  for (const record of porsche9119922OfficialVariants) {
    const url = record.officialUrl.trim();
    if (!url || byUrl.has(url)) continue;

    byUrl.set(url, {
      id: `porsche-911-992-2-${hashUrl(url)}`,
      url,
      type: "html",
      title: `Porsche ${record.name} official source`,
      language: null,
      mimeType: "text/html",
      documentType: record.officialDocumentType,
      official: true,
      discoveredFromUrl: null,
      metadata: {
        manufacturer: "Porsche AG",
        brand: "Porsche",
        modelSlug: PORSCHE_MODEL_SLUG,
        modelName: PORSCHE_MODEL_NAME,
        generation: record.generation,
        modelYear: record.modelYear ?? input.modelYear ?? null,
        sourceMarketCode: record.marketCode,
        ingestionScope: ingestionScope(input),
        requestedMarketCode: requestedMarket,
        sourceManifest:
          "z-mobility-porsche-official-source-manifest-v1",
      },
    });
  }

  return [...byUrl.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

export const porscheManufacturerAdapter: ManufacturerAdapter = {
  id: "porsche",
  manufacturerName: "Porsche AG",
  brandName: "Porsche",
  countryCode: "DE",
  sourceCode: "porsche_newsroom",

  canHandle(input): boolean {
    return input.manufacturer.trim().toLowerCase() === "porsche";
  },

  async discoverSources(input): Promise<ManufacturerSource[]> {
    if (input.sources && input.sources.length > 0) {
      return [...input.sources];
    }

    const sources = buildPorscheOfficialSources(input);
    if (sources.length === 0) {
      throw new Error(
        input.modelSlug
          ? `No Porsche official source is registered for model "${input.modelSlug}".`
          : "No Porsche official sources are registered in the source manifest.",
      );
    }

    return sources;
  },

  selectSources(sources): ManufacturerSource[] {
    const byId = new Map<string, ManufacturerSource>();
    for (const source of sources.filter((item) => item.official)) {
      if (!byId.has(source.id)) byId.set(source.id, source);
    }

    return [...byId.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  },
};
