export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 600 }}>Z Intelligence</h1>
      <p style={{ opacity: 0.7, maxWidth: 480 }}>
        Scaffold stage. No product functionality yet — see README.md for
        scope and status.
      </p>
    </main>
  );
}
