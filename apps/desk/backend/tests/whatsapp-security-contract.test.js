const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = (...parts) => fs.readFileSync(path.join(__dirname, '..', 'src', ...parts), 'utf8');

test('WhatsApp connect derives workspace authority from authenticated Desk context', () => {
  const controller = src('integrations', 'integrations.controller.ts');
  assert.match(controller, /@RequireDeskAuth\(\)/);
  assert.match(controller, /req\.deskContext!/);
  assert.match(controller, /credentials\.connect\(/);
  assert.doesNotMatch(controller, /tenantId/);
  assert.doesNotMatch(controller, /oauth_tokens/);
  assert.doesNotMatch(controller, /accessToken[^\n]*select/i);
});

test('WhatsApp webhook requires Meta HMAC over raw request body', () => {
  const webhook = src('whatsapp', 'whatsapp-webhook.controller.ts');
  const main = src('main.ts');
  assert.match(webhook, /x-hub-signature-256/);
  assert.match(webhook, /createHmac\('sha256'/);
  assert.match(webhook, /timingSafeEqual/);
  assert.match(webhook, /req\.rawBody/);
  assert.match(webhook, /WHATSAPP_APP_SECRET/);
  assert.match(main, /rawBody:\s*true/);
});

test('WhatsApp inbound enqueue is deterministic and Redis is lazy', () => {
  const webhook = src('whatsapp', 'whatsapp-webhook.controller.ts');
  assert.match(webhook, /createHash\('sha256'/);
  assert.match(webhook, /jobId:\s*inboundJobId\(parsed\.externalMessageId\)/);
  assert.match(webhook, /await import\('\.\.\/queues\/queues'\)/);
  assert.doesNotMatch(webhook, /^import .*inboundMessageQueue/m);
});

test('disconnect removes encrypted credentials before disabling integration', () => {
  const service = src('integrations-security', 'integration-credential.service.ts');
  assert.match(service, /from\('integration_credentials'\)\.delete\(\)/s);
  assert.match(service, /status:\s*'disconnected'/);
  assert.doesNotMatch(service, /oauth_tokens/);
});
