/* ============================================================
   Z FIND PARTNER — « Ma page agence »
   ============================================================
   La fiche publique de l'agence (zfind.online/fr/agence/{slug}) :
   logo, présentation, coordonnées, horaires. Lecture et écriture par
   les fonctions zfind_partner_get_profile / zfind_partner_save_profile ;
   le logo est déposé dans le dossier de l'agence (partners/{id}/) puis
   enregistré par zfind_partner_set_logo (migration 20261029160000).
   ============================================================ */

const pprof = { data: null, saving: false, logoUrl: null };
const PPROF_SITE = 'https://zfind.online';
const PPROF_MAX_LOGO = 2 * 1024 * 1024;
const PPROF_LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

function pprofRpc(name, args) {
  const sb = window.ZFindServices.supabaseClient.getSupabaseClient();
  return Promise.resolve(sb.rpc(name, args || {})).then(r => r || { data: null, error: { message: 'Pas de réponse' } }, e => ({ data: null, error: { type: 'network_failure', message: e && e.message } }));
}
function pprofVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

async function showProfileView() {
  partnerShowView('view-profile');
  const host = document.getElementById('pprof-root');
  if (host) host.innerHTML = '<div class="pimp-card"><p class="pimp-muted">Chargement…</p></div>';
  const res = await pprofRpc('zfind_partner_get_profile');
  if (res.error) { if (host) host.innerHTML = '<div class="pimp-card"><p class="pimp-bad">Impossible de lire votre fiche. Réessayez dans un instant.</p></div>'; return; }
  pprof.data = res.data || {};
  pprof.logoUrl = pprof.data.logo_storage_path ? await window.ZFindServices.supabaseClient.resolveMediaUrl(pprof.data.logo_storage_path) : null;
  renderPartnerProfile();
}

function pprofField(id, label, value, opts) {
  const o = opts || {};
  const attrs = `id="${id}" ${o.type ? `type="${o.type}"` : 'type="text"'} value="${escapeHtmlPartner(value || '')}"${o.placeholder ? ` placeholder="${escapeHtmlPartner(o.placeholder)}"` : ''}${o.autocomplete ? ` autocomplete="${o.autocomplete}"` : ''}`;
  return `<label class="pfeed-field${o.wide ? ' wide' : ''}"><span>${label}</span><input ${attrs}></label>`;
}

function renderPartnerProfile(message) {
  const host = document.getElementById('pprof-root');
  const d = pprof.data;
  if (!host || !d) return;
  const pageUrl = `${PPROF_SITE}/fr/agence/${d.slug}`;
  const active = d.status === 'active';
  host.innerHTML = `
    ${message ? `<div class="pimp-note"><p>${escapeHtmlPartner(message)}</p></div>` : ''}
    <div class="pimp-card">
      <div class="pimp-step"><span class="pimp-num">1</span><div>
        <h3>Votre page sur Z Find</h3>
        <p class="pimp-sub">${d.saved && active ? `Votre page est en ligne : <a href="${escapeHtmlPartner(pageUrl)}" target="_blank" rel="noopener">${escapeHtmlPartner(pageUrl.replace('https://', ''))}</a>. Elle présente votre agence et toutes vos annonces publiées ; chaque annonce y renvoie.` : d.saved ? 'Votre page sera en ligne dès que votre compte agence sera activé par l’équipe Z Find.' : `Remplissez votre fiche puis enregistrez : votre page sera publiée à l’adresse ${escapeHtmlPartner(pageUrl.replace('https://', ''))}.`}</p>
      </div></div>
      <div class="pprof-logo">
        <div class="pprof-logo-box">${pprof.logoUrl ? `<img src="${escapeHtmlPartner(pprof.logoUrl)}" alt="Logo">` : '<span>Logo</span>'}</div>
        <div>
          <label class="pimp-file-btn"><input type="file" id="pprof-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange="partnerProfileLogo(this)"><b>${pprof.logoUrl ? 'Changer le logo' : 'Ajouter votre logo'}</b><em>PNG, JPEG, WebP ou SVG, 2 Mo au maximum</em></label>
          ${pprof.logoUrl ? '<button class="btn" style="margin-top:10px" onclick="partnerProfileRemoveLogo()">Retirer le logo</button>' : ''}
        </div>
      </div>
    </div>
    <div class="pimp-card">
      <div class="pimp-step"><span class="pimp-num">2</span><div>
        <h3>Présentation et coordonnées</h3>
        <p class="pimp-sub">Ce que les acheteurs et les vendeurs voient de votre agence. Une présentation d’au moins quelques phrases (80 caractères) rend votre page visible dans les moteurs de recherche.</p>
      </div></div>
      <label class="pfeed-field wide"><span>Présentation de l’agence</span><textarea id="pprof-description" rows="7" maxlength="3000" placeholder="Votre histoire, votre secteur, vos spécialités, ce qui vous distingue…">${escapeHtmlPartner(d.description || '')}</textarea></label>
      <p class="pimp-muted" id="pprof-count">${(d.description || '').length} / 3 000 caractères</p>
      <div class="pfeed-grid">
        ${pprofField('pprof-phone', 'Téléphone', d.phone, { type: 'tel', autocomplete: 'tel' })}
        ${pprofField('pprof-email', 'E-mail de contact', d.email, { type: 'email', autocomplete: 'email' })}
        ${pprofField('pprof-website', 'Site web', d.website, { placeholder: 'https://www.mon-agence.fr', autocomplete: 'url' })}
        <label class="pfeed-field"><span>Pays</span><select id="pprof-country">${['FR', 'BE', 'LU'].map(c => `<option value="${c}"${(d.country || 'FR') === c ? ' selected' : ''}>${{ FR: 'France', BE: 'Belgique', LU: 'Luxembourg' }[c]}</option>`).join('')}</select></label>
        ${pprofField('pprof-address', 'Adresse', d.address, { autocomplete: 'street-address', wide: true })}
        ${pprofField('pprof-postcode', 'Code postal', d.postcode, { autocomplete: 'postal-code' })}
        ${pprofField('pprof-city', 'Ville', d.city, { autocomplete: 'address-level2' })}
      </div>
      <label class="pfeed-field wide"><span>Horaires d’ouverture</span><textarea id="pprof-hours" rows="3" maxlength="500" placeholder="Du lundi au vendredi, 9 h – 12 h et 14 h – 19 h ; le samedi sur rendez-vous">${escapeHtmlPartner(d.opening_hours || '')}</textarea></label>
      <label class="pimp-check"><input type="checkbox" id="pprof-public"${d.public_page === false ? '' : ' checked'}> <span><strong>Page publique</strong> — décochez pour masquer temporairement votre page (vos annonces restent en ligne).</span></label>
      <p class="pimp-error" id="pprof-error"></p>
      <div class="pimp-actions">
        <button class="btn btn-primary" id="pprof-save" onclick="partnerProfileSave()">Enregistrer ma page</button>
        ${d.saved ? `<a class="btn" href="${escapeHtmlPartner(pageUrl)}" target="_blank" rel="noopener">Voir ma page</a>` : ''}
      </div>
    </div>`;
  const ta = document.getElementById('pprof-description');
  if (ta) ta.addEventListener('input', () => { const c = document.getElementById('pprof-count'); if (c) c.textContent = `${ta.value.length} / 3 000 caractères`; });
}

function pprofError(error) {
  const msg = String((error && error.message) || '');
  if (error && error.type === 'network_failure') return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
  if (/email/i.test(msg) && /check/i.test(msg)) return 'Cette adresse e-mail n’est pas valide.';
  if (/website/i.test(msg)) return 'L’adresse du site doit commencer par https:// et ne contenir aucun espace.';
  if (/description/i.test(msg)) return 'La présentation dépasse 3 000 caractères.';
  if (/check constraint/i.test(msg)) return 'Un champ est trop long ou mal rempli. Vérifiez vos informations.';
  if (/Accès réservé|Logo invalide/.test(msg)) return msg;
  return 'L’enregistrement a échoué. Réessayez dans un instant.';
}

async function partnerProfileSave() {
  if (pprof.saving) return;
  const err = document.getElementById('pprof-error');
  const btn = document.getElementById('pprof-save');
  const email = pprofVal('pprof-email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { if (err) err.textContent = 'Cette adresse e-mail n’est pas valide.'; return; }
  pprof.saving = true; if (btn) btn.disabled = true; if (err) err.textContent = '';
  const res = await pprofRpc('zfind_partner_save_profile', { p: {
    description: document.getElementById('pprof-description').value,
    phone: pprofVal('pprof-phone'), email, website: pprofVal('pprof-website'),
    address: pprofVal('pprof-address'), postcode: pprofVal('pprof-postcode'), city: pprofVal('pprof-city'),
    country: document.getElementById('pprof-country').value,
    opening_hours: document.getElementById('pprof-hours').value,
    public_page: document.getElementById('pprof-public').checked
  } });
  pprof.saving = false; if (btn) btn.disabled = false;
  if (res.error) { if (err) err.textContent = pprofError(res.error); return; }
  pprof.data = res.data || pprof.data;
  renderPartnerProfile('Votre page est enregistrée. Elle peut mettre jusqu’à une heure à apparaître à jour sur zfind.online.');
}

async function partnerProfileLogo(input) {
  const file = input.files && input.files[0];
  const err = document.getElementById('pprof-error');
  if (!file) return;
  const ext = PPROF_LOGO_TYPES[file.type];
  if (!ext) { if (err) err.textContent = 'Format non pris en charge : PNG, JPEG, WebP ou SVG.'; return; }
  if (file.size > PPROF_MAX_LOGO) { if (err) err.textContent = 'Le logo dépasse 2 Mo.'; return; }
  const sb = window.ZFindServices.supabaseClient.getSupabaseClient();
  const path = `partners/${pprof.data.partner_id}/logo-${Date.now()}.${ext}`;
  const up = await sb.storage.from('listing-media').upload(path, file, { contentType: file.type, upsert: false }).catch(e => ({ error: e }));
  if (up && up.error) { if (err) err.textContent = 'Le logo n’a pas pu être envoyé. Réessayez.'; return; }
  const previous = pprof.data.logo_storage_path;
  const res = await pprofRpc('zfind_partner_set_logo', { p_path: path });
  if (res.error) { if (err) err.textContent = pprofError(res.error); return; }
  if (previous && previous !== path) sb.storage.from('listing-media').remove([previous]).catch(() => null);
  pprof.data.logo_storage_path = path;
  pprof.logoUrl = await window.ZFindServices.supabaseClient.resolveMediaUrl(path);
  renderPartnerProfile('Logo enregistré.');
}

async function partnerProfileRemoveLogo() {
  const previous = pprof.data.logo_storage_path;
  const res = await pprofRpc('zfind_partner_set_logo', { p_path: null });
  if (res.error) { const err = document.getElementById('pprof-error'); if (err) err.textContent = pprofError(res.error); return; }
  if (previous) window.ZFindServices.supabaseClient.getSupabaseClient().storage.from('listing-media').remove([previous]).catch(() => null);
  pprof.data.logo_storage_path = null; pprof.logoUrl = null;
  renderPartnerProfile('Logo retiré.');
}
