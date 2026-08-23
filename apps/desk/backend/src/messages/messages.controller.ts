import { Body, Controller, Param, Post } from '@nestjs/common';
import { supabaseAdmin } from '../supabase/supabase-admin';

/**
 * Companion to EventsController.confirm/reject: the human action that
 * advances a message's lifecycle (ADR-0002) to 'resolved'. No endpoint yet
 * for the other state transitions (awaiting_reply, action_pending) —
 * those are set automatically by triage/reply-detection once that exists;
 * 'resolved' is the one state a human explicitly declares.
 */
@Controller('messages')
export class MessagesController {
  @Post(':id/resolve')
  async resolve(@Param('id') id: string, @Body('tenantId') tenantId: string) {
    const { error } = await supabaseAdmin
      .from('desk_messages')
      .update({ state: 'resolved' })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return { resolved: true };
  }
}
