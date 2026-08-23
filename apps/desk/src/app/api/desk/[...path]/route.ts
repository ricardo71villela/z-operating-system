import { NextRequest, NextResponse } from 'next/server';
import { deskApiFetch } from '@/lib/desk-api';

const AUTHORITY_KEYS = new Set(['tenantId', 'tenant_id', 'workspaceId', 'workspace_id', 'createdBy', 'created_by']);

function safeSearchParams(request: NextRequest) {
  const params = new URLSearchParams();
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (!AUTHORITY_KEYS.has(key)) params.append(key, value);
  }
  return params;
}

async function safeBody(request: NextRequest): Promise<string | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return request.text();
  const text = await request.text();
  if (!text) return undefined;
  const parsed = JSON.parse(text) as Record<string, unknown>;
  for (const key of AUTHORITY_KEYS) delete parsed[key];
  return JSON.stringify(parsed);
}

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const query = safeSearchParams(request).toString();
  const target = `${path.join('/')}${query ? `?${query}` : ''}`;
  const body = await safeBody(request);
  const response = await deskApiFetch(target, {
    method: request.method,
    body,
    headers: body ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
  });

  if (!response) return NextResponse.json({ error: 'desk_session_required' }, { status: 401 });
  const payload = await response.text();
  return new NextResponse(payload, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
  });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
