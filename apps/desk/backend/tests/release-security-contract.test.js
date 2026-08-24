const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const web = path.resolve(root, '..');
const repo = path.resolve(root, '..', '..', '..');
const read = (file) => fs.readFileSync(file, 'utf8');

test('release security: browser environment never documents service-role or provider secrets as NEXT_PUBLIC', () => {
  const browserEnv = read(path.join(web, '.env.example'));
  assert.doesNotMatch(browserEnv, /NEXT_PUBLIC_.*(?:SERVICE_ROLE|SECRET|TOKEN|API_KEY)/i);
  const backendEnv = read(path.join(root, '.env.example'));
  for (const secret of ['SUPABASE_SERVICE_ROLE_KEY','DESK_OAUTH_STATE_SECRET','DESK_INTEGRATION_CREDENTIAL_KEY','GOOGLE_OAUTH_CLIENT_SECRET','MICROSOFT_OAUTH_CLIENT_SECRET','AI_GATEWAY_API_KEY','WHATSAPP_APP_SECRET']) assert.match(backendEnv, new RegExp(`^${secret}=`, 'm'));
});

test('release security: integration UI never receives stored credentials', () => {
  const controller = read(path.join(root, 'src/integrations/integrations.controller.ts'));
  assert.match(controller, /select\('id,provider,external_account_id,status,created_at,updated_at'\)/);
  assert.doesNotMatch(controller, /integration_credentials/);
  assert.doesNotMatch(controller, /encrypted_payload|refresh_token/i);
  assert.match(controller, /@RequireDeskRoles\('owner', 'admin'\)/);
});

test('release security: readiness is boolean-only and manager-only', () => {
  const settings = read(path.join(root, 'src/settings/settings.controller.ts'));
  assert.match(settings, /@Get\('readiness'\)[\s\S]*@RequireDeskRoles\('owner', 'admin'\)/);
  assert.match(settings, /const enabled = \(name: string\) => String\(process\.env\[name\]/);
  assert.doesNotMatch(settings, /return\s+process\.env|:\s*process\.env\[/);
});

test('release security: OAuth state and integration credential SQL remain browser-inaccessible', () => {
  const migrationsDir = path.join(repo, 'infrastructure/supabase/migrations');
  const sql = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).map((name) => read(path.join(migrationsDir, name))).join('\n');
  assert.match(sql, /revoke all on desk\.integration_credentials from authenticated/i);
  assert.match(sql, /revoke all on function public\.zdesk_consume_oauth_state[^;]*authenticated/i);
  assert.match(sql, /revoke all on function public\.zdesk_register_integration[^;]*authenticated/i);
  assert.match(sql, /AES-256-GCM/i);
});

test('release security: release-sensitive provider actions remain disabled by default', () => {
  const env = read(path.join(root, '.env.example'));
  assert.match(env, /DESK_ENABLE_WORKERS=false/);
  assert.match(env, /DESK_EXTERNAL_CALENDAR_PUSH_ENABLED=false/);
  assert.match(env, /DESK_WHATSAPP_EXPORT_ENABLED=false/);
});
