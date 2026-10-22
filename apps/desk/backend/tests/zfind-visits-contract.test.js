const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '../../../..');
const read = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8');
const MIGRATION = 'infrastructure/supabase/migrations/20261023100000_z_desk_zfind_visits_v1.sql';

test('Z Find visit decisions take workspace and member from the verified session only', () => {
  const controller = read('apps/desk/backend/src/visits/visits.controller.ts');
  assert.match(controller, /@RequireDeskAuth\(\)/);
  assert.match(controller, /p_workspace_id: context\.workspaceId/);
  assert.match(controller, /p_member_id: context\.workspaceMemberId/);
  assert.doesNotMatch(controller, /body\??\.(workspaceId|memberId|tenantId)/);
  const app = read('apps/desk/backend/src/app.module.ts');
  assert.match(app, /VisitsModule/);
});

test('visit requests are closed to API roles; only the public request and slot functions are anonymous', () => {
  const migration = read(MIGRATION);
  assert.match(migration, /alter table public\.zfind_visit_requests enable row level security/);
  assert.match(migration, /revoke all on table public\.zfind_visit_requests from public, anon, authenticated/);
  for (const fn of ['zdesk_link_zfind_partner', 'zdesk_visit_requests', 'zdesk_decide_visit', 'zdesk_mark_visit_notified']) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
  }
  assert.match(migration, /grant execute on function public\.zfind_request_visit\([^)]*\) to anon/);
  assert.match(migration, /grant execute on function public\.zfind_visit_slots\([^)]*\) to anon/);
  // Every SECURITY DEFINER function pins its search_path.
  const definers = migration.match(/security definer\s*\n\s*set search_path = ''/g) ?? [];
  assert.equal(definers.length, (migration.match(/security definer/g) ?? []).length);
});

test('an agency can only confirm a time the buyer proposed, inside its own workspace', () => {
  const migration = read(MIGRATION);
  assert.match(migration, /p_slot_start = any \(v_req\.proposed_slots\)/);
  assert.match(migration, /join desk\.workspaces w on w\.organisation_id = pa\.zos_organisation_id[\s\S]*where v\.id = p_request_id and w\.id = p_workspace_id/);
  assert.match(migration, /where id = p_member_id and workspace_id = p_workspace_id and status = 'active'/);
});

test('the buyer e-mail is bilingual and the agency sees when it was not sent', () => {
  const email = read('apps/desk/backend/src/visits/visit-email.ts');
  assert.match(email, /Visite confirmée/);
  assert.match(email, /Visit confirmed/);
  assert.match(email, /escapeHtml/);
  assert.match(email, /if \(!apiKey \|\| !from\) return false/);
  const board = read('apps/desk/src/app/[locale]/visits/visits-board.tsx');
  assert.match(board, /buyerNotNotified/);
});

test('Z Find agency users reach their workspace from the welcome page (Z Desk Lite)', () => {
  const welcome = read('apps/desk/src/app/[locale]/welcome/page.tsx');
  assert.match(welcome, /auth\/link-zfind/);
  const auth = read('apps/desk/backend/src/auth/auth.controller.ts');
  assert.match(auth, /@Post\('link-zfind'\)/);
  assert.match(auth, /p_auth_user_id: user\.id/);
});
