import test from 'node:test';
import assert from 'node:assert/strict';
import { createGooglePlayRtdnHttpHandler } from '../lib/google-play-rtdn-http.js';
import { GooglePlayRtdnAuthError } from '../lib/google-play-rtdn-auth.js';
import { GooglePlayRtdnParseError } from '../lib/google-play-rtdn-parser.js';
import { GooglePlayRtdnAuthorityRpcError } from '../lib/google-play-rtdn-authority-client.js';

function responseRecorder() {
  return {
    status: null, headers: {}, ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); },
    end() { this.ended = true; },
  };
}
function deps(overrides = {}) {
  const calls = [];
  return {
    calls,
    loadConfig: () => ({ ok: true }),
    verifyOidc: async () => { calls.push('verifyOidc'); },
    parseEnvelope: () => ({ messageId: '1', kind: 'test', eventTimeMs: 1800000000000 }),
    createCurrentStateClient: () => ({ name: 'current' }),
    createRtdnAuthorityClient: () => ({ name: 'rtdn' }),
    createPurchaseAuthorityClient: () => ({ name: 'purchase' }),
    createWriterClient: () => ({ name: 'writer' }),
    reconcileRtdn: async (args) => { calls.push(['reconcile', args.trigger.kind]); return { result: 'ignored' }; },
    ...overrides,
  };
}
async function run(d, req = { method: 'POST', headers: { authorization: 'Bearer aaa.bbb.ccc' }, body: {} }) {
  const res = responseRecorder();
  const handler = createGooglePlayRtdnHttpHandler(d);
  await handler(req, res);
  return res;
}

test('authenticates before parsing and acknowledges successful Pub/Sub delivery with 204', async () => {
  const d = deps({
    parseEnvelope: () => { d.calls.push('parse'); return { messageId: '1', kind: 'test', eventTimeMs: 1800000000000 }; },
  });
  const res = await run(d);
  assert.equal(res.status, 204);
  assert.equal(res.ended, true);
  assert.deepEqual(d.calls.slice(0,2), ['verifyOidc','parse']);
});

test('missing or invalid OIDC is rejected before RTDN parsing', async () => {
  let parsed = false;
  let d = deps({ parseEnvelope: () => { parsed = true; return {}; } });
  let res = await run(d, { method: 'POST', headers: {}, body: {} });
  assert.equal(res.status, 401);
  assert.equal(parsed, false);

  d = deps({
    verifyOidc: async () => { throw new GooglePlayRtdnAuthError('GOOGLE_PLAY_RTDN_OIDC_TOKEN_REJECTED'); },
    parseEnvelope: () => { parsed = true; return {}; },
  });
  res = await run(d);
  assert.equal(res.status, 401);
});

test('transient OIDC/provider/database failures return 503 for Pub/Sub retry', async () => {
  let d = deps({ verifyOidc: async () => { throw new GooglePlayRtdnAuthError('down', { retryable: true }); } });
  let res = await run(d);
  assert.equal(res.status, 503);
  assert.equal(res.headers['Retry-After'], '5');

  d = deps({ reconcileRtdn: async () => { throw new GooglePlayRtdnAuthorityRpcError('db', { retryable: true }); } });
  res = await run(d);
  assert.equal(res.status, 503);
});

test('malformed authenticated envelope is 400 and permanent authority conflict is 409', async () => {
  let d = deps({ parseEnvelope: () => { throw new GooglePlayRtdnParseError('bad'); } });
  let res = await run(d);
  assert.equal(res.status, 400);

  d = deps({ reconcileRtdn: async () => { throw new GooglePlayRtdnAuthorityRpcError('conflict', { databaseCode: 'GOOGLE_PLAY_RTDN_EXTERNAL_IDENTITY_CONFLICT' }); } });
  res = await run(d);
  assert.equal(res.status, 409);
});

test('non-POST methods never invoke OIDC or provider dependencies', async () => {
  const d = deps();
  const res = await run(d, { method: 'GET', headers: {}, body: {} });
  assert.equal(res.status, 405);
  assert.equal(d.calls.length, 0);
});
