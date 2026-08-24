import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { supabaseAdmin } from '../supabase/supabase-admin';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

@RequireDeskAuth()
@Controller('messages')
export class MessagesController {
  @Post(':id/resolve')
  async resolve(@Req() req: DeskRequest, @Param('id') id: string) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_resolve_message', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_message_id: id,
    });
    if (error) throw error;
    return data;
  }

  @Post(':id/actions')
  async createAction(
    @Req() req: DeskRequest,
    @Param('id') id: string,
    @Body()
    body: {
      actionType: 'task' | 'meeting' | 'follow_up';
      title: string;
      assignedTo?: string;
      dueDate?: string;
      startsAt?: string;
      endsAt?: string;
    },
  ) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_create_message_action', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_message_id: id,
      p_action_type: body.actionType,
      p_title: body.title,
      p_assigned_to: body.assignedTo ?? null,
      p_due_date: body.dueDate ?? null,
      p_starts_at: body.startsAt ?? null,
      p_ends_at: body.endsAt ?? null,
    });
    if (error) throw error;
    return data;
  }
}
