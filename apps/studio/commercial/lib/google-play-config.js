import { GOOGLE_PLAY_PACKAGE_NAME } from './store-products.js';

function required(env, key) {
  const value = String(env[key] ?? '').trim();
  if (!value) throw new Error(`ZSTUDIO_GOOGLE_PLAY_CONFIG_MISSING:${key}`);
  return value;
}

function requiredHttpsUrl(env, key) {
  const value = required(env, key);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:${key}`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:${key}`);
  }
  return value.replace(/\/+$/, '');
}

function requiredSupabaseSecretKey(env) {
  const value = required(env, 'SUPABASE_SECRET_KEY');
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:SUPABASE_SECRET_KEY');
  }
  return value;
}

function parseServiceAccount(env) {
  const raw = required(env, 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  }
  if (value.type !== 'service_account') {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:GOOGLE_PLAY_SERVICE_ACCOUNT_TYPE');
  }
  const clientEmail = String(value.client_email ?? '').trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(clientEmail)) {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL');
  }
  const privateKey = String(value.private_key ?? '');
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY');
  }
  const privateKeyId = String(value.private_key_id ?? '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(privateKeyId)) {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_ID');
  }
  const tokenUri = String(value.token_uri ?? '').trim();
  if (tokenUri !== 'https://oauth2.googleapis.com/token') {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:GOOGLE_PLAY_SERVICE_ACCOUNT_TOKEN_URI');
  }
  const projectId = String(value.project_id ?? '').trim();
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:GOOGLE_PLAY_SERVICE_ACCOUNT_PROJECT_ID');
  }
  return Object.freeze({
    clientEmail,
    privateKey,
    privateKeyId,
    tokenUri,
    projectId,
  });
}

export function loadGooglePlayCommercialConfig(env = process.env) {
  const environment = required(env, 'GOOGLE_PLAY_ENVIRONMENT').toLowerCase();
  if (!['sandbox', 'production'].includes(environment)) {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:GOOGLE_PLAY_ENVIRONMENT');
  }
  const packageName = required(env, 'GOOGLE_PLAY_PACKAGE_NAME');
  if (packageName !== GOOGLE_PLAY_PACKAGE_NAME) {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_INVALID:GOOGLE_PLAY_PACKAGE_NAME');
  }
  return Object.freeze({
    environment,
    packageName,
    serviceAccount: parseServiceAccount(env),
    supabaseUrl: requiredHttpsUrl(env, 'SUPABASE_URL'),
    supabaseSecretKey: requiredSupabaseSecretKey(env),
  });
}
