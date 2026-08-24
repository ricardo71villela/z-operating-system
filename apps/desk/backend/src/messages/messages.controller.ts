import { Body, Controller, Get, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { deskAdmin, supabaseAdmin } from '../supabase/supabase-admin';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

@RequireDeskAuth()
@Controller('messages')
export class MessagesController {
  @Get('threads')
  async threads(@Req() req: DeskRequest) {
    const context = req.deskContext!;
    const { data: threads, error: threadsError } = await deskAdmin
      .from('threads')
      .select('id,contact_id,subject,last_message_at,email_thread_id,whatsapp_chat_id')
      .eq('workspace_id', context.workspaceId)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (threadsError) throw threadsError;

    const contactIds = [...new Set((threads ?? []).map((thread) => thread.contact_id).filter(Boolean))] as string[];
    const contactById = new Map<string, any>();
    if (contactIds.length > 0) {
      const { data: contacts, error } = await deskAdmin.from('contacts').select('id,display_name,email,whatsapp_number,relationship_tier').in('id', contactIds);
      if (error) throw error;
      for (const contact of contacts ?? []) contactById.set(contact.id, contact);
    }

    const { data: recentMessages, error: messagesError } = await deskAdmin
      .from('messages')
      .select('thread_id,body,ai_summary,channel,state,received_at')
      .eq('workspace_id', context.workspaceId)
      .order('received_at', { ascending: false })
      .limit(200);
    if (messagesError) throw messagesError;
    const latestByThread = new Map<string, any>();
    for (const message of recentMessages ?? []) if (!latestByThread.has(message.thread_id)) latestByThread.set(message.thread_id, message);

    return (threads ?? []).map((thread) => {
      const contact = thread.contact_id ? contactById.get(thread.contact_id) : null;
      const latest = latestByThread.get(thread.id);
      return {
        id: thread.id,
        subject: thread.subject,
        contact: contact ? { id: contact.id, displayName: contact.display_name, email: contact.email, whatsappNumber: contact.whatsapp_number, relationshipTier: contact.relationship_tier } : null,
        channel: latest?.channel ?? (thread.whatsapp_chat_id ? 'whatsapp' : 'email'),
        preview: latest?.ai_summary || latest?.body || '',
        state: latest?.state ?? null,
        lastMessageAt: latest?.received_at ?? thread.last_message_at,
      };
    });
  }

  @Get('threads/:threadId')
  async thread(@Req() req: DeskRequest, @Param('threadId') threadId: string) {
    const context = req.deskContext!;
    const { data: thread, error: threadError } = await deskAdmin
      .from('threads')
      .select('id,contact_id,subject,last_message_at,email_thread_id,whatsapp_chat_id')
      .eq('workspace_id', context.workspaceId)
      .eq('id', threadId)
      .maybeSingle();
    if (threadError) throw threadError;
    if (!thread) throw new NotFoundException('Desk thread not found.');

    let contact = null;
    if (thread.contact_id) {
      const { data, error } = await deskAdmin.from('contacts').select('id,display_name,email,whatsapp_number,relationship_tier').eq('workspace_id', context.workspaceId).eq('id', thread.contact_id).maybeSingle();
      if (error) throw error;
      contact = data;
    }
    const { data: messages, error: messagesError } = await deskAdmin
      .from('messages')
      .select('id,channel,direction,body,ai_summary,ai_priority,state,received_at')
      .eq('workspace_id', context.workspaceId)
      .eq('thread_id', threadId)
      .order('received_at', { ascending: true });
    if (messagesError) throw messagesError;
    return { thread, contact, messages: messages ?? [] };
  }

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
    @Body() body: { actionType: 'task' | 'meeting' | 'follow_up'; title: string; assignedTo?: string; dueDate?: string; startsAt?: string; endsAt?: string },
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
