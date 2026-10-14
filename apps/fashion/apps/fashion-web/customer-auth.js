/* ============================================================
   Z FASHION — customer sign-in (Supabase Auth, passwordless)
   ============================================================
   Real session for shoppers, same pattern as Z Studio and the Z Fashion
   staff surfaces: e-mail → 6-digit code → session. No password exists.
   Unlike staff sign-in, a first code to a new e-mail CREATES the account
   (shouldCreateUser: true): customers sign up by signing in.

   After a successful code, public.zfashion_ensure_client() registers the
   caller as a Z Fashion client (fashion.clients.id = auth.users.id) and
   links them to their canonical ZOS person through the Identity Bridge.
   It is granted to `authenticated` only and is idempotent.

   What this file owns, and only this:
     /connexion        → the real sign-in form (or "you are signed in")
     /compte, /compte/* → require a session; otherwise redirect to
                          /connexion?next=<path>; add a session strip
     home page          → the account drawer's button opens /connexion
   Favourites, bag, orders and addresses shown on these pages are still
   the demonstration data of the other customer-* layers (tasks 13–14).
   Those layers re-render #pageContent on language change; this file
   watches it and puts its own block back when that happens.

   Uses only the public Supabase URL and publishable key. Never builds
   HTML from strings: every node is created with textContent.
   ============================================================ */

(function () {
  'use strict';

  var SUPABASE_URL = 'https://dcdggqyazdddrfuzwavw.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_LQqhseuSfNibffNh_cLLGQ_0cVxHQzX';
  var SUPABASE_JS_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0';

  var STRINGS = {
    fr: {
      title: 'Connexion ou création de compte',
      intro: 'Recevez un code de connexion à 6 chiffres par e-mail. Aucun mot de passe à retenir. Si vous n’avez pas encore de compte Z Fashion, il est créé à votre première connexion.',
      email: 'E-mail', emailPlaceholder: 'nom@exemple.fr', sendCode: 'Recevoir le code',
      code: 'Code reçu par e-mail', verify: 'Se connecter', changeEmail: 'Utiliser un autre e-mail',
      codeSent: 'Un code vient d’être envoyé à {email}. Il est valable quelques minutes.',
      sending: 'Envoi…', checking: 'Vérification…',
      consentBefore: 'En continuant, vous acceptez les ', terms: 'conditions d’utilisation',
      consentMiddle: ' et la ', privacy: 'politique de confidentialité', consentAfter: '.',
      invalidEmail: 'Saisissez une adresse e-mail valide.', invalidCode: 'Saisissez le code reçu (6 chiffres).',
      wrongCode: 'Code incorrect ou expiré. Réessayez ou demandez un nouveau code.',
      rateLimited: 'Trop de demandes. Patientez quelques minutes avant de réessayer.',
      unavailable: 'Connexion temporairement indisponible. Réessayez plus tard.',
      accountUnavailable: 'Impossible de préparer votre compte Z Fashion. Réessayez plus tard.',
      signedInTitle: 'Vous êtes connecté', signedInAs: 'Connecté :', myAccount: 'Mon compte', signOut: 'Se déconnecter',
      demoNote: 'Les commandes, adresses et favoris affichés ici restent des exemples jusqu’à l’ouverture des ventes.',
      drawerSignIn: 'Se connecter ou créer un compte',
    },
    en: {
      title: 'Sign in or create an account',
      intro: 'Get a 6-digit sign-in code by e-mail. No password to remember. If you do not have a Z Fashion account yet, it is created the first time you sign in.',
      email: 'E-mail', emailPlaceholder: 'name@example.com', sendCode: 'Send code',
      code: 'Code received by e-mail', verify: 'Sign in', changeEmail: 'Use another e-mail',
      codeSent: 'A code has just been sent to {email}. It is valid for a few minutes.',
      sending: 'Sending…', checking: 'Checking…',
      consentBefore: 'By continuing, you accept the ', terms: 'terms of use',
      consentMiddle: ' and the ', privacy: 'privacy policy', consentAfter: '.',
      invalidEmail: 'Enter a valid e-mail address.', invalidCode: 'Enter the code you received (6 digits).',
      wrongCode: 'Incorrect or expired code. Try again or request a new code.',
      rateLimited: 'Too many requests. Wait a few minutes before trying again.',
      unavailable: 'Sign-in is temporarily unavailable. Try again later.',
      accountUnavailable: 'We could not prepare your Z Fashion account. Try again later.',
      signedInTitle: 'You are signed in', signedInAs: 'Signed in:', myAccount: 'My account', signOut: 'Sign out',
      demoNote: 'Orders, addresses and favourites shown here are examples until sales open.',
      drawerSignIn: 'Sign in or create an account',
    },
  };

  function lang() { return (document.documentElement.dataset.locale || 'fr') === 'fr' ? 'fr' : 'en'; }
  function t(key, vars) {
    var s = STRINGS[lang()][key];
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  /** Only same-site paths are accepted as a post-login destination. */
  function safeNext(raw) {
    if (typeof raw !== 'string' || raw.charAt(0) !== '/' || raw.charAt(1) === '/' || raw.indexOf('\\') !== -1) return '/compte';
    return raw;
  }

  // ---------- Supabase

  var clientPromise = null;
  function loadSupabaseJs() {
    if (window.supabase && typeof window.supabase.createClient === 'function') return Promise.resolve(window.supabase);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SUPABASE_JS_CDN; s.async = true;
      s.onload = function () { window.supabase ? resolve(window.supabase) : reject(new Error('supabase-js missing')); };
      s.onerror = function () { reject(new Error('supabase-js failed to load')); };
      document.head.appendChild(s);
    });
  }
  function client() {
    if (!clientPromise) {
      clientPromise = loadSupabaseJs().then(function (lib) {
        return lib.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'zfashion-customer-auth' },
        });
      });
    }
    return clientPromise;
  }
  function getSession() {
    return client().then(function (sb) { return sb.auth.getSession(); })
      .then(function (r) { return (r && r.data && r.data.session) || null; });
  }
  function signOut() {
    return client().then(function (sb) { return sb.auth.signOut(); }).catch(function () {})
      .then(function () { location.assign('/'); });
  }

  // ---------- styles (small, reuses the site's own classes for the rest)

  var style = el('style');
  style.textContent = [
    'html.zf-customer-checking #pageContent{visibility:hidden}',
    '.zf-customer-msg{margin:0 0 14px;padding:10px 12px;border-radius:8px;background:rgba(0,0,0,.05);font-size:14px}',
    '.zf-customer-msg.err{background:#fbeaea;color:#8a1c1c}',
    '.zf-customer-msg:empty{display:none}',
    '.zf-customer-consent{font-size:12px;opacity:.75;margin-top:12px}',
    '.zf-customer-consent a{text-decoration:underline}',
    '.zf-customer-link{background:none;border:0;padding:8px 0 0;text-decoration:underline;cursor:pointer;font:inherit;color:inherit}',
    '.zf-customer-session{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding:12px 16px;margin:0 0 20px;border:1px solid rgba(0,0,0,.12);border-radius:10px}',
    '.zf-customer-session p{margin:0;font-size:14px}',
    '.zf-customer-session small{display:block;opacity:.7;margin-top:2px}',
    '.zf-customer-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}',
  ].join('\n');
  document.head.appendChild(style);

  // ---------- /connexion

  var page = document.getElementById('pageContent');
  var pendingEmail = '';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var view = 'email'; // email | code | signedIn
  var signedInEmail = '';
  var lastMsg = { text: '', err: false };

  function renderLogin() {
    var root = el('div', { class: 'preview-auth', id: 'zfCustomerAuth' });
    var panel = el('section', { class: 'preview-auth-panel' });
    root.appendChild(panel);

    if (view === 'signedIn') {
      panel.append(el('h2', null, t('signedInTitle')), el('p', null, t('signedInAs') + ' ' + signedInEmail));
      var actions = el('div', { class: 'zf-customer-actions' });
      actions.appendChild(el('a', { class: 'route-button', href: '/compte' }, t('myAccount')));
      var out = el('button', { class: 'route-button secondary', type: 'button' }, t('signOut'));
      out.addEventListener('click', signOut);
      actions.appendChild(out);
      panel.appendChild(actions);
      return root;
    }

    panel.append(el('h2', null, t('title')), el('p', null, t('intro')));
    var msg = el('div', { class: 'zf-customer-msg' + (lastMsg.err ? ' err' : ''), role: 'status', 'aria-live': 'polite' }, lastMsg.text);
    panel.appendChild(msg);

    var form = el('form', { class: 'preview-form', novalidate: '' });
    if (view === 'email') {
      var label = el('label', null, t('email'));
      var input = el('input', { type: 'email', id: 'zfCustomerEmail', autocomplete: 'email', inputmode: 'email', required: '', placeholder: t('emailPlaceholder') });
      input.value = pendingEmail;
      label.appendChild(input);
      var send = el('button', { class: 'route-button', type: 'submit' }, t('sendCode'));
      form.append(label, send);
      form.addEventListener('submit', function (e) { e.preventDefault(); sendCode(input.value, send); });
    } else {
      var clabel = el('label', null, t('code'));
      var code = el('input', { type: 'text', id: 'zfCustomerCode', autocomplete: 'one-time-code', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '10', required: '' });
      clabel.appendChild(code);
      var verify = el('button', { class: 'route-button', type: 'submit' }, t('verify'));
      var change = el('button', { class: 'zf-customer-link', type: 'button' }, t('changeEmail'));
      change.addEventListener('click', function () { view = 'email'; setMsg('', false); });
      form.append(clabel, verify, change);
      form.addEventListener('submit', function (e) { e.preventDefault(); verifyCode(code.value, verify); });
    }
    panel.appendChild(form);

    var consent = el('p', { class: 'zf-customer-consent' }, t('consentBefore'));
    consent.appendChild(el('a', { href: '/conditions-utilisation' }, t('terms')));
    consent.appendChild(document.createTextNode(t('consentMiddle')));
    consent.appendChild(el('a', { href: '/confidentialite' }, t('privacy')));
    consent.appendChild(document.createTextNode(t('consentAfter')));
    panel.appendChild(consent);
    return root;
  }

  function mountLogin(focus) {
    page.replaceChildren(renderLogin());
    if (focus) {
      var f = document.getElementById(view === 'code' ? 'zfCustomerCode' : 'zfCustomerEmail');
      if (f) f.focus();
    }
  }
  function setMsg(text, err) { lastMsg = { text: text || '', err: !!err }; mountLogin(true); }

  function sendCode(raw, button) {
    var email = String(raw || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return setMsg(t('invalidEmail'), true);
    pendingEmail = email;
    button.disabled = true; button.textContent = t('sending');
    client().then(function (sb) {
      return sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } });
    }).then(function (r) {
      var err = r && r.error;
      if (err && (err.status === 429 || /rate limit/i.test(err.message || ''))) return setMsg(t('rateLimited'), true);
      if (err) return setMsg(t('unavailable'), true);
      view = 'code';
      setMsg(t('codeSent', { email: email }), false);
    }).catch(function () { setMsg(t('unavailable'), true); });
  }

  function verifyCode(raw, button) {
    var token = String(raw || '').replace(/\s+/g, '');
    if (!/^[0-9]{6,10}$/.test(token)) return setMsg(t('invalidCode'), true);
    button.disabled = true; button.textContent = t('checking');
    var sb;
    client().then(function (c) {
      sb = c;
      return sb.auth.verifyOtp({ email: pendingEmail, token: token, type: 'email' });
    }).then(function (r) {
      if (r.error || !r.data || !r.data.session) return setMsg(t('wrongCode'), true);
      return sb.rpc('zfashion_ensure_client').then(function (res) {
        if (res.error) {
          return sb.auth.signOut().then(function () { view = 'email'; setMsg(t('accountUnavailable'), true); });
        }
        var next = safeNext(new URLSearchParams(location.search).get('next'));
        location.assign(next);
      });
    }).catch(function () { setMsg(t('unavailable'), true); });
  }

  // ---------- /compte/*

  function sessionStrip() {
    var strip = el('div', { class: 'zf-customer-session', id: 'zfCustomerSession' });
    var text = el('p', null, t('signedInAs') + ' ' + signedInEmail);
    text.appendChild(el('small', null, t('demoNote')));
    var out = el('button', { class: 'route-button secondary', type: 'button' }, t('signOut'));
    out.addEventListener('click', signOut);
    strip.append(text, out);
    return strip;
  }

  // ---------- home page drawer

  function patchHomeDrawer(session) {
    var drawer = document.getElementById('accountDrawer');
    if (!drawer) return;
    var button = drawer.querySelector('[data-i18n="signinPreview"]');
    var note = drawer.querySelector('[data-i18n="accountBoundary"]');
    if (!button) return;
    var link = el('a', { class: button.className, href: session ? '/compte' : '/connexion', id: 'zfCustomerDrawerLink' });
    link.textContent = session ? t('myAccount') : t('drawerSignIn');
    button.replaceWith(link);
    if (note) note.remove();
    document.getElementById('localeSelect') && document.getElementById('localeSelect').addEventListener('change', function () {
      queueMicrotask(function () { link.textContent = session ? t('myAccount') : t('drawerSignIn'); });
    });
  }

  // ---------- start

  var path = location.pathname.replace(/\/+$/, '') || '/';
  var isLogin = path === '/connexion';
  var isAccount = path === '/compte' || path.indexOf('/compte/') === 0;

  if (isAccount) document.documentElement.classList.add('zf-customer-checking');

  // Other layers re-render #pageContent (e.g. on language change):
  // put this file's block back whenever it disappears.
  function keepMounted() {
    if (!page) return;
    new MutationObserver(function () {
      if (isLogin && !document.getElementById('zfCustomerAuth')) mountLogin(false);
      if (isAccount && signedInEmail && !document.getElementById('zfCustomerSession')) page.prepend(sessionStrip());
    }).observe(page, { childList: true });
    var select = document.getElementById('localeSelect');
    if (select) select.addEventListener('change', function () {
      // after the other layers have applied the new language
      setTimeout(function () {
        if (isLogin) mountLogin(false);
        var strip = document.getElementById('zfCustomerSession');
        if (strip) strip.replaceWith(sessionStrip());
      }, 0);
    });
  }

  getSession().then(function (session) {
    if (isAccount) {
      if (!session) {
        location.replace('/connexion?next=' + encodeURIComponent(location.pathname));
        return;
      }
      signedInEmail = session.user && session.user.email || '';
      page.prepend(sessionStrip());
      document.documentElement.classList.remove('zf-customer-checking');
      keepMounted();
    } else if (isLogin) {
      if (session) { view = 'signedIn'; signedInEmail = session.user && session.user.email || ''; }
      mountLogin(!session);
      keepMounted();
    } else {
      patchHomeDrawer(session);
    }
  }).catch(function () {
    if (isAccount) { location.replace('/connexion?next=' + encodeURIComponent(location.pathname)); return; }
    if (isLogin) { setMsg(t('unavailable'), true); keepMounted(); }
  });

  window.ZFashionCustomerAuth = Object.freeze({ getSession: getSession, signOut: signOut, safeNext: safeNext });
})();
