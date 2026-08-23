import { Worker } from 'bullmq';
import { redisConnection, CALENDAR_SYNC_QUEUE, calendarSyncQueue } from '../queues';
import { supabaseAdmin } from '../../supabase/supabase-admin';
import { listGoogleCalendarEvents } from '../../calendar/google-calendar.client';
import { listGraphCalendarEvents } from '../../calendar/microsoft-calendar.client';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // TODO: Google/Microsoft both support push channels (webhooks); polling is a v1 shortcut, same tradeoff as email sync

export function scheduleCalendarSyncPolling() {
  calendarSyncQueue.add(
    'poll-and-fanout',
    {},
    { repeat: { every: POLL_INTERVAL_MS }, jobId: 'calendar-sync-poll' },
  );
}

/**
 * Pulls events FROM Google/Outlook Calendar INTO desk_events
 * (source='external_sync'). This is one direction of sync; the other
 * direction (Z Desk → external calendar, when an ai_suggested draft gets
 * confirmed) lives in calendar-push.service.ts, triggered from the events
 * confirm endpoint — not from this worker.
 *
 * Purpose of the pull direction: give the AI real availability to reason
 * against (busy/free), and let confirmed-elsewhere meetings show up in the
 * "hoje" view without the user having re-created them in Z Desk.
 */
export const calendarSyncWorker = new Worker(
  CALENDAR_SYNC_QUEUE,
  async () => {
    const { data: integrations, error } = await supabaseAdmin
      .from('desk_integrations')
      .select('id, tenant_id, provider, oauth_tokens, sync_state')
      .in('provider', ['google_calendar', 'microsoft_calendar'])
      .eq('status', 'active');

    if (error) throw error;

    for (const integration of integrations ?? []) {
      try {
        if (integration.provider === 'google_calendar') {
          await syncGoogleCalendar(integration);
        } else {
          await syncMicrosoftCalendar(integration);
        }
      } catch (err) {
        console.error(`Falha ao sincronizar calendário ${integration.id} (${integration.provider}):`, err);
      }
    }
  },
  { connection: redisConnection },
);

async function syncGoogleCalendar(integration: any) {
  const accessToken = integration.oauth_tokens?.accessToken;
  if (!accessToken) return;

  const { events, newSyncToken } = await listGoogleCalendarEvents(accessToken, integration.sync_state?.syncToken);

  for (const event of events) {
    await upsertExternalEvent({
      tenantId: integration.tenant_id,
      provider: 'google_calendar',
      externalId: event.externalId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    });
  }

  await supabaseAdmin
    .from('desk_integrations')
    .update({ sync_state: { syncToken: newSyncToken } })
    .eq('id', integration.id);
}

async function syncMicrosoftCalendar(integration: any) {
  const accessToken = integration.oauth_tokens?.accessToken;
  if (!accessToken) return;

  const { events, newDeltaLink } = await listGraphCalendarEvents(accessToken, integration.sync_state?.deltaLink);

  for (const event of events) {
    await upsertExternalEvent({
      tenantId: integration.tenant_id,
      provider: 'microsoft_calendar',
      externalId: event.externalId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    });
  }

  await supabaseAdmin
    .from('desk_integrations')
    .update({ sync_state: { deltaLink: newDeltaLink } })
    .eq('id', integration.id);
}

interface ExternalEvent {
  tenantId: string;
  provider: 'google_calendar' | 'microsoft_calendar';
  externalId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

async function upsertExternalEvent(event: ExternalEvent) {
  await supabaseAdmin.from('desk_events').upsert(
    {
      tenant_id: event.tenantId,
      title: event.title,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      source: 'external_sync',
      status: 'confirmed', // it already exists on the external calendar — nothing for the human to confirm here
      external_calendar_provider: event.provider,
      external_calendar_event_id: event.externalId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,external_calendar_provider,external_calendar_event_id' },
  );
}
