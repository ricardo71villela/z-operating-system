import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';
import type { DeskAuthContext } from '../auth/desk-auth-context';
import { deskAdmin } from '../supabase/supabase-admin';
import { IntegrationCredentialService } from '../integrations-security/integration-credential.service';

type DeskRequest = Request & { deskContext?: DeskAuthContext };

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly credentials: IntegrationCredentialService) {}

  @Post('whatsapp/connect')
  @RequireDeskAuth()
  async connectWhatsapp(
    @Req() req: DeskRequest,
    @Body()
    body: {
      phoneNumberId: string;
      accessToken: string;
      displayPhoneNumber?: string;
    },
  ) {
    const context = req.deskContext!;
    const phoneNumberId = String(body.phoneNumberId ?? '').trim();
    const accessToken = String(body.accessToken ?? '').trim();
    if (!phoneNumberId || !accessToken) throw new Error('phoneNumberId and accessToken are required.');

    const integrationId = await this.credentials.connect(
      context.workspaceId,
      context.workspaceMemberId,
      'whatsapp',
      phoneNumberId,
      {
        accessToken,
        expiresAt: null,
        metadata: { displayPhoneNumber: body.displayPhoneNumber ?? null },
      },
    );

    const { data, error } = await deskAdmin
      .from('integrations')
      .select('id, provider, external_account_id, status, created_at')
      .eq('id', integrationId)
      .eq('workspace_id', context.workspaceId)
      .single();
    if (error) throw error;
    return data;
  }

  @Get()
  @RequireDeskAuth()
  async list(@Req() req: DeskRequest) {
    const { data, error } = await deskAdmin
      .from('integrations')
      .select('id, provider, external_account_id, status, created_at, updated_at')
      .eq('workspace_id', req.deskContext!.workspaceId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  @Delete(':id')
  @RequireDeskAuth()
  async disconnect(@Req() req: DeskRequest, @Param('id') id: string) {
    await this.credentials.disconnect(req.deskContext!.workspaceId, id);
    return { disconnected: true };
  }
}
