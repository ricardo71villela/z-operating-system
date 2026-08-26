import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

const api = json('apps/jobs/apps/api/railway.json');
assert.equal(api.build?.builder, 'RAILPACK');
assert.equal(api.deploy?.startCommand, 'npm run start --workspace=@zjobs/api');
assert.equal(api.deploy?.healthcheckPath, '/health');

const webRailway = json('apps/jobs/apps/web/railway.json');
assert.equal(webRailway.deploy?.healthcheckPath, '/health');
const webDocker = read('apps/jobs/apps/web/Dockerfile');
assert.match(webDocker, /FROM node:22-alpine AS build/);
assert.match(webDocker, /FROM caddy:2\.8\.4-alpine/);
assert.match(webDocker, /esbuild entry\.jsx/);
const webCaddy = read('apps/jobs/apps/web/Caddyfile');
assert.match(webCaddy, /handle_path \/api\/\*/);
assert.match(webCaddy, /ZJOBS_API_PRIVATE_URL/);
const webIndex = read('apps/jobs/apps/web/index.html');
assert.match(webIndex, /window\.ZJOBS_API_BASE_URL = '\/api'/);
assert.match(read('apps/jobs/apps/web/entry.jsx'), /ZJobsDemo/);

const montraRailway = json('apps/jobs/apps/montra/railway.json');
assert.equal(montraRailway.deploy?.healthcheckPath, '/health');
const montraDocker = read('apps/jobs/apps/montra/Dockerfile');
assert.match(montraDocker, /FROM caddy:2\.8\.4-alpine/);
const montraCaddy = read('apps/jobs/apps/montra/Caddyfile');
for (const route of ['candidatos', 'empregadores', 'ferramentas']) {
  assert.match(montraCaddy, new RegExp(`/${route}\\b`));
  assert.match(montraCaddy, new RegExp(`/${route}\\.html`));
}

console.log('Z Jobs Railway hosting contract: PASS');
