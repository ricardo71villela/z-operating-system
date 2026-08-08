import { PorscheOfficialVariantsAdapter } from
  "../adapters/porsche/PorscheOfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting Porsche official variants staging sync...",
  );

  const importer = new BaseImporter();
  const adapter =
    new PorscheOfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\nPorsche official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\nNo Porsche records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\nPorsche official variants staging sync failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});