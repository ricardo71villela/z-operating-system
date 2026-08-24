import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { deskAdmin } from '../supabase/supabase-admin';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

@RequireDeskAuth()
@Controller('today')
export class TodayController {
  @Get()
  async getToday(@Req() req: DeskRequest) {
    const context = req.deskContext!;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [pendingMessages, draftEvents, confirmedEventsToday] = await Promise.all([
      deskAdmin
        .from('messages')
        .select('id, thread_id, body, ai_summary, state, received_at')
        .eq('workspace_id', context.workspaceId)
        .neq('state', 'resolved')
        .order('received_at', { ascending: false }),

      deskAdmin
        .from('events')
        .select('id, thread_id, title, starts_at, ends_at, event_type, confidence_score')
        .eq('workspace_id', context.workspaceId)
        .eq('status', 'draft')
        .order('starts_at', { ascending: true }),

      deskAdmin
        .from('events')
        .select('id, thread_id, title, starts_at, ends_at, event_type')
        .eq('workspace_id', context.workspaceId)
        .eq('status', 'confirmed')
        .gte('starts_at', startOfDay.toISOString())
        .lte('starts_at', endOfDay.toISOString())
        .order('starts_at', { ascending: true }),
    ]);

    if (pendingMessages.error) throw pendingMessages.error;
    if (draftEvents.error) throw draftEvents.error;
    if (confirmedEventsToday.error) throw confirmedEventsToday.error;

    return {
      pendingMessages: pendingMessages.data,
      draftEvents: draftEvents.data,
      confirmedEventsToday: confirmedEventsToday.data,
    };
  }
}
