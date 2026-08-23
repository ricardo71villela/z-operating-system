import { supabaseAdmin } from '../supabase/supabase-admin';
import { createGoogleCalendarEvent } from './google-calendar.client';
import { createGraphCalendarEvent } from './microsoft-calendar.client';

/**
 * Pushes a newly-confirmed Z Desk event to the tenant's connected external
 * calendar (Google or Microsoft — whichever is connected; if both are
 * connected, pushes to both). Called from EventsController.confirm, not
 * from the calendar-sync worker (which only pulls).
 *
 * If the tenant has no calendar integration connected, this is a silent
 * no-op — the event still exists in Z Desk, it just isn't mirrored
 * externally until a calendar is connected. Not treated as an error.
 */
export async function pushConfirmedEventToExternalCalendars(desktopEventId: string, tenantId: string) {
  const { data: event, error: eventError } = await supabaseAdmin
    .from('desk_events')
    .select('id, title, starts_at, ends_at')
    .eq('id', desktopEventId)
    .single();
  if (eventError) throw eventError;

  const { data: integrations, error: integrationsError } = await supabaseAdmin
    .from('desk_integrations')
    .select('id, provider, oauth_tokens')
    .eq('tenant_id', tenantId)
    .in('provider', ['google_calendar', 'microsoft_calendar'])
    .eq('status', 'active');
  if (integrationsError) throw integrationsError;

  for (const integration of integrations ?? []) {
    const accessToken = integration.oauth_tokens?.accessToken;
    if (!accessToken) continue;

    const created =
      integration.provider === 'google_calendar'
        ? await createGoogleCalendarEvent(accessToken, {
            title: event.title,
            startsAt: event.starts_at,
            endsAt: event.ends_at,
          })
        : await createGraphCalendarEvent(accessToken, {
            title: event.title,
            startsAt: event.starts_at,
            endsAt: event.ends_at,
          });

    // Only one external_calendar_event_id fits on desk_events today. If a
    // tenant connects both providers, the second push still happens (the
    // meeting exists on both calendars) but only the last write is
    // reflected on this row — acceptable for v1, revisit if dual-calendar
    // tenants turn out to be common.
    await supabaseAdmin
      .from('desk_events')
      .update({
        external_calendar_provider: integration.provider,
        external_calendar_event_id: created.externalId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', desktopEventId);
  }
}
