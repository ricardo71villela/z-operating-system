import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { deskAdmin } from '../supabase/supabase-admin';
import { pushConfirmedEventToExternalCalendars } from '../calendar/calendar-push.service';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';

@RequireDeskAuth()
@Controller('events')
export class EventsController {
  @Get()
  async list(@Query('workspaceId') workspaceId: string, @Query('start') start: string, @Query('end') end: string) {
    const { data, error } = await deskAdmin
      .from('events')
      .select('id, thread_id, title, starts_at, ends_at, source, status, event_type, confidence_score')
      .eq('workspace_id', workspaceId)
      .neq('status', 'cancelled')
      .gte('starts_at', start)
      .lte('starts_at', end)
      .order('starts_at', { ascending: true });
    if (error) throw error;
    return data;
  }

  @Post(':id/confirm')
  async confirm(@Param('id') id: string, @Body('workspaceId') workspaceId: string) {
    const { error } = await deskAdmin
      .from('events')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', workspaceId);
    if (error) throw error;

    await pushConfirmedEventToExternalCalendars(id, workspaceId);
    return { confirmed: true };
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body('workspaceId') workspaceId: string) {
    const { error } = await deskAdmin
      .from('events')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return { rejected: true };
  }
}
