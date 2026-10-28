/* ZOS — Z Studio inclus pour les agences Z Find et les employeurs Z Jobs
   (migration 20261028150000, cron Z Find). Sans réseau ni base. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sql = read('infrastructure/supabase/migrations/20261028150000_zos_marketplace_studio_bundle_v1.sql');
const cron = read('apps/find/apps/zfind-web/api/cron-daily.js');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

check('éligibles : agences Z Find actives et employeurs Z Jobs vérifiés', /pf\.role = 'partner_user' and pa\.status = 'active'/.test(sql) && /v\.outcome in \('verified', 'enhanced_verified'\)/.test(sql) && /m\.role::text in \('owner', 'admin', 'recruiter', 'hiring_manager'\)/.test(sql));
check('abonnement inclus dans l’autorité Z Studio : manual, monthly, référence zos-marketplace, droits studio_access + ai_access',
  /'monthly', 'active', 'manual', 'production'/.test(sql) && /'zos-marketplace:' \|\| v_person/.test(sql) && /array\['studio_access', 'ai_access'\]/.test(sql));
check('période = mois civil UTC (quota IA remis à zéro chaque mois)', /date_trunc\('month', now\(\) at time zone 'UTC'\)/.test(sql));
check('fin d’éligibilité : abonnement inclus et droits expirés, abonnements payés intacts',
  /source_subscription_ref like 'zos-marketplace:%'/.test(sql) && /set status = 'expired'/.test(sql) && /s\.billing_source = 'manual'/.test(sql));
check('fonctions réservées au service, search_path figé', ['zos_marketplace_studio_eligible', 'zos_sync_marketplace_studio_bundles'].every(fn =>
  new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated`).test(sql) && new RegExp(`grant execute on function public\\.${fn}\\(\\) to service_role`).test(sql)) &&
  (sql.match(/security definer\s*\n\s*set search_path = ''/g) || []).length === (sql.match(/security definer/g) || []).length);
check('synchronisation quotidienne par le cron Z Find', /rpc\/zos_sync_marketplace_studio_bundles/.test(cron));
const pro = require(path.join(ROOT, 'apps/find/apps/zfind-web/src/services/pro-offer.js'));
check('offre : Z Studio inclus, accès avec l’e-mail du compte Z Find', pro.pageHTML('fr').includes('zstudio.space') && pro.pageHTML('fr').includes('e-mail de votre compte Z Find') && pro.pageHTML('en').includes('sign in with your Z Find account e-mail'));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
