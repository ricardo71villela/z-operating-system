const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readRepo = (relative) => fs.readFileSync(path.resolve(root, '..', '..', '..', relative), 'utf8');

test('Today and message decisions derive workspace authority from Desk context', () => {
  const today = read('src/today/today.controller.ts');
  const messages = read('src/messages/messages.controller.ts');
  assert.match(today, /req\.deskContext/);
  assert.match(today, /context\.workspaceId/);
  assert.doesNotMatch(today, /@Query\('workspaceId'\)/);
  assert.match(messages, /req\.deskContext/);
  assert.match(messages, /zdesk_resolve_message/);
  assert.match(messages, /zdesk_create_message_action/);
  assert.doesNotMatch(messages, /@Body\('workspaceId'\)|@Query\('workspaceId'\)/);
});

test('message action SQL preserves communication-to-task/event traceability and human confirmation', () => {
  const migration = readRepo('infrastructure/supabase/migrations/20260824115000_z_desk_today_action_authority_v1.sql');
  assert.match(migration, /create table desk\.message_actions/);
  assert.match(migration, /v_message\.thread_id/);
  assert.match(migration, /public\.zdesk_create_task/);
  assert.match(migration, /public\.zdesk_create_event/);
  assert.match(migration, /update desk\.messages set state='action_pending'/);
  assert.match(migration, /Resolved message cannot create a new action/);
  assert.match(migration, /revoke all on function public\.zdesk_create_message_action/);
});
