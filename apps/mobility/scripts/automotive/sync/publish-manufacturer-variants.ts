import { ManufacturerVariantsPublisher } from
  "../publish/ManufacturerVariantsPublisher";

function getMode(): "dry_run" | "apply" {
  return process.argv.includes("--apply")
    ? "apply"
    : "dry_run";
}

async function main() {
  const mode = getMode();

  console.log(
    `Starting manufacturer variants publisher (${mode})...`,
  );

  const publisher =
    new ManufacturerVariantsPublisher();

  const summary = await publisher.publish(
    [
      "porsche_newsroom",
      "bmw_pressclub",
      "mercedes_media",
    ],
    mode,
  );

  console.log(
    "\nManufacturer variants publisher completed",
  );

  console.log(summary);

  if (mode === "dry_run") {
    console.log(
      "\nDry run only. No Master Database records were changed.",
    );
  }
}

main().catch((error) => {
  console.error(
    "\nManufacturer variants publisher failed",
  );

  console.error(
    error instanceof Error ? error.message : error,
  );

  process.exit(1);
});