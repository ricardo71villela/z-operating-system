// Z Studio — production AI gateway boundary (Vercel Function, Node.js runtime)
// Secrets stay server-side. This endpoint deliberately exposes only a narrow,
// text-only contract used by the Z Studio caption/translation features.

const { randomUUID } = require('node:crypto');

const AI_GATEWAY_API_URL = 'https://ai-gateway.vercel.sh/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'anthropic/claude-3-haiku';
const MAX_ALLOWED_TOKENS = 1200;
const REQUEST_TIMEOUT_MS = 20000;

// Known production/native origins. ALLOWED_ORIGINS may add future custom domains,
// but an absent environment variable must never turn CORS into allow-all.
const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://z-studio-web.vercel.app',
  'capacitor://localhost',
  'https://localhost',
]);

// Secondary per-instance guard. The authoritative distributed limit belongs in
// Vercel WAF (A1.4C); this map remains useful as a cheap local backstop.
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
  if (!origin) return true; // non-browser/server-to-server request; CORS is not applicable
  return getAllowedOrigins().has(origin);
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
  } catch (error) {
    writeJson(res, 400, { error: 'JSON inválido no corpo do pedido.', code: 'INVALID_JSON', request_id: requestId }, origin);
    return;
  }

  const validationError = validateBody(body);
  if (validationError) {
    writeJson(res, 400, { error: validationError, code: 'INVALID_REQUEST', request_id: requestId }, origin);
    return;
  }

  const maxTokens = Math.min(body.max_tokens || 900, MAX_ALLOWED_TOKENS);
  const model = getModel();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(AI_GATEWAY_API_URL, {
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
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!upstream.ok) {
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

    const data = await upstream.json();
    if (!data || !Array.isArray(data.content)) {
      logEvent('error', 'invalid_upstream_payload', { requestId, model, durationMs: Date.now() - startedAt });
      writeJson(res, 502, { error: 'O serviço de IA devolveu uma resposta inválida.', code: 'AI_INVALID_RESPONSE', request_id: requestId }, origin);
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
    });

    writeJson(res, 200, { content: data.content, request_id: requestId }, origin);
  } catch (error) {
    clearTimeout(timeoutId);
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
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_MODEL,
  MAX_ALLOWED_TOKENS,
  checkRateLimit,
  corsHeaders,
  getAllowedOrigins,
  getGatewayApiKey,
  getModel,
  isOriginAllowed,
  safeUpstreamStatus,
  validateBody,
  resetRateLimit() { rateLimitMap.clear(); },
  resetWarnings() { legacyKeyWarningEmitted = false; },
};
