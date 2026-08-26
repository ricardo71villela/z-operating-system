const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html');
const css=read('styles.css');
const js=read('app.js');

for(const asset of ['styles.css','app.js']) assert.match(html,new RegExp(asset.replace('.','\\.')));
assert.match(html,/noindex,nofollow/);
assert.match(html,/<html lang="fr-FR" data-locale="fr">/);

for(const page of ['overview','partners','catalogue','orders','returns','campaigns','finance','risk','support','system','settings']){
  assert.match(html,new RegExp(`id="${page}"`),`missing admin page ${page}`);
  assert.match(html,new RegExp(`data-page="${page}"`),`missing admin navigation ${page}`);
}

for(const locale of ['fr','pt','en','es','it','de']){
  assert.match(html,new RegExp(`<option value="${locale}">`),`missing locale option ${locale}`);
  assert.match(js,new RegExp(`\\b${locale}:\\{`),`missing locale runtime ${locale}`);
}

assert.match(html,/PREVIEW · INTERNAL/);
assert.match(html,/Live Supabase<\/span><strong>NOT ACTIVATED/);
assert.match(html,/Auth live<\/span><strong>Disabled/);
assert.match(html,/Payments live<\/span><strong>Disabled/);
assert.match(html,/DB mutation<\/span><strong>Disabled/);
assert.match(html,/aucune collecte Stripe live/);
assert.match(js,/Z_FASHION_ADMIN_BACKOFFICE='PREVIEW_PASS'/);

assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|supabase|stripe|createOrder|reserveStock|insert\(|update\(|delete\(/i);
assert.doesNotMatch(html,/<h2 class="section-title"/);

for(const selector of ['sidebar','topbar','kpis','panel','table','detail-grid','boundary']){
  assert.match(css,new RegExp(`\\.${selector}`),`missing admin style ${selector}`);
}
assert.match(css,/@media\(max-width:820px\)/);
assert.match(css,/@media\(max-width:560px\)/);

console.log('Z_FASHION_ADMIN_BACKOFFICE_PREVIEW=PASS');
