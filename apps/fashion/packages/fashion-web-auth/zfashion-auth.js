/* ============================================================
   Z FASHION — staff sign-in (Partner dashboard + admin backoffice)
   ============================================================
   SOURCE OF TRUTH. Copied verbatim into each static surface by
   `node apps/fashion/packages/fashion-web-auth/sync.js`; the copies
   are checked byte-for-byte by tests/sync.test.js. Edit here, then sync.

   Passwordless Supabase Auth, same pattern as Z Studio: the person
   types their e-mail, receives a 6-digit code, types it. No password
   is ever created or stored. Accounts are never created from this
   page except the adhesion page (data-surface="onboarding"), where a
   store creates its account by signing in for the first time. Admin
   accounts are created/invited in Supabase.

   After sign-in the page calls the Partner API's GET /me with the
   access token and only unlocks when the caller has the right role:
     data-surface="admin"   → isAdmin (FASHION_ADMIN_USER_IDS on the API)
     data-surface="partner" → manages at least one Partner
     data-surface="onboarding" → any signed-in person (the page itself
                                decides what to show from /me)
   The page content stays hidden until then. This is a UI gate only:
   every API route still authorizes each request on its own.

   Uses only the public Supabase project URL and publishable key.
   Configure per deployment, BEFORE this script, with:
     <script>window.__ZFASHION_CONFIG__ = { apiBaseUrl: 'https://api…' };</script>
   ============================================================ */

(function () {
  'use strict';

  var script = document.currentScript;
  var requested = script && script.dataset.surface;
  var surface = requested === 'admin' || requested === 'onboarding' ? requested : 'partner';
  // Only the adhesion page may create an account; staff surfaces never do.
  var createsAccounts = surface === 'onboarding';

  var config = Object.assign({
    supabaseUrl: 'https://dcdggqyazdddrfuzwavw.supabase.co',
    supabasePublishableKey: 'sb_publishable_LQqhseuSfNibffNh_cLLGQ_0cVxHQzX',
    apiBaseUrl: '',
  }, window.__ZFASHION_CONFIG__ || {});
  config.apiBaseUrl = String(config.apiBaseUrl || '').replace(/\/+$/, '');

  var SUPABASE_JS_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0';

  var STRINGS = {
    fr: {
      titleadmin: 'Backoffice Z Fashion',
      titlepartner: 'Espace Partner Z Fashion',
      titleonboarding: 'Vendre sur Z Fashion',
      subtitle: 'Saisissez votre e-mail professionnel pour recevoir un code de connexion à 6 chiffres.',
      subtitleonboarding: 'Saisissez votre e-mail professionnel pour recevoir un code à 6 chiffres. Votre compte Partner est créé à la première connexion ; vous pourrez ensuite déposer la demande d’adhésion de votre boutique.',
      email: 'E-mail', emailPlaceholder: 'nom@boutique.fr', sendCode: 'Recevoir le code',
      code: 'Code reçu par e-mail', verify: 'Se connecter', changeEmail: 'Utiliser un autre e-mail',
      codeSent: 'Si ce compte existe, un code vient d’être envoyé à {email}.',
      codeSentonboarding: 'Un code vient d’être envoyé à {email}.',
      sending: 'Envoi…', checking: 'Vérification…', signOut: 'Se déconnecter',
      invalidEmail: 'Saisissez une adresse e-mail valide.', invalidCode: 'Saisissez le code reçu (6 chiffres).',
      wrongCode: 'Code incorrect ou expiré. Réessayez ou demandez un nouveau code.',
      rateLimited: 'Trop de demandes. Patientez quelques minutes avant de réessayer.',
      unavailable: 'Connexion temporairement indisponible. Réessayez plus tard.',
      apiMissing: 'Connexion réussie, mais l’API Z Fashion n’est pas configurée pour cette page. Accès refusé.',
      apiUnreachable: 'Connexion réussie, mais l’API Z Fashion ne répond pas. Réessayez plus tard.',
      deniedadmin: 'Ce compte n’a pas d’accès administrateur Z Fashion.',
      deniedpartner: 'Ce compte n’est relié à aucune boutique Z Fashion. Si votre adhésion est en cours, nous vous contacterons dès son activation.',
      sessionExpired: 'Votre session a expiré. Reconnectez-vous.',
      signedInAs: 'Connecté :',
    },
    en: {
      titleadmin: 'Z Fashion backoffice',
      titlepartner: 'Z Fashion Partner space',
      titleonboarding: 'Sell on Z Fashion',
      subtitle: 'Enter your work e-mail to receive a 6-digit sign-in code.',
      subtitleonboarding: 'Enter your work e-mail to receive a 6-digit code. Your Partner account is created the first time you sign in; you can then submit your store’s application.',
      email: 'E-mail', emailPlaceholder: 'name@store.com', sendCode: 'Send code',
      code: 'Code received by e-mail', verify: 'Sign in', changeEmail: 'Use another e-mail',
      codeSent: 'If this account exists, a code has just been sent to {email}.',
      codeSentonboarding: 'A code has just been sent to {email}.',
      sending: 'Sending…', checking: 'Checking…', signOut: 'Sign out',
      invalidEmail: 'Enter a valid e-mail address.', invalidCode: 'Enter the code you received (6 digits).',
      wrongCode: 'Incorrect or expired code. Try again or request a new code.',
      rateLimited: 'Too many requests. Wait a few minutes before trying again.',
      unavailable: 'Sign-in is temporarily unavailable. Try again later.',
      apiMissing: 'Signed in, but the Z Fashion API is not configured for this page. Access denied.',
      apiUnreachable: 'Signed in, but the Z Fashion API is not responding. Try again later.',
      deniedadmin: 'This account has no Z Fashion admin access.',
      deniedpartner: 'This account is not linked to any Z Fashion store. If your application is in progress, we will contact you once it is activated.',
      sessionExpired: 'Your session has expired. Sign in again.',
      signedInAs: 'Signed in:',
    },
  };

  function lang() {
    var l = (document.documentElement.dataset.locale || document.documentElement.lang || 'fr').slice(0, 2);
    return STRINGS[l] ? l : 'fr';
  }
  function t(key, vars) {
    var s = STRINGS[lang()][key] || STRINGS.fr[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }

  // ---------- DOM (built with textContent only; nothing user-supplied is parsed as HTML)

  var STYLE = [
    'html.zf-auth-locked body>*:not(.zf-auth){visibility:hidden!important}',
    'html.zf-auth-locked body{overflow:hidden}',
    '.zf-auth{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:#f6f4f1;font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#151515}',
    '.zf-auth[hidden]{display:none}',
    '.zf-auth-card{width:100%;max-width:380px;background:#fff;border:1px solid #e4e0da;border-radius:14px;padding:28px 24px;box-shadow:0 10px 40px rgba(0,0,0,.06)}',
    '.zf-auth-brand{font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:12px;color:#6b6560;margin:0 0 8px}',
    '.zf-auth h1{font-size:22px;margin:0 0 6px;font-weight:650}',
    '.zf-auth p{margin:0 0 16px;color:#4a4540}',
    '.zf-auth label{display:block;font-size:13px;font-weight:600;margin:0 0 6px}',
    '.zf-auth input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cfc9c1;border-radius:9px;font:inherit;margin:0 0 14px;background:#fff;color:inherit}',
    '.zf-auth input:focus{outline:2px solid #151515;outline-offset:1px}',
    '.zf-auth button{width:100%;padding:11px 14px;border-radius:9px;border:0;background:#151515;color:#fff;font:inherit;font-weight:600;cursor:pointer}',
    '.zf-auth button[disabled]{opacity:.6;cursor:default}',
    '.zf-auth button.zf-link{background:none;color:#151515;text-decoration:underline;padding:8px 0 0;font-weight:500}',
    '.zf-auth-msg{font-size:14px;margin:0 0 14px;padding:10px 12px;border-radius:9px;background:#f1efe9}',
    '.zf-auth-msg.err{background:#fbeaea;color:#8a1c1c}',
    '.zf-auth-msg:empty{display:none}',
    '.zf-auth-session{position:fixed;right:12px;bottom:12px;z-index:2147482000;display:flex;gap:10px;align-items:center;background:#151515;color:#fff;border-radius:999px;padding:6px 6px 6px 14px;font:13px system-ui,sans-serif;max-width:calc(100vw - 24px)}',
    '.zf-auth-session[hidden]{display:none}',
    'html.zf-auth-signed-in body{padding-bottom:72px}',
    '.zf-auth-session span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.zf-auth-session button{border:0;border-radius:999px;padding:6px 12px;background:#fff;color:#151515;font:inherit;font-weight:600;cursor:pointer;flex:none}',
  ].join('\n');

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  var ui = {};
  function buildUi() {
    var style = el('style'); style.textContent = STYLE; document.head.appendChild(style);

    ui.root = el('div', { class: 'zf-auth', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'zf-auth-title' });
    var card = el('div', { class: 'zf-auth-card' });
    card.appendChild(el('p', { class: 'zf-auth-brand' }, 'Z Fashion'));
    ui.title = el('h1', { id: 'zf-auth-title' });
    ui.subtitle = el('p');
    ui.msg = el('div', { class: 'zf-auth-msg', role: 'status', 'aria-live': 'polite' });

    ui.emailForm = el('form', { novalidate: '' });
    ui.emailLabel = el('label', { for: 'zf-auth-email' });
    ui.email = el('input', { id: 'zf-auth-email', type: 'email', autocomplete: 'email', inputmode: 'email', required: '' });
    ui.sendBtn = el('button', { type: 'submit' });
    ui.emailForm.append(ui.emailLabel, ui.email, ui.sendBtn);

    ui.codeForm = el('form', { novalidate: '', hidden: '' });
    ui.codeLabel = el('label', { for: 'zf-auth-code' });
    ui.code = el('input', { id: 'zf-auth-code', type: 'text', autocomplete: 'one-time-code', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '10', required: '' });
    ui.verifyBtn = el('button', { type: 'submit' });
    ui.changeBtn = el('button', { type: 'button', class: 'zf-link' });
    ui.codeForm.append(ui.codeLabel, ui.code, ui.verifyBtn, ui.changeBtn);

    ui.deniedSignOut = el('button', { type: 'button', hidden: '' });

    card.append(ui.title, ui.subtitle, ui.msg, ui.emailForm, ui.codeForm, ui.deniedSignOut);
    ui.root.appendChild(card);
    document.body.appendChild(ui.root);

    ui.session = el('div', { class: 'zf-auth-session', hidden: '' });
    ui.sessionText = el('span');
    ui.sessionOut = el('button', { type: 'button' });
    ui.session.append(ui.sessionText, ui.sessionOut);
    document.body.appendChild(ui.session);

    ui.emailForm.addEventListener('submit', function (e) { e.preventDefault(); sendCode(); });
    ui.codeForm.addEventListener('submit', function (e) { e.preventDefault(); verifyCode(); });
    ui.changeBtn.addEventListener('click', function () { showEmailStep(''); });
    ui.deniedSignOut.addEventListener('click', signOut);
    ui.sessionOut.addEventListener('click', signOut);
    applyText();
  }

  function applyText() {
    ui.title.textContent = t('title' + surface);
    ui.subtitle.textContent = t(surface === 'onboarding' ? 'subtitleonboarding' : 'subtitle');
    ui.emailLabel.textContent = t('email');
    ui.email.placeholder = t('emailPlaceholder');
    ui.sendBtn.textContent = t('sendCode');
    ui.codeLabel.textContent = t('code');
    ui.verifyBtn.textContent = t('verify');
    ui.changeBtn.textContent = t('changeEmail');
    ui.deniedSignOut.textContent = t('signOut');
    ui.sessionOut.textContent = t('signOut');
  }

  function setMsg(text, isError) {
    ui.msg.textContent = text || '';
    ui.msg.className = 'zf-auth-msg' + (isError ? ' err' : '');
  }
  function lock() {
    document.documentElement.classList.add('zf-auth-locked');
    document.documentElement.classList.remove('zf-auth-signed-in');
    ui.root.hidden = false;
    ui.session.hidden = true;
  }
  function unlock(email) {
    document.documentElement.classList.remove('zf-auth-locked');
    document.documentElement.classList.add('zf-auth-signed-in');
    ui.root.hidden = true;
    ui.sessionText.textContent = t('signedInAs') + ' ' + (email || '');
    ui.session.hidden = false;
  }
  function showEmailStep(message, isError) {
    lock();
    ui.emailForm.hidden = false; ui.codeForm.hidden = true; ui.deniedSignOut.hidden = true;
    ui.sendBtn.disabled = false; ui.sendBtn.textContent = t('sendCode');
    setMsg(message, isError);
    ui.email.focus();
  }
  function showCodeStep(email) {
    ui.emailForm.hidden = true; ui.codeForm.hidden = false; ui.deniedSignOut.hidden = true;
    ui.code.value = '';
    setMsg(t(surface === 'onboarding' ? 'codeSentonboarding' : 'codeSent', { email: email }));
    ui.code.focus();
  }
  function showDenied(message) {
    lock();
    ui.emailForm.hidden = true; ui.codeForm.hidden = true; ui.deniedSignOut.hidden = false;
    setMsg(message, true);
  }

  // ---------- Supabase

  var clientPromise = null;
  function loadSupabaseJs() {
    if (window.supabase && typeof window.supabase.createClient === 'function') return Promise.resolve(window.supabase);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SUPABASE_JS_CDN;
      s.async = true;
      s.onload = function () { window.supabase ? resolve(window.supabase) : reject(new Error('supabase-js missing')); };
      s.onerror = function () { reject(new Error('supabase-js failed to load')); };
      document.head.appendChild(s);
    });
  }
  function client() {
    if (!clientPromise) {
      clientPromise = loadSupabaseJs().then(function (lib) {
        return lib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'zfashion-' + surface + '-auth' },
        });
      });
    }
    return clientPromise;
  }

  var pendingEmail = '';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function sendCode() {
    var email = ui.email.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return setMsg(t('invalidEmail'), true);
    ui.sendBtn.disabled = true; ui.sendBtn.textContent = t('sending');
    client().then(function (sb) {
      return sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: createsAccounts } });
    }).then(function (result) {
      var err = result && result.error;
      if (err && (err.status === 429 || /rate limit/i.test(err.message || ''))) {
        return showEmailStep(t('rateLimited'), true);
      }
      // Any other outcome (including "user not found") shows the same
      // neutral message, so this page does not reveal which e-mails
      // have an account.
      pendingEmail = email;
      showCodeStep(email);
    }).catch(function () {
      showEmailStep(t('unavailable'), true);
    });
  }

  function verifyCode() {
    var token = ui.code.value.replace(/\s+/g, '');
    if (!/^[0-9]{6,10}$/.test(token)) return setMsg(t('invalidCode'), true);
    ui.verifyBtn.disabled = true; ui.verifyBtn.textContent = t('checking');
    client().then(function (sb) {
      return sb.auth.verifyOtp({ email: pendingEmail, token: token, type: 'email' });
    }).then(function (result) {
      ui.verifyBtn.disabled = false; ui.verifyBtn.textContent = t('verify');
      if (result.error || !result.data || !result.data.session) return setMsg(t('wrongCode'), true);
      return authorize(result.data.session);
    }).catch(function () {
      ui.verifyBtn.disabled = false; ui.verifyBtn.textContent = t('verify');
      setMsg(t('unavailable'), true);
    });
  }

  function signOut() {
    me = null;
    client().then(function (sb) { return sb.auth.signOut(); }).catch(function () {}).then(function () {
      showEmailStep('');
    });
  }

  // ---------- API

  var me = null;
  var currentSession = null;

  function apiFetch(path, init) {
    if (!config.apiBaseUrl) return Promise.reject(new Error('Z Fashion API not configured'));
    return client().then(function (sb) { return sb.auth.getSession(); }).then(function (r) {
      var session = r && r.data && r.data.session;
      if (!session) throw new Error('not signed in');
      var opts = Object.assign({}, init || {});
      opts.headers = Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + session.access_token });
      var binary = opts.body && ((typeof Blob !== 'undefined' && opts.body instanceof Blob) ||
        opts.body instanceof ArrayBuffer || ArrayBuffer.isView(opts.body));
      if (binary) {
        // Files (photos, logos) are sent as they are, with their own type.
        if (!opts.headers['Content-Type'] && opts.body.type) opts.headers['Content-Type'] = opts.body.type;
      } else if (opts.body && typeof opts.body !== 'string') {
        opts.body = JSON.stringify(opts.body);
        opts.headers['Content-Type'] = 'application/json';
      }
      return fetch(config.apiBaseUrl + path, opts);
    });
  }

  function authorize(session) {
    currentSession = session;
    if (!config.apiBaseUrl) return showDenied(t('apiMissing'));
    return apiFetch('/me').then(function (res) {
      if (res.status === 401) {
        return client().then(function (sb) { return sb.auth.signOut(); }).then(function () {
          showEmailStep(t('sessionExpired'), true);
        });
      }
      if (!res.ok) return showDenied(t('apiUnreachable'));
      return res.json().then(function (body) {
        me = body;
        var allowed = surface === 'onboarding'
          ? body.authenticated === true
          : surface === 'admin'
            ? body.isAdmin === true
            : Array.isArray(body.partnerIds) && body.partnerIds.length > 0;
        if (!allowed) return showDenied(t('denied' + surface));
        unlock(session.user && session.user.email);
        document.dispatchEvent(new CustomEvent('zfashion:auth', { detail: { me: body } }));
      });
    }).catch(function () {
      showDenied(t('apiUnreachable'));
    });
  }

  // ---------- public surface for the page's own code

  window.ZFashionAuth = Object.freeze({
    surface: surface,
    apiFetch: apiFetch,
    signOut: signOut,
    me: function () { return me; },
    email: function () { return currentSession && currentSession.user ? currentSession.user.email : null; },
  });

  // ---------- start

  function start() {
    buildUi();
    lock();
    client().then(function (sb) {
      sb.auth.onAuthStateChange(function (event) {
        if (event === 'SIGNED_OUT' && me) { me = null; showEmailStep(t('sessionExpired'), true); }
      });
      return sb.auth.getSession();
    }).then(function (r) {
      var session = r && r.data && r.data.session;
      if (session) return authorize(session);
      showEmailStep('');
    }).catch(function () {
      showEmailStep(t('unavailable'), true);
    });
  }

  // Lock as early as possible so demo content never flashes before the check.
  document.documentElement.classList.add('zf-auth-locked');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
