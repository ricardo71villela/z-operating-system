/* ============================================================
   Z FIND PARTNER — « Statistiques »
   ============================================================
   Vues des annonces, demandes de contact et demandes de visite,
   par mois (6 derniers mois) et par annonce. Les vues sont comptées
   par le site (une par annonce et par onglet, aucune donnée sur le
   visiteur) ; le même bilan part chaque mois par e-mail.
   Serveur : RPC zfind_partner_stats (migration 20261029180000).
   ============================================================ */

const pstats = { data: null, months: 6 };
const PSTATS_STATUS = { published: 'Publiée', archived: 'Archivée', suspended: 'Suspendue', draft: 'Brouillon', pending_review: 'En attente de validation', ready: 'Prête à publier' };

function pstatsMonth(iso, long) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  return new Intl.DateTimeFormat('fr-FR', { month: long ? 'long' : 'short', year: long ? 'numeric' : undefined, timeZone: 'UTC' }).format(d);
}
function pstatsN(v) { return new Intl.NumberFormat('fr-FR').format(Number(v) || 0); }

async function showStatsView() {
  partnerShowView('view-stats');
  const host = document.getElementById('pstats-root');
  if (host) host.innerHTML = '<div class="pimp-card"><p class="pimp-muted">Chargement…</p></div>';
  const sb = window.ZFindServices.supabaseClient.getSupabaseClient();
  const res = await Promise.resolve(sb.rpc('zfind_partner_stats', { p_months: pstats.months })).catch(e => ({ error: e }));
  if (!res || res.error || !res.data) {
    if (host) host.innerHTML = '<div class="pimp-card"><p class="pimp-bad">Impossible de lire vos statistiques. Réessayez dans un instant.</p></div>';
    return;
  }
  pstats.data = res.data;
  renderPartnerStats();
}

function pstatsTrend(cur, prev) {
  if (!prev) return cur ? '<span class="pstats-trend up">nouveau</span>' : '';
  const p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return '<span class="pstats-trend">=</span>';
  return `<span class="pstats-trend ${p > 0 ? 'up' : 'down'}">${p > 0 ? '+' : '−'}${Math.abs(p)} %</span>`;
}

function renderPartnerStats() {
  const host = document.getElementById('pstats-root');
  const d = pstats.data;
  if (!host || !d) return;
  const months = d.months || [];
  const cur = months[months.length - 1] || { views: 0, contacts: 0, visits: 0 };
  const prev = months[months.length - 2] || { views: 0, contacts: 0, visits: 0 };
  const max = Math.max(1, ...months.map(m => Number(m.views) || 0));
  const totals = months.reduce((a, m) => ({ views: a.views + (+m.views || 0), contacts: a.contacts + (+m.contacts || 0), visits: a.visits + (+m.visits || 0) }), { views: 0, contacts: 0, visits: 0 });
  const rate = totals.views ? Math.round(((totals.contacts + totals.visits) / totals.views) * 1000) / 10 : null;
  const listings = d.listings || [];
  host.innerHTML = `
    <div class="pimp-counts pstats-kpis">
      <div class="pimp-count info"><strong>${pstatsN(cur.views)}</strong><span>vues ce mois-ci ${pstatsTrend(+cur.views || 0, +prev.views || 0)}</span></div>
      <div class="pimp-count good"><strong>${pstatsN(cur.contacts)}</strong><span>demandes de contact ${pstatsTrend(+cur.contacts || 0, +prev.contacts || 0)}</span></div>
      <div class="pimp-count good"><strong>${pstatsN(cur.visits)}</strong><span>demandes de visite ${pstatsTrend(+cur.visits || 0, +prev.visits || 0)}</span></div>
      <div class="pimp-count"><strong>${pstatsN(d.published)}</strong><span>annonces publiées</span></div>
    </div>
    <div class="pimp-card">
      <h3 class="pstats-h">Vues des annonces, ${months.length} derniers mois</h3>
      <div class="pstats-chart" role="img" aria-label="Vues par mois">
        ${months.map(m => `<div class="pstats-col"><span class="pstats-val">${pstatsN(m.views)}</span><span class="pstats-bar" style="height:${Math.round(((+m.views || 0) / max) * 100)}%"></span><span class="pstats-label">${pstatsMonth(m.month)}</span></div>`).join('')}
      </div>
      <div class="pimp-wrap"><table class="pstats-table">
        <thead><tr><th>Mois</th><th>Vues</th><th>Contacts</th><th>Visites</th></tr></thead>
        <tbody>${months.slice().reverse().map(m => `<tr><td>${pstatsMonth(m.month, true)}</td><td>${pstatsN(m.views)}</td><td>${pstatsN(m.contacts)}</td><td>${pstatsN(m.visits)}</td></tr>`).join('')}</tbody>
      </table></div>
      ${rate != null ? `<p class="pimp-muted">Sur ${months.length} mois : ${pstatsN(totals.views)} vues, ${pstatsN(totals.contacts + totals.visits)} demandes, soit ${String(rate).replace('.', ',')} demande${rate > 1 ? 's' : ''} pour 100 vues.</p>` : ''}
    </div>
    <div class="pimp-card">
      <h3 class="pstats-h">Par annonce (${months.length} derniers mois)</h3>
      ${listings.length ? `<div class="pimp-wrap"><table class="pstats-table">
        <thead><tr><th>Annonce</th><th>Statut</th><th>Vues</th><th>Contacts</th><th>Visites</th></tr></thead>
        <tbody>${listings.map(l => `<tr><td>${escapeHtmlPartner(l.title)}</td><td>${escapeHtmlPartner(PSTATS_STATUS[l.status] || l.status || '')}</td><td>${pstatsN(l.views)}</td><td>${pstatsN(l.contacts)}</td><td>${pstatsN(l.visits)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="pimp-muted">Aucune annonce publiée pour le moment : les chiffres apparaîtront dès la première publication.</p>'}
      <p class="pimp-muted">Une vue = une personne qui ouvre la page de l’annonce (une seule fois par visite, robots exclus). Aucune donnée personnelle n’est enregistrée. Le bilan du mois vous est aussi envoyé par e-mail le 1er de chaque mois.</p>
    </div>`;
}
