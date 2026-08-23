const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = (...parts) => fs.readFileSync(path.join(__dirname, '..', 'src', ...parts), 'utf8');

test('core Desk controllers require canonical auth guard', () => {
  for (const file of [
    ['today', 'today.controller.ts'],
    ['events', 'events.controller.ts'],
    ['messages', 'messages.controller.ts'],
    ['tasks', 'tasks.controller.ts'],
    ['personnel', 'personnel.controller.ts'],
  ]) {
    assert.match(src(...file), /@RequireDeskAuth\(\)/, file.join('/'));
  }
});

test('guard overwrites caller authority ids', () => {
  const guard = src('auth', 'desk-auth.guard.ts');
  assert.match(guard, /body\.workspaceId = deskContext\.workspaceId/);
  assert.match(guard, /body\.createdBy = deskContext\.workspaceMemberId/);
  assert.match(guard, /delete body\.tenantId/);
  assert.match(guard, /query\.workspaceId = deskContext\.workspaceId/);
});

test('D3B mounts only hardened provider boundaries', () => {
  const app = src('app.module.ts');
  assert.match(app, /EmailModule/);
  assert.match(app, /CalendarModule/);
  assert.match(app, /WhatsappModule/);
  assert.match(app, /IntegrationsModule/);

  const main = src('main.ts');
  assert.match(main, /rawBody:\s*true/);
  assert.match(main, /DESK_ENABLE_WORKERS === 'true'/);
  assert.match(main, /remain disabled until they are migrated to canonical workspace authority/);
  assert.doesNotMatch(main, /startWorkersIfEnabled/);
});
