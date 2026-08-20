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

function requiredSupabaseSecretKey(env) {
  const value = required(env, 'SUPABASE_SECRET_KEY');
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('ZSTUDIO_COMMERCIAL_CONFIG_INVALID:SUPABASE_SECRET_KEY');
  }
  return value;
}

function requiredHttpsUrl(env, key) {
  const value = required(env, key);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`ZSTUDIO_COMMERCIAL_CONFIG_INVALID:${key}`);
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.hash
  ) {
    throw new Error(`ZSTUDIO_COMMERCIAL_CONFIG_INVALID:${key}`);
  }
  return value.replace(/\/+$/, '');
}

function requiredStripePrice(env, key) {
  const value = required(env, key);
  if (!/^price_[A-Za-z0-9]+$/.test(value)) {
    throw new Error(`ZSTUDIO_COMMERCIAL_CONFIG_INVALID:${key}`);
  }
  return value;
}

function requiredStripeSecretKey(env, environment) {
  const value = required(env, 'STRIPE_SECRET_KEY');
  const prefix = environment === 'production' ? 'sk_live_' : 'sk_test_';
  if (!value.startsWith(prefix) || value.length <= prefix.length) {
    throw new Error('ZSTUDIO_COMMERCIAL_CONFIG_INVALID:STRIPE_SECRET_KEY');
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

  const supabaseUrl = requiredHttpsUrl(env, 'SUPABASE_URL');
  const supabaseSecretKey = requiredSupabaseSecretKey(env);

  return Object.freeze({
    environment,
    bundleId,
    appAppleId: appAppleId || null,
    issuerId,
    keyId,
    privateKey,
    supabaseUrl,
    supabaseSecretKey,
  });
}

export function loadWebCommercialConfig(env = process.env) {
  const environment = requiredOneOf(
    env,
    'STRIPE_ENVIRONMENT',
    ['sandbox', 'production'],
  );
  const stripeSecretKey = requiredStripeSecretKey(env, environment);

  const supabaseUrl = requiredHttpsUrl(env, 'SUPABASE_URL');
  const supabasePublishableKey = required(env, 'SUPABASE_PUBLISHABLE_KEY');
  const supabaseSecretKey = requiredSupabaseSecretKey(env);

  const priceByPlan = Object.freeze({
    weekly: requiredStripePrice(env, 'STRIPE_PRICE_WEEKLY'),
    monthly: requiredStripePrice(env, 'STRIPE_PRICE_MONTHLY'),
    annual: requiredStripePrice(env, 'STRIPE_PRICE_ANNUAL'),
  });
  if (new Set(Object.values(priceByPlan)).size !== 3) {
    throw new Error('ZSTUDIO_COMMERCIAL_CONFIG_INVALID:STRIPE_PRICE_IDS');
  }

  const successUrl = requiredHttpsUrl(env, 'STRIPE_SUCCESS_URL');
  const cancelUrl = requiredHttpsUrl(env, 'STRIPE_CANCEL_URL');

  return Object.freeze({
    environment,
    stripeSecretKey,
    priceByPlan,
    successUrl,
    cancelUrl,
    supabaseUrl,
    supabasePublishableKey,
    supabaseSecretKey,
  });
}
