/**
 * Z Mobility
 * Official Records Generation Engine
 *
 * CLI orchestrator:
 *
 * OfficialHtmlExtraction
 *   → Variant Table Parser
 *   → Paragraph Enrichment
 *   → Mapper
 *   → Generation Report
 *
 * Business rules remain in the generation modules.
 */

import {
  mkdir,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import type {
  OfficialDocumentType,
} from "../core/manufacturer-types";

import {
  mapDetectedVariants,
} from "../generation/mapper";

import type {
  BrandManifest,
  MappingOptions,
  OfficialHtmlExtraction,
} from "../generation/parser-types";

import {
  enrichVariantsFromParagraphs,
} from "../generation/parsers/paragraph-parser";

import {
  parseVariantTables,
} from "../generation/parsers/variant-table-parser";

import {
  buildGenerationReport,
} from "../generation/report";

import {
  findProjectRoot,
  loadJsonFile,
  unique,
} from "../generation/utils";

type CliOptions = {
  inputPath: string;
  outputPath: string | null;

  marketCode: string;
  modelYear?: number;

  generation: string | null;
  documentType: OfficialDocumentType;

  dryRun: boolean;
};

const ALLOWED_DOCUMENT_TYPES =
  new Set<OfficialDocumentType>([
    "press_kit",
    "technical_specification",
    "model_range",
    "brochure",
    "price_list",
    "homologation",
    "other",
  ]);

function printUsage(): void {
  console.log(`
Z Mobility — Generate Official Records

Usage:

  npx tsx scripts/automotive/tools/generate-official-records.ts \\
    --input imports/official-html/audi/a6-c9.extracted.json \\
    --market PT \\
    --year 2026 \\
    --generation C9

Options:

  --input <path>          OfficialHtmlExtraction JSON file
  --output <path>         Output generation report JSON
  --market <code>         Market code, for example PT
  --year <number>         Optional model year
  --generation <value>    Optional generation name/code
  --document-type <type>  Defaults to model_range
  --dry-run               Print report without writing a file
  --help                  Show this help

Document types:

  press_kit
  technical_specification
  model_range
  brochure
  price_list
  homologation
  other
`);
}

function requireArgumentValue(
  args: readonly string[],
  index: number,
  argumentName: string,
): string {
  const value = args[index + 1];

  if (
    value === undefined ||
    value.startsWith("--")
  ) {
    throw new Error(
      `Missing value for "${argumentName}".`,
    );
  }

  return value;
}

function parseModelYear(
  value: string,
): number {
  const modelYear = Number(value);

  if (
    !Number.isInteger(modelYear) ||
    modelYear < 1886 ||
    modelYear > 2200
  ) {
    throw new Error(
      `Invalid model year "${value}".`,
    );
  }

  return modelYear;
}

function parseDocumentType(
  value: string,
): OfficialDocumentType {
  if (
    !ALLOWED_DOCUMENT_TYPES.has(
      value as OfficialDocumentType,
    )
  ) {
    throw new Error(
      `Invalid document type "${value}".`,
    );
  }

  return value as OfficialDocumentType;
}

function parseCliOptions(
  args: readonly string[],
): CliOptions {
  let inputPath: string | null = null;
  let outputPath: string | null = null;

  let marketCode: string | null = null;
  let modelYear: number | undefined;

  let generation: string | null = null;

  let documentType:
    OfficialDocumentType =
      "model_range";

  let dryRun = false;

  for (
    let index = 0;
    index < args.length;
    index += 1
  ) {
    const argument = args[index];

    switch (argument) {
      case "--input":
        inputPath = requireArgumentValue(
          args,
          index,
          argument,
        );
        index += 1;
        break;

      case "--output":
        outputPath = requireArgumentValue(
          args,
          index,
          argument,
        );
        index += 1;
        break;

      case "--market":
        marketCode = requireArgumentValue(
          args,
          index,
          argument,
        ).toUpperCase();
        index += 1;
        break;

      case "--year":
        modelYear = parseModelYear(
          requireArgumentValue(
            args,
            index,
            argument,
          ),
        );
        index += 1;
        break;

      case "--generation":
        generation = requireArgumentValue(
          args,
          index,
          argument,
        );
        index += 1;
        break;

      case "--document-type":
        documentType = parseDocumentType(
          requireArgumentValue(
            args,
            index,
            argument,
          ),
        );
        index += 1;
        break;

      case "--dry-run":
        dryRun = true;
        break;

      case "--help":
        printUsage();
        process.exit(0);
        break;

      default:
        throw new Error(
          `Unknown argument "${argument}".`,
        );
    }
  }

  if (inputPath === null) {
    throw new Error(
      'The "--input" argument is required.',
    );
  }

  if (marketCode === null) {
    throw new Error(
      'The "--market" argument is required.',
    );
  }

  return {
    inputPath,
    outputPath,
    marketCode,
    modelYear,
    generation,
    documentType,
    dryRun,
  };
}

function resolveProjectPath(
  projectRoot: string,
  filePath: string,
): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.resolve(
    projectRoot,
    filePath,
  );
}

function getDefaultOutputPath(
  projectRoot: string,
  extraction: OfficialHtmlExtraction,
): string {
  return path.join(
    projectRoot,
    "imports",
    "generated",
    extraction.target.brandSlug,
    `${extraction.target.modelSlug}.generation-report.json`,
  );
}

async function loadBrandManifest(
  projectRoot: string,
  brandSlug: string,
): Promise<BrandManifest> {
  const manifestPath = path.join(
    projectRoot,
    "scripts",
    "automotive",
    "config",
    "brands",
    `${brandSlug}.json`,
  );

  const manifest =
    await loadJsonFile<BrandManifest>(
      manifestPath,
    );

  if (manifest.slug !== brandSlug) {
    throw new Error(
      `Brand manifest slug "${manifest.slug}" does not match extraction brand "${brandSlug}".`,
    );
  }

  return manifest;
}

function createMappingOptions(
  extraction: OfficialHtmlExtraction,
  manifest: BrandManifest,
  options: CliOptions,
): MappingOptions {
  const model = manifest.models.find(
    (candidate) =>
      candidate.slug ===
      extraction.target.modelSlug,
  );

  if (!model) {
    throw new Error(
      `Model "${extraction.target.modelSlug}" was not found in the "${manifest.slug}" brand manifest.`,
    );
  }

  return {
    brandSlug: manifest.slug,

    modelSlug:
      extraction.target.modelSlug,

    manufacturerName:
      manifest.legalName,

    brandName:
      manifest.displayName,

    countryCode:
      manifest.countryCode,

    marketCode:
      options.marketCode,

    modelName:
      model.name,

    generation:
      options.generation,

    ...(options.modelYear !== undefined
      ? {
          modelYear:
            options.modelYear,
        }
      : {}),

    officialUrl:
      extraction.source.finalUrl ||
      extraction.source.url,

    documentType:
      options.documentType,

    sourceTitle:
      extraction.page.title,

    sourceDescription:
      extraction.page.description,

    sourceLanguage:
      extraction.page.language,

    sourceSha256:
      extraction.source.sha256,

    extractionSchemaVersion:
      extraction.schemaVersion,
  };
}

async function run(): Promise<void> {
  const options = parseCliOptions(
    process.argv.slice(2),
  );

  const projectRoot = findProjectRoot(
    process.cwd(),
  );

  const inputPath = resolveProjectPath(
    projectRoot,
    options.inputPath,
  );

  const extraction =
    await loadJsonFile<OfficialHtmlExtraction>(
      inputPath,
    );

  const manifest =
    await loadBrandManifest(
      projectRoot,
      extraction.target.brandSlug,
    );

  const tableResult =
    parseVariantTables(extraction);

  const paragraphResult =
    enrichVariantsFromParagraphs(
      extraction,
      tableResult.variants,
    );

  const mappingOptions =
    createMappingOptions(
      extraction,
      manifest,
      options,
    );

  const acceptedRecords =
    mapDetectedVariants(
      paragraphResult.variants,
      mappingOptions,
    );

  const pipelineWarnings: string[] = [
    ...tableResult.warnings,
    ...paragraphResult.warnings,
  ];

  if (extraction.reviewRequired) {
    pipelineWarnings.push(
      "The source extraction is marked as requiring manual review.",
    );
  }

  if (
    paragraphResult.variants.length === 0
  ) {
    pipelineWarnings.push(
      "No official variants were generated from this HTML extraction.",
    );
  }

  const report = buildGenerationReport({
    source: extraction.source,
    target: extraction.target,

    detectedVariants:
      paragraphResult.variants,

    acceptedRecords,

    rejectedCandidates:
      tableResult.rejectedCandidates,

    warnings:
      unique(pipelineWarnings),
  });

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        report,
        null,
        2,
      ),
    );

    return;
  }

  const outputPath =
    options.outputPath !== null
      ? resolveProjectPath(
          projectRoot,
          options.outputPath,
        )
      : getDefaultOutputPath(
          projectRoot,
          extraction,
        );

  await mkdir(
    path.dirname(outputPath),
    {
      recursive: true,
    },
  );

  await writeFile(
    outputPath,
    `${JSON.stringify(
      report,
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `Generation report written to:\n${outputPath}`,
  );

  console.log(
    JSON.stringify(
      report.summary,
      null,
      2,
    ),
  );
}

run().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode = 1;
});