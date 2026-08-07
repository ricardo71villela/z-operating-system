import type {
  ExternalAutomotiveRecord,
  NormalizedAutomotiveRecord,
} from "../core/types";

function removeDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeAutomotiveName(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const normalized = removeDiacritics(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  return normalized || null;
}

export function normalizeCountryCode(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const code = value.trim().toUpperCase();

  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export class AutomotiveNormalizer {
  normalize(
    record: ExternalAutomotiveRecord,
  ): NormalizedAutomotiveRecord {
    const validationErrors: string[] = [];
    const validationWarnings: string[] = [];

    const normalizedName = normalizeAutomotiveName(
      record.rawName,
    );

    if (!record.externalId) {
      validationErrors.push("Missing external ID.");
    }

    if (!normalizedName) {
      validationWarnings.push(
        "Record does not contain a usable name.",
      );
    }

    const countryCode = normalizeCountryCode(
      record.countryCode,
    );

    if (record.countryCode && !countryCode) {
      validationWarnings.push(
        `Invalid country code: ${record.countryCode}`,
      );
    }

    return {
      ...record,
      countryCode,
      normalizedName,
      normalizedPayload: {
        ...record.payload,
        normalized_name: normalizedName,
        normalized_country_code: countryCode,
      },
      validationErrors,
      validationWarnings,
    };
  }
}