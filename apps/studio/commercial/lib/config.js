import { APPLE_APP_ID } from './store-products.js';

function required(env, key) {
  const value = String(env[key] ?? '').trim();
  if (!value) throw new Error(`ZSTUDIO_COMMERCIAL_CONFIG_MISSING:${key}`);
  return value;
}

function requiredOneOf(env, key, allowed) {
  const value = required(env, key).toLowerCase();
  if (!allowed.includes(value)) {
    throw new Error(`ZSTUDIO_COMMERCIAL_CONFIG_INVALID:${key}`);
  }
  return value;
}

export function loadAppleCommercialConfig(env = process.env) {
  const environment = requiredOneOf(env, 'APPLE_ENVIRONMENT', ['sandbox', 'production']);
  const bundleId = required(env, 'APPLE_BUNDLE_ID');

  if (bundleId !== APPLE_APP_ID) {
    throw new Error('ZSTUDIO_COMMERCIAL_CONFIG_INVALID:APPLE_BUNDLE_ID');
  }

  const appAppleId = String(env.APPLE_APP_APPLE_ID ?? '').trim();
  if (environment === 'production' && !/^\d+$/.test(appAppleId)) {
    throw new Error('ZSTUDIO_COMMERCIAL_CONFIG_INVALID:APPLE_APP_APPLE_ID');
  }

  const issuerId = required(env, 'APPLE_ISSUER_ID');
  const keyId = required(env, 'APPLE_KEY_ID');

  const privateKey = required(env, 'APPLE_PRIVATE_KEY');
  if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
    throw new Error('ZSTUDIO_COMMERCIAL_CONFIG_INVALID:APPLE_PRIVATE_KEY');
  }

  const supabaseUrl = required(env, 'SUPABASE_URL');
  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error('ZSTUDIO_COMMERCIAL_CONFIG_INVALID:SUPABASE_URL');
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('ZSTUDIO_COMMERCIAL_CONFIG_INVALID:SUPABASE_URL');
  }

  const supabaseServiceRole = required(env, 'SUPABASE_SERVICE_ROLE');

  return Object.freeze({
    environment,
    bundleId,
    appAppleId: appAppleId || null,
    issuerId,
    keyId,
    privateKey,
    supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
    supabaseServiceRole,
  });
}
