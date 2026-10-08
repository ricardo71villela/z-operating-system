// Acesso a tabela public.radar_suivi (Supabase) — seguimento de cada morada.
// So as Vercel Functions falam com o Supabase (chave service_role nas
// variaveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY); o browser
// nunca ve a chave. A tabela tem RLS ativo e nenhuma politica: nem a chave
// publica (anon) a consegue ler.

const STATUTS = Object.freeze({
  courrier: 'Courrier envoyé',
  relance: 'À relancer',
  repondu: 'A répondu',
  rdv: 'RDV / estimation',
  mandat: 'Mandat signé',
  refus: 'Pas intéressé',
  ne_plus: 'Ne plus contacter'
});

function config() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return url && key ? { url, key } : null;
}

async function call(path, init = {}) {
  const cfg = config();
  if (!cfg) {
    const e = new Error('Suivi non configuré : ajouter SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans Vercel.');
    e.status = 503;
    throw e;
  }
  const r = await fetch(cfg.url + '/rest/v1/' + path, Object.assign({}, init, {
    headers: Object.assign({
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      'Content-Type': 'application/json'
    }, init.headers || {})
  }));
  if (!r.ok) {
    const e = new Error('Supabase HTTP ' + r.status + ' : ' + (await r.text()).slice(0, 200));
    e.status = 502;
    throw e;
  }
  return r.status === 204 ? null : r.json();
}

async function listAll() {
  return call('radar_suivi?select=adresse,statut,note,relance_le,courrier_le,updated_at&order=updated_at.desc&limit=20000');
}

// Grava (insere ou atualiza) as moradas dadas; devolve as linhas gravadas.
async function upsert(rows) {
  if (!rows.length) return [];
  return call('radar_suivi?on_conflict=adresse', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows.map(r => Object.assign({}, r, { updated_at: new Date().toISOString() })))
  });
}

module.exports = { STATUTS, config, listAll, upsert };
