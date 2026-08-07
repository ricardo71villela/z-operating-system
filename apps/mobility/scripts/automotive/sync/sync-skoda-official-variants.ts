import { SkodaOfficialVariantsAdapter } from
  "../adapters/skoda/SkodaOfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting Škoda official variants staging sync...",
  );

  const importer = new BaseImporter();
  const adapter = new SkodaOfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\nŠkoda official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\nNo Škoda records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\nŠkoda official variants staging sync failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});
