import { VolkswagenOfficialVariantsAdapter } from
  "../adapters/volkswagen/VolkswagenOfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting Volkswagen official variants staging sync...",
  );

  const importer = new BaseImporter();
  const adapter = new VolkswagenOfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\nVolkswagen official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\nNo Volkswagen records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\nVolkswagen official variants staging sync failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});
