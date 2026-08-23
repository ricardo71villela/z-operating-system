/**
 * Thin wrapper around Gmail API v1 (OAuth2 + messages.list/get).
 * Default scope is read-only mail; callers such as Calendar may request an
 * explicit scope set while reusing the same Google OAuth client.
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

export function getGmailAuthUrl(
  redirectUri: string,
  state: string,
  scope = 'https://www.googleapis.com/auth/gmail.readonly email',
): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope,
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  email: string;
}

export async function exchangeGmailCode(code: string, redirectUri: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) throw new Error(`Falha ao trocar código Google por tokens: ${res.status}`);
  const json = await res.json();

  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${json.access_token}` },
  });
  if (!userinfoRes.ok) throw new Error(`Falha ao resolver conta Google: ${userinfoRes.status}`);
  const userinfo = await userinfoRes.json();

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    email: userinfo.email,
  };
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
}

export async function listRecentGmailMessages(
  accessToken: string,
  historyId?: string,
): Promise<{ messages: GmailMessageSummary[]; newHistoryId: string }> {
  if (!historyId) {
    const res = await fetch(
      `${GMAIL_API_BASE}/users/me/messages?maxResults=20&q=newer_than:1d`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) throw new Error(`Falha ao listar mensagens Gmail: ${res.status}`);
    const json = await res.json();
    const profile = await fetch(`${GMAIL_API_BASE}/users/me/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((r) => r.json());
    return { messages: json.messages ?? [], newHistoryId: profile.historyId };
  }

  const res = await fetch(
    `${GMAIL_API_BASE}/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Falha ao obter histórico Gmail: ${res.status}`);
  const json = await res.json();

  const messages: GmailMessageSummary[] = (json.history ?? []).flatMap(
    (h: any) => h.messagesAdded?.map((m: any) => m.message) ?? [],
  );

  return { messages, newHistoryId: json.historyId ?? historyId };
}

export interface GmailMessageDetail {
  id: string;
  threadId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  bodyText: string;
  receivedAt: string;
}

export async function getGmailMessage(accessToken: string, messageId: string): Promise<GmailMessageDetail> {
  const res = await fetch(`${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Falha ao obter mensagem Gmail ${messageId}: ${res.status}`);
  const json = await res.json();

  const headers: { name: string; value: string }[] = json.payload?.headers ?? [];
  const fromHeader = headers.find((h) => h.name === 'From')?.value ?? '';
  const subjectHeader = headers.find((h) => h.name === 'Subject')?.value ?? null;
  const fromMatch = fromHeader.match(/^(.*?)\s*<(.+)>$/);

  return {
    id: json.id,
    threadId: json.threadId,
    fromEmail: fromMatch ? fromMatch[2] : fromHeader,
    fromName: fromMatch ? fromMatch[1].replace(/"/g, '').trim() || null : null,
    subject: subjectHeader,
    bodyText: extractPlainTextBody(json.payload),
    receivedAt: new Date(Number(json.internalDate)).toISOString(),
  };
}

function extractPlainTextBody(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  for (const part of payload.parts ?? []) {
    const found = extractPlainTextBody(part);
    if (found) return found;
  }
  return '';
}
