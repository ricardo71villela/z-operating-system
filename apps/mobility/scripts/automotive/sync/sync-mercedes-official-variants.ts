import { MercedesOfficialVariantsAdapter } from
  "../adapters/mercedes/MercedesOfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting Mercedes-Benz official variants staging sync...",
  );

  const importer = new BaseImporter();
  const adapter = new MercedesOfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\nMercedes-Benz official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\nNo Mercedes-Benz records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\nMercedes-Benz official variants staging sync failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});
