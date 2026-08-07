import "dotenv/config";
import { ReconciliationEngineV3 } from "../reconcile/ReconciliationEngineV3";

async function main() {
  const sourceCodes = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (sourceCodes.length === 0) {
    throw new Error(
      "Provide at least one source code, e.g. npm run automotive:reconcile:versions -- bmw_pressclub",
    );
  }

  const summary = await new ReconciliationEngineV3()
    .reconcilePendingManufacturerVersions(sourceCodes);
  console.log(summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
