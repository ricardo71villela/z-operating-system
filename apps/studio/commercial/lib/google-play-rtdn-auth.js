const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export class GooglePlayRtdnAuthError extends Error {
  constructor(code, { retryable = false, httpStatusCode = null, cause = null } = {}) {
    super(code);
    this.name = 'GooglePlayRtdnAuthError';
    this.code = code;
    this.retryable = retryable;
    this.httpStatusCode = httpStatusCode;
    if (cause) this.cause = cause;
  }
}

function fail(code, options) {
  throw new GooglePlayRtdnAuthError(code, options);
}

function bearerToken(value) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^Bearer\s+([^\s]+)$/i);
  if (!match || match[1].length > 16384) fail('GOOGLE_PLAY_RTDN_AUTH_REQUIRED');
  const token = match[1];
  if (token.split('.').length !== 3) fail('GOOGLE_PLAY_RTDN_OIDC_TOKEN_INVALID');
  return token;
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function verifyGooglePubSubOidcAuthorization(
  authorization,
  config,
  { fetchImpl = globalThis.fetch, now = () => Date.now(), timeoutMs = 8000 } = {},
) {
  if (typeof fetchImpl !== 'function' || typeof now !== 'function') {
    fail('GOOGLE_PLAY_RTDN_AUTH_VERIFIER_INVALID');
  }
  const audience = String(config?.pubsubAudience ?? '').trim();
  const expectedEmail = String(config?.pubsubServiceAccountEmail ?? '').trim().toLowerCase();
  if (!/^https:\/\//.test(audience) || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(expectedEmail)) {
    fail('GOOGLE_PLAY_RTDN_AUTH_CONFIG_INVALID');
  }
  const token = bearerToken(authorization);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${TOKENINFO_URL}?id_token=${encodeURIComponent(token)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (cause) {
    fail('GOOGLE_PLAY_RTDN_OIDC_VERIFICATION_UNAVAILABLE', { retryable: true, cause });
  } finally {
    clearTimeout(timer);
  }
  if (!response?.ok) {
    const status = Number(response?.status ?? 0) || null;
    fail('GOOGLE_PLAY_RTDN_OIDC_TOKEN_REJECTED', {
      retryable: status == null || retryableStatus(status),
      httpStatusCode: status,
    });
  }
  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    fail('GOOGLE_PLAY_RTDN_OIDC_RESPONSE_INVALID', { retryable: false, cause });
  }
  const nowSeconds = Math.floor(now() / 1000);
  const exp = Number(payload?.exp);
  const iat = Number(payload?.iat);
  const emailVerified = payload?.email_verified === true || payload?.email_verified === 'true';
  if (
    payload?.alg !== 'RS256'
    || !ISSUERS.has(payload?.iss)
    || payload?.aud !== audience
    || String(payload?.email ?? '').trim().toLowerCase() !== expectedEmail
    || !emailVerified
    || !/^\d+$/.test(String(payload?.sub ?? ''))
    || !Number.isSafeInteger(exp)
    || !Number.isSafeInteger(iat)
    || exp <= nowSeconds
    || iat > nowSeconds + 300
    || exp - iat <= 0
    || exp - iat > 7200
  ) {
    fail('GOOGLE_PLAY_RTDN_OIDC_CLAIMS_INVALID');
  }
  return Object.freeze({
    verification: 'verified_google_pubsub_oidc',
    audience: payload.aud,
    serviceAccountEmail: expectedEmail,
    subject: payload.sub,
    expiresAtMs: exp * 1000,
    rawTokenIncluded: false,
  });
}
