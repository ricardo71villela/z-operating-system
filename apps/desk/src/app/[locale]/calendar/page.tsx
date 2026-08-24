import { getTranslations, setRequestLocale } from "next-intl/server";
import { deskApiFetch } from "@/lib/desk-api";
import { DraftEventActions } from '../today/draft-event-actions';
import { CreateEventForm } from './create-event-form';

interface DeskEvent { id: string; title: string; starts_at: string; ends_at: string; source: "manual" | "ai_suggested" | "external_sync"; status: "draft" | "confirmed" | "cancelled"; event_type: "meeting" | "follow_up_block"; confidence_score: number | null; }
function mondayOf(d: Date): Date { const date = new Date(d); const day = date.getDay(); const diff = day === 0 ? -6 : 1 - day; date.setDate(date.getDate() + diff); date.setHours(0, 0, 0, 0); return date; }
async function getWeekEvents(weekStart: Date): Promise<DeskEvent[] | null> { const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23, 59, 59, 999); const res = await deskApiFetch(`events?start=${encodeURIComponent(weekStart.toISOString())}&end=${encodeURIComponent(weekEnd.toISOString())}`); return res?.ok ? res.json() : null; }

export default async function CalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; setRequestLocale(locale); const t = await getTranslations("Calendar");
  const weekStart = mondayOf(new Date()); const events = await getWeekEvents(weekStart);
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  return <main id="desk-main"><h1>{t("title")}</h1><p>{t("weekOf")} {weekStart.toLocaleDateString(locale)}</p>
    <CreateEventForm labels={{ newEvent: t('newEvent'), title: t('eventTitle'), starts: t('starts'), ends: t('ends'), meeting: t('meeting'), followUp: t('followUp'), create: t('create'), creating: t('creating'), error: t('genericError') }} />
    {events === null ? <p className="notice error">{t("noEvents")}</p> : <div className="calendar-grid" role="grid" aria-label={t('title')}>
      {weekDays.map((day) => { const dayEvents = events.filter((event) => new Date(event.starts_at).toDateString() === day.toDateString()); return <section className="calendar-day" key={day.toISOString()} role="gridcell"><div className="calendar-day-header">{day.toLocaleDateString(locale, { weekday: "short", day: "numeric" })}</div>{dayEvents.length === 0 && <div className="empty-state">—</div>}{dayEvents.map((event) => <article className="calendar-event" key={event.id}><span className={`badge ${event.source === 'external_sync' ? 'green' : event.status === 'draft' ? 'gold' : ''}`}>{event.source === "external_sync" ? t("external") : event.status === "confirmed" ? t("confirmed") : t("suggested")}</span><strong>{event.title}</strong><div>{new Date(event.starts_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}–{new Date(event.ends_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</div>{event.confidence_score !== null && <div className="list-meta">{t("confidence")}: {Math.round(event.confidence_score * 100)}%</div>}{event.status === 'draft' && event.source !== 'external_sync' && <div className="action-row"><DraftEventActions eventId={event.id} labels={{ confirm: t('confirm'), confirming: t('confirming'), reject: t('reject'), rejecting: t('rejecting'), error: t('genericError') }} /></div>}</article>)}</section>; })}
    </div>}
  </main>;
}
