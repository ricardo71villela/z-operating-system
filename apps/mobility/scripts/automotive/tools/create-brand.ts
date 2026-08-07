import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

type BrandModelManifest = {
  slug: string;
  name: string;
  exportName?: string;
};

type BrandManifest = {
  slug: string;
  displayName: string;
  legalName: string;
  countryCode: string;

  sourceCode: string;
  sourceName: string;
  websiteUrl: string;

  models: BrandModelManifest[];
};

type Options = {
  brandSlug: string;
  dryRun: boolean;
  force: boolean;
  forceData: boolean;
};

type GeneratedFile = {
  relativePath: string;
  absolutePath: string;
  content: string;

  /**
   * Data files may later contain manually verified official records.
   * They must not be overwritten by --force alone.
   */
  isDataFile?: boolean;
};

type PackageJsonShape = {
  scripts?: Record<string, string>;
  [key: string]: unknown;
};

const HELP = `
Z Mobility — Create Complete Brand

Usage:
  npm run automotive:create-brand -- <brand-slug> [options]

Examples:
  npm run automotive:create-brand -- audi --dry-run
  npm run automotive:create-brand -- audi --force

Options:
  --dry-run      Show the complete plan without writing files
  --force        Replace generated infrastructure and index files
  --force-data   Also replace existing default.ts data files
  --help         Show this help
`;

function parseOptions(): Options {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const brandSlug = args.find(
    (argument) => !argument.startsWith("--"),
  );

  if (!brandSlug) {
    throw new Error("Missing brand slug.");
  }

  assertSlug(brandSlug, "Brand slug");

  return {
    brandSlug,
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    forceData: args.includes("--force-data"),
  };
}

function assertSlug(value: string, label: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(
      `${label} must use lowercase kebab-case, e.g. aston-martin.`,
    );
  }
}

function toPascalCase(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join("");
}

function findProjectRoot(startDirectory: string): string {
  let current = path.resolve(startDirectory);

  while (true) {
    const packageJsonPath = path.join(
      current,
      "package.json",
    );

    const automotiveRoot = path.join(
      current,
      "scripts",
      "automotive",
    );

    if (
      existsSync(packageJsonPath) &&
      existsSync(automotiveRoot)
    ) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error(
        "Unable to find the project root.",
      );
    }

    current = parent;
  }
}

async function loadManifest(
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

  if (!existsSync(manifestPath)) {
    throw new Error(
      `Brand manifest not found:\n${path.relative(
        projectRoot,
        manifestPath,
      )}`,
    );
  }

  const rawManifest = await readFile(
    manifestPath,
    "utf8",
  );

  const manifest = JSON.parse(
    rawManifest,
  ) as BrandManifest;

  validateManifest(manifest, brandSlug);

  return manifest;
}

function validateManifest(
  manifest: BrandManifest,
  requestedSlug: string,
): void {
  if (manifest.slug !== requestedSlug) {
    throw new Error(
      `Manifest slug "${manifest.slug}" does not match requested slug "${requestedSlug}".`,
    );
  }

  assertSlug(manifest.slug, "Manifest brand slug");

  if (!manifest.displayName.trim()) {
    throw new Error(
      "Manifest displayName is required.",
    );
  }

  if (!manifest.legalName.trim()) {
    throw new Error(
      "Manifest legalName is required.",
    );
  }

  if (!/^[A-Z]{2}$/.test(manifest.countryCode)) {
    throw new Error(
      "Manifest countryCode must be an uppercase ISO2 code.",
    );
  }

  if (!manifest.sourceCode.trim()) {
    throw new Error(
      "Manifest sourceCode is required.",
    );
  }

  if (!manifest.sourceName.trim()) {
    throw new Error(
      "Manifest sourceName is required.",
    );
  }

  const website = new URL(manifest.websiteUrl);

  if (!["http:", "https:"].includes(website.protocol)) {
    throw new Error(
      "Manifest websiteUrl must use HTTP or HTTPS.",
    );
  }

  if (
    !Array.isArray(manifest.models) ||
    manifest.models.length === 0
  ) {
    throw new Error(
      "Manifest must contain at least one model.",
    );
  }

  const slugs = new Set<string>();

  for (const model of manifest.models) {
    assertSlug(model.slug, `Model slug "${model.slug}"`);

    if (!model.name.trim()) {
      throw new Error(
        `Model "${model.slug}" must have a name.`,
      );
    }

    if (slugs.has(model.slug)) {
      throw new Error(
        `Duplicate model slug: "${model.slug}".`,
      );
    }

    slugs.add(model.slug);
  }
}

function getModelExportNames(
  manifest: BrandManifest,
  model: BrandModelManifest,
) {
  const brandPrefix = toPascalCase(
    manifest.displayName,
  );

  const modelPrefix =
    model.exportName ??
    toPascalCase(model.name);

  return {
    defaultExport:
      `${brandPrefix}${modelPrefix}` +
      "DefaultOfficialVariants",

    aggregateExport:
      `${brandPrefix}${modelPrefix}` +
      "OfficialVariants",
  };
}

function createModelDefaultFile(
  manifest: BrandManifest,
  model: BrandModelManifest,
): string {
  const { defaultExport } =
    getModelExportNames(manifest, model);

  return `import type {
  ManufacturerOfficialRecord,
} from "../../../core/manufacturer-types";

export const ${defaultExport}:
  ManufacturerOfficialRecord[] = [
    // Add verified official ${manifest.displayName} ${model.name} variants.
  ];
`;
}

function createModelIndexFile(
  manifest: BrandManifest,
  model: BrandModelManifest,
): string {
  const {
    defaultExport,
    aggregateExport,
  } = getModelExportNames(manifest, model);

  return `import {
  ${defaultExport},
} from "./default";

export const ${aggregateExport}:
  typeof ${defaultExport} = [
    ...${defaultExport},
  ];
`;
}

function createBrandIndexFile(
  manifest: BrandManifest,
): string {
  const brandExport =
    `${toPascalCase(manifest.displayName)}` +
    "OfficialVariants";

  const imports = manifest.models
    .map((model) => {
      const { aggregateExport } =
        getModelExportNames(manifest, model);

      return `import {
  ${aggregateExport},
} from "./${model.slug}";`;
    })
    .join("\n\n");

  const spreads = manifest.models
    .map((model) => {
      const { aggregateExport } =
        getModelExportNames(manifest, model);

      return `  ...${aggregateExport},`;
    })
    .join("\n");

  return `${imports}

export const ${brandExport} = [
${spreads}
];
`;
}

function createAdapterFile(
  manifest: BrandManifest,
): string {
  const classPrefix = toPascalCase(
    manifest.displayName,
  );

  const brandExport =
    `${classPrefix}OfficialVariants`;

  return `import {
  ManufacturerOfficialAdapter,
} from "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  ${brandExport},
} from "../../data/${manifest.slug}";

export class ${classPrefix}OfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "${manifest.sourceCode}",
    manufacturerName: "${manifest.legalName}",
    brandName: "${manifest.displayName}",
    countryCode: "${manifest.countryCode}",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return ${brandExport};
  }
}
`;
}

function createSyncFile(
  manifest: BrandManifest,
): string {
  const classPrefix = toPascalCase(
    manifest.displayName,
  );

  return `import {
  ${classPrefix}OfficialVariantsAdapter,
} from "../adapters/${manifest.slug}/${classPrefix}OfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting ${manifest.displayName} official variants staging sync...",
  );

  const importer = new BaseImporter();

  const adapter =
    new ${classPrefix}OfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\\n${manifest.displayName} official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\\nNo ${manifest.displayName} records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\\n${manifest.displayName} official variants staging sync failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});
`;
}

function createSourceSql(
  manifest: BrandManifest,
): string {
  const sourceCode =
    manifest.sourceCode.replaceAll("'", "''");

  const sourceName =
    manifest.sourceName.replaceAll("'", "''");

  const websiteUrl =
    manifest.websiteUrl.replaceAll("'", "''");

  return `insert into public.automotive_data_sources (
  code,
  name,
  website_url,
  source_type,
  priority,
  active
)
values (
  '${sourceCode}',
  '${sourceName}',
  '${websiteUrl}',
  'manufacturer',
  1,
  true
)
on conflict (code)
do update set
  name = excluded.name,
  website_url = excluded.website_url,
  source_type = excluded.source_type,
  priority = excluded.priority,
  active = excluded.active,
  updated_at = now();
`;
}

function buildGeneratedFiles(
  projectRoot: string,
  manifest: BrandManifest,
): GeneratedFile[] {
  const automotiveRoot = path.join(
    projectRoot,
    "scripts",
    "automotive",
  );

  const classPrefix = toPascalCase(
    manifest.displayName,
  );

  const files: GeneratedFile[] = [];

  files.push({
    relativePath:
      `scripts/automotive/adapters/` +
      `${manifest.slug}/` +
      `${classPrefix}OfficialVariantsAdapter.ts`,

    absolutePath: path.join(
      automotiveRoot,
      "adapters",
      manifest.slug,
      `${classPrefix}OfficialVariantsAdapter.ts`,
    ),

    content: createAdapterFile(manifest),
  });

  files.push({
    relativePath:
      `scripts/automotive/data/` +
      `${manifest.slug}/index.ts`,

    absolutePath: path.join(
      automotiveRoot,
      "data",
      manifest.slug,
      "index.ts",
    ),

    content: createBrandIndexFile(manifest),
  });

  for (const model of manifest.models) {
    files.push({
      relativePath:
        `scripts/automotive/data/` +
        `${manifest.slug}/${model.slug}/index.ts`,

      absolutePath: path.join(
        automotiveRoot,
        "data",
        manifest.slug,
        model.slug,
        "index.ts",
      ),

      content: createModelIndexFile(
        manifest,
        model,
      ),
    });

    files.push({
      relativePath:
        `scripts/automotive/data/` +
        `${manifest.slug}/${model.slug}/default.ts`,

      absolutePath: path.join(
        automotiveRoot,
        "data",
        manifest.slug,
        model.slug,
        "default.ts",
      ),

      content: createModelDefaultFile(
        manifest,
        model,
      ),

      isDataFile: true,
    });
  }

  files.push({
    relativePath:
      `scripts/automotive/sync/` +
      `sync-${manifest.slug}-official-variants.ts`,

    absolutePath: path.join(
      automotiveRoot,
      "sync",
      `sync-${manifest.slug}-official-variants.ts`,
    ),

    content: createSyncFile(manifest),
  });

  files.push({
    relativePath:
      `scripts/automotive/sql/` +
      `insert-${manifest.slug}-source.sql`,

    absolutePath: path.join(
      automotiveRoot,
      "sql",
      `insert-${manifest.slug}-source.sql`,
    ),

    content: createSourceSql(manifest),
  });

  return files;
}

async function writeGeneratedFiles(
  files: GeneratedFile[],
  options: Options,
): Promise<void> {
  for (const file of files) {
    const exists = existsSync(file.absolutePath);

    if (options.dryRun) {
      const action = exists
        ? file.isDataFile
          ? "WOULD PRESERVE"
          : options.force
            ? "WOULD UPDATE"
            : "WOULD SKIP"
        : "WOULD CREATE";

      console.log(
        `${action}: ${file.relativePath}`,
      );

      continue;
    }

    if (exists && file.isDataFile && !options.forceData) {
      console.log(
        `PRESERVED: ${file.relativePath}`,
      );

      continue;
    }

    if (exists && !options.force) {
      console.log(
        `SKIPPED: ${file.relativePath}`,
      );

      continue;
    }

    await mkdir(
      path.dirname(file.absolutePath),
      { recursive: true },
    );

    await writeFile(
      file.absolutePath,
      file.content,
      "utf8",
    );

    console.log(
      `${exists ? "UPDATED" : "CREATED"}: ` +
      file.relativePath,
    );
  }
}

async function updatePackageJson(
  projectRoot: string,
  manifest: BrandManifest,
  options: Options,
): Promise<void> {
  const packageJsonPath = path.join(
    projectRoot,
    "package.json",
  );

  const raw = await readFile(
    packageJsonPath,
    "utf8",
  );

  const packageJson = JSON.parse(
    raw,
  ) as PackageJsonShape;

  packageJson.scripts ??= {};

  const scriptName =
    `automotive:sync:${manifest.slug}-variants`;

  const scriptCommand =
    `tsx scripts/automotive/sync/` +
    `sync-${manifest.slug}-official-variants.ts`;

  const existing =
    packageJson.scripts[scriptName];

  if (options.dryRun) {
    if (existing === scriptCommand) {
      console.log(
        "WOULD KEEP: package.json script",
      );
    } else {
      console.log(
        "WOULD UPDATE: package.json script",
      );
    }

    return;
  }

  if (
    existing &&
    existing !== scriptCommand &&
    !options.force
  ) {
    throw new Error(
      `package.json already contains "${scriptName}" with a different command. Use --force to replace it.`,
    );
  }

  if (existing === scriptCommand) {
    console.log(
      "UNCHANGED: package.json script",
    );

    return;
  }

  packageJson.scripts[scriptName] =
    scriptCommand;

  await writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );

  console.log(
    "UPDATED: package.json",
  );
}

async function main() {
  const options = parseOptions();

  const projectRoot = findProjectRoot(
    process.cwd(),
  );

  const manifest = await loadManifest(
    projectRoot,
    options.brandSlug,
  );

  const files = buildGeneratedFiles(
    projectRoot,
    manifest,
  );

  console.log(
    `\nZ Mobility Complete Brand Generator`,
  );

  console.log(
    `Brand  : ${manifest.displayName}`,
  );

  console.log(
    `Models : ${manifest.models.length}`,
  );

  console.log(
    `Mode   : ${
      options.dryRun
        ? "DRY RUN"
        : "WRITE"
    }\n`,
  );

  await writeGeneratedFiles(
    files,
    options,
  );

  await updatePackageJson(
    projectRoot,
    manifest,
    options,
  );

  console.log("\nNext steps:\n");

  console.log(
    `1. Review the generated ${manifest.displayName} model folders.`,
  );

  console.log(
    `2. Execute scripts/automotive/sql/insert-${manifest.slug}-source.sql in Supabase.`,
  );

  console.log(
    "3. Populate each default.ts with verified official records.",
  );

  console.log(
    "4. Run npx tsc --noEmit.",
  );

  console.log(
    `5. Run npm run automotive:sync:${manifest.slug}-variants.`,
  );
}

main().catch((error) => {
  console.error(
    "\nComplete brand generator failed",
  );

  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exit(1);
});