const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '../../../..');
const read = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8');
const MIGRATION = 'infrastructure/supabase/migrations/20261028120000_z_desk_marketplace_requests_v1.sql';

test('marketplace requests take workspace and member from the verified session only', () => {
  const controller = read('apps/desk/backend/src/requests/requests.controller.ts');
  assert.match(controller, /@RequireDeskAuth\(\)/);
  assert.match(controller, /@Controller\('requests'\)/);
  assert.match(controller, /p_workspace_id: context\.workspaceId/);
  assert.match(controller, /p_member_id: context\.workspaceMemberId/);
  assert.doesNotMatch(controller, /body\??\.(workspaceId|memberId|tenantId)/);
  assert.match(read('apps/desk/backend/src/app.module.ts'), /RequestsModule/);
});

test('request functions are service-only, pin search_path and stay inside the caller workspace', () => {
  const migration = read(MIGRATION);
  for (const fn of ['zdesk_marketplace_requests', 'zdesk_marketplace_requests_summary', 'zdesk_set_marketplace_request_status']) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
  }
  const definers = migration.match(/security definer\s*\n\s*set search_path = ''/g) ?? [];
  assert.equal(definers.length, (migration.match(/security definer/g) ?? []).length);
  assert.match(migration, /join desk\.workspaces w on w\.organisation_id = pa\.zos_organisation_id[\s\S]*where l\.id = p_request_id and w\.id = p_workspace_id/);
  assert.match(migration, /where id = p_member_id and workspace_id = p_workspace_id and status = 'active'/);
  assert.match(migration, /p_status not in \('new', 'contacted', 'closed'\)/);
});

test('the Requests inbox lists contacts and visits, replies in one click and notifies only on opt-in', () => {
  const board = read('apps/desk/src/app/[locale]/requests/requests-board.tsx');
  assert.match(board, /wa\.me\//);
  assert.match(board, /mailto:/);
  assert.match(board, /tel:/);
  assert.match(board, /\/api\/desk\/requests\//);
  const alerts = read('apps/desk/src/lib/request-alerts.ts');
  assert.match(alerts, /Notification\.requestPermission/);
  assert.match(alerts, /Notification\.permission !== 'granted'/);
  const shell = read('apps/desk/src/components/desk-shell.tsx');
  assert.match(shell, /\/api\/desk\/requests\/summary/);
  assert.match(shell, /\['requests', labels\.requests\]/);
  for (const lang of ['fr', 'en']) {
    const messages = JSON.parse(read(`apps/desk/src/messages/${lang}.json`));
    assert.ok(messages.Nav.requests && messages.Requests.title && messages.Requests.markContacted);
  }
});

test('WhatsApp numbers are only built when the country is known', () => {
  const board = read('apps/desk/src/app/[locale]/requests/requests-board.tsx');
  const fn = board.slice(board.indexOf('export function whatsappNumber'), board.indexOf('export function RequestsBoard'))
    .replace('export function whatsappNumber(phone: string | null): string | null', 'function whatsappNumber(phone)');
  // eslint-disable-next-line no-new-func
  const whatsappNumber = new Function(`${fn}; return whatsappNumber;`)();
  assert.equal(whatsappNumber('06 12 34 56 78'), '33612345678');
  assert.equal(whatsappNumber('+32 470 12 34 56'), '32470123456');
  assert.equal(whatsappNumber('0032 470 12 34 56'), '32470123456');
  assert.equal(whatsappNumber('04 50 12 34 56'), null);
  assert.equal(whatsappNumber(null), null);
});
