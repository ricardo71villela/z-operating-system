import { SEATOfficialVariantsAdapter } from
  "../adapters/seat/SEATOfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting SEAT official variants staging sync...",
  );

  const importer = new BaseImporter();
  const adapter = new SEATOfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\nSEAT official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\nNo SEAT records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\nSEAT official variants staging sync failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});
