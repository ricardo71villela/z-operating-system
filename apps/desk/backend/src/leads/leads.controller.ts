import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { deskAdmin, supabaseAdmin } from '../supabase/supabase-admin';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

type CreateLeadBody = {
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  sourceChannel?: string;
  interest?: string | null;
  destinationProduct?: string;
  ownerMemberId?: string | null;
  priority?: string;
  language?: string | null;
  nextFollowUpAt?: string | null;
  notes?: string | null;
};

type UpdateLeadBody = {
  status?: string;
  priority?: string;
  score?: number;
  nextFollowUpAt?: string | null;
  destinationProduct?: string;
  ownerMemberId?: string | null;
  notes?: string | null;
  interest?: string | null;
};

@RequireDeskAuth()
@Controller('leads')
export class LeadsController {
  @Get()
  async list(@Req() req: DeskRequest) {
    const context = req.deskContext!;
    const { data, error } = await deskAdmin
      .from('leads')
      .select('id, display_name, email, phone, company_name, source_channel, interest, destination_product, status, priority, score, next_follow_up_at, notes, owner_workspace_member_id, canonical_person_id, canonical_organisation_id, created_at, updated_at')
      .eq('workspace_id', context.workspaceId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  @Post()
  async create(@Req() req: DeskRequest, @Body() body: CreateLeadBody) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_create_lead', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_display_name: body.displayName ?? null,
      p_email: body.email ?? null,
      p_phone: body.phone ?? null,
      p_company_name: body.companyName ?? null,
      p_source_channel: body.sourceChannel ?? 'manual',
      p_interest: body.interest ?? null,
      p_destination_product: body.destinationProduct ?? 'z_desk',
      p_owner_member_id: body.ownerMemberId ?? null,
      p_priority: body.priority ?? 'normal',
      p_language: body.language ?? null,
      p_next_follow_up_at: body.nextFollowUpAt ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw error;
    return data;
  }

  @Patch(':id')
  async update(@Req() req: DeskRequest, @Param('id') id: string, @Body() body: UpdateLeadBody) {
    if (!id) throw new BadRequestException('Lead id is required.');
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_update_lead', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_lead_id: id,
      p_patch: body,
    });
    if (error) throw error;
    return data;
  }

  @Post(':id/convert')
  async convert(
    @Req() req: DeskRequest,
    @Param('id') id: string,
    @Body() body: { personId?: string | null; organisationId?: string | null },
  ) {
    const context = req.deskContext!;
    const { data, error } = await supabaseAdmin.rpc('zdesk_convert_lead', {
      p_workspace_id: context.workspaceId,
      p_actor_member_id: context.workspaceMemberId,
      p_lead_id: id,
      p_person_id: body.personId ?? null,
      p_organisation_id: body.organisationId ?? null,
    });
    if (error) throw error;
    return data;
  }
}
