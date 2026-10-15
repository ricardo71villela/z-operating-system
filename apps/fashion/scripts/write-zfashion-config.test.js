const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { apiBaseUrlFrom, configSource } = require('./write-zfashion-config');

assert.strictEqual(apiBaseUrlFrom(''), '');
assert.strictEqual(apiBaseUrlFrom(undefined), '');
assert.strictEqual(apiBaseUrlFrom('https://api.zfashion.online/'), 'https://api.zfashion.online');
assert.strictEqual(apiBaseUrlFrom('https://zf-api.up.railway.app'), 'https://zf-api.up.railway.app');
assert.throws(() => apiBaseUrlFrom('http://api.zfashion.online'), /https/);
assert.throws(() => apiBaseUrlFrom('https://api.zfashion.online/v1'), /https/);
assert.throws(() => apiBaseUrlFrom("https://x.com';alert(1)//"), /https/);

const src = configSource('https://api.zfashion.online');
const sandbox = { window: {} };
new Function('window', src)(sandbox.window);
assert.deepStrictEqual(sandbox.window.__ZFASHION_CONFIG__, { apiBaseUrl: 'https://api.zfashion.online' });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zfcfg-'));
const script = path.join(__dirname, 'write-zfashion-config.js');
execFileSync(process.execPath, [script, dir], { env: { ...process.env, FASHION_API_BASE_URL: 'https://api.zfashion.online' } });
assert.match(fs.readFileSync(path.join(dir, 'zfashion-config.js'), 'utf8'), /apiBaseUrl: "https:\/\/api\.zfashion\.online"/);
assert.throws(() => execFileSync(process.execPath, [script, dir], { env: { ...process.env, FASHION_API_BASE_URL: 'nope' }, stdio: 'pipe' }));

console.log('write-zfashion-config: all checks passed.');

// Every Vercel build of a Z Fashion site writes the config and sends security headers.
for (const app of ['fashion-web', 'fashion-partner', 'fashion-admin']) {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', app, 'vercel.json'), 'utf8'));
  assert.match(cfg.buildCommand, /node \.\.\/\.\.\/scripts\/write-zfashion-config\.js (public|dist)/, `${app} build writes zfashion-config.js`);
  const headers = Object.fromEntries(cfg.headers[0].headers.map((h) => [h.key, h.value]));
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/, `${app} CSP`);
  assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
  assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff');
  assert.match(headers['X-Robots-Tag'], /noindex/);
}
const webCsp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'fashion-web', 'vercel.json'), 'utf8')).headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
assert.match(webCsp, /script-src[^;]*https:\/\/js\.stripe\.com/);
assert.match(webCsp, /frame-src[^;]*https:\/\/js\.stripe\.com/);
const partnerCfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'fashion-partner', 'vercel.json'), 'utf8'));
assert.match(partnerCfg.buildCommand, /rm -f dist\/preview-dashboard/, 'the old mock-up is not published');
console.log('Z Fashion hosting configuration: all checks passed.');
