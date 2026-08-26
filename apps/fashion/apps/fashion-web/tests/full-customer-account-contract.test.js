const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

const shell = read('customer-shell.html');
const state = read('customer-state.js');
const account = read('customer-account.js');
const interactions = read('customer-interactions.js');
const css = read('customer-account.css');

for (const asset of ['customer-account.css','customer-state.js','customer-account.js','customer-interactions.js']) assert.match(shell,new RegExp(asset.replace('.','\\.')));
assert.ok(shell.indexOf('customer-state.js') < shell.indexOf('customer-account.js'));
assert.ok(shell.indexOf('customer-account.js') < shell.indexOf('customer-site.js'));
assert.ok(shell.indexOf('customer-site.js') < shell.indexOf('customer-interactions.js'));
for (const id of ['headerFavouriteCount','headerBagCount','mobileFavouriteCount','mobileBagCount']) assert.match(shell,new RegExp(`id="${id}"`));

assert.match(state,/zfashion_preview_favourites_v1/);
assert.match(state,/zfashion_preview_bag_v1/);
assert.match(state,/PREVIEW_LOCAL_ONLY/);
assert.match(state,/toggleFavourite/);
assert.match(state,/addBag/);
assert.match(state,/setBagQty/);
assert.match(state,/removeBag/);
assert.match(state,/demoProfile/);
assert.match(state,/demoAddresses/);
assert.match(state,/demoOrders/);
assert.match(state,/ZF-PREVIEW-260001/);
assert.match(state,/ZF-PREVIEW-260002/);
assert.doesNotMatch(state,/fetch\(|XMLHttpRequest|supabase|stripe|signInWith|createOrder/i);

for (const locale of ['fr','pt','en','es','it','de']) assert.match(account,new RegExp(`\\b${locale}:\\{preview:`),`missing account locale ${locale}`);
for (const renderer of ['renderFavourites','renderBag','renderLogin','renderDashboard','renderProfile','renderAddresses','renderOrders','renderOrder','renderReturns','renderTracking']) assert.match(account,new RegExp(`const\\s+${renderer}\\s*=`));
assert.match(account,/STATE\.snapshot\(\)/);
assert.match(account,/STATE\.toggleFavourite/);
assert.match(account,/STATE\.setBagQty/);
assert.match(account,/STATE\.removeBag/);
assert.match(account,/Z_FASHION_CUSTOMER_AREA='PREVIEW_PASS'/);
assert.doesNotMatch(account,/fetch\(|XMLHttpRequest|supabase|stripe|signInWith|createOrder|reserveStock/i);

assert.match(interactions,/data-preview-add-bag/);
assert.match(interactions,/STATE\.addBag/);
assert.match(interactions,/data-preview-favourite/);
assert.match(interactions,/STATE\.toggleFavourite/);
assert.match(interactions,/syncCounts/);
assert.match(interactions,/choose|Choisissez une taille/);
assert.match(interactions,/Z_FASHION_CUSTOMER_INTERACTIONS='PREVIEW_PASS'/);
assert.doesNotMatch(interactions,/fetch\(|XMLHttpRequest|supabase|stripe|paymentIntent|createOrder|reserveStock/i);

for (const selector of ['bag-layout','favourite-toggle','preview-auth','profile-grid','address-grid','orders-list','order-detail','return-grid','tracking-timeline']) assert.match(css,new RegExp(`\\.${selector}`));
assert.match(css,/@media\(max-width:680px\)/);

console.log('Z_FASHION_FULL_CUSTOMER_ACCOUNT=PASS');
