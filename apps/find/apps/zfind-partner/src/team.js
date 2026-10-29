/* ============================================================
   Z FIND PARTNER — « Équipe » (plusieurs utilisateurs par agence)
   ============================================================
   - Le responsable (premier compte de l'agence) invite ses collègues
     par e-mail, annule une invitation, retire un membre.
   - L'invité ouvre partner.zfind.online/#invitation=<jeton> : il crée
     son mot de passe (ou se connecte) et rejoint l'agence ; le jeton
     est gardé dans l'onglet et dans le compte le temps de la
     confirmation de l'e-mail.
   Serveur : RPC zfind_partner_team / _invite / _revoke_invitation /
   _remove_member / _accept_invitation (migration 20261029190000) ;
   l'e-mail part par zfind.online/api/lead-notify.
   ============================================================ */

const pteam = { data: null, busy: false };
const PTEAM_KEY = 'zf-team-invite';
const PTEAM_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PTEAM_ERRORS = {
  invitation_invalid: 'Cette invitation n’est plus valable (expirée, annulée ou déjà utilisée). Demandez à votre agence de vous inviter de nouveau.',
  invitation_other_email: 'Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec l’adresse qui a reçu l’invitation.',
  invitation_admin_account: 'Ce compte est un compte d’administration Z Find : il ne peut pas rejoindre une agence.',
  invitation_other_agency: 'Ce compte fait déjà partie d’une autre agence sur Z Find. Utilisez une autre adresse e-mail ou écrivez-nous à hello@zfind.online.'
};

function pteamRpc(name, args) {
  const sb = window.ZFindServices.supabaseClient.getSupabaseClient();
  return Promise.resolve(sb.rpc(name, args || {})).then(r => r || { data: null, error: { message: 'Pas de réponse' } }, e => ({ data: null, error: { type: 'network_failure', message: e && e.message } }));
}
function pteamError(error, fallback) {
  const msg = String((error && error.message) || '');
  if (error && error.type === 'network_failure') return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
  if (PTEAM_ERRORS[msg]) return PTEAM_ERRORS[msg];
  if (/^(Seul|Cette personne|Adresse e-mail|Une agence|Trop d|Le responsable|Ce membre|Accès)/.test(msg)) return msg;
  return fallback || 'L’opération a échoué. Réessayez dans un instant.';
}
function pteamDate(iso) {
  return iso ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '';
}
function pteamToken() {
  try { const t = sessionStorage.getItem(PTEAM_KEY); return PTEAM_UUID.test(t || '') ? t : null; } catch (_) { return null; }
}
function pteamForget() { try { sessionStorage.removeItem(PTEAM_KEY); } catch (_) { /* nothing to forget */ } }
function pteamNudge() { try { fetch('https://zfind.online/api/lead-notify', { method: 'POST', mode: 'no-cors', keepalive: true }).catch(() => null); } catch (_) { /* the daily job sends it anyway */ } }

/* ---------- arrivée par le lien de l'e-mail ---------- */

/** Au démarrage : garde le jeton de #invitation=… et prépare l'écran de connexion. */
function pteamOnBoot() {
  const m = /invitation=([0-9a-f-]{36})/i.exec(window.location.hash || '');
  if (m && PTEAM_UUID.test(m[1])) {
    try { sessionStorage.setItem(PTEAM_KEY, m[1].toLowerCase()); } catch (_) { /* kept in the account metadata instead */ }
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  if (pteamToken()) pteamShowInvitationBox();
}

function pteamShowInvitationBox() {
  const card = document.querySelector('#view-login .login-form-card');
  if (!card || document.getElementById('team-invite-box')) return;
  const box = document.createElement('div');
  box.id = 'team-invite-box';
  box.className = 'team-invite-box';
  box.innerHTML = `<p><strong>Vous êtes invité(e) à rejoindre une agence sur Z Find.</strong> Première fois ? Créez votre accès avec l’adresse qui a reçu l’invitation. Vous avez déjà un compte ? Connectez-vous ci-dessous.</p>
    <div class="field"><label for="team-invite-email">E-mail</label><input type="email" id="team-invite-email" autocomplete="email"></div>
    <div class="field"><label for="team-invite-password">Choisissez un mot de passe (8 caractères au moins)</label><input type="password" id="team-invite-password" autocomplete="new-password"></div>
    <button class="btn-login" id="team-invite-btn" onclick="pteamCreateAccess()">Créer mon accès</button>
    <div class="login-error" id="team-invite-error"></div>`;
  card.insertBefore(box, card.querySelector('.field'));
}

async function pteamCreateAccess() {
  const token = pteamToken();
  const email = document.getElementById('team-invite-email').value.trim();
  const password = document.getElementById('team-invite-password').value;
  const err = document.getElementById('team-invite-error');
  const btn = document.getElementById('team-invite-btn');
  err.textContent = '';
  if (!token) { err.textContent = PTEAM_ERRORS.invitation_invalid; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Indiquez l’adresse e-mail qui a reçu l’invitation.'; return; }
  if (password.length < 8) { err.textContent = 'Le mot de passe doit faire au moins 8 caractères.'; return; }
  btn.disabled = true;
  try {
    const sb = window.ZFindServices.supabaseClient.getSupabaseClient();
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { zfind_team_invite: token }, emailRedirectTo: `${window.location.origin}/#invitation=${token}` }
    });
    if (error) { err.textContent = /registered|exists/i.test(error.message || '') ? 'Un compte existe déjà avec cette adresse : connectez-vous ci-dessous.' : 'La création de l’accès a échoué. Réessayez dans un instant.'; return; }
    if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      err.textContent = 'Un compte existe déjà avec cette adresse : connectez-vous ci-dessous.';
      return;
    }
    if (data && data.session) { await tryEnterDashboard(); return; }
    const box = document.getElementById('team-invite-box');
    if (box) box.innerHTML = '<p><strong>Confirmez votre adresse.</strong> Un e-mail de confirmation vient de vous être envoyé : ouvrez le lien, puis connectez-vous. Vous rejoindrez alors l’agence.</p>';
  } catch (_) {
    err.textContent = 'Connexion impossible. Vérifiez votre réseau et réessayez.';
  } finally {
    btn.disabled = false;
  }
}

/** Avant l'entrée dans l'espace : accepte l'invitation en attente (onglet ou compte). Renvoie un message d'erreur ou null. */
async function pteamAcceptPending() {
  let token = pteamToken();
  if (!token) {
    try {
      const r = await window.ZFindServices.auth.getSession();
      const meta = r && r.data && r.data.session && r.data.session.user && r.data.session.user.user_metadata;
      token = meta && PTEAM_UUID.test(meta.zfind_team_invite || '') ? meta.zfind_team_invite : null;
    } catch (_) { token = null; }
  }
  if (!token) return null;
  const res = await pteamRpc('zfind_partner_accept_invitation', { p_token: token });
  pteamForget();
  try { await window.ZFindServices.supabaseClient.getSupabaseClient().auth.updateUser({ data: { zfind_team_invite: null } }); } catch (_) { /* harmless if it stays */ }
  if (res.error) return pteamError(res.error, PTEAM_ERRORS.invitation_invalid);
  const box = document.getElementById('team-invite-box');
  if (box) box.remove();
  return null;
}

/* ---------- vue « Équipe » ---------- */

async function showTeamView() {
  partnerShowView('view-team');
  const host = document.getElementById('pteam-root');
  if (host) host.innerHTML = '<div class="pimp-card"><p class="pimp-muted">Chargement…</p></div>';
  const res = await pteamRpc('zfind_partner_team');
  if (res.error || !res.data) {
    if (host) host.innerHTML = '<div class="pimp-card"><p class="pimp-bad">Impossible de lire votre équipe. Réessayez dans un instant.</p></div>';
    return;
  }
  pteam.data = res.data;
  renderPartnerTeam();
}

function renderPartnerTeam() {
  const host = document.getElementById('pteam-root');
  const d = pteam.data;
  if (!host || !d) return;
  const members = d.members || [];
  const invites = d.invitations || [];
  host.innerHTML = `
    <div class="pimp-card">
      <h3 class="pstats-h">Membres (${members.length})</h3>
      <ul class="pteam-list">${members.map(m => `<li>
        <div><strong>${escapeHtmlPartner(m.email)}</strong>${m.is_me ? ' <span class="status-badge tone-ready">vous</span>' : ''}${m.is_owner ? ' <span class="status-badge tone-ok">responsable</span>' : ''}
          <div class="pimp-muted">Depuis le ${escapeHtmlPartner(pteamDate(m.joined_at))}${m.last_sign_in_at ? ` · dernière connexion le ${escapeHtmlPartner(pteamDate(m.last_sign_in_at))}` : ' · jamais connecté(e)'}</div></div>
        ${d.is_owner && !m.is_me && !m.is_owner ? `<button class="btn" onclick="partnerTeamRemove('${escapeHtmlPartner(m.user_id)}', '${escapeHtmlPartner(m.email).replace(/'/g, '&#39;')}')">Retirer</button>` : ''}
      </li>`).join('')}</ul>
      <p class="pimp-muted">Chaque membre a son propre accès : annonces, demandes, statistiques, Z Desk et Z Studio. Les notifications de demandes sont envoyées à tous les membres.</p>
    </div>
    ${d.is_owner ? `
    <div class="pimp-card">
      <h3 class="pstats-h">Inviter un collègue</h3>
      <div class="pteam-invite">
        <label class="pfeed-field"><span>E-mail professionnel</span><input type="email" id="pteam-email" placeholder="prenom.nom@agence.fr" autocomplete="off"></label>
        <button class="btn btn-primary" id="pteam-invite" onclick="partnerTeamInvite()">Envoyer l’invitation</button>
      </div>
      <p class="pimp-error" id="pteam-error"></p>
      ${invites.length ? `<h4 class="pteam-sub">Invitations en attente</h4><ul class="pteam-list">${invites.map(i => `<li>
        <div><strong>${escapeHtmlPartner(i.email)}</strong><div class="pimp-muted">${i.sent ? 'Envoyée' : 'En cours d’envoi'} le ${escapeHtmlPartner(pteamDate(i.created_at))} · valable jusqu’au ${escapeHtmlPartner(pteamDate(i.expires_at))}</div></div>
        <div class="pimp-actions" style="margin-top:0"><button class="btn" onclick="partnerTeamResend('${escapeHtmlPartner(i.email)}')">Renvoyer</button><button class="btn" onclick="partnerTeamRevoke('${escapeHtmlPartner(i.id)}')">Annuler</button></div>
      </li>`).join('')}</ul>` : ''}
    </div>` : '<div class="pimp-card"><p class="pimp-sub">Seul le responsable de l’agence (le premier compte créé) peut inviter ou retirer des membres.</p></div>'}`;
}

async function partnerTeamInvite(emailArg) {
  if (pteam.busy) return;
  const input = document.getElementById('pteam-email');
  const err = document.getElementById('pteam-error');
  const email = (emailArg || (input && input.value) || '').trim();
  if (err) err.textContent = '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { if (err) err.textContent = 'Indiquez une adresse e-mail valide.'; return; }
  pteam.busy = true;
  const res = await pteamRpc('zfind_partner_invite', { p_email: email });
  pteam.busy = false;
  if (res.error) { if (err) err.textContent = pteamError(res.error); return; }
  pteamNudge();
  showStatus('success', `Invitation envoyée à ${email}.`);
  await showTeamView();
}
function partnerTeamResend(email) { return partnerTeamInvite(email); }

async function partnerTeamRevoke(id) {
  const res = await pteamRpc('zfind_partner_revoke_invitation', { p_id: id });
  if (res.error) { showStatus('error', pteamError(res.error)); return; }
  await showTeamView();
}

async function partnerTeamRemove(userId, email) {
  if (!window.confirm(`Retirer ${email} de l’équipe ? Son compte n’aura plus accès à l’agence.`)) return;
  const res = await pteamRpc('zfind_partner_remove_member', { p_user_id: userId });
  if (res.error) { showStatus('error', pteamError(res.error)); return; }
  showStatus('success', `${email} ne fait plus partie de l’équipe.`);
  await showTeamView();
}
