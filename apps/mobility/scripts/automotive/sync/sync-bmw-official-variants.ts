import { BmwOfficialVariantsAdapter } from
  "../adapters/bmw/BmwOfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting BMW official variants staging sync...",
  );

  const importer = new BaseImporter();
  const adapter = new BmwOfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\nBMW official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\nNo BMW records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\nBMW official variants staging sync failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});