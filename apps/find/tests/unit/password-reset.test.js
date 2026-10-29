/* Contract: « Mot de passe oublié » (services/password-reset.js), Partner et Admin.
   Sans réseau : le client Supabase est simulé. */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const APPS = path.join(__dirname, '..', '..', 'apps');

let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

const calls = [];
let session = null;
let resetError = null;
let updateError = null;
const fakeClient = {
  auth: {
    resetPasswordForEmail: async (email, opts) => { calls.push(['reset', email, opts]); return { error: resetError }; },
    getSession: async () => ({ data: { session } }),
    updateUser: async (attrs) => { calls.push(['update', attrs]); return { error: updateError }; }
  }
};
global.window = { location: { origin: 'https://partner.zfind.online', hash: '', search: '', pathname: '/' } };
const clientPath = path.join(WEB, 'src', 'services', 'supabaseClient.js');
require.cache[require.resolve(clientPath)] = { exports: { getSupabaseClient: () => fakeClient } };
const pr = require(path.join(WEB, 'src', 'services', 'password-reset.js'));

(async () => {
  // Link states
  check('lien valide : type=recovery', pr.recoveryState('#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery') === 'recovery');
  check('lien de confirmation (type=signup) : pas une réinitialisation', pr.recoveryState('#access_token=abc&type=signup') === null);
  check('lien expiré reconnu', pr.recoveryState('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid') === 'expired');
  check('sans hash : rien', pr.recoveryState('') === null);
  check('invitation d’équipe : pas une réinitialisation', pr.recoveryState('#invitation=12345678-1234-4234-8234-123456789012') === null);

  // Password rules
  check('mot de passe trop court refusé', /au moins 8/.test(pr.passwordProblem('abc', 'abc')));
  check('confirmation différente refusée', /identiques/.test(pr.passwordProblem('motdepasse1', 'motdepasse2')));
  check('mot de passe valide accepté', pr.passwordProblem('motdepasse1', 'motdepasse1') === null);

  // Request
  let r = await pr.requestReset('pas-un-email');
  check('e-mail invalide : aucun envoi', !r.ok && calls.length === 0);
  r = await pr.requestReset('  Claire@Agence.FR ');
  check('envoi : adresse normalisée', calls[0][0] === 'reset' && calls[0][1] === 'claire@agence.fr');
  check('le lien revient sur la même app (?reinitialiser=1)', calls[0][2].redirectTo === 'https://partner.zfind.online/?reinitialiser=1');
  check('réponse identique que le compte existe ou non', r.ok && /Si un compte existe/.test(r.message));
  resetError = { message: 'User not found' };
  const r2 = await pr.requestReset('inconnu@agence.fr');
  check('adresse inconnue : même réponse (aucune fuite)', r2.ok && r2.message === r.message);
  resetError = { message: 'For security purposes, you can only request this after 60 seconds.' };
  const r3 = await pr.requestReset('claire@agence.fr');
  check('trop de demandes : message clair', !r3.ok && /Patientez/.test(r3.message));
  resetError = null;

  // Update
  session = null;
  let u = await pr.updatePassword('motdepasse1', 'motdepasse1');
  check('sans session (lien expiré) : refus clair', !u.ok && /expiré/.test(u.message));
  session = { user: { id: 'u1' } };
  u = await pr.updatePassword('court', 'court');
  check('mot de passe court : pas d’appel', !u.ok && !calls.some(c => c[0] === 'update'));
  u = await pr.updatePassword('motdepasse1', 'motdepasse1');
  check('mot de passe enregistré', u.ok && calls.some(c => c[0] === 'update' && c[1].password === 'motdepasse1'));
  updateError = { message: 'Password is known to be weak and easy to guess, please choose a different one. (pwned)' };
  u = await pr.updatePassword('motdepasse1', 'motdepasse1');
  check('mot de passe divulgué : message en français', !u.ok && /fuites/.test(u.message));
  updateError = null;

  // Wiring in both apps
  const partnerBuild = fs.readFileSync(path.join(APPS, 'zfind-partner', 'scripts', 'build.js'), 'utf8');
  const adminBuild = fs.readFileSync(path.join(APPS, 'zfind-admin', 'scripts', 'build.js'), 'utf8');
  check('Partner : module partagé inclus dans le build', /services\/password-reset\.js/.test(partnerBuild) && /passwordResetService \+/.test(partnerBuild));
  check('Admin : module partagé inclus dans le build', /services\/password-reset\.js/.test(adminBuild));
  const partnerApp = fs.readFileSync(path.join(APPS, 'zfind-partner', 'src', 'app.js'), 'utf8');
  const adminApp = fs.readFileSync(path.join(APPS, 'zfind-admin', 'src', 'app.js'), 'utf8');
  const pBoot = partnerApp.slice(partnerApp.indexOf('async function boot()'));
  check('Partner : le lien de réinitialisation passe avant l’entrée dans l’espace',
    pBoot.indexOf('passwordReset.mount') > -1 && pBoot.indexOf('passwordReset.mount') < pBoot.indexOf('tryEnterDashboard'));
  const aInit = adminApp.slice(adminApp.indexOf('async function initAdmin()'));
  check('Admin : le lien de réinitialisation passe avant le contrôle admin',
    aInit.indexOf('passwordReset.mount') > -1 && aInit.indexOf('passwordReset.mount') < aInit.indexOf('checkAdminAccess'));

  check('Admin : tout lien expiré est expliqué (anyExpiredLink)', /anyExpiredLink: true/.test(adminApp) && /opts\.anyExpiredLink/.test(fs.readFileSync(path.join(WEB, 'src', 'services', 'password-reset.js'), 'utf8')));

  console.log(`\n${passed} checks passed.`);
})().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
