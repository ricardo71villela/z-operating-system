import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireDeskAuth, RequireDeskRoles } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { deskAdmin } from '../supabase/supabase-admin';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

@Controller('settings')
export class SettingsController {
  @Get('ai-triage')
  @RequireDeskAuth()
  async getAiTriage(@Req() req: DeskRequest) {
    const { data, error } = await deskAdmin
      .from('workspaces')
      .select('ai_triage_enabled,ai_triage_enabled_at')
      .eq('id', req.deskContext!.workspaceId)
      .single();
    if (error) throw error;
    return data;
  }

  @Patch('ai-triage')
  @RequireDeskAuth()
  @RequireDeskRoles('owner', 'admin')
  async setAiTriage(@Req() req: DeskRequest, @Body() body: { enabled?: boolean }) {
    if (typeof body.enabled !== 'boolean') throw new Error('enabled must be boolean.');
    const context = req.deskContext!;
    const patch = body.enabled
      ? {
          ai_triage_enabled: true,
          ai_triage_enabled_at: new Date().toISOString(),
          ai_triage_enabled_by_member_id: context.workspaceMemberId,
        }
      : {
          ai_triage_enabled: false,
          ai_triage_enabled_at: null,
          ai_triage_enabled_by_member_id: null,
        };

    const { data, error } = await deskAdmin
      .from('workspaces')
      .update(patch)
      .eq('id', context.workspaceId)
      .select('ai_triage_enabled,ai_triage_enabled_at')
      .single();
    if (error) throw error;
    return data;
  }
}
