const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readRepo = (relative) => fs.readFileSync(path.resolve(root, '..', '..', '..', relative), 'utf8');

test('personnel reads derive workspace and member privacy from canonical Desk context', () => {
  const controller = read('src/personnel/personnel.controller.ts');
  assert.match(controller, /req\.deskContext/);
  assert.match(controller, /context\.workspaceId/);
  assert.match(controller, /context\.workspaceMemberId/);
  assert.match(controller, /context\.role === 'member'/);
  assert.match(controller, /displayName/);
  assert.doesNotMatch(controller, /@Query\('workspaceId'\)/);
});

test('personnel mutation endpoints use server-only RPC authority', () => {
  const controller = read('src/personnel/personnel.controller.ts');
  for (const rpc of [
    'zdesk_replace_work_schedule',
    'zdesk_request_absence',
    'zdesk_decide_absence',
    'zdesk_cancel_absence',
    'zdesk_upsert_schedule_override',
    'zdesk_delete_schedule_override',
    'zdesk_validate_schedule_week',
    'zdesk_submit_overtime',
    'zdesk_decide_overtime',
    'zdesk_cancel_overtime',
  ]) assert.match(controller, new RegExp(rpc));
  assert.match(controller, /@RequireDeskRoles\('owner', 'admin'\)/);
});

test('personnel SQL is private-by-default and role constrained', () => {
  const migration = readRepo('infrastructure/supabase/migrations/20260824113000_z_desk_personnel_authority_v1.sql');
  assert.match(migration, /desk_absences_private_read/);
  assert.match(migration, /member_id=desk\.current_workspace_member_id\(workspace_id\)/);
  assert.match(migration, /Desk members may request absence only for themselves/);
  assert.match(migration, /Desk owner or admin absence decision authority required/);
  assert.match(migration, /Desk members may submit overtime only for themselves/);
  assert.match(migration, /Desk owner or admin overtime decision authority required/);
  assert.match(migration, /revoke all on function public\.zdesk_request_absence/);
  assert.match(migration, /grant execute on function public\.zdesk_decide_overtime\(uuid,uuid,uuid,text\) to service_role/);
});
