import { CUPRAOfficialVariantsAdapter } from
  "../adapters/cupra/CUPRAOfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting CUPRA official variants staging sync...",
  );

  const importer = new BaseImporter();
  const adapter = new CUPRAOfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\nCUPRA official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\nNo CUPRA records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\nCUPRA official variants staging sync failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});
