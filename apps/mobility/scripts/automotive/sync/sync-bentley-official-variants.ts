import { BentleyOfficialVariantsAdapter } from
  "../adapters/bentley/BentleyOfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting Bentley official variants staging sync...",
  );

  const importer = new BaseImporter();
  const adapter = new BentleyOfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\nBentley official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\nNo Bentley records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\nBentley official variants staging sync failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});
