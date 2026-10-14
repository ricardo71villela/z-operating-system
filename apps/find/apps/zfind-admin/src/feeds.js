/* ============================================================
   Z FIND ADMIN — « Flux automatiques des agences »
   ============================================================
   Every agency feed registered in the Partner panel (migration
   20261010120000): last nightly run, status, counts, failures. Z Find can
   « Lancer maintenant » (zfind_admin_request_feed_run, then the site's
   /api/feed-sync is nudged) and disable / re-enable a feed
   (zfind_admin_set_feed_active). The feed password is never shown.
   ============================================================ */

const FEED_STATUS_FR = { ok: ['Réussie', 'active'], partial: ['Partielle', 'review'], flagged: ['À vérifier', 'late'], error: ['En échec', 'late'] };
let feedsCache = [];

function feedsRpc(name, args) {
  const sb = window.ZFindServices.supabaseClient.getSupabaseClient();
  return Promise.resolve(sb.rpc(name, args || {})).then(r => r || { data: null, error: { message: 'no response' } }, e => ({ data: null, error: { type: 'network_failure', message: e && e.message } }));
}
function feedsDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}
function feedsHost(url) { try { const u = new URL(url); return u.host + (u.pathname.length > 32 ? u.pathname.slice(0, 30) + '…' : u.pathname); } catch (_) { return url || '—'; } }

async function renderFeeds() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Flux automatiques des agences</div>
    <p class="muted" style="margin:-8px 0 14px; max-width:820px; font-size:.84rem;">Chaque nuit (2 h 15 UTC, soit 3 h 15 ou 4 h 15 à Paris ; reprise 1 h 30 plus tard), le site importe l’export de chaque agence qui a activé son flux dans son espace : nouvelles annonces en brouillon, mises à jour, retraits par archivage si l’import complet est activé. Rien n’est publié automatiquement. Un flux vide ou qui perd plus de la moitié de ses annonces ne retire rien et passe « À vérifier » ; l’agence est prévenue par e-mail, comme après deux nuits d’échec.</p>
    <div class="toolbar"><button class="btn" id="feeds-refresh" onclick="loadFeedsList()">Actualiser</button></div>
    <table id="feeds-table"><thead><tr><th>Agence</th><th>Adresse</th><th>Import complet</th><th>Dernière synchronisation</th><th>Résultat</th><th>Échecs</th><th>Actions</th></tr></thead>
    <tbody id="feeds-tbody"><tr><td colspan="7">Chargement…</td></tr></tbody></table>`);
  loadFeedsList();
}

async function loadFeedsList() {
  const tbody = document.getElementById('feeds-tbody');
  if (!tbody) return;
  const res = await feedsRpc('zfind_admin_list_feeds');
  if (res.error) { tbody.innerHTML = `<tr><td colspan="7">${/Could not find|does not exist/.test(res.error.message || '') ? 'Migration 20261010120000 non appliquée.' : 'Chargement impossible.'}</td></tr>`; return; }
  feedsCache = res.data || [];
  if (!feedsCache.length) { tbody.innerHTML = '<tr><td colspan="7" class="muted">Aucune agence n’a encore activé de flux automatique.</td></tr>'; return; }
  tbody.innerHTML = feedsCache.map(f => {
    const [label, tag] = FEED_STATUS_FR[f.last_status] || ['Jamais lancée', 'draft'];
    const c = f.last_counts || {};
    const state = f.disabled_by_admin ? '<span class="tag tag-inactive">Désactivé par Z Find</span>' : f.active ? '' : '<span class="tag tag-inactive">En pause (agence)</span>';
    const result = f.last_run_at && f.last_status !== 'error'
      ? `${fmtN(c.file || 0)} dans le flux · ${fmtN(c.created || 0)} créée(s) · ${fmtN(c.updated || 0)} mise(s) à jour · ${fmtN(c.archived || 0)} retirée(s)${c.errors ? ` · <span class="imp-bad">${fmtN(c.errors)} en erreur</span>` : ''}`
      : '';
    return `<tr data-feed="${escapeHtml(f.id)}">
      <td><strong>${escapeHtml(f.partner_name || '—')}</strong> ${state}</td>
      <td class="muted" title="${escapeHtml(f.url)}">${escapeHtml(feedsHost(f.url))}${f.auth_user ? '<br>identifiant : ' + escapeHtml(f.auth_user) : ''}</td>
      <td>${f.full_sync ? 'Oui' : 'Non'}</td>
      <td class="nowrap">${escapeHtml(feedsDate(f.last_run_at))}<br><span class="tag tag-${tag}">${label}</span>${f.run_requested_at ? '<br><span class="muted">lancement demandé</span>' : ''}</td>
      <td style="max-width:360px">${result}${f.last_message ? `<div class="muted" style="font-size:.78rem;margin-top:3px">${escapeHtml(f.last_message)}</div>` : ''}</td>
      <td>${f.consecutive_failures ? `<span class="imp-bad">${fmtN(f.consecutive_failures)}</span>` : '0'}</td>
      <td class="nowrap">
        <button class="btn btn-sm" data-act="run" onclick="feedRunNow('${escapeHtml(f.id)}')"${f.disabled_by_admin || !f.active ? ' disabled' : ''}>Lancer maintenant</button>
        ${f.disabled_by_admin
          ? `<button class="btn btn-sm" data-act="enable" onclick="feedSetActive('${escapeHtml(f.id)}', true)">Réactiver</button>`
          : `<button class="btn btn-sm" data-act="disable" onclick="feedSetActive('${escapeHtml(f.id)}', false)">Désactiver</button>`}
      </td></tr>`;
  }).join('');
}

async function feedRunNow(id) {
  const res = await feedsRpc('zfind_admin_request_feed_run', { p_feed_id: id });
  if (res.error) { showStatus('error', /^Flux/.test(res.error.message || '') ? res.error.message : 'Lancement impossible.'); return; }
  showStatus('success', 'Synchronisation lancée : le résultat s’affiche dans une minute environ.');
  try { fetch('https://zfind.online/api/feed-sync', { method: 'POST', mode: 'no-cors', keepalive: true }).catch(() => null); } catch (_) { /* nudge only */ }
  loadFeedsList();
  setTimeout(() => { if (adminState.view === 'flux') loadFeedsList(); }, 45000);
}

async function feedSetActive(id, active) {
  const f = feedsCache.find(x => x.id === id);
  if (!active) {
    const ok = await askConfirm('Désactiver ce flux ?', `Le flux de ${f ? f.partner_name : 'cette agence'} ne sera plus importé la nuit, et l’agence ne pourra pas le réactiver elle-même. Ses annonces restent telles quelles.`, 'Désactiver');
    if (!ok) return;
  }
  const res = await feedsRpc('zfind_admin_set_feed_active', { p_feed_id: id, p_active: !!active });
  if (res.error) { showStatus('error', 'Modification impossible.'); return; }
  showStatus('success', active ? 'Flux réactivé.' : 'Flux désactivé.');
  loadFeedsList();
}
