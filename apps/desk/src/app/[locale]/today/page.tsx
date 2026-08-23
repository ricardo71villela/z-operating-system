import { getTranslations, setRequestLocale } from "next-intl/server";
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

export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Today");

  const data = await getTodayData();
  const apiUrl = process.env.NEXT_PUBLIC_DESK_API_URL ?? "";
  const tenantId = process.env.NEXT_PUBLIC_DESK_DEV_TENANT_ID ?? "";

  if (!data) {
    return (
      <main>
        <h1>{t("title")}</h1>
        <p>{t("backendMissing")}</p>
      </main>
    );
  }

  const { pendingMessages, draftEvents, confirmedEventsToday } = data;

  return (
    <main>
      <h1>{t("title")}</h1>

      <section>
        <h2>{t("confirmedAgenda")}</h2>
        {confirmedEventsToday.length === 0 && <p>{t("noConfirmedEvents")}</p>}
        <ul>
          {confirmedEventsToday.map((event) => (
            <li key={event.id}>
              {event.title} — {new Date(event.starts_at).toLocaleTimeString(locale)}
              {event.event_type === "follow_up_block" ? ` (${t("followUpBlock")})` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t("pendingSuggestions")}</h2>
        {draftEvents.length === 0 && <p>{t("noPendingSuggestions")}</p>}
        <ul>
          {draftEvents.map((event) => (
            <li key={event.id}>
              {event.title} — {new Date(event.starts_at).toLocaleString(locale)}
              {event.confidence_score !== null &&
                ` (${t("confidence")}: ${Math.round(event.confidence_score * 100)}%)`}{" "}
              <DraftEventActions
                eventId={event.id}
                tenantId={tenantId}
                apiUrl={apiUrl}
                labels={{
                  confirm: t("confirm"),
                  confirming: t("confirming"),
                  reject: t("reject"),
                  rejecting: t("rejecting"),
                  error: t("genericError"),
                }}
              />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t("pendingMessages")}</h2>
        {pendingMessages.length === 0 && <p>{t("noPendingMessages")}</p>}
        <ul>
          {pendingMessages.map((message) => (
            <li key={message.id}>
              <strong>[{message.state}]</strong>{" "}
              {message.ai_summary || message.body}{" "}
              {message.state !== "resolved" && (
                <ResolveMessageAction
                  messageId={message.id}
                  tenantId={tenantId}
                  apiUrl={apiUrl}
                  labels={{ resolve: t("resolve"), resolving: t("resolving"), error: t("genericError") }}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
