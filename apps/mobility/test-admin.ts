import { supabaseAdmin } from "./scripts/automotive/supabase-admin";

async function main() {
  console.log("Testing Supabase connection...\n");

  const { data, error } = await supabaseAdmin
    .from("automotive_data_sources")
    .select("id, code, name")
    .eq("code", "volkswagen_media");

  if (error) {
    console.error("❌ Query error:");
    console.error(error);
    process.exit(1);
  }

  console.log("✅ Query succeeded.");
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});