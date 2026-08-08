/**
 * Z Mobility
 * Official Records Generation Engine
 *
 * Enriches detected variants with evidence found
 * in official page paragraphs.
 *
 * It never creates new variants.
 * It never overwrites stronger table evidence.
 *
 * No filesystem access.
 * No external services.
 */

import {
  detectDrivetrain,
  detectElectrification,
  detectTransmission,
} from "../detectors";

import type {
  DetectedVariant,
  OfficialHtmlExtraction,
  ParagraphEnrichmentResult,
} from "../parser-types";

import {
  normalizeText,
  unique,
} from "../utils";

type ParagraphMatch = {
  paragraph: string;
  score: number;
};

function getVariantTerms(
  variant: DetectedVariant,
): string[] {
  const source = normalizeText(
    [
      variant.name,
      variant.variant,
      variant.engineDescription ?? "",
      variant.fuelType ?? "",
      variant.bodyStyle ?? "",
      variant.powerKw !== null
        ? `${variant.powerKw} kW`
        : "",
    ].join(" "),
  ).toLowerCase();

  const terms = source
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter(
      (term) =>
        term.length >= 2 &&
        ![
          "a6",
          "a5",
          "a4",
          "a3",
          "a1",
          "sedan",
          "avant",
          "sportback",
          "kw",
          "ps",
          "hp",
          "cv",
        ].includes(term),
    );

  return unique(terms);
}

function scoreParagraph(
  paragraph: string,
  variant: DetectedVariant,
): number {
  const normalizedParagraph =
    normalizeText(paragraph).toLowerCase();

  const terms = getVariantTerms(variant);

  let score = 0;

  for (const term of terms) {
    if (
      new RegExp(
        `\\b${escapeRegExp(term)}\\b`,
        "i",
      ).test(normalizedParagraph)
    ) {
      score += 1;
    }
  }

  if (
    variant.powerKw !== null &&
    new RegExp(
      `\\b${variant.powerKw}\\s*kW\\b`,
      "i",
    ).test(normalizedParagraph)
  ) {
    score += 3;
  }

  if (
    variant.fuelType === "diesel" &&
    /\bTDI\b|\bdiesel\b/i.test(paragraph)
  ) {
    score += 3;
  }

  if (
    variant.fuelType === "gasoline" &&
    /\bTFSI\b|\bTSI\b|\bFSI\b|\bgasoline\b|\bpetrol\b/i.test(
      paragraph,
    )
  ) {
    score += 3;
  }

  if (
    variant.electrification === "MHEV" &&
    /\bMHEV\b|mild[- ]hybrid|48[- ]volt/i.test(
      paragraph,
    )
  ) {
    score += 2;
  }

  if (
    variant.drivetrain === "AWD" &&
    /\bquattro\b|all[- ]wheel drive|\bAWD\b/i.test(
      paragraph,
    )
  ) {
    score += 2;
  }

  return score;
}

function escapeRegExp(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

function findBestParagraphs(
  extraction: OfficialHtmlExtraction,
  variant: DetectedVariant,
): ParagraphMatch[] {
  return extraction.page.paragraphs
    .map((paragraph) => ({
      paragraph,
      score: scoreParagraph(
        paragraph,
        variant,
      ),
    }))
    .filter((match) => match.score >= 3)
    .sort(
      (first, second) =>
        second.score - first.score,
    )
    .slice(0, 5);
}

function detectStartStop(
  text: string,
): boolean | null {
  if (
    /\bstart[- /]?stop\b/i.test(text)
  ) {
    return true;
  }

  return null;
}

function detectQuattroUltra(
  text: string,
): boolean | null {
  if (
    /\bquattro ultra\b/i.test(text)
  ) {
    return true;
  }

  return null;
}

function addConflictWarning<T extends string>(
  warnings: string[],
  field: string,
  existingValue: T | null,
  detectedValue: T | null,
): void {
  if (
    existingValue !== null &&
    detectedValue !== null &&
    existingValue !== detectedValue
  ) {
    warnings.push(
      `${field} conflict: table evidence says "${existingValue}", ` +
        `but paragraph evidence says "${detectedValue}". ` +
        "The table value was preserved.",
    );
  }
}

function selectStrongMatches(
  matches: readonly ParagraphMatch[],
): ParagraphMatch[] {
  if (matches.length === 0) {
    return [];
  }

  const bestScore = matches[0].score;

  return matches.filter(
    (match) => match.score >= bestScore - 1,
  );
}

function enrichVariant(
  variant: DetectedVariant,
  matches: ParagraphMatch[],
): DetectedVariant {
  if (matches.length === 0) {
    return {
      ...variant,
      warnings: unique([
        ...variant.warnings,
        "No sufficiently relevant paragraph was found for enrichment.",
      ]),
    };
  }

  const strongMatches =
    selectStrongMatches(matches);

  const evidenceText = normalizeText(
    strongMatches
      .map((match) => match.paragraph)
      .join(" "),
  );

  const detectedTransmission =
    detectTransmission(evidenceText);

  const detectedDrivetrain =
    detectDrivetrain(evidenceText);

  const detectedElectrification =
    detectElectrification(evidenceText);

  const metadataWarnings: string[] = [];

  addConflictWarning(
  metadataWarnings,
  "Transmission",
  variant.transmission,
  detectedTransmission,
);

addConflictWarning(
  metadataWarnings,
  "Drivetrain",
  variant.drivetrain,
  detectedDrivetrain,
);

addConflictWarning(
  metadataWarnings,
  "Electrification",
  variant.electrification,
  detectedElectrification,
);

  if (
    variant.transmission === null &&
    detectedTransmission === null
  ) {
    metadataWarnings.push(
      "Transmission was not found in relevant paragraphs.",
    );
  }

  if (
    variant.electrification === null &&
    detectedElectrification === null
  ) {
    metadataWarnings.push(
      "Electrification was not found in relevant paragraphs.",
    );
  }

  const startStop =
    detectStartStop(evidenceText);

  const quattroUltra =
    detectQuattroUltra(evidenceText);

  if (startStop === true) {
    metadataWarnings.push(
      "Start-stop system detected in paragraph evidence.",
    );
  }

  if (quattroUltra === true) {
    metadataWarnings.push(
      "Quattro ultra detected in paragraph evidence.",
    );
  }

  return {
    ...variant,

    transmission:
      variant.transmission ??
      detectedTransmission,

    drivetrain:
      variant.drivetrain ??
      detectedDrivetrain,

    electrification:
      variant.electrification ??
      detectedElectrification,

    sourceText: normalizeText(
      [
        variant.sourceText,
        ...strongMatches.map(
          (match) =>
            `paragraph-evidence: ${match.paragraph}`,
        ),
      ].join(" | "),
    ),

    warnings: unique([
      ...variant.warnings,
      ...metadataWarnings,
    ]),
  };
}

export function enrichVariantsFromParagraphs(
  extraction: OfficialHtmlExtraction,
  variants: readonly DetectedVariant[],
): ParagraphEnrichmentResult {
  const warnings: string[] = [];

  const enrichedVariants = variants.map(
    (variant) => {
      const matches = findBestParagraphs(
        extraction,
        variant,
      );

      if (matches.length === 0) {
        warnings.push(
          `No paragraph evidence found for "${variant.name}".`,
        );
      }

      return enrichVariant(
        variant,
        matches,
      );
    },
  );

  return {
    variants: enrichedVariants,
    warnings: unique(warnings),
  };
}