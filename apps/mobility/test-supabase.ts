import { supabaseAdmin } from "./scripts/automotive/supabase-admin";

async function main() {
  const { data, error } = await supabaseAdmin
    .from("automotive_staging_records")
    .select("id")
    .limit(1);

  console.log({ data, error });
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});