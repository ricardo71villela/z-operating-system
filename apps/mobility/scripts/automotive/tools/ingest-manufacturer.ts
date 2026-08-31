#!/usr/bin/env tsx

/** Z Mobility — complete manufacturer ingestion CLI. */

import process from "node:process";

import {
  BaseImporter,
} from "../core/BaseImporter";

import {
  GeneratedManufacturerRecordsAdapter,
  ManufacturerRegistry,
  registerBuiltInManufacturerAdapters,
  runManufacturerPipeline,
} from "../manufacturers";

type CliOptions = {
  manufacturer: string;
  modelSlug?: string;
  modelName?: string;
  marketCode?: string;
  generation?: string;
  modelYear?: number;
  minConfidence?: number;
  dryRun: boolean;
};

function getArgument(
  args: readonly string[],
  name: string,
): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for argument: ${name}`);
  }
  return value;
}

function requireArgument(
  args: readonly string[],
  name: string,
): string {
  const value = getArgument(args, name);
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function parseModelYear(
  value: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1886 || year > 2200) {
    throw new Error("--model-year must be a valid four-digit year.");
  }
  return year;
}

function parseConfidence(
  value: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("--min-confidence must be between 0 and 1.");
  }
  return confidence;
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Z Mobility — Manufacturer Ingestion

Global canonical run (default):
  npm run automotive:ingest -- \\
    --manufacturer bmw \\
    [--model-year 2026] \\
    [--min-confidence 0.5] \\
    [--dry-run]

Optional market-enrichment run:
  npm run automotive:ingest -- \\
    --manufacturer bmw \\
    --market PT

Optional single-model diagnostic filter:
    [--model-slug i5] [--model-name "BMW i5"] [--generation G60]
`);
    process.exit(0);
  }

  return {
    manufacturer: requireArgument(args, "--manufacturer").trim().toLowerCase(),
    modelSlug: getArgument(args, "--model-slug")?.trim().toLowerCase(),
    modelName: getArgument(args, "--model-name")?.trim(),
    marketCode: getArgument(args, "--market")?.trim().toUpperCase(),
    generation: getArgument(args, "--generation")?.trim(),
    modelYear: parseModelYear(getArgument(args, "--model-year")),
    minConfidence: parseConfidence(getArgument(args, "--min-confidence")),
    dryRun: args.includes("--dry-run"),
  };
}

async function main(): Promise<void> {
  const options = parseOptions();
  const registry = new ManufacturerRegistry();
  registerBuiltInManufacturerAdapters(registry);

  const scope = options.marketCode
    ? { kind: "market" as const, marketCode: options.marketCode }
    : { kind: "global" as const };

  console.log("\n═══════════════════════════════");
  console.log(" Z Mobility Manufacturer CLI");
  console.log("═══════════════════════════════\n");
  console.log(`Manufacturer : ${options.manufacturer}`);
  console.log(`Scope        : ${options.modelName ?? options.modelSlug ?? "complete catalogue"}`);
  console.log(`Ingestion    : ${scope.kind === "global" ? "GLOBAL CANONICAL" : `MARKET ${scope.marketCode}`}`);
  console.log(`Dry Run      : ${options.dryRun}\n`);

  const input = {
    manufacturer: options.manufacturer,
    brand: options.manufacturer,
    brandSlug: options.manufacturer,
    modelSlug: options.modelSlug,
    modelName: options.modelName,
    generation: options.generation ?? null,
    scope,
    marketCode: options.marketCode,
    modelYear: options.modelYear,
    documentType: "technical_specification" as const,
    minConfidence: options.minConfidence,
    dryRun: options.dryRun,
  };

  const result = await runManufacturerPipeline({
    registry,
    input,
  });

  if (!options.dryRun && result.records.length > 0) {
    const manufacturerAdapter = registry.resolve(input);

    if (!manufacturerAdapter.sourceCode) {
      throw new Error(
        `Adapter "${manufacturerAdapter.id}" has no staging sourceCode.`,
      );
    }

    const importer = new BaseImporter();
    const summary = await importer.run(
      new GeneratedManufacturerRecordsAdapter(
        {
          sourceCode: manufacturerAdapter.sourceCode,
          manufacturerName: manufacturerAdapter.manufacturerName,
          brandName: manufacturerAdapter.brandName,
          countryCode: manufacturerAdapter.countryCode,
          entityType: "variant",
        },
        result.records,
      ),
    );

    result.stagedRecordCount =
      summary.inserted + summary.updated;
  }

  console.log("──────── RESULT ────────");
  console.log("Adapter:", result.adapterId);
  console.log("Sources discovered:", result.discoveredSourceCount);
  console.log("Sources selected:", result.selectedSourceCount);
  console.log("Documents downloaded:", result.downloadedDocumentCount);
  console.log("Documents extracted:", result.extractedDocumentCount);
  console.log("Records generated:", result.generatedRecordCount);
  console.log("Records staged:", result.stagedRecordCount);
  console.log("Warnings:", result.warnings.length);

  if (result.warnings.length > 0) {
    console.log("\nWarning details:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log("Duration:", `${result.durationMs} ms`);
  console.log("");
}

main().catch((error) => {
  console.error("\nManufacturer ingestion failed.\n");
  console.error(error instanceof Error ? error.message : error);
  console.error("");
  process.exit(1);
});
