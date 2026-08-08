import { NhtsaMakesAdapter } from
  "../adapters/nhtsa/NhtsaMakesAdapter";
import { BaseImporter } from "../core/BaseImporter";

async function main() {
  const importer = new BaseImporter();
  const adapter = new NhtsaMakesAdapter();

  console.log("Starting NHTSA makes sync...");

  const summary = await importer.run(adapter);

  console.log("\nNHTSA makes sync completed");
  console.log(summary);
}

main().catch((error) => {
  console.error("\nNHTSA makes sync failed");

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});