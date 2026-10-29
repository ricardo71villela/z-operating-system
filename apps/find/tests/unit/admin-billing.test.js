/* Contract: Admin « Facturation » — abonnements, agences sans moyen de paiement,
   commandes, totaux ; lecture réservée aux administrateurs. */
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const ADMIN = path.join(__dirname, '..', '..', 'apps', 'zfind-admin');
const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

console.log('\n=== Z FIND ADMIN BILLING ===');
const sql = fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20261029200000_z_find_admin_billing_v1.sql'), 'utf8');
check('migration : réservé aux administrateurs (is_admin), jamais anonyme', /if not public\.is_admin\(\) then/.test(sql) && /revoke all on function public\.zfind_admin_billing_overview\(\) from public, anon/.test(sql));
check('migration : abonnements, agences sans moyen de paiement, commandes, totaux', ['subscriptions', 'without_subscription', 'orders', 'totals', 'mrr_ht', 'trialing_mrr_ht', 'orders_paid_month_ht_cents'].every(k => sql.includes(`'${k}'`)));
check('migration : prix des paliers identiques à pro-offer.js', (() => {
  const P = require(path.join(WEB, 'src', 'services', 'pro-offer.js')).PRICES;
  return sql.includes(`"essentiel": ${P.essentiel}, "plus": ${P.plus}, "pro": ${P.pro}, "premium": ${P.premium}`);
})());
check('migration : mode Stripe (test / réel) enregistré pour les liens', /add column if not exists livemode boolean/.test(sql) && /livemode: typeof sub\.livemode === 'boolean'/.test(fs.readFileSync(path.join(WEB, 'api', 'billing.js'), 'utf8')));

const body = fs.readFileSync(path.join(ADMIN, 'src', 'body.html'), 'utf8');
const app = fs.readFileSync(path.join(ADMIN, 'src', 'app.js'), 'utf8');
const build = fs.readFileSync(path.join(ADMIN, 'scripts', 'build.js'), 'utf8');
const view = fs.readFileSync(path.join(ADMIN, 'src', 'billing.js'), 'utf8');
check('Admin : entrée « Facturation », route et billing.js construit', body.includes("navigateAdmin('facturation')") && /facturation: renderBilling/.test(app) && build.includes("readAdmin('billing.js')"));
check('Admin : liens vers le tableau Stripe, en test tant que l’abonnement n’est pas réel', /dashboard\.stripe\.com\/\$\{test \? 'test\/' : ''\}/.test(view) && /livemode !== true/.test(view));
check('Admin : mises en avant et contacts vendeurs séparés', /\^highlight\|\^agency_featured/.test(view) && /\^seller_lead/.test(view));
console.log(`\nADMIN BILLING: ${passed}/${passed} PASSED`);
