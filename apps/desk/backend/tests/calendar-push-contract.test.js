const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pushSource = fs.readFileSync(path.join(root, 'src/calendar/calendar-push.service.ts'), 'utf8');

test('confirmed event publication uses workspace-scoped encrypted integration authority', () => {
  assert.match(pushSource, /listActive\(\s*\['google_calendar', 'microsoft_calendar'\],\s*workspaceId/);
  assert.match(pushSource, /accessTokenForWorker/);
  assert.match(pushSource, /event_external_links/);
  assert.match(pushSource, /integration_id/);
  assert.doesNotMatch(pushSource, /oauth_tokens/);
  assert.doesNotMatch(pushSource, /tenantId|tenant_id/);
});

test('external-origin events are not echoed back to providers', () => {
  assert.match(pushSource, /event\.source === 'external_sync'/);
});
