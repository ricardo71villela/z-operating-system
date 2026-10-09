/* ============================================================
   Z FIND ADMIN — app.js
   ============================================================
   Sprint 1.7. Every data operation goes through window.ZFindServices
   (admin.js / auth.js) — this file never calls Supabase directly.
   ============================================================ */

const LOCALES = ['en', 'pt', 'fr'];
const adminState = { view: 'dashboard', id: null, locale: 'fr', zonesCache: null, partnersCache: null };

/** Toast notification — replaces the previous static status box.
    Pattern adapted from Z Imobiliária's own Admin (real, working code).
    Same signature as before (kind, text), so every existing call
    site needs zero changes. */
function showStatus(kind, text) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  host.appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2800);
}

/** Promise-based confirm modal — replaces browser confirm(), which
    looks unprofessional and can't be styled. Pattern adapted from
    Z Imobiliária's admin. Usage: if (await askConfirm('Title','Body')) {...} */
function askConfirm(title, body, okLabel) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-overlay');
    overlay.innerHTML = `
      <div class="confirm-box">
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(body)}</p>
        <div class="actions">
          <button class="btn" id="confirm-cancel">Annuler</button>
          <button class="btn btn-danger" id="confirm-ok">${escapeHtml(okLabel || 'Confirmer')}</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
    const cleanup = (result) => { overlay.classList.add('hidden'); overlay.innerHTML = ''; resolve(result); };
    document.getElementById('confirm-ok').onclick = () => cleanup(true);
    document.getElementById('confirm-cancel').onclick = () => cleanup(false);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
  });
}

/* ---------------- Auth gate ---------------- */
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const result = await window.ZFindServices.auth.signIn(email, password);
  if (result.error) { errEl.textContent = 'Connexion impossible. Vérifiez l’e-mail et le mot de passe.'; return; }
  await checkAdminAccess();
}
async function handleSignOut() {
  await window.ZFindServices.auth.signOut();
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
}
async function checkAdminAccess() {
  const profile = await window.ZFindServices.auth.getCurrentProfile();
  if (profile.error || !profile.data || profile.data.role !== 'admin') {
    document.getElementById('login-error').textContent = 'Ce compte n’a pas accès à l’Admin.';
    await window.ZFindServices.auth.signOut();
    return false;
  }
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  navigateAdmin('dashboard');
  return true;
}
async function initAdmin() {
  const session = await window.ZFindServices.auth.getSession();
  if (session.data && session.data.session) await checkAdminAccess();
}

/* ---------------- Router ---------------- */
function navigateAdmin(view, id) {
  adminState.view = view;
  adminState.id = id || null;
  document.querySelectorAll('#sidebar a[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  render();
}
function render() {
  const main = document.getElementById('main');
  main.innerHTML = '';
  const routes = {
    dashboard: renderDashboard,
    properties: adminState.id ? renderPropertyEdit : renderPropertiesList,
    developments: adminState.id ? renderDevelopmentEdit : renderDevelopmentsList,
    partners: adminState.id ? renderPartnerEdit : renderPartnersList,
    leads: adminState.id ? renderLeadDetail : renderLeadsList,
    agencias: adminState.id ? renderAgenciaDetail : renderAgenciasList,
    inscricoes: renderSignupsList,
    importar: renderImport,
    estimacoes: renderEstimationsList,
    avaliacoes: renderReviewsList,
    conformite: adminState.id ? renderComplianceDetail : renderComplianceQueue, // compliance.js
  };
  (routes[adminState.view] || renderDashboard)();
}

/* ---------------- Dashboard ---------------- */
const OPS_LINKS = [
  ['Site public', 'https://zfind.online'],
  ['Supabase — tables', 'https://supabase.com/dashboard/project/dcdggqyazdddrfuzwavw/editor'],
  ['GitHub — Actions (collecte, surveillance)', 'https://github.com/ricardo71villela/z-operating-system/actions'],
  ['Vercel — déploiements et Analytics', 'https://vercel.com/zoperatingsystem/z-find-platform'],
  ['Resend — e-mails envoyés', 'https://resend.com/emails']
];
const OPS_ROUTINE = [
  ['Chaque jour', [
    'Nouvelles inscriptions : vérifier la carte professionnelle et le SIRET, puis Valider ou Refuser.',
    'Annonces à vérifier (envoyées par les agences) : contrôler la conformité et publier.',
    'Mentions obligatoires à valider (annonces en France) : Valider, ou Refuser avec un motif ; sans validation, la publication est refusée.',
    'Fichier d’annonces envoyé par une agence (Poliris / SeLoger, CSV, Excel) : Importer des annonces — création en brouillon ou mise à jour de son portefeuille, après aperçu des changements.',
    'Estimations : confier à une agence les propriétaires qui ont accepté d’être contactés (eux seuls), le jour même.',
    'Demandes sans réponse depuis 24 h : l’agence a déjà reçu une relance automatique ; sinon, l’appeler.',
    'Avis à modérer : Publier ou Refuser en moins de 48 h (dans l’Admin ou depuis l’e-mail).',
    'Pas d’e-mail d’échec de la surveillance de 7 h = le site fonctionne.'
  ]],
  ['Chaque semaine', [
    'Lundi : la collecte des agences tourne seule (GitHub Actions) et met la base à jour.',
    'Agences : choisir un segment (pays, département, réseau), exporter et préparer la campagne.',
    'Vercel Analytics : visiteurs et pages les plus vues. Resend : e-mails non distribués.'
  ]],
  ['Chaque mois', [
    'Taux du simulateur de crédit : mettre à jour avant la date de validité (la surveillance prévient).',
    'Belgique : télécharger le nouveau fichier BCE et lancer la collecte belge.'
  ]]
];
const TYPE_LABELS = { agency: 'Agence', network_agency: 'Agence de réseau', network_hq: 'Siège de réseau', independent: 'Mandataire / indépendant' };

async function renderDashboard() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Tableau de bord</div>
    <div class="cards" id="dash-cards">Chargement…</div>
    <h3 class="section-title">Activité</h3>
    <div class="cards" id="ops-cards">Chargement…</div>
    <div class="ops-grid">
      <div class="detail-panel"><h4>Routine</h4>${OPS_ROUTINE.map(([when, items]) => `<p class="ops-when">${escapeHtml(when)}</p><ul class="ops-list">${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`).join('')}</div>
      <div class="detail-panel"><h4>Outils</h4><ul class="ops-list">${OPS_LINKS.map(([l, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${escapeHtml(l)}</a></li>`).join('')}</ul>
        <h4 style="margin-top:16px">Base d’agences par pays et type</h4><div id="ops-agencias">Chargement…</div></div>
    </div>`);
  const result = await window.ZFindServices.admin.getDashboardCounts();
  const cardsEl = document.getElementById('dash-cards');
  if (result.error) { cardsEl.textContent = 'Impossible de charger les totaux.'; }
  else {
    const c = result.data;
    const DASH_FR = { properties: 'Biens', developments: 'Programmes neufs', partners: 'Partenaires', leads: 'Demandes' };
    cardsEl.innerHTML = ['properties', 'developments', 'partners', 'leads'].map(k =>
      `<div class="card"><div class="n">${c[k] == null ? '—' : c[k]}</div><div class="l">${DASH_FR[k]}</div></div>`
    ).join('');
  }
  await loadOperationsOverview();
  await loadReviewQueueCard();
  await loadComplianceQueueCard();
  await loadFollowupCards();
}

/* Estimation requests to handle and enquiries unanswered for 24 h (migration 20261004200000). */
async function loadFollowupCards() {
  const ops = document.getElementById('ops-cards');
  const svc = window.ZFindServices.followup;
  if (!ops || !svc) return;
  const [est, late] = await Promise.all([svc.estimations('open'), svc.leads('overdue')]);
  const html = [];
  if (!late.error) {
    const n = (late.data || []).length;
    html.push(`<div class="card${n ? ' card-warn' : ''}" id="card-leads-late" onclick="openLeads('overdue')" style="cursor:pointer"><div class="n">${fmtN(n)}</div><div class="l">Demandes sans réponse depuis 24 h</div></div>`);
  }
  if (!est.error) {
    const rows = est.data || [];
    const owners = rows.filter(x => x.mode === 'owner' && x.agency_consent && x.status === 'new').length;
    html.push(`<div class="card${rows.length ? ' card-warn' : ''}" id="card-estimations" onclick="navigateAdmin('estimacoes')" style="cursor:pointer"><div class="n">${fmtN(rows.length)}</div><div class="l">Estimations à traiter${owners ? ` · ${fmtN(owners)} à confier à une agence` : ''}</div></div>`);
  }
  const anchor = document.getElementById('card-review');
  if (anchor) anchor.insertAdjacentHTML('afterend', html.join('')); else ops.insertAdjacentHTML('afterbegin', html.join(''));
}

/* « Annonces à vérifier »: listings sent by the agencies (and programmes), waiting for the Admin. */
async function loadReviewQueueCard() {
  const ops = document.getElementById('ops-cards');
  if (!ops) return;
  const res = await window.ZFindServices.admin.listProperties();
  if (res.error) return;
  const all = res.data || [];
  const devs = await window.ZFindServices.admin.listDevelopments();
  const allDevs = devs.error ? [] : (devs.data || []);
  const devPending = allDevs.filter(d => propStatus(d) === 'pending_review').length;
  const pending = all.filter(p => propStatus(p) === 'pending_review').length;
  const ready = all.filter(p => propStatus(p) === 'ready').length + allDevs.filter(d => propStatus(d) === 'ready').length;
  const open = pending === 0 && devPending > 0 ? 'openDevReviewQueue()' : 'openReviewQueue()';
  ops.insertAdjacentHTML('afterbegin', `<div class="card${pending + devPending ? ' card-warn' : ''}" id="card-review" onclick="${open}" style="cursor:pointer"><div class="n">${fmtN(pending + devPending)}</div><div class="l">Annonces à vérifier${devPending ? ` (dont ${fmtN(devPending)} programme${devPending > 1 ? 's' : ''})` : ''}${ready ? ` · ${fmtN(ready)} prêtes à publier` : ''}</div></div>`);
}

const fmtN = n => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));

async function loadOperationsOverview() {
  const ops = document.getElementById('ops-cards');
  const agEl = document.getElementById('ops-agencias');
  const svc = window.ZFindServices.prospection;
  const res = svc ? await svc.overview() : { error: { message: 'service missing' } };
  if (res.error) {
    ops.innerHTML = '<div class="status-msg error">Impossible de charger les indicateurs d’activité (la migration 20261003220000 est-elle appliquée ?).</div>';
    agEl.textContent = '—';
    return;
  }
  const o = res.data || {};
  const a = o.agencias || {}, r = o.reviews || {}, al = o.alerts || {}, l = o.leads || {}, sg = o.signups || {}, seats = sg.founder_seats || {};
  const card = (n, label, view, warn) => `<div class="card${warn ? ' card-warn' : ''}"${view ? ` onclick="navigateAdmin('${view}')" style="cursor:pointer"` : ''}><div class="n">${fmtN(n)}</div><div class="l">${escapeHtml(label)}</div></div>`;
  ops.innerHTML = [
    card(sg.pending, 'Inscriptions à vérifier', 'inscricoes', sg.pending > 0),
    card(l.new, 'Demandes à traiter', 'leads', l.new > 0),
    card(l.last_7_days, 'Demandes (7 jours)', 'leads'),
    card(r.pending, 'Avis à modérer', 'avaliacoes', r.pending > 0),
    card(al.active, `Alertes actives (${fmtN(al.pending)} à confirmer)`),
    card(a.active, 'Agences dans la base', 'agencias'),
    card(a.with_email, 'Agences avec e-mail', 'agencias'),
    card(a.outreach_allowed, 'Prospection par e-mail autorisée', 'agencias'),
    `<div class="card" onclick="navigateAdmin('inscricoes')" style="cursor:pointer"><div class="n seats">${['FR', 'BE', 'LU'].map(c => `${c} ${fmtN(seats[c] || 0)}/${founderSeatsPerCountry()}`).join(' · ')}</div><div class="l">Places Fondateur (1re vague) · promoteurs ${fmtN(seats.developers || 0)}/${founderDevelopers()}</div></div>`
  ].join('');
  const rows = o.agencias_by_country_type || [];
  agEl.innerHTML = rows.length ? `<table class="compact"><thead><tr><th>Pays</th><th>Type</th><th>Total</th><th>Avec e-mail</th><th>Prospection</th></tr></thead><tbody>${
    rows.map(x => `<tr><td>${x.country}</td><td>${escapeHtml(TYPE_LABELS[x.type] || x.type)}</td><td>${fmtN(x.n)}</td><td>${fmtN(x.with_email)}</td><td>${fmtN(x.outreach)}</td></tr>`).join('')
  }</tbody></table><p class="muted">Dernière collecte : ${a.last_ingest ? new Date(a.last_ingest).toLocaleString('fr-FR') : '—'}</p>` : '<p class="muted">Base encore vide.</p>';
}

/* ---------------- Inscriptions (self sign-up) ---------------- */
const SIGNUP_STATUS = { pending: 'À vérifier', verified: 'Vérifiée', rejected: 'Refusée' };
const SIGNUP_PLAN = { founder: 'Fondateur', founder_developer: 'Promoteur fondateur', standard: 'Standard' };
function founderSeatsPerCountry() { const p = window.ZFindServices.proOffer && window.ZFindServices.proOffer.PRICES; return p ? p.founderSeatsPerCountry : 50; }
function founderDevelopers() { const p = window.ZFindServices.proOffer && window.ZFindServices.proOffer.PRICES; return p ? p.founderDevelopers : 10; }

async function renderSignupsList() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Inscriptions</div>
    <p class="muted" style="margin:-6px 0 14px">Agences et promoteurs inscrits par eux-mêmes. Avant de valider : vérifier le SIRET / n° d’entreprise et la carte professionnelle. Les annonces ne deviennent publiques qu’après la vérification de chaque annonce, comme toujours.</p>
    <div class="toolbar">
      <select id="sg-status" onchange="loadSignupsList()">
        <option value="pending">À vérifier</option><option value="verified">Vérifiées</option><option value="rejected">Refusées</option><option value="">Toutes</option>
      </select>
    </div>
    <table><thead><tr><th>Date</th><th>Qui</th><th>Immatriculation</th><th>Carte</th><th>Offre</th><th>Demandes</th><th>Statut</th><th>Décision</th></tr></thead><tbody id="sg-tbody"><tr><td colspan="8">Chargement…</td></tr></tbody></table>`);
  await loadSignupsList();
}

function signupRegistryCell(x) {
  if (x.country === 'FR' && x.establishment_id) {
    return `SIRET <a href="https://annuaire-entreprises.data.gouv.fr/etablissement/${encodeURIComponent(x.establishment_id)}" target="_blank" rel="noopener">${escapeHtml(x.establishment_id)}</a>`;
  }
  return `${escapeHtml(x.country)} ${escapeHtml(x.company_id || '—')}`;
}

/* Founder rule: fewer than founderMinLeads enquiries during the 3 free months → 3 more months free. */
function signupLeadsCell(x, c) {
  if (!c) return '<span class="muted">—</span>';
  const p = window.ZFindServices.proOffer && window.ZFindServices.proOffer.PRICES;
  const min = p ? p.founderMinLeads : 5;
  const freeEnds = new Date(new Date(x.created_at).setMonth(new Date(x.created_at).getMonth() + 3));
  const ended = freeEnds <= new Date();
  const flag = x.plan === 'founder' && ended && Number(c.leads_free_period) < min
    ? `<br><span class="tag tag-draft">+3 mois offerts</span>` : '';
  return `${fmtN(c.leads_free_period)} en 3 mois<br><span class="muted">${fmtN(c.leads_total)} au total · gratuit jusqu’au ${freeEnds.toLocaleDateString('fr-FR')}</span>${flag}`;
}

async function loadSignupsList() {
  const tbody = document.getElementById('sg-tbody');
  const status = document.getElementById('sg-status').value;
  const [res, counts] = await Promise.all([
    window.ZFindServices.prospection.signups(status || null),
    window.ZFindServices.prospection.signupLeadCounts()
  ]);
  const leadsBy = new Map(((counts && counts.data) || []).map(c => [c.signup_id, c]));
  if (res.error) { tbody.innerHTML = '<tr><td colspan="8">Impossible de charger les inscriptions (la migration 20261004110000 est-elle appliquée ?).</td></tr>'; return; }
  const rows = res.data || [];
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8" class="muted">Aucune inscription dans cet état.</td></tr>'; return; }
  tbody.innerHTML = rows.map(x => `
    <tr data-signup="${x.id}">
      <td>${new Date(x.created_at).toLocaleString('fr-FR')}</td>
      <td><strong>${escapeHtml(x.trade_name || x.legal_name)}</strong><br><span class="muted">${x.role === 'promoter' ? 'Promoteur' : 'Agence'} · ${escapeHtml(x.legal_name)}<br>${escapeHtml([x.address, x.postcode, x.city].filter(Boolean).join(' '))}<br>${escapeHtml(x.email)}${x.phone ? ' · ' + escapeHtml(x.phone) : ''}</span></td>
      <td>${signupRegistryCell(x)}${x.agencia_id ? '<br><span class="muted">dans la base d’agences</span>' : '<br><span class="muted">hors base</span>'}</td>
      <td>${escapeHtml(x.card_number)}${x.card_authority ? '<br><span class="muted">' + escapeHtml(x.card_authority) + '</span>' : ''}</td>
      <td>${escapeHtml(SIGNUP_PLAN[x.plan] || x.plan)}${x.founder_wave ? ' · ' + (x.founder_wave === 1 ? '1re' : x.founder_wave + 'e') + ' vague' : ''}</td>
      <td>${signupLeadsCell(x, leadsBy.get(x.id))}</td>
      <td><span class="tag tag-${x.status === 'verified' ? 'active' : x.status === 'rejected' ? 'inactive' : 'draft'}">${escapeHtml(SIGNUP_STATUS[x.status] || x.status)}</span>${x.review_note ? '<br><span class="muted">' + escapeHtml(x.review_note) + '</span>' : ''}</td>
      <td class="sg-actions">
        <input type="text" id="sg-note-${x.id}" placeholder="Note (facultative)" maxlength="500">
        ${x.status !== 'verified' ? `<button class="btn btn-primary" onclick="reviewSignup('${x.id}','verified')">Valider</button>` : ''}
        ${x.status !== 'rejected' ? `<button class="btn btn-danger" onclick="reviewSignup('${x.id}','rejected')">Refuser</button>` : ''}
      </td>
    </tr>`).join('');
}

async function reviewSignup(id, decision) {
  if (decision === 'rejected') {
    const ok = await askConfirm('Refuser cette inscription ?', 'Le compte du partenaire devient inactif. Vous pourrez le valider plus tard.', 'Refuser');
    if (!ok) return;
  }
  const noteEl = document.getElementById('sg-note-' + id);
  const res = await window.ZFindServices.prospection.reviewSignup(id, decision, noteEl ? noteEl.value.trim() : '');
  if (res.error) { showStatus('error', 'Impossible d’enregistrer la décision.'); return; }
  showStatus('success', decision === 'verified' ? 'Inscription validée.' : 'Inscription refusée.');
  loadSignupsList();
}

/* ---------------- Importer des annonces (« Nous chargeons pour vous ») ---------------- */
/* The agency sends the export of its software (Poliris / SeLoger
   annonces.csv or its ZIP, CSV, Excel). First import: every row becomes
   a property + DRAFT listing for that agency; next imports keep its
   portfolio in step (services/listingImport planSync / applyPlan): what
   changed is updated, sold / let listings can be archived. A preview of
   every change is shown and must be confirmed. Publication stays the
   usual review. */
const importState = { table: null, map: {}, rows: [], fileName: '', running: false, portfolio: null, portfolioFor: null, plan: null, agencyId: '', fullSync: false, seq: 0 };
const IMPORT_KIND = { create: ['Créée (brouillon)', 'active'], update: ['Mise à jour', 'review'], archive: ['Retirée (archivée)', 'inactive'], unchanged: ['Inchangée', 'draft'], error: ['Erreur', 'late'] };

async function renderImport() {
  const main = document.getElementById('main');
  Object.assign(importState, { table: null, rows: [], map: {}, plan: null, portfolio: null, portfolioFor: null, agencyId: '', fullSync: false });
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Importer des annonces</div>
    <p class="muted" style="margin:-6px 0 14px;max-width:880px">« Nous chargeons pour vous » : l’agence envoie l’export de son logiciel — format <strong>Poliris / SeLoger</strong> (annonces.csv, ou le ZIP avec les photos : Hektor, Apimo, Netty, AC3, La Boîte Immo, Périclès…), CSV ou Excel. Au premier import, chaque annonce devient un bien avec une annonce <strong>en brouillon</strong> de cette agence. Les imports suivants <strong>mettent à jour son portefeuille</strong> (même référence d’agence) : prix, surfaces, textes, nouvelles photos et mentions obligatoires ; les annonces absentes du fichier peuvent être retirées (archivées, jamais supprimées). Rien n’est publié automatiquement et vous voyez chaque changement avant de confirmer. Les liens des photos sont téléchargés et ajoutés aux annonces (40 max. par annonce) ; sinon, l’agence les ajoute dans son espace.</p>
    <div class="toolbar wrap" id="imp-form">
      <select id="imp-partner" aria-label="Agence"><option value="">Chargement des agences…</option></select>
      <select id="imp-country" aria-label="Pays"><option value="FR">France</option><option value="BE">Belgique</option><option value="LU">Luxembourg</option></select>
      <input type="file" id="imp-file" accept=".csv,.txt,.zip,.xlsx,.xls,.ods" aria-label="Fichier">
      <button class="btn btn-primary" id="imp-read" onclick="importReadFile()">Lire le fichier</button>
      <button class="btn" id="imp-template" onclick="importDownloadTemplate()" title="Toutes les colonnes reconnues, avec un exemple">Télécharger le modèle CSV</button>
    </div>
    <div id="imp-mapping"></div>
    <div id="imp-preview"></div>
    <div id="imp-plan"></div>
    <div id="imp-results"></div>`);
  const res = await window.ZFindServices.admin.listPartners();
  const sel = document.getElementById('imp-partner');
  if (!sel) return;
  const partners = (res.data || []).slice().sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || String(a.name).localeCompare(String(b.name)));
  sel.innerHTML = '<option value="">— Choisir l’agence —</option>' + partners.map(p =>
    `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.status && p.status !== 'active' ? ' (' + escapeHtml(PARTNER_STATUS_FR[p.status] || p.status) + ')' : ''}</option>`).join('');
  sel.onchange = () => { importState.portfolio = null; importState.portfolioFor = null; renderImportPreview(); };
  document.getElementById('imp-country').onchange = renderImportPreview;
}

function importDownload(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function importDownloadTemplate() { importDownload('modele-import-zfind.csv', window.ZFindServices.listingImport.templateCsv()); }

async function importReadFile() {
  const input = document.getElementById('imp-file');
  const file = input && input.files && input.files[0];
  if (!file) { showStatus('error', 'Choisissez d’abord le fichier de l’agence.'); return; }
  const svc = window.ZFindServices.listingImport;
  let table;
  try { table = await svc.readFile(file); }
  catch (e) { showStatus('error', /annonces\.csv/.test(e.message) ? 'Le ZIP ne contient pas de fichier annonces.csv.' : 'Impossible de lire le fichier (Poliris, CSV, ZIP, XLSX, XLS ou ODS).'); return; }
  if (!table.headers.length || !table.records.length) { showStatus('error', 'Le fichier ne contient aucune ligne d’annonce.'); return; }
  importState.table = table;
  importState.fileName = file.name;
  importState.map = svc.mapFor(table);
  importState.fullSync = table.format === 'poliris'; // Poliris files always carry the whole portfolio (« annule et remplace »)
  importState.agencyId = (table.agencyIds || []).length > 1 ? table.agencyIds[0] : '';
  importState.plan = null;
  document.getElementById('imp-results').innerHTML = '';
  renderImportMapping();
  renderImportPreview();
}

function importExample(header) {
  if (!header || !importState.table) return '';
  const r = importState.table.records.find(x => String(x[header] || '').trim());
  return r ? String(r[header]).slice(0, 80) : '';
}

function renderImportMapping() {
  const { table, map } = importState;
  const svc = window.ZFindServices.listingImport;
  const host = document.getElementById('imp-mapping');
  if (table.format === 'poliris') {
    const ids = table.agencyIds || [];
    host.innerHTML = `
      <div class="detail-panel imp-panel" id="imp-format">
        <h4>1. Fichier « ${escapeHtml(importState.fileName)} » — format Poliris / SeLoger reconnu</h4>
        <p>${fmtN(table.records.length)} annonces · version du format : <strong>${escapeHtml(table.version || 'non indiquée')}</strong> · ${fmtN(table.columnCount)} colonnes${table.invalidLines ? ` · <span class="imp-bad">${fmtN(table.invalidLines)} ligne(s) illisible(s) ignorée(s)</span>` : ''}${table.zipEntry ? ` · ZIP : ${escapeHtml(table.zipEntry)} et ${fmtN(table.zipPhotoCount)} photo(s)` : ''}</p>
        <p class="muted">Colonnes lues à leur position officielle : référence (2), type d’annonce et de bien (3, 4, 181), localisation (5–8, 108–109), prix / loyer (11), honoraires (15, 302–303, 306–307), surfaces et pièces (16–19), titre et descriptif (20–21), charges (23), DPE et GES (176–179, 326–328), copropriété (258–262), dépôt de garantie (161), meublé (26), photos (85–93, 164–174, 264–273). Les autres colonnes sont ignorées.</p>
        ${ids.length > 1 ? `<div class="toolbar"><label for="imp-agency-id">Fichier groupé : identifiant agence du logiciel</label><select id="imp-agency-id" onchange="importSetAgencyId(this.value)">${ids.map(id => `<option value="${escapeHtml(id)}"${id === importState.agencyId ? ' selected' : ''}>${escapeHtml(id)} (${fmtN(table.records.filter(r => r.agencyId === id).length)} annonces)</option>`).join('')}</select></div>` : ids.length === 1 ? `<p class="muted">Identifiant agence dans le logiciel : ${escapeHtml(ids[0])}</p>` : ''}
      </div>`;
    return;
  }
  const options = sel => '<option value="">— ne pas utiliser —</option>' + table.headers.map(h => `<option value="${escapeHtml(h)}"${h === sel ? ' selected' : ''}>${escapeHtml(h)}</option>`).join('');
  const rowsOf = group => svc.FIELDS.filter(f => f[3] === group).map(([key, label]) => `<tr><td>${escapeHtml(label)}</td><td><select data-field="${key}" onchange="importSetMap('${key}', this.value)">${options(map[key])}</select></td><td class="muted" id="imp-ex-${key}">${escapeHtml(importExample(map[key]))}</td></tr>`).join('');
  host.innerHTML = `
    <div class="detail-panel imp-panel">
      <h4>1. Colonnes du fichier « ${escapeHtml(importState.fileName)} » (${fmtN(table.records.length)} lignes)</h4>
      <p class="muted">Les colonnes reconnues sont déjà choisies. Complétez ce qui manque ; l’exemple est la première valeur de la colonne. Pour les mentions obligatoires, utilisez de préférence les noms de colonnes du modèle CSV.</p>
      <table class="compact" id="imp-map-table"><thead><tr><th>Champ Z Find</th><th>Colonne du fichier</th><th>Exemple</th></tr></thead>
      <tbody><tr class="imp-group"><th colspan="3">Annonce</th></tr>${rowsOf('base')}<tr class="imp-group"><th colspan="3">Mentions obligatoires (France)</th></tr>${rowsOf('mentions')}</tbody></table>
    </div>`;
}

function importSetMap(key, header) {
  if (header) importState.map[key] = header; else delete importState.map[key];
  const ex = document.getElementById('imp-ex-' + key);
  if (ex) ex.textContent = importExample(header);
  renderImportPreview();
}
function importSetAgencyId(id) { importState.agencyId = id; renderImportPreview(); }

function importPriceLabel(row) {
  if (!(row.price > 0)) return '—';
  return fmtN(row.price) + ' €' + (row.transaction === 'rent' ? ' /mois' : '');
}
function importLineOffset() { return importState.table && importState.table.format === 'poliris' ? 1 : 2; }

function renderImportPreview() {
  const host = document.getElementById('imp-preview');
  if (!host || !importState.table) return;
  const svc = window.ZFindServices.listingImport;
  const country = document.getElementById('imp-country').value;
  const rows = importState.table.records.map(r => svc.normalizeRow(r, importState.map));
  importState.rows = rows;
  const inScope = rows.map((r, i) => [r, i]).filter(([r]) => !importState.agencyId || !r.agencyId || r.agencyId === importState.agencyId);
  const ready = inScope.filter(([r]) => !r.errors.length).length;
  const shown = inScope.slice(0, 25);
  const off = importLineOffset();
  host.innerHTML = `
    <div class="detail-panel imp-panel">
      <h4>2. Aperçu du fichier</h4>
      <p id="imp-summary"><strong>${fmtN(ready)}</strong> sur ${fmtN(inScope.length)} lignes lisibles${inScope.length - ready ? ` · <span class="imp-bad">${fmtN(inScope.length - ready)} ${inScope.length - ready > 1 ? 'ne seront pas importées' : 'ne sera pas importée'}</span>` : ''}${inScope.length > shown.length ? ` · seules les ${shown.length} premières sont affichées` : ''}.</p>
      <div class="imp-scroll"><table class="compact" id="imp-preview-table"><thead><tr><th>#</th><th>Référence</th><th>Bien</th><th>Prix</th><th>m²</th><th>Localisation</th><th>Titre</th><th>Mentions (France)</th><th>Remarques</th></tr></thead><tbody>
      ${shown.map(([r, i]) => { const comp = svc.complianceFor(r, country); return `<tr data-row="${i}"${r.errors.length ? ' class="imp-row-bad"' : ''}>
        <td>${i + off}</td>
        <td>${escapeHtml(r.reference || '—')}</td>
        <td>${escapeHtml(r.subtype ? SUBTYPE_FR[r.subtype] || r.subtype : '—')}${r.typology ? ' · ' + escapeHtml(r.typology) : ''}<br><span class="muted">${r.transaction === 'rent' ? 'Location' : 'Vente'}</span></td>
        <td class="nowrap">${importPriceLabel(r)}</td>
        <td>${r.areaSqm != null ? fmtN(r.areaSqm) : '—'}</td>
        <td>${escapeHtml([r.postcode, r.city].filter(Boolean).join(' ') || '—')}</td>
        <td>${escapeHtml(r.title || '—')}</td>
        <td>${comp.applicable ? `<span class="${comp.complete ? 'imp-ok' : 'imp-warn'}">${escapeHtml(comp.text)}</span>` : '<span class="muted">—</span>'}</td>
        <td>${r.errors.map(e => `<span class="imp-bad">${escapeHtml(e)}</span>`).join('<br>')}${r.errors.length && r.warnings.length ? '<br>' : ''}<span class="muted">${r.warnings.map(escapeHtml).join('<br>')}</span></td>
      </tr>`; }).join('')}
      </tbody></table></div>
      <p class="muted" style="margin-top:8px">La colonne # est la ligne dans le fichier${off === 2 ? ' (la ligne 1 contient les titres)' : ''}.</p>
    </div>`;
  refreshImportPlan();
}

/* Compares the file with the agency’s portfolio (read only) and shows what would change. */
async function refreshImportPlan() {
  const host = document.getElementById('imp-plan');
  if (!host || !importState.table) return;
  const seq = ++importState.seq;
  const partnerSel = document.getElementById('imp-partner');
  const partnerId = partnerSel && partnerSel.value;
  if (!partnerId) {
    importState.plan = null;
    host.innerHTML = `<div class="detail-panel imp-panel"><h4>3. Changements prévus</h4><p class="muted" id="imp-plan-wait">Choisissez l’agence pour comparer le fichier à son portefeuille sur Z Find.</p><div class="toolbar"><button class="btn btn-primary" id="imp-run" disabled>Confirmer et appliquer</button></div></div>`;
    return;
  }
  const svc = window.ZFindServices.listingImport;
  const country = document.getElementById('imp-country').value;
  if (importState.portfolioFor !== partnerId) {
    host.innerHTML = '<div class="detail-panel imp-panel"><h4>3. Changements prévus</h4><p class="muted">Lecture du portefeuille de l’agence…</p></div>';
    const res = await svc.loadPortfolio(partnerId);
    if (seq !== importState.seq) return;
    if (res.error) { host.innerHTML = '<div class="detail-panel imp-panel"><h4>3. Changements prévus</h4><p class="imp-bad">Impossible de lire les annonces actuelles de l’agence. Réessayez dans un instant.</p></div>'; return; }
    importState.portfolio = res.data;
    importState.portfolioFor = partnerId;
  }
  // Stored mandatory information of the listings the file matches (France), to compare.
  const refs = new Set(importState.rows.filter(r => r.reference && svc.complianceFor(r, country).applicable).map(r => String(r.reference).trim().toLowerCase()));
  const toRead = importState.portfolio.filter(e => refs.has(e.refKey) && e.listing && e.compliance === null);
  if (toRead.length && window.ZFindServices.listingCompliance) await svc.loadComplianceFor(toRead, window.ZFindServices.listingCompliance);
  if (seq !== importState.seq) return;
  importState.plan = svc.planSync(importState.rows, importState.portfolio, { country, fullSync: importState.fullSync, agencyId: importState.agencyId, lineOffset: importLineOffset() });
  renderImportPlan();
}

function importToggleFullSync(on) { importState.fullSync = !!on; refreshImportPlan(); }

function renderImportPlan() {
  const host = document.getElementById('imp-plan');
  const plan = importState.plan;
  if (!host || !plan) return;
  const svc = window.ZFindServices.listingImport;
  const partnerSel = document.getElementById('imp-partner');
  const partnerName = partnerSel.options[partnerSel.selectedIndex].text;
  const k = plan.counts;
  const card = (id, n, label, tone) => `<div class="card${tone && n ? ' ' + tone : ''}" id="imp-count-${id}"><div class="n">${fmtN(n)}</div><div class="l">${label}</div></div>`;
  const LIMIT = 200;
  const more = (list) => list.length > LIMIT ? `<p class="muted">… et ${fmtN(list.length - LIMIT)} autres (toutes figurent dans le rapport après l’import).</p>` : '';
  const statusTag = st => `<span class="tag tag-${LISTING_STATUS_TAG[st] || 'draft'}">${escapeHtml(LISTING_STATUS_FR[st] || st)}</span>`;
  const compCell = c => (c && c.applicable !== false && c.text ? `<span class="${c.complete ? 'imp-ok' : 'imp-warn'}">${escapeHtml(c.text)}</span>` : '<span class="muted">—</span>');
  const total = k.create + k.update + k.archive;
  host.innerHTML = `
    <div class="detail-panel imp-panel" id="imp-plan-panel">
      <h4>3. Changements prévus pour ${escapeHtml(partnerName)}</h4>
      <label class="chk imp-full"><input type="checkbox" id="imp-full"${importState.fullSync ? ' checked' : ''} onchange="importToggleFullSync(this.checked)"> <span><strong>Import complet du portefeuille</strong> : retirer les annonces de cette agence absentes du fichier (vendues, louées ou retirées par l’agence).</span></label>
      <p class="muted imp-note">Seules les annonces de cette agence importées avec une référence sont concernées. Elles sont archivées, jamais supprimées ; les demandes reçues sont conservées.</p>
      ${plan.archiveBlocked ? `<p class="imp-warn">${escapeHtml(plan.archiveBlocked)}</p>` : ''}
      <div class="cards imp-counts">
        ${card('create', k.create, 'à créer (brouillon)', '')}
        ${card('update', k.update, 'à mettre à jour', '')}
        ${card('archive', k.archive, 'à retirer', 'card-warn')}
        ${card('error', k.error, 'en erreur', 'card-warn')}
        ${card('unchanged', k.unchanged, 'inchangées', '')}
      </div>
      ${k.ignored ? `<p class="muted">${fmtN(k.ignored)} ligne(s) d’un autre identifiant agence ignorée(s).</p>` : ''}
      ${plan.updates.length ? `<h5>À mettre à jour</h5><div class="imp-scroll"><table class="compact" id="imp-plan-updates"><thead><tr><th>Référence</th><th>Annonce</th><th>Changements</th><th>Mentions (France)</th></tr></thead><tbody>
        ${plan.updates.slice(0, LIMIT).map(u => `<tr data-ref="${escapeHtml(u.row.reference || '')}"><td>${escapeHtml(u.row.reference || '—')}</td><td>${escapeHtml(u.entry.listing.title || '—')}<br>${statusTag(u.entry.listing.status)}</td>
          <td><ul class="imp-changes">${u.changes.map(ch => `<li>${escapeHtml(svc.changeText(ch))}</li>`).join('')}${u.notes.filter(n => /^Annonce en ligne/.test(n)).map(n => `<li class="imp-warn">${escapeHtml(n)}</li>`).join('')}</ul></td>
          <td>${compCell(u.compliance)}</td></tr>`).join('')}</tbody></table></div>${more(plan.updates)}` : ''}
      ${plan.creates.length ? `<h5>À créer en brouillon</h5><div class="imp-scroll"><table class="compact" id="imp-plan-creates"><thead><tr><th>#</th><th>Référence</th><th>Bien</th><th>Prix</th><th>Localisation</th><th>Mentions (France)</th></tr></thead><tbody>
        ${plan.creates.slice(0, LIMIT).map(c => `<tr><td>${c.line}</td><td>${escapeHtml(c.row.reference || '—')}${c.notes.length ? `<br><span class="muted">${escapeHtml(c.notes.join(' · '))}</span>` : ''}</td><td>${escapeHtml(SUBTYPE_FR[c.row.subtype] || c.row.subtype)}${c.row.typology ? ' · ' + escapeHtml(c.row.typology) : ''} <span class="muted">${c.row.transaction === 'rent' ? 'location' : 'vente'}</span></td><td class="nowrap">${importPriceLabel(c.row)}</td><td>${escapeHtml([c.row.postcode, c.row.city].filter(Boolean).join(' ') || '—')}</td><td>${compCell(c.compliance)}</td></tr>`).join('')}</tbody></table></div>${more(plan.creates)}` : ''}
      ${plan.archives.length ? `<h5>À retirer (absentes du fichier)</h5><div class="imp-scroll"><table class="compact" id="imp-plan-archives"><thead><tr><th>Référence</th><th>Annonce</th><th>Statut actuel</th></tr></thead><tbody>
        ${plan.archives.slice(0, LIMIT).map(a => `<tr><td>${escapeHtml(a.reference)}</td><td>${escapeHtml(a.title || '—')}</td><td>${statusTag(a.status)}</td></tr>`).join('')}</tbody></table></div>${more(plan.archives)}` : ''}
      ${plan.errors.length ? `<h5>En erreur (non importées)</h5><div class="imp-scroll"><table class="compact" id="imp-plan-errors"><thead><tr><th>#</th><th>Référence</th><th>Problème</th></tr></thead><tbody>
        ${plan.errors.slice(0, LIMIT).map(e => `<tr><td>${e.line}</td><td>${escapeHtml(e.row.reference || '—')}</td><td class="imp-bad">${escapeHtml(e.message)}</td></tr>`).join('')}</tbody></table></div>${more(plan.errors)}` : ''}
      <div class="toolbar" style="margin-top:14px">
        <button class="btn btn-primary" id="imp-run" onclick="importRun()"${!total || importState.running ? ' disabled' : ''}>${total ? `Confirmer et appliquer (${[k.create ? `${fmtN(k.create)} création${k.create > 1 ? 's' : ''}` : '', k.update ? `${fmtN(k.update)} mise${k.update > 1 ? 's' : ''} à jour` : '', k.archive ? `${fmtN(k.archive)} retrait${k.archive > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')})` : 'Rien à appliquer'}</button>
        <span class="muted">Rien n’est publié : les nouvelles annonces restent en brouillon.</span>
      </div>
    </div>`;
}

async function importRun() {
  const plan = importState.plan;
  const partnerSel = document.getElementById('imp-partner');
  const partnerId = partnerSel.value;
  const partnerName = partnerSel.options[partnerSel.selectedIndex].text;
  const country = document.getElementById('imp-country').value;
  if (!plan || !partnerId || importState.running) return;
  const k = plan.counts;
  if (!(k.create + k.update + k.archive)) return;
  const ok = await askConfirm('Appliquer ces changements ?', `Pour ${partnerName} (${country}) : ${k.create} création(s) en brouillon, ${k.update} mise(s) à jour, ${k.archive} retrait(s) par archivage. Rien n’est publié ; les annonces déjà en ligne restent en ligne avec leurs nouvelles informations.`, 'Appliquer');
  if (!ok) return;
  importState.running = true;
  const btn = document.getElementById('imp-run');
  if (btn) btn.disabled = true;
  const svc = window.ZFindServices.listingImport;
  const total = k.create + k.update + k.archive;
  const out = document.getElementById('imp-results');
  out.innerHTML = `<div class="detail-panel imp-panel"><h4>4. Résultat</h4><p id="imp-progress">Import en cours… 0 / ${fmtN(total)}</p><div id="imp-results-body"></div></div>`;
  const { results, photoJobs } = await svc.applyPlan(plan, {
    partnerId, country, admin: window.ZFindServices.admin, compliance: window.ZFindServices.listingCompliance,
    source: { format: importState.table.format, fileName: importState.fileName, version: importState.table.version || null },
    zipPhoto: importState.table.zipPhoto || null
  }, (done) => { const p = document.getElementById('imp-progress'); if (p) p.textContent = `Import en cours… ${done} / ${total}`; });
  importState.running = false;
  importState.plan = null;
  importState.portfolioFor = null; // read again before the next comparison
  importState.results = results;
  const n = (kind, status) => results.filter(r => r.kind === kind && (!status || r.status === status)).length;
  const failed = results.filter(r => r.status === 'error').length;
  const p = document.getElementById('imp-progress');
  if (p) p.innerHTML = `<strong>${fmtN(n('create', 'ok'))} créée(s) en brouillon · ${fmtN(n('update', 'ok'))} mise(s) à jour · ${fmtN(n('archive', 'ok'))} retirée(s)</strong> · ${fmtN(n('unchanged'))} inchangée(s) · ${fmtN(failed)} en erreur.`;
  const incomplete = results.filter(r => r.kind !== 'unchanged' && /^mentions incomplètes/.test(r.compliance || '')).length;
  const incompleteUnchanged = results.filter(r => r.kind === 'unchanged' && /^mentions incomplètes/.test(r.compliance || '')).length;
  const writeFailed = results.filter(r => r.status === 'error' && r.kind !== 'error').length;
  document.getElementById('imp-results-body').innerHTML = `
    <p class="muted">Les mentions obligatoires importées attendent votre validation dans <a href="#" onclick="navigateAdmin('conformite');return false">« Mentions obligatoires à valider »</a>${incomplete ? ` ; ${fmtN(incomplete)} annonce(s) ci-dessous ont des mentions incomplètes : demandez à l’agence les informations indiquées` : ''}${incompleteUnchanged ? ` ; ${fmtN(incompleteUnchanged)} annonce(s) inchangée(s) restent incomplètes (détail dans le rapport)` : ''}. Les nouvelles annonces restent en brouillon : l’agence les complète et les envoie en vérification.</p>
    <div class="toolbar"><button class="btn" id="imp-report" onclick="importDownloadReport()">Télécharger le rapport (CSV)</button></div>
    <div class="imp-scroll"><table class="compact" id="imp-results-table"><thead><tr><th>#</th><th>Référence</th><th>Action</th><th>Détail</th><th>Mentions (France)</th><th></th></tr></thead><tbody>
    ${results.filter(r => r.kind !== 'unchanged').map(r => { const [label, tag] = r.status === 'error' ? ['Erreur' + (r.kind !== 'error' ? ' — ' + svc.KIND_FR[r.kind].toLowerCase() : ''), 'late'] : IMPORT_KIND[r.kind]; return `<tr data-status="${r.status === 'error' ? 'error' : r.kind}">
      <td>${r.line == null ? '—' : r.line}</td><td>${escapeHtml(r.reference || '—')}</td><td><span class="tag tag-${tag}">${escapeHtml(label)}</span></td><td>${escapeHtml(r.message || '')}</td>
      <td>${r.compliance ? `<span class="${/^mentions complètes/.test(r.compliance) ? 'imp-ok' : 'imp-warn'}">${escapeHtml(r.compliance)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${r.propertyId ? `<a href="#" onclick="navigateAdmin('properties','${escapeHtml(r.propertyId)}');return false">Ouvrir</a>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  showStatus(writeFailed ? 'error' : 'success', `Import terminé : ${n('create', 'ok')} créée(s), ${n('update', 'ok')} mise(s) à jour, ${n('archive', 'ok')} retirée(s)${failed ? `, ${failed} en erreur` : ''}.`);
  const planHost = document.getElementById('imp-plan');
  if (planHost) planHost.innerHTML = '<div class="detail-panel imp-panel"><h4>3. Changements prévus</h4><p class="muted">Changements appliqués. Relisez le fichier (ou un nouvel export) pour une nouvelle comparaison.</p></div>';
  await importPhotos(photoJobs);
  return results;
}

function importDownloadReport() {
  const partnerSel = document.getElementById('imp-partner');
  const name = (partnerSel.options[partnerSel.selectedIndex].text || 'agence').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  importDownload(`rapport-import-${name}-${new Date().toISOString().slice(0, 10)}.csv`, window.ZFindServices.listingImport.resultsCsv(importState.results || []));
}

/* Photo links of the created / updated listings: queued (never twice), then fetched by
   the site's server (/api/media-import) a few at a time; progress read from the queue. */
async function importPhotos(jobs) {
  const svc = window.ZFindServices.followup;
  if (!svc || !jobs || !jobs.length) return;
  const host = document.getElementById('imp-results');
  host.insertAdjacentHTML('beforeend', `<div class="detail-panel imp-panel" style="margin-top:12px" id="imp-photos"><h4>5. Photos</h4><p id="imp-photos-progress">Préparation de ${fmtN(jobs.reduce((n, j) => n + j.urls.length, 0))} photos…</p><div id="imp-photos-errors"></div></div>`);
  const ids = [];
  for (const j of jobs) {
    const q = await svc.queuePhotos(j.listingId, j.urls, j.offset);
    if (!q.error) ids.push(j.listingId);
  }
  const el = () => document.getElementById('imp-photos-progress');
  if (!ids.length) { if (el()) el().textContent = 'Impossible de préparer les photos (la migration 20261004200000 est-elle appliquée ?). L’agence peut les ajouter dans son espace.'; return; }
  importState.photoListings = ids;
  await svc.runPhotoImport();
  await pollPhotoImport(0);
}

async function pollPhotoImport(round) {
  const svc = window.ZFindServices.followup;
  const res = await svc.photoProgress(importState.photoListings || []);
  const el = document.getElementById('imp-photos-progress');
  if (!el || res.error) return;
  const st = res.data;
  const total = st.pending + st.done + st.failed;
  if (st.pending && round < 120) {
    el.innerHTML = `Téléchargement des photos depuis les liens de l’agence… <strong>${fmtN(st.done)} / ${fmtN(total)}</strong>${st.failed ? ` · ${fmtN(st.failed)} en échec` : ''}. Vous pouvez quitter cette page : le serveur reprend quand vous la rouvrez.`;
    if (round % 6 === 5) svc.runPhotoImport(); // each server call works ~40 s, then stops
    setTimeout(() => pollPhotoImport(round + 1), 5000);
    return;
  }
  el.innerHTML = `<strong>${fmtN(st.done)} photos ajoutées</strong> aux annonces (la première sert de couverture)${st.failed ? ` · ${fmtN(st.failed)} liens en échec` : ''}${st.pending ? ` · ${fmtN(st.pending)} encore en attente` : ''}.`;
  const err = document.getElementById('imp-photos-errors');
  if (err && st.errors.length) {
    err.innerHTML = `<p class="muted">Liens qui n’ont pas fonctionné (l’agence peut ajouter ces photos dans son espace) :</p><ul class="ops-list">${st.errors.slice(0, 30).map(x => `<li><span class="muted">${escapeHtml(x.url)}</span> — ${escapeHtml(x.error || 'erreur')}</li>`).join('')}</ul>`;
  }
}

/* ---------------- Partenaires ---------------- */
const PARTNER_ROLE_FR = { agency: 'Agence', promoter: 'Promoteur' };
const PARTNER_STATUS_FR = { active: 'Actif', inactive: 'Inactif' };

async function renderPartnersList() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Partenaires <button class="btn btn-primary" onclick="showNewPartnerForm()">+ Nouveau partenaire</button></div>
    <div class="toolbar"><input type="text" id="partner-search" placeholder="Rechercher par nom…" oninput="loadPartnersList(this.value)"></div>
    <div id="new-partner-form"></div>
    <table><thead><tr><th>Nom</th><th>Type</th><th>Statut</th><th></th></tr></thead><tbody id="partners-tbody"><tr><td colspan="4">Chargement…</td></tr></tbody></table>`);
  await loadPartnersList();
}
async function loadPartnersList(search) {
  const result = await window.ZFindServices.admin.listPartners(search);
  const tbody = document.getElementById('partners-tbody');
  if (result.error) { tbody.innerHTML = '<tr><td colspan="4">Impossible de charger les partenaires.</td></tr>'; return; }
  const rows = result.data || [];
  tbody.innerHTML = rows.length ? rows.map(p => `
    <tr onclick="navigateAdmin('partners','${p.id}')" style="cursor:pointer">
      <td>${escapeHtml(p.name)}</td><td>${escapeHtml(PARTNER_ROLE_FR[p.role] || p.role)}</td>
      <td><span class="tag tag-${p.status}">${escapeHtml(PARTNER_STATUS_FR[p.status] || p.status)}</span></td>
      <td></td>
    </tr>`).join('') : '<tr><td colspan="4">Aucun partenaire pour l’instant.</td></tr>';
}
function showNewPartnerForm() {
  document.getElementById('new-partner-form').innerHTML = `
    <div class="detail-panel" style="margin-bottom:16px;">
      <div class="form-field"><label>Nom</label><input type="text" id="np-name"></div>
      <div class="form-field"><label>Type</label><select id="np-role"><option value="agency">Agence</option><option value="promoter">Promoteur</option></select></div>
      <button class="btn btn-primary" onclick="submitNewPartner()">Créer</button>
    </div>`;
}
async function submitNewPartner() {
  const name = document.getElementById('np-name').value.trim();
  const role = document.getElementById('np-role').value;
  if (!name) { showStatus('error', 'Le nom est obligatoire.'); return; }
  const result = await window.ZFindServices.admin.createPartner({ name, role });
  if (result.error) { showStatus('error', 'Impossible de créer le partenaire.'); return; }
  document.getElementById('new-partner-form').innerHTML = '';
  showStatus('success', 'Partenaire créé.');
  loadPartnersList();
}
async function renderPartnerEdit() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', '<div id="partner-edit-root">Chargement…</div>');
  const result = await window.ZFindServices.admin.getPartnerById(adminState.id);
  const root = document.getElementById('partner-edit-root');
  if (result.error) { root.textContent = 'Impossible de charger le partenaire.'; return; }
  const p = result.data;
  const logoUrl = p.logo_storage_path ? await window.ZFindServices.supabaseClient.resolveMediaUrl(p.logo_storage_path) : null;
  root.innerHTML = `
    <a class="back-link" onclick="navigateAdmin('partners')">← Retour aux partenaires</a>
    <div class="page-title" style="display:flex; justify-content:space-between; align-items:center;">
      <span>${escapeHtml(p.name)}</span>
      <button class="btn" style="color:#c0392b; border-color:#c0392b;" onclick="deleteAsset('partner','${p.id}','partners')">Supprimer</button>
    </div>
    <div class="detail-panel">
      <div class="form-field"><label>Logo</label>
        ${logoUrl ? `<img src="${logoUrl}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:6px;display:block;margin-bottom:8px;">` : '<p style="color:#999;font-size:.8rem;margin-bottom:8px;">Pas encore de logo.</p>'}
        <input type="file" id="pe-logo-input" accept="image/*" onchange="handlePartnerLogoUpload('${p.id}')">
      </div>
      <div class="form-field"><label>Nom</label><input type="text" id="pe-name" value="${escapeHtml(p.name)}"></div>
      <div class="form-field"><label>Type</label><select id="pe-role"><option value="agency" ${p.role==='agency'?'selected':''}>Agence</option><option value="promoter" ${p.role==='promoter'?'selected':''}>Promoteur</option></select></div>
      <div class="form-field"><label>Statut</label><select id="pe-status"><option value="active" ${p.status==='active'?'selected':''}>Actif</option><option value="inactive" ${p.status==='inactive'?'selected':''}>Inactif</option></select></div>
      <div class="form-field"><label>Contacts acceptés — direct</label><input type="checkbox" id="pe-direct" ${p.enquiry_policy.direct?'checked':''}></div>
      <div class="form-field"><label>Contacts acceptés — qualifié</label><input type="checkbox" id="pe-qualified" ${p.enquiry_policy.qualified?'checked':''}></div>
      <div class="form-field"><label>Contacts acceptés — accompagnement</label><input type="checkbox" id="pe-assisted" ${p.enquiry_policy.assisted?'checked':''}></div>
      <button class="btn btn-primary" onclick="savePartner('${p.id}')">Enregistrer</button>
    </div>`;
}
async function handlePartnerLogoUpload(partnerId) {
  const input = document.getElementById('pe-logo-input');
  const file = input.files[0];
  if (!file) return;
  showStatus('success', 'Envoi du logo…');
  const result = await window.ZFindServices.admin.uploadPartnerLogo(partnerId, file);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Échec de l’envoi du logo.' : 'Logo envoyé.');
  if (!result.error) renderPartnerEditRefresh();
}
function renderPartnerEditRefresh() { document.getElementById('main').innerHTML = ''; renderPartnerEdit(); }
async function savePartner(id) {
  const fields = {
    name: document.getElementById('pe-name').value.trim(),
    role: document.getElementById('pe-role').value,
    status: document.getElementById('pe-status').value,
    enquiryPolicy: {
      direct: document.getElementById('pe-direct').checked,
      qualified: document.getElementById('pe-qualified').checked,
      assisted: document.getElementById('pe-assisted').checked,
    },
  };
  const result = await window.ZFindServices.admin.updatePartner(id, fields);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Impossible d’enregistrer.' : 'Enregistré.');
}

/* ---------------- Programmes neufs (developments): same review queue and filters as the properties ---------------- */
adminState.devFilter = { status: '', partner: '', search: '' };
let devRowsCache = [];

function openDevReviewQueue() {
  adminState.devFilter = { status: 'pending_review', partner: '', search: '' };
  navigateAdmin('developments');
}

async function renderDevelopmentsList() {
  const main = document.getElementById('main');
  const f = adminState.devFilter;
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Programmes neufs <button class="btn btn-primary" onclick="showNewDevelopmentForm()">+ Nouveau programme</button></div>
    <p class="muted" style="margin:-6px 0 14px">Programmes neufs des promoteurs. « À vérifier » = envoyés par le promoteur pour publication.</p>
    <div class="status-chips" id="dev-chips"></div>
    <div class="toolbar wrap">
      <input type="text" id="dev-search" placeholder="Rechercher par nom, zone, promoteur…" value="${escapeHtml(f.search)}" oninput="adminState.devFilter.search=this.value; renderDevRows()">
      <select id="dev-status" aria-label="Statut" onchange="adminState.devFilter.status=this.value; renderDevRows()">${PROP_FILTERS.map(([v, l]) => `<option value="${v}"${v === f.status ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <select id="dev-partner" aria-label="Promoteur" onchange="adminState.devFilter.partner=this.value; renderDevRows()"><option value="">Tous les promoteurs</option></select>
    </div>
    <div id="new-dev-form"></div>
    ${bulkBarHtml('devs')}
    <table><thead><tr>${bulkHeadCell('devs')}<th>Nom</th><th>Zone</th><th>Promoteur</th><th>Prix</th><th>Statut</th></tr></thead><tbody id="devs-tbody"><tr><td colspan="6">Chargement…</td></tr></tbody></table>`);
  await loadDevelopmentsList();
}

function devPartnerId(d) { return d.promoter_partner_id || ((propListing(d).rep || {}).partner_id) || ''; }

async function loadDevelopmentsList() {
  const result = await window.ZFindServices.admin.listDevelopments();
  const tbody = document.getElementById('devs-tbody');
  if (!tbody) return;
  if (result.error) { tbody.innerHTML = '<tr><td colspan="6">Chargement impossible.</td></tr>'; return; }
  devRowsCache = result.data || [];
  const partners = new Map();
  devRowsCache.forEach(d => { const id = devPartnerId(d); if (id) partners.set(id, (d.partners && d.partners.name) || id); });
  const sel = document.getElementById('dev-partner');
  if (sel) sel.innerHTML = '<option value="">Tous les promoteurs</option>' + [...partners.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .map(([id, name]) => `<option value="${escapeHtml(id)}"${id === adminState.devFilter.partner ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('');
  renderDevRows();
}

function renderDevRows() {
  const tbody = document.getElementById('devs-tbody');
  if (!tbody) return;
  const f = adminState.devFilter;
  const needle = String(f.search || '').trim().toLowerCase();
  const byPartner = devRowsCache.filter(d => !f.partner || devPartnerId(d) === f.partner);
  const chips = document.getElementById('dev-chips');
  if (chips) {
    chips.innerHTML = PROP_FILTERS.filter(([v]) => v).map(([v, l]) => {
      const n = byPartner.filter(d => propStatusMatches(propStatus(d), v)).length;
      return `<button class="chip${v === f.status ? ' on' : ''}${v === 'pending_review' && n ? ' warn' : ''}" data-status="${v}" onclick="adminState.devFilter.status='${v === f.status ? '' : v}'; document.getElementById('dev-status').value=adminState.devFilter.status; renderDevRows()">${l} <strong>${fmtN(n)}</strong></button>`;
    }).join('');
  }
  const rows = byPartner.filter(d => propStatusMatches(propStatus(d), f.status)).filter(d => {
    if (!needle) return true;
    return [d.name, propTitle(d), d.zones_lite && d.zones_lite.name, d.zones_lite && d.zones_lite.city, d.partners && d.partners.name].filter(Boolean).join(' ').toLowerCase().includes(needle);
  });
  if (f.status === 'pending_review') rows.reverse();
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="6" class="muted">${f.status === 'pending_review' ? 'Aucun programme à vérifier. 👍' : 'Aucun programme avec ces filtres.'}</td></tr>`; bulkAfterRows('devs'); return; }
  tbody.innerHTML = rows.map(d => {
    const { listing } = propListing(d);
    const status = propStatus(d);
    const title = propTitle(d);
    return `<tr data-dev="${d.id}" onclick="navigateAdmin('developments','${d.id}')" style="cursor:pointer">
      ${bulkRowCell('devs', listing && listing.id)}
      <td>${escapeHtml(d.name)}${title && title !== d.name ? `<br><span class="muted">${escapeHtml(title)}</span>` : ''}</td>
      <td>${d.zones_lite ? escapeHtml(d.zones_lite.name) : '<span class="muted">à définir</span>'}</td>
      <td>${d.partners ? escapeHtml(d.partners.name) : ''}</td>
      <td>${propPrice(listing)}</td>
      <td><span class="tag tag-${LISTING_STATUS_TAG[status] || 'draft'}">${escapeHtml(LISTING_STATUS_FR[status] || status)}</span></td>
    </tr>`;
  }).join('');
  bulkAfterRows('devs'); // bulk.js
}
async function showNewDevelopmentForm() {
  const zones = await getZonesCached();
  const partners = await getPartnersCached();
  document.getElementById('new-dev-form').innerHTML = `
    <div class="detail-panel" style="margin-bottom:16px;">
      <div class="form-field"><label>Nom</label><input type="text" id="nd-name"></div>
      <div class="form-field"><label>Zone</label>${zoneComboHTML("nd-zone", zones, null)}</div>
      <div class="form-field"><label>Promoteur</label><select id="nd-partner">${partners.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <button class="btn btn-primary" onclick="submitNewDevelopment()">Créer</button>
    </div>`;
}
async function submitNewDevelopment() {
  const name = document.getElementById('nd-name').value.trim();
  if (!name) { showStatus('error', 'Le nom est obligatoire.'); return; }
  const result = await window.ZFindServices.admin.createDevelopment({ name, zoneLiteId: document.getElementById('nd-zone').value, promoterPartnerId: document.getElementById('nd-partner').value });
  if (result.error) { showStatus('error', 'Impossible de créer le programme.'); return; }
  document.getElementById('new-dev-form').innerHTML = '';
  showStatus('success', 'Programme créé.');
  loadDevelopmentsList();
}
async function renderDevelopmentEdit() {
  const result = await window.ZFindServices.admin.getDevelopmentForEdit(adminState.id);
  const main = document.getElementById('main');
  if (result.error) { main.insertAdjacentHTML('beforeend', 'Chargement impossible.'); return; }
  await renderAssetEditShell(main, {
    kind: 'development', data: result.data, backView: 'developments',
    titleField: 'name',
  });
}

let authoringTaxonomyCache = null;

async function getAuthoringTaxonomyCached() {
  if (authoringTaxonomyCache) {
    return {
      data: authoringTaxonomyCache,
      error: null
    };
  }

  const result =
    await window.ZFindServices.propertyTaxonomy
      .getAuthoringTaxonomy();

  if (!result.error) {
    authoringTaxonomyCache = result.data;
  }

  return result;
}

function renderPropertySubtypeOptions(
  taxonomy,
  selectedCode
) {
  const service =
    window.ZFindServices.propertyTaxonomy;

  const choices =
    service.listEnabledAuthoringSubtypes(taxonomy);

  const enabledCodes = new Set(
    choices.map(item => item.code)
  );

  let html = '';

  /*
   * Historical safety:
   * If an existing Property carries a subtype that has since been
   * disabled, keep it visible as the current classification while
   * preventing it from becoming a NEW authoring choice.
   */
  if (
    selectedCode &&
    !enabledCodes.has(selectedCode)
  ) {
    const current = (
      Array.isArray(taxonomy && taxonomy.subtypes)
        ? taxonomy.subtypes
        : []
    ).find(item => item.code === selectedCode);

    const currentLabel =
      service.humanizeCode(
        current ? current.code : selectedCode
      );

    html +=
      `<option value="${escapeHtml(selectedCode)}" ` +
      `selected disabled>` +
      `${escapeHtml(currentLabel)} ` +
      `(actuel — plus proposé pour les nouveaux biens)` +
      `</option>`;
  }

  const classes = Array.isArray(
    taxonomy && taxonomy.classes
  )
    ? taxonomy.classes
        .filter(item => item && item.enabled === true)
        .slice()
        .sort(
          (a, b) =>
            Number(a.sortOrder || 0) -
              Number(b.sortOrder || 0) ||
            String(a.code).localeCompare(
              String(b.code)
            )
        )
    : [];

  classes.forEach(propertyClass => {
    const classChoices = choices.filter(
      item =>
        item.propertyClass === propertyClass.code
    );

    if (!classChoices.length) return;

    html +=
      `<optgroup label="${escapeHtml(
        ({ residential: 'Résidentiel', commercial: 'Professionnel', land: 'Terrain' })[propertyClass.code] || service.humanizeCode(propertyClass.code)
      )}">`;

    classChoices.forEach(item => {
      const selected =
        item.code === selectedCode
          ? ' selected'
          : '';

      html +=
        `<option value="${escapeHtml(item.code)}"` +
        `${selected}>` +
        `${escapeHtml(
          SUBTYPE_FR[item.code] || service.humanizeCode(item.code)
        )}` +
        `</option>`;
    });

    html += '</optgroup>';
  });

  if (!html) {
    return (
      '<option value="" selected disabled>' +
      'Aucun type de bien disponible' +
      '</option>'
    );
  }

  return html;
}

async function getResidentialDefaultSubtype() {
  const taxonomyResult =
    await getAuthoringTaxonomyCached();

  if (taxonomyResult.error) {
    return {
      data: null,
      error: taxonomyResult.error
    };
  }

  const subtype =
    window.ZFindServices.propertyTaxonomy
      .getDefaultSubtype(
        taxonomyResult.data,
        'residential'
      );

  if (!subtype) {
    return {
      data: null,
      error: new Error(
        'Aucun type de bien résidentiel disponible'
      )
    };
  }

  return {
    data: subtype,
    error: null
  };
}

/* ---------------- Biens et annonces + file « À vérifier » ---------------- */
/* « À vérifier » = sent by the agency (pending_review) — the queue to check and publish. */
const LISTING_STATUS_FR = { draft: 'Brouillon', incomplete: 'Incomplète', pending_review: 'À vérifier', ready: 'Prête à publier', published: 'Publiée', suspended: 'Suspendue', archived: 'Archivée', none: 'Sans annonce' };
const REPRESENTATION_STATUS_FR = { proposed: 'Proposé', active: 'Actif', ended: 'Terminé', disputed: 'Contesté' };
const LISTING_STATUS_TAG = { published: 'published', ready: 'active', pending_review: 'review', suspended: 'inactive', archived: 'inactive' };
const PROP_FILTERS = [
  ['', 'Toutes'], ['pending_review', 'À vérifier'], ['ready', 'Prêtes à publier'], ['draft', 'Brouillons'],
  ['published', 'Publiées'], ['suspended', 'Suspendues'], ['archived', 'Archivées']
];
const SUBTYPE_FR = { apartment: 'Appartement', villa: 'Maison', land: 'Terrain', office: 'Bureau', retail: 'Local commercial', industrial_logistics: 'Entrepôt / local d’activité', hospitality: 'Hôtellerie' };
adminState.propFilter = { status: '', partner: '', search: '', compliance: '' };
const PROP_COMPLIANCE_FILTERS = [
  ['', 'Mentions FR : toutes'], ['todo', 'Mentions à compléter'], ['pending', 'Mentions en attente'],
  ['approved', 'Mentions validées'], ['rejected', 'Mentions refusées'], ['unsupported', 'Mentions : non couvert'], ['none', 'Hors France']
];
let propRowsCache = [];

function propListing(p) {
  const rep = (p.representations || [])[0];
  return { rep, listing: rep && (rep.listings || [])[0] };
}
function propStatus(p) {
  const { listing } = propListing(p);
  return listing ? listing.status : 'none';
}
/* French title first, then any other language. */
function propTitle(p) {
  const { listing } = propListing(p);
  const content = (listing && listing.listing_content) || [];
  const order = ['fr', 'en', 'pt-PT', 'pt', 'es', 'de', 'it'];
  const best = order.map(l => content.find(c => c.locale === l && c.title && c.title.trim())).find(Boolean) || content.find(c => c.title && c.title.trim());
  return best ? best.title : '';
}
function propStatusMatches(status, filter) {
  if (!filter) return true;
  if (filter === 'draft') return status === 'draft' || status === 'incomplete' || status === 'none';
  return status === filter;
}
function propPrice(listing) {
  if (!listing || !(Number(listing.price_current) > 0)) return '—';
  return (listing.price_is_from ? 'à partir de ' : '') + fmtN(listing.price_current) + ' ' + (listing.currency_iso === 'EUR' || !listing.currency_iso ? '€' : escapeHtml(listing.currency_iso)) + (listing.transaction_type === 'rent' ? ' /mois' : '');
}

function openReviewQueue() {
  adminState.propFilter = { status: 'pending_review', partner: '', search: '', compliance: '' };
  navigateAdmin('properties');
}

async function renderPropertiesList() {
  const main = document.getElementById('main');
  const f = adminState.propFilter;
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Biens et annonces <button class="btn btn-primary" onclick="showNewPropertyForm()">+ Nouveau bien</button></div>
    <div class="status-chips" id="prop-chips"></div>
    <div class="toolbar wrap">
      <input type="text" id="prop-search" placeholder="Rechercher par titre, zone, agence…" value="${escapeHtml(f.search)}" oninput="adminState.propFilter.search=this.value; renderPropRows()">
      <select id="prop-status" aria-label="Statut" onchange="adminState.propFilter.status=this.value; renderPropRows()">${PROP_FILTERS.map(([v, l]) => `<option value="${v}"${v === f.status ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <select id="prop-partner" aria-label="Agence" onchange="adminState.propFilter.partner=this.value; renderPropRows()"><option value="">Toutes les agences</option></select>
      <select id="prop-compliance" aria-label="Mentions obligatoires" onchange="adminState.propFilter.compliance=this.value; renderPropRows()">${PROP_COMPLIANCE_FILTERS.map(([v, l]) => `<option value="${v}"${v === (f.compliance || '') ? ' selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div id="new-prop-form"></div>
    ${bulkBarHtml('props')}
    <table><thead><tr>${bulkHeadCell('props')}<th>Titre</th><th>Bien</th><th>Zone</th><th>Agence</th><th>Prix</th><th>Statut</th><th>Mentions FR</th><th></th></tr></thead><tbody id="props-tbody"><tr><td colspan="9">Chargement…</td></tr></tbody></table>`);
  await loadPropertiesList();
}

async function loadPropertiesList() {
  const result = await window.ZFindServices.admin.listProperties();
  const tbody = document.getElementById('props-tbody');
  if (!tbody) return;
  if (result.error) { tbody.innerHTML = '<tr><td colspan="9">Chargement impossible.</td></tr>'; return; }
  propRowsCache = result.data || [];
  const partners = new Map();
  propRowsCache.forEach(p => { const { rep } = propListing(p); if (rep && rep.partner_id) partners.set(rep.partner_id, rep.partners ? rep.partners.name : rep.partner_id); });
  const sel = document.getElementById('prop-partner');
  if (sel) {
    sel.innerHTML = '<option value="">Toutes les agences</option>' + [...partners.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])))
      .map(([id, name]) => `<option value="${escapeHtml(id)}"${id === adminState.propFilter.partner ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('');
  }
  renderPropRows();
  loadPropertiesCompliance(propRowsCache); // compliance.js: « Mentions FR » column and filter
}

function renderPropRows() {
  const tbody = document.getElementById('props-tbody');
  if (!tbody) return;
  const f = adminState.propFilter;
  const needle = String(f.search || '').trim().toLowerCase();
  const byPartner = propRowsCache.filter(p => !f.partner || (propListing(p).rep || {}).partner_id === f.partner);
  const chips = document.getElementById('prop-chips');
  if (chips) {
    chips.innerHTML = PROP_FILTERS.filter(([v]) => v).map(([v, l]) => {
      const n = byPartner.filter(p => propStatusMatches(propStatus(p), v)).length;
      return `<button class="chip${v === f.status ? ' on' : ''}${v === 'pending_review' && n ? ' warn' : ''}" data-status="${v}" onclick="adminState.propFilter.status='${v === f.status ? '' : v}'; document.getElementById('prop-status').value=adminState.propFilter.status; renderPropRows()">${l} <strong>${fmtN(n)}</strong></button>`;
    }).join('');
  }
  const rows = byPartner.filter(p => propStatusMatches(propStatus(p), f.status)).filter(p => propComplianceMatches(p, f.compliance)).filter(p => {
    if (!needle) return true;
    const { rep } = propListing(p);
    const hay = [propTitle(p), p.zones_lite && p.zones_lite.name, p.zones_lite && p.zones_lite.city, rep && rep.partners && rep.partners.name, p.id].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(needle);
  });
  // The review queue reads oldest first: whoever waited longest is checked first.
  if (f.status === 'pending_review') rows.reverse();
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="muted">${f.status === 'pending_review' ? 'Aucune annonce à vérifier. 👍' : 'Aucun bien avec ces filtres.'}</td></tr>`;
    bulkAfterRows('props');
    return;
  }
  tbody.innerHTML = rows.map(p => {
    const { rep, listing } = propListing(p);
    const status = propStatus(p);
    const title = propTitle(p);
    return `<tr data-prop="${p.id}" onclick="navigateAdmin('properties','${p.id}')" style="cursor:pointer">
      ${bulkRowCell('props', listing && listing.id)}
      <td>${title ? escapeHtml(title) : '<span class="muted">(sans titre)</span>'}</td>
      <td>${escapeHtml(SUBTYPE_FR[p.subtype] || p.subtype || '')}${p.typology ? ' · ' + escapeHtml(p.typology) : ''}${p.area_sqm ? '<br><span class="muted">' + fmtN(p.area_sqm) + ' m²</span>' : ''}</td>
      <td>${p.zones_lite ? escapeHtml(p.zones_lite.name) : '<span class="muted">à définir</span>'}</td>
      <td>${rep && rep.partners ? escapeHtml(rep.partners.name) : ''}</td>
      <td>${propPrice(listing)}</td>
      <td><span class="tag tag-${LISTING_STATUS_TAG[status] || 'draft'}">${escapeHtml(LISTING_STATUS_FR[status] || status)}</span></td>
      <td>${complianceTag(propComplianceStatus(p))}</td>
      <td><span onclick="event.stopPropagation(); duplicatePropertyRow('${p.id}')" style="cursor:pointer; color:#555;">Dupliquer</span></td>
    </tr>`;
  }).join('');
  bulkAfterRows('props'); // bulk.js
}
async function duplicatePropertyRow(id) {
  const result = await window.ZFindServices.admin.duplicateProperty(id);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Impossible de dupliquer.' : 'Dupliqué.');
  if (!result.error) loadPropertiesList();
}
async function showNewPropertyForm() {
  const [zones, taxonomyResult] = await Promise.all([
    getZonesCached(),
    getAuthoringTaxonomyCached()
  ]);

  if (taxonomyResult.error) {
    showStatus(
      'error',
      'Impossible de charger les types de bien.'
    );
    return;
  }

  const authoringChoices =
    window.ZFindServices.propertyTaxonomy
      .listEnabledAuthoringSubtypes(
        taxonomyResult.data
      );

  if (!authoringChoices.length) {
    showStatus(
      'error',
      'Aucun type de bien disponible pour le moment.'
    );
    return;
  }

  const subtypeOptions =
    renderPropertySubtypeOptions(
      taxonomyResult.data,
      null
    );

  document.getElementById('new-prop-form').innerHTML = `
    <div class="detail-panel" style="margin-bottom:16px;">
      <div class="form-field"><label>Type</label><select id="npr-subtype">${subtypeOptions}</select></div>
      <div class="form-field"><label>Typologie</label><input type="text" id="npr-typology" placeholder="ex. : T2"></div>
      <div class="form-field"><label>Surface (m²)</label><input type="number" id="npr-area"></div>
      <div class="form-field"><label>Zone</label>${zoneComboHTML('npr-zone', zones, null)}</div>
      <button class="btn btn-primary" onclick="submitNewProperty()">Créer</button>
    </div>`;
}
async function submitNewProperty() {
  const result = await window.ZFindServices.admin.createProperty({
    subtype: document.getElementById('npr-subtype').value,
    typology: document.getElementById('npr-typology').value.trim() || null,
    areaSqm: Number(document.getElementById('npr-area').value) || null,
    zoneLiteId: document.getElementById('npr-zone').value,
  });
  if (result.error) { showStatus('error', 'Impossible de créer le bien.'); return; }
  document.getElementById('new-prop-form').innerHTML = '';
  showStatus('success', 'Bien créé.');
  loadPropertiesList();
}
async function renderPropertyEdit() {
  const result = await window.ZFindServices.admin.getPropertyForEdit(adminState.id);
  const main = document.getElementById('main');
  if (result.error) { main.insertAdjacentHTML('beforeend', 'Chargement impossible.'); return; }
  await renderAssetEditShell(main, { kind: 'property', data: result.data, backView: 'properties' });
}

/** Shared edit shell for Property/Development: translations (3
    locale tabs), explicit marketplace lifecycles, and a media manager. Photos use
    DIFFERENT tables depending on kind — a Development's own photos
    (development_media) exist independently of whether it has a
    listing yet; a Property's photos (listing_media) are tied to its
    listing. Both are supported, correctly, using the real composite
    key (media_asset_id + owner id) on each table. */

const REPRESENTATION_ADMIN_TRANSITIONS = Object.freeze({
  proposed: Object.freeze([
    ['active', 'Activer'],
    ['disputed', 'Marquer contesté']
  ]),
  active: Object.freeze([
    ['disputed', 'Marquer contesté'],
    ['ended', 'Terminer']
  ]),
  disputed: Object.freeze([
    ['active', 'Résolu → actif'],
    ['ended', 'Terminer']
  ]),
  ended: Object.freeze([])
});

const LISTING_ADMIN_TRANSITIONS = Object.freeze({
  draft: Object.freeze([
    ['pending_review', 'Envoyer en vérification'],
    ['incomplete', 'Marquer incomplète'],
    ['archived', 'Archiver']
  ]),

  incomplete: Object.freeze([
    ['draft', 'Repasser en brouillon'],
    ['pending_review', 'Envoyer en vérification'],
    ['archived', 'Archiver']
  ]),

  pending_review: Object.freeze([
    ['incomplete', 'Marquer incomplète'],
    ['ready', 'Approuver (prête à publier)'],
    ['archived', 'Archiver']
  ]),

  ready: Object.freeze([
    ['pending_review', 'Renvoyer en vérification'],
    ['published', 'Publier'],
    ['archived', 'Archiver']
  ]),

  published: Object.freeze([
    ['suspended', 'Suspendre'],
    ['archived', 'Archiver']
  ]),

  suspended: Object.freeze([
    ['ready', 'Repasser en « prête »'],
    ['archived', 'Archiver']
  ]),

  archived: Object.freeze([])
});


function lifecycleTag(status) {
  const visual =
    status === 'published'
      ? 'published'
      : 'draft';

  return `<span class="tag tag-${visual}">${escapeHtml(LISTING_STATUS_FR[status] || REPRESENTATION_STATUS_FR[status] || status)}</span>`;
}


function renderRepresentationLifecycleControls(rep) {
  if (!rep) return '';

  const transitions =
    REPRESENTATION_ADMIN_TRANSITIONS[rep.status] || [];

  const buttons = transitions
    .map(([toStatus, label]) => (
      `<button class="btn"
        onclick="transitionRepresentation('${rep.id}','${toStatus}')"
      >${label}</button>`
    ))
    .join('');

  return `
    <span style="margin-right:8px;">
      Mandat :
      ${lifecycleTag(rep.status)}
      ${buttons}
    </span>
  `;
}


function renderListingLifecycleControls(listing) {
  if (!listing) return '';

  const transitions =
    LISTING_ADMIN_TRANSITIONS[listing.status] || [];

  const buttons = transitions
    .map(([toStatus, label]) => {
      const cls =
        toStatus === 'published'
          ? 'btn btn-primary'
          : 'btn';

      return (
        `<button class="${cls}"
          onclick="transitionListing('${listing.id}','${toStatus}')"
        >${label}</button>`
      );
    })
    .join('');

  return `
    <span style="margin-right:8px;">
      Annonce :
      ${lifecycleTag(listing.status)}
      ${buttons}
    </span>
  `;
}


async function renderAssetEditShell(main, opts) {
  const rep = (opts.data.representations || [])[0];
  const listing = rep && (rep.listings || [])[0];
  const contentByLocale = {};
  (listing ? listing.listing_content || [] : []).forEach(c => { contentByLocale[c.locale] = c; });
  const isPublished = listing && listing.status === 'published';
  const mediaOwnerId = opts.kind === 'development' ? opts.data.id : (listing ? listing.id : null);
  const mediaKind = opts.kind === 'development' ? 'development' : 'listing';
  const zones = await getZonesCached();
  const d = opts.data;

  let subtypeOptions = '';

  if (opts.kind === 'property') {
    const taxonomyResult =
      await getAuthoringTaxonomyCached();

    if (taxonomyResult.error) {
      showStatus(
        'error',
        'Impossible de charger les types de bien.'
      );
      return;
    }

    subtypeOptions =
      renderPropertySubtypeOptions(
        taxonomyResult.data,
        d.subtype
      );
  }

  main.insertAdjacentHTML('beforeend', `
    <a class="back-link" onclick="navigateAdmin('${opts.backView}')">← Retour</a>
    <div class="page-title">
      ${opts.kind === 'development' ? escapeHtml(d.name) : 'Modifier le bien'}
      <span>
        ${rep ? renderRepresentationLifecycleControls(rep) : ''}
        ${listing
          ? renderListingLifecycleControls(listing)
          : `<button class="btn btn-primary" onclick="createInitialListingUi('${opts.kind}','${d.id}','${rep ? rep.partner_id : ''}')">Créer l’annonce</button>`}
        <button class="btn" onclick="duplicateAsset('${opts.kind}','${d.id}')">Dupliquer</button>
        <button class="btn btn-danger" onclick="deleteAsset('${opts.kind}','${d.id}','${opts.backView}')">Supprimer</button>
      </span>
    </div>

    ${listing ? '<div class="asset-compliance-line" id="asset-compliance-line"></div>' : ''}

    <div class="page-title" style="font-size:1.1rem;">Caractéristiques</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      ${opts.kind === 'property' ? `
        <div class="form-grid">
          <div class="form-field"><label>Type</label><select id="attr-subtype">${subtypeOptions}</select></div>
          <div class="form-field"><label>Typologie</label><input type="text" id="attr-typology" value="${escapeHtml(d.typology||'')}"></div>
          <div class="form-field"><label>Surface (m²)</label><input type="number" id="attr-area" value="${d.area_sqm||''}"></div>
          <div class="form-field"><label>Étage</label><input type="number" id="attr-floor" value="${d.floor||''}"></div>
          <div class="form-field"><label>Zone</label>${zoneComboHTML('attr-zone', zones, d.zone_lite_id)}</div>
        </div>
        <button class="btn btn-primary" onclick="saveAssetAttrs('property','${d.id}')">Enregistrer les caractéristiques</button>
      ` : `
        <div class="form-grid">
          <div class="form-field"><label>Nom</label><input type="text" id="attr-name" value="${escapeHtml(d.name)}"></div>
          <div class="form-field"><label>Zone</label>${zoneComboHTML('attr-zone', zones, d.zone_lite_id)}</div>
        </div>
        <button class="btn btn-primary" onclick="saveAssetAttrs('development','${d.id}')">Enregistrer les caractéristiques</button>
      `}
    </div>

    ${opts.kind === 'property' ? window.ZFindServices.fieldForms.renderPropertyExtendedFields(d, { locale: 'fr' }) : window.ZFindServices.fieldForms.renderDevelopmentExtendedFields(d, { locale: 'fr' })}

    ${opts.kind === 'development' ? `
      <div class="page-title" style="font-size:1.1rem;">Lots</div>
      <div class="detail-panel" style="margin-bottom:20px;">
        <div id="units-list">Chargement…</div>
        <button class="btn btn-primary" style="margin-top:14px;" onclick="addUnitToDevelopment('${d.id}', '${escapeHtml(d.zone_lite_id||'')}')">+ Ajouter un lot</button>
      </div>
    ` : ''}

    <div class="page-title" style="font-size:1.1rem;">Équipements</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div id="features-grid">Chargement…</div>
      <button class="btn btn-primary" style="margin-top:14px;" onclick="saveFeatures('${opts.kind}','${d.id}')">Enregistrer les équipements</button>
    </div>

    <div class="locale-tabs">${LOCALES.map(l => `<div class="locale-tab ${l==='fr'?'active':''}" data-locale="${l}" onclick="switchLocaleTab('${l}')">${l.toUpperCase()}</div>`).join('')}</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      ${listing ? LOCALES.map(l => `
        <div class="locale-content" data-locale="${l}" ${l!=='fr'?'style="display:none"':''}>
          <div class="form-field"><label>Titre (${l.toUpperCase()})</label><input type="text" id="content-title-${l}" value="${escapeHtml((contentByLocale[l]||{}).title||'')}"></div>
          <div class="form-field"><label>Description (${l.toUpperCase()})</label><textarea id="content-desc-${l}">${escapeHtml((contentByLocale[l]||{}).description||'')}</textarea></div>
          <button class="btn btn-primary" onclick="saveTranslation('${listing.id}','${l}')">Enregistrer ${l.toUpperCase()}</button>
        </div>`).join('') : `<p style="color:#999;">Créez d’abord l’annonce (bouton ci-dessus) pour rédiger les textes.</p>`}
    </div>
    <div class="page-title" style="font-size:1.1rem;">Photos</div>
    <div class="media-grid" id="media-grid" data-owner-id="${mediaOwnerId||''}" data-media-kind="${mediaKind}">Chargement…</div>
    ${mediaOwnerId ? `<input type="file" id="media-upload-input" accept="image/*" onchange="handleMediaUpload('${mediaOwnerId}','${mediaKind}')">` : '<p style="color:#999;">Les photos sont disponibles une fois l’annonce créée.</p>'}
  `);
  if (mediaOwnerId) loadMediaGrid(mediaOwnerId, mediaKind);
  if (listing) loadAssetComplianceLine(listing);
  loadFeaturesGrid(opts.kind, d.id);
  if (opts.kind === 'development') loadUnitsList(d.id);
}

/** Units: properties where development_id = this development. Each
    row links straight into the property's own full edit view (same
    30+ field taxonomy, same Features) — a unit is a real Property,
    never a lighter/different record just because it belongs to a
    development. */
async function loadUnitsList(developmentId) {
  const listEl = document.getElementById('units-list');
  if (!listEl) return;
  const result = await window.ZFindServices.admin.listUnitsForDevelopment(developmentId);
  if (result.error) { listEl.innerHTML = 'Impossible de charger les lots.'; return; }
  if (!result.data.length) { listEl.innerHTML = '<p style="color:#999;">Aucun lot pour l’instant.</p>'; return; }
  listEl.innerHTML = result.data.map(u => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--gray-200,#eee); cursor:pointer;" onclick="navigateAdmin('properties','${u.id}')">
      <span>${escapeHtml(u.typology || SUBTYPE_FR[u.subtype] || u.subtype || 'Lot')}${u.area_sqm ? ' · ' + u.area_sqm + ' m²' : ''}${u.floor != null ? ' · Étage ' + u.floor : ''}</span>
      <span style="color:#999; font-size:0.8rem;">${u.zones_lite ? escapeHtml(u.zones_lite.name) : ''}</span>
    </div>`).join('');
}

/** New unit inherits the development's own zone by default — a real
    convenience (units are almost always in the same zone as their
    development), never forced (still editable afterward like any
    other field). */
async function addUnitToDevelopment(developmentId, zoneLiteId) {
  const subtypeResult =
    await getResidentialDefaultSubtype();

  if (subtypeResult.error || !subtypeResult.data) {
    showStatus(
      'error',
      'Aucun type résidentiel disponible pour un nouveau lot.'
    );
    return;
  }

  const result =
    await window.ZFindServices.admin.createProperty({
      subtype: subtypeResult.data,
      typology: null,
      areaSqm: null,
      floor: null,
      zoneLiteId: zoneLiteId || null,
      developmentId
    });

  if (result.error) {
    showStatus(
      'error',
      'Impossible de créer le lot.'
    );
    return;
  }

  showStatus('success', 'Lot ajouté.');
  loadUnitsList(developmentId);
}

async function saveAssetAttrs(kind, id) {
  let result;
  if (kind === 'property') {
    result = await window.ZFindServices.admin.updateProperty(id, {
      subtype: document.getElementById('attr-subtype').value,
      typology: document.getElementById('attr-typology').value.trim() || null,
      areaSqm: Number(document.getElementById('attr-area').value) || null,
      floor: Number(document.getElementById('attr-floor').value) || null,
      zoneLiteId: document.getElementById('attr-zone').value,
    });
  } else {
    result = await window.ZFindServices.admin.updateDevelopment(id, {
      name: document.getElementById('attr-name').value.trim(),
      zoneLiteId: document.getElementById('attr-zone').value,
    });
  }
  showStatus(result.error ? 'error' : 'success', result.error ? 'Impossible d’enregistrer les caractéristiques.' : 'Caractéristiques enregistrées.');
}

/** Collects every Migration 0005 field for the given kind and saves
    them in one call. Numeric fields use Number(...) || null pattern
    consistently — an empty input becomes null (field genuinely
    unknown), never a stored zero that would misrepresent a real
    value. Text fields trim and become null when empty, never an
    empty string sitting in the database ambiguously. */
async function saveExtendedAttrs(kind, id) {
  const result = kind === 'property'
    ? await window.ZFindServices.admin.updateProperty(id, window.ZFindServices.fieldForms.readPropertyExtendedFieldsFromDOM())
    : await window.ZFindServices.admin.updateDevelopment(id, window.ZFindServices.fieldForms.readDevelopmentExtendedFieldsFromDOM());
  showStatus(result.error ? 'error' : 'success', result.error ? 'Impossible d’enregistrer les champs.' : 'Champs enregistrés.');
}

/** Renders the shared 36-feature checklist for either a Property or a
    Development, pre-checking whichever ones are already linked via
    property_features / development_features. */
async function loadFeaturesGrid(kind, id) {
  const grid = document.getElementById('features-grid');
  if (!grid) return;
  const [allFeatures, linked] = await Promise.all([
    window.ZFindServices.admin.listFeatures(),
    kind === 'property' ? window.ZFindServices.admin.getPropertyFeatureIds(id) : window.ZFindServices.admin.getDevelopmentFeatureIds(id),
  ]);
  if (allFeatures.error) { grid.innerHTML = 'Impossible de charger les équipements.'; return; }
  const linkedIds = new Set((linked.data || []).map(r => r.feature_id));
  grid.innerHTML = window.ZFindServices.fieldForms.renderFeaturesChecklist(allFeatures.data, linkedIds, { locale: 'fr' });
}

async function saveFeatures(kind, id) {
  const checked = Array.from(document.querySelectorAll('.feature-checkbox:checked')).map(el => el.value);
  const result = kind === 'property'
    ? await window.ZFindServices.admin.setPropertyFeatures(id, checked)
    : await window.ZFindServices.admin.setDevelopmentFeatures(id, checked);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Impossible d’enregistrer les équipements.' : `${checked.length} équipement(s) enregistré(s).`);
}

async function duplicateAsset(kind, id) {
  const result = kind === 'property' ? await window.ZFindServices.admin.duplicateProperty(id) : await window.ZFindServices.admin.duplicateDevelopment(id);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Impossible de dupliquer.' : 'Dupliqué.');
  if (!result.error) navigateAdmin(kind === 'property' ? 'properties' : 'developments');
}

async function deleteAsset(kind, id, backView) {
  const ok = await askConfirm('Supprimer ' + ({ property: 'le bien', development: 'le programme', partner: 'le partenaire' }[kind] || kind) + ' ?', 'Cette action est définitive.', 'Supprimer');
  if (!ok) return;
  const result = kind === 'property' ? await window.ZFindServices.admin.deleteProperty(id)
    : kind === 'development' ? await window.ZFindServices.admin.deleteDevelopment(id)
    : await window.ZFindServices.admin.deletePartner(id);
  if (result.error) { showStatus('error', result.error.message || 'Suppression impossible.'); return; }
  navigateAdmin(backView);
}

/** Fills the gap noted in the previous delivery: a Property or
    Development created via "+ New…" has no representation/listing yet,
    so it cannot be published or photographed until one exists.
    Routed through admin.createInitialListing() — the UI itself never
    calls Supabase directly (this previously did, corrected here). */

function renderListingCommercialEditor(listing) {
  if (!listing) return '';

  const transactionType =
    listing.transaction_type === 'rent' ? 'rent' : 'sale';

  const rentalPeriod =
    ['monthly', 'seasonal', 'yearly']
      .includes(listing.rental_period)
      ? listing.rental_period
      : 'monthly';

  const currency =
    String(listing.currency_iso || 'EUR')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase();

  const price =
    Number.isFinite(Number(listing.price_current))
      ? Number(listing.price_current)
      : 0;

  return `
    <div
      id="listing-commercial-editor"
      style="
        margin:18px 0;
        padding:18px;
        border:1px solid #e7e7e7;
        border-radius:10px;
        background:#fff;
      "
    >
      <div style="margin-bottom:14px;">
        <strong>Conditions commerciales</strong>
        <div style="font-size:.8rem;color:#777;margin-top:4px;">
          Prix et type de transaction uniquement. Le statut de l’annonce et du
          mandat se change avec les boutons ci-dessus.
        </div>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
          gap:12px;
        "
      >
        <label>
          <span>Transaction</span>
          <select
            id="listing-transaction-type"
            onchange="syncListingRentalPeriodControl()"
          >
            <option value="sale" ${
              transactionType === 'sale' ? 'selected' : ''
            }>Vente</option>
            <option value="rent" ${
              transactionType === 'rent' ? 'selected' : ''
            }>Location</option>
          </select>
        </label>

        <label
          id="listing-rental-period-wrap"
          style="${
            transactionType === 'rent'
              ? ''
              : 'display:none;'
          }"
        >
          <span>Période du loyer</span>
          <select id="listing-rental-period">
            <option value="monthly" ${
              rentalPeriod === 'monthly' ? 'selected' : ''
            }>Mensuelle</option>
            <option value="seasonal" ${
              rentalPeriod === 'seasonal' ? 'selected' : ''
            }>Saisonnière</option>
            <option value="yearly" ${
              rentalPeriod === 'yearly' ? 'selected' : ''
            }>Annuelle</option>
          </select>
        </label>

        <label>
          <span>Prix</span>
          <input
            id="listing-price-current"
            type="number"
            min="0"
            step="0.01"
            value="${price}"
          >
        </label>

        <label>
          <span>Devise</span>
          <input
            id="listing-currency-iso"
            type="text"
            maxlength="3"
            value="${currency}"
            placeholder="EUR"
          >
        </label>

        <label style="display:flex;align-items:center;gap:8px;">
          <input
            id="listing-price-is-from"
            type="checkbox"
            ${listing.price_is_from ? 'checked' : ''}
          >
          <span>Prix « à partir de »</span>
        </label>
      </div>

      <button
        class="btn btn-primary"
        style="margin-top:14px;"
        onclick="saveListingCommercial('${listing.id}')"
      >
        Enregistrer les conditions commerciales
      </button>
    </div>
  `;
}


function syncListingRentalPeriodControl() {
  const type = document.getElementById(
    'listing-transaction-type'
  );

  const wrap = document.getElementById(
    'listing-rental-period-wrap'
  );

  const period = document.getElementById(
    'listing-rental-period'
  );

  if (!type || !wrap) return;

  const isRent = type.value === 'rent';

  wrap.style.display = isRent ? '' : 'none';

  if (
    isRent &&
    period &&
    !['monthly', 'seasonal', 'yearly']
      .includes(period.value)
  ) {
    period.value = 'monthly';
  }
}


async function saveListingCommercial(listingId) {
  const transactionType =
    document.getElementById(
      'listing-transaction-type'
    ).value;

  const rentalPeriod =
    transactionType === 'rent'
      ? document.getElementById(
          'listing-rental-period'
        ).value
      : null;

  const priceCurrent =
    document.getElementById(
      'listing-price-current'
    ).value;

  const currencyIso =
    document.getElementById(
      'listing-currency-iso'
    ).value;

  const priceIsFrom =
    document.getElementById(
      'listing-price-is-from'
    ).checked;

  const result =
    await window.ZFindServices.admin
      .updateListingCommercial(
        listingId,
        {
          transactionType,
          rentalPeriod,
          priceCurrent,
          currencyIso,
          priceIsFrom
        }
      );

  showStatus(
    result.error ? 'error' : 'success',
    result.error
      ? (
          result.error.message ||
          'Impossible d’enregistrer les conditions commerciales.'
        )
      : 'Conditions commerciales enregistrées.'
  );

  if (!result.error) {
    syncListingRentalPeriodControl();
  }
}


async function createInitialListingUi(kind, ownerId, existingPartnerId) {
  let partnerId = existingPartnerId;
  if (!partnerId) {
    const partners = await getPartnersCached();
    if (!partners.length) { showStatus('error', 'Créez d’abord un partenaire : chaque annonce est représentée par une agence ou un promoteur.'); return; }
    partnerId = partners[0].id;
  }
  const result = await window.ZFindServices.admin.createInitialListing(kind, ownerId, partnerId);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Impossible de créer l’annonce.' : 'Annonce créée : indiquez le prix et les textes ci-dessous.');
  if (!result.error) render();
}
function switchLocaleTab(locale) {
  document.querySelectorAll('.locale-tab').forEach(t => t.classList.toggle('active', t.dataset.locale === locale));
  document.querySelectorAll('.locale-content').forEach(c => { c.style.display = c.dataset.locale === locale ? '' : 'none'; });
}
async function saveTranslation(listingId, locale) {
  const title = document.getElementById(`content-title-${locale}`).value.trim();
  const description = document.getElementById(`content-desc-${locale}`).value.trim();
  const result = await window.ZFindServices.admin.upsertListingContent(listingId, locale, { title, description });
  showStatus(result.error ? 'error' : 'success', result.error ? 'Impossible d’enregistrer le texte.' : `${locale.toUpperCase()} enregistré.`);
}
async function transitionListing(listingId, toStatus) {
  const result =
    await window.ZFindServices.admin
      .setListingStatus(listingId, toStatus);

  showStatus(
    result.error ? 'error' : 'success',
    result.error
      // French wording for the lifecycle and France compliance gate errors (listing-compliance.js).
      ? window.ZFindServices.listingCompliance.describeError(result.error, 'Impossible de changer le statut de l’annonce.')
      : `Annonce : ${LISTING_STATUS_FR[toStatus] || toStatus}.`
  );

  if (!result.error) render();
}

async function transitionRepresentation(
  representationId,
  toStatus
) {
  const result =
    await window.ZFindServices.admin
      .setRepresentationStatus(
        representationId,
        toStatus
      );

  showStatus(
    result.error ? 'error' : 'success',
    result.error
      ? (
          result.error.message
          || 'Impossible de changer le statut du mandat.'
        )
      : `Mandat : ${REPRESENTATION_STATUS_FR[toStatus] || toStatus}.`
  );

  if (!result.error) render();
}

/* ---------------- Media manager ---------------- */
function _mediaAdminFns(kind) {
  return kind === 'development'
    ? { list: window.ZFindServices.admin.listDevelopmentMedia, reorder: window.ZFindServices.admin.reorderDevelopmentMedia, setCover: window.ZFindServices.admin.setCoverDevelopmentMedia, del: window.ZFindServices.admin.deleteDevelopmentMedia, upload: window.ZFindServices.admin.uploadDevelopmentMedia }
    : { list: window.ZFindServices.admin.listListingMedia, reorder: window.ZFindServices.admin.reorderListingMedia, setCover: window.ZFindServices.admin.setCoverMedia, del: window.ZFindServices.admin.deleteListingMedia, upload: window.ZFindServices.admin.uploadListingMedia };
}
async function loadMediaGrid(ownerId, kind) {
  const grid = document.getElementById('media-grid');
  const fns = _mediaAdminFns(kind);
  const result = await fns.list(ownerId);
  if (result.error) { grid.textContent = 'Impossible de charger les photos.'; return; }
  const items = result.data || [];
  grid.innerHTML = items.length ? items.map(m => `
    <div class="media-item ${m.is_cover?'cover':''}" draggable="true" data-media-asset-id="${m.media_asset_id}" ondragstart="mediaDragStart(event)" ondragover="event.preventDefault()" ondrop="mediaDrop(event,'${ownerId}','${kind}')">
      ${m.is_cover ? '<span class="cover-badge">Couverture</span>' : ''}
      <img src="${m.url || ''}" alt="" onclick="event.stopPropagation(); openLightbox('${m.url || ''}')">      <div class="actions">
        <span onclick="setCover('${ownerId}','${kind}','${m.media_asset_id}')">Mettre en couverture</span>
        <span onclick="deleteMedia('${ownerId}','${kind}','${m.media_asset_id}','${m.media_assets.original_storage_path}')">✕</span>
      </div>
    </div>`).join('') : '<p style="color:#999;">Aucune photo pour l’instant.</p>';
}
let mediaDragSourceId = null;
function mediaDragStart(e) { mediaDragSourceId = e.target.closest('.media-item').dataset.mediaAssetId; }
async function mediaDrop(e, ownerId, kind) {
  e.preventDefault();
  const target = e.target.closest('.media-item');
  if (!target || target.dataset.mediaAssetId === mediaDragSourceId) return;
  const ids = Array.from(document.querySelectorAll('#media-grid .media-item')).map(el => el.dataset.mediaAssetId);
  const from = ids.indexOf(mediaDragSourceId), to = ids.indexOf(target.dataset.mediaAssetId);
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  await _mediaAdminFns(kind).reorder(ownerId, ids);
  loadMediaGrid(ownerId, kind);
}
async function setCover(ownerId, kind, mediaAssetId) {
  await _mediaAdminFns(kind).setCover(ownerId, mediaAssetId);
  loadMediaGrid(ownerId, kind);
}
async function deleteMedia(ownerId, kind, mediaAssetId, storagePath) {
  await _mediaAdminFns(kind).del(ownerId, mediaAssetId, storagePath);
  loadMediaGrid(ownerId, kind);
}
async function handleMediaUpload(ownerId, kind) {
  const input = document.getElementById('media-upload-input');
  const file = input.files[0];
  if (!file) return;
  showStatus('success', 'Envoi…');
  const result = await _mediaAdminFns(kind).upload(ownerId, file, {});
  showStatus(result.error ? 'error' : 'success', result.error ? 'Échec de l’envoi.' : 'Photo envoyée.');
  input.value = '';
  if (!result.error) loadMediaGrid(ownerId, kind);
}

/* ---------------- Agences (base de prospection) ---------------- */
const agState = { filters: {}, page: 0 };

async function renderAgenciasList() {
  const main = document.getElementById('main');
  const f = agState.filters;
  const opt = (v, l, cur) => `<option value="${v}"${v === (cur || '') ? ' selected' : ''}>${escapeHtml(l)}</option>`;
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Agences — base de prospection <button class="btn" id="ag-export" onclick="exportAgencias()">Exporter en CSV</button></div>
    <p class="muted">Agences immobilières et mandataires de France, de Belgique et du Luxembourg (registres officiels, OpenStreetMap, sites web). Prospection par e-mail : France — tous les professionnels, avec désinscription ; Belgique et Luxembourg — personnes morales uniquement ; jamais ceux qui ont demandé à ne pas être contactés.</p>
    <div class="toolbar wrap">
      <input type="text" id="ag-search" placeholder="Nom, ville, e-mail…" value="${escapeHtml(f.search || '')}">
      <select id="ag-country">${opt('', 'Tous les pays', f.country)}${['FR', 'BE', 'LU'].map(c => opt(c, c, f.country)).join('')}</select>
      <select id="ag-type">${opt('', 'Tous les types', f.type)}${Object.entries(TYPE_LABELS).map(([k, v]) => opt(k, v, f.type)).join('')}</select>
      <input type="text" id="ag-network" placeholder="Réseau (ex. orpi)" value="${escapeHtml(f.network || '')}" style="min-width:120px">
      <input type="text" id="ag-postcode" placeholder="CP / dép. (ex. 74)" value="${escapeHtml(f.postcode || '')}" style="min-width:110px">
      <label class="chk"><input type="checkbox" id="ag-email"${f.withEmail ? ' checked' : ''}> Avec e-mail</label>
      <label class="chk"><input type="checkbox" id="ag-outreach"${f.outreach ? ' checked' : ''}> Prospection autorisée</label>
      <button class="btn btn-primary" onclick="applyAgenciasFilters()">Filtrer</button>
    </div>
    <div id="ag-count" class="muted"></div>
    <table><thead><tr><th>Nom</th><th>Type</th><th>Lieu</th><th>E-mail</th><th>Téléphone</th></tr></thead><tbody id="ag-tbody"><tr><td colspan="5">Chargement…</td></tr></tbody></table>
    <div class="pager"><button class="btn" id="ag-prev" onclick="pageAgencias(-1)">← Précédente</button><span id="ag-page"></span><button class="btn" id="ag-next" onclick="pageAgencias(1)">Suivante →</button></div>`);
  document.getElementById('ag-search').addEventListener('keydown', e => { if (e.key === 'Enter') applyAgenciasFilters(); });
  await loadAgencias();
}

function readAgenciasFilters() {
  const v = id => document.getElementById(id).value.trim();
  return {
    search: v('ag-search'), country: v('ag-country'), type: v('ag-type'), network: v('ag-network').toLowerCase(),
    postcode: v('ag-postcode'), withEmail: document.getElementById('ag-email').checked, outreach: document.getElementById('ag-outreach').checked
  };
}
async function applyAgenciasFilters() { agState.filters = readAgenciasFilters(); agState.page = 0; await loadAgencias(); }
async function pageAgencias(delta) { agState.page = Math.max(0, agState.page + delta); await loadAgencias(); }

async function loadAgencias() {
  const svc = window.ZFindServices.prospection;
  const tbody = document.getElementById('ag-tbody');
  const res = await svc.list(agState.filters, agState.page);
  if (res.error) { tbody.innerHTML = `<tr><td colspan="5">Chargement impossible (${escapeHtml(res.error.message)}).</td></tr>`; return; }
  const rows = res.data || [];
  const total = res.count || 0;
  const pages = Math.max(1, Math.ceil(total / svc.PAGE));
  document.getElementById('ag-count').textContent = `${fmtN(total)} résultats`;
  document.getElementById('ag-page').textContent = ` Page ${agState.page + 1} sur ${fmtN(pages)} `;
  document.getElementById('ag-prev').disabled = agState.page === 0;
  document.getElementById('ag-next').disabled = agState.page + 1 >= pages;
  tbody.innerHTML = rows.length ? rows.map(x => `
    <tr onclick="navigateAdmin('agencias','${x.id}')" style="cursor:pointer"${x.do_not_contact ? ' class="row-muted"' : ''}>
      <td><strong>${escapeHtml(x.trade_name || x.name)}</strong>${x.trade_name && x.trade_name !== x.name ? `<br><span class="muted">${escapeHtml(x.name)}</span>` : ''}</td>
      <td>${escapeHtml(TYPE_LABELS[x.type] || x.type)}${x.network ? `<br><span class="tag tag-draft">${escapeHtml(x.network)}</span>` : ''}</td>
      <td>${x.country} · ${escapeHtml(x.postcode || '')} ${escapeHtml(x.city || '')}</td>
      <td>${x.email ? escapeHtml(x.email) : '<span class="muted">—</span>'}${x.do_not_contact ? '<br><span class="tag tag-inactive">ne pas contacter</span>' : x.email && !x.email_outreach_allowed ? '<br><span class="tag tag-inactive">e-mail non autorisé</span>' : ''}</td>
      <td>${x.phone ? escapeHtml(x.phone) : '<span class="muted">—</span>'}</td>
    </tr>`).join('') : '<tr><td colspan="5">Aucun résultat.</td></tr>';
}

async function exportAgencias() {
  const svc = window.ZFindServices.prospection;
  const btn = document.getElementById('ag-export');
  btn.disabled = true;
  const res = await svc.exportRows(readAgenciasFilters(), n => { btn.textContent = `Export en cours… ${fmtN(n)}`; });
  btn.disabled = false; btn.textContent = 'Exporter en CSV';
  if (res.error) { showStatus('error', 'Échec de l’export.'); return; }
  const blob = new Blob([svc.toCsv(res.data)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `zfind-agences-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  showStatus('success', `${fmtN(res.data.length)} lignes exportées${res.truncated ? ' (limite de 50 000 atteinte : affinez les filtres)' : ''}.`);
}

async function renderAgenciaDetail() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `<a class="back-link" onclick="navigateAdmin('agencias')">← Retour aux agences</a><div id="ag-detail">Chargement…</div>`);
  const res = await window.ZFindServices.prospection.get(adminState.id);
  const el = document.getElementById('ag-detail');
  if (res.error) { el.textContent = 'Chargement impossible.'; return; }
  const x = res.data;
  const row = (k, v) => `<div class="row"><span class="k">${escapeHtml(k)}</span><span>${v == null || v === '' ? '—' : v}</span></div>`;
  const src = (v, s) => v ? `${escapeHtml(v)} <span class="muted">(${escapeHtml(s || '?')})</span>` : null;
  el.innerHTML = `
    <div class="page-title">${escapeHtml(x.trade_name || x.name)}</div>
    <div class="detail-panel">
      ${row('Raison sociale', escapeHtml(x.name))}
      ${row('Type', escapeHtml(TYPE_LABELS[x.type] || x.type) + (x.is_natural_person ? ' · personne physique' : ''))}
      ${row('Réseau', escapeHtml(x.network || ''))}
      ${row('Adresse', escapeHtml(x.address || ''))}
      ${row('Pays', x.country)}
      ${row('E-mail', src(x.email, x.email_source))}
      ${row('Téléphone', src(x.phone, x.phone_source))}
      ${row('Site web', x.website ? `<a href="${escapeHtml(x.website)}" target="_blank" rel="noopener">${escapeHtml(x.website)}</a> <span class="muted">(${escapeHtml(x.website_source || '?')})</span>` : null)}
      ${row('Prospection par e-mail', x.email_outreach_allowed ? 'autorisée' : 'non autorisée')}
      ${row('Ne pas contacter', x.do_not_contact ? `oui, depuis le ${new Date(x.do_not_contact_at).toLocaleDateString('fr-FR')}` : 'non')}
      ${row('Source', `${escapeHtml(x.source)} · ${escapeHtml(x.source_id)}${x.company_id ? ' · entreprise ' + escapeHtml(x.company_id) : ''}`)}
      ${row('Vu dans le registre', new Date(x.last_seen_at).toLocaleDateString('fr-FR'))}
      ${row('Recherche sur le site', x.enriched_at ? `${escapeHtml(x.enrich_status || '')} · ${new Date(x.enriched_at).toLocaleDateString('fr-FR')}` : 'pas encore')}
    </div>
    <h3 class="section-title">Corriger les coordonnées</h3>
    <div class="form-grid">
      <div class="form-field"><label>E-mail</label><input id="agd-email" value="${escapeHtml(x.email || '')}"></div>
      <div class="form-field"><label>Téléphone</label><input id="agd-phone" value="${escapeHtml(x.phone || '')}"></div>
      <div class="form-field"><label>Site web</label><input id="agd-website" value="${escapeHtml(x.website || '')}"></div>
    </div>
    <div class="toolbar">
      <button class="btn btn-primary" onclick="saveAgenciaContacts('${x.id}')">Enregistrer les coordonnées</button>
      ${x.do_not_contact
        ? `<button class="btn" onclick="toggleDoNotContact('${x.id}', false)">Autoriser à nouveau le contact</button>`
        : `<button class="btn btn-danger" onclick="toggleDoNotContact('${x.id}', true)">Marquer « ne pas contacter »</button>`}
    </div>`;
}

async function saveAgenciaContacts(id) {
  const v = k => document.getElementById(`agd-${k}`).value;
  const res = await window.ZFindServices.prospection.updateContacts(id, { email: v('email'), phone: v('phone'), website: v('website') });
  if (res.error) { showStatus('error', 'Impossible d’enregistrer.'); return; }
  showStatus('success', 'Coordonnées enregistrées.');
  render();
}

async function toggleDoNotContact(id, value) {
  if (value && !(await askConfirm('Ne pas contacter', 'Cette agence ne recevra plus d’e-mails de prospection de Z Find. Confirmer ?', 'Confirmer'))) return;
  const res = await window.ZFindServices.prospection.setDoNotContact(id, value);
  if (res.error) { showStatus('error', 'Mise à jour impossible.'); return; }
  showStatus('success', value ? 'Marquée « ne pas contacter ».' : 'Contact à nouveau autorisé.');
  render();
}

/* ---------------- Demandes (enquiries on listings) ---------------- */
/* The agency marks an enquiry « Répondue » in its panel; after 24 h
   without an answer it gets ONE reminder e-mail and the enquiry is
   flagged here (migration 20261004200000). */
const LEAD_STATUS_FR = { new: 'À répondre', contacted: 'Répondue', closed: 'Clôturée' };
const LEAD_TYPE_FR = { direct: 'Contact', qualified: 'Qualifiée', assisted: 'Accompagnement' };
const LEAD_FILTERS = [['', 'Toutes'], ['overdue', 'Sans réponse depuis 24 h'], ['new', 'À répondre'], ['contacted', 'Répondues'], ['closed', 'Clôturées']];
let leadRowsCache = [];

function openLeads(filter) {
  adminState.leadFilter = filter || '';
  navigateAdmin('leads');
}
function hoursSince(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)); }
function leadAgeLabel(l) {
  if (l.status !== 'new') return l.responded_at ? `répondue le ${new Date(l.responded_at).toLocaleDateString('fr-FR')}` : '';
  const h = hoursSince(l.created_at);
  return h < 24 ? `il y a ${h} h` : `sans réponse depuis ${h < 48 ? h + ' h' : Math.floor(h / 24) + ' jours'}`;
}

async function renderLeadsList() {
  const main = document.getElementById('main');
  const f = adminState.leadFilter || '';
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Demandes</div>
    <p class="muted" style="margin:-6px 0 14px;max-width:880px">Demandes de contact sur les annonces. Chacune est envoyée par e-mail à l’agence immédiatement. L’agence la marque « Répondue » dans son espace ; après 24 h sans réponse, elle reçoit une relance automatique (une seule) et la demande apparaît ici en rouge.</p>
    <div class="toolbar wrap">
      <select id="lead-filter" aria-label="Statut" onchange="adminState.leadFilter=this.value; loadLeadsList()">${LEAD_FILTERS.map(([v, l]) => `<option value="${v}"${v === f ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <input type="text" id="lead-search" placeholder="Rechercher nom, e-mail, téléphone, annonce, agence…" oninput="renderLeadRows()">
    </div>
    <table><thead><tr><th>Date</th><th>Annonce · Agence</th><th>Personne</th><th>Type</th><th>Statut</th><th>Action</th></tr></thead><tbody id="leads-tbody"><tr><td colspan="6">Chargement…</td></tr></tbody></table>`);
  await loadLeadsList();
}

async function loadLeadsList() {
  const tbody = document.getElementById('leads-tbody');
  if (!tbody) return;
  const res = await window.ZFindServices.followup.leads(adminState.leadFilter || null);
  if (res.error) { tbody.innerHTML = '<tr><td colspan="6">Impossible de charger les demandes (la migration 20261004200000 est-elle appliquée ?).</td></tr>'; return; }
  leadRowsCache = res.data || [];
  renderLeadRows();
}

function renderLeadRows() {
  const tbody = document.getElementById('leads-tbody');
  if (!tbody) return;
  const needle = String((document.getElementById('lead-search') || {}).value || '').trim().toLowerCase();
  const rows = leadRowsCache.filter(l => !needle || [l.name, l.email, l.phone, l.message, l.listing_title, l.partner_name].filter(Boolean).join(' ').toLowerCase().includes(needle));
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="6" class="muted">${adminState.leadFilter === 'overdue' ? 'Aucune demande sans réponse. 👍' : 'Aucune demande.'}</td></tr>`; return; }
  tbody.innerHTML = rows.map(l => `
    <tr data-lead="${l.id}"${l.overdue ? ' class="row-late"' : ''}>
      <td>${new Date(l.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${escapeHtml(l.listing_title || '(sans titre)')}<br><span class="muted">${escapeHtml(l.partner_name || '—')}${l.notified_at ? '' : ' · <span style="color:#a33">e-mail à l’agence pas encore envoyé</span>'}</span></td>
      <td><a href="#" onclick="navigateAdmin('leads','${l.id}');return false"><strong>${escapeHtml(l.name || '—')}</strong></a><br><span class="muted">${escapeHtml([l.email, l.phone].filter(Boolean).join(' · '))}</span></td>
      <td>${escapeHtml(LEAD_TYPE_FR[l.contact_type] || l.contact_type)}</td>
      <td><span class="tag tag-${l.status === 'new' ? (l.overdue ? 'late' : 'review') : l.status === 'contacted' ? 'active' : 'inactive'}">${escapeHtml(LEAD_STATUS_FR[l.status] || l.status)}</span><br><span class="muted">${escapeHtml(leadAgeLabel(l))}${l.reminder_sent_at ? ' · relance envoyée' : ''}</span></td>
      <td><select aria-label="Changer le statut" onchange="setLeadStatus('${l.id}', this.value)"><option value="">Changer…</option>${Object.entries(LEAD_STATUS_FR).filter(([k]) => k !== l.status).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></td>
    </tr>`).join('');
}

async function setLeadStatus(id, status) {
  if (!status) return;
  const res = await window.ZFindServices.followup.setLeadStatus(id, status);
  showStatus(res.error ? 'error' : 'success', res.error ? 'Impossible de changer le statut.' : `Demande : ${LEAD_STATUS_FR[status]}.`);
  if (adminState.view === 'leads' && adminState.id) renderLeadDetailRefresh(); else loadLeadsList();
}

async function renderLeadDetail() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', '<div id="lead-detail-root">Chargement…</div>');
  await renderLeadDetailRefresh();
}
async function renderLeadDetailRefresh() {
  const root = document.getElementById('lead-detail-root');
  if (!root) return;
  const res = await window.ZFindServices.followup.leads(null);
  const l = (res.data || []).find(x => x.id === adminState.id);
  if (res.error || !l) { root.textContent = 'Impossible de charger la demande.'; return; }
  root.innerHTML = `
    <a class="back-link" onclick="navigateAdmin('leads')">← Retour aux demandes</a>
    <div class="page-title">Demande de ${escapeHtml(l.name || '—')}</div>
    <div class="detail-panel">
      <div class="row"><span class="k">Date</span><span>${new Date(l.created_at).toLocaleString('fr-FR')}</span></div>
      <div class="row"><span class="k">Nom</span><span>${escapeHtml(l.name || '—')}</span></div>
      <div class="row"><span class="k">E-mail</span><span>${l.email ? `<a href="mailto:${escapeHtml(l.email)}">${escapeHtml(l.email)}</a>` : '—'}</span></div>
      <div class="row"><span class="k">Téléphone</span><span>${escapeHtml(l.phone || '—')}</span></div>
      <div class="row"><span class="k">Type</span><span>${escapeHtml(LEAD_TYPE_FR[l.contact_type] || l.contact_type)}</span></div>
      <div class="row"><span class="k">Annonce</span><span>${escapeHtml(l.listing_title || '(sans titre)')}</span></div>
      <div class="row"><span class="k">Agence</span><span>${escapeHtml(l.partner_name || '—')}</span></div>
      <div class="row"><span class="k">Envoyée à l’agence</span><span>${l.notified_at ? new Date(l.notified_at).toLocaleString('fr-FR') : 'pas encore'}</span></div>
      <div class="row"><span class="k">Statut</span><span>${escapeHtml(LEAD_STATUS_FR[l.status] || l.status)} · ${escapeHtml(leadAgeLabel(l))}${l.reminder_sent_at ? ' · relance envoyée le ' + new Date(l.reminder_sent_at).toLocaleString('fr-FR') : ''}</span></div>
      <div style="margin-top:14px; white-space:pre-wrap; font-size:.85rem; color:#444;">${escapeHtml(l.message || '')}</div>
      <div class="toolbar" style="margin-top:14px">${Object.entries(LEAD_STATUS_FR).filter(([k]) => k !== l.status).map(([k, v]) => `<button class="btn" onclick="setLeadStatus('${l.id}','${k}')">Marquer « ${v} »</button>`).join('')}</div>
    </div>`;
}

/* ---------------- Estimations (owner / buyer estimation requests) ---------------- */
const EST_STATUS_FR = { new: 'Nouvelle', assigned: 'Confiée', contacted: 'Contactée', closed: 'Clôturée' };
const EST_FILTERS = [['open', 'À traiter'], ['new', 'Nouvelles'], ['assigned', 'Confiées'], ['contacted', 'Contactées'], ['closed', 'Clôturées'], ['', 'Toutes']];
const EST_PROJECT_FR = { sell_3m: 'Vendre d’ici 3 mois', sell_12m: 'Vendre dans l’année', later: 'Vendre plus tard', curious: 'Simple curiosité', buy_3m: 'Acheter d’ici 3 mois', buy_12m: 'Acheter dans l’année', looking: 'Se renseigne' };
const EST_CONF_FR = { high: 'élevée', medium: 'moyenne', low: 'limitée' };

async function renderEstimationsList() {
  const main = document.getElementById('main');
  const f = adminState.estFilter == null ? 'open' : adminState.estFilter;
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Estimations</div>
    <p class="muted" style="margin:-6px 0 14px;max-width:880px">Demandes d’estimation faites sur le site. Un propriétaire ne peut être confié à une agence que s’il a coché la case « mise en relation » (colonne Agence) ; dans ce cas, choisissez UNE agence active du secteur et cliquez sur « Confier et envoyer » : elle reçoit la demande par e-mail et répond directement au propriétaire. Les autres demandes (sans accord, acheteurs) ne peuvent être suivies que par Z Find.</p>
    <div class="toolbar wrap">
      <select id="est-filter" aria-label="Statut" onchange="adminState.estFilter=this.value; loadEstimationsList()">${EST_FILTERS.map(([v, l]) => `<option value="${v}"${v === f ? ' selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <table><thead><tr><th>Date</th><th>Personne</th><th>Bien et estimation</th><th>Projet</th><th>Agence</th><th>Suivi</th></tr></thead><tbody id="est-tbody"><tr><td colspan="6">Chargement…</td></tr></tbody></table>`);
  await loadEstimationsList();
}

async function loadEstimationsList() {
  const tbody = document.getElementById('est-tbody');
  if (!tbody) return;
  const sel = document.getElementById('est-filter');
  const [res, partners] = await Promise.all([window.ZFindServices.followup.estimations(sel ? sel.value : 'open'), getPartnersCached()]);
  if (res.error) { tbody.innerHTML = '<tr><td colspan="6">Impossible de charger les estimations (la migration 20261004200000 est-elle appliquée ?).</td></tr>'; return; }
  const rows = res.data || [];
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="muted">Aucune demande dans cet état.</td></tr>'; return; }
  const active = (partners || []).filter(p => p.status === 'active').sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const eur = n => (Number(n) > 0 ? fmtN(Math.round(n)) + ' €' : '—');
  tbody.innerHTML = rows.map(x => {
    const e = x.estimate || {}; const p = x.property || {};
    const canAssign = x.mode === 'owner' && x.agency_consent;
    const agencyCell = canAssign
      ? `<select id="est-partner-${x.id}" aria-label="Agence"><option value="">— choisir —</option>${active.map(pa => `<option value="${escapeHtml(pa.id)}"${pa.id === x.partner_id ? ' selected' : ''}>${escapeHtml(pa.name)}</option>`).join('')}</select>
         <button class="btn btn-primary" onclick="assignEstimation('${x.id}')">${x.partner_id ? 'Changer' : 'Confier et envoyer'}</button>
         ${x.partner_id ? `<br><span class="muted">${escapeHtml((x.partners && x.partners.name) || '')} · ${x.forwarded_at ? 'envoyée le ' + new Date(x.forwarded_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '<span style="color:#a33">envoi en cours…</span>'}</span>` : ''}`
      : `<span class="muted">${x.mode === 'buyer' ? 'Acheteur : Z Find uniquement' : 'Pas d’accord du propriétaire : ne pas transmettre'}</span>`;
    return `<tr data-est="${x.id}">
      <td>${new Date(x.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}<br><span class="muted">${x.mode === 'owner' ? 'Propriétaire' : 'Acheteur'}</span></td>
      <td><strong>${escapeHtml(x.name || '—')}</strong><br><span class="muted"><a href="mailto:${escapeHtml(x.email)}">${escapeHtml(x.email)}</a>${x.phone ? '<br>' + escapeHtml(x.phone) : ''}${x.alerts ? '<br>alertes de prix : oui' : ''}</span></td>
      <td>${escapeHtml(p.line || x.place || '—')}<br><span class="muted">${e.central ? `${eur(e.low)} – ${eur(e.high)} · valeur centrale ${eur(e.central)} · fiabilité ${EST_CONF_FR[e.confidence] || '—'}` : ''}${e.askingPrice ? ` · prix demandé ${eur(e.askingPrice)}` : ''}</span></td>
      <td>${escapeHtml(EST_PROJECT_FR[x.project] || '—')}</td>
      <td class="est-agency">${agencyCell}</td>
      <td><span class="tag tag-${x.status === 'new' ? 'review' : x.status === 'closed' ? 'inactive' : 'active'}">${escapeHtml(EST_STATUS_FR[x.status] || x.status)}</span>
        <input type="text" id="est-note-${x.id}" placeholder="Note" maxlength="1000" value="${escapeHtml(x.admin_note || '')}" style="margin-top:6px;width:100%">
        <div class="sg-actions">${['contacted', 'closed'].filter(k => k !== x.status).map(k => `<button class="btn" onclick="setEstimationStatus('${x.id}','${k}')">${EST_STATUS_FR[k]}</button>`).join('')}<button class="btn" onclick="setEstimationStatus('${x.id}', null)">Enregistrer la note</button></div></td>
    </tr>`;
  }).join('');
}

async function assignEstimation(id) {
  const sel = document.getElementById('est-partner-' + id);
  const partnerId = sel && sel.value;
  if (!partnerId) { showStatus('error', 'Choisissez l’agence.'); return; }
  const name = sel.options[sel.selectedIndex].text;
  const ok = await askConfirm(`Envoyer à ${name} ?`, 'L’agence reçoit par e-mail la demande et les coordonnées du propriétaire (qui a donné son accord). À une seule agence.', 'Confier et envoyer');
  if (!ok) return;
  const svc = window.ZFindServices.followup;
  const res = await svc.assignEstimation(id, partnerId);
  if (res.error) { showStatus('error', /consent/.test(res.error.message || '') ? 'Le propriétaire n’a pas donné son accord : transmission impossible.' : 'Impossible de confier la demande.'); return; }
  await svc.sendToAgencies();
  showStatus('success', `Confiée à ${name}. L’e-mail part dans quelques instants.`);
  loadEstimationsList();
  setTimeout(() => { if (adminState.view === 'estimacoes') loadEstimationsList(); }, 4000);
}

async function setEstimationStatus(id, status) {
  const note = document.getElementById('est-note-' + id);
  const res = await window.ZFindServices.followup.setEstimationStatus(id, status, note ? note.value : null);
  showStatus(res.error ? 'error' : 'success', res.error ? 'Impossible d’enregistrer.' : status ? `Estimation : ${EST_STATUS_FR[status]}.` : 'Note enregistrée.');
  if (!res.error) loadEstimationsList();
}

/* ---------------- Avis (agency reviews) ---------------- */
const REVIEW_STATUS_FR = { pending: 'À modérer', published: 'Publié', rejected: 'Refusé' };

async function renderReviewsList() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Avis</div>
    <p class="muted" style="margin:-6px 0 14px;max-width:880px">Avis sur les agences laissés par des personnes qui les ont contactées via Z Find. Ne publier que ce qui est respectueux et porte sur l’expérience avec l’agence ; rien n’est affiché avant publication. Les liens de l’e-mail de modération fonctionnent toujours.</p>
    <div class="toolbar"><select id="rv-filter" aria-label="Statut" onchange="loadReviewsList()"><option value="pending">À modérer</option><option value="published">Publiés</option><option value="rejected">Refusés</option><option value="">Tous</option></select></div>
    <table><thead><tr><th>Date</th><th>Agence</th><th>Note</th><th>Avis</th><th>Statut</th><th>Décision</th></tr></thead><tbody id="rv-tbody"><tr><td colspan="6">Chargement…</td></tr></tbody></table>`);
  await loadReviewsList();
}

async function loadReviewsList() {
  const tbody = document.getElementById('rv-tbody');
  if (!tbody) return;
  const res = await window.ZFindServices.followup.reviews(document.getElementById('rv-filter').value || null);
  if (res.error) { tbody.innerHTML = '<tr><td colspan="6">Impossible de charger les avis (la migration 20261004200000 est-elle appliquée ?).</td></tr>'; return; }
  const rows = res.data || [];
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="muted">Aucun avis dans cet état.</td></tr>'; return; }
  tbody.innerHTML = rows.map(x => `
    <tr data-review="${x.id}">
      <td>${new Date(x.submitted_at || x.created_at).toLocaleDateString('fr-FR')}</td>
      <td>${escapeHtml(x.partner_name || '—')}</td>
      <td class="stars-cell" aria-label="${x.rating} sur 5">${'★'.repeat(x.rating || 0)}${'☆'.repeat(5 - (x.rating || 0))}</td>
      <td><strong>${escapeHtml(x.author_label || '')}</strong> <span class="muted">(${escapeHtml(x.lang)})</span><div style="white-space:pre-wrap;max-width:520px">${escapeHtml(x.comment || '')}</div>${x.partner_reply ? `<div class="muted" style="margin-top:6px">Réponse de l’agence : ${escapeHtml(x.partner_reply)}</div>` : ''}</td>
      <td><span class="tag tag-${x.status === 'published' ? 'published' : x.status === 'pending' ? 'review' : 'inactive'}">${escapeHtml(REVIEW_STATUS_FR[x.status] || x.status)}</span></td>
      <td class="sg-actions">${x.status !== 'published' ? `<button class="btn btn-primary" onclick="moderateReview('${x.id}','publish')">Publier</button>` : ''}${x.status !== 'rejected' ? `<button class="btn btn-danger" onclick="moderateReview('${x.id}','reject')">Refuser</button>` : ''}</td>
    </tr>`).join('');
}

async function moderateReview(id, decision) {
  if (decision === 'reject' && !(await askConfirm('Refuser cet avis ?', 'Il ne sera pas affiché. Vous pourrez le publier plus tard si vous changez d’avis.', 'Refuser'))) return;
  const res = await window.ZFindServices.followup.moderateReview(id, decision);
  showStatus(res.error ? 'error' : 'success', res.error ? 'Impossible d’enregistrer la décision.' : decision === 'publish' ? 'Avis publié.' : 'Avis refusé.');
  loadReviewsList();
}

/* ---------------- Small shared helpers ---------------- */
async function getZonesCached() {
  if (adminState.zonesCache) return adminState.zonesCache;
  const result = await window.ZFindServices.admin.listZones();
  adminState.zonesCache = result.data || [];
  return adminState.zonesCache;
}
async function getPartnersCached() {
  if (adminState.partnersCache) return adminState.partnersCache;
  const result = await window.ZFindServices.admin.listPartners();
  adminState.partnersCache = result.data || [];
  return adminState.partnersCache;
}
/* ---------------- Searchable zone combo (pattern from Z Imobiliária's admin) ----------------
   Renders as HTML (call inside a template literal), backed by a
   hidden <input>, so every existing call site that reads
   document.getElementById(id).value keeps working with zero changes. */
let zoneComboZones = {};
function zoneComboHTML(id, zones, selectedId) {
  zoneComboZones[id] = zones;
  const selectedZone = zones.find(z => String(z.id) === String(selectedId));
  return `
    <div class="zone-combo" id="${id}-wrap">
      <input type="hidden" id="${id}" value="${selectedId || ''}">
      <button type="button" class="zone-combo-btn" onclick="toggleZoneCombo('${id}')">
        <span id="${id}-label">${selectedZone ? escapeHtml(selectedZone.name) + ', ' + escapeHtml(selectedZone.city) : '— Choisir la zone —'}</span>
        <span style="opacity:.6">▾</span>
      </button>
      <div class="zone-combo-panel" id="${id}-panel">
        <input type="text" class="zone-combo-search" placeholder="Rechercher une zone…" oninput="renderZoneComboList('${id}', this.value)" onclick="event.stopPropagation()">
        <div class="zone-combo-list" id="${id}-list"></div>
      </div>
    </div>`;
}
function toggleZoneCombo(id) {
  const panel = document.getElementById(id + '-panel');
  const wasOpen = panel.classList.contains('open');
  document.querySelectorAll('.zone-combo-panel.open').forEach(p => p.classList.remove('open'));
  if (!wasOpen) { panel.classList.add('open'); renderZoneComboList(id, ''); }
}
function renderZoneComboList(id, filter) {
  const list = document.getElementById(id + '-list');
  if (!list) return;
  const q = (filter || '').toLowerCase().trim();
  const zones = zoneComboZones[id] || [];
  const selected = document.getElementById(id).value;
  const matches = zones.filter(z => !q || z.name.toLowerCase().includes(q) || z.city.toLowerCase().includes(q));
  list.innerHTML = matches.length
    ? matches.map(z => `<button type="button" class="zone-combo-item ${String(z.id)===String(selected)?'selected':''}" onclick="selectZoneCombo('${id}','${z.id}')">${escapeHtml(z.name)}, ${escapeHtml(z.city)}</button>`).join('')
    : '<div class="zone-combo-empty">Aucun résultat.</div>';
}
function selectZoneCombo(id, zoneId) {
  document.getElementById(id).value = zoneId;
  const zone = (zoneComboZones[id] || []).find(z => String(z.id) === String(zoneId));
  document.getElementById(id + '-label').textContent = zone ? zone.name + ', ' + zone.city : '';
  document.getElementById(id + '-panel').classList.remove('open');
}
document.addEventListener('click', (e) => {
  document.querySelectorAll('.zone-combo-panel.open').forEach(p => {
    const wrap = p.closest('.zone-combo');
    if (wrap && !wrap.contains(e.target)) p.classList.remove('open');
  });
});

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

/** Lightbox — click a media thumbnail to view it full-size. Pattern
    adapted from Z Imobiliária's admin. */
function openLightbox(url) {
  if (!url) return;
  const overlay = document.getElementById('lightbox-overlay');
  overlay.innerHTML = `<img src="${url}" alt="">`;
  overlay.classList.remove('hidden');
}
function closeLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  overlay.classList.add('hidden');
  overlay.innerHTML = '';
}

document.addEventListener('DOMContentLoaded', initAdmin);
