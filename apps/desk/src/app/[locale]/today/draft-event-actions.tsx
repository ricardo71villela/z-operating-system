"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  eventId: string;
  labels: { confirm: string; confirming: string; reject: string; rejecting: string; error: string };
}

export function DraftEventActions({ eventId, labels }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<"confirm" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "confirm" | "reject") {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/desk/events/${eventId}/${action}`, { method: "POST" });
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
