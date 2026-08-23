/**
 * Thin wrapper around Microsoft Graph (OAuth2 + /me/messages delta query).
 * Scope needed: Mail.Read offline_access.
 */

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

export function getMicrosoftAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: 'offline_access Mail.Read User.Read',
    state,
  });
  return `${MS_AUTH_URL}?${params.toString()}`;
}

export interface MicrosoftTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  email: string;
}

export async function exchangeMicrosoftCode(code: string, redirectUri: string): Promise<MicrosoftTokens> {
  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) throw new Error(`Falha ao trocar código Microsoft por tokens: ${res.status}`);
  const json = await res.json();

  const meRes = await fetch(`${GRAPH_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${json.access_token}` },
  });
  const me = await meRes.json();

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    email: me.mail ?? me.userPrincipalName,
  };
}

export interface GraphMessage {
  id: string;
  conversationId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  bodyText: string;
  receivedAt: string;
}

/**
 * Uses Graph's delta query for incremental sync: `deltaLink` from the
 * previous call is stored in desk_integrations.sync_state and replayed
 * here. On first sync (no deltaLink) starts a fresh delta chain instead
 * of pulling full mailbox history.
 */
export async function listRecentGraphMessages(
  accessToken: string,
  deltaLink?: string,
): Promise<{ messages: GraphMessage[]; newDeltaLink: string }> {
  const url =
    deltaLink ??
    `${GRAPH_API_BASE}/me/mailFolders/inbox/messages/delta?$select=id,conversationId,from,subject,bodyPreview,receivedDateTime`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Falha ao consultar delta do Microsoft Graph: ${res.status}`);
  const json = await res.json();

  const messages: GraphMessage[] = (json.value ?? []).map((m: any) => ({
    id: m.id,
    conversationId: m.conversationId,
    fromEmail: m.from?.emailAddress?.address ?? '',
    fromName: m.from?.emailAddress?.name ?? null,
    subject: m.subject ?? null,
    bodyText: m.bodyPreview ?? '',
    receivedAt: m.receivedDateTime,
  }));

  return { messages, newDeltaLink: json['@odata.deltaLink'] ?? json['@odata.nextLink'] ?? url };
}
