import type {
  ManufacturerAdapter,
  ManufacturerPipelineInput,
  ManufacturerSource,
} from "../contracts";

import {
  audiOfficialSourceManifest,
} from "./sourceManifest";

function normalizedRequestedMarketCode(
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

function ingestionScopeKind(
  input: ManufacturerPipelineInput,
): "global" | "market" {
  if (input.scope) {
    return input.scope.kind;
  }

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

function metadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

export function buildAudiOfficialSources(
  input: ManufacturerPipelineInput,
): ManufacturerSource[] {
  const modelFilter = input.modelSlug?.trim().toLowerCase();
  const requestedMarketCode = normalizedRequestedMarketCode(input);
  const ingestionScope = ingestionScopeKind(input);
  const bySource = new Map<string, ManufacturerSource>();

  for (const entry of audiOfficialSourceManifest) {
    if (modelFilter && entry.modelSlug !== modelFilter) {
      continue;
    }

    for (const record of entry.records) {
      const url = record.officialUrl.trim();
      if (!url) {
        continue;
      }

      const sourceKey = `${entry.modelSlug}\u0000${url}`;
      if (bySource.has(sourceKey)) {
        continue;
      }

      const isPdf = /\.pdf(?:$|[?#])/i.test(url);
      const sourceTitle = metadataString(
        record.metadata,
        "source_title",
      );
      const sourceLanguage = metadataString(
        record.metadata,
        "source_language",
      );
      const sourceDate = metadataString(
        record.metadata,
        "source_date",
      );

      bySource.set(sourceKey, {
        id: `audi-${entry.modelSlug}-${hashUrl(url)}`,
        url,
        type: isPdf ? "pdf" : "html",
        title:
          sourceTitle ??
          `Audi ${entry.modelName} official source`,
        language: sourceLanguage,
        mimeType:
          isPdf ? "application/pdf" : "text/html",
        documentType: record.documentType,
        official: true,
        discoveredFromUrl: null,
        metadata: {
          manufacturer: "Audi AG",
          brand: "Audi",
          modelSlug: entry.modelSlug,
          modelName: entry.modelName,
          generation:
            record.generation ?? input.generation ?? null,
          modelYear:
            record.modelYear ?? input.modelYear ?? null,
          sourceMarketCode:
            record.marketCode ?? record.countryCode ?? null,
          sourceDate,
          ingestionScope,
          requestedMarketCode,
          sourceManifest:
            "z-mobility-audi-official-source-manifest-v1",
        },
      });
    }
  }

  return [...bySource.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

export const audiManufacturerAdapter: ManufacturerAdapter = {
  id: "audi",
  manufacturerName: "Audi AG",
  brandName: "Audi",
  countryCode: "DE",
  sourceCode: "audi_media",

  canHandle(input): boolean {
    return input.manufacturer.trim().toLowerCase() === "audi";
  },

  async discoverSources(input): Promise<ManufacturerSource[]> {
    if (input.sources && input.sources.length > 0) {
      return [...input.sources];
    }

    const sources = buildAudiOfficialSources(input);

    if (sources.length === 0) {
      throw new Error(
        input.modelSlug
          ? `No Audi official source is registered for model "${input.modelSlug}".`
          : "No Audi official sources are registered in the source manifest.",
      );
    }

    return sources;
  },

  selectSources(sources): ManufacturerSource[] {
    const byId = new Map<string, ManufacturerSource>();

    for (const source of sources.filter((item) => item.official)) {
      if (!byId.has(source.id)) {
        byId.set(source.id, source);
      }
    }

    return [...byId.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  },
};
