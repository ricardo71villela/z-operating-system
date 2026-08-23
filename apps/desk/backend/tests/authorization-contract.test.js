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

test('unsafe provider routes are not mounted during D1', () => {
  const app = src('app.module.ts');
  assert.doesNotMatch(app, /WhatsappModule/);
  assert.doesNotMatch(app, /IntegrationsModule/);
  assert.doesNotMatch(app, /EmailModule/);
  assert.doesNotMatch(app, /CalendarModule/);
});
