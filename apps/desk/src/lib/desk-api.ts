import 'server-only';
import { cookies } from 'next/headers';
import { createClient } from './supabase/server';

export async function deskApiFetch(path: string, init: RequestInit = {}) {
  const apiUrl = process.env.DESK_API_URL;
  if (!apiUrl) return null;

  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return null;

  const cookieStore = await cookies();
  const organisationId = cookieStore.get('zos_organisation_id')?.value;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (organisationId) headers.set('X-ZOS-Organisation-Id', organisationId);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return fetch(`${apiUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}
