const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '../../../..');
const read = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8');

test('lead management remains a Desk operational projection over canonical ZOS identity', () => {
  const migration = read('infrastructure/supabase/migrations/20260824214000_z_desk_lead_management_authority_v1.sql');
  assert.match(migration, /create table desk\.leads/);
  assert.match(migration, /canonical_person_id uuid references zos\.persons/);
  assert.match(migration, /canonical_organisation_id uuid references zos\.organisations/);
  assert.match(migration, /zdesk_convert_lead/);
  assert.match(migration, /never creates parallel identity authority/i);
  assert.doesNotMatch(migration, /create table desk\.(persons|organisations|users|tenants)/i);
});

test('lead mutations remain server-authorised and browser authority ids are not accepted', () => {
  const controller = read('apps/desk/backend/src/leads/leads.controller.ts');
  const proxy = read('apps/desk/src/app/api/desk/[...path]/route.ts');
  const migration = read('infrastructure/supabase/migrations/20260824214000_z_desk_lead_management_authority_v1.sql');
  assert.match(controller, /context\.workspaceId/);
  assert.match(controller, /context\.workspaceMemberId/);
  assert.doesNotMatch(controller, /body\.workspaceId|body\.tenantId/);
  assert.match(proxy, /workspaceId/);
  assert.match(proxy, /AUTHORITY_KEYS/);
  assert.match(migration, /revoke all on function public\.zdesk_create_lead[\s\S]*authenticated/);
  assert.match(migration, /grant execute on function public\.zdesk_create_lead[\s\S]*service_role/);
});

test('lead UX exposes capture, pipeline and all six ZOS destinations in six languages', () => {
  const shell = read('apps/desk/src/components/desk-shell.tsx');
  const page = read('apps/desk/src/app/[locale]/leads/page.tsx');
  const board = read('apps/desk/src/components/leads-board.tsx');
  const copy = read('apps/desk/src/lib/leads-copy.ts');
  assert.match(shell, /'leads'/);
  assert.match(page, /LeadsBoard/);
  assert.match(board, /z_find/);
  assert.match(board, /z_mobility/);
  assert.match(board, /z_jobs/);
  assert.match(board, /z_fashion/);
  assert.match(board, /z_studio/);
  assert.match(board, /z_desk/);
  for (const locale of ['pt', 'en', 'fr', 'es', 'it', 'de']) assert.match(copy, new RegExp(`\\b${locale}: \\{`));
});

test('official ZOS mark variants are integrated into the operational and premium surfaces', () => {
  const shell = read('apps/desk/src/components/desk-shell.tsx');
  const landing = read('apps/desk/src/app/[locale]/page.tsx');
  const mark = read('apps/desk/src/components/zos-mark.tsx');
  assert.match(mark, /zos-mark-\$\{variant\}\.svg/);
  assert.match(shell, /variant="chrome"/);
  assert.match(shell, /variant="linear"/);
  assert.match(landing, /variant="chrome"/);
});
