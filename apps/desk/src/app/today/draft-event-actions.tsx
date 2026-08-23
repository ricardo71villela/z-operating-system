"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  eventId: string;
  tenantId: string;
  apiUrl: string;
}

/**
 * Per ADR-0001, this is the ONLY place in the product where an
 * ai_suggested draft event becomes real — a human click, nothing
 * automatic. Confirming triggers the calendar push (see
 * EventsController.confirm on the backend); rejecting just cancels it.
 */
export function DraftEventActions({ eventId, tenantId, apiUrl }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<"confirm" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "confirm" | "reject") {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/events/${eventId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (!res.ok) throw new Error(`Falha ao ${action === "confirm" ? "confirmar" : "rejeitar"} (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setPending(null);
    }
  }

  return (
    <span>
      <button onClick={() => act("confirm")} disabled={pending !== null}>
        {pending === "confirm" ? "A confirmar…" : "Confirmar"}
      </button>{" "}
      <button onClick={() => act("reject")} disabled={pending !== null}>
        {pending === "reject" ? "A rejeitar…" : "Rejeitar"}
      </button>
      {error && <span role="alert"> {error}</span>}
    </span>
  );
}
