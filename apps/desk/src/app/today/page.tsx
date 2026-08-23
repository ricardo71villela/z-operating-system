import { DraftEventActions } from "./draft-event-actions";
import { ResolveMessageAction } from "./resolve-message-action";

interface PendingMessage {
  id: string;
  thread_id: string;
  body: string;
  ai_summary: string | null;
  state: string;
  received_at: string;
}

interface DraftEvent {
  id: string;
  thread_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  event_type: "meeting" | "follow_up_block";
  confidence_score: number | null;
}

interface ConfirmedEvent {
  id: string;
  thread_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  event_type: "meeting" | "follow_up_block";
}

interface TodayResponse {
  pendingMessages: PendingMessage[];
  draftEvents: DraftEvent[];
  confirmedEventsToday: ConfirmedEvent[];
}

// TODO(auth): tenantId virá da sessão autenticada assim que desk_users
// estiver ligado ao Supabase auth (ver POST /auth/bootstrap-tenant). Por
// agora é lido de uma env var só para a fundação ser navegável localmente.
async function getTodayData(): Promise<TodayResponse | null> {
  const apiUrl = process.env.NEXT_PUBLIC_DESK_API_URL;
  const tenantId = process.env.NEXT_PUBLIC_DESK_DEV_TENANT_ID;

  if (!apiUrl || !tenantId) return null;

  const res = await fetch(`${apiUrl}/today?tenantId=${tenantId}`, {
    cache: "no-store",
  });

  if (!res.ok) return null;
  return res.json();
}

export default async function TodayPage() {
  const data = await getTodayData();
  const apiUrl = process.env.NEXT_PUBLIC_DESK_API_URL ?? "";
  const tenantId = process.env.NEXT_PUBLIC_DESK_DEV_TENANT_ID ?? "";

  if (!data) {
    return (
      <main>
        <h1>Hoje</h1>
        <p>
          Backend ainda não configurado (NEXT_PUBLIC_DESK_API_URL /
          NEXT_PUBLIC_DESK_DEV_TENANT_ID em falta).
        </p>
      </main>
    );
  }

  const { pendingMessages, draftEvents, confirmedEventsToday } = data;

  return (
    <main>
      <h1>Hoje</h1>

      <section>
        <h2>Agenda de hoje</h2>
        {confirmedEventsToday.length === 0 && <p>Sem eventos confirmados hoje.</p>}
        <ul>
          {confirmedEventsToday.map((event) => (
            <li key={event.id}>
              {event.title} — {new Date(event.starts_at).toLocaleTimeString("pt-PT")}
              {event.event_type === "follow_up_block" ? " (bloco de follow-up)" : ""}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Sugestões da IA por confirmar</h2>
        {draftEvents.length === 0 && <p>Sem sugestões pendentes.</p>}
        <ul>
          {draftEvents.map((event) => (
            <li key={event.id}>
              {event.title} — {new Date(event.starts_at).toLocaleString("pt-PT")}
              {event.confidence_score !== null &&
                ` (confiança: ${Math.round(event.confidence_score * 100)}%)`}{" "}
              <DraftEventActions eventId={event.id} tenantId={tenantId} apiUrl={apiUrl} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Mensagens por decidir</h2>
        {pendingMessages.length === 0 && <p>Nada pendente.</p>}
        <ul>
          {pendingMessages.map((message) => (
            <li key={message.id}>
              <strong>[{message.state}]</strong>{" "}
              {message.ai_summary || message.body}{" "}
              {message.state !== "resolved" && (
                <ResolveMessageAction messageId={message.id} tenantId={tenantId} apiUrl={apiUrl} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
