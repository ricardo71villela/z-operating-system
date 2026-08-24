const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readWeb = (relative) => fs.readFileSync(path.resolve(root, '..', relative), 'utf8');

test('communication and contacts reads derive canonical workspace context', () => {
  const messages = read('src/messages/messages.controller.ts');
  const contacts = read('src/contacts/contacts.controller.ts');
  assert.match(messages, /@Get\('threads'\)/);
  assert.match(messages, /context\.workspaceId/);
  assert.doesNotMatch(messages, /@Query\('workspaceId'\)|@Body\('workspaceId'\)/);
  assert.match(contacts, /context\.workspaceId/);
  assert.doesNotMatch(contacts, /@Query\('workspaceId'\)|@Body\('workspaceId'\)/);
});

test('Z Desk product surface exposes operational shell and primary workspaces', () => {
  const shell = readWeb('src/components/desk-shell.tsx');
  for (const route of ['today','inbox','tasks','calendar','personnel','contacts','team','settings']) assert.match(shell, new RegExp(`'${route}'`));
  assert.match(readWeb('src/app/[locale]/today/page.tsx'), /dashboard-grid/);
  assert.match(readWeb('src/app/[locale]/tasks/tasks-board.tsx'), /kanban/);
  assert.match(readWeb('src/app/[locale]/calendar/page.tsx'), /calendar-grid/);
  assert.match(readWeb('src/app/[locale]/inbox/page.tsx'), /split-view/);
  assert.match(readWeb('src/app/[locale]/contacts/page.tsx'), /contact-grid/);
});

test('six language packs contain navigation and new product namespaces', () => {
  for (const locale of ['pt','en','fr','es','it','de']) {
    const messages = JSON.parse(readWeb(`src/messages/${locale}.json`));
    for (const namespace of ['Nav','Today','Inbox','Contacts','Tasks','Calendar','Personnel']) assert.ok(messages[namespace], `${locale} missing ${namespace}`);
    for (const key of ['today','inbox','tasks','calendar','personnel','contacts','team','settings']) assert.equal(typeof messages.Nav[key], 'string');
  }
});
