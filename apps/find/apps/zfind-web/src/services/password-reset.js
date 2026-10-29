/* ============================================================
   Z FIND — services/password-reset.js
   ============================================================
   « Mot de passe oublié » for the Partner and Admin login screens
   (shared, never copied — both builds read this file).

   1. requestReset(email): Supabase sends the recovery e-mail; the link
      comes back to the same app (origin + '/?reinitialiser=1').
   2. The link lands with `type=recovery` in the URL hash. The hash is
      captured when this file loads, before the SDK reads and clears it,
      so the app can show « Nouveau mot de passe » instead of entering
      the dashboard straight away.
   3. updatePassword(password): sets the new password on that session.

   The answer to a reset request never says whether the address has an
   account (same message either way).
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.passwordReset = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const MIN_LENGTH = 8;
const initialHash = (typeof window !== 'undefined' && window.location && window.location.hash) || '';
const initialSearch = (typeof window !== 'undefined' && window.location && window.location.search) || '';

function hashParams(hash) {
  const out = {};
  String(hash || '').replace(/^#/, '').split('&').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' ')); } catch (_) { /* ignore */ }
    }
  });
  return out;
}

/** 'recovery' (valid link), 'expired' (link already used or too old) or null. */
function recoveryState(hash) {
  const p = hashParams(hash === undefined ? initialHash : hash);
  if (p.type === 'recovery' && p.access_token) return 'recovery';
  if (p.error_code === 'otp_expired' || (p.error && p.error_description)) return 'expired';
  return null;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

/** null when acceptable, otherwise a French message. */
function passwordProblem(password, confirm) {
  const pw = String(password || '');
  if (pw.length < MIN_LENGTH) return `Choisissez un mot de passe d’au moins ${MIN_LENGTH} caractères.`;
  if (confirm !== undefined && pw !== String(confirm || '')) return 'Les deux mots de passe ne sont pas identiques.';
  return null;
}

function redirectUrl() {
  return window.location.origin + '/?reinitialiser=1';
}

async function requestReset(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!validEmail(clean)) return { ok: false, message: 'Saisissez une adresse e-mail valide.' };
  const client = supabaseClientModule.getSupabaseClient();
  try {
    const { error } = await client.auth.resetPasswordForEmail(clean, { redirectTo: redirectUrl() });
    if (error && /rate|too many|seconds/i.test(error.message || '')) {
      return { ok: false, message: 'Un e-mail vient déjà d’être envoyé. Patientez une minute avant de recommencer.' };
    }
  } catch (_) {
    return { ok: false, message: 'Envoi impossible pour le moment. Réessayez dans un instant.' };
  }
  // Same answer whether or not the address has an account.
  return { ok: true, message: 'Si un compte existe pour cette adresse, vous allez recevoir un e-mail avec un lien pour choisir un nouveau mot de passe. Pensez à regarder dans les indésirables.' };
}

async function updatePassword(password, confirm) {
  const problem = passwordProblem(password, confirm);
  if (problem) return { ok: false, message: problem };
  const client = supabaseClientModule.getSupabaseClient();
  try {
    const { data: s } = await client.auth.getSession();
    if (!s || !s.session) return { ok: false, message: 'Ce lien a expiré. Demandez un nouveau lien depuis « Mot de passe oublié ».' };
    const { error } = await client.auth.updateUser({ password: String(password) });
    if (error) {
      const msg = String(error.message || '');
      if (/pwned|leaked|compromised|breach/i.test(msg)) return { ok: false, message: 'Ce mot de passe figure dans des fuites de données connues. Choisissez-en un autre.' };
      if (/weak|short|characters/i.test(msg)) return { ok: false, message: 'Ce mot de passe est trop faible. Choisissez-en un plus long.' };
      if (/different from the old|same/i.test(msg)) return { ok: false, message: 'Choisissez un mot de passe différent de l’ancien.' };
      return { ok: false, message: 'Modification impossible. Demandez un nouveau lien et réessayez.' };
    }
  } catch (_) {
    return { ok: false, message: 'Modification impossible pour le moment. Réessayez dans un instant.' };
  }
  return { ok: true, message: 'Votre mot de passe est modifié.' };
}

/** Removes the tokens (hash) and ?reinitialiser=1 from the address bar. */
function clearHash() {
  if (typeof history !== 'undefined' && history.replaceState) {
    const search = window.location.search.replace(/[?&]reinitialiser=1/, '').replace(/^&/, '?');
    history.replaceState(null, '', window.location.pathname + search);
  }
}

/* ---------- UI, styled with each app's own classes ----------
   opts: { card, classes: { field, button, error, note, link, title }, linkAfter, onPasswordSet }
   Returns 'recovery' (new-password form shown: do not enter the app yet),
   'expired' or null. */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function mount(opts) {
  const card = opts.card;
  if (!card) return null;
  const c = Object.assign({ field: '', button: '', error: '', note: '', link: '', title: '' }, opts.classes || {});
  let panel = null;
  let hidden = [];
  const typedEmail = () => { const el = card.querySelector('input[type="email"]'); return el ? el.value : ''; };

  // The login form stays in place (listeners, typed values, team invitation box):
  // it is only hidden while a « Mot de passe oublié » panel is shown.
  function openPanel(html) {
    closePanel();
    hidden = Array.from(card.children).filter(el => el.style.display !== 'none');
    hidden.forEach(el => { el.style.display = 'none'; });
    panel = document.createElement('div');
    panel.className = 'pr-panel';
    panel.innerHTML = html;
    card.appendChild(panel);
    return panel;
  }
  function closePanel() {
    if (panel) { panel.remove(); panel = null; }
    hidden.forEach(el => { el.style.display = ''; });
    hidden = [];
  }

  function addForgotLink() {
    const pwInput = card.querySelector('input[type="password"]');
    if (!pwInput || card.querySelector('[data-pr-forgot]')) return;
    const p = document.createElement('p');
    p.className = 'pr-forgot';
    p.innerHTML = `<a href="#" data-pr-forgot="1" class="${esc(c.link)}">Mot de passe oublié ?</a>`;
    p.querySelector('a').addEventListener('click', ev => { ev.preventDefault(); showRequest(typedEmail()); });
    const after = (opts.linkAfter && card.querySelector(opts.linkAfter)) || pwInput.closest('.' + (c.field || 'none')) || pwInput;
    after.insertAdjacentElement('afterend', p);
  }

  function showRequest(email, notice) {
    const el = openPanel(`
      <div class="pr-title ${esc(c.title)}">Mot de passe oublié</div>
      <p class="pr-note ${esc(c.note)}">Saisissez l’e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
      <div class="${esc(c.field)}"><label for="pr-email">E-mail</label><input type="email" id="pr-email" autocomplete="username" value="${esc(email)}" placeholder="E-mail"></div>
      <button type="button" class="${esc(c.button)}" id="pr-send">Recevoir le lien</button>
      <div class="${esc(c.error)}" id="pr-msg" role="status">${esc(notice || '')}</div>
      <p class="pr-forgot"><a href="#" id="pr-back" class="${esc(c.link)}">← Retour à la connexion</a></p>`);
    const btn = el.querySelector('#pr-send');
    const msg = el.querySelector('#pr-msg');
    el.querySelector('#pr-back').addEventListener('click', ev => { ev.preventDefault(); closePanel(); });
    btn.addEventListener('click', async () => {
      btn.disabled = true; msg.textContent = ''; msg.classList.remove('pr-ok');
      const r = await requestReset(el.querySelector('#pr-email').value);
      msg.textContent = r.message;
      msg.classList.toggle('pr-ok', r.ok);
      btn.disabled = false;
      if (r.ok) btn.textContent = 'Renvoyer le lien';
    });
  }

  function showNewPassword() {
    const el = openPanel(`
      <div class="pr-title ${esc(c.title)}">Nouveau mot de passe</div>
      <p class="pr-note ${esc(c.note)}">Choisissez votre nouveau mot de passe (au moins ${MIN_LENGTH} caractères).</p>
      <div class="${esc(c.field)}"><label for="pr-pw">Nouveau mot de passe</label><input type="password" id="pr-pw" autocomplete="new-password" placeholder="Nouveau mot de passe"></div>
      <div class="${esc(c.field)}"><label for="pr-pw2">Confirmez le mot de passe</label><input type="password" id="pr-pw2" autocomplete="new-password" placeholder="Confirmez le mot de passe"></div>
      <button type="button" class="${esc(c.button)}" id="pr-save">Enregistrer</button>
      <div class="${esc(c.error)}" id="pr-msg" role="status"></div>`);
    const btn = el.querySelector('#pr-save');
    const msg = el.querySelector('#pr-msg');
    btn.addEventListener('click', async () => {
      btn.disabled = true; msg.textContent = ''; msg.classList.remove('pr-ok');
      const r = await updatePassword(el.querySelector('#pr-pw').value, el.querySelector('#pr-pw2').value);
      msg.textContent = r.message;
      msg.classList.toggle('pr-ok', r.ok);
      if (!r.ok) { btn.disabled = false; return; }
      btn.textContent = 'Mot de passe enregistré';
      setTimeout(() => { closePanel(); if (opts.onPasswordSet) opts.onPasswordSet(); }, 900);
    });
  }

  addForgotLink();
  const state = recoveryState();
  if (state) {
    // Let the SDK read the tokens from the URL before they are removed.
    try { await supabaseClientModule.getSupabaseClient().auth.getSession(); } catch (_) { /* form still shown */ }
  }
  if (state === 'recovery') { clearHash(); showNewPassword(); return 'recovery'; }
  // Partner : seulement un lien de réinitialisation (ses liens de confirmation
  // d'inscription ont leur propre message). Admin (opts.anyExpiredLink) : tout
  // lien expiré, y compris ceux envoyés depuis le tableau Supabase.
  if (state === 'expired' && (/reinitialiser=1/.test(initialSearch) || opts.anyExpiredLink)) {
    clearHash();
    showRequest('', 'Ce lien a expiré ou a déjà servi. Demandez un nouveau lien ci-dessous.');
    return 'expired';
  }
  return null;
}

return { requestReset, updatePassword, recoveryState, passwordProblem, validEmail, mount, clearHash, MIN_LENGTH, _hashParams: hashParams };

});
