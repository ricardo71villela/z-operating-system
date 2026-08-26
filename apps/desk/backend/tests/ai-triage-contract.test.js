const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Desk AI uses server-only gateway boundary and constrained output', () => {
  const client = read('src/ai/desk-ai.client.ts');
  assert.match(client, /AI_GATEWAY_API_KEY/);
  assert.doesNotMatch(client, /NEXT_PUBLIC_/);
  assert.match(client, /Return ONLY one JSON object/);
  assert.match(client, /Never invent a meeting date or time/);
  assert.match(client, /Do not infer sensitive\/protected attributes/);
  assert.match(client, /MAX_INPUT_CHARS = 6_000/);
});

test('AI triage remains opt-in and suggestion-only', () => {
  const worker = read('src/queues/workers/ai-triage.worker.ts');
  assert.match(worker, /ai_triage_enabled/);
  assert.match(worker, /status: 'draft'/);
  assert.doesNotMatch(worker, /status: 'confirmed'/);
  assert.match(worker, /ai_triage_audit/);
});

test('only owner or admin may change AI consent', () => {
  const settings = read('src/settings/settings.controller.ts');
  assert.match(settings, /@RequireDeskRoles\('owner', 'admin'\)/);
  assert.match(settings, /ai_triage_enabled_by_member_id/);
});

test('canonical auth guard enforces role metadata', () => {
  const guard = read('src/auth/desk-auth.guard.ts');
  assert.match(guard, /DESK_ALLOWED_ROLES/);
  assert.match(guard, /ForbiddenException/);
  assert.match(guard, /allowedRoles\.includes\(deskContext\.role\)/);
});
