/* ============================================================
   Z FIND — /api/prospection-optout (Vercel serverless function)

   Lien « ne plus recevoir nos messages » des e-mails de prospection ZOS
   (apps/find/outreach). Chaque envoi a son jeton (zos_outreach_sends.token).

   GET  ?t=…                         → page avec un bouton « Ne plus recevoir »
   POST ?t=…  (formulaire, ou RFC 8058 one-click
               « List-Unsubscribe=One-Click » envoyé par la messagerie)
                                     → zos_outreach_opt_out(jeton)

   Un lien ouvert depuis un e-mail ne change rien tout seul (les antivirus
   de messagerie ouvrent les liens) : il faut le bouton, ou le POST
   one-click de la messagerie.
   ============================================================ */
'use strict';

const S = require('./_lib/server');

const PAGE = {
  askTitle: 'Ne plus recevoir nos messages',
  askBody: 'Vous ne recevrez plus d’e-mails de présentation de Z Find et des services ZOS à cette adresse.',
  button: 'Ne plus recevoir',
  doneTitle: 'C’est fait',
  doneBody: 'Votre adresse ne recevra plus nos messages de présentation. Si vous nous avez écrit, nous vous répondrons quand même.',
  missingTitle: 'Lien invalide',
  missingBody: 'Ce lien n’est pas reconnu. Pour ne plus recevoir nos messages, répondez simplement « STOP » à l’e-mail reçu.',
  unavailableTitle: 'Service momentanément indisponible',
  unavailableBody: 'Réessayez dans quelques minutes, ou répondez « STOP » à l’e-mail reçu.'
};

function form(token) {
  return `<form method="post" action="/api/prospection-optout?t=${S.esc(token)}"><input type="hidden" name="t" value="${S.esc(token)}"><button type="submit">${S.esc(PAGE.button)}</button></form>`;
}

async function optOut(token) {
  const result = await S.db('rpc/zos_outreach_opt_out', { method: 'POST', body: { p_token: token } });
  return result || { ok: false };
}

async function handler(req, res) {
  const query = S.queryOf(req);
  if (!S.configured(['db'])) {
    console.error('prospection-optout: not configured (ZFIND_SUPABASE_SERVICE_KEY)');
    return S.sendPage(res, 503, 'fr', PAGE.unavailableTitle, `<p>${PAGE.unavailableBody}</p>`);
  }
  try {
    let token = query.t;
    if (req.method === 'POST') {
      const body = await S.readBody(req).catch(() => ({}));
      token = token || body.t;
    } else if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST');
      return S.sendJson(res, 405, { ok: false, error: 'method' });
    }
    if (!S.UUID_RE.test(String(token || ''))) return S.sendPage(res, 404, 'fr', PAGE.missingTitle, `<p>${PAGE.missingBody}</p>`);
    if (req.method === 'GET') return S.sendPage(res, 200, 'fr', PAGE.askTitle, `<p>${PAGE.askBody}</p>${form(token)}`);
    if (S.limited(req, 20, 600000)) return S.sendJson(res, 429, { ok: false, error: 'rate_limited' });
    const result = await optOut(token);
    if (!result.ok) return S.sendPage(res, 404, 'fr', PAGE.missingTitle, `<p>${PAGE.missingBody}</p>`);
    return S.sendPage(res, 200, 'fr', PAGE.doneTitle, `<p>${PAGE.doneBody}</p>`);
  } catch (e) {
    console.error('prospection-optout:', e.message);
    return S.sendPage(res, 500, 'fr', PAGE.unavailableTitle, `<p>${PAGE.unavailableBody}</p>`);
  }
}

module.exports = handler;
module.exports._internals = { PAGE };
