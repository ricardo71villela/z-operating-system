import { GoldenSourcesBuilder } from
  "../golden/GoldenSourcesBuilder";

async function main() {
  console.log(
    "Starting Golden Sources Builder...",
  );

  const builder = new GoldenSourcesBuilder();

  const summary =
    await builder.buildVariantSources();

  console.log(
    "\nGolden Sources Builder completed",
  );

  console.log(summary);
}

main().catch((error) => {
  console.error(
    "\nGolden Sources Builder failed",
  );

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});