const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('public/dashboard.html');
const css=read('public/dashboard.css');
const js=read('public/dashboard.js');

for(const asset of ['dashboard.css','dashboard.js']) assert.match(html,new RegExp(asset.replace('.','\\.')));
assert.match(html,/noindex,nofollow/);
assert.match(html,/<html lang="fr-FR" data-locale="fr">/);

for(const locale of ['fr','pt','en','es','it','de']){
  assert.match(html,new RegExp(`<option value="${locale}">`),`missing locale option ${locale}`);
  assert.match(js,new RegExp(`\\b${locale}:\\{`),`missing locale runtime ${locale}`);
}

for(const label of ['Catalogue','Stock','Commandes','Expéditions','Retours','Corner','Campagnes','Analytics','Finance']){
  assert.ok(html.includes(label),`missing Partner surface ${label}`);
}

assert.match(html,/Maison Nord/);
assert.match(html,/Aperçu uniquement\. Auth, stock, commandes, paiements et versements réels restent désactivés\./);
assert.match(html,/aucun règlement, transfert Stripe ou versement réel n’est activé/);
assert.match(js,/Z_FASHION_PARTNER_DASHBOARD='PREVIEW_PASS'/);
assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|supabase|createOrder|reserveStock|insert\(|update\(|delete\(/i);

for(const selector of ['sidebar','topbar','kpis','grid-main','grid-secondary','orders','preview-note']){
  assert.match(css,new RegExp(`\\.${selector}`),`missing Partner dashboard style ${selector}`);
}
assert.match(css,/@media\(max-width:820px\)/);
assert.match(css,/@media\(max-width:560px\)/);

console.log('Z_FASHION_PARTNER_DASHBOARD_PREVIEW=PASS');
