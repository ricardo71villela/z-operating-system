/* ============================================================
   Z FIND — /api/alerts (Vercel serverless function)

   POST {action:'subscribe', kind:'search', email, lang, consent:true,
         filters, query, website}          → pending + confirmation e-mail
   GET  ?action=confirm&token=…            → page with a "confirm" button
   POST ?action=confirm  (form, token)     → active
   GET  ?action=unsubscribe&token=…        → page with an "unsubscribe" button
   POST ?action=unsubscribe (form or RFC 8058 one-click) → unsubscribed

   Links opened from an e-mail never change anything by themselves (mail
   scanners open links): the change needs the button on the page.
   Value alerts are created by /api/estimation with the report.
   ============================================================ */
'use strict';

const S = require('./_lib/server');
const core = require('./_lib/alerts-core');

const PAGE = {
  fr: {
    confirmTitle: 'Confirmer votre alerte', confirmBody: 'Cliquez pour activer l’alerte :', confirmButton: 'Confirmer mon alerte',
    confirmedTitle: 'Alerte activée', confirmedBody: { search: 'Vous recevrez au plus un e-mail par semaine, seulement quand de nouvelles annonces correspondent à votre recherche.', value: 'Vous recevrez la nouvelle estimation de votre bien à chaque mise à jour officielle des prix.' },
    unsubTitle: 'Se désinscrire', unsubBody: 'Vous ne recevrez plus cette alerte :', unsubButton: 'Me désinscrire',
    unsubDoneTitle: 'Désinscription faite', unsubDoneBody: 'Vous ne recevrez plus cette alerte. Vos données seront effacées sous 30 jours.',
    missingTitle: 'Lien expiré', missingBody: 'Cette alerte n’existe plus (les demandes non confirmées sont effacées après 30 jours).',
    unavailableTitle: 'Service momentanément indisponible', unavailableBody: 'Réessayez dans quelques minutes.'
  },
  en: {
    confirmTitle: 'Confirm your alert', confirmBody: 'Click to activate the alert:', confirmButton: 'Confirm my alert',
    confirmedTitle: 'Alert activated', confirmedBody: { search: 'You will receive at most one e-mail a week, only when new listings match your search.', value: 'You will receive the new estimate of your property after each official price update.' },
    unsubTitle: 'Unsubscribe', unsubBody: 'You will no longer receive this alert:', unsubButton: 'Unsubscribe',
    unsubDoneTitle: 'Unsubscribed', unsubDoneBody: 'You will no longer receive this alert. Your data will be erased within 30 days.',
    missingTitle: 'Link expired', missingBody: 'This alert no longer exists (unconfirmed requests are erased after 30 days).',
    unavailableTitle: 'Service temporarily unavailable', unavailableBody: 'Please try again in a few minutes.'
  }
};

async function findByToken(token) {
  if (!S.UUID_RE.test(String(token || ''))) return null;
  const rows = await S.db(`zfind_alert_subscriptions?token=eq.${token}&select=id,kind,email,lang,criteria,status,token`);
  return rows && rows[0] ? rows[0] : null;
}

function describe(row) {
  const l = S.lang(row.lang);
  return row.kind === 'value' ? core.describeValue(row.criteria, l) : core.describeSearch(row.criteria, l);
}

function actionForm(action, token, label) {
  return `<form method="post" action="/api/alerts?action=${action}"><input type="hidden" name="token" value="${S.esc(token)}"><button type="submit">${S.esc(label)}</button></form>`;
}

async function subscribe(req, res) {
  if (S.limited(req, 6, 600000)) return S.sendJson(res, 429, { ok: false, error: 'rate_limited' });
  let body;
  try { body = await S.readBody(req); } catch (_) { return S.sendJson(res, 400, { ok: false, error: 'body' }); }
  if (body.website) return S.sendJson(res, 200, { ok: true, status: 'pending' }); // honeypot
  if (body.consent !== true) return S.sendJson(res, 400, { ok: false, error: 'consent' });
  if (body.kind !== 'search') return S.sendJson(res, 400, { ok: false, error: 'kind' });
  if (!S.EMAIL_RE.test(String(body.email || '').trim())) return S.sendJson(res, 400, { ok: false, error: 'email' });
  const normalized = await core.normalizeSearchCriteria(body.filters, body.query);
  if (!normalized.ok) return S.sendJson(res, 400, { ok: false, error: normalized.error });
  try {
    const result = await core.createSubscription({ kind: 'search', email: body.email, lang: body.lang, criteria: normalized.criteria });
    return S.sendJson(res, result.ok ? 200 : 400, result);
  } catch (e) {
    console.error('alerts: subscribe', e.message);
    return S.sendJson(res, 502, { ok: false, error: 'send' });
  }
}

async function handler(req, res) {
  const query = S.queryOf(req);
  const action = query.action || '';
  if (!S.configured(['db', 'mail'])) {
    console.error('alerts: not configured (ZFIND_SUPABASE_SERVICE_KEY, RESEND_API_KEY, ZFIND_EMAIL_FROM)');
    if (req.method === 'GET') return S.sendPage(res, 503, 'fr', PAGE.fr.unavailableTitle, `<p>${PAGE.fr.unavailableBody}</p>`);
    return S.sendJson(res, 503, { ok: false, error: 'not_configured' });
  }

  try {
    if (req.method === 'POST' && (action === 'subscribe' || !action)) return await subscribe(req, res);

    if (action === 'confirm' || action === 'unsubscribe') {
      let token = query.token;
      if (req.method === 'POST') {
        const body = await S.readBody(req).catch(() => ({}));
        token = body.token || token;
      } else if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET, POST');
        return S.sendJson(res, 405, { ok: false, error: 'method' });
      }
      const row = await findByToken(token);
      const l = S.lang(row ? row.lang : query.lang);
      const p = PAGE[l];
      if (!row || (action === 'confirm' && row.status === 'unsubscribed')) return S.sendPage(res, 404, l, p.missingTitle, `<p>${p.missingBody}</p>`);
      const what = `<p><strong>${S.esc(describe(row))}</strong></p>`;

      if (action === 'confirm') {
        if (row.status === 'active') return S.sendPage(res, 200, l, p.confirmedTitle, what + `<p>${p.confirmedBody[row.kind]}</p>`);
        if (req.method === 'GET') return S.sendPage(res, 200, l, p.confirmTitle, `<p>${p.confirmBody}</p>${what}${actionForm('confirm', row.token, p.confirmButton)}`);
        await S.db(`zfind_alert_subscriptions?id=eq.${row.id}&status=eq.pending`, { method: 'PATCH', body: { status: 'active', confirmed_at: new Date().toISOString() }, prefer: 'return=minimal' });
        return S.sendPage(res, 200, l, p.confirmedTitle, what + `<p>${p.confirmedBody[row.kind]}</p>`);
      }

      if (row.status === 'unsubscribed') return S.sendPage(res, 200, l, p.unsubDoneTitle, `<p>${p.unsubDoneBody}</p>`);
      if (req.method === 'GET') return S.sendPage(res, 200, l, p.unsubTitle, `<p>${p.unsubBody}</p>${what}${actionForm('unsubscribe', row.token, p.unsubButton)}`);
      await S.db(`zfind_alert_subscriptions?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }, prefer: 'return=minimal' });
      return S.sendPage(res, 200, l, p.unsubDoneTitle, `<p>${p.unsubDoneBody}</p>`);
    }

    res.setHeader('Allow', 'GET, POST');
    return S.sendJson(res, 405, { ok: false, error: 'method' });
  } catch (e) {
    console.error('alerts:', e.message);
    if (req.method === 'GET' || action === 'confirm' || action === 'unsubscribe') return S.sendPage(res, 500, 'fr', PAGE.fr.unavailableTitle, `<p>${PAGE.fr.unavailableBody}</p>`);
    return S.sendJson(res, 500, { ok: false, error: 'server' });
  }
}

module.exports = handler;
module.exports._internals = { PAGE, findByToken };
