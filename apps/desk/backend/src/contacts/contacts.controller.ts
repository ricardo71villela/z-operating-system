import { Controller, Get, NotFoundException, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { deskAdmin } from '../supabase/supabase-admin';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

@RequireDeskAuth()
@Controller('contacts')
export class ContactsController {
  @Get()
  async list(@Req() req: DeskRequest) {
    const context = req.deskContext!;
    const { data, error } = await deskAdmin
      .from('contacts')
      .select('id,display_name,email,whatsapp_number,thread_count,last_interaction_at,relationship_tier')
      .eq('workspace_id', context.workspaceId)
      .order('last_interaction_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  }

  @Get(':id')
  async detail(@Req() req: DeskRequest, @Param('id') id: string) {
    const context = req.deskContext!;
    const { data: contact, error } = await deskAdmin
      .from('contacts')
      .select('id,display_name,email,whatsapp_number,thread_count,last_interaction_at,relationship_tier')
      .eq('workspace_id', context.workspaceId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!contact) throw new NotFoundException('Desk contact not found.');
    const { data: threads, error: threadsError } = await deskAdmin
      .from('threads')
      .select('id,subject,last_message_at,email_thread_id,whatsapp_chat_id')
      .eq('workspace_id', context.workspaceId)
      .eq('contact_id', id)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (threadsError) throw threadsError;
    return { contact, threads: threads ?? [] };
  }
}
