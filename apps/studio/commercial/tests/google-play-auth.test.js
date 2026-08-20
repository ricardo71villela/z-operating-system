import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import {
  createGooglePlayAccessTokenClient,
  createGoogleServiceAccountAssertion,
  GOOGLE_PLAY_ANDROID_PUBLISHER_SCOPE,
} from '../lib/google-play-auth.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccount = {
  clientEmail: 'billing@test-project.iam.gserviceaccount.com',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  privateKeyId: 'abcdef1234567890',
  tokenUri: 'https://oauth2.googleapis.com/token',
  projectId: 'test-project',
};

test('creates a valid RS256 service-account assertion with exact androidpublisher scope', () => {
  const jwt = createGoogleServiceAccountAssertion(serviceAccount, 1_800_000_000_000);
  const [headerRaw, claimsRaw, signatureRaw] = jwt.split('.');
  const header = JSON.parse(Buffer.from(headerRaw, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(claimsRaw, 'base64url').toString());
  assert.deepEqual(header, { alg: 'RS256', typ: 'JWT', kid: serviceAccount.privateKeyId });
  assert.equal(claims.iss, serviceAccount.clientEmail);
  assert.equal(claims.scope, GOOGLE_PLAY_ANDROID_PUBLISHER_SCOPE);
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.exp - claims.iat, 3600);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerRaw}.${claimsRaw}`);
  verifier.end();
  assert.equal(verifier.verify(publicKey, Buffer.from(signatureRaw, 'base64url')), true);
});

test('requests URL-encoded OAuth token and caches it before expiry', async () => {
  let calls = 0;
  let nowMs = 1_800_000_000_000;
  const client = createGooglePlayAccessTokenClient(
    { serviceAccount },
    {
      now: () => nowMs,
      fetchImpl: async (_url, options) => {
        calls += 1;
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
        const body = new URLSearchParams(options.body);
        assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        assert.ok(body.get('assertion'));
        return { ok: true, status: 200, json: async () => ({ access_token: 'token-1', token_type: 'Bearer', expires_in: 3600 }) };
      },
    },
  );
  assert.equal(await client.getAccessToken(), 'token-1');
  nowMs += 1000;
  assert.equal(await client.getAccessToken(), 'token-1');
  assert.equal(calls, 1);
});

test('marks OAuth transport and retryable HTTP failures for safe upstream retry', async () => {
  const network = createGooglePlayAccessTokenClient(
    { serviceAccount },
    { fetchImpl: async () => { throw new Error('down'); } },
  );
  await assert.rejects(() => network.getAccessToken(), (error) => error.retryable === true);
  const throttled = createGooglePlayAccessTokenClient(
    { serviceAccount },
    { fetchImpl: async () => ({ ok: false, status: 429 }) },
  );
  await assert.rejects(() => throttled.getAccessToken(), (error) => error.retryable === true && error.httpStatusCode === 429);
});
