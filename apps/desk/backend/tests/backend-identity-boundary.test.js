const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const listTs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? listTs(full) : entry.name.endsWith('.ts') ? [full] : [];
});

test('backend never queries schema zos through the Data API (ZOS Core keeps it closed)', () => {
  for (const file of listTs(path.join(__dirname, '../src'))) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /schema\(['"]zos['"]\)|zosAdmin/, `${path.relative(root, file)} reads schema zos directly`);
  }
});

test('identity lookups are service-role-only SECURITY DEFINER functions', () => {
  const migration = read('infrastructure/supabase/migrations/20261022090000_z_desk_backend_identity_lookup_v1.sql');
  for (const fn of ['zdesk_identity_for_auth_user(uuid, uuid)', 'zdesk_member_names(uuid[])']) {
    const name = fn.replace(/[()[\]]/g, (c) => `\\${c}`);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name} from public, anon, authenticated;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name} to service_role;`));
  }
  assert.equal((migration.match(/security definer/g) || []).length, 2);
  assert.equal((migration.match(/set search_path = ''/g) || []).length, 2);
  const auth = read('apps/desk/backend/src/auth/desk-auth-context.service.ts');
  assert.match(auth, /rpc\('zdesk_identity_for_auth_user'/);
});
