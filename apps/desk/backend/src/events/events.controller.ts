import { Body, Controller, Param, Post } from '@nestjs/common';
import { supabaseAdmin } from '../supabase/supabase-admin';
import { pushConfirmedEventToExternalCalendars } from '../calendar/calendar-push.service';

/**
 * Minimal confirm/reject endpoints — the trigger points calendar sync
 * needed to make sense (a confirmed event has somewhere to push to). The
 * full "hoje" UI for acting on suggestions (buttons, inline editing) is
 * separate, still-open work; this is just the backend contract it will
 * call.
 *
 * Per ADR-0001, only a human calling this endpoint moves a draft to
 * confirmed — nothing in the AI triage or calendar-sync workers does.
 */
@Controller('events')
export class EventsController {
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
