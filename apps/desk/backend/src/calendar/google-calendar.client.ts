/**
 * Thin wrapper around Google Calendar API v3. Reuses the same OAuth client
 * credentials as gmail.client.ts (same Google Cloud project) but requests
 * an additional scope, so calendar and mail are connected as separate
 * desk_integrations rows (provider='google_calendar' vs 'gmail') even
 * though a user may grant both scopes in the same consent screen in a
 * later, combined authorize flow — not built yet; each is a standalone
 * connect for now, matching how WhatsApp/Gmail/Microsoft are done.
 */

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface GoogleCalendarEvent {
  externalId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  syncToken?: string,
): Promise<{ events: GoogleCalendarEvent[]; newSyncToken: string }> {
  const params = new URLSearchParams(
    syncToken
      ? { syncToken }
      : { timeMin: new Date().toISOString(), singleEvents: 'true', orderBy: 'startTime' },
  );

  const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Falha ao listar eventos Google Calendar: ${res.status}`);
  const json = await res.json();

  const events: GoogleCalendarEvent[] = (json.items ?? [])
    .filter((e: any) => e.status !== 'cancelled')
    .map((e: any) => ({
      externalId: e.id,
      title: e.summary ?? '(sem título)',
      startsAt: e.start?.dateTime ?? e.start?.date,
      endsAt: e.end?.dateTime ?? e.end?.date,
    }));

  return { events, newSyncToken: json.nextSyncToken ?? syncToken ?? '' };
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  event: { title: string; startsAt: string; endsAt: string },
): Promise<{ externalId: string }> {
  const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.title,
      start: { dateTime: event.startsAt },
      end: { dateTime: event.endsAt },
    }),
  });
  if (!res.ok) throw new Error(`Falha ao criar evento no Google Calendar: ${res.status}`);
  const json = await res.json();
  return { externalId: json.id };
}
