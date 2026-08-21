const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');

const buildSource=fs.readFileSync(path.join(__dirname,'../../scripts/build.js'),'utf8');
const catalog=fs.readFileSync(path.join(__dirname,'../../commercial/store-products.v1.json'),'utf8');
const apple=fs.readFileSync(path.join(__dirname,'../../src/platform/apple-billing.js'),'utf8');
const billing=fs.readFileSync(path.join(__dirname,'../../src/platform/billing-ui.js'),'utf8');

function fixture(baseUrl){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'zstudio-build-'));
  const write=(rel,data='')=>{const p=path.join(root,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);};
  write('scripts/build.js',buildSource);
  write('commercial/store-products.v1.json',catalog);
  const template=`<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'; connect-src 'self' https://z-studio-platform-seven.vercel.app;">
<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; connect-src 'self' https://z-studio-platform-seven.vercel.app;">
</head><body><header></header><script>__MYSTUDIO_SCRIPT_PLACEHOLDER__</script></body></html>`;
  write('src/template.html',template);
  for(const rel of ['src/data/i18n.js','src/data/categories.js','src/state/state.js','src/storage/indexeddb.js','src/platform/storage.js','src/main.js','src/render/layout-guards.js'])write(rel,'');
  write('src/platform/auth.js','window.ZStudioAuth={getAccessToken:async()=>"x"};');
  write('src/platform/apple-billing.js',apple);write('src/platform/billing-ui.js',billing);
  write('pwa/manifest.webmanifest','{"name":"My Studio"}');write('pwa/sw.js','// My Studio');
  write('legal/termos-de-servico.html','My Studio');write('legal/politica-privacidade.html','My Studio');
  const env={...process.env};if(baseUrl===undefined)delete env.ZSTUDIO_COMMERCIAL_BASE_URL;else env.ZSTUDIO_COMMERCIAL_BASE_URL=baseUrl;
  const result=cp.spawnSync(process.execPath,[path.join(root,'scripts/build.js')],{encoding:'utf8',env});
  return{root,result,html:result.status===0?fs.readFileSync(path.join(root,'app/index.html'),'utf8'):''};
}

test('build without commercial URL is fail-closed and emits no external commercial authority',()=>{
  const f=fixture(undefined);assert.equal(f.result.status,0,f.result.stderr);assert.match(f.result.stdout,/COMMERCIAL_RUNTIME=DISABLED/);assert.match(f.html,/"enabled":false/);assert.match(f.html,/window\.ZSTUDIO_COMMERCIAL_BASE_URL=""/);assert.doesNotMatch(f.html,/commercial\.example/);
});

test('build with HTTPS commercial origin injects public catalog and CSP exactly twice',()=>{
  const f=fixture('https://commercial.example/');assert.equal(f.result.status,0,f.result.stderr);assert.match(f.result.stdout,/COMMERCIAL_RUNTIME=https:\/\/commercial\.example/);assert.match(f.html,/"enabled":true/);assert.match(f.html,/"priceMinor":599/);assert.match(f.html,/ZStudioApple/);assert.match(f.html,/ZStudioBilling/);assert.equal((f.html.match(/connect-src[^;]*https:\/\/commercial\.example/g)||[]).length,2);
});

test('build rejects non-origin or non-HTTPS commercial URL',()=>{
  for(const value of ['http://commercial.example','https://commercial.example/path','https://user:pass@commercial.example']){const f=fixture(value);assert.notEqual(f.result.status,0,value);}
});
