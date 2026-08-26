#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0;
function check(condition, label) {
  if (!condition) {
    console.error('❌ ' + label);
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log('✅ ' + label);
}

const auth = read('src/platform/auth.js');
const build = read('scripts/build.js');
const html = read('app/index.html');
const legacy = read('app/my-studio.html');
const native = read('native/www/index.html');

check(auth.includes('ZSTUDIO_PASSWORDLESS_AUTH_V1'), 'passwordless auth authority marker exists');
check(auth.includes("@supabase/supabase-js@2.111.0"), 'Supabase JS dependency is pinned exactly');
check(auth.includes('autoRefreshToken: true'), 'session token auto-refresh is enabled');
check(auth.includes('persistSession: true'), 'browser/native session persistence is enabled');
check(auth.includes('detectSessionInUrl: false'), 'OTP flow does not trust URL session detection');
check(auth.includes('onAuthStateChange'), 'auth state changes update local session state');
check(auth.includes('getSession()'), 'browser session is retrieved through Supabase Auth');
check(auth.includes("signInWithOtp({ email, options: { shouldCreateUser: true } })"), 'email OTP can create an Auth identity');
check(auth.includes("verifyOtp({ email: zstudioPendingEmail, token, type: 'email' })"), 'six-digit email OTP is verified into a session');
check(auth.includes("signOut({ scope: 'local' })"), 'sign-out is scoped to the current client session');
check(auth.includes("client.rpc('zstudio_ensure_account')"), 'signed-in Studio identity uses the canonical account bridge');
check(auth.includes('Authorization: `Bearer ${accessToken}`'), 'AI requests carry the Supabase Bearer token');
check(auth.includes("code === 'AI_ENTITLEMENT_REQUIRED'"), 'paid AI entitlement denial is mapped in the client');
check(auth.includes("code === 'AI_QUOTA_EXCEEDED'"), 'AI quota exhaustion is mapped in the client');
check(!auth.includes('service_role') && !auth.includes('sb_secret_'), 'no privileged Supabase credential appears in client auth code');
check(!auth.includes('console.log') && !auth.includes('console.info') && !auth.includes('console.warn') && !auth.includes('console.error'), 'auth code does not log email/token/session data');
check(!auth.includes('localStorage.setItem') && !auth.includes('sessionStorage.setItem'), 'auth code does not manually persist OTP/email/token material');
for (const lang of ['pt', 'en', 'fr', 'es', 'de', 'it']) {
  check(new RegExp(`\\n  ${lang}: \\{`).test(auth), `auth UI contains ${lang.toUpperCase()} copy`);
}

check(build.includes("path.join(SRC, 'platform', 'auth.js')"), 'build reads the auth source module');
check(/main,\s*layoutGuards,\s*auth/.test(build), 'auth module is emitted after the legacy AI bridge');
check(build.includes('https://cdn.jsdelivr.net'), 'build authorizes the pinned CDN in CSP');
check(build.includes('https://dcdggqyazdddrfuzwavw.supabase.co'), 'build authorizes the Supabase project in connect-src');

check(html.includes('ZSTUDIO_PASSWORDLESS_AUTH_V1'), 'generated web root contains auth authority');
check(html.includes('@supabase/supabase-js@2.111.0'), 'generated web root contains pinned Supabase JS URL');
check(html.includes('Authorization: `Bearer ${accessToken}`'), 'generated web root contains authenticated AI bridge');
check(/script-src[^;]*https:\/\/cdn\.jsdelivr\.net/.test(html), 'generated CSP permits jsDelivr');
check(/connect-src[^;]*https:\/\/dcdggqyazdddrfuzwavw\.supabase\.co/.test(html), 'generated CSP permits Supabase Auth/API');
check(!html.includes('service_role') && !html.includes('sb_secret_'), 'generated client contains no privileged Supabase credential');
check(html === legacy && html === native, 'web root, legacy route and native bundle remain byte-identical');

if (process.exitCode) {
  console.error(`\nAUTH_SESSION_CONTRACT=FAIL (${passed} checks passed before failure)`);
  process.exit(process.exitCode);
}
console.log(`\nAUTH_SESSION_CONTRACT=PASS (${passed} checks)`);
