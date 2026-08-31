import type {
  ManufacturerAdapter,
  ManufacturerPipelineInput,
  ManufacturerSource,
} from "../contracts";

import {
  mercedesEClassS214OfficialVariants,
} from "../../data/mercedes/e-class-s214";

const MERCEDES_MODEL_SLUG = "e-class-s214";
const MERCEDES_MODEL_NAME = "E-Class";

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

export function buildMercedesOfficialSources(
  input: ManufacturerPipelineInput,
): ManufacturerSource[] {
  const modelFilter = input.modelSlug?.trim().toLowerCase();

  if (modelFilter && modelFilter !== MERCEDES_MODEL_SLUG) {
    return [];
  }

  const requestedMarket = requestedMarketCode(input);
  const byUrl = new Map<string, ManufacturerSource>();

  for (const record of mercedesEClassS214OfficialVariants) {
    const url = record.officialUrl.trim();
    if (!url || byUrl.has(url)) continue;

    byUrl.set(url, {
      id: "mercedes-e-class-s214-official-press-kit",
      url,
      type: "html",
      title: "Mercedes-Benz E-Class Estate S214 official press kit",
      language: null,
      mimeType: "text/html",
      documentType: record.documentType,
      official: true,
      discoveredFromUrl: null,
      metadata: {
        manufacturer: "Mercedes-Benz Group AG",
        brand: "Mercedes-Benz",
        modelSlug: MERCEDES_MODEL_SLUG,
        modelName: MERCEDES_MODEL_NAME,
        generation: record.generation ?? "S214",
        modelYear: record.modelYear ?? input.modelYear ?? null,
        sourceMarketCode:
          record.marketCode ?? record.countryCode ?? null,
        ingestionScope: ingestionScope(input),
        requestedMarketCode: requestedMarket,
        sourceManifest:
          "z-mobility-mercedes-official-source-manifest-v1",
      },
    });
  }

  return [...byUrl.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

export const mercedesManufacturerAdapter: ManufacturerAdapter = {
  id: "mercedes",
  manufacturerName: "Mercedes-Benz Group AG",
  brandName: "Mercedes-Benz",
  countryCode: "DE",
  sourceCode: "mercedes_media",

  canHandle(input): boolean {
    const manufacturer = input.manufacturer.trim().toLowerCase();
    return manufacturer === "mercedes" || manufacturer === "mercedes-benz";
  },

  async discoverSources(input): Promise<ManufacturerSource[]> {
    if (input.sources && input.sources.length > 0) {
      return [...input.sources];
    }

    const sources = buildMercedesOfficialSources(input);
    if (sources.length === 0) {
      throw new Error(
        input.modelSlug
          ? `No Mercedes-Benz official source is registered for model "${input.modelSlug}".`
          : "No Mercedes-Benz official sources are registered in the source manifest.",
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
