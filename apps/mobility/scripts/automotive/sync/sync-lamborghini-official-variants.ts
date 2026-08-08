import { LamborghiniOfficialVariantsAdapter } from
  "../adapters/lamborghini/LamborghiniOfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting Lamborghini official variants staging sync...",
  );

  const importer = new BaseImporter();
  const adapter = new LamborghiniOfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\nLamborghini official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\nNo Lamborghini records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\nLamborghini official variants staging sync failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});
