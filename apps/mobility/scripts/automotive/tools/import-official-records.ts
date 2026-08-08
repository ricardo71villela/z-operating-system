import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  ManufacturerOfficialRecord,
} from "../core/manufacturer-types";

type Options = {
  inputPath: string;
  brandSlug: string;
  modelSlug: string;
  exportName: string;
  dryRun: boolean;
  force: boolean;
};

type ValidationResult = {
  valid: ManufacturerOfficialRecord[];
  errors: string[];
};

const HELP = `
Z Mobility — Import Official Records

Usage:
  npm run automotive:import-official-records -- \\
    --input <records.json> \\
    --brand <brand-slug> \\
    --model <model-slug> \\
    --export-name <typescript-export> \\
    [--dry-run] \\
    [--force]

Example:
  npm run automotive:import-official-records -- \\
    --input imports/audi-a6-c9.json \\
    --brand audi \\
    --model a6-c9 \\
    --export-name audiA6C9DefaultOfficialVariants \\
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

function assertIdentifier(value: string): void {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error(
      "--export-name must be a valid TypeScript identifier.",
    );
  }
}

function parseOptions(): Options {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log(HELP);
    process.exit(0);
  }

  const options: Options = {
    inputPath: requireFlag(args, "--input"),
    brandSlug: requireFlag(args, "--brand"),
    modelSlug: requireFlag(args, "--model"),
    exportName: requireFlag(args, "--export-name"),
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
  };

  assertSlug(options.brandSlug, "Brand slug");
  assertSlug(options.modelSlug, "Model slug");
  assertIdentifier(options.exportName);

  return options;
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

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNonEmptyString(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function validateRecord(
  value: unknown,
  index: number,
): string[] {
  if (!isObject(value)) {
    return [`Record ${index}: must be an object.`];
  }

  const errors: string[] = [];

  const requiredStrings = [
    "externalId",
    "entityType",
    "name",
    "manufacturer",
    "brand",
    "officialUrl",
    "documentType",
  ];

  for (const field of requiredStrings) {
    if (!isNonEmptyString(value[field])) {
      errors.push(
        `Record ${index}: "${field}" is required.`,
      );
    }
  }

  if (
    value.entityType !== undefined &&
    value.entityType !== "variant"
  ) {
    errors.push(
      `Record ${index}: entityType must currently be "variant".`,
    );
  }

  if (
    value.officialUrl !== undefined &&
    isNonEmptyString(value.officialUrl)
  ) {
    try {
      const url = new URL(value.officialUrl);

      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push(
          `Record ${index}: officialUrl must use HTTP or HTTPS.`,
        );
      }
    } catch {
      errors.push(
        `Record ${index}: officialUrl is invalid.`,
      );
    }
  }

  if (
    typeof value.legalReviewRequired !== "boolean"
  ) {
    errors.push(
      `Record ${index}: legalReviewRequired must be boolean.`,
    );
  }

  if (
    typeof value.automaticPublicationAllowed !==
    "boolean"
  ) {
    errors.push(
      `Record ${index}: automaticPublicationAllowed must be boolean.`,
    );
  }

  if (
    value.modelYear !== undefined &&
    value.modelYear !== null &&
    (
      typeof value.modelYear !== "number" ||
      !Number.isInteger(value.modelYear)
    )
  ) {
    errors.push(
      `Record ${index}: modelYear must be an integer or null.`,
    );
  }

  if (
    value.technicalData !== undefined &&
    !isObject(value.technicalData)
  ) {
    errors.push(
      `Record ${index}: technicalData must be an object.`,
    );
  }

  if (
    value.metadata !== undefined &&
    !isObject(value.metadata)
  ) {
    errors.push(
      `Record ${index}: metadata must be an object.`,
    );
  }

  return errors;
}

function validateRecords(
  value: unknown,
): ValidationResult {
  if (!Array.isArray(value)) {
    return {
      valid: [],
      errors: [
        "The input JSON root must be an array.",
      ],
    };
  }

  const errors: string[] = [];
  const identifiers = new Set<string>();

  value.forEach((record, index) => {
    errors.push(
      ...validateRecord(record, index),
    );

    if (
      isObject(record) &&
      isNonEmptyString(record.externalId)
    ) {
      if (identifiers.has(record.externalId)) {
        errors.push(
          `Record ${index}: duplicate externalId "${record.externalId}".`,
        );
      }

      identifiers.add(record.externalId);
    }
  });

  return {
    valid:
      errors.length === 0
        ? value as ManufacturerOfficialRecord[]
        : [],
    errors,
  };
}

function createTypeScriptFile(
  exportName: string,
  records: ManufacturerOfficialRecord[],
): string {
  const serialized = JSON.stringify(
    records,
    null,
    2,
  );

  return `import type {
  ManufacturerOfficialRecord,
} from "../../../core/manufacturer-types";

export const ${exportName}:
  ManufacturerOfficialRecord[] = ${serialized};
`;
}

async function main(): Promise<void> {
  const options = parseOptions();

  const projectRoot = findProjectRoot(
    process.cwd(),
  );

  const inputPath = path.resolve(
    projectRoot,
    options.inputPath,
  );

  if (!existsSync(inputPath)) {
    throw new Error(
      `Input file not found: ${options.inputPath}`,
    );
  }

  const rawInput = await readFile(
    inputPath,
    "utf8",
  );

  let parsedInput: unknown;

  try {
    parsedInput = JSON.parse(rawInput);
  } catch (error) {
    throw new Error(
      `Invalid JSON: ${
        error instanceof Error
          ? error.message
          : "unknown error"
      }`,
    );
  }

  const validation = validateRecords(
    parsedInput,
  );

  if (validation.errors.length > 0) {
    console.error(
      "\nOfficial records validation failed:\n",
    );

    for (const error of validation.errors) {
      console.error(`- ${error}`);
    }

    process.exit(1);
  }

  const destinationPath = path.join(
    projectRoot,
    "scripts",
    "automotive",
    "data",
    options.brandSlug,
    options.modelSlug,
    "default.ts",
  );

  const relativeDestination = path.relative(
    projectRoot,
    destinationPath,
  );

  if (
    existsSync(destinationPath) &&
    !options.force &&
    !options.dryRun
  ) {
    throw new Error(
      `Refusing to overwrite ${relativeDestination}. Use --force after reviewing the generated records.`,
    );
  }

  const output = createTypeScriptFile(
    options.exportName,
    validation.valid,
  );

  console.log(
    "\nZ Mobility Official Records Importer\n",
  );

  console.log(
    `Input       : ${options.inputPath}`,
  );

  console.log(
    `Destination : ${relativeDestination}`,
  );

  console.log(
    `Records     : ${validation.valid.length}`,
  );

  console.log(
    `Mode        : ${
      options.dryRun
        ? "DRY RUN"
        : "WRITE"
    }`,
  );

  if (options.dryRun) {
    console.log(
      "\nValidation completed. No file was written.",
    );

    return;
  }

  await mkdir(
    path.dirname(destinationPath),
    { recursive: true },
  );

  await writeFile(
    destinationPath,
    output,
    "utf8",
  );

  console.log(
    `\nWritten: ${relativeDestination}`,
  );

  console.log("\nNext commands:\n");

  console.log("npx tsc --noEmit");

  console.log(
    `npm run automotive:sync:${options.brandSlug}-variants`,
  );
}

main().catch((error) => {
  console.error(
    "\nOfficial records importer failed",
  );

  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exit(1);
});