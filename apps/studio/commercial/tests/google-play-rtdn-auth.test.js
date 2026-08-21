import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGooglePubSubOidcAuthorization } from '../lib/google-play-rtdn-auth.js';

const config = {
  pubsubAudience: 'https://commercial.example/api/google/play/rtdn',
  pubsubServiceAccountEmail: 'rtdn@zstudio-billing-test.iam.gserviceaccount.com',
};
const now = 1_800_000_000_000;
function goodClaims(overrides = {}) {
  const nowSec = Math.floor(now / 1000);
  return {
    alg: 'RS256',
    iss: 'https://accounts.google.com',
    aud: config.pubsubAudience,
    email: config.pubsubServiceAccountEmail,
    email_verified: 'true',
    sub: '123456789012345678901',
    iat: nowSec - 30,
    exp: nowSec + 3500,
    ...overrides,
  };
}

test('verifies Pub/Sub OIDC through Google tokeninfo and returns no raw token', async () => {
  const token = 'aaa.bbb.ccc';
  const seen = [];
  const result = await verifyGooglePubSubOidcAuthorization(`Bearer ${token}`, config, {
    now: () => now,
    fetchImpl: async (url, options) => {
      seen.push([url, options]);
      return { ok: true, status: 200, json: async () => goodClaims() };
    },
  });
  assert.equal(result.verification, 'verified_google_pubsub_oidc');
  assert.equal(result.audience, config.pubsubAudience);
  assert.equal(result.serviceAccountEmail, config.pubsubServiceAccountEmail);
  assert.equal(result.rawTokenIncluded, false);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.match(seen[0][0], /^https:\/\/oauth2\.googleapis\.com\/tokeninfo\?id_token=/);
  assert.equal(seen[0][1].method, 'GET');
});

test('fails closed on audience, service account email, issuer, signature algorithm or email verification mismatch', async () => {
  for (const overrides of [
    { aud: 'https://wrong.example' },
    { email: 'other@zstudio-billing-test.iam.gserviceaccount.com' },
    { iss: 'https://evil.example' },
    { alg: 'HS256' },
    { email_verified: 'false' },
  ]) {
    await assert.rejects(
      () => verifyGooglePubSubOidcAuthorization('Bearer aaa.bbb.ccc', config, {
        now: () => now,
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => goodClaims(overrides) }),
      }),
      /GOOGLE_PLAY_RTDN_OIDC_CLAIMS_INVALID/,
    );
  }
});

test('classifies tokeninfo transport/throttling as retryable but invalid tokens as permanent', async () => {
  await assert.rejects(
    () => verifyGooglePubSubOidcAuthorization('Bearer aaa.bbb.ccc', config, {
      fetchImpl: async () => { throw new Error('down'); },
    }),
    (error) => error.retryable === true,
  );
  await assert.rejects(
    () => verifyGooglePubSubOidcAuthorization('Bearer aaa.bbb.ccc', config, {
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    (error) => error.retryable === true && error.httpStatusCode === 503,
  );
  await assert.rejects(
    () => verifyGooglePubSubOidcAuthorization('Bearer aaa.bbb.ccc', config, {
      fetchImpl: async () => ({ ok: false, status: 400 }),
    }),
    (error) => error.retryable === false && error.httpStatusCode === 400,
  );
});
