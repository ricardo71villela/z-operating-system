/* ============================================================
   Z FIND — /api/lead-notify (Vercel serverless function)

   Sends every new buyer / tenant enquiry to the agency that represents
   the listing, by e-mail, as soon as it arrives:
   - called by the enquiry form right after the enquiry is saved (no
     data in the call: the function only processes what is pending in
     the database, so a stray call can do no harm);
   - and every day by /api/cron-daily, to catch anything missed.
   Reply-To is the person who wrote, so the agency answers directly.
   No agency account yet (or agency inactive): the enquiry goes to
   ZFIND_LEAD_NOTIFY_EMAIL so Z Find forwards it by hand.
   Migration 20261004160000_z_find_lead_notifications_v1.
   ============================================================ */
'use strict';

const S = require('./_lib/server');

const KIND = { direct: 'Demande de contact', qualified: 'Demande qualifiée (projet, budget, délai)', assisted: 'Demande d’accompagnement' };

function partnerUrl() { return S.env('PARTNER_BASE_URL', 'https://partner.zfind.online').replace(/\/+$/, ''); }

function price(row) {
  const n = Number(row.price);
  if (!Number.isFinite(n) || n <= 0) return '';
  const v = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
  const unit = (row.currency || 'EUR').toUpperCase() === 'EUR' ? ' €' : ' ' + row.currency;
  return v + unit + (row.transaction_type === 'rent' ? ' / mois' : '');
}

function leadEmail(row, to, bcc, withoutAgency) {
  const title = S.oneLine(row.listing_title || 'votre annonce', 120);
  const rows = [
    ['Annonce', [title, price(row)].filter(Boolean).join(' · ')],
    ['Nom', row.name || '—'],
    ['E-mail', row.email || '—'],
    ['Téléphone', row.phone || '—'],
    ['Type', KIND[row.contact_type] || row.contact_type || '—']
  ];
  const heading = withoutAgency ? `Demande sans agence active : ${row.partner_name || 'annonce sans agence'}` : 'Nouvelle demande pour votre annonce';
  const intro = withoutAgency
    ? 'Cette annonce n’a pas (ou plus) de compte agence actif sur Z Find : transmettez cette demande à l’agence à la main.'
    : 'Une personne vous a contacté via Z Find. Répondez-lui de préférence dans les 24 heures : c’est ce que les acheteurs et locataires attendent, et l’engagement des agences Fondateur.';
  const message = row.message ? `<p style="margin:16px 0 6px;font-weight:600">Message</p><div style="white-space:pre-wrap;line-height:1.5;background:#faf7f0;border:1px solid #e7e1d4;border-radius:6px;padding:12px">${S.esc(String(row.message).slice(0, 4000))}</div>` : '';
  const html = S.mailHtml('fr', heading,
    `<p style="line-height:1.6">${S.esc(intro)}</p><table style="border-collapse:collapse;margin-top:8px">${rows.map(([k, v]) =>
      `<tr><td style="padding:6px 18px 6px 0;color:#7a7266;vertical-align:top">${S.esc(k)}</td><td style="padding:6px 0;font-weight:600">${S.esc(v)}</td></tr>`).join('')}</table>${message}` +
    (withoutAgency ? '' : S.button(partnerUrl(), 'Voir mes demandes') + '<p style="line-height:1.6;color:#4a453d">Pour répondre, utilisez simplement « Répondre » : votre réponse part directement à cette personne.</p>'),
    'Vous recevez cet e-mail parce que votre agence est partenaire de Z Find. Les coordonnées de ce contact ne servent qu’à répondre à sa demande. Z Find · hello@zfind.online');
  const text = [heading, '', intro, '', ...rows.map(([k, v]) => `${k} : ${v}`), row.message ? `\nMessage :\n${row.message}` : '',
    withoutAgency ? '' : `\nVos demandes : ${partnerUrl()}`].join('\n');
  const msg = { to, subject: S.oneLine(`${withoutAgency ? '[À transmettre] ' : ''}Nouvelle demande : ${title}`, 150), html, text };
  if (bcc && bcc.length) msg.bcc = bcc;
  if (row.email && S.EMAIL_RE.test(row.email)) msg.reply_to = row.email;
  return msg;
}

async function mark(ids, delivered) {
  if (!ids.length) return;
  await S.db('rpc/zfind_mark_leads_notified', { method: 'POST', body: { p_ids: ids, p_delivered: delivered } });
}

/* Processes the pending enquiries. Returns { sent, forwarded, failed, skipped }. */
async function processPending(limit) {
  const report = { sent: 0, forwarded: 0, failed: 0, skipped: 0 };
  const rows = await S.db('rpc/zfind_pending_lead_notifications', { method: 'POST', body: { p_limit: limit || 20 } }) || [];
  const zfind = S.env('ZFIND_LEAD_NOTIFY_EMAIL');
  for (const row of rows) {
    const recipients = (row.recipients || []).filter(e => S.EMAIL_RE.test(e)).slice(0, 5);
    const agency = row.partner_active && recipients.length > 0;
    let msg = null;
    if (agency) msg = leadEmail(row, recipients, zfind ? [zfind] : [], false);
    else if (zfind) msg = leadEmail(row, [zfind], [], true);
    if (!msg) { await mark([row.lead_id], true); report.skipped += 1; continue; }
    try {
      await S.sendMail(msg);
      await mark([row.lead_id], true);
      report[agency ? 'sent' : 'forwarded'] += 1;
    } catch (e) {
      console.error('lead-notify:', row.lead_id, e.message);
      await mark([row.lead_id], false).catch(() => {});
      report.failed += 1;
    }
  }
  return report;
}

async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return S.sendJson(res, 405, { ok: false });
  if (!S.configured(['db', 'mail'])) return S.sendJson(res, 503, { ok: false, error: 'not_configured' });
  if (S.limited(req, 20, 10 * 60 * 1000)) return S.sendJson(res, 429, { ok: false });
  try {
    await processPending(10);
    return S.sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error('lead-notify', e.message);
    return S.sendJson(res, 500, { ok: false });
  }
}

module.exports = handler;
module.exports._internals = { processPending, leadEmail, price };
