/* ============================================================
   Z FIND PARTNER — « Flux automatique »
   ============================================================
   The agency gives the HTTPS address of its software's export (Poliris /
   SeLoger CSV or ZIP, or a CSV with a header row): Z Find imports it every
   night with the same code as « Importer mes annonces » (site function
   /api/feed-sync, migration 20261010120000).
   - the password is sent once and never shown again (has_password only);
   - « Tester le flux »: the server downloads, reads and compares — no
     write — and the panel shows what would change;
   - « Dernière synchronisation » with counts, message and the report;
   - a flagged night (empty feed, or more than half of the listings gone):
     nothing was archived; the agency can confirm the new volume.
   FTP / SFTP are not offered: HTTPS (with optional basic auth) only.
   ============================================================ */

const pfeed = { feed: null, loaded: false, testing: false, saving: false };
const PFEED_STATUS = { ok: ['Réussie', 'tone-ok'], partial: ['Partielle — reprise la nuit suivante', 'tone-wait'], flagged: ['À vérifier', 'tone-bad'], error: ['En échec', 'tone-bad'] };
const PFEED_SITE = 'https://zfind.online';

function pfeedRpc(name, args) {
  const sb = window.ZFindServices.supabaseClient.getSupabaseClient();
  return Promise.resolve(sb.rpc(name, args || {})).then(r => r || { data: null, error: { message: 'Pas de réponse' } }, e => ({ data: null, error: { type: 'network_failure', message: e && e.message } }));
}
function pfeedNudge() { try { fetch(PFEED_SITE + '/api/feed-sync', { method: 'POST', mode: 'no-cors', keepalive: true }).catch(() => null); } catch (_) { /* nudge only */ } }
function pfeedDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d) + ' à ' + new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d);
}
function pfeedError(error, fallback) {
  const msg = String((error && error.message) || '');
  if (error && error.type === 'network_failure') return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
  if (/^(Adresse du flux|Identifiant|Mot de passe|Pays|Flux|Enregistrez|Un test|Aucune baisse|Accès)/.test(msg)) return msg;
  return fallback || 'L’opération a échoué. Réessayez dans un instant.';
}

async function showFeedView() {
  partnerShowView('view-feed');
  const host = document.getElementById('pfeed-root');
  if (host && !pfeed.loaded) host.innerHTML = '<div class="pimp-card"><p class="pimp-muted">Chargement…</p></div>';
  const res = await pfeedRpc('zfind_partner_get_feed');
  if (res.error) { if (host) host.innerHTML = '<div class="pimp-card"><p class="pimp-bad">Impossible de lire votre flux. Réessayez dans un instant.</p></div>'; return; }
  pfeed.feed = res.data || null;
  pfeed.loaded = true;
  renderPartnerFeed();
}

function renderPartnerFeed() {
  const host = document.getElementById('pfeed-root');
  if (!host) return;
  const f = pfeed.feed || {};
  const has = !!pfeed.feed;
  host.innerHTML = `
    ${has ? partnerFeedLastSyncHtml(f) : ''}
    <div class="pimp-card" id="pfeed-form">
      <div class="pimp-step"><span class="pimp-num">${has ? '✓' : '1'}</span><div>
        <h3>${has ? 'Réglages du flux' : 'Adresse de votre export'}</h3>
        <p class="pimp-sub">Demandez à votre logiciel (Hektor, Apimo, Netty, AC3, La Boîte Immo, Périclès…) l’adresse <strong>https</strong> de votre export « Poliris / SeLoger » (annonces.csv ou ZIP avec les photos), ou d’un CSV avec une ligne de titres. Z Find l’importe chaque nuit : nouvelles annonces en brouillon, prix et textes mis à jour. Rien n’est publié sans votre validation ni celle de Z Find. Les adresses FTP / SFTP ne sont pas prises en charge.</p>
      </div></div>
      <div class="pfeed-grid">
        <label class="pfeed-field wide"><span>Adresse du flux (https)</span><input type="url" id="pfeed-url" placeholder="https://export.mon-logiciel.fr/agence/annonces.zip" value="${escapeHtmlPartner(f.url || '')}" autocomplete="off" spellcheck="false"></label>
        <label class="pfeed-field"><span>Identifiant (facultatif)</span><input type="text" id="pfeed-user" value="${escapeHtmlPartner(f.auth_user || '')}" autocomplete="off"></label>
        <label class="pfeed-field"><span>Mot de passe ${f.has_password ? '(enregistré)' : '(facultatif)'}</span><input type="password" id="pfeed-password" placeholder="${f.has_password ? '•••••••• — laisser vide pour le garder' : ''}" autocomplete="new-password"></label>
        <label class="pfeed-field"><span>Pays des biens</span><select id="pfeed-country">${['FR', 'BE', 'LU'].map(c => `<option value="${c}"${(f.country || partnerCountry || 'FR') === c ? ' selected' : ''}>${{ FR: 'France', BE: 'Belgique', LU: 'Luxembourg' }[c]}</option>`).join('')}</select></label>
        <label class="pfeed-field"><span>Identifiant agence dans le logiciel (fichier de plusieurs agences)</span><input type="text" id="pfeed-agency-id" value="${escapeHtmlPartner(f.software_agency_id || '')}" placeholder="facultatif"></label>
      </div>
      <label class="pimp-check"><input type="checkbox" id="pfeed-full"${f.full_sync === false ? '' : ' checked'}> <span><strong>Import complet</strong> — retirer de Z Find mes annonces importées absentes du flux (archivées, jamais supprimées). Par sécurité, rien n’est retiré une nuit où le flux est vide ou a perdu plus de la moitié de ses annonces.</span></label>
      <label class="pimp-check"><input type="checkbox" id="pfeed-active"${f.active === false ? '' : ' checked'}${f.disabled_by_admin ? ' disabled' : ''}> <span><strong>Synchroniser chaque nuit</strong>${f.disabled_by_admin ? ' — <span class="pimp-bad">désactivé par l’équipe Z Find : écrivez à hello@zfind.online</span>' : ''}</span></label>
      ${f.has_password ? '<label class="pimp-check"><input type="checkbox" id="pfeed-clear"> <span>Supprimer le mot de passe enregistré</span></label>' : ''}
      <p class="pimp-error" id="pfeed-error"></p>
      <div class="pimp-actions">
        <button class="btn btn-primary" id="pfeed-save" onclick="partnerFeedSave()">${has ? 'Enregistrer' : 'Enregistrer le flux'}</button>
        ${has ? '<button class="btn" id="pfeed-test" onclick="partnerFeedTest()">Tester le flux</button>' : ''}
      </div>
      <div id="pfeed-test-result">${has && f.last_test ? partnerFeedTestHtml(f.last_test) : ''}</div>
    </div>`;
}

function partnerFeedLastSyncHtml(f) {
  if (!f.last_run_at) {
    return `<div class="pimp-card pfeed-last" id="pfeed-last"><p class="pfeed-last-line"><strong>Dernière synchronisation :</strong> pas encore — la première a lieu cette nuit${f.active === false ? ' (flux en pause)' : ''}.</p></div>`;
  }
  const [label, tone] = PFEED_STATUS[f.last_status] || [f.last_status || '—', 'tone-draft'];
  const c = f.last_counts || {};
  const n = v => new Intl.NumberFormat('fr-FR').format(Number(v) || 0);
  return `<div class="pimp-card pfeed-last${f.last_status === 'flagged' || f.last_status === 'error' ? ' alert' : ''}" id="pfeed-last">
    <p class="pfeed-last-line"><strong>Dernière synchronisation :</strong> ${escapeHtmlPartner(pfeedDate(f.last_run_at))} <span class="status-badge ${tone}">${escapeHtmlPartner(label)}</span></p>
    ${f.last_status !== 'error' ? `<div class="pimp-counts small">
      <div class="pimp-count"><strong>${n(c.file)}</strong><span>annonces dans le flux</span></div>
      <div class="pimp-count${c.created ? ' good' : ''}"><strong>${n(c.created)}</strong><span>créées</span></div>
      <div class="pimp-count${c.updated ? ' info' : ''}"><strong>${n(c.updated)}</strong><span>mises à jour</span></div>
      <div class="pimp-count${c.archived ? ' warn' : ''}"><strong>${n(c.archived)}</strong><span>retirées</span></div>
      <div class="pimp-count${c.errors ? ' bad' : ''}"><strong>${n(c.errors)}</strong><span>en erreur</span></div>
    </div>` : ''}
    <p class="pfeed-message">${escapeHtmlPartner(f.last_message || '')}</p>
    ${f.flagged_listing_count != null ? `<div class="pimp-note warn" id="pfeed-flag"><p>Par précaution, aucune annonce n’a été retirée. Si votre portefeuille compte bien ${n(f.flagged_listing_count)} annonce${f.flagged_listing_count > 1 ? 's' : ''} (ventes, mandats terminés), confirmez-le : les annonces absentes seront retirées à la prochaine synchronisation. Sinon, vérifiez l’export de votre logiciel.</p>
      <button class="btn" id="pfeed-accept" onclick="partnerFeedAcceptVolume()">Confirmer ${n(f.flagged_listing_count)} annonce${f.flagged_listing_count > 1 ? 's' : ''}</button></div>` : ''}
    ${(f.last_report || []).length ? '<div class="pimp-actions"><button class="btn" id="pfeed-report" onclick="partnerFeedReport()">Télécharger le rapport (CSV)</button></div>' : ''}
  </div>`;
}

function partnerFeedTestHtml(t) {
  const [label, tone] = t.status === 'error' ? ['Échec', 'tone-bad'] : t.status === 'flagged' ? ['À vérifier', 'tone-bad'] : ['Flux lisible', 'tone-ok'];
  const c = t.counts || {};
  const n = v => new Intl.NumberFormat('fr-FR').format(Number(v) || 0);
  return `<div class="pfeed-test" id="pfeed-test-box">
    <p><strong>Test du ${escapeHtmlPartner(pfeedDate(t.at))}</strong> <span class="status-badge ${tone}">${label}</span>${t.format ? ` <span class="pimp-muted">· format ${t.format === 'poliris' ? 'Poliris / SeLoger' : 'CSV'}${t.version ? ' ' + escapeHtmlPartner(t.version) : ''}</span>` : ''}</p>
    ${t.status !== 'error' ? `<div class="pimp-counts small">
      <div class="pimp-count${c.create ? ' good' : ''}"><strong>${n(c.create)}</strong><span>à créer</span></div>
      <div class="pimp-count${c.update ? ' info' : ''}"><strong>${n(c.update)}</strong><span>à mettre à jour</span></div>
      <div class="pimp-count${c.archive ? ' warn' : ''}"><strong>${n(c.archive)}</strong><span>à retirer</span></div>
      <div class="pimp-count${c.error ? ' bad' : ''}"><strong>${n(c.error)}</strong><span>en erreur</span></div>
      <div class="pimp-count"><strong>${n(c.unchanged)}</strong><span>inchangées</span></div>
    </div>` : ''}
    <p class="pfeed-message">${escapeHtmlPartner(t.message || '')}</p>
    <p class="pimp-muted">Un test ne modifie aucune annonce.</p>
  </div>`;
}

async function partnerFeedSave() {
  if (pfeed.saving) return;
  const err = document.getElementById('pfeed-error');
  err.textContent = '';
  const url = document.getElementById('pfeed-url').value.trim();
  if (!/^https:\/\/[^\s]+$/i.test(url)) { err.textContent = 'Indiquez l’adresse complète du flux, commençant par https://'; return; }
  const clear = document.getElementById('pfeed-clear');
  pfeed.saving = true;
  const btn = document.getElementById('pfeed-save');
  btn.disabled = true;
  const res = await pfeedRpc('zfind_partner_save_feed', {
    p_url: url,
    p_auth_user: document.getElementById('pfeed-user').value.trim() || null,
    p_password: document.getElementById('pfeed-password').value || null,
    p_full_sync: document.getElementById('pfeed-full').checked,
    p_active: document.getElementById('pfeed-active').checked,
    p_country: document.getElementById('pfeed-country').value,
    p_software_agency_id: document.getElementById('pfeed-agency-id').value.trim() || null,
    p_clear_password: !!(clear && clear.checked)
  });
  pfeed.saving = false;
  btn.disabled = false;
  if (res.error) { err.textContent = pfeedError(res.error, 'Enregistrement impossible. Réessayez dans un instant.'); return; }
  const first = !pfeed.feed;
  pfeed.feed = res.data;
  renderPartnerFeed();
  showStatus('success', first ? 'Flux enregistré. Testez-le pour vérifier ce qui sera importé.' : 'Réglages enregistrés.');
}

async function partnerFeedTest() {
  if (pfeed.testing) return;
  const box = document.getElementById('pfeed-test-result');
  const err = document.getElementById('pfeed-error');
  err.textContent = '';
  const res = await pfeedRpc('zfind_partner_request_feed_test');
  if (res.error) { err.textContent = pfeedError(res.error, 'Test impossible pour le moment.'); return; }
  const requestedAt = res.data && res.data.test_requested_at;
  pfeed.testing = true;
  const btn = document.getElementById('pfeed-test');
  if (btn) { btn.disabled = true; btn.textContent = 'Test en cours…'; }
  box.innerHTML = '<p class="pimp-note" id="pfeed-testing">Téléchargement et lecture du flux… (jusqu’à une minute)</p>';
  pfeedNudge();
  let done = null;
  for (let i = 0; i < 30 && !done; i++) {
    await new Promise(r => setTimeout(r, i < 3 ? 1500 : 2500));
    const g = await pfeedRpc('zfind_partner_get_feed');
    if (!g.error && g.data && g.data.last_test && (!requestedAt || g.data.last_test_at >= requestedAt) && !g.data.test_requested_at) done = g.data;
    if (i === 8) pfeedNudge();
  }
  pfeed.testing = false;
  if (!done) {
    box.innerHTML = '<p class="pimp-note warn">Le test n’a pas encore répondu. Revenez sur cette page dans quelques minutes : le résultat s’affichera ici.</p>';
    if (btn) { btn.disabled = false; btn.textContent = 'Tester le flux'; }
    return;
  }
  pfeed.feed = done;
  renderPartnerFeed();
}

async function partnerFeedAcceptVolume() {
  const res = await pfeedRpc('zfind_partner_accept_feed_volume');
  if (res.error) { showStatus('error', pfeedError(res.error)); return; }
  pfeed.feed = res.data;
  renderPartnerFeed();
  showStatus('success', 'Nombre d’annonces confirmé : la prochaine synchronisation retirera les annonces absentes.');
}

function partnerFeedReport() {
  const f = pfeed.feed;
  if (!f) return;
  const results = (f.last_report || []).map(r => ({ line: r.line, reference: r.reference, kind: r.kind, status: r.status === 'pending' ? 'error' : r.status, message: r.message, compliance: r.compliance, listingId: r.listingId }));
  partnerImportDownload(`rapport-flux-${String(f.last_run_at || '').slice(0, 10) || 'zfind'}.csv`, pimpSvc().resultsCsv(results));
}
