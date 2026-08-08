import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

type Options = {
  slug: string;
  displayName: string;
  legalName: string;
  countryCode: string;
  sourceCode: string;
  sourceName: string;
  websiteUrl: string;
  dataFile: string;
  exportName: string;
  dryRun: boolean;
  force: boolean;
  updatePackage: boolean;
};

const HELP = `
Z Mobility — Create Manufacturer

Usage:
  npm run automotive:create-manufacturer -- <slug> [options]

Required:
  <slug>                         Manufacturer folder/command slug, e.g. audi
  --display-name <name>          Brand display name, e.g. Audi
  --legal-name <name>            Legal manufacturer name, e.g. Audi AG
  --country <ISO2>               Country code, e.g. DE
  --source-code <code>           Source code, e.g. audi_media
  --source-name <name>           Source display name, e.g. Audi MediaCenter
  --website <url>                Official source website
  --data-file <slug>             First data file, e.g. a6-c9
  --export-name <identifier>     Exported array name, e.g. audiA6C9OfficialVariants

Optional:
  --dry-run                      Show the plan without writing files
  --force                        Overwrite generated files if they already exist
  --update-package               Automatically add the sync script to package.json
  --help                         Show this help

Example:
  npm run automotive:create-manufacturer -- audi \\
    --display-name "Audi" \\
    --legal-name "Audi AG" \\
    --country DE \\
    --source-code audi_media \\
    --source-name "Audi MediaCenter" \\
    --website "https://www.audi-mediacenter.com" \\
    --data-file a6-c9 \\
    --export-name audiA6C9OfficialVariants \\
    --dry-run
`;

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function requireValue(
  args: string[],
  flag: string,
  label: string,
): string {
  const value = getFlagValue(args, flag);
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing ${label}. Use ${flag} <value>.`);
  }
  return value;
}

function toPascalCase(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function assertSlug(value: string, label: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(
      `${label} must use lowercase kebab-case (example: aston-martin).`,
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

function assertCountryCode(value: string): void {
  if (!/^[A-Z]{2}$/.test(value)) {
    throw new Error("--country must be a two-letter uppercase code, e.g. DE.");
  }
}

function assertWebsite(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--website must be a valid absolute URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("--website must use http or https.");
  }
}

function parseOptions(): Options {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const slug = args.find((arg) => !arg.startsWith("--"));
  if (!slug) {
    throw new Error("Missing manufacturer slug.");
  }

  const options: Options = {
    slug,
    displayName: requireValue(args, "--display-name", "display name"),
    legalName: requireValue(args, "--legal-name", "legal name"),
    countryCode: requireValue(args, "--country", "country code"),
    sourceCode: requireValue(args, "--source-code", "source code"),
    sourceName: requireValue(args, "--source-name", "source name"),
    websiteUrl: requireValue(args, "--website", "official website"),
    dataFile: requireValue(args, "--data-file", "data file slug"),
    exportName: requireValue(args, "--export-name", "export name"),
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    updatePackage: args.includes("--update-package"),
  };

  assertSlug(options.slug, "Manufacturer slug");
  assertSlug(options.dataFile, "Data file slug");
  assertIdentifier(options.exportName);
  assertCountryCode(options.countryCode);
  assertWebsite(options.websiteUrl);

  return options;
}

function findProjectRoot(startDirectory: string): string {
  let current = path.resolve(startDirectory);

  while (true) {
    const packageJson = path.join(current, "package.json");
    const automotiveRoot = path.join(current, "scripts", "automotive");

    if (existsSync(packageJson) && existsSync(automotiveRoot)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        "Unable to find project root containing package.json and scripts/automotive.",
      );
    }

    current = parent;
  }
}

function createAdapter(options: Options): string {
  const classPrefix = toPascalCase(options.displayName);

  return `import { ManufacturerOfficialAdapter } from
  "../manufacturer/ManufacturerOfficialAdapter";

import type {
  ManufacturerAdapterConfig,
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  ${options.exportName},
} from "../../data/${options.slug}/${options.dataFile}";

export class ${classPrefix}OfficialVariantsAdapter
  extends ManufacturerOfficialAdapter {
  readonly config: ManufacturerAdapterConfig = {
    sourceCode: "${options.sourceCode}",
    manufacturerName: "${options.legalName}",
    brandName: "${options.displayName}",
    countryCode: "${options.countryCode}",
    entityType: "variant",
  };

  protected getOfficialRecords():
    ManufacturerOfficialRecord[] {
    return ${options.exportName};
  }
}
`;
}

function createDataIndex(options: Options): string {
  const defaultExportName = options.exportName.replace(
    /OfficialVariants$/,
    "DefaultOfficialVariants",
  );

  return `import {
  ${defaultExportName},
} from "./default";

export const ${options.exportName} = [
  ...${defaultExportName},
];
`;
}

function createBodyStyleFile(options: Options): string {
  const defaultExportName = options.exportName.replace(
    /OfficialVariants$/,
    "DefaultOfficialVariants",
  );

  return `import type {
  ManufacturerOfficialRecord,
  } from "../../../core/manufacturer-types";

  export const ${defaultExportName}: ManufacturerOfficialRecord[] = [
    // Add official ${options.displayName} variants for this model/generation.
  ];
`;
}

function createSync(options: Options): string {
  const classPrefix = toPascalCase(options.displayName);

  return `import { ${classPrefix}OfficialVariantsAdapter } from
  "../adapters/${options.slug}/${classPrefix}OfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting ${options.displayName} official variants staging sync...",
  );

  const importer = new BaseImporter();
  const adapter = new ${classPrefix}OfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\\n${options.displayName} official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\\nNo ${options.displayName} records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\\n${options.displayName} official variants staging sync failed",
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

function createSourceSql(options: Options): string {
  return `insert into public.automotive_data_sources (
  code,
  name,
  website_url,
  source_type,
  priority,
  active
)
values (
  '${options.sourceCode.replaceAll("'", "''")}',
  '${options.sourceName.replaceAll("'", "''")}',
  '${options.websiteUrl.replaceAll("'", "''")}',
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

type GeneratedFile = {
  absolutePath: string;
  relativePath: string;
  content: string;
};

type PackageJsonShape = {
  scripts?: Record<string, string>;
  [key: string]: unknown;
};

async function writeGeneratedFiles(
  files: GeneratedFile[],
  options: Options,
): Promise<void> {
  // Em dry-run nunca escrevemos nem verificamos colisões.
  // O objetivo é apenas mostrar o que seria gerado.
  if (options.dryRun) {
    return;
  }

  const collisions = files.filter((file) => existsSync(file.absolutePath));

  if (collisions.length > 0 && !options.force) {
    const paths = collisions
      .map((file) => `- ${file.relativePath}`)
      .join("\n");

    throw new Error(
      `Refusing to overwrite existing files:\n${paths}\nUse --force only after reviewing them.`,
    );
  }

  for (const file of files) {
    await mkdir(path.dirname(file.absolutePath), { recursive: true });
    await writeFile(file.absolutePath, file.content, "utf8");
  }
}

async function updatePackageJson(
  projectRoot: string,
  options: Options,
): Promise<"added" | "already_exists"> {
  const packageJsonPath = path.join(
    projectRoot,
    "package.json",
  );

  const rawPackageJson = await readFile(
    packageJsonPath,
    "utf8",
  );

  const packageJson = JSON.parse(
    rawPackageJson,
  ) as PackageJsonShape;

  packageJson.scripts ??= {};

  const scriptName =
    `automotive:sync:${options.slug}-variants`;

  const scriptCommand =
    `tsx scripts/automotive/sync/sync-${options.slug}-official-variants.ts`;

  const existingCommand =
    packageJson.scripts[scriptName];

  if (existingCommand === scriptCommand) {
    return "already_exists";
  }

  if (existingCommand && !options.force) {
    throw new Error(
      `package.json already contains "${scriptName}" with a different command. Use --force to replace it.`,
    );
  }

  packageJson.scripts[scriptName] = scriptCommand;

  await writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );

  return "added";
}

async function main() {
  const options = parseOptions();
  const projectRoot = findProjectRoot(process.cwd());
  const automotiveRoot = path.join(projectRoot, "scripts", "automotive");
  const classPrefix = toPascalCase(options.displayName);

  const relativeFiles = [
    `scripts/automotive/adapters/${options.slug}/${classPrefix}OfficialVariantsAdapter.ts`,
    `scripts/automotive/data/${options.slug}/${options.dataFile}/index.ts`,
    `scripts/automotive/data/${options.slug}/${options.dataFile}/default.ts`,
    `scripts/automotive/sync/sync-${options.slug}-official-variants.ts`,
    `scripts/automotive/sql/insert-${options.slug}-source.sql`,
  ];

  const files: GeneratedFile[] = [
    {
      relativePath: relativeFiles[0],
      absolutePath: path.join(
        automotiveRoot,
        "adapters",
        options.slug,
        `${classPrefix}OfficialVariantsAdapter.ts`,
      ),
      content: createAdapter(options),
    },
    {
      relativePath: relativeFiles[1],
      absolutePath: path.join(
        automotiveRoot,
        "data",
        options.slug,
        options.dataFile,
        "index.ts",
      ),
      content: createDataIndex(options),
    },
    {
      relativePath: relativeFiles[2],
      absolutePath: path.join(
        automotiveRoot,
        "data",
        options.slug,
        options.dataFile,
        "default.ts",
      ),
      content: createBodyStyleFile(options),
    },
    {
      relativePath: relativeFiles[3],
      absolutePath: path.join(
        automotiveRoot,
        "sync",
        `sync-${options.slug}-official-variants.ts`,
      ),
      content: createSync(options),
    },
    {
      relativePath: relativeFiles[4],
      absolutePath: path.join(
        automotiveRoot,
        "sql",
        `insert-${options.slug}-source.sql`,
      ),
      content: createSourceSql(options),
    },
  ];

  await writeGeneratedFiles(files, options);

  let packageUpdateResult:
    | "added"
    | "already_exists"
    | undefined;

  if (options.updatePackage && !options.dryRun) {
    packageUpdateResult = await updatePackageJson(
      projectRoot,
      options,
    );
  }

  const mode = options.dryRun ? "DRY RUN" : "CREATED";
  console.log(`\nZ Mobility Manufacturer Generator — ${mode}\n`);
  console.log(`Manufacturer : ${options.displayName}`);
  console.log(`Legal name   : ${options.legalName}`);
  console.log(`Country      : ${options.countryCode}`);
  console.log(`Source code  : ${options.sourceCode}\n`);

  for (const file of files) {
    console.log(
      `${options.dryRun ? "WOULD CREATE" : "CREATED"}: ${file.relativePath}`,
    );
  }

  if (options.updatePackage && options.dryRun) {
    console.log("WOULD UPDATE: package.json");
  } else if (packageUpdateResult === "added") {
    console.log("UPDATED: package.json");
  } else if (packageUpdateResult === "already_exists") {
    console.log(
      "UNCHANGED: package.json script already exists",
    );
  }

  const packageScript =
    `"automotive:sync:${options.slug}-variants": ` +
    `"tsx scripts/automotive/sync/sync-${options.slug}-official-variants.ts"`;

  console.log("\nManual next steps:\n");

  let step = 1;

  if (!options.updatePackage) {
    console.log(
      `${step}. Add to package.json scripts:\n   ${packageScript}`,
    );
    step += 1;
  }

  console.log(
    `${step}. Execute scripts/automotive/sql/insert-${options.slug}-source.sql in Supabase.`,
  );
  step += 1;

  console.log(
    `${step}. Populate scripts/automotive/data/${options.slug}/${options.dataFile}/default.ts with verified official records.`,
  );
  step += 1;

  console.log(`${step}. Run npx tsc --noEmit.`);
  step += 1;

  console.log(
    `${step}. Run npm run automotive:sync:${options.slug}-variants.`,
  );
}

main().catch((error) => {
  console.error("\nManufacturer generator failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});