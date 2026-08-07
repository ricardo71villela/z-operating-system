import {
  AudiOfficialVariantsAdapter,
} from "../adapters/audi/AudiOfficialVariantsAdapter";

import { BaseImporter } from "../core/BaseImporter";

async function main() {
  console.log(
    "Starting Audi official variants staging sync...",
  );

  const importer = new BaseImporter();

  const adapter =
    new AudiOfficialVariantsAdapter();

  const summary = await importer.run(adapter);

  console.log(
    "\nAudi official variants staging sync completed",
  );

  console.log(summary);

  console.log(
    "\nNo Audi records were published automatically to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\nAudi official variants staging sync failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});
