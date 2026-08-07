/**
 * Z Mobility
 * Official Records Generation Engine
 *
 * Parses technical tables where each column represents
 * one official vehicle variant.
 *
 * No filesystem access.
 * No external services.
 */

import {
  detectBodyStyle,
  detectDisplacement,
  detectDrivetrain,
  detectElectrification,
  detectFuelType,
  detectPowerOutput,
  detectTransmission,
} from "../detectors";

import type {
  DetectedVariant,
  ExtractedTable,
  OfficialHtmlExtraction,
  RejectedCandidate,
  VariantTableParseResult,
} from "../parser-types";

import {
  normalizeText,
  parseLocalizedNumber,
  parseNumericRange,
} from "../utils";

type TableAttributes = Record<string, string>;

function normalizeAttributeName(
  value: string,
): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[():]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildColumnAttributes(
  table: ExtractedTable,
  columnIndex: number,
): TableAttributes {
  const attributes: TableAttributes = {};

  for (const row of table.rows) {
    const attributeName = normalizeAttributeName(
      row[0] ?? "",
    );

    const attributeValue = normalizeText(
      row[columnIndex + 1] ?? "",
    );

    if (!attributeName || !attributeValue) {
      continue;
    }

    attributes[attributeName] = attributeValue;
  }

  return attributes;
}

function findAttribute(
  attributes: TableAttributes,
  patterns: RegExp[],
): string | null {
  for (const [name, value] of Object.entries(
    attributes,
  )) {
    if (
      patterns.some((pattern) =>
        pattern.test(name),
      )
    ) {
      return value;
    }
  }

  return null;
}

function buildSourceText(
  variantHeader: string,
  attributes: TableAttributes,
): string {
  const attributeText = Object.entries(attributes)
    .map(
      ([name, value]) =>
        `${name}: ${value}`,
    )
    .join(" | ");

  return normalizeText(
    `${variantHeader} | ${attributeText}`,
  );
}

function detectAcceleration(
  value: string | null,
): number | null {
  if (!value) {
    return null;
  }

  return parseLocalizedNumber(
    value.split("(")[0]?.trim(),
  );
}

function detectTopSpeed(
  value: string | null,
): number | null {
  if (!value) {
    return null;
  }

  return parseLocalizedNumber(
    value.split("(")[0]?.trim(),
  );
}

function detectDisplacementFromTableValue(
  value: string | null,
): number | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeText(value);

  /*
   * Supported technical-table values:
   * 1,984
   * 1.968
   * 1968
   */
  const thousandsMatch = normalized.match(
    /^(\d{1,2})[.,](\d{3})$/,
  );

  if (thousandsMatch) {
    return Number(
      `${thousandsMatch[1]}${thousandsMatch[2]}`,
    );
  }

  const plainMatch = normalized.match(
    /^\d{3,5}$/,
  );

  if (plainMatch) {
    return Number(plainMatch[0]);
  }

  return detectDisplacement(normalized);
}

function deriveVariantName(
  header: string,
): string {
  return normalizeText(header)
    .replace(/^Audi\s+/i, "")
    .trim();
}

function calculateConfidence(
  variant: Omit<
    DetectedVariant,
    "confidence" | "warnings"
  >,
): {
  confidence: number;
  warnings: string[];
} {
  let score = 0;
  const warnings: string[] = [];

  if (variant.variant.length > 0) {
    score += 0.15;
  }

  if (variant.bodyStyle) {
    score += 0.1;
  } else {
    warnings.push(
      "Body style was not detected.",
    );
  }

  if (variant.engineDescription) {
    score += 0.1;
  } else {
    warnings.push(
      "Engine description was not detected.",
    );
  }

  if (variant.powerKw !== null) {
    score += 0.2;
  } else {
    warnings.push(
      "Power output in kW was not detected.",
    );
  }

  if (variant.powerPs !== null) {
    score += 0.05;
  }

  if (variant.fuelType) {
    score += 0.1;
  } else {
    warnings.push(
      "Fuel type was not detected.",
    );
  }

  if (variant.drivetrain) {
    score += 0.1;
  } else {
    warnings.push(
      "Drivetrain was not detected.",
    );
  }

  if (variant.torqueNm !== null) {
    score += 0.05;
  }

  if (
    variant.acceleration0To100Sec !== null ||
    variant.topSpeedKmh !== null
  ) {
    score += 0.05;
  }

  if (
    variant.consumptionCombinedL100KmMin !==
      null ||
    variant.co2GKmMin !== null
  ) {
    score += 0.1;
  }

  return {
    confidence: Math.min(
      1,
      Number(score.toFixed(2)),
    ),
    warnings,
  };
}

function normalizeVariantHeader(
  value: string,
): string {
  return normalizeText(value)
    .replace(
      /(Sedan|Avant|Sportback)(TDI|TFSI|TSI|FSI)/gi,
      "$1 $2",
    )
    .replace(
      /(A\d|Q\d|R8|TT)(Sedan|Avant|Sportback)/gi,
      "$1 $2",
    );
}

function parseVariantColumn(
  table: ExtractedTable,
  columnIndex: number,
): DetectedVariant | null {
  const variantHeader = normalizeVariantHeader(
  table.headers[columnIndex + 1] ?? "",
);

  if (!variantHeader) {
    return null;
  }

  const attributes = buildColumnAttributes(
    table,
    columnIndex,
  );

  const engineDescription = findAttribute(
    attributes,
    [/^engine$/, /engine description/],
  );

  const displacementValue = findAttribute(
    attributes,
    [/displacement/],
  );

  const drivetrainValue = findAttribute(
    attributes,
    [/drivetrain/, /drive type/],
  );

  const powerValue = findAttribute(
    attributes,
    [
      /power output/,
      /engine power/,
      /^power$/,
    ],
  );

  const torqueValue = findAttribute(
  attributes,
  [
    /max.*torque/,
    /torque.*nm/,
    /^torque/,
  ],
);

  const accelerationValue = findAttribute(
    attributes,
    [
      /acceleration.*0.*100/,
      /0.*100.*acceleration/,
    ],
  );

  const topSpeedValue = findAttribute(
  attributes,
  [
    /max.*speed/,
    /top.*speed/,
    /speed.*km\/h/,
  ],
);

  const consumptionValue = findAttribute(
    attributes,
    [
      /fuel consumption.*combined/,
      /combined fuel consumption/,
    ],
  );

  const co2Value = findAttribute(
    attributes,
    [
      /co2 emissions.*combined/,
      /combined co2 emissions/,
    ],
  );

  const sourceText = buildSourceText(
    variantHeader,
    attributes,
  );

  const power = detectPowerOutput(
    powerValue ?? variantHeader,
  );

  const consumptionRange =
    parseNumericRange(consumptionValue);

  const co2Range = parseNumericRange(co2Value);

  const partialVariant = {
    name: variantHeader,
    variant: deriveVariantName(
      variantHeader,
    ),

    bodyStyle: detectBodyStyle(
      variantHeader,
    ),

    engineDescription,
    displacementCc: 
        detectDisplacementFromTableValue(
            displacementValue,
        ) ??
        detectDisplacement(
            engineDescription ??
                variantHeader,
    ),

    powerKw: power.powerKw,
    powerPs: power.powerPs,

    torqueNm:
      parseLocalizedNumber(torqueValue),

    fuelType: detectFuelType(
      `${variantHeader} ${engineDescription ?? ""}`,
    ),

    transmission: detectTransmission(
      sourceText,
    ),

    drivetrain: detectDrivetrain(
      `${variantHeader} ${drivetrainValue ?? ""}`,
    ),

    electrification:
      detectElectrification(sourceText),

    acceleration0To100Sec:
      detectAcceleration(accelerationValue),

    topSpeedKmh:
      detectTopSpeed(topSpeedValue),

    consumptionCombinedL100KmMin:
      consumptionRange.min,

    consumptionCombinedL100KmMax:
      consumptionRange.max,

    co2GKmMin: co2Range.min,
    co2GKmMax: co2Range.max,

    sourceText,

    sourceTableIndex: table.index,
    sourceColumnIndex:
      columnIndex + 1,
  };

  const quality =
    calculateConfidence(partialVariant);

  const warnings = [...quality.warnings];

  const hasFrontAndAllWheel =
    /\bfront\b/i.test(
      drivetrainValue ?? "",
    ) &&
    /\bquattro\b|all[- ]wheel drive|\bAWD\b/i.test(
      `${variantHeader} ${drivetrainValue ?? ""}`,
    );

  if (hasFrontAndAllWheel) {
    warnings.push(
      "Header and drivetrain data indicate multiple drivetrain configurations.",
    );
  }

  if (
    /\(quattro\)/i.test(variantHeader)
  ) {
    warnings.push(
      "The variant header contains an optional or ambiguous quattro designation.",
    );
  }

  return {
    ...partialVariant,
    confidence: quality.confidence,
    warnings,
  };
}

export function parseVariantTables(
  extraction: OfficialHtmlExtraction,
): VariantTableParseResult {
  const variants: DetectedVariant[] = [];
  const rejectedCandidates:
    RejectedCandidate[] = [];
  const warnings: string[] = [];

  for (const table of extraction.tables) {
    if (table.headers.length < 2) {
      warnings.push(
        `Table ${table.index} was ignored because it has fewer than two columns.`,
      );

      continue;
    }

    const variantColumnCount =
      table.headers.length - 1;

    for (
      let columnIndex = 0;
      columnIndex < variantColumnCount;
      columnIndex += 1
    ) {
      const variant = parseVariantColumn(
        table,
        columnIndex,
      );

      if (!variant) {
        rejectedCandidates.push({
          sourceText:
            table.headers[columnIndex + 1] ??
            "",
          reasons: [
            "The variant column has no usable header.",
          ],
          sourceTableIndex: table.index,
          sourceColumnIndex:
            columnIndex + 1,
        });

        continue;
      }

      if (
        variant.powerKw === null &&
        variant.fuelType === null
      ) {
        rejectedCandidates.push({
          sourceText: variant.sourceText,
          reasons: [
            "No reliable power or fuel evidence was detected.",
          ],
          sourceTableIndex:
            variant.sourceTableIndex,
          sourceColumnIndex:
            variant.sourceColumnIndex,
        });

        continue;
      }

      variants.push(variant);
    }
  }

  return {
    variants,
    rejectedCandidates,
    warnings,
  };
}