import { Worker } from 'bullmq';
import { redisConnection, CALENDAR_SYNC_QUEUE, calendarSyncQueue } from '../queues';
import { deskAdmin } from '../../supabase/supabase-admin';
import { listGoogleCalendarEvents } from '../../calendar/google-calendar.client';
import { listGraphCalendarEvents } from '../../calendar/microsoft-calendar.client';
import type { ActiveDeskIntegration } from '../../integrations-security/integration-credential.service';
import { accessTokenForWorker, listActiveWorkerIntegrations, updateWorkerSyncState } from '../worker-credentials';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function scheduleCalendarSyncPolling() {
  return calendarSyncQueue.add(
    'poll-and-fanout',
    {},
    { repeat: { every: POLL_INTERVAL_MS }, jobId: 'calendar-sync-poll' },
  );
}

export const calendarSyncWorker = new Worker(
  CALENDAR_SYNC_QUEUE,
  async () => {
    const integrations = await listActiveWorkerIntegrations(['google_calendar', 'microsoft_calendar']);

    for (const integration of integrations) {
      try {
        if (integration.provider === 'google_calendar') {
          await syncGoogleCalendar(integration);
        } else if (integration.provider === 'microsoft_calendar') {
          await syncMicrosoftCalendar(integration);
        }
      } catch (err) {
        console.error(`Falha ao sincronizar calendário ${integration.id} (${integration.provider}):`, err);
      }
    }
  },
  { connection: redisConnection },
);

async function syncGoogleCalendar(integration: ActiveDeskIntegration) {
  const accessToken = await accessTokenForWorker(integration);
  const syncToken = typeof integration.syncState.syncToken === 'string' ? integration.syncState.syncToken : undefined;
  const { events, newSyncToken } = await listGoogleCalendarEvents(accessToken, syncToken);

  for (const event of events) {
    await upsertExternalEvent({
      workspaceId: integration.workspaceId,
      provider: 'google_calendar',
      externalId: event.externalId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    });
  }

  await updateWorkerSyncState(integration, { ...integration.syncState, syncToken: newSyncToken });
}

async function syncMicrosoftCalendar(integration: ActiveDeskIntegration) {
  const accessToken = await accessTokenForWorker(integration);
  const deltaLink = typeof integration.syncState.deltaLink === 'string' ? integration.syncState.deltaLink : undefined;
  const { events, newDeltaLink } = await listGraphCalendarEvents(accessToken, deltaLink);

  for (const event of events) {
    await upsertExternalEvent({
      workspaceId: integration.workspaceId,
      provider: 'microsoft_calendar',
      externalId: event.externalId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    });
  }

  await updateWorkerSyncState(integration, { ...integration.syncState, deltaLink: newDeltaLink });
}

interface ExternalEvent {
  workspaceId: string;
  provider: 'google_calendar' | 'microsoft_calendar';
  externalId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

async function upsertExternalEvent(event: ExternalEvent) {
  const { error } = await deskAdmin.from('events').upsert(
    {
      workspace_id: event.workspaceId,
      title: event.title,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      source: 'external_sync',
      status: 'confirmed',
      external_calendar_provider: event.provider,
      external_calendar_event_id: event.externalId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,external_calendar_provider,external_calendar_event_id' },
  );
  if (error) throw error;
}
