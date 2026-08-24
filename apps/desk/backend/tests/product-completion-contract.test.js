const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readRepo = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8');
const readWeb = (relative) => fs.readFileSync(path.resolve(root, '..', relative), 'utf8');

function keyPaths(value, prefix = '') {
  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(next);
    if (child && typeof child === 'object' && !Array.isArray(child)) paths.push(...keyPaths(child, next));
  }
  return paths.sort();
}

test('workspace integrations require owner/admin authority at controller and SQL boundaries', () => {
  const integrations = read('src/integrations/integrations.controller.ts');
  const email = read('src/email/email-oauth.controller.ts');
  const calendar = read('src/calendar/calendar-oauth.controller.ts');
  const migration = readRepo('infrastructure/supabase/migrations/20260824140000_z_desk_integration_management_authority_v1.sql');
  assert.match(integrations, /@Post\('whatsapp\/connect'\)[\s\S]*@RequireDeskRoles\('owner', 'admin'\)/);
  assert.match(integrations, /@Delete\(':id'\)[\s\S]*@RequireDeskRoles\('owner', 'admin'\)/);
  assert.match(email, /gmail\/authorize[\s\S]*@RequireDeskRoles\('owner', 'admin'\)/);
  assert.match(email, /microsoft\/authorize[\s\S]*@RequireDeskRoles\('owner', 'admin'\)/);
  assert.match(calendar, /google\/authorize[\s\S]*@RequireDeskRoles\('owner', 'admin'\)/);
  assert.match(calendar, /microsoft\/authorize[\s\S]*@RequireDeskRoles\('owner', 'admin'\)/);
  assert.match(migration, /Desk owner or admin integration authority required/);
  assert.match(migration, /desk\.server_actor_role/);
});

test('OAuth browser proxy preserves redirects and callbacks return to Settings', () => {
  const proxy = readWeb('src/app/api/desk/[...path]/route.ts');
  const email = read('src/email/email-oauth.controller.ts');
  const calendar = read('src/calendar/calendar-oauth.controller.ts');
  assert.match(proxy, /redirect:\s*'manual'/);
  assert.match(proxy, /NextResponse\.redirect/);
  assert.doesNotMatch(proxy, /workspaceId.*append|workspace_id.*append/);
  assert.match(email, /DESK_FRONTEND_PUBLIC_URL}\/settings\?connected=gmail/);
  assert.match(calendar, /DESK_FRONTEND_PUBLIC_URL}\/settings\?connected=google_calendar/);
});

test('Settings exposes readiness state without returning provider secret values', () => {
  const settings = read('src/settings/settings.controller.ts');
  const client = readWeb('src/app/[locale]/settings/settings-client.tsx');
  assert.match(settings, /@Get\('readiness'\)/);
  assert.match(settings, /@RequireDeskRoles\('owner', 'admin'\)/);
  for (const key of ['googleOAuthConfigured','microsoftOAuthConfigured','whatsappWebhookConfigured','aiGatewayConfigured','workersEnabled','calendarPushEnabled','whatsappExportEnabled']) assert.match(settings, new RegExp(key));
  assert.doesNotMatch(settings, /accessToken|refreshToken|clientSecret\s*:/i);
  assert.match(client, /type="password"/);
  assert.match(client, /manager/);
  assert.match(client, /settings\/ai-triage/);
});

test('onboarding reuses canonical authenticated ZOS workspace bootstrap', () => {
  const onboarding = readWeb('src/app/[locale]/welcome/onboarding-client.tsx');
  const auth = read('src/auth/auth.controller.ts');
  assert.match(onboarding, /auth\/bootstrap-workspace/);
  assert.doesNotMatch(onboarding, /personId|membershipId|workspaceId/);
  assert.match(auth, /zdesk_bootstrap_workspace/);
  assert.match(auth, /supabaseAdmin\.auth\.getUser/);
});

test('all six language packs have identical product key coverage', () => {
  const locales = ['pt','en','fr','es','it','de'];
  const packs = Object.fromEntries(locales.map((locale) => [locale, JSON.parse(readWeb(`src/messages/${locale}.json`))]));
  const reference = keyPaths(packs.en);
  for (const locale of locales) {
    assert.deepEqual(keyPaths(packs[locale]), reference, `${locale} translation key coverage differs from English`);
    for (const namespace of ['Nav','Today','Inbox','Contacts','Tasks','Calendar','Personnel','Team','Settings','Onboarding']) assert.ok(packs[locale][namespace], `${locale} missing ${namespace}`);
  }
});

test('operational shell provides keyboard focus, skip navigation and reduced-motion support', () => {
  const shell = readWeb('src/components/desk-shell.tsx');
  const globals = readWeb('src/app/globals.css');
  const completion = readWeb('src/app/completion.css');
  assert.match(shell, /href="#desk-main"/);
  assert.match(shell, /aria-current=/);
  assert.match(shell, /<label className="language-control">/);
  assert.match(globals, /:focus-visible/);
  assert.match(completion, /\.skip-link:focus/);
  assert.match(completion, /prefers-reduced-motion/);
});
