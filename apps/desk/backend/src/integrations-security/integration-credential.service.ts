import { Injectable } from '@nestjs/common';
import { deskAdmin, supabaseAdmin } from '../supabase/supabase-admin';
import type { DeskOAuthProvider } from './oauth-state.service';
import { encryptCredentialPayload } from './integration-crypto';

export type DeskIntegrationProvider = DeskOAuthProvider | 'whatsapp';

export interface ProviderCredentialPayload {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class IntegrationCredentialService {
  async connect(
    workspaceId: string,
    workspaceMemberId: string,
    provider: DeskIntegrationProvider,
    externalAccountId: string,
    credentials: ProviderCredentialPayload,
  ): Promise<string> {
    const { data, error } = await supabaseAdmin.rpc('zdesk_register_integration', {
      p_workspace_id: workspaceId,
      p_workspace_member_id: workspaceMemberId,
      p_provider: provider,
      p_external_account_id: externalAccountId,
    });
    if (error) throw error;

    const integrationId = typeof data === 'string' ? data : String(data ?? '');
    if (!integrationId) throw new Error('Desk integration registration returned no id.');

    const aad = `zdesk.integration.v1:${workspaceId}:${integrationId}:${provider}`;
    const encrypted = encryptCredentialPayload(credentials, aad);

    const { error: credentialError } = await deskAdmin.from('integration_credentials').upsert({
      integration_id: integrationId,
      encrypted_payload: encrypted.encryptedPayload,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      key_version: encrypted.keyVersion,
      updated_at: new Date().toISOString(),
    });
    if (credentialError) throw credentialError;

    return integrationId;
  }

  async disconnect(workspaceId: string, integrationId: string): Promise<void> {
    const { data: integration, error } = await deskAdmin
      .from('integrations')
      .select('id')
      .eq('id', integrationId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!integration) return;

    const { error: credentialError } = await deskAdmin
      .from('integration_credentials')
      .delete()
      .eq('integration_id', integrationId);
    if (credentialError) throw credentialError;

    const { error: integrationError } = await deskAdmin
      .from('integrations')
      .update({ status: 'disconnected', updated_at: new Date().toISOString() })
      .eq('id', integrationId)
      .eq('workspace_id', workspaceId);
    if (integrationError) throw integrationError;
  }
}
