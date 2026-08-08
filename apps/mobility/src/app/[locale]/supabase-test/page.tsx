import { createClient } from "@/lib/supabase/server";

export default async function SupabaseTestPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vehicles")
    .select("id, slug, brand, model, status")
    .limit(5);

  return (
    <main style={{ padding: "120px 32px 40px" }}>
      <h1>Supabase connection test</h1>

      <pre
        style={{
          marginTop: 24,
          padding: 20,
          overflowX: "auto",
          border: "1px solid #ddd",
          borderRadius: 8,
        }}
      >
        {JSON.stringify({ data, error }, null, 2)}
      </pre>
    </main>
  );
}