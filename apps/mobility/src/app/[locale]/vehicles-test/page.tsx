import { getVehicles } from "@/services/vehicles";

export default async function VehiclesTestPage() {
  const vehicles = await getVehicles();

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "120px 32px 40px",
        background: "#080909",
        color: "#fff",
      }}
    >
      <h1>Supabase vehicles test</h1>

      <p>{vehicles.length} vehicles loaded</p>

      <pre
        style={{
          marginTop: 24,
          padding: 20,
          overflowX: "auto",
          border: "1px solid rgba(255,255,255,.15)",
          borderRadius: 12,
          background: "rgba(255,255,255,.04)",
        }}
      >
        {JSON.stringify(vehicles, null, 2)}
      </pre>
    </main>
  );
}