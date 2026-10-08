#!/usr/bin/env python3
"""Acrescenta ao dashboard (private/dashboard.html) o seguimento das moradas
e as cartas em lote (8/10/2026). Idempotente: nao faz nada se ja aplicado.

    python3 scripts/patch-dashboard-suivi.py

Depois: node scripts/split-dashboard.js
"""
import os
import sys

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PATH = os.path.join(SITE, "private", "dashboard.html")
MARK = "/* radar-suivi v1 */"

CSS = MARK + """
.sel-td{width:34px;text-align:center}
.sel-cb{width:16px;height:16px;cursor:pointer;accent-color:var(--gold)}
.suivi-pill{display:inline-block;margin-left:.4rem;padding:.05rem .45rem;border-radius:999px;font-size:.68rem;font-weight:600;
  background:var(--gold-soft);color:var(--ink);border:1px solid var(--line);vertical-align:middle}
.suivi-pill.s-courrier{background:#E6EEF8;color:#1D3F6E;border-color:#C7D6EA}
.suivi-pill.s-relance{background:#FFF1D6;color:#7A4B00;border-color:#F0D49B}
.suivi-pill.s-repondu,.suivi-pill.s-rdv{background:#E3F4EA;color:#145A32;border-color:#BFE3CC}
.suivi-pill.s-mandat{background:#145A32;color:#fff;border-color:#145A32}
.suivi-pill.s-refus,.suivi-pill.s-ne_plus{background:#F1F1F1;color:#6B6B6B;border-color:#DDD}
.suivi-pill.late{box-shadow:0 0 0 2px #E8A33D inset}
.suivi-box{margin-top:.8rem;padding:.8rem 1rem;border:1px solid var(--line);border-radius:10px;background:var(--gold-soft)}
.suivi-box h4{margin:0 0 .5rem 0}
.suivi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.6rem;align-items:end}
.suivi-grid label{display:flex;flex-direction:column;gap:.25rem;font-size:.75rem;color:var(--ink-soft)}
.suivi-grid select,.suivi-grid input,.suivi-box textarea{font:inherit;font-size:.85rem;padding:.4rem .5rem;border:1px solid var(--line);
  border-radius:8px;background:#fff;color:#141413}
.suivi-box textarea{width:100%;box-sizing:border-box;min-height:58px;margin-top:.6rem;resize:vertical}
.suivi-actions{display:flex;gap:.6rem;align-items:center;margin-top:.6rem;flex-wrap:wrap}
.suivi-actions button{font:inherit;font-size:.82rem;padding:.45rem .9rem;border-radius:8px;border:0;background:var(--ink);color:#fff;cursor:pointer}
.suivi-msg{font-size:.78rem;color:var(--ink-soft)}
.sel-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:50;display:flex;gap:.7rem;align-items:center;
  flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px);padding:.6rem .9rem;border-radius:14px;
  background:#101820;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.25);font-size:.85rem}
.sel-bar button{font:inherit;font-size:.82rem;padding:.4rem .8rem;border-radius:8px;border:1px solid rgba(255,255,255,.25);
  background:transparent;color:#fff;cursor:pointer}
.sel-bar button.primary{background:#AD8A45;border-color:#AD8A45;color:#101820;font-weight:700}
.sel-bar button:disabled{opacity:.5;cursor:default}
.lt-modal{position:fixed;inset:0;z-index:60;background:rgba(16,24,32,.55);display:flex;align-items:flex-start;justify-content:center;
  padding:24px 16px;overflow:auto}
.lt-panel{background:#fff;color:#141413;border-radius:14px;max-width:820px;width:100%;padding:1rem 1.2rem;box-shadow:0 20px 50px rgba(0,0,0,.3)}
.lt-head{display:flex;justify-content:space-between;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.6rem}
.lt-head h3{margin:0;font-size:1.05rem}
.lt-panel button{font:inherit;font-size:.82rem;padding:.4rem .8rem;border-radius:8px;border:1px solid #D8DEE4;background:#fff;cursor:pointer}
.lt-panel button.primary{background:#101820;color:#fff;border-color:#101820}
.lt-item{border-top:1px solid #E8EBEE;padding:.7rem 0}
.lt-item h4{margin:0 0 .4rem 0;font-size:.85rem;display:flex;justify-content:space-between;gap:.6rem;align-items:center}
.lt-item textarea{width:100%;box-sizing:border-box;min-height:260px;font:13px/1.45 Georgia,serif;padding:.6rem;border:1px solid #D8DEE4;border-radius:8px}
.lt-hint{font-size:.78rem;color:#4C5F73;margin:.2rem 0 .4rem}
.suivi-warn{margin:.6rem 0;padding:.5rem .8rem;border-radius:8px;background:#FFF1D6;color:#7A4B00;font-size:.8rem}
"""

FILTER = """
    <select id="suiviSelect" title="Suivi des contacts">
      <option value="">Suivi : tous</option>
      <option value="NONE">Non contactées</option>
      <option value="ARELANCER">À relancer (7 jours)</option>
      <option value="courrier">Courrier envoyé</option>
      <option value="relance">À relancer</option>
      <option value="repondu">A répondu</option>
      <option value="rdv">RDV / estimation</option>
      <option value="mandat">Mandat signé</option>
      <option value="refus">Pas intéressé</option>
      <option value="ne_plus">Ne plus contacter</option>
    </select>"""

JS = """
/* radar-suivi v1 — seguimento das moradas e cartas em lote */
const SUIVI = new Map();
let SUIVI_OK = false, SUIVI_ERR = '';
const SUIVI_LBL = {courrier:'Courrier envoyé', relance:'À relancer', repondu:'A répondu', rdv:'RDV / estimation',
  mandat:'Mandat signé', refus:'Pas intéressé', ne_plus:'Ne plus contacter'};
const SELECTION = new Set();
const SEL_MAX = 100;
const escHtml = (s)=> String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayIso = ()=> new Date().toISOString().slice(0,10);
const isoPlus = (d)=> { const t = new Date(); t.setDate(t.getDate()+d); return t.toISOString().slice(0,10); };

async function loadSuivi(){
  try{
    const r = await fetch('/api/suivi', {cache:'no-store'});
    const j = await r.json();
    if(!r.ok) throw new Error(j.error || ('HTTP '+r.status));
    SUIVI.clear();
    (j.rows||[]).forEach(x=>SUIVI.set(x.adresse, x));
    SUIVI_OK = true; SUIVI_ERR = '';
  }catch(e){ SUIVI_OK = false; SUIVI_ERR = e.message; }
  renderSuiviWarn();
}

function renderSuiviWarn(){
  let el = document.getElementById('suiviWarn');
  if(!el){
    el = document.createElement('div'); el.id = 'suiviWarn'; el.className = 'suivi-warn';
    const card = document.querySelector('.table-card'); card.parentNode.insertBefore(el, card);
  }
  el.hidden = SUIVI_OK;
  el.textContent = 'Suivi des contacts indisponible : ' + SUIVI_ERR;
}

function suiviMatches(r){
  const f = state.suivi; if(!f) return true;
  const s = SUIVI.get(r[IDX.adresse]);
  if(f === 'NONE') return !s || !s.statut;
  if(f === 'ARELANCER') return !!(s && s.relance_le && s.relance_le <= isoPlus(7) && !['mandat','refus','ne_plus'].includes(s.statut));
  return !!(s && s.statut === f);
}

function suiviPill(r){
  const s = SUIVI.get(r[IDX.adresse]);
  if(!s || (!s.statut && !s.relance_le)) return '';
  const late = s.relance_le && s.relance_le <= todayIso() && !['mandat','refus','ne_plus'].includes(s.statut);
  const lbl = s.statut ? SUIVI_LBL[s.statut] : 'Relance';
  const rel = s.relance_le ? ' · ' + s.relance_le.split('-').reverse().join('/') : '';
  return `<span class="suivi-pill s-${s.statut||'relance'}${late?' late':''}">${escHtml(lbl+rel)}</span>`;
}

function suiviForm(r){
  const n = r[IDX.fichaIdx];
  if(n == null) return '';
  const s = SUIVI.get(r[IDX.adresse]) || {};
  const opts = ['<option value="">Non contactée</option>'].concat(Object.entries(SUIVI_LBL).map(([k,v])=>
    `<option value="${k}"${s.statut===k?' selected':''}>${v}</option>`)).join('');
  const maj = s.updated_at ? 'Mis à jour le ' + new Date(s.updated_at).toLocaleDateString('fr-FR') : '';
  const courrier = s.courrier_le ? ' · dernier courrier le ' + s.courrier_le.split('-').reverse().join('/') : '';
  return `<div class="suivi-box" data-suivi-for="${n}">
    <h4>Suivi du contact</h4>
    ${SUIVI_OK ? '' : `<p class="suivi-msg">Indisponible : ${escHtml(SUIVI_ERR)}</p>`}
    <div class="suivi-grid">
      <label>Statut<select data-f="statut">${opts}</select></label>
      <label>À relancer le<input type="date" data-f="relance_le" value="${escHtml(s.relance_le||'')}"></label>
    </div>
    <textarea data-f="note" placeholder="Note (échange, attentes, projet…)">${escHtml(s.note||'')}</textarea>
    <div class="suivi-actions">
      <button type="button" data-act="save">Enregistrer</button>
      <button type="button" data-act="lettre" style="background:#AD8A45;color:#101820">Texte du courrier</button>
      <span class="suivi-msg" data-f="msg">${escHtml(maj + courrier)}</span>
    </div>
  </div>`;
}

async function saveSuivi(box, r){
  const msg = box.querySelector('[data-f="msg"]');
  const body = { adresse: r[IDX.adresse], statut: box.querySelector('[data-f="statut"]').value || null,
    relance_le: box.querySelector('[data-f="relance_le"]').value || null, note: box.querySelector('[data-f="note"]').value || null };
  msg.textContent = 'Enregistrement…';
  try{
    const res = await fetch('/api/suivi', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const j = await res.json();
    if(!res.ok) throw new Error(j.error || ('HTTP '+res.status));
    SUIVI.set(j.adresse || body.adresse, Object.assign({}, SUIVI.get(body.adresse)||{}, j));
    msg.textContent = 'Enregistré ✓';
    const tr = box.closest('tr.detail'); const idx = tr && tr.dataset.detailFor;
    const row = idx!=null && document.querySelector(`tr.row[data-idx="${idx}"] .addr-sub`);
    if(row){ const old = row.parentNode.querySelector('.suivi-pill'); if(old) old.remove(); row.insertAdjacentHTML('beforebegin', suiviPill(r)); }
  }catch(e){ msg.textContent = 'Erreur : ' + e.message; }
}

function renderSelBar(){
  let bar = document.getElementById('selBar');
  if(!bar){
    bar = document.createElement('div'); bar.id = 'selBar'; bar.className = 'sel-bar';
    bar.innerHTML = `<span id="selCount"></span>
      <button type="button" class="primary" id="selLetters">Textes des courriers (à copier)</button>
      <button type="button" id="selFiches">Fiches d'estimation (PDF)</button>
      <button type="button" id="selClear">Vider la sélection</button>`;
    document.body.appendChild(bar);
    document.getElementById('selClear').addEventListener('click', ()=>{ SELECTION.clear(); renderSelBar(); render(); });
    document.getElementById('selLetters').addEventListener('click', ()=>generateLetters([...SELECTION], true));
    document.getElementById('selFiches').addEventListener('click', generateFiches);
  }
  bar.hidden = SELECTION.size === 0;
  document.getElementById('selCount').textContent = `${SELECTION.size} adresse(s) sélectionnée(s)` + (SELECTION.size > SEL_MAX ? ` — maximum ${SEL_MAX}` : '');
  document.getElementById('selLetters').disabled = SELECTION.size > SEL_MAX;
  document.getElementById('selFiches').disabled = SELECTION.size > SEL_MAX;
}

function toggleSel(n, on){
  n = parseInt(n,10); if(!Number.isInteger(n)) return;
  if(on) SELECTION.add(n); else SELECTION.delete(n);
  renderSelBar();
}

async function postLettres(ns, format, marquer){
  const res = await fetch('/api/lettres', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({n: ns, format, marquer})});
  if(!res.ok){ let m = 'HTTP '+res.status; try{ m = (await res.json()).error || m; }catch(_){} throw new Error(m); }
  return res;
}

// Texto das cartas, para copiar e colar no papel timbrado da agencia.
async function generateLetters(ns, marquer){
  if(!ns.length) return;
  const btn = document.getElementById('selLetters'); const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Préparation…';
  try{
    const j = await (await postLettres(ns, 'texte', marquer)).json();
    showLetters(j.lettres || [], marquer);
    if(marquer){ SELECTION.clear(); await loadSuivi(); renderSelBar(); render(); }
    if(j.retirees) alertMsg(`${j.retirees} adresse(s) « Ne plus contacter » retirée(s).`);
  }catch(e){ alertMsg('Courriers non générés : ' + e.message); }
  finally{ btn.textContent = old; btn.disabled = SELECTION.size > SEL_MAX; }
}

async function copyText(t, btn){
  try{ await navigator.clipboard.writeText(t); }
  catch(_){ const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  if(btn){ const o = btn.textContent; btn.textContent = 'Copié ✓'; setTimeout(()=>btn.textContent = o, 1500); }
}

function showLetters(lettres, marquees){
  const old = document.getElementById('ltModal'); if(old) old.remove();
  const m = document.createElement('div'); m.id = 'ltModal'; m.className = 'lt-modal';
  m.innerHTML = `<div class="lt-panel" role="dialog" aria-label="Textes des courriers">
    <div class="lt-head"><h3>${lettres.length} courrier(s) à coller sur votre papier à en-tête</h3>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        ${lettres.length>1 ? '<button type="button" class="primary" data-lt="all">Tout copier</button>' : ''}
        <button type="button" data-lt="close">Fermer</button></div></div>
    <p class="lt-hint">Copiez chaque texte et collez-le dans le modèle Word de l'agence (en-tête et coordonnées déjà imprimés).
      La fiche d'estimation de chaque adresse se joint avec « Fiches d'estimation (PDF) ».${marquees ? ' Ces adresses sont marquées « Courrier envoyé ».' : ''}</p>
    ${lettres.map((l,i)=>`<div class="lt-item"><h4><span>${i+1}. ${escHtml(l.adresse)}</span>
      <button type="button" data-lt="one" data-i="${i}">Copier</button></h4>
      <textarea readonly>${escHtml(l.texte)}</textarea></div>`).join('')}
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e)=>{
    const b = e.target.closest('[data-lt]');
    if(e.target === m || (b && b.dataset.lt === 'close')) return m.remove();
    if(!b) return;
    if(b.dataset.lt === 'one') copyText(lettres[parseInt(b.dataset.i,10)].texte, b);
    if(b.dataset.lt === 'all') copyText(lettres.map(l=>l.texte).join(String.fromCharCode(10,10,12,10)), b);
  });
}

// Fichas de estimativa (PDF) das moradas selecionadas, a juntar as cartas.
async function generateFiches(){
  const ns = [...SELECTION]; if(!ns.length) return;
  const btn = document.getElementById('selFiches'); const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Préparation…';
  const win = window.open('', '_blank');
  try{
    const blob = await (await postLettres(ns, 'fiches', false)).blob();
    const url = URL.createObjectURL(blob);
    if(win) win.location = url; else { const a = document.createElement('a'); a.href = url; a.download = 'fiches.pdf'; a.click(); }
  }catch(e){ if(win) win.close(); alertMsg('Fiches non générées : ' + e.message); }
  finally{ btn.textContent = old; btn.disabled = SELECTION.size > SEL_MAX; }
}

function alertMsg(t){
  const el = document.getElementById('suiviWarn'); if(!el) return;
  el.hidden = false; el.textContent = t;
  setTimeout(()=>{ renderSuiviWarn(); }, 8000);
}

function selectRows(rows){
  rows.forEach(r=>{ if(r[IDX.fichaIdx]!=null && (SUIVI.get(r[IDX.adresse])||{}).statut !== 'ne_plus') SELECTION.add(r[IDX.fichaIdx]); });
  renderSelBar(); render();
}

function initSuivi(){
  const sel = document.getElementById('suiviSelect');
  if(sel) sel.addEventListener('change', (e)=>{ state.suivi = e.target.value; state.page = 1; render(); });
  const tbody = document.getElementById('tbody');
  tbody.addEventListener('change', (e)=>{
    const cb = e.target.closest('.sel-cb'); if(cb) toggleSel(cb.dataset.n, cb.checked);
  });
  tbody.addEventListener('click', (e)=>{
    if(e.target.closest('.sel-td')) return;
    const btn = e.target.closest('[data-act]'); if(!btn) return;
    const box = btn.closest('.suivi-box'); const n = parseInt(box.dataset.suiviFor,10);
    if(btn.dataset.act === 'lettre') return generateLetters([n], false);
    const r = LEADS.find(x=>x[IDX.fichaIdx]===n); if(r) saveSuivi(box, r);
  }, true);
  const selPage = document.getElementById('selPage');
  if(selPage) selPage.addEventListener('change', (e)=>{
    const rows = filtered(); const start = (state.page-1)*state.pageSize;
    rows.slice(start, start+state.pageSize).forEach(r=>{ const n = r[IDX.fichaIdx]; if(n==null) return;
      if(e.target.checked && (SUIVI.get(r[IDX.adresse])||{}).statut !== 'ne_plus') SELECTION.add(n); else SELECTION.delete(n); });
    renderSelBar(); render();
  });
  renderSelBar();
  loadSuivi().then(()=>render());
}
"""


def main():
    s = open(PATH, encoding="utf-8").read()
    if MARK in s:
        print("ja aplicado — nada a fazer")
        return
    reps = []

    def rep(old, new, count=1):
        nonlocal s
        n = s.count(old)
        if n < count:
            sys.exit(f"padrao nao encontrado ({n}x): {old[:70]!r}")
        s = s.replace(old, new, count)
        reps.append(old[:40])

    # CSS : antes do fim do estilo principal do dashboard
    i = s.index("--gold-soft")
    j = s.index("</style>", i)
    s = s[:j] + CSS + s[j:]

    rep("""<th data-key="0" style="width:26%">Adresse</th>""",
        """<th class="sel-td"><input type="checkbox" class="sel-cb" id="selPage" title="Sélectionner les adresses de cette page"></th>
            <th data-key="0" style="width:26%">Adresse</th>""")
    rep("""      <option value="INCONNU">Année inconnue</option>
    </select>""", """      <option value="INCONNU">Année inconnue</option>
    </select>""" + FILTER)
    rep("periodo:'', tipoView:'TODOS',", "periodo:'', suivi:'', tipoView:'TODOS',")
    rep("""  if(state.periodo) rows = rows.filter(r=>periodoOf(r[IDX.ano])===state.periodo);""",
        """  if(state.periodo) rows = rows.filter(r=>periodoOf(r[IDX.ano])===state.periodo);
  if(state.suivi) rows = rows.filter(suiviMatches);""")
    rep("""tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Aucune adresse ne correspond à ces filtres.</td></tr>`;""",
        """tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Aucune adresse ne correspond à ces filtres.</td></tr>`;""")
    rep("""      return `<tr class="row" data-idx="${gi}">
        <td><span class="chev">""",
        """      const fn = r[IDX.fichaIdx];
      const blocked = (SUIVI.get(r[IDX.adresse])||{}).statut === 'ne_plus';
      return `<tr class="row" data-idx="${gi}">
        <td class="sel-td">${fn!=null && !blocked ? `<input type="checkbox" class="sel-cb" data-n="${fn}"${SELECTION.has(fn)?' checked':''} aria-label="Sélectionner pour courrier">` : ''}</td>
        <td><span class="chev">""")
    rep("""<span class="addr">${r[IDX.adresse]||'—'}</span><span class="addr-sub">""",
        """<span class="addr">${r[IDX.adresse]||'—'}</span>${suiviPill(r)}<span class="addr-sub">""")
    rep("""<tr class="detail" data-detail-for="${gi}"><td colspan="8">${rowDetail(r,gi)}</td></tr>""",
        """<tr class="detail" data-detail-for="${gi}"><td colspan="9">${rowDetail(r,gi)}${suiviForm(r)}</td></tr>""")
    rep("""        if(e.target.closest('a')) return;""",
        """        if(e.target.closest('a') || e.target.closest('.sel-td')) return;""")
    # Itinerario do dia : selecionar as moradas do percurso para as cartas
    rep("""    <a class="route-open" href="${mapsUrl}" target="_blank" rel="noopener">Ouvrir l'itinéraire dans Google Maps ↗</a>""",
        """    <a class="route-open" href="${mapsUrl}" target="_blank" rel="noopener">Ouvrir l'itinéraire dans Google Maps ↗</a>
    <button type="button" class="route-generate" id="routeSelect" style="margin-left:.6rem">Préparer les courriers de cet itinéraire</button>""")
    rep("""  const totalKm = route.reduce((s,p)=> s + (p._distFromPrev||0), 0);""",
        """  const totalKm = route.reduce((s,p)=> s + (p._distFromPrev||0), 0);
  window.__routeRows = route.map(p=>p.row);""")
    rep("""  document.getElementById('routeGenerateBtn').addEventListener('click', generateRoute);
""", """  document.getElementById('routeGenerateBtn').addEventListener('click', generateRoute);
  document.getElementById('routeResult').addEventListener('click', (e)=>{
    if(e.target.id === 'routeSelect' && window.__routeRows) selectRows(window.__routeRows);
  });
  initSuivi();
""")
    rep("""
init();
""", JS + """
init();
""")
    open(PATH, "w", encoding="utf-8").write(s)
    print(f"aplicado ({len(reps)} alteracoes + CSS)")


if __name__ == "__main__":
    main()
