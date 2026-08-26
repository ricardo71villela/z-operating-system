const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '../../../..');
const read = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8');

test('OAuth authorize routes derive authority from Desk session context', () => {
  const email = read('apps/desk/backend/src/email/email-oauth.controller.ts');
  const calendar = read('apps/desk/backend/src/calendar/calendar-oauth.controller.ts');
  for (const source of [email, calendar]) {
    assert.match(source, /@RequireDeskAuth\(\)/);
    assert.doesNotMatch(source, /@Query\(['"]tenantId['"]\)/);
    assert.match(source, /states\.issue\(/);
    assert.match(source, /states\.consume\(/);
  }
});

test('OAuth state is signed, hashed at rest and consumed through atomic RPC', () => {
  const service = read('apps/desk/backend/src/integrations-security/oauth-state.service.ts');
  const migration = read('infrastructure/supabase/migrations/20260823180200_z_desk_integration_security_v1.sql');
  assert.match(service, /createHmac\('sha256'/);
  assert.match(service, /timingSafeEqual/);
  assert.match(service, /createHash\('sha256'/);
  assert.match(service, /zdesk_consume_oauth_state/);
  assert.match(migration, /for update/i);
  assert.match(migration, /consumed_at is null/i);
  assert.match(migration, /expires_at > clock_timestamp\(\)/i);
});

test('provider credentials are AES-256-GCM encrypted before persistence', () => {
  const crypto = read('apps/desk/backend/src/integrations-security/integration-crypto.ts');
  const service = read('apps/desk/backend/src/integrations-security/integration-credential.service.ts');
  assert.match(crypto, /aes-256-gcm/);
  assert.match(crypto, /setAAD/);
  assert.match(crypto, /getAuthTag/);
  assert.match(service, /integration_credentials/);
  assert.doesNotMatch(service, /oauth_tokens/);
});

test('integration registration prevents cross-workspace provider takeover', () => {
  const migration = read('infrastructure/supabase/migrations/20260823180200_z_desk_integration_security_v1.sql');
  assert.match(migration, /already connected to another Desk workspace/);
  assert.match(migration, /grant execute on function public\.zdesk_register_integration/);
  assert.match(migration, /to service_role/);
});

test('calendar OAuth uses explicit provider scopes and completed token exchange', () => {
  const calendar = read('apps/desk/backend/src/calendar/calendar-oauth.controller.ts');
  assert.match(calendar, /GOOGLE_CALENDAR_SCOPE/);
  assert.match(calendar, /MICROSOFT_CALENDAR_SCOPE/);
  assert.match(calendar, /exchangeGmailCode/);
  assert.match(calendar, /exchangeMicrosoftCode/);
  assert.doesNotMatch(calendar, /status=pending/);
  assert.doesNotMatch(calendar, /\.replace\(/);
});
