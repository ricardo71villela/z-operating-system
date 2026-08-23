import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { supabaseAdmin } from '../supabase/supabase-admin';
import { pushConfirmedEventToExternalCalendars } from '../calendar/calendar-push.service';

/**
 * Confirm/reject (the trigger points calendar sync needed to make sense —
 * a confirmed event has somewhere to push to) plus a range listing used by
 * the calendar page. Per ADR-0001, only a human calling confirm/reject
 * moves a draft — nothing in the AI triage or calendar-sync workers does.
 */
@Controller('events')
export class EventsController {
  /**
   * Lists events overlapping [start, end], grouped by nothing — the
   * calendar page buckets them by date client/server-side. Includes every
   * status (draft/confirmed/cancelled excluded) and source so the UI can
   * render the same confirmed/suggested/external distinction as the
   * calendar mockup.
   */
  @Get()
  async list(@Query('tenantId') tenantId: string, @Query('start') start: string, @Query('end') end: string) {
    const { data, error } = await supabaseAdmin
      .from('desk_events')
      .select('id, thread_id, title, starts_at, ends_at, source, status, event_type, confidence_score')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .gte('starts_at', start)
      .lte('starts_at', end)
      .order('starts_at', { ascending: true });
    if (error) throw error;
    return data;
  }

  @Post(':id/confirm')
  async confirm(@Param('id') id: string, @Body('tenantId') tenantId: string) {
    const { error } = await supabaseAdmin
      .from('desk_events')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;

    await pushConfirmedEventToExternalCalendars(id, tenantId);
    return { confirmed: true };
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body('tenantId') tenantId: string) {
    const { error } = await supabaseAdmin
      .from('desk_events')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return { rejected: true };
  }
}
