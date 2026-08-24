/**
 * Thin wrapper around Microsoft Graph OAuth2 + mail delta query.
 * Callers may request an explicit scope set while reusing the same Microsoft
 * OAuth client for Mail or Calendar.
 */

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

export function getMicrosoftAuthUrl(
  redirectUri: string,
  state: string,
  scope = 'offline_access Mail.Read User.Read',
): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope,
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

export interface RefreshedMicrosoftTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
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
  if (!meRes.ok) throw new Error(`Falha ao resolver conta Microsoft: ${meRes.status}`);
  const me = await meRes.json();

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    email: me.mail ?? me.userPrincipalName,
  };
}

export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<RefreshedMicrosoftTokens> {
  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Falha ao renovar token Microsoft: ${res.status}`);
  const json = await res.json();
  if (!json.access_token || !json.expires_in) throw new Error('Resposta de refresh Microsoft incompleta.');
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
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
