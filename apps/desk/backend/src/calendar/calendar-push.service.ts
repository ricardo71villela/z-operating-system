import { createGoogleCalendarEvent } from './google-calendar.client';
import { createGraphCalendarEvent } from './microsoft-calendar.client';
import { deskAdmin } from '../supabase/supabase-admin';
import { IntegrationCredentialService } from '../integrations-security/integration-credential.service';
import { accessTokenForWorker } from '../queues/worker-credentials';

const credentialService = new IntegrationCredentialService();

/**
 * Publishes one confirmed Desk event to every active calendar integration in
 * the same workspace. Each provider link is persisted independently, making
 * retries safe and allowing Google + Microsoft publication simultaneously.
 */
export async function pushConfirmedEventToExternalCalendars(eventId: string, workspaceId: string) {
  const { data: event, error } = await deskAdmin
    .from('events')
    .select('id,workspace_id,title,starts_at,ends_at,source,status')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'confirmed')
    .maybeSingle();
  if (error) throw error;
  if (!event) return;

  // Never echo an event imported from a provider back out to all providers.
  if (event.source === 'external_sync') return;

  const integrations = await credentialService.listActive(
    ['google_calendar', 'microsoft_calendar'],
    workspaceId,
  );

  for (const integration of integrations) {
    const { data: existing, error: existingError } = await deskAdmin
      .from('event_external_links')
      .select('id')
      .eq('event_id', event.id)
      .eq('integration_id', integration.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) continue;

    const accessToken = await accessTokenForWorker(integration);
    const payload = {
      title: event.title,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
    };

    const created = integration.provider === 'google_calendar'
      ? await createGoogleCalendarEvent(accessToken, payload)
      : await createGraphCalendarEvent(accessToken, payload);

    const { error: linkError } = await deskAdmin.from('event_external_links').insert({
      workspace_id: workspaceId,
      event_id: event.id,
      integration_id: integration.id,
      external_event_id: created.externalId,
    });
    if (linkError?.code === '23505') continue;
    if (linkError) throw linkError;
  }
}
