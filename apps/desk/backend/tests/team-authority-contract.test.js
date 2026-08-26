const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readRepo = (relative) => fs.readFileSync(path.resolve(root, '..', '..', '..', relative), 'utf8');

test('team invitation endpoints use canonical auth and constrained Desk roles', () => {
  const controller = read('src/team/team.controller.ts');
  assert.match(controller, /@RequireDeskRoles\('owner', 'admin'\)/);
  assert.match(controller, /context\.role === 'admin' && role !== 'member'/);
  assert.match(controller, /@RequireDeskRoles\('owner'\)/);
  assert.match(controller, /supabaseAdmin\.auth\.getUser/);
  assert.match(controller, /user\.email_confirmed_at/);
  assert.match(controller, /zdesk_accept_invitation/);
  assert.match(controller, /createHash\('sha256'\)/);
  assert.doesNotMatch(controller, /tenantId|desk_users|desk_tenants/);
});

test('team invitation persistence projects canonical ZOS identity only on acceptance', () => {
  const migration = readRepo('infrastructure/supabase/migrations/20260824105000_z_desk_team_authority_v1.sql');
  assert.match(migration, /references zos\.memberships/);
  assert.match(migration, /insert into zos\.persons/);
  assert.match(migration, /insert into zos\.memberships/);
  assert.match(migration, /insert into desk\.workspace_members/);
  assert.match(migration, /role in \('admin','member'\)/);
  assert.match(migration, /Admins may invite members only|Desk admins may invite members only/);
  assert.match(migration, /revoke all on desk\.workspace_invitations from authenticated/);
  assert.match(migration, /grant execute on function public\.zdesk_accept_invitation\(uuid,text\) to service_role/);
  assert.doesNotMatch(migration, /create table\s+(?:public\.)?desk_(?:users|tenants)/i);
});

test('team module is mounted in the Desk API boundary', () => {
  const app = read('src/app.module.ts');
  assert.match(app, /TeamModule/);
});
