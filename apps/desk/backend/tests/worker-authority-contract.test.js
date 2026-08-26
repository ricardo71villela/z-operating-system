const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workerFiles = [
  'src/queues/worker-credentials.ts',
  'src/queues/workers/email-sync.worker.ts',
  'src/queues/workers/calendar-sync.worker.ts',
  'src/queues/workers/inbound-message.worker.ts',
  'src/queues/workers/ai-triage.worker.ts',
  'src/queues/workers/schedule-validation.worker.ts',
  'src/tenant-resolution/tenant-resolution.service.ts',
];

function source(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('background workers contain no legacy tenant/table/token authority', () => {
  for (const relative of workerFiles) {
    const text = source(relative);
    assert.equal(/\btenantId\b/.test(text), false, `${relative} still transports tenantId`);
    assert.equal(/\btenant_id\b/.test(text), false, `${relative} still transports tenant_id`);
    assert.equal(/\.from\(['"]desk_/.test(text), false, `${relative} still reads legacy public desk_* tables`);
    assert.equal(/oauth_tokens/.test(text), false, `${relative} still reads plaintext oauth_tokens`);
  }
});

test('provider workers use encrypted credential authority and workspace ownership', () => {
  const credentials = source('src/queues/worker-credentials.ts');
  const email = source('src/queues/workers/email-sync.worker.ts');
  const calendar = source('src/queues/workers/calendar-sync.worker.ts');
  const inbound = source('src/queues/workers/inbound-message.worker.ts');

  assert.match(credentials, /accessTokenForWorker/);
  assert.match(credentials, /storeCredentials/);
  assert.match(email, /workspaceId/);
  assert.match(email, /external_message_id/);
  assert.match(calendar, /workspace_id/);
  assert.match(inbound, /resolveWorkspaceForWhatsapp/);
  assert.match(inbound, /external_message_id/);
});

test('API and background workers have separate runtime entrypoints', () => {
  const apiMain = source('src/main.ts');
  const workerMain = source('src/workers-main.ts');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.doesNotMatch(apiMain, /emailSyncWorker|calendarSyncWorker|inboundMessageWorker/);
  assert.match(workerMain, /ZDESK_WORKERS=READY/);
  assert.equal(pkg.scripts['start:workers'], 'node dist/workers-main.js');
});
