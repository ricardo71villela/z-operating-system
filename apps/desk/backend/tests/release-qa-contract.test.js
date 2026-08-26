const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..', '..');
const web = path.resolve(root, '..');

function filesUnder(dir, suffix) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(target, suffix));
    else if (!suffix || entry.name.endsWith(suffix)) out.push(target);
  }
  return out;
}

function read(file) { return fs.readFileSync(file, 'utf8'); }
function keyPaths(value, prefix = '') {
  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(next);
    if (child && typeof child === 'object' && !Array.isArray(child)) paths.push(...keyPaths(child, next));
  }
  return paths.sort();
}

test('release QA: no Desk controller accepts caller workspace authority ids', () => {
  const controllers = filesUnder(path.join(root, 'src'), '.controller.ts');
  assert.ok(controllers.length >= 10);
  for (const file of controllers) {
    const source = read(file);
    assert.doesNotMatch(source, /@Query\(['"]workspaceId['"]\)|@Body\(['"]workspaceId['"]\)/, path.relative(repo, file));
    assert.doesNotMatch(source, /@Query\(['"]tenantId['"]\)|@Body\(['"]tenantId['"]\)/, path.relative(repo, file));
  }
});

test('release QA: same-origin proxy strips legacy authority ids', () => {
  const source = read(path.join(web, 'src/app/api/desk/[...path]/route.ts'));
  for (const key of ['tenantId','tenant_id','workspaceId','workspace_id','createdBy','created_by']) assert.match(source, new RegExp(`['"]${key}['"]`));
  assert.match(source, /delete parsed\[key\]/);
});

test('release QA: six locales have exact translation-key parity', () => {
  const locales = ['pt','en','fr','es','it','de'];
  const packs = Object.fromEntries(locales.map((locale) => [locale, JSON.parse(read(path.join(web, `src/messages/${locale}.json`)))]));
  const reference = keyPaths(packs.en);
  for (const locale of locales) assert.deepEqual(keyPaths(packs[locale]), reference, `${locale} key parity`);
});

test('release QA: accessibility and responsive contracts are present', () => {
  const shell = read(path.join(web, 'src/components/desk-shell.tsx'));
  const globals = read(path.join(web, 'src/app/globals.css'));
  const completion = read(path.join(web, 'src/app/completion.css'));
  assert.match(shell, /href="#desk-main"/);
  assert.match(shell, /aria-current/);
  assert.match(globals, /:focus-visible/);
  assert.match(globals, /@media \(max-width: 680px\)/);
  assert.match(completion, /prefers-reduced-motion/);
});

test('release QA: AI and provider execution remain opt-in in example configuration', () => {
  const env = read(path.join(root, '.env.example'));
  assert.match(env, /DESK_ENABLE_WORKERS=false/);
  assert.match(env, /DESK_EXTERNAL_CALENDAR_PUSH_ENABLED=false/);
  assert.match(env, /DESK_WHATSAPP_EXPORT_ENABLED=false/);
  const migrations = filesUnder(path.join(repo, 'infrastructure/supabase/migrations'), '.sql').map(read).join('\n');
  assert.match(migrations, /ai_triage_enabled[^;]*default false/i);
});

test('release QA: all Desk SQL authority contracts remain registered for CI discovery', () => {
  const tests = fs.readdirSync(path.join(repo, 'infrastructure/supabase/tests')).filter((name) => /^z_desk_.*\.sql$/.test(name));
  assert.ok(tests.length >= 11, `expected >= 11 Desk SQL gates, found ${tests.length}`);
  for (const required of ['zos_convergence','integration_security','worker_ingestion','external_calendar','ai_triage','team_authority','task_event','personnel','today_action','integration_management']) {
    assert.ok(tests.some((name) => name.includes(required)), `missing Desk SQL gate containing ${required}`);
  }
});
