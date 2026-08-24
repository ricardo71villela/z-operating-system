import { refreshGoogleAccessToken } from '../email/gmail.client';
import { refreshMicrosoftAccessToken } from '../email/microsoft-graph.client';
import {
  IntegrationCredentialService,
  type ActiveDeskIntegration,
  type ProviderCredentialPayload,
} from '../integrations-security/integration-credential.service';

const REFRESH_SKEW_MS = 60_000;
const credentialService = new IntegrationCredentialService();

export async function listActiveWorkerIntegrations(
  providers: ActiveDeskIntegration['provider'][],
): Promise<ActiveDeskIntegration[]> {
  return credentialService.listActive(providers);
}

export async function accessTokenForWorker(integration: ActiveDeskIntegration): Promise<string> {
  const current = integration.credentials;
  const expiresAt = current.expiresAt ? Date.parse(current.expiresAt) : Number.POSITIVE_INFINITY;
  if (current.accessToken && expiresAt > Date.now() + REFRESH_SKEW_MS) return current.accessToken;

  if (!current.refreshToken) {
    throw new Error(`Integração ${integration.id} (${integration.provider}) não tem refresh token válido.`);
  }

  let refreshed: ProviderCredentialPayload;
  if (integration.provider === 'gmail' || integration.provider === 'google_calendar') {
    refreshed = await refreshGoogleAccessToken(current.refreshToken);
  } else if (integration.provider === 'microsoft' || integration.provider === 'microsoft_calendar') {
    refreshed = await refreshMicrosoftAccessToken(current.refreshToken);
  } else {
    if (!current.accessToken) throw new Error(`Integração ${integration.id} não tem access token.`);
    return current.accessToken;
  }

  await credentialService.storeCredentials(
    integration.id,
    integration.workspaceId,
    integration.provider,
    { ...current, ...refreshed },
  );
  integration.credentials = { ...current, ...refreshed };
  return refreshed.accessToken;
}

export async function updateWorkerSyncState(
  integration: ActiveDeskIntegration,
  syncState: Record<string, unknown>,
): Promise<void> {
  await credentialService.updateSyncState(integration.id, integration.workspaceId, syncState);
  integration.syncState = syncState;
}
