import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { pushConfirmedEventToExternalCalendars } from '../calendar/calendar-push.service';
import { deskAdmin, supabaseAdmin } from '../supabase/supabase-admin';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

@RequireDeskAuth()
@Controller('events')
export class EventsController {
  @Get()
  async list(@Req() req: DeskRequest, @Query('start') start: string, @Query('end') end: string) {
    const context = req.deskContext!;
    const { data, error } = await deskAdmin
      .from('events')
      .select('id, thread_id, title, starts_at, ends_at, source, status, event_type, confidence_score, created_by')
      .eq('workspace_id', context.workspaceId)
      .neq('status', 'cancelled')
      .gte('starts_at', start)
      .lte('starts_at', end)
      .order('starts_at', { ascending: true });
    if (error) throw error;
    return data;
  }

  @Post()
  async create(
    @Req() req: DeskRequest,
    @Body() body: { title: string; startsAt: string; endsAt: string; threadId?: string; eventType?: 'meeting' | 'follow_up_block' },
  ) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_create_event', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_title: body.title,
      p_starts_at: body.startsAt,
      p_ends_at: body.endsAt,
      p_thread_id: body.threadId ?? null,
      p_event_type: body.eventType ?? 'meeting',
    });
    if (error) throw error;
    return data;
  }

  @Patch(':id')
  async update(
    @Req() req: DeskRequest,
    @Param('id') id: string,
    @Body() body: { title?: string; startsAt?: string; endsAt?: string; eventType?: 'meeting' | 'follow_up_block' },
  ) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_update_event', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_event_id: id,
      p_patch: body,
    });
    if (error) throw error;
    return data;
  }

  @Post(':id/confirm')
  async confirm(@Req() req: DeskRequest, @Param('id') id: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_confirm_event', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_event_id: id,
    });
    if (error) throw error;

    await pushConfirmedEventToExternalCalendars(id, context.workspaceId);
    return data;
  }

  @Post(':id/reject')
  async reject(@Req() req: DeskRequest, @Param('id') id: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_reject_event', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_event_id: id,
    });
    if (error) throw error;
    return data;
  }
}
