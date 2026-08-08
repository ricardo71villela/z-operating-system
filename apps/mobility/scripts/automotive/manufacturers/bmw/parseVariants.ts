/** BMW technical-page parser. */

import {
  detectBodyStyle,
  detectDisplacement,
  detectDrivetrain,
  detectElectrification,
  detectFuelType,
  detectPowerOutput,
  detectTransmission,
} from "../../generation/detectors";

import type {
  DetectedVariant,
  OfficialHtmlExtraction,
  VariantTableParseResult,
} from "../../generation/parser-types";

import {
  normalizeText,
  parseLocalizedNumber,
  parseNumericRange,
  slugify,
} from "../../generation/utils";

type Attributes = Record<string, string>;

function collectAttributes(
  extraction: OfficialHtmlExtraction,
): Attributes {
  const attributes: Attributes = {};

  for (const table of extraction.tables) {
    for (const row of table.rows) {
      if (row.length < 2) {
        continue;
      }

      const key = normalizeText(row[0] ?? "")
        .toLowerCase();
      const value = normalizeText(
        row.slice(1).join(" "),
      );

      if (key && value && !attributes[key]) {
        attributes[key] = value;
      }
    }
  }

  return attributes;
}

function findAttribute(
  attributes: Attributes,
  patterns: RegExp[],
): string | null {
  for (const [key, value] of Object.entries(attributes)) {
    if (patterns.some((pattern) => pattern.test(key))) {
      return value;
    }
  }

  return null;
}

function metadataString(
  extraction: OfficialHtmlExtraction,
  key: string,
): string | null {
  const value = extraction.source.metadata?.[key];
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function titleFromSlug(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^(?:x|m|i)\d/i.test(part)) {
        return part.replace(/^./, (letter) => letter.toUpperCase());
      }
      if (/^xdrive|^edrive/i.test(part)) {
        return part.replace(/^xdrive/i, "xDrive").replace(/^edrive/i, "eDrive");
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function deriveVariantName(
  extraction: OfficialHtmlExtraction,
): string {
  const metadataVariant =
    metadataString(extraction, "variantName") ??
    metadataString(extraction, "variantSlug");

  if (metadataVariant) {
    return metadataVariant.includes("-")
      ? titleFromSlug(metadataVariant)
      : metadataVariant;
  }

  try {
    const pathname = new URL(extraction.source.finalUrl).pathname;
    const suffix = pathname.match(/\.html\/([^/]+)\.bmw$/i)?.[1];
    if (suffix) {
      return titleFromSlug(suffix);
    }
  } catch {
    // Keep deterministic fallback below.
  }

  const modelName =
    metadataString(extraction, "modelName") ??
    metadataString(extraction, "model") ??
    extraction.target.modelSlug;

  const heading = extraction.page.headings.find((value) =>
    /BMW\s+/i.test(value),
  );

  return normalizeText(heading ?? modelName);
}

function calculateConfidence(
  variant: Omit<DetectedVariant, "confidence" | "warnings">,
): { confidence: number; warnings: string[] } {
  let score = 0.2;
  const warnings: string[] = [];

  if (variant.powerKw !== null) score += 0.25;
  else warnings.push("BMW power output was not detected.");

  if (variant.fuelType) score += 0.15;
  else warnings.push("BMW fuel type was not detected.");

  if (variant.torqueNm !== null) score += 0.1;
  if (variant.drivetrain) score += 0.1;
  if (variant.transmission) score += 0.05;
  if (variant.acceleration0To100Sec !== null) score += 0.05;
  if (variant.topSpeedKmh !== null) score += 0.05;
  if (variant.bodyStyle) score += 0.05;

  return {
    confidence: Math.min(1, Number(score.toFixed(2))),
    warnings,
  };
}

export function parseBmwVariants(
  extraction: OfficialHtmlExtraction,
): VariantTableParseResult {
  const attributes = collectAttributes(extraction);
  const pageText = normalizeText([
    extraction.page.title ?? "",
    ...extraction.page.headings,
    ...extraction.page.paragraphs,
    ...Object.entries(attributes).map(([key, value]) => `${key}: ${value}`),
  ].join(" | "));

  const powerValue = findAttribute(attributes, [
    /pot[eê]ncia.*kw/, /power.*kw/, /^pot[eê]ncia$/, /^power$/,
  ]);
  const torqueValue = findAttribute(attributes, [
    /bin[aá]rio/, /torque/,
  ]);
  const fuelValue = findAttribute(attributes, [
    /tipo de combust[ií]vel/, /fuel type/,
  ]);
  const transmissionValue = findAttribute(attributes, [
    /transmiss[aã]o/, /transmission/,
  ]);
  const drivetrainValue = findAttribute(attributes, [
    /tra[cç][aã]o/, /drivetrain/, /drive type/,
  ]);
  const accelerationValue = findAttribute(attributes, [
    /acelera[cç][aã]o.*0.*100/, /0.*100/,
  ]);
  const topSpeedValue = findAttribute(attributes, [
    /velocidade m[aá]xima/, /top speed/,
  ]);
  const consumptionValue = findAttribute(attributes, [
    /consumo.*combinad/, /combined.*consumption/,
  ]);
  const co2Value = findAttribute(attributes, [
    /emiss[oõ]es.*co2/, /co2.*combinad/,
  ]);
  const displacementValue = findAttribute(attributes, [
    /cilindrada/, /displacement/,
  ]);

  const power = detectPowerOutput(powerValue ?? pageText);
  const variantName = deriveVariantName(extraction);
  const modelName =
    metadataString(extraction, "modelName") ??
    metadataString(extraction, "model") ??
    extraction.target.modelSlug;

  const partial = {
    name: normalizeText(
      /^BMW\b/i.test(variantName)
        ? variantName
        : `BMW ${variantName}`,
    ),
    variant: normalizeText(variantName)
      .replace(/^BMW\s+/i, "")
      .replace(new RegExp(`^${modelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "") ||
      slugify(variantName),
    bodyStyle: detectBodyStyle(pageText),
    engineDescription: fuelValue,
    displacementCc: detectDisplacement(displacementValue ?? pageText),
    powerKw: power.powerKw,
    powerPs: power.powerPs,
    torqueNm: parseLocalizedNumber(torqueValue),
    fuelType: detectFuelType(`${fuelValue ?? ""} ${pageText}`),
    transmission: detectTransmission(`${transmissionValue ?? ""} ${pageText}`),
    drivetrain: detectDrivetrain(`${drivetrainValue ?? ""} ${variantName} ${pageText}`),
    electrification: detectElectrification(`${fuelValue ?? ""} ${pageText}`),
    acceleration0To100Sec: parseLocalizedNumber(accelerationValue),
    topSpeedKmh: parseLocalizedNumber(topSpeedValue),
    consumptionCombinedL100KmMin: parseNumericRange(consumptionValue).min,
    consumptionCombinedL100KmMax: parseNumericRange(consumptionValue).max,
    co2GKmMin: parseNumericRange(co2Value).min,
    co2GKmMax: parseNumericRange(co2Value).max,
    sourceText: pageText,
    sourceTableIndex: extraction.tables[0]?.index ?? null,
    sourceColumnIndex: null,
  };

  if (partial.powerKw === null && partial.fuelType === null) {
    return {
      variants: [],
      rejectedCandidates: [{
        sourceText: pageText,
        reasons: ["No reliable BMW power or fuel evidence was detected."],
        sourceTableIndex: partial.sourceTableIndex,
        sourceColumnIndex: null,
      }],
      warnings: [],
    };
  }

  const quality = calculateConfidence(partial);

  return {
    variants: [{
      ...partial,
      confidence: quality.confidence,
      warnings: quality.warnings,
    }],
    rejectedCandidates: [],
    warnings: [],
  };
}
