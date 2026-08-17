const test = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../api/ai.js');
const { DEFAULT_MODEL, MAX_ALLOWED_TOKENS } = handler._test;

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

function request({ method = 'POST', origin = 'https://z-studio-web.vercel.app', body, ip = '203.0.113.10' } = {}) {
  return {
    method,
    headers: {
      origin,
      'x-forwarded-for': ip,
    },
    socket: { remoteAddress: ip },
    body,
  };
}

function upstreamResponse(status, payload, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    async json() { return payload; },
    async text() { return typeof payload === 'string' ? payload : JSON.stringify(payload); },
  };
}

const savedEnv = { ...process.env };
const savedFetch = global.fetch;
const savedConsole = { info: console.info, warn: console.warn, error: console.error };

test.beforeEach(() => {
  process.env = { ...savedEnv };
  delete process.env.AI_GATEWAY_API_KEY;
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

test('preflight from canonical web origin is allowed and non-cacheable', async () => {
  let called = false;
  global.fetch = async () => { called = true; throw new Error('should not fetch'); };
  const res = new MockResponse();
  await handler(request({ method: 'OPTIONS', body: null }), res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://z-studio-web.vercel.app');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers.Vary, 'Origin');
  assert.equal(called, false);
});

test('unknown browser origin is rejected before inference', async () => {
  process.env.AI_GATEWAY_API_KEY = 'gw_test';
  let called = false;
  global.fetch = async () => { called = true; throw new Error('should not fetch'); };
  const res = new MockResponse();
  await handler(request({ origin: 'https://attacker.example', body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'ORIGIN_DENIED');
  assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(called, false);
});

test('ALLOWED_ORIGINS adds a custom production domain without weakening defaults', async () => {
  process.env.ALLOWED_ORIGINS = 'https://studio.example, https://another.example';
  assert.equal(handler._test.isOriginAllowed('https://studio.example'), true);
  assert.equal(handler._test.isOriginAllowed('https://z-studio-web.vercel.app'), true);
  assert.equal(handler._test.isOriginAllowed('https://attacker.example'), false);
});

test('missing gateway credential fails closed before provider call', async () => {
  let called = false;
  global.fetch = async () => { called = true; throw new Error('should not fetch'); };
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.json().code, 'AI_CONFIG_UNAVAILABLE');
  assert.equal(called, false);
});

test('request validation rejects non-integer max_tokens', async () => {
  process.env.AI_GATEWAY_API_KEY = 'gw_test';
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u', max_tokens: 1.5 } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'INVALID_REQUEST');
});

test('successful request uses AI Gateway key, configured contract and hard token cap', async () => {
  process.env.AI_GATEWAY_API_KEY = 'gw_test';
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return upstreamResponse(200, {
      content: [{ type: 'text', text: 'OK' }],
      usage: { input_tokens: 10, output_tokens: 2 },
    });
  };
  const res = new MockResponse();
  await handler(request({ body: { system: 'system', user: 'user', max_tokens: 9999 } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().content[0].text, 'OK');
  assert.ok(res.json().request_id);
  assert.equal(captured.url, 'https://ai-gateway.vercel.sh/v1/messages');
  assert.equal(captured.options.headers['x-api-key'], 'gw_test');
  assert.equal(captured.body.model, DEFAULT_MODEL);
  assert.equal(captured.body.max_tokens, MAX_ALLOWED_TOKENS);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('AI_MODEL is configurable but invalid model strings fail back to authority default', () => {
  process.env.AI_MODEL = 'anthropic/claude-haiku-4.5';
  assert.equal(handler._test.getModel(), 'anthropic/claude-haiku-4.5');
  process.env.AI_MODEL = 'not a valid model';
  assert.equal(handler._test.getModel(), DEFAULT_MODEL);
});

test('legacy ANTHROPIC_API_KEY remains a temporary compatibility fallback', async () => {
  process.env.ANTHROPIC_API_KEY = 'legacy_gateway_key';
  let seenKey;
  global.fetch = async (_url, options) => {
    seenKey = options.headers['x-api-key'];
    return upstreamResponse(200, { content: [{ type: 'text', text: 'OK' }], usage: {} });
  };
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(seenKey, 'legacy_gateway_key');
});

test('provider auth/billing errors are mapped to a safe 503 without leaking detail', async () => {
  process.env.AI_GATEWAY_API_KEY = 'gw_test';
  global.fetch = async () => upstreamResponse(403, { error: { message: 'secret billing detail' } });
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().code, 'AI_AUTH_OR_BILLING_UNAVAILABLE');
  assert.equal(res.body.includes('secret billing detail'), false);
});

test('provider 429 preserves a safe rate-limit contract', async () => {
  process.env.AI_GATEWAY_API_KEY = 'gw_test';
  global.fetch = async () => upstreamResponse(429, { error: 'busy' }, { 'retry-after': '9' });
  const res = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' } }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.json().code, 'AI_RATE_LIMITED');
  assert.equal(res.headers['Retry-After'], '9');
});

test('local per-instance guard remains a secondary 12/minute backstop', async () => {
  process.env.AI_GATEWAY_API_KEY = 'gw_test';
  global.fetch = async () => upstreamResponse(200, { content: [{ type: 'text', text: 'OK' }], usage: {} });
  for (let i = 0; i < 12; i++) {
    const res = new MockResponse();
    await handler(request({ body: { system: 's', user: 'u' }, ip: '198.51.100.20' }), res);
    assert.equal(res.statusCode, 200);
  }
  const blocked = new MockResponse();
  await handler(request({ body: { system: 's', user: 'u' }, ip: '198.51.100.20' }), blocked);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'], '60');
});
