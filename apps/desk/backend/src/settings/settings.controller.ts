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
    const { data, error } = await deskAdmin.from('workspaces').select('ai_triage_enabled,ai_triage_enabled_at').eq('id', req.deskContext!.workspaceId).single();
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
      ? { ai_triage_enabled: true, ai_triage_enabled_at: new Date().toISOString(), ai_triage_enabled_by_member_id: context.workspaceMemberId }
      : { ai_triage_enabled: false, ai_triage_enabled_at: null, ai_triage_enabled_by_member_id: null };
    const { data, error } = await deskAdmin.from('workspaces').update(patch).eq('id', context.workspaceId).select('ai_triage_enabled,ai_triage_enabled_at').single();
    if (error) throw error;
    return data;
  }

  @Get('readiness')
  @RequireDeskAuth()
  @RequireDeskRoles('owner', 'admin')
  readiness() {
    const enabled = (name: string) => String(process.env[name] || '').trim().length > 0;
    return {
      oauthSecurityConfigured: enabled('DESK_OAUTH_STATE_SECRET') && enabled('DESK_INTEGRATION_CREDENTIAL_KEY'),
      googleOAuthConfigured: enabled('GOOGLE_OAUTH_CLIENT_ID') && enabled('GOOGLE_OAUTH_CLIENT_SECRET'),
      microsoftOAuthConfigured: enabled('MICROSOFT_OAUTH_CLIENT_ID') && enabled('MICROSOFT_OAUTH_CLIENT_SECRET'),
      whatsappWebhookConfigured: enabled('WHATSAPP_VERIFY_TOKEN') && enabled('WHATSAPP_APP_SECRET'),
      aiGatewayConfigured: enabled('AI_GATEWAY_API_KEY'),
      workersEnabled: process.env.DESK_ENABLE_WORKERS === 'true',
      calendarPushEnabled: process.env.DESK_EXTERNAL_CALENDAR_PUSH_ENABLED === 'true',
      whatsappExportEnabled: process.env.DESK_WHATSAPP_EXPORT_ENABLED === 'true',
    };
  }
}
