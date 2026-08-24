import { getTranslations, setRequestLocale } from "next-intl/server";
import { deskApiFetch } from "@/lib/desk-api";
import { getCalendarCopy } from "@/lib/calendar-copy";
import { getFrancePublicHolidays, type FrancePublicHoliday } from "@/lib/france-public-holidays";
import { DraftEventActions } from '../today/draft-event-actions';
import { CreateEventForm } from './create-event-form';

interface DeskEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  source: "manual" | "ai_suggested" | "external_sync";
  status: "draft" | "confirmed" | "cancelled";
  event_type: "meeting" | "follow_up_block";
  confidence_score: number | null;
}

type CalendarView = 'week' | 'month' | 'year';

interface PersonnelDay {
  userId: string;
  date: string;
  status: 'working' | 'off' | 'absent';
  absenceType?: string;
}

interface PersonnelMonthlyMap {
  users: Array<{ id: string; displayName: string }>;
  days: Array<{ date: string; users: PersonnelDay[] }>;
}

interface CalendarAbsence {
  date: string;
  userId: string;
  displayName: string;
  type: string;
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function parseAnchor(value?: string): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  return utcDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
}

function addYears(date: Date, years: number): Date {
  return utcDate(date.getUTCFullYear() + years, 0, 1);
}

function mondayOf(date: Date): Date {
  const next = new Date(date);
  const day = next.getUTCDay();
  next.setUTCDate(next.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return utcDate(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate());
}

function monthGrid(year: number, month: number): Date[] {
  const first = utcDate(year, month, 1);
  const start = mondayOf(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function monthsBetween(start: Date, end: Date): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = [];
  let cursor = utcDate(start.getUTCFullYear(), start.getUTCMonth(), 1);
  const last = utcDate(end.getUTCFullYear(), end.getUTCMonth(), 1);
  while (cursor <= last) {
    result.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    cursor = addMonths(cursor, 1);
  }
  return result;
}

async function getEvents(start: Date, end: Date): Promise<DeskEvent[] | null> {
  const endOfRange = new Date(end);
  endOfRange.setUTCHours(23, 59, 59, 999);
  const res = await deskApiFetch(`events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(endOfRange.toISOString())}`);
  return res?.ok ? res.json() : null;
}

async function getAbsences(start: Date, end: Date): Promise<CalendarAbsence[] | null> {
  const requests = monthsBetween(start, end).map(async ({ year, month }) => {
    const res = await deskApiFetch(`personnel/monthly-map?year=${year}&month=${month}`);
    if (!res?.ok) return null;
    return res.json() as Promise<PersonnelMonthlyMap>;
  });
  const maps = await Promise.all(requests);
  if (maps.some((map) => map === null)) return null;

  const unique = new Map<string, CalendarAbsence>();
  for (const map of maps as PersonnelMonthlyMap[]) {
    const names = new Map(map.users.map((user) => [user.id, user.displayName]));
    for (const day of map.days) {
      if (day.date < iso(start) || day.date > iso(end)) continue;
      for (const user of day.users) {
        if (user.status !== 'absent') continue;
        const absence: CalendarAbsence = {
          date: day.date,
          userId: user.userId,
          displayName: names.get(user.userId) ?? 'Z Desk member',
          type: user.absenceType ?? 'other',
        };
        unique.set(`${absence.date}:${absence.userId}:${absence.type}`, absence);
      }
    }
  }
  return [...unique.values()];
}

function groupByDate<T>(values: T[], getDate: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = getDate(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

function viewHref(locale: string, view: CalendarView, date: Date): string {
  return `/${locale}/calendar?view=${view}&date=${iso(date)}`;
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Calendar");
  const copy = getCalendarCopy(locale);
  const view: CalendarView = query.view === 'month' || query.view === 'year' ? query.view : 'week';
  const anchor = parseAnchor(query.date);
  const today = parseAnchor();

  let rangeStart: Date;
  let rangeEnd: Date;
  let previousAnchor: Date;
  let nextAnchor: Date;
  let periodLabel: string;

  if (view === 'week') {
    rangeStart = mondayOf(anchor);
    rangeEnd = addDays(rangeStart, 6);
    previousAnchor = addDays(anchor, -7);
    nextAnchor = addDays(anchor, 7);
    periodLabel = `${rangeStart.toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' })} – ${rangeEnd.toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })}`;
  } else if (view === 'month') {
    const days = monthGrid(anchor.getUTCFullYear(), anchor.getUTCMonth());
    rangeStart = days[0];
    rangeEnd = days[days.length - 1];
    previousAnchor = addMonths(anchor, -1);
    nextAnchor = addMonths(anchor, 1);
    periodLabel = anchor.toLocaleDateString(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' });
  } else {
    rangeStart = utcDate(anchor.getUTCFullYear(), 0, 1);
    rangeEnd = utcDate(anchor.getUTCFullYear(), 11, 31);
    previousAnchor = addYears(anchor, -1);
    nextAnchor = addYears(anchor, 1);
    periodLabel = String(anchor.getUTCFullYear());
  }

  const [eventsResult, absencesResult] = await Promise.all([getEvents(rangeStart, rangeEnd), getAbsences(rangeStart, rangeEnd)]);
  const events = eventsResult ?? [];
  const absences = absencesResult ?? [];
  const eventsByDate = groupByDate(events, (event) => event.starts_at.slice(0, 10));
  const absencesByDate = groupByDate(absences, (absence) => absence.date);

  const holidayYears = new Set<number>();
  for (let year = rangeStart.getUTCFullYear(); year <= rangeEnd.getUTCFullYear(); year += 1) holidayYears.add(year);
  const holidays = [...holidayYears].flatMap((year) => getFrancePublicHolidays(year, locale));
  const holidaysByDate = new Map<string, FrancePublicHoliday>(holidays.map((holiday) => [holiday.date, holiday]));

  const weekdayLabels = Array.from({ length: 7 }, (_, index) => addDays(utcDate(2024, 0, 1), index).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short' }));
  const absenceLabel = (type: string) => type === 'vacation' ? copy.vacation : type === 'sick' ? copy.sick : copy.otherAbsence;
  const renderAbsences = (dateKey: string, compact = false) => {
    const dayAbsences = absencesByDate.get(dateKey) ?? [];
    if (compact) return dayAbsences.length > 0 ? <span className="calendar-marker absence" aria-label={`${copy.absence}: ${dayAbsences.length}`} /> : null;
    return dayAbsences.map((absence) => <div className="calendar-absence" key={`${dateKey}:${absence.userId}:${absence.type}`}><strong>{absence.displayName}</strong><span>{absenceLabel(absence.type)}</span></div>);
  };

  const renderHoliday = (dateKey: string, compact = false) => {
    const holiday = holidaysByDate.get(dateKey);
    if (!holiday) return null;
    return compact
      ? <span className="calendar-marker holiday" title={holiday.name} aria-label={`${copy.publicHoliday}: ${holiday.name}`} />
      : <div className="calendar-holiday"><span>{copy.publicHoliday} · {copy.france}</span><strong>{holiday.name}</strong></div>;
  };

  const renderEvent = (event: DeskEvent, compact = false) => compact
    ? <span className="calendar-marker event" title={event.title} aria-label={event.title} />
    : <article className="calendar-event" key={event.id}><span className={`badge ${event.source === 'external_sync' ? 'green' : event.status === 'draft' ? 'gold' : ''}`}>{event.source === "external_sync" ? t("external") : event.status === "confirmed" ? t("confirmed") : t("suggested")}</span><strong>{event.title}</strong><div>{new Date(event.starts_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}–{new Date(event.ends_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</div>{event.confidence_score !== null && <div className="list-meta">{t("confidence")}: {Math.round(event.confidence_score * 100)}%</div>}{event.status === 'draft' && event.source !== 'external_sync' && <div className="action-row"><DraftEventActions eventId={event.id} labels={{ confirm: t('confirm'), confirming: t('confirming'), reject: t('reject'), rejecting: t('rejecting'), error: t('genericError') }} /></div>}</article>;

  return <main id="desk-main">
    <div className="calendar-heading"><div><h1>{t("title")}</h1><p>{periodLabel}</p></div><div className="calendar-view-switch" aria-label={t('title')}>
      {(['week', 'month', 'year'] as CalendarView[]).map((item) => <a key={item} href={viewHref(locale, item, anchor)} aria-current={view === item ? 'page' : undefined}>{item === 'week' ? copy.week : item === 'month' ? copy.month : copy.year}</a>)}
    </div></div>

    <div className="calendar-navigation"><a className="button-link" href={viewHref(locale, view, previousAnchor)} aria-label={copy.previous}>‹</a><a className="button-link" href={viewHref(locale, view, today)}>{copy.today}</a><a className="button-link" href={viewHref(locale, view, nextAnchor)} aria-label={copy.next}>›</a></div>

    <CreateEventForm labels={{ newEvent: t('newEvent'), title: t('eventTitle'), starts: t('starts'), ends: t('ends'), meeting: t('meeting'), followUp: t('followUp'), create: t('create'), creating: t('creating'), error: t('genericError') }} />

    {(eventsResult === null || absencesResult === null) && <p className="notice calendar-preview-notice">{copy.backendUnavailable}</p>}

    <div className="calendar-legend" aria-label={t('title')}><span><i className="calendar-marker event" />{t('confirmed')}</span><span><i className="calendar-marker holiday" />{copy.publicHoliday} · {copy.france}</span><span><i className="calendar-marker absence" />{copy.vacation} / {copy.absence}</span></div>

    {view === 'week' && <div className="calendar-week-grid" role="grid" aria-label={`${t('title')} · ${copy.week}`}>
      {Array.from({ length: 7 }, (_, index) => addDays(rangeStart, index)).map((day) => {
        const dateKey = iso(day);
        const dayEvents = eventsByDate.get(dateKey) ?? [];
        return <section className={`calendar-week-day ${dateKey === iso(today) ? 'today' : ''}`} key={dateKey} role="gridcell"><div className="calendar-day-header"><strong>{day.toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'long' })}</strong><span>{day.toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' })}</span></div>{renderHoliday(dateKey)}{renderAbsences(dateKey)}{dayEvents.length === 0 && !holidaysByDate.has(dateKey) && !(absencesByDate.get(dateKey)?.length) && <div className="empty-state">—</div>}{dayEvents.map((event) => renderEvent(event))}</section>;
      })}
    </div>}

    {view === 'month' && <div className="calendar-month-wrap"><div className="calendar-weekday-row" aria-hidden="true">{weekdayLabels.map((label) => <span key={label}>{label}</span>)}</div><div className="calendar-month-grid" role="grid" aria-label={`${t('title')} · ${copy.month}`}>
      {monthGrid(anchor.getUTCFullYear(), anchor.getUTCMonth()).map((day) => {
        const dateKey = iso(day);
        const dayEvents = eventsByDate.get(dateKey) ?? [];
        const dayAbsences = absencesByDate.get(dateKey) ?? [];
        const outside = day.getUTCMonth() !== anchor.getUTCMonth();
        return <section className={`calendar-month-day ${outside ? 'outside' : ''} ${dateKey === iso(today) ? 'today' : ''}`} key={dateKey} role="gridcell"><div className="calendar-date-number">{day.getUTCDate()}</div>{renderHoliday(dateKey)}{dayAbsences.slice(0, 2).map((absence) => <div className="calendar-absence compact" key={`${dateKey}:${absence.userId}:${absence.type}`} title={`${absence.displayName} · ${absenceLabel(absence.type)}`}><strong>{absence.displayName}</strong><span>{absenceLabel(absence.type)}</span></div>)}{dayAbsences.length > 2 && <span className="calendar-more">+{dayAbsences.length - 2} {copy.more}</span>}{dayEvents.slice(0, 2).map((event) => <div className="calendar-event compact" key={event.id} title={event.title}><span>{new Date(event.starts_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span><strong>{event.title}</strong></div>)}{dayEvents.length > 2 && <span className="calendar-more">+{dayEvents.length - 2} {copy.more}</span>}</section>;
      })}
    </div></div>}

    {view === 'year' && <div className="calendar-year-grid" aria-label={`${t('title')} · ${copy.year}`}>
      {Array.from({ length: 12 }, (_, month) => month).map((month) => <section className="calendar-year-month" key={month}><h2>{utcDate(anchor.getUTCFullYear(), month, 1).toLocaleDateString(locale, { timeZone: 'UTC', month: 'long' })}</h2><div className="calendar-year-weekdays" aria-hidden="true">{weekdayLabels.map((label) => <span key={label}>{label.slice(0, 1)}</span>)}</div><div className="calendar-year-days">{monthGrid(anchor.getUTCFullYear(), month).map((day) => {
        const dateKey = iso(day);
        const outside = day.getUTCMonth() !== month;
        const holiday = holidaysByDate.get(dateKey);
        const dayAbsences = absencesByDate.get(dateKey) ?? [];
        const dayEvents = eventsByDate.get(dateKey) ?? [];
        const title = [holiday?.name, ...dayAbsences.map((absence) => `${absence.displayName}: ${absenceLabel(absence.type)}`), ...dayEvents.map((event) => event.title)].filter(Boolean).join(' · ');
        return <div className={`calendar-year-day ${outside ? 'outside' : ''} ${dateKey === iso(today) ? 'today' : ''}`} key={`${month}:${dateKey}`} title={title || undefined}><span>{day.getUTCDate()}</span><div className="calendar-year-markers">{renderHoliday(dateKey, true)}{renderAbsences(dateKey, true)}{dayEvents.length > 0 && renderEvent(dayEvents[0], true)}</div></div>;
      })}</div></section>)}
    </div>}
  </main>;
}
