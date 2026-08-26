const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '../../../..');
const migration = ['20260823180000_z_desk_zos_foundation_v1.sql','20260823180100_z_desk_domain_v1.sql'].map((name) => fs.readFileSync(path.join(repo, 'infrastructure/supabase/migrations', name), 'utf8')).join('\n');
const webRoot = path.join(repo, 'apps/desk');

function allFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.next') return [];
    return entry.isDirectory() ? allFiles(full) : [full];
  });
}

test('Desk uses canonical ZOS identity projection', () => {
  assert.match(migration, /references zos\.organisations/);
  assert.match(migration, /references zos\.memberships/);
  assert.match(migration, /from zos\.persons/);
  assert.doesNotMatch(migration, /create table(?: if not exists)?\s+(?:public\.)?desk_tenants/i);
  assert.doesNotMatch(migration, /create table(?: if not exists)?\s+(?:public\.)?desk_users/i);
});

test('legacy public tenant dev authority is absent from active web source', () => {
  const activeFiles = allFiles(path.join(webRoot, 'src'));
  const text = activeFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(text, /NEXT_PUBLIC_DESK_DEV_TENANT_ID/);
  assert.doesNotMatch(text, /tenantId=/);
});

test('provider credentials have no authenticated table read grant', () => {
  assert.match(migration, /revoke all on desk\.integrations, desk\.integration_credentials, desk\.oauth_states from authenticated/);
});
