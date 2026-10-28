// Z Jobs — contrato de alojamento na Vercel (três projetos, ver
// apps/jobs/docs/VERCEL-HOSTING.md). Verifica só o lado do repositório.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

// API: uma Node Function gerada pelo Build Output API.
const api = json('apps/jobs/apps/api/vercel.json');
assert.equal(api.buildCommand, 'node vercel/build.mjs');
assert.match(api.installCommand, /esbuild@0\.24\.2/);
assert.match(read('apps/jobs/apps/api/vercel/build.mjs'), /\.vercel', 'output'/);
assert.match(read('apps/jobs/apps/api/vercel/build.mjs'), /cpSync\(join\(apiRoot, 'certs'\)/);
assert.match(read('apps/jobs/apps/api/vercel/handler.ts'), /server\.emit\('request', req, res\)/);
assert.ok(existsSync('apps/jobs/apps/api/certs/supabase-root-2021-ca.crt'));

// Portal: bundle esbuild, /api/* reencaminhado para a API, SPA.
const web = json('apps/jobs/apps/web/vercel.json');
assert.equal(web.outputDirectory, 'dist');
assert.match(web.buildCommand, /esbuild entry\.jsx --bundle/);
assert.equal(web.rewrites[0].source, '/api/:path*');
assert.match(web.rewrites[0].destination, /^https:\/\/[a-z0-9-]+\.vercel\.app\/:path\*$/);
assert.equal(web.rewrites.at(-1).destination, '/index.html');
assert.match(read('apps/jobs/apps/web/index.html'), /window\.ZJOBS_API_BASE_URL = '\/api'/);
assert.match(read('apps/jobs/apps/web/entry.jsx'), /ZJobsDemo/);

// Montra: páginas estáticas em francês; antigos endereços em português → 301.
const montra = json('apps/jobs/apps/montra/vercel.json');
for (const route of ['candidats', 'employeurs', 'outils', 'entreprise', 'mentions-legales']) {
  assert.ok(montra.rewrites.some((r) => r.source === `/${route}` && r.destination === `/${route}.html`), route);
  assert.ok(existsSync(`apps/jobs/apps/montra/${route}.html`), route);
}
for (const [from, to] of [['candidatos', 'candidats'], ['empregadores', 'employeurs'], ['ferramentas', 'outils']]) {
  assert.ok(montra.redirects.some((r) => r.source === `/${from}` && r.destination === `/${to}` && r.permanent), from);
}

// Montra search calls /api/job-offers/search on its own origin: same API as the portal.
assert.equal(montra.rewrites[0].source, '/api/:path*');
assert.equal(montra.rewrites[0].destination, web.rewrites[0].destination);

console.log('Z Jobs Vercel hosting contract: PASS');
