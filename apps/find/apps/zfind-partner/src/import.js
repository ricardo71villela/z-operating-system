/* ============================================================
   Z FIND PARTNER — « Importer mes annonces »
   ============================================================
   The agency loads, then keeps up to date, its portfolio from its
   software's export: Poliris / SeLoger (annonces.csv, or the ZIP with the
   photos), CSV with a header row, Excel. SAME code as the Admin import
   (zfind-web/src/services/listing-import: reader, mapping, sync plan,
   writer) — only the writer differs: rpcWriter, i.e. Partner commands on
   the agency's own session (migration 20261010120000). The agency is the
   one of the session: no selector, nothing can be written elsewhere.
   - new reference → property + listing in DRAFT (never published);
   - known reference → only what changed (preview of every change);
   - « Import complet » → its imported listings absent from the file are
     archived (never deleted, never another agency's);
   - then « Soumettre toutes les annonces prêtes » (zfind_partner_submit_listing
     one by one, blocked ones listed with what they miss).
   Limits: ZIP 50 Mo, CSV / Excel 20 Mo, 2 000 annonces per import.
   ============================================================ */

const pimp = {
  table: null, fileName: '', map: {}, rows: [], plan: null, portfolio: null,
  fullSync: false, agencyId: '', country: 'FR', running: false, confirming: false,
  results: null, listingIds: [], photoListings: [], submitResults: null, seq: 0
};
const PIMP_KIND = { create: ['Créée (brouillon)', 'tone-ok'], update: ['Mise à jour', 'tone-ready'], archive: ['Retirée (archivée)', 'tone-off'], unchanged: ['Inchangée', 'tone-draft'], error: ['Erreur', 'tone-bad'] };
const PIMP_STATUS_TONE = { draft: 'tone-draft', incomplete: 'tone-draft', pending_review: 'tone-wait', ready: 'tone-ready', published: 'tone-ok', suspended: 'tone-off', archived: 'tone-off' };
const PIMP_SUBMIT_TONE = { submitted: ['Soumise à validation', 'tone-wait'], blocked: ['Bloquée', 'tone-bad'], skipped: ['Ignorée', 'tone-draft'] };

function pimpSvc() { return window.ZFindServices.listingImport; }
function pimpEsc(s) { return escapeHtmlPartner(s); }
function pimpN(n) { return new Intl.NumberFormat('fr-FR').format(Number(n) || 0); }
function pimpRpc() {
  const sb = window.ZFindServices.supabaseClient.getSupabaseClient();
  return (name, args) => Promise.resolve(sb.rpc(name, args)).then(r => r || { data: null, error: { message: 'Pas de réponse' } }, e => ({ data: null, error: { type: 'network_failure', message: e && e.message } }));
}
function pimpWriter() {
  return pimpSvc().rpcWriter(pimpRpc(), {
    uploadMedia: (listingId, file, opts) => window.ZFindServices.admin.uploadPartnerListingMedia(listingId, file, opts)
  });
}

/* ---------------- page ---------------- */
function showImportView() {
  partnerShowView('view-import');
  pimp.country = pimp.table ? pimp.country : (partnerCountry || 'FR');
  renderPartnerImport();
}

function renderPartnerImport() {
  const host = document.getElementById('pimp-root');
  if (!host) return;
  const svc = pimpSvc();
  const L = svc.LIMITS;
  host.innerHTML = `
    <div class="pimp-card" id="pimp-step-file">
      <div class="pimp-step"><span class="pimp-num">1</span><div>
        <h3>Votre fichier</h3>
        <p class="pimp-sub">L’export de votre logiciel au format <strong>Poliris / SeLoger</strong> (annonces.csv, ou le ZIP avec les photos : Hektor, Apimo, Netty, AC3, La Boîte Immo, Périclès…), un CSV avec une ligne de titres ou un fichier Excel. Jusqu’à ${pimpN(L.rows)} annonces ; ZIP ${L.zipBytes / 1048576} Mo, CSV ou Excel ${L.textBytes / 1048576} Mo au plus.</p>
      </div></div>
      <div class="pimp-form">
        <div class="pimp-file"><span>Fichier</span><label class="pimp-file-btn"><input type="file" id="pimp-file" accept=".csv,.txt,.zip,.xlsx,.xls,.ods" onchange="partnerImportFileChosen()"><b>Choisir un fichier</b><em id="pimp-file-name">${pimp.fileName ? pimpEsc(pimp.fileName) : 'aucun fichier choisi'}</em></label></div>
        <label class="pimp-select"><span>Pays des biens</span><select id="pimp-country" onchange="partnerImportSetCountry(this.value)">
          <option value="FR"${pimp.country === 'FR' ? ' selected' : ''}>France</option><option value="BE"${pimp.country === 'BE' ? ' selected' : ''}>Belgique</option><option value="LU"${pimp.country === 'LU' ? ' selected' : ''}>Luxembourg</option></select></label>
        <div class="pimp-actions">
          <button class="btn btn-primary" id="pimp-read" onclick="partnerImportRead()">Lire le fichier</button>
          <button class="btn" id="pimp-template" onclick="partnerImportTemplate()">Télécharger le modèle CSV</button>
        </div>
      </div>
      <p class="pimp-error" id="pimp-file-error"></p>
    </div>
    <div id="pimp-mapping"></div>
    <div id="pimp-plan"></div>
    <div id="pimp-results"></div>`;
  if (pimp.table) { renderPartnerImportMapping(); refreshPartnerImportPlan(); }
}

function partnerImportSetCountry(c) { pimp.country = c; if (pimp.table) refreshPartnerImportPlan(); }
function partnerImportFileChosen() {
  const e = document.getElementById('pimp-file-error'); if (e) e.textContent = '';
  const input = document.getElementById('pimp-file');
  const name = document.getElementById('pimp-file-name');
  if (name) name.textContent = input && input.files && input.files[0] ? input.files[0].name : 'aucun fichier choisi';
}

function partnerImportDownload(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function partnerImportTemplate() { partnerImportDownload('modele-import-zfind.csv', pimpSvc().templateCsv()); }

async function partnerImportRead() {
  const input = document.getElementById('pimp-file');
  const err = document.getElementById('pimp-file-error');
  const file = input && input.files && input.files[0];
  const svc = pimpSvc();
  err.textContent = '';
  if (!file) { err.textContent = 'Choisissez d’abord le fichier exporté de votre logiciel.'; return; }
  const sizeError = svc.fileSizeError(file.name, file.size);
  if (sizeError) { err.textContent = sizeError; return; }
  const btn = document.getElementById('pimp-read');
  btn.disabled = true; btn.textContent = 'Lecture…';
  let table;
  try { table = await svc.readFile(file); }
  catch (e) {
    err.textContent = /trop volumineux/.test(e.message) ? e.message : /^Aucun fichier annonces/.test(e.message) ? 'Le ZIP ne contient pas de fichier annonces.csv.' : 'Impossible de lire ce fichier (formats acceptés : Poliris / SeLoger, ZIP, CSV, XLSX, XLS, ODS).';
    btn.disabled = false; btn.textContent = 'Lire le fichier';
    return;
  }
  btn.disabled = false; btn.textContent = 'Lire le fichier';
  if (!table.records.length) { err.textContent = 'Le fichier ne contient aucune annonce.'; return; }
  const ids = table.agencyIds || [];
  const agencyId = ids.length > 1 ? ids[0] : '';
  const tooMany = svc.rowCountError(svc.recordsInScope(table, agencyId).length);
  if (tooMany) { err.textContent = tooMany; return; }
  Object.assign(pimp, { table, fileName: file.name, map: svc.mapFor(table), plan: null, results: null, submitResults: null, confirming: false, agencyId, fullSync: table.format === 'poliris' });
  document.getElementById('pimp-results').innerHTML = '';
  renderPartnerImportMapping();
  refreshPartnerImportPlan();
}

function partnerImportExample(header) {
  if (!header || !pimp.table) return '';
  const r = pimp.table.records.find(x => String(x[header] || '').trim());
  return r ? String(r[header]).slice(0, 60) : '';
}

function renderPartnerImportMapping() {
  const host = document.getElementById('pimp-mapping');
  const { table, map } = pimp;
  const svc = pimpSvc();
  if (!host || !table) return;
  if (table.format === 'poliris') {
    const ids = table.agencyIds || [];
    host.innerHTML = `
      <div class="pimp-card" id="pimp-format">
        <div class="pimp-step"><span class="pimp-num">2</span><div>
          <h3>Format Poliris / SeLoger reconnu</h3>
          <p class="pimp-sub">« ${pimpEsc(pimp.fileName)} » : ${pimpN(table.records.length)} annonces · version ${pimpEsc(table.version || 'non indiquée')}${table.invalidLines ? ` · <span class="pimp-bad">${pimpN(table.invalidLines)} ligne(s) illisible(s) ignorée(s)</span>` : ''}${table.zipEntry ? ` · ${pimpN(table.zipPhotoCount)} photo(s) dans le ZIP` : ''}. Les colonnes sont lues à leur position officielle : rien à régler.</p>
          ${ids.length > 1 ? `<label class="pimp-select inline"><span>Fichier de plusieurs agences : votre identifiant dans le logiciel</span><select id="pimp-agency-id" onchange="partnerImportSetAgencyId(this.value)">${ids.map(id => `<option value="${pimpEsc(id)}"${id === pimp.agencyId ? ' selected' : ''}>${pimpEsc(id)} (${pimpN(table.records.filter(r => r.agencyId === id).length)} annonces)</option>`).join('')}</select></label>` : ''}
        </div></div>
      </div>`;
    return;
  }
  const options = sel => '<option value="">— ne pas utiliser —</option>' + table.headers.map(h => `<option value="${pimpEsc(h)}"${h === sel ? ' selected' : ''}>${pimpEsc(h)}</option>`).join('');
  const rowsOf = group => svc.FIELDS.filter(f => f[3] === group).map(([key, label]) => `<tr><td>${pimpEsc(label)}</td><td><select data-field="${key}" onchange="partnerImportSetMap('${key}', this.value)">${options(map[key])}</select></td><td class="pimp-muted" id="pimp-ex-${key}">${pimpEsc(partnerImportExample(map[key]))}</td></tr>`).join('');
  host.innerHTML = `
    <div class="pimp-card" id="pimp-columns">
      <div class="pimp-step"><span class="pimp-num">2</span><div>
        <h3>Colonnes du fichier</h3>
        <p class="pimp-sub">« ${pimpEsc(pimp.fileName)} » : ${pimpN(table.records.length)} lignes. Les colonnes reconnues sont déjà choisies ; complétez ce qui manque. La <strong>référence</strong> de l’annonce est indispensable pour mettre à jour vos annonces aux imports suivants.</p>
      </div></div>
      <details class="pimp-details"${map.reference ? '' : ' open'}><summary>Voir et ajuster les colonnes</summary>
        <div class="pimp-scroll"><table class="pimp-table" id="pimp-map-table"><thead><tr><th>Champ Z Find</th><th>Colonne du fichier</th><th>Exemple</th></tr></thead>
        <tbody><tr class="pimp-group"><th colspan="3">Annonce</th></tr>${rowsOf('base')}<tr class="pimp-group"><th colspan="3">Mentions obligatoires (France)</th></tr>${rowsOf('mentions')}</tbody></table></div>
      </details>
    </div>`;
}

function partnerImportSetMap(key, header) {
  if (header) pimp.map[key] = header; else delete pimp.map[key];
  const ex = document.getElementById('pimp-ex-' + key);
  if (ex) ex.textContent = partnerImportExample(header);
  refreshPartnerImportPlan();
}
function partnerImportSetAgencyId(id) { pimp.agencyId = id; refreshPartnerImportPlan(); }
function partnerImportToggleFull(on) { pimp.fullSync = !!on; pimp.confirming = false; refreshPartnerImportPlan(); }

function pimpLineOffset() { return pimp.table && pimp.table.format === 'poliris' ? 1 : 2; }
function pimpPrice(row) { return row.price > 0 ? pimpN(row.price) + ' €' + (row.transaction === 'rent' ? ' /mois' : '') : '—'; }
function pimpStatus(st) { return `<span class="status-badge ${PIMP_STATUS_TONE[st] || 'tone-draft'}">${pimpEsc(window.ZFindServices.listingSubmission.statusLabel(st))}</span>`; }

/* Compares the file with the agency's own portfolio (read only). */
async function refreshPartnerImportPlan() {
  const host = document.getElementById('pimp-plan');
  if (!host || !pimp.table) return;
  const seq = ++pimp.seq;
  const svc = pimpSvc();
  pimp.rows = pimp.table.records.map(r => svc.normalizeRow(r, pimp.map));
  if (!pimp.portfolio) {
    host.innerHTML = '<div class="pimp-card"><p class="pimp-muted">Comparaison avec vos annonces sur Z Find…</p></div>';
    const writer = pimpWriter();
    const res = await writer.portfolio();
    if (seq !== pimp.seq) return;
    if (res.error) { host.innerHTML = '<div class="pimp-card"><p class="pimp-bad">Impossible de lire vos annonces actuelles. Réessayez dans un instant.</p></div>'; return; }
    pimp.portfolio = res.data;
    const refs = new Set(pimp.rows.filter(r => r.reference).map(r => String(r.reference).trim().toLowerCase()));
    await svc.loadComplianceFor(pimp.portfolio.filter(e => refs.has(e.refKey) && e.listing && e.compliance === null), writer.compliance, 4);
    if (seq !== pimp.seq) return;
  }
  pimp.plan = svc.planSync(pimp.rows, pimp.portfolio, { country: pimp.country, fullSync: pimp.fullSync, agencyId: pimp.agencyId, lineOffset: pimpLineOffset() });
  renderPartnerImportPlan();
}

function renderPartnerImportPlan() {
  const host = document.getElementById('pimp-plan');
  const plan = pimp.plan;
  if (!host || !plan) return;
  const svc = pimpSvc();
  const k = plan.counts;
  const LIMIT = 100;
  const more = list => (list.length > LIMIT ? `<p class="pimp-muted">… et ${pimpN(list.length - LIMIT)} autres (toutes figurent dans le rapport).</p>` : '');
  const comp = c => (c && c.applicable !== false && c.text ? `<span class="${c.complete ? 'pimp-ok' : 'pimp-warn'}">${pimpEsc(c.text)}</span>` : '<span class="pimp-muted">—</span>');
  const card = (id, n, label, tone) => `<div class="pimp-count${n && tone ? ' ' + tone : ''}" id="pimp-count-${id}"><strong>${pimpN(n)}</strong><span>${label}</span></div>`;
  const total = k.create + k.update + k.archive;
  host.innerHTML = `
    <div class="pimp-card" id="pimp-plan-panel">
      <div class="pimp-step"><span class="pimp-num">3</span><div>
        <h3>Ce qui va changer</h3>
        <p class="pimp-sub">Comparaison du fichier avec vos annonces sur Z Find, par référence. Rien n’est encore enregistré.</p>
      </div></div>
      <div class="pimp-counts">
        ${card('create', k.create, 'à créer (brouillon)', 'good')}
        ${card('update', k.update, 'à mettre à jour', 'info')}
        ${card('archive', k.archive, 'à retirer', 'warn')}
        ${card('error', k.error, 'en erreur', 'bad')}
        ${card('unchanged', k.unchanged, 'inchangées', '')}
      </div>
      <label class="pimp-check"><input type="checkbox" id="pimp-full"${pimp.fullSync ? ' checked' : ''} onchange="partnerImportToggleFull(this.checked)"> <span><strong>Import complet du portefeuille</strong> — retirer de Z Find mes annonces importées qui ne sont plus dans le fichier (vendues, louées, mandat terminé). Elles sont archivées, jamais supprimées ; vos annonces créées à la main ne sont pas concernées.</span></label>
      ${plan.archiveBlocked ? `<p class="pimp-note warn">${pimpEsc(plan.archiveBlocked)}</p>` : ''}
      ${k.ignored ? `<p class="pimp-muted">${pimpN(k.ignored)} ligne(s) d’un autre identifiant agence ignorée(s).</p>` : ''}
      ${plan.updates.length ? `<h4>À mettre à jour</h4><div class="pimp-scroll"><table class="pimp-table" id="pimp-plan-updates"><thead><tr><th>Référence</th><th>Annonce</th><th>Changements</th><th>Mentions (France)</th></tr></thead><tbody>
        ${plan.updates.slice(0, LIMIT).map(u => `<tr><td class="nowrap">${pimpEsc(u.row.reference || '—')}</td><td>${pimpEsc(u.entry.listing.title || '—')}<br>${pimpStatus(u.entry.listing.status)}</td>
          <td><ul class="pimp-changes">${u.changes.map(ch => `<li>${pimpEsc(svc.changeText(ch))}</li>`).join('')}${u.notes.filter(n => /^Annonce en ligne/.test(n)).map(n => `<li class="pimp-warn">${pimpEsc(n)}</li>`).join('')}</ul></td><td>${comp(u.compliance)}</td></tr>`).join('')}</tbody></table></div>${more(plan.updates)}` : ''}
      ${plan.creates.length ? `<h4>À créer en brouillon</h4><div class="pimp-scroll"><table class="pimp-table" id="pimp-plan-creates"><thead><tr><th>Ligne</th><th>Référence</th><th>Bien</th><th>Prix</th><th>Commune</th><th>Mentions (France)</th></tr></thead><tbody>
        ${plan.creates.slice(0, LIMIT).map(c => `<tr><td>${c.line}</td><td class="nowrap">${pimpEsc(c.row.reference || '—')}</td><td>${pimpEsc(subtypeLabel(c.row.subtype))}${c.row.typology ? ' · ' + pimpEsc(c.row.typology) : ''} <span class="pimp-muted">${c.row.transaction === 'rent' ? 'location' : 'vente'}</span></td><td class="nowrap">${pimpPrice(c.row)}</td><td>${pimpEsc([c.row.postcode, c.row.city].filter(Boolean).join(' ') || '—')}</td><td>${comp(c.compliance)}</td></tr>`).join('')}</tbody></table></div>${more(plan.creates)}` : ''}
      ${plan.archives.length ? `<h4>À retirer (absentes du fichier)</h4><div class="pimp-scroll"><table class="pimp-table" id="pimp-plan-archives"><thead><tr><th>Référence</th><th>Annonce</th><th>Statut actuel</th></tr></thead><tbody>
        ${plan.archives.slice(0, LIMIT).map(a => `<tr><td class="nowrap">${pimpEsc(a.reference)}</td><td>${pimpEsc(a.title || '—')}</td><td>${pimpStatus(a.status)}</td></tr>`).join('')}</tbody></table></div>${more(plan.archives)}` : ''}
      ${plan.errors.length ? `<h4>En erreur (non importées)</h4><div class="pimp-scroll"><table class="pimp-table" id="pimp-plan-errors"><thead><tr><th>Ligne</th><th>Référence</th><th>Problème</th></tr></thead><tbody>
        ${plan.errors.slice(0, LIMIT).map(e => `<tr><td>${e.line}</td><td class="nowrap">${pimpEsc(e.row.reference || '—')}</td><td class="pimp-bad">${pimpEsc(e.message)}</td></tr>`).join('')}</tbody></table></div>${more(plan.errors)}` : ''}
      <div id="pimp-confirm-host">${pimp.confirming ? partnerImportConfirmHtml() : `
        <div class="pimp-actions end">
          <span class="pimp-muted">Rien n’est publié : les nouvelles annonces restent en brouillon.</span>
          <button class="btn btn-primary" id="pimp-run" onclick="partnerImportAskConfirm()"${!total || pimp.running ? ' disabled' : ''}>${total ? 'Importer ces changements' : 'Rien à importer'}</button>
        </div>`}</div>
    </div>`;
}

function partnerImportConfirmHtml() {
  const k = pimp.plan.counts;
  const parts = [k.create ? `${pimpN(k.create)} annonce${k.create > 1 ? 's' : ''} créée${k.create > 1 ? 's' : ''} en brouillon` : '', k.update ? `${pimpN(k.update)} mise${k.update > 1 ? 's' : ''} à jour` : '', k.archive ? `${pimpN(k.archive)} retirée${k.archive > 1 ? 's' : ''} (archivée${k.archive > 1 ? 's' : ''})` : ''].filter(Boolean);
  return `<div class="pimp-confirm" id="pimp-confirm">
    <p><strong>Confirmer l’import ?</strong> ${pimpEsc(parts.join(', '))}. Vos annonces déjà en ligne restent en ligne avec leurs nouvelles informations ; rien n’est publié ni supprimé.</p>
    <div class="pimp-actions"><button class="btn btn-primary" id="pimp-confirm-yes" onclick="partnerImportRun()">Oui, importer</button><button class="btn" onclick="partnerImportCancelConfirm()">Annuler</button></div>
  </div>`;
}
function partnerImportAskConfirm() { pimp.confirming = true; document.getElementById('pimp-confirm-host').innerHTML = partnerImportConfirmHtml(); }
function partnerImportCancelConfirm() { pimp.confirming = false; renderPartnerImportPlan(); }

async function partnerImportRun() {
  const plan = pimp.plan;
  if (!plan || pimp.running) return;
  const k = plan.counts;
  const total = k.create + k.update + k.archive;
  if (!total) return;
  pimp.running = true; pimp.confirming = false;
  const svc = pimpSvc();
  const writer = pimpWriter();
  const out = document.getElementById('pimp-results');
  document.getElementById('pimp-confirm-host').innerHTML = '<p class="pimp-muted">Import en cours…</p>';
  out.innerHTML = `<div class="pimp-card" id="pimp-result-panel"><div class="pimp-step"><span class="pimp-num">4</span><div><h3>Résultat</h3><p class="pimp-sub" id="pimp-progress">Import en cours… 0 / ${pimpN(total)}</p></div></div><div id="pimp-results-body"></div></div>`;
  let res;
  try {
    res = await svc.applyPlan(plan, {
      writer, country: pimp.country,
      source: { source: 'partner_import', format: pimp.table.format, fileName: pimp.fileName, version: pimp.table.version || null },
      zipPhoto: pimp.table.zipPhoto || null
    }, done => { const p = document.getElementById('pimp-progress'); if (p) p.textContent = `Import en cours… ${pimpN(done)} / ${pimpN(total)}`; });
  } finally {
    pimp.running = false;
  }
  const { results, photoJobs } = res;
  pimp.results = results;
  pimp.plan = null; pimp.portfolio = null; // read again before any new comparison
  pimp.listingIds = Array.from(new Set(results.filter(r => r.status === 'ok' && (r.kind === 'create' || r.kind === 'update' || r.kind === 'unchanged') && r.listingId).map(r => r.listingId)));
  const c = svc.countResults(results);
  document.getElementById('pimp-progress').innerHTML = `<strong>${pimpN(c.created)} créée${c.created > 1 ? 's' : ''} en brouillon · ${pimpN(c.updated)} mise${c.updated > 1 ? 's' : ''} à jour · ${pimpN(c.archived)} retirée${c.archived > 1 ? 's' : ''}</strong> · ${pimpN(c.unchanged)} inchangée${c.unchanged > 1 ? 's' : ''} · ${pimpN(c.errors)} en erreur.`;
  const shown = results.filter(r => r.kind !== 'unchanged');
  document.getElementById('pimp-results-body').innerHTML = `
    <div class="pimp-actions"><button class="btn" id="pimp-report" onclick="partnerImportReport()">Télécharger le rapport (CSV)</button></div>
    <div class="pimp-scroll"><table class="pimp-table" id="pimp-results-table"><thead><tr><th>Ligne</th><th>Référence</th><th>Action</th><th>Détail</th><th>Mentions (France)</th></tr></thead><tbody>
    ${shown.slice(0, 300).map(r => { const [label, tone] = r.status === 'error' ? ['Erreur' + (r.kind !== 'error' ? ' — ' + svc.KIND_FR[r.kind].toLowerCase() : ''), 'tone-bad'] : PIMP_KIND[r.kind]; return `<tr data-status="${r.status === 'error' ? 'error' : r.kind}">
      <td>${r.line == null ? '—' : r.line}</td><td class="nowrap">${pimpEsc(r.reference || '—')}</td><td><span class="status-badge ${tone}">${pimpEsc(label)}</span></td><td>${pimpEsc(r.message || '')}</td>
      <td>${r.compliance ? `<span class="${/^mentions complètes/.test(r.compliance) ? 'pimp-ok' : 'pimp-warn'}">${pimpEsc(r.compliance)}</span>` : '<span class="pimp-muted">—</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>${shown.length > 300 ? `<p class="pimp-muted">… et ${pimpN(shown.length - 300)} autres lignes dans le rapport.</p>` : ''}
    <div id="pimp-photos"></div>
    <div class="pimp-submit" id="pimp-submit">${partnerImportSubmitHtml()}</div>`;
  document.getElementById('pimp-plan').innerHTML = '<div class="pimp-card"><p class="pimp-muted">Changements appliqués. Pour un nouvel import, relisez un export récent de votre logiciel.</p></div>';
  const writeFailed = results.filter(r => r.status === 'error' && r.kind !== 'error').length; // lines of the file in error are already in the preview
  showStatus(writeFailed ? 'error' : 'success', `Import terminé : ${c.created} créée(s), ${c.updated} mise(s) à jour, ${c.archived} retirée(s)${c.errors ? `, ${c.errors} en erreur` : ''}.`);
  partnerImportPhotos(writer, photoJobs);
}

function partnerImportReport() {
  partnerImportDownload(`rapport-import-${new Date().toISOString().slice(0, 10)}.csv`, pimpSvc().resultsCsv(pimp.results || []));
}

/* Photo links → the queue (/api/media-import downloads them); progress read from the queue. */
async function partnerImportPhotos(writer, jobs) {
  const host = document.getElementById('pimp-photos');
  const urls = (jobs || []).reduce((n, j) => n + j.urls.length, 0);
  if (!host || !urls) return;
  host.innerHTML = `<p class="pimp-note" id="pimp-photos-progress">Préparation de ${pimpN(urls)} photo(s)…</p>`;
  const queued = await pimpSvc().queuePhotoJobs(writer, jobs);
  pimp.photoListings = jobs.map(j => j.listingId);
  const el = () => document.getElementById('pimp-photos-progress');
  if (!queued) { if (el()) el().textContent = 'Les photos n’ont pas pu être préparées : ajoutez-les depuis chaque annonce.'; return; }
  try { fetch('https://zfind.online/api/media-import', { method: 'POST', mode: 'no-cors', keepalive: true }).catch(() => null); } catch (_) { /* nudge only */ }
  for (let round = 0; round < 12; round++) {
    const sb = window.ZFindServices.supabaseClient.getSupabaseClient();
    const res = await Promise.resolve(sb.from('zfind_media_import_queue').select('status').in('listing_id', pimp.photoListings.slice(0, 300))).catch(() => ({ error: true }));
    if (!el() || !res || res.error) return;
    const rows = res.data || [];
    const n = s => rows.filter(r => r.status === s).length;
    const pending = n('pending') + n('processing');
    el().textContent = pending ? `Photos : ${pimpN(n('done'))} ajoutée(s), ${pimpN(pending)} en cours de téléchargement${n('failed') ? `, ${pimpN(n('failed'))} introuvable(s)` : ''}. Vous pouvez quitter cette page : le téléchargement continue.` : `Photos : ${pimpN(n('done'))} ajoutée(s)${n('failed') ? `, ${pimpN(n('failed'))} introuvable(s) (lien expiré ?)` : ''}.`;
    if (!pending) return;
    await new Promise(r => setTimeout(r, 5000));
    if (round % 3 === 2) { try { fetch('https://zfind.online/api/media-import', { method: 'POST', mode: 'no-cors', keepalive: true }).catch(() => null); } catch (_) { /* ignore */ } }
  }
}

/* ---------------- « Soumettre toutes les annonces prêtes » ---------------- */
function partnerImportSubmitHtml() {
  const n = pimp.listingIds.length;
  if (pimp.submitResults) return partnerImportSubmitSummaryHtml();
  if (!n) return '';
  return `<div class="pimp-submit-offer"><div><strong>Prêtes à être publiées ?</strong> Les annonces importées restent en brouillon tant que vous ne les soumettez pas. Envoyez à Z Find, parmi les ${pimpN(n)} annonce${n > 1 ? 's' : ''} de ce fichier, celles qui sont complètes (commune, titre, description, prix, photo, mentions obligatoires) : les autres sont listées avec ce qui leur manque.</div>
    <button class="btn btn-primary" id="pimp-submit-all" onclick="partnerImportSubmitAll()">Soumettre toutes les annonces prêtes</button></div>`;
}

async function partnerImportSubmitAll() {
  const btn = document.getElementById('pimp-submit-all');
  if (btn) { btn.disabled = true; btn.textContent = 'Vérification…'; }
  const LS = window.ZFindServices.listingSubmission;
  pimp.submitResults = await LS.submitAllReady(pimp.listingIds, { listStatuses: ids => LS.listStatuses(ids), submit: id => LS.submitListing(id) },
    { onProgress: (done, total) => { if (btn) btn.textContent = `Envoi… ${done} / ${total}`; } });
  document.getElementById('pimp-submit').innerHTML = partnerImportSubmitSummaryHtml();
  const sent = pimp.submitResults.filter(r => r.outcome === 'submitted').length;
  showStatus(sent ? 'success' : 'error', sent ? `${sent} annonce(s) envoyée(s) à Z Find pour validation.` : 'Aucune annonce n’est encore prête : voir ce qui manque.');
}

function partnerImportSubmitSummaryHtml() {
  const LS = window.ZFindServices.listingSubmission;
  const results = pimp.submitResults || [];
  const refOf = id => { const r = (pimp.results || []).find(x => x.listingId === id); return r ? r.reference || '—' : '—'; };
  const rows = results.filter(r => r.outcome !== 'submitted');
  return `<div class="pimp-submit-summary" id="pimp-submit-summary">
    <p><strong>${pimpEsc(LS.summarizeSubmitAll(results))}.</strong> Z Find vérifie les annonces soumises avant de les publier ; vous recevez un e-mail si l’une d’elles vous est renvoyée.</p>
    ${rows.length ? `<div class="pimp-scroll"><table class="pimp-table" id="pimp-submit-table"><thead><tr><th>Référence</th><th>Résultat</th><th>Pourquoi</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="nowrap">${pimpEsc(refOf(r.listingId))}</td><td><span class="status-badge ${(PIMP_SUBMIT_TONE[r.outcome] || [])[1] || 'tone-draft'}">${pimpEsc((PIMP_SUBMIT_TONE[r.outcome] || [r.outcome])[0])}</span></td><td>${pimpEsc(r.reason)}</td><td>${r.outcome === 'blocked' ? partnerImportOpenLink(r.listingId) : ''}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
  </div>`;
}

function partnerImportOpenLink(listingId) {
  const r = (pimp.results || []).find(x => x.listingId === listingId && x.propertyId);
  return r ? `<a class="pimp-link" onclick="openDetail('property','${pimpEsc(r.propertyId)}')">Compléter</a>` : '';
}
