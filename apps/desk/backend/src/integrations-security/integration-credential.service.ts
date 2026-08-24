import { Injectable } from '@nestjs/common';
import { deskAdmin, supabaseAdmin } from '../supabase/supabase-admin';
import type { DeskOAuthProvider } from './oauth-state.service';
import { decryptCredentialPayload, encryptCredentialPayload } from './integration-crypto';

export type DeskIntegrationProvider = DeskOAuthProvider | 'whatsapp';

export interface ProviderCredentialPayload {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ActiveDeskIntegration {
  id: string;
  workspaceId: string;
  provider: DeskIntegrationProvider;
  externalAccountId: string;
  syncState: Record<string, unknown>;
  credentials: ProviderCredentialPayload;
}

function aadFor(workspaceId: string, integrationId: string, provider: DeskIntegrationProvider): string {
  return `zdesk.integration.v1:${workspaceId}:${integrationId}:${provider}`;
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

    await this.storeCredentials(integrationId, workspaceId, provider, credentials);
    return integrationId;
  }

  async storeCredentials(
    integrationId: string,
    workspaceId: string,
    provider: DeskIntegrationProvider,
    credentials: ProviderCredentialPayload,
  ): Promise<void> {
    const encrypted = encryptCredentialPayload(credentials, aadFor(workspaceId, integrationId, provider));
    const { error } = await deskAdmin.from('integration_credentials').upsert({
      integration_id: integrationId,
      encrypted_payload: encrypted.encryptedPayload,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      key_version: encrypted.keyVersion,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async listActive(providers: DeskIntegrationProvider[]): Promise<ActiveDeskIntegration[]> {
    const { data: integrations, error } = await deskAdmin
      .from('integrations')
      .select('id,workspace_id,provider,external_account_id,sync_state')
      .in('provider', providers)
      .eq('status', 'active');
    if (error) throw error;

    const result: ActiveDeskIntegration[] = [];
    for (const integration of integrations ?? []) {
      const provider = integration.provider as DeskIntegrationProvider;
      const { data: row, error: credentialError } = await deskAdmin
        .from('integration_credentials')
        .select('encrypted_payload,iv,auth_tag,key_version')
        .eq('integration_id', integration.id)
        .maybeSingle();
      if (credentialError) throw credentialError;
      if (!row) continue;

      const credentials = decryptCredentialPayload<ProviderCredentialPayload>(
        {
          encryptedPayload: row.encrypted_payload,
          iv: row.iv,
          authTag: row.auth_tag,
          keyVersion: row.key_version,
        },
        aadFor(integration.workspace_id, integration.id, provider),
      );

      result.push({
        id: integration.id,
        workspaceId: integration.workspace_id,
        provider,
        externalAccountId: integration.external_account_id,
        syncState: (integration.sync_state ?? {}) as Record<string, unknown>,
        credentials,
      });
    }
    return result;
  }

  async updateSyncState(integrationId: string, workspaceId: string, syncState: Record<string, unknown>): Promise<void> {
    const { error } = await deskAdmin
      .from('integrations')
      .update({ sync_state: syncState, updated_at: new Date().toISOString() })
      .eq('id', integrationId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
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
