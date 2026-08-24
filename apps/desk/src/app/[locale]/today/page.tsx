import { getTranslations, setRequestLocale } from "next-intl/server";
import { DraftEventActions } from "./draft-event-actions";
import { ResolveMessageAction } from "./resolve-message-action";
import { MessageActionMenu } from "./message-action-menu";
import { deskApiFetch } from "@/lib/desk-api";

interface PendingMessage { id: string; thread_id: string; body: string; ai_summary: string | null; state: string; received_at: string; }
interface DraftEvent { id: string; thread_id: string | null; title: string; starts_at: string; ends_at: string; event_type: "meeting" | "follow_up_block"; confidence_score: number | null; }
interface ConfirmedEvent { id: string; thread_id: string | null; title: string; starts_at: string; ends_at: string; event_type: "meeting" | "follow_up_block"; }
interface TodayResponse { pendingMessages: PendingMessage[]; draftEvents: DraftEvent[]; confirmedEventsToday: ConfirmedEvent[]; }

async function getTodayData(): Promise<TodayResponse | null> {
  const res = await deskApiFetch("today");
  if (!res?.ok) return null;
  return res.json();
}

export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Today");
  const data = await getTodayData();

  if (!data) return <main><h1>{t("title")}</h1><p className="notice error">{t("backendMissing")}</p></main>;
  const { pendingMessages, draftEvents, confirmedEventsToday } = data;

  return (
    <main id="desk-main">
      <h1>{t("title")}</h1>
      <p>{t("subtitle")}</p>
      <div className="dashboard-grid">
        <section className="panel span-4">
          <div className="panel-header"><h2>{t("confirmedAgenda")}</h2><span className="count-badge">{confirmedEventsToday.length}</span></div>
          {confirmedEventsToday.length === 0 ? <div className="empty-state">{t("noConfirmedEvents")}</div> : (
            <ul className="clean-list">{confirmedEventsToday.map((event) => <li className="list-card" key={event.id}><span className="badge green">{event.event_type === "follow_up_block" ? t("followUpBlock") : t("meeting")}</span><strong>{event.title}</strong><div className="list-meta">{new Date(event.starts_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</div></li>)}</ul>
          )}
        </section>

        <section className="panel span-4">
          <div className="panel-header"><h2>{t("pendingSuggestions")}</h2><span className="count-badge">{draftEvents.length}</span></div>
          {draftEvents.length === 0 ? <div className="empty-state">{t("noPendingSuggestions")}</div> : (
            <ul className="clean-list">{draftEvents.map((event) => <li className="list-card" key={event.id}><span className="badge gold">AI · {event.confidence_score !== null ? `${Math.round(event.confidence_score * 100)}%` : '—'}</span><strong>{event.title}</strong><div className="list-meta">{new Date(event.starts_at).toLocaleString(locale)}</div><div className="action-row"><DraftEventActions eventId={event.id} labels={{ confirm: t("confirm"), confirming: t("confirming"), reject: t("reject"), rejecting: t("rejecting"), error: t("genericError") }} /></div></li>)}</ul>
          )}
        </section>

        <section className="panel span-4">
          <div className="panel-header"><h2>{t("pendingMessages")}</h2><span className="count-badge">{pendingMessages.length}</span></div>
          {pendingMessages.length === 0 ? <div className="empty-state">{t("noPendingMessages")}</div> : (
            <ul className="clean-list">{pendingMessages.slice(0, 8).map((message) => {
              const summary = message.ai_summary || message.body;
              return <li className="list-card" key={message.id}><span className={`badge ${message.state === 'action_pending' ? 'gold' : ''}`}>{message.state.replaceAll('_', ' ')}</span><strong>{summary}</strong><div className="list-meta">{new Date(message.received_at).toLocaleString(locale)}</div><div className="action-row"><MessageActionMenu messageId={message.id} defaultTitle={summary} labels={{ createAction: t("createAction"), task: t("task"), meeting: t("meeting"), followUp: t("followUp"), title: t("actionTitle"), due: t("due"), starts: t("starts"), ends: t("ends"), creating: t("creating"), created: t("created"), error: t("genericError") }} />{message.state !== "resolved" && <ResolveMessageAction messageId={message.id} labels={{ resolve: t("resolve"), resolving: t("resolving"), error: t("genericError") }} />}</div></li>;
            })}</ul>
          )}
          <div className="panel-footer"><a href={`/${locale}/inbox`}>{t("openInbox")} →</a></div>
        </section>
      </div>
    </main>
  );
}
