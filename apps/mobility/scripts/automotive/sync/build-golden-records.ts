import { GoldenRecordEngine } from
  "../golden/GoldenRecordEngine";

async function main() {
  console.log(
    "Starting Golden Record Builder...",
  );

  const engine = new GoldenRecordEngine();

  const summary =
    await engine.buildVariantGoldenRecords();

  console.log(
    "\nGolden Record Builder completed",
  );

  console.log(summary);
}

main().catch((error) => {
  console.error(
    "\nGolden Record Builder failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});