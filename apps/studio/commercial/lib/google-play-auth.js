import { createSign } from 'node:crypto';

export const GOOGLE_PLAY_ANDROID_PUBLISHER_SCOPE =
  'https://www.googleapis.com/auth/androidpublisher';
const JWT_AUDIENCE = 'https://oauth2.googleapis.com/token';
const JWT_LIFETIME_SECONDS = 3600;
const CACHE_SAFETY_SECONDS = 60;

export class GooglePlayAuthError extends Error {
  constructor(code, { retryable = false, httpStatusCode = null, cause = null } = {}) {
    super(code);
    this.name = 'GooglePlayAuthError';
    this.code = code;
    this.retryable = retryable;
    this.httpStatusCode = httpStatusCode;
    if (cause) this.cause = cause;
  }
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function createGoogleServiceAccountAssertion(serviceAccount, nowMs = Date.now()) {
  if (!serviceAccount || typeof serviceAccount !== 'object') {
    throw new GooglePlayAuthError('GOOGLE_PLAY_SERVICE_ACCOUNT_REQUIRED');
  }
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) {
    throw new GooglePlayAuthError('GOOGLE_PLAY_SERVICE_ACCOUNT_CLOCK_INVALID');
  }
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: serviceAccount.privateKeyId,
  };
  const claims = {
    iss: serviceAccount.clientEmail,
    scope: GOOGLE_PLAY_ANDROID_PUBLISHER_SCOPE,
    aud: JWT_AUDIENCE,
    iat: nowSeconds,
    exp: nowSeconds + JWT_LIFETIME_SECONDS,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  let signature;
  try {
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    signature = signer.sign(serviceAccount.privateKey);
  } catch (cause) {
    throw new GooglePlayAuthError('GOOGLE_PLAY_SERVICE_ACCOUNT_SIGNING_FAILED', { cause });
  }
  return `${signingInput}.${signature.toString('base64url')}`;
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function createGooglePlayAccessTokenClient(
  config,
  { fetchImpl = fetch, now = () => Date.now() } = {},
) {
  if (!config?.serviceAccount) {
    throw new GooglePlayAuthError('GOOGLE_PLAY_SERVICE_ACCOUNT_REQUIRED');
  }
  let cached = null;

  return Object.freeze({
    async getAccessToken() {
      const nowMs = now();
      if (cached && cached.expiresAtMs - CACHE_SAFETY_SECONDS * 1000 > nowMs) {
        return cached.accessToken;
      }

      const assertion = createGoogleServiceAccountAssertion(config.serviceAccount, nowMs);
      const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      });
      let response;
      try {
        response = await fetchImpl(config.serviceAccount.tokenUri, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
      } catch (cause) {
        throw new GooglePlayAuthError('GOOGLE_PLAY_OAUTH_NETWORK_FAILED', {
          retryable: true,
          cause,
        });
      }
      if (!response?.ok) {
        const status = Number(response?.status ?? 0) || null;
        throw new GooglePlayAuthError('GOOGLE_PLAY_OAUTH_TOKEN_FAILED', {
          retryable: status == null || retryableStatus(status),
          httpStatusCode: status,
        });
      }
      let payload;
      try {
        payload = await response.json();
      } catch (cause) {
        throw new GooglePlayAuthError('GOOGLE_PLAY_OAUTH_RESPONSE_INVALID', { cause });
      }
      const accessToken = String(payload?.access_token ?? '').trim();
      const expiresIn = Number(payload?.expires_in);
      if (
        !accessToken
        || payload?.token_type !== 'Bearer'
        || !Number.isSafeInteger(expiresIn)
        || expiresIn <= 0
        || expiresIn > JWT_LIFETIME_SECONDS
      ) {
        throw new GooglePlayAuthError('GOOGLE_PLAY_OAUTH_RESPONSE_INVALID');
      }
      cached = Object.freeze({
        accessToken,
        expiresAtMs: nowMs + expiresIn * 1000,
      });
      return accessToken;
    },
  });
}
