// Cartas em lote : POST /api/lettres  { n: [fichaIdx, ...], format, marquer }
//   format "texte"  (por defeito) -> JSON { lettres: [{n, adresse, texte}] } : texto
//                    de cada carta, para copiar e colar no papel timbrado da agencia
//   format "fiches" -> UM PDF com a ficha de estimativa de cada morada (a juntar)
//   format "pdf"    -> UM PDF com carta + ficha por morada (frente/verso)
// Moradas marcadas "Ne plus contacter" sao sempre retiradas.
// Com marquer=true (por defeito), as moradas ficam com o estado
// "Courrier envoyé" e a data de hoje — exceto as que ja estao num estado
// mais avancado (respondeu, RDV, mandato, recusa).

const { checkAuth } = require('./_auth');
const { newDoc, docBuffer, drawFiche } = require('./_fiche-pdf');
const { drawLettreEtFiche, lettreTexte } = require('./_lettre-pdf');
const store = require('./_suivi-store');
const rows = require('../private/fichas-data/index.js');

const MAX = 100;
const NE_PAS_ECRASER = new Set(['repondu', 'rdv', 'mandat', 'refus', 'ne_plus']);

function fail(res, status, msg) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: msg }));
}

module.exports = async (req, res) => {
  if (!checkAuth(req, res)) return;
  if (req.method !== 'POST') return fail(res, 405, 'Méthode non autorisée.');

  let body;
  try {
    body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
  } catch (_) {
    return fail(res, 400, 'Requête invalide.');
  }
  const ns = [...new Set((Array.isArray(body.n) ? body.n : []).map(x => parseInt(x, 10)))]
    .filter(n => Number.isInteger(n) && n >= 0 && n < rows.length && rows[n]);
  if (!ns.length) return fail(res, 400, 'Aucune adresse sélectionnée.');
  if (ns.length > MAX) return fail(res, 400, `Maximum ${MAX} adresses par envoi.`);
  const format = ['texte', 'fiches', 'pdf'].includes(body.format) ? body.format : 'texte';
  // So o texto ou a carta completa marcam "Courrier envoyé" ; as fichas sozinhas nao.
  const marquer = body.marquer !== false && format !== 'fiches';

  // Estado atual (se o seguimento estiver configurado).
  let suivi = new Map();
  if (store.config()) {
    try { suivi = new Map((await store.listAll()).map(r => [r.adresse, r])); } catch (_) { /* segue sem */ }
  }
  const choisies = ns.filter(n => (suivi.get(rows[n][0]) || {}).statut !== 'ne_plus');
  if (!choisies.length) return fail(res, 400, 'Toutes ces adresses sont marquées « Ne plus contacter ».');

  try {
    const now = new Date();
    let pdf = null, lettres = null;
    if (format === 'texte') {
      lettres = choisies.map(n => ({ n, adresse: rows[n][0], texte: lettreTexte(rows[n], now) }));
    } else {
      const doc = newDoc(format === 'fiches' ? `Fiches d'estimation — ${choisies.length} adresse(s)`
        : `Courriers de prospection — ${choisies.length} adresse(s)`);
      for (const n of choisies) (format === 'fiches' ? drawFiche : drawLettreEtFiche)(doc, rows[n], now);
      pdf = await docBuffer(doc);
    }

    let marquees = 0;
    if (marquer && store.config()) {
      const today = now.toISOString().slice(0, 10);
      const maj = choisies.map(n => rows[n][0]).map(adresse => {
        const cur = suivi.get(adresse) || {};
        return {
          adresse,
          statut: NE_PAS_ECRASER.has(cur.statut) ? cur.statut : 'courrier',
          note: cur.note == null ? null : cur.note,
          relance_le: cur.relance_le || null,
          courrier_le: today
        };
      });
      try { marquees = (await store.upsert(maj)).length; } catch (_) { marquees = 0; }
    }

    res.statusCode = 200;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Radar-Courriers', String(choisies.length));
    res.setHeader('X-Radar-Retirees', String(ns.length - choisies.length));
    res.setHeader('X-Radar-Marquees', String(marquees));
    if (lettres) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ lettres, retirees: ns.length - choisies.length, marquees }));
    }
    const nom = format === 'fiches' ? 'fiches' : 'courriers';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nom}_${now.toISOString().slice(0, 10)}_${choisies.length}.pdf"`);
    res.end(pdf);
  } catch (e) {
    return fail(res, 500, 'Erreur lors de la génération des courriers.');
  }
};
