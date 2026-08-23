/**
 * Thin wrapper around Microsoft Graph Calendar (/me/events). Same
 * standalone-connect note as google-calendar.client.ts applies:
 * provider='microsoft_calendar' is a separate desk_integrations row from
 * provider='microsoft' (mail), even though both hit the same Graph API.
 */

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

export interface GraphCalendarEvent {
  externalId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

export async function listGraphCalendarEvents(
  accessToken: string,
  deltaLink?: string,
): Promise<{ events: GraphCalendarEvent[]; newDeltaLink: string }> {
  const url = deltaLink ?? `${GRAPH_API_BASE}/me/calendarView/delta?startDateTime=${new Date().toISOString()}&endDateTime=${new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Falha ao consultar delta de calendário do Microsoft Graph: ${res.status}`);
  const json = await res.json();

  const events: GraphCalendarEvent[] = (json.value ?? [])
    .filter((e: any) => !e['@removed'])
    .map((e: any) => ({
      externalId: e.id,
      title: e.subject ?? '(sem título)',
      startsAt: e.start?.dateTime,
      endsAt: e.end?.dateTime,
    }));

  return { events, newDeltaLink: json['@odata.deltaLink'] ?? json['@odata.nextLink'] ?? url };
}

export async function createGraphCalendarEvent(
  accessToken: string,
  event: { title: string; startsAt: string; endsAt: string },
): Promise<{ externalId: string }> {
  const res = await fetch(`${GRAPH_API_BASE}/me/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: event.title,
      start: { dateTime: event.startsAt, timeZone: 'UTC' },
      end: { dateTime: event.endsAt, timeZone: 'UTC' },
    }),
  });
  if (!res.ok) throw new Error(`Falha ao criar evento no Microsoft Calendar: ${res.status}`);
  const json = await res.json();
  return { externalId: json.id };
}
