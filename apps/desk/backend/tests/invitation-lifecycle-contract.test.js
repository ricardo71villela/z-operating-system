const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readRepo = (relative) => fs.readFileSync(path.resolve(root, '..', '..', '..', relative), 'utf8');

test('team controller exposes canonical invitation lifecycle without browser authority ids', () => {
  const controller = read('src/team/team.controller.ts');
  assert.match(controller, /zdesk_reissue_invitation/);
  assert.match(controller, /zdesk_revoke_invitation/);
  assert.match(controller, /secure_link_ready/);
  assert.match(controller, /context\.workspaceId/);
  assert.match(controller, /context\.workspaceMemberId/);
});

test('invitation lifecycle RPCs are server-only', () => {
  const migration = readRepo('infrastructure/supabase/migrations/20260824121000_z_desk_invitation_lifecycle_v1.sql');
  assert.match(migration, /Accepted invitation cannot be revoked/);
  assert.match(migration, /Accepted invitation cannot be reissued/);
  assert.match(migration, /Desk admins may manage member invitations only/);
  assert.match(migration, /revoke all on function public\.zdesk_reissue_invitation/);
});
