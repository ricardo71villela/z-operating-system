// Z Studio — production AI gateway boundary (Vercel Function, Node.js runtime)
// Secrets stay server-side. AI inference is available only to authenticated,
// entitled Studio users with an atomically reserved metered usage unit.

const { randomUUID } = require('node:crypto');

const AI_GATEWAY_API_URL = 'https://ai-gateway.vercel.sh/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'anthropic/claude-3-haiku';
const MAX_ALLOWED_TOKENS = 1200;
const REQUEST_TIMEOUT_MS = 20000;
const AUTH_TIMEOUT_MS = 8000;
const SUPABASE_TIMEOUT_MS = 8000;

const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://z-studio-web.vercel.app',
  'capacitor://localhost',
  'https://localhost',
]);

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 12;
let legacyKeyWarningEmitted = false;

function getAllowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  return getAllowedOrigins().has(origin);
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (origin && isOriginAllowed(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function writeJson(res, status, payload, origin, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(origin),
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function checkRateLimit(ip) {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function getGatewayApiKey() {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  if (process.env.ANTHROPIC_API_KEY) {
    if (!legacyKeyWarningEmitted) {
      console.warn('[api/ai] Legacy ANTHROPIC_API_KEY used as AI Gateway credential; migrate to AI_GATEWAY_API_KEY.');
      legacyKeyWarningEmitted = true;
    }
    return process.env.ANTHROPIC_API_KEY;
  }
  return '';
}

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !apiKey || !/^https:\/\//i.test(url)) return null;
  return { url, apiKey };
}

function getBearerToken(req) {
  const raw = String(req.headers.authorization || req.headers.Authorization || '').trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match && match[1].trim() ? match[1].trim() : '';
}

function getModel() {
  const configured = String(process.env.AI_MODEL || '').trim();
  if (!configured) return DEFAULT_MODEL;
  if (!/^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(configured)) {
    console.warn('[api/ai] Ignoring invalid AI_MODEL value; using default model.');
    return DEFAULT_MODEL;
  }
  return configured;
}

function parseBody(req) {
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Corpo do pedido inválido.';
  if (typeof body.system !== 'string' || body.system.trim().length === 0) return 'Campo "system" em falta ou inválido.';
  if (typeof body.user !== 'string' || body.user.trim().length === 0) return 'Campo "user" em falta ou inválido.';
  if (body.system.length > 4000) return 'Campo "system" excede o tamanho máximo permitido.';
  if (body.user.length > 8000) return 'Campo "user" excede o tamanho máximo permitido.';
  if (body.max_tokens !== undefined) {
    if (!Number.isInteger(body.max_tokens) || body.max_tokens <= 0) return 'Campo "max_tokens" inválido.';
  }
  return null;
}

function safeUpstreamStatus(status) {
  if (status === 429) {
    return { status: 429, code: 'AI_RATE_LIMITED', message: 'O serviço de IA está temporariamente ocupado. Tenta novamente dentro de instantes.' };
  }
  if (status === 401 || status === 403) {
    return { status: 503, code: 'AI_AUTH_OR_BILLING_UNAVAILABLE', message: 'O serviço de IA está temporariamente indisponível.' };
  }
  if (status >= 500) {
    return { status: 503, code: 'AI_UPSTREAM_UNAVAILABLE', message: 'O serviço de IA está temporariamente indisponível.' };
  }
  return { status: 502, code: 'AI_UPSTREAM_ERROR', message: 'O serviço de IA não respondeu corretamente. Tenta outra vez.' };
}

function logEvent(level, event, fields = {}) {
  const payload = { component: 'zstudio-ai', event, ...fields };
  const fn = console[level] || console.log;
  fn(JSON.stringify(payload));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function supabaseHeaders(config, token, includeJson = false) {
  const headers = {
    apikey: config.apiKey,
    Authorization: `Bearer ${token}`,
  };
  if (includeJson) headers['Content-Type'] = 'application/json';
  return headers;
}

async function validateSupabaseUser(config, token) {
  try {
    const response = await fetchWithTimeout(
      `${config.url}/auth/v1/user`,
      { method: 'GET', headers: supabaseHeaders(config, token) },
      AUTH_TIMEOUT_MS,
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return { ok: false, kind: 'invalid_token' };
      return { ok: false, kind: 'unavailable', status: response.status };
    }
    const data = await readJsonSafe(response);
    if (!data || typeof data.id !== 'string' || !data.id) return { ok: false, kind: 'invalid_token' };
    return { ok: true };
  } catch (error) {
    return { ok: false, kind: 'unavailable', timeout: error?.name === 'AbortError' };
  }
}

async function callSupabaseRpc(config, token, rpcName, body) {
  try {
    const response = await fetchWithTimeout(
      `${config.url}/rest/v1/rpc/${rpcName}`,
      {
        method: 'POST',
        headers: supabaseHeaders(config, token, true),
        body: JSON.stringify(body || {}),
      },
      SUPABASE_TIMEOUT_MS,
    );
    const data = await readJsonSafe(response);
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: null, timeout: error?.name === 'AbortError' };
  }
}

function rpcErrorTag(result) {
  const message = String(result?.data?.message || '');
  if (message.includes('AI_ENTITLEMENT_REQUIRED')) return 'AI_ENTITLEMENT_REQUIRED';
  if (message.includes('AI_QUOTA_NOT_CONFIGURED')) return 'AI_QUOTA_NOT_CONFIGURED';
  if (message.includes('AI_QUOTA_EXCEEDED')) return 'AI_QUOTA_EXCEEDED';
  if (message.includes('AI_RESERVATION_EXPIRED')) return 'AI_RESERVATION_EXPIRED';
  return '';
}

async function ensureStudioAccount(config, token) {
  return callSupabaseRpc(config, token, 'zstudio_ensure_account', {});
}

async function reserveAiUsage(config, token, requestId) {
  return callSupabaseRpc(config, token, 'zstudio_reserve_ai_usage', { p_request_id: requestId });
}

async function finalizeAiUsage(config, token, requestId, model, usage) {
  return callSupabaseRpc(config, token, 'zstudio_finalize_ai_usage', {
    p_request_id: requestId,
    p_model: model,
    p_input_tokens: Number.isInteger(usage?.input_tokens) ? usage.input_tokens : null,
    p_output_tokens: Number.isInteger(usage?.output_tokens) ? usage.output_tokens : null,
  });
}

async function releaseAiReservation(config, token, requestId, reason) {
  const result = await callSupabaseRpc(config, token, 'zstudio_release_ai_reservation', { p_request_id: requestId });
  if (!result.ok) {
    logEvent('error', 'reservation_release_failed', { requestId, reason, status: result.status || null });
  }
  return result;
}

async function handler(req, res) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const origin = String(req.headers.origin || '');

  if (origin && !isOriginAllowed(origin)) {
    logEvent('warn', 'origin_denied', { requestId, origin });
    writeJson(res, 403, { error: 'Origem não autorizada.', code: 'ORIGIN_DENIED', request_id: requestId }, origin);
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    writeJson(res, 405, { error: 'Método não permitido. Usa POST.', code: 'METHOD_NOT_ALLOWED', request_id: requestId }, origin, { Allow: 'POST, OPTIONS' });
    return;
  }

  const supabase = getSupabaseConfig();
  if (!supabase) {
    logEvent('error', 'supabase_config_missing', { requestId });
    writeJson(res, 500, { error: 'Autenticação temporariamente indisponível.', code: 'AUTH_CONFIG_UNAVAILABLE', request_id: requestId }, origin);
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    writeJson(res, 401, { error: 'Autenticação necessária.', code: 'AUTH_REQUIRED', request_id: requestId }, origin, { 'WWW-Authenticate': 'Bearer' });
    return;
  }

  const authResult = await validateSupabaseUser(supabase, token);
  if (!authResult.ok) {
    if (authResult.kind === 'invalid_token') {
      writeJson(res, 401, { error: 'Sessão inválida ou expirada.', code: 'AUTH_INVALID', request_id: requestId }, origin, { 'WWW-Authenticate': 'Bearer' });
      return;
    }
    logEvent('error', 'supabase_auth_unavailable', { requestId, status: authResult.status || null, timeout: Boolean(authResult.timeout) });
    writeJson(res, 503, { error: 'Autenticação temporariamente indisponível.', code: 'AUTH_UNAVAILABLE', request_id: requestId }, origin);
    return;
  }

  const accountResult = await ensureStudioAccount(supabase, token);
  if (!accountResult.ok) {
    logEvent('error', 'studio_account_unavailable', { requestId, status: accountResult.status || null });
    writeJson(res, 503, { error: 'Não foi possível validar o acesso ao Z Studio.', code: 'STUDIO_ACCOUNT_UNAVAILABLE', request_id: requestId }, origin);
    return;
  }

  const gatewayApiKey = getGatewayApiKey();
  if (!gatewayApiKey) {
    logEvent('error', 'gateway_key_missing', { requestId });
    writeJson(res, 500, { error: 'Serviço de IA indisponível de momento.', code: 'AI_CONFIG_UNAVAILABLE', request_id: requestId }, origin);
    return;
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    logEvent('warn', 'local_rate_limit', { requestId });
    writeJson(
      res,
      429,
      { error: 'Demasiados pedidos. Tenta outra vez dentro de um minuto.', code: 'AI_RATE_LIMITED', request_id: requestId },
      origin,
      { 'Retry-After': '60' },
    );
    return;
  }

  let body;
  try {
    body = parseBody(req);
  } catch (_error) {
    writeJson(res, 400, { error: 'JSON inválido no corpo do pedido.', code: 'INVALID_JSON', request_id: requestId }, origin);
    return;
  }

  const validationError = validateBody(body);
  if (validationError) {
    writeJson(res, 400, { error: validationError, code: 'INVALID_REQUEST', request_id: requestId }, origin);
    return;
  }

  const reservation = await reserveAiUsage(supabase, token, requestId);
  if (!reservation.ok) {
    const tag = rpcErrorTag(reservation);
    if (tag === 'AI_ENTITLEMENT_REQUIRED') {
      writeJson(res, 403, { error: 'O plano atual não inclui acesso ativo à IA.', code: 'AI_ENTITLEMENT_REQUIRED', request_id: requestId }, origin);
      return;
    }
    if (tag === 'AI_QUOTA_NOT_CONFIGURED') {
      logEvent('error', 'quota_not_configured', { requestId });
      writeJson(res, 503, { error: 'A quota de IA está temporariamente indisponível.', code: 'AI_QUOTA_UNAVAILABLE', request_id: requestId }, origin);
      return;
    }
    if (tag === 'AI_QUOTA_EXCEEDED') {
      writeJson(res, 429, { error: 'A quota de IA do período foi atingida.', code: 'AI_QUOTA_EXCEEDED', request_id: requestId }, origin);
      return;
    }
    logEvent('error', 'reservation_failed', { requestId, status: reservation.status || null });
    writeJson(res, 503, { error: 'Não foi possível validar a quota de IA.', code: 'AI_METERING_UNAVAILABLE', request_id: requestId }, origin);
    return;
  }

  const maxTokens = Math.min(body.max_tokens || 900, MAX_ALLOWED_TOKENS);
  const model = getModel();

  try {
    const upstream = await fetchWithTimeout(
      AI_GATEWAY_API_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': gatewayApiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: body.system,
          messages: [{ role: 'user', content: body.user }],
        }),
      },
      REQUEST_TIMEOUT_MS,
    );

    if (!upstream.ok) {
      await releaseAiReservation(supabase, token, requestId, 'upstream_error');
      const errText = await upstream.text().catch(() => '');
      const mapped = safeUpstreamStatus(upstream.status);
      logEvent('error', 'upstream_error', {
        requestId,
        model,
        status: upstream.status,
        durationMs: Date.now() - startedAt,
        detail: errText.slice(0, 500),
      });
      const retryAfter = upstream.headers?.get?.('retry-after');
      const extraHeaders = retryAfter ? { 'Retry-After': retryAfter } : {};
      writeJson(res, mapped.status, { error: mapped.message, code: mapped.code, request_id: requestId }, origin, extraHeaders);
      return;
    }

    const data = await readJsonSafe(upstream);
    if (!data || !Array.isArray(data.content)) {
      await releaseAiReservation(supabase, token, requestId, 'invalid_upstream_payload');
      logEvent('error', 'invalid_upstream_payload', { requestId, model, durationMs: Date.now() - startedAt });
      writeJson(res, 502, { error: 'O serviço de IA devolveu uma resposta inválida.', code: 'AI_INVALID_RESPONSE', request_id: requestId }, origin);
      return;
    }

    const finalized = await finalizeAiUsage(supabase, token, requestId, model, data.usage || {});
    if (!finalized.ok || finalized.data !== true) {
      logEvent('error', 'meter_finalize_failed', { requestId, model, status: finalized.status || null });
      writeJson(res, 503, { error: 'Não foi possível concluir a contabilização da utilização.', code: 'AI_METERING_UNAVAILABLE', request_id: requestId }, origin);
      return;
    }

    logEvent('info', 'success', {
      requestId,
      model,
      durationMs: Date.now() - startedAt,
      systemChars: body.system.length,
      userChars: body.user.length,
      maxTokens,
      inputTokens: data.usage?.input_tokens ?? null,
      outputTokens: data.usage?.output_tokens ?? null,
      planCode: typeof reservation.data?.plan_code === 'string' ? reservation.data.plan_code : null,
      remainingUnits: Number.isInteger(reservation.data?.remaining_units) ? reservation.data.remaining_units : null,
    });

    writeJson(res, 200, { content: data.content, request_id: requestId }, origin);
  } catch (error) {
    await releaseAiReservation(supabase, token, requestId, error?.name === 'AbortError' ? 'upstream_timeout' : 'unexpected_error');
    if (error?.name === 'AbortError') {
      logEvent('error', 'upstream_timeout', { requestId, model, durationMs: Date.now() - startedAt });
      writeJson(res, 504, { error: 'O serviço de IA demorou demasiado tempo a responder.', code: 'AI_TIMEOUT', request_id: requestId }, origin);
      return;
    }
    logEvent('error', 'unexpected_error', { requestId, model, durationMs: Date.now() - startedAt, message: String(error?.message || error).slice(0, 300) });
    writeJson(res, 500, { error: 'Erro inesperado no servidor.', code: 'AI_INTERNAL_ERROR', request_id: requestId }, origin);
  }
}

module.exports = handler;
module.exports._test = {
  AI_GATEWAY_API_URL,
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_MODEL,
  MAX_ALLOWED_TOKENS,
  checkRateLimit,
  corsHeaders,
  getAllowedOrigins,
  getBearerToken,
  getGatewayApiKey,
  getModel,
  getSupabaseConfig,
  isOriginAllowed,
  rpcErrorTag,
  safeUpstreamStatus,
  validateBody,
  resetRateLimit() { rateLimitMap.clear(); },
  resetWarnings() { legacyKeyWarningEmitted = false; },
};
