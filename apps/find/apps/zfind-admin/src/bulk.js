/* ============================================================
   Z FIND ADMIN — actions groupées
   ============================================================
   Checkboxes + bulk actions on « Biens et annonces » (and its
   « À vérifier » view), « Programmes neufs », and the « Mentions
   obligatoires à valider » queue:
   - « Approuver (prête à publier) », « Publier », « Renvoyer en brouillon »
     (reason required, e-mailed to the agency);
   - « Valider » the mentions (refusal stays one by one: it needs a reason).
   Each listing goes through the existing commands ONE AFTER THE OTHER
   (zfind_admin_transition_listing, zfind_admin_review_listing_compliance,
   zfind_admin_return_listing_to_draft) with a progress bar, then a
   French summary and the result of every listing. Plans, runner and
   wording: zfind-web services/listing-submission.js (unit-tested).
   This file is loaded before app.js: no top-level use of adminState.
   ============================================================ */

const bulkState = { sel: { props: new Set(), devs: new Set(), compliance: new Set() }, running: false, results: {} };
let complianceRowsCache = [];

function lsAdmin() { return window.ZFindServices.listingSubmission; }

const BULK_ACTIONS = {
  props: ['approve', 'publish', 'return'],
  devs: ['approve', 'publish', 'return'],
  compliance: ['validate']
};
const BULK_HINT = {
  props: 'Cochez des annonces pour les approuver, les publier ou les renvoyer en brouillon en une fois.',
  devs: 'Cochez des programmes pour les approuver, les publier ou les renvoyer en brouillon en une fois.',
  compliance: 'Cochez des mentions complètes pour les valider en une fois. Un refus se fait annonce par annonce, avec un motif.'
};

/* ---------------- Rows ---------------- */

function bulkHeadCell(ctx) {
  return `<th class="bulk-cell"><input type="checkbox" id="bulk-all-${ctx}" aria-label="Tout sélectionner" onclick="event.stopPropagation()" onchange="bulkToggleAll('${ctx}', this.checked)"></th>`;
}

function bulkRowCell(ctx, listingId, enabled) {
  if (!listingId || enabled === false) return '<td class="bulk-cell" onclick="event.stopPropagation()"></td>';
  const on = bulkState.sel[ctx].has(listingId) ? ' checked' : '';
  return `<td class="bulk-cell" onclick="event.stopPropagation()"><input type="checkbox" class="bulk-cb" aria-label="Sélectionner" data-ctx="${ctx}" value="${escapeHtml(listingId)}"${on} onchange="bulkToggle('${ctx}', this.value, this.checked)"></td>`;
}

function bulkItem(ctx, listingId) {
  if (ctx === 'compliance') {
    const r = complianceRowsCache.find(x => x.listing_id === listingId);
    return r ? { listingId, status: r.listing_status, label: r.title || '(sans titre)' } : null;
  }
  const cache = ctx === 'devs' ? devRowsCache : propRowsCache;
  for (const row of cache) {
    const { listing } = propListing(row);
    if (listing && listing.id === listingId) return { listingId, status: listing.status, label: (ctx === 'devs' ? row.name : propTitle(row)) || '(sans titre)' };
  }
  return null;
}

/** After the rows are (re)drawn: keep only the visible selected rows, refresh the bar. */
function bulkAfterRows(ctx) {
  const visible = new Set(Array.from(document.querySelectorAll(`.bulk-cb[data-ctx="${ctx}"]`)).map(cb => cb.value));
  Array.from(bulkState.sel[ctx]).forEach(id => { if (!visible.has(id)) bulkState.sel[ctx].delete(id); });
  renderBulkBar(ctx);
}

function bulkToggle(ctx, listingId, on) {
  if (on) bulkState.sel[ctx].add(listingId); else bulkState.sel[ctx].delete(listingId);
  renderBulkBar(ctx);
}

function bulkToggleAll(ctx, on) {
  document.querySelectorAll(`.bulk-cb[data-ctx="${ctx}"]`).forEach(cb => { cb.checked = on; if (on) bulkState.sel[ctx].add(cb.value); else bulkState.sel[ctx].delete(cb.value); });
  renderBulkBar(ctx);
}

function bulkClear(ctx) { bulkToggleAll(ctx, false); }

/* ---------------- Bar + result ---------------- */

function bulkBarHtml(ctx) {
  return `<div class="bulk-bar" id="bulk-bar-${ctx}"></div><div class="bulk-result" id="bulk-result-${ctx}">${bulkState.results[ctx] || ''}</div>`;
}

function renderBulkBar(ctx) {
  const bar = document.getElementById('bulk-bar-' + ctx);
  if (!bar) return;
  const n = bulkState.sel[ctx].size;
  const all = document.getElementById('bulk-all-' + ctx);
  const boxes = document.querySelectorAll(`.bulk-cb[data-ctx="${ctx}"]`);
  if (all) { all.checked = boxes.length > 0 && n === boxes.length; all.indeterminate = n > 0 && n < boxes.length; all.disabled = !boxes.length; }
  const svc = lsAdmin();
  const noun = ctx === 'devs' ? ['programme sélectionné', 'programmes sélectionnés'] : ctx === 'compliance' ? ['mention sélectionnée', 'mentions sélectionnées'] : ['annonce sélectionnée', 'annonces sélectionnées'];
  const busy = bulkState.running;
  bar.classList.toggle('on', n > 0);
  bar.innerHTML = n === 0
    ? `<span class="muted">${escapeHtml(BULK_HINT[ctx])}</span>`
    : `<strong>${fmtN(n)} ${n > 1 ? noun[1] : noun[0]}</strong>
       ${BULK_ACTIONS[ctx].map(a => `<button class="btn${a === 'publish' || a === 'validate' ? ' btn-primary' : a === 'return' ? ' btn-danger' : ''}" data-bulk="${a}" ${busy ? 'disabled' : ''} onclick="bulkRun('${ctx}','${a}')">${escapeHtml(svc.ACTIONS[a].label)}</button>`).join('')}
       <a class="bulk-clear" onclick="bulkClear('${ctx}')">Tout désélectionner</a>`;
}

function bulkProgressHtml(action, done, total, label) {
  const pct = total ? Math.round(done * 100 / total) : 0;
  return `<div class="bulk-progress" role="status"><div class="bulk-track"><span style="width:${pct}%"></span></div>
    <span>${escapeHtml(lsAdmin().ACTIONS[action].progress)}… ${fmtN(done)} / ${fmtN(total)}${label ? ' — ' + escapeHtml(label) : ''}</span></div>`;
}

function bulkResultHtml(action, results) {
  const svc = lsAdmin();
  const summary = svc.summarize(action, results);
  const doneWord = svc.ACTIONS[action].done[0];
  const rows = results.map(r => {
    const cls = r.outcome === 'done' ? 'ok' : r.outcome === 'failed' ? 'bad' : 'skip';
    const mark = r.outcome === 'done' ? '✓' : r.outcome === 'failed' ? '✕' : '–';
    const what = r.outcome === 'done' ? doneWord : r.outcome === 'failed' ? `bloquée : ${r.reason}` : `ignorée : ${r.reason}`;
    const detail = r.outcome === 'failed' && r.message && r.message !== r.reason ? `<div class="muted">${escapeHtml(r.message)}</div>` : '';
    return `<li class="${cls}"><span class="mk">${mark}</span><div><strong>${escapeHtml(r.item.label)}</strong> — ${escapeHtml(what)}${detail}</div></li>`;
  }).join('');
  const failed = results.some(r => r.outcome === 'failed');
  return `<div class="bulk-summary${failed ? ' has-failed' : ''}"><div class="bulk-summary-head"><strong>${escapeHtml(summary)}</strong><a class="bulk-clear" onclick="bulkDismiss(this)">Masquer</a></div>
    <details${failed ? ' open' : ''}><summary>Détail par annonce</summary><ul class="bulk-list">${rows}</ul></details></div>`;
}

function bulkDismiss(el) {
  const host = el.closest('.bulk-result');
  if (!host) return;
  const ctx = host.id.replace('bulk-result-', '');
  delete bulkState.results[ctx];
  host.innerHTML = '';
}

/** Reason for « Renvoyer en brouillon » (modal, same look as askConfirm). Resolves the text or null. */
function askReason(title, body, okLabel) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-overlay');
    overlay.innerHTML = `
      <div class="confirm-box reason-box">
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(body)}</p>
        <textarea id="reason-text" maxlength="1000" placeholder="ex. : photos floues, description à compléter, prix à vérifier…"></textarea>
        <div class="reason-error" id="reason-error"></div>
        <div class="actions">
          <button class="btn" id="reason-cancel">Annuler</button>
          <button class="btn btn-danger" id="reason-ok">${escapeHtml(okLabel || 'Confirmer')}</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
    const text = document.getElementById('reason-text');
    text.oninput = () => { document.getElementById('reason-error').textContent = ''; };
    text.focus();
    const cleanup = result => { overlay.classList.add('hidden'); overlay.innerHTML = ''; resolve(result); };
    document.getElementById('reason-ok').onclick = () => {
      const v = text.value.trim();
      if (!v) { document.getElementById('reason-error').textContent = 'Indiquez le motif : il est envoyé à l’agence.'; text.focus(); return; }
      cleanup(v);
    };
    document.getElementById('reason-cancel').onclick = () => cleanup(null);
    overlay.onclick = e => { if (e.target === overlay) cleanup(null); };
  });
}

function bulkDeps() {
  return {
    transition: (id, to) => window.ZFindServices.admin.setListingStatus(id, to),
    returnToDraft: (id, reason) => lsAdmin().returnToDraft(id, reason),
    approveCompliance: id => window.ZFindServices.listingCompliance.reviewListingCompliance(id, 'approved', null)
  };
}

/** Agencies hear about returns / refusals by e-mail (/api/lead-notify processes what is pending). */
function bulkNotifyAgencies() {
  const f = window.ZFindServices.followup;
  if (f && typeof f.sendToAgencies === 'function') f.sendToAgencies();
}

async function bulkRun(ctx, action) {
  if (bulkState.running) return;
  const svc = lsAdmin();
  // In the order shown on screen (the « À vérifier » view lists the oldest first).
  const order = Array.from(document.querySelectorAll(`.bulk-cb[data-ctx="${ctx}"]`)).map(cb => cb.value);
  const ids = Array.from(bulkState.sel[ctx]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const items = ids.map(id => bulkItem(ctx, id)).filter(Boolean);
  if (!items.length) return;
  const n = items.length;
  const plural = n > 1 ? 's' : '';
  let reason = null;
  if (action === 'return') {
    reason = await askReason(`Renvoyer ${n} annonce${plural} en brouillon ?`, 'L’agence reçoit ce motif par e-mail et le voit dans son espace. Elle corrige puis soumet à nouveau.', 'Renvoyer en brouillon');
    if (!reason) return;
  } else {
    const text = {
      approve: [`Approuver ${n} annonce${plural} ?`, 'Les annonces « À vérifier » passent « Prêtes à publier ». Les autres sont ignorées.', 'Approuver'],
      publish: [`Publier ${n} annonce${plural} ?`, 'Les annonces à vérifier ou prêtes sont mises en ligne une par une. En France, celles dont les mentions obligatoires ne sont pas validées restent bloquées.', 'Publier'],
      validate: [`Valider les mentions de ${n} annonce${plural} ?`, 'Seules des mentions complètes peuvent être validées. Les annonces pourront ensuite être publiées.', 'Valider']
    }[action];
    if (!(await askConfirm(text[0], text[1], text[2]))) return;
  }
  bulkState.running = true;
  renderBulkBar(ctx);
  const host = document.getElementById('bulk-result-' + ctx);
  if (host) host.innerHTML = bulkProgressHtml(action, 0, n);
  const results = await svc.runBulk(action, items, bulkDeps(), {
    reason,
    onProgress: (done, total, item) => { const h = document.getElementById('bulk-result-' + ctx); if (h) h.innerHTML = bulkProgressHtml(action, done, total, done < total ? '' : item.label); }
  });
  bulkState.running = false;
  bulkState.results[ctx] = bulkResultHtml(action, results);
  bulkState.sel[ctx].clear();
  const summary = svc.summarize(action, results);
  const anyFailed = results.some(r => r.outcome === 'failed');
  showStatus(anyFailed ? 'error' : 'success', summary.charAt(0).toUpperCase() + summary.slice(1) + '.');
  if (action === 'return' && results.some(r => r.outcome === 'done')) bulkNotifyAgencies();
  if (ctx === 'props') await loadPropertiesList();
  else if (ctx === 'devs') await loadDevelopmentsList();
  else render();
  const h = document.getElementById('bulk-result-' + ctx);
  if (h) h.innerHTML = bulkState.results[ctx];
  renderBulkBar(ctx);
}

/* ---------------- Listing page: « Valider les mentions et publier » ---------------- */
async function validateAndPublish(listingId, status, title) {
  const svc = lsAdmin();
  if (!(await askConfirm('Valider les mentions et publier ?', 'Les mentions obligatoires de l’agence sont validées, puis l’annonce est mise en ligne.', 'Valider et publier'))) return;
  const results = await svc.runBulk('validate_publish', [{ listingId, status, label: title || 'Annonce' }], bulkDeps());
  const r = results[0];
  if (r.outcome === 'done') showStatus('success', 'Mentions validées, annonce publiée.');
  else showStatus('error', r.outcome === 'failed' ? r.message : `Rien à faire : ${r.reason}.`);
  render();
}
