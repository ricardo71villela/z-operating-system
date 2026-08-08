import { ReconciliationEngineV2 } from
  "../reconcile/ReconciliationEngineV2";

async function main() {
  console.log(
    "Starting manufacturer variants reconciliation...",
  );

  const engine = new ReconciliationEngineV2();

  const summary =
    await engine.reconcilePendingManufacturerVariants([
      "porsche_newsroom",
      "bmw_pressclub",
      "mercedes_media",
    ]);

  console.log(
    "\nManufacturer variants reconciliation completed",
  );

  console.log(summary);

  console.log(
    "\nNo records were published to the Master Database.",
  );
}

main().catch((error) => {
  console.error(
    "\nManufacturer variants reconciliation failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});