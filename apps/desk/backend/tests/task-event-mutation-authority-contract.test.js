const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readRepo = (relative) => fs.readFileSync(path.resolve(root, '..', '..', '..', relative), 'utf8');

test('task writes derive actor/workspace from canonical Desk context and server RPCs', () => {
  const controller = read('src/tasks/tasks.controller.ts');
  assert.match(controller, /req\.deskContext/);
  assert.match(controller, /p_workspace_id: context\.workspaceId/);
  assert.match(controller, /p_actor_member_id: context\.workspaceMemberId/);
  assert.match(controller, /zdesk_create_task/);
  assert.match(controller, /zdesk_move_task/);
  assert.match(controller, /zdesk_reassign_task/);
  assert.match(controller, /zdesk_update_task/);
  assert.match(controller, /zdesk_delete_task/);
  assert.doesNotMatch(controller, /@Body\('workspaceId'\)|@Query\('workspaceId'\)|createdBy:/);
});

test('event confirmation is actor-authorized before any external calendar push', () => {
  const controller = read('src/events/events.controller.ts');
  const confirmRpc = controller.indexOf('zdesk_confirm_event');
  const externalPush = controller.indexOf('await pushConfirmedEventToExternalCalendars');
  assert.ok(confirmRpc > -1);
  assert.ok(externalPush > confirmRpc);
  assert.match(controller, /zdesk_create_event/);
  assert.match(controller, /zdesk_update_event/);
  assert.match(controller, /p_workspace_id: context\.workspaceId/);
  assert.match(controller, /p_actor_member_id: context\.workspaceMemberId/);
  assert.doesNotMatch(controller, /@Body\('workspaceId'\)|@Query\('workspaceId'\)/);
});

test('task/event SQL mutation authority is service-only and role constrained', () => {
  const migration = readRepo('infrastructure/supabase/migrations/20260824111000_z_desk_task_event_mutation_authority_v1.sql');
  assert.match(migration, /Desk members may create tasks only for themselves/);
  assert.match(migration, /Desk owner or admin task reassignment authority required/);
  assert.match(migration, /Desk members may delete only tasks they created/);
  assert.match(migration, /insert into desk\.events\(workspace_id,thread_id,title,starts_at,ends_at,source,status,event_type,created_by\)/);
  assert.match(migration, /Desk member cannot confirm this event/);
  assert.match(migration, /Only non-external draft events may be confirmed/);
  assert.match(migration, /revoke all on function public\.zdesk_create_task/);
  assert.match(migration, /grant execute on function public\.zdesk_confirm_event\(uuid,uuid,uuid\) to service_role/);
});
