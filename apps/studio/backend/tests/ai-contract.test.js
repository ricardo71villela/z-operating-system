const test = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../api/ai.js');
const { DEFAULT_MODEL, MAX_ALLOWED_TOKENS, AI_GATEWAY_API_URL } = handler._test;

class MockResponse {
  constructor() {
    this.statusCode = 0;
    this.headers = {};
    this.body = '';
  }
  writeHead(status, headers = {}) {
    this.statusCode = status;
    this.headers = { ...headers };
  }
  end(chunk = '') {
    this.body += chunk ? String(chunk) : '';
  }
  json() {
    return this.body ? JSON.parse(this.body) : null;
  }
}

function request({
  method = 'POST',
  origin = 'https://z-studio-web.vercel.app',
  body,
  ip = '203.0.113.10',
  token = 'jwt_test',
} = {}) {
  const headers = { origin, 'x-forwarded-for': ip };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return {
    method,
    headers,
    socket: { remoteAddress: ip },
    body,
  };
}

function mockResponse(status, payload, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    async json() { return payload; },
    async text() { return typeof payload === 'string' ? payload : JSON.stringify(payload); },
  };
}

function installPipeline(options = {}) {
  const calls = [];
  const defaults = {
    authStatus: 200,
    authData: { id: '11111111-1111-4111-8111-111111111111' },
    ensureStatus: 200,
    ensureData: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    reserveStatus: 200,
    reserveData: { plan_code: 'monthly', remaining_units: 4 },
    providerStatus: 200,
    providerData: {
      content: [{ type: 'text', text: 'OK' }],
      usage: { input_tokens: 10, output_tokens: 2 },
    },
    providerHeaders: {},
    finalizeStatus: 200,
    finalizeData: true,
    releaseStatus: 200,
    releaseData: true,
  };
  const cfg = { ...defaults, ...options };

  global.fetch = async (url, fetchOptions = {}) => {
    const stringUrl = String(url);
    let parsedBody = null;
    if (typeof fetchOptions.body === 'string') {
      try { parsedBody = JSON.parse(fetchOptions.body); } catch (_error) { parsedBody = fetchOptions.body; }
    }
    calls.push({ url: stringUrl, options: fetchOptions, body: parsedBody });

    if (stringUrl.endsWith('/auth/v1/user')) return mockResponse(cfg.authStatus, cfg.authData);
    if (stringUrl.endsWith('/rest/v1/rpc/zstudio_ensure_account')) return mockResponse(cfg.ensureStatus, cfg.ensureData);
    if (stringUrl.endsWith('/rest/v1/rpc/zstudio_reserve_ai_usage')) return mockResponse(cfg.reserveStatus, cfg.reserveData);
    if (stringUrl.endsWith('/rest/v1/rpc/zstudio_finalize_ai_usage')) return mockResponse(cfg.finalizeStatus, cfg.finalizeData);
    if (stringUrl.endsWith('/rest/v1/rpc/zstudio_release_ai_reservation')) return mockResponse(cfg.releaseStatus, cfg.releaseData);
    if (stringUrl === AI_GATEWAY_API_URL) return mockResponse(cfg.providerStatus, cfg.providerData, cfg.providerHeaders);
    throw new Error(`Unexpected fetch URL: ${stringUrl}`);
  };

  return calls;
}

const savedEnv = { ...process.env };
const savedFetch = global.fetch;
const savedConsole = { info: console.info, warn: console.warn, error: console.error };

test.beforeEach(() => {
  process.env = { ...savedEnv };
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon_test';
  process.env.AI_GATEWAY_API_KEY = 'gw_test';
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AI_MODEL;
  delete process.env.ALLOWED_ORIGINS;
  handler._test.resetRateLimit();
  handler._test.resetWarnings();
  global.fetch = savedFetch;
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
});

test.after(() => {
  process.env = savedEnv;
  global.fetch = savedFetch;
  Object.assign(console, savedConsole);
});

test('preflight allows Authorization header and never reaches auth/provider', async () => {
  let called = false;
  global.fetch = async () => { called = true; throw new Error('should not fetch'); };
  const res = new MockResponse();
  await handler(request({ method: 'OPTIONS', body: null, token: null }), res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://z-studio-web.vercel.app');
  assert.match(res.headers['Access-Control-Allow-Headers'], /Authorization/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(called, false);
});

test('unknown browser origin is rejected before auth or inference', async () => {
  let called = false;
  global.fetch = async () => { called = true; throw new Error('should not fetch'); };
  const res = new MockResponse();
  await handler(request({ origin: 'https://attacker.example', body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'ORIGIN_DENIED');
  assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(called, false);
});

test('missing Bearer token fails closed with 401 before any fetch', async () => {
  let called = false;
  global.fetch = async () => { called = true; throw new Error('should not fetch'); };
  const res = new MockResponse();
  await handler(request({ token: null, body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'AUTH_REQUIRED');
  assert.equal(res.headers['WWW-Authenticate'], 'Bearer');
  assert.equal(called, false);
});

test('invalid Supabase JWT fails with 401 before account, quota or provider', async () => {
  const calls = installPipeline({ authStatus: 401, authData: { message: 'invalid JWT' } });
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'AUTH_INVALID');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/user$/);
});

test('missing Supabase runtime config fails closed before any fetch', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('should not fetch'); };
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.json().code, 'AUTH_CONFIG_UNAVAILABLE');
  assert.equal(called, false);
});

test('missing gateway credential fails after authenticated Studio account but before quota/provider', async () => {
  delete process.env.AI_GATEWAY_API_KEY;
  const calls = installPipeline();
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.json().code, 'AI_CONFIG_UNAVAILABLE');
  assert.deepEqual(calls.map((c) => new URL(c.url).pathname), ['/auth/v1/user', '/rest/v1/rpc/zstudio_ensure_account']);
});

test('invalid request is rejected after auth but before quota reservation and provider', async () => {
  const calls = installPipeline();
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u', max_tokens: 1.5 } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'INVALID_REQUEST');
  assert.equal(calls.some((c) => c.url.includes('zstudio_reserve_ai_usage')), false);
  assert.equal(calls.some((c) => c.url === AI_GATEWAY_API_URL), false);
});

test('non-entitled authenticated user is denied before provider', async () => {
  const calls = installPipeline({
    reserveStatus: 400,
    reserveData: { code: 'P0001', message: 'AI_ENTITLEMENT_REQUIRED' },
  });
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'AI_ENTITLEMENT_REQUIRED');
  assert.equal(calls.some((c) => c.url === AI_GATEWAY_API_URL), false);
});

test('missing plan quota fails closed before provider without inventing a free/unlimited fallback', async () => {
  const calls = installPipeline({
    reserveStatus: 400,
    reserveData: { code: 'P0001', message: 'AI_QUOTA_NOT_CONFIGURED' },
  });
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().code, 'AI_QUOTA_UNAVAILABLE');
  assert.equal(calls.some((c) => c.url === AI_GATEWAY_API_URL), false);
});

test('exhausted plan quota returns 429 before provider', async () => {
  const calls = installPipeline({
    reserveStatus: 400,
    reserveData: { code: 'P0001', message: 'AI_QUOTA_EXCEEDED' },
  });
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.json().code, 'AI_QUOTA_EXCEEDED');
  assert.equal(calls.some((c) => c.url === AI_GATEWAY_API_URL), false);
});

test('successful request validates JWT, reserves quota, calls provider, then finalizes metering', async () => {
  const calls = installPipeline();
  const res = new MockResponse();
  await handler(request({ body: { system: 'system', user: 'user', max_tokens: 9999 } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().content[0].text, 'OK');
  assert.ok(res.json().request_id);
  assert.equal(res.headers['Cache-Control'], 'no-store');

  const paths = calls.map((c) => c.url === AI_GATEWAY_API_URL ? 'provider' : new URL(c.url).pathname);
  assert.deepEqual(paths, [
    '/auth/v1/user',
    '/rest/v1/rpc/zstudio_ensure_account',
    '/rest/v1/rpc/zstudio_reserve_ai_usage',
    'provider',
    '/rest/v1/rpc/zstudio_finalize_ai_usage',
  ]);

  const authCall = calls[0];
  assert.equal(authCall.options.headers.Authorization, 'Bearer jwt_test');
  assert.equal(authCall.options.headers.apikey, 'anon_test');

  const reserveCall = calls[2];
  assert.match(reserveCall.body.p_request_id, /^[0-9a-f-]{36}$/i);

  const providerCall = calls[3];
  assert.equal(providerCall.options.headers['x-api-key'], 'gw_test');
  assert.equal(providerCall.body.model, DEFAULT_MODEL);
  assert.equal(providerCall.body.max_tokens, MAX_ALLOWED_TOKENS);

  const finalizeCall = calls[4];
  assert.equal(finalizeCall.body.p_request_id, reserveCall.body.p_request_id);
  assert.equal(finalizeCall.body.p_model, DEFAULT_MODEL);
  assert.equal(finalizeCall.body.p_input_tokens, 10);
  assert.equal(finalizeCall.body.p_output_tokens, 2);
});

test('provider failure releases reservation and maps upstream detail safely', async () => {
  const calls = installPipeline({
    providerStatus: 403,
    providerData: { error: { message: 'secret billing detail' } },
  });
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().code, 'AI_AUTH_OR_BILLING_UNAVAILABLE');
  assert.equal(res.body.includes('secret billing detail'), false);
  const release = calls.find((c) => c.url.includes('zstudio_release_ai_reservation'));
  assert.ok(release);
  assert.match(release.body.p_request_id, /^[0-9a-f-]{36}$/i);
});

test('meter finalize failure never returns unmetered provider content', async () => {
  const calls = installPipeline({ finalizeStatus: 503, finalizeData: { message: 'db unavailable' } });
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().code, 'AI_METERING_UNAVAILABLE');
  assert.equal(res.body.includes('OK'), false);
  assert.equal(calls.some((c) => c.url === AI_GATEWAY_API_URL), true);
});

test('legacy gateway key remains temporary compatibility fallback after paid-access gates', async () => {
  delete process.env.AI_GATEWAY_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'legacy_gateway_key';
  const calls = installPipeline();
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 200);
  const provider = calls.find((c) => c.url === AI_GATEWAY_API_URL);
  assert.equal(provider.options.headers['x-api-key'], 'legacy_gateway_key');
});

test('AI_MODEL validation and local 12/minute backstop remain intact', () => {
  process.env.AI_MODEL = 'anthropic/claude-haiku-4.5';
  assert.equal(handler._test.getModel(), 'anthropic/claude-haiku-4.5');
  process.env.AI_MODEL = 'not a valid model';
  assert.equal(handler._test.getModel(), DEFAULT_MODEL);

  for (let i = 0; i < 12; i++) assert.equal(handler._test.checkRateLimit('198.51.100.20'), true);
  assert.equal(handler._test.checkRateLimit('198.51.100.20'), false);
});
