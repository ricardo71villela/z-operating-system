"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  messageId: string;
  tenantId: string;
  apiUrl: string;
  labels: { resolve: string; resolving: string; error: string };
}

export function ResolveMessageAction({ messageId, tenantId, apiUrl, labels }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/messages/${messageId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (!res.ok) throw new Error(labels.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <span>
      <button onClick={resolve} disabled={pending}>
        {pending ? labels.resolving : labels.resolve}
      </button>
      {error && <span role="alert"> {error}</span>}
    </span>
  );
}
