"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  eventId: string;
  tenantId: string;
  apiUrl: string;
  labels: { confirm: string; confirming: string; reject: string; rejecting: string; error: string };
}

/**
 * Per ADR-0001, this is the ONLY place in the product where an
 * ai_suggested draft event becomes real — a human click, nothing
 * automatic. Confirming triggers the calendar push (see
 * EventsController.confirm on the backend); rejecting just cancels it.
 */
export function DraftEventActions({ eventId, tenantId, apiUrl, labels }: Props) {
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
      if (!res.ok) throw new Error(labels.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.error);
    } finally {
      setPending(null);
    }
  }

  return (
    <span>
      <button onClick={() => act("confirm")} disabled={pending !== null}>
        {pending === "confirm" ? labels.confirming : labels.confirm}
      </button>{" "}
      <button onClick={() => act("reject")} disabled={pending !== null}>
        {pending === "reject" ? labels.rejecting : labels.reject}
      </button>
      {error && <span role="alert"> {error}</span>}
    </span>
  );
}
