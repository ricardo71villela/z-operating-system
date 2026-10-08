// Seguimento das moradas (mesma password que o resto do site).
//   GET  /api/suivi            -> { statuts, rows: [{adresse, statut, note, relance_le, courrier_le, updated_at}] }
//   POST /api/suivi  {adresse, statut, note, relance_le}  -> linha gravada
// statut vazio/null = "Non contacté" (a linha fica, com a nota se houver).

const { checkAuth } = require('./_auth');
const store = require('./_suivi-store');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (!checkAuth(req, res)) return;
  try {
    if (req.method === 'GET') {
      return send(res, 200, { statuts: store.STATUTS, rows: await store.listAll() });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });

    const b = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const adresse = String(b.adresse || '').trim();
    const statut = b.statut ? String(b.statut) : null;
    const note = b.note == null ? null : String(b.note).slice(0, 2000);
    const relance = b.relance_le ? String(b.relance_le) : null;
    if (!adresse || adresse.length > 300) return send(res, 400, { error: 'Adresse invalide.' });
    if (statut && !(statut in store.STATUTS)) return send(res, 400, { error: 'Statut invalide.' });
    if (relance && !DATE_RE.test(relance)) return send(res, 400, { error: 'Date de relance invalide.' });

    const [row] = await store.upsert([{ adresse, statut, note, relance_le: relance }]);
    return send(res, 200, row || {});
  } catch (e) {
    return send(res, e.status || 500, { error: e.message || 'Erreur.' });
  }
};
