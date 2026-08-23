"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  messageId: string;
  tenantId: string;
  apiUrl: string;
}

/**
 * Advances a message's state to 'resolved'. There is deliberately no
 * client-side call to Supabase here — writes go through the backend so
 * the same tenant-scoping/service-role boundary applies as everywhere
 * else (see today/page.tsx comment on why RLS + direct client reads
 * aren't wired in yet for this view).
 */
export function ResolveMessageAction({ messageId, tenantId, apiUrl }: Props) {
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
      if (!res.ok) throw new Error(`Falha ao marcar como resolvida (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setPending(false);
    }
  }

  return (
    <span>
      <button onClick={resolve} disabled={pending}>
        {pending ? "A marcar…" : "Marcar resolvida"}
      </button>
      {error && <span role="alert"> {error}</span>}
    </span>
  );
}
