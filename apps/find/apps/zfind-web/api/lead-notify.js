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
   Also (migration 20261004200000): owner estimation requests the Admin
   assigned to an agency (only with the owner's consent) are sent to it,
   and the daily job sends ONE reminder for enquiries still unanswered
   after 24 hours.
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

/* ---------------- Owner estimation requests assigned by the Admin ---------------- */
const PROJECT_FR = { sell_3m: 'Vendre d’ici 3 mois', sell_12m: 'Vendre dans l’année', later: 'Vendre plus tard', curious: 'Simple curiosité' };
const CONF_FR = { high: 'élevée', medium: 'moyenne', low: 'limitée' };

function eur(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v) + ' €' : '—';
}

function estimationEmail(row, bcc) {
  const p = row.property || {}; const e = row.estimate || {};
  const place = S.oneLine(row.place || 'votre secteur', 120);
  const rows = [
    ['Bien', p.line || place],
    ['Estimation Z Find', e.low ? `${eur(e.low)} – ${eur(e.high)} (valeur centrale ${eur(e.central)}, fiabilité ${CONF_FR[e.confidence] || '—'})` : '—'],
    ['Précisions', p.details && p.details !== '—' ? p.details : '—'],
    ['Projet', PROJECT_FR[row.project] || '—'],
    ['Nom', row.name || '—'],
    ['E-mail', row.email || '—'],
    ['Téléphone', row.phone || '—']
  ];
  const heading = `Un propriétaire à ${place} souhaite être accompagné`;
  const intro = 'Ce propriétaire a demandé une estimation sur Z Find et a accepté, séparément, d’être mis en relation avec une seule agence partenaire de sa commune : la vôtre. Contactez-le de préférence dans les 24 heures pour lui proposer un avis de valeur.';
  const html = S.mailHtml('fr', heading,
    `<p style="line-height:1.6">${S.esc(intro)}</p><table style="border-collapse:collapse;margin-top:8px">${rows.map(([k, v]) =>
      `<tr><td style="padding:6px 18px 6px 0;color:#7a7266;vertical-align:top">${S.esc(k)}</td><td style="padding:6px 0;font-weight:600">${S.esc(v)}</td></tr>`).join('')}</table>` +
    '<p style="line-height:1.6;color:#4a453d;margin-top:16px">Pour lui répondre, utilisez simplement « Répondre » : votre réponse part directement au propriétaire. L’estimation Z Find est statistique ; seul votre avis de valeur après visite engage l’agence.</p>',
    'Ces coordonnées vous sont transmises avec l’accord du propriétaire, pour cette seule demande. Elles ne peuvent servir qu’à lui répondre. Z Find · hello@zfind.online');
  const text = [heading, '', intro, '', ...rows.map(([k, v]) => `${k} : ${v}`)].join('\n');
  const msg = { to: row.recipients, subject: S.oneLine(`Nouveau vendeur via Z Find — ${place}`, 150), html, text };
  if (bcc && bcc.length) msg.bcc = bcc;
  if (row.email && S.EMAIL_RE.test(row.email)) msg.reply_to = row.email;
  return msg;
}

async function processEstimations(limit) {
  const report = { sent: 0, failed: 0, skipped: 0 };
  const found = await S.db('rpc/zfind_pending_estimation_forwards', { method: 'POST', body: { p_limit: limit || 20 } });
  const rows = Array.isArray(found) ? found : [];
  const zfind = S.env('ZFIND_LEAD_NOTIFY_EMAIL');
  for (const row of rows) {
    const recipients = (row.recipients || []).filter(e => S.EMAIL_RE.test(e)).slice(0, 5);
    if (!recipients.length) { report.skipped += 1; continue; } // stays pending: the Admin sees « non transmise »
    try {
      await S.sendMail(estimationEmail(Object.assign({}, row, { recipients }), zfind ? [zfind] : []));
      await S.db('rpc/zfind_mark_estimations_forwarded', { method: 'POST', body: { p_ids: [row.request_id], p_delivered: true } });
      report.sent += 1;
    } catch (e) {
      console.error('lead-notify: estimation', row.request_id, e.message);
      await S.db('rpc/zfind_mark_estimations_forwarded', { method: 'POST', body: { p_ids: [row.request_id], p_delivered: false } }).catch(() => {});
      report.failed += 1;
    }
  }
  return report;
}

/* ---------------- 24 h without an answer: one reminder to the agency ---------------- */
function reminderEmail(row) {
  const title = S.oneLine(row.listing_title || 'votre annonce', 120);
  const when = new Date(row.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
  const heading = 'Une demande attend votre réponse';
  const intro = `${row.name || 'Une personne'} vous a contacté le ${when} au sujet de « ${title} » et la demande n’est pas encore marquée comme répondue.`;
  const next = 'Si vous avez déjà répondu, marquez-la « Répondue » dans votre espace : c’est ainsi que Z Find suit le délai de réponse promis aux acheteurs et locataires.';
  const contact = [row.email, row.phone].filter(Boolean).join(' · ');
  const html = S.mailHtml('fr', heading,
    `<p style="line-height:1.6">${S.esc(intro)}</p>${contact ? `<p style="line-height:1.6"><strong>${S.esc(contact)}</strong></p>` : ''}<p style="line-height:1.6;color:#4a453d">${S.esc(next)}</p>` + S.button(partnerUrl(), 'Voir mes demandes'),
    'Un seul rappel par demande. Z Find · hello@zfind.online');
  const text = [heading, '', intro, contact, '', next, '', `Vos demandes : ${partnerUrl()}`].join('\n');
  const msg = { to: row.recipients, subject: S.oneLine(`Rappel : demande sans réponse — ${title}`, 150), html, text };
  if (row.email && S.EMAIL_RE.test(row.email)) msg.reply_to = row.email;
  return msg;
}

async function processReminders(limit) {
  const report = { sent: 0, failed: 0 };
  const found = await S.db('rpc/zfind_pending_lead_reminders', { method: 'POST', body: { p_limit: limit || 50 } });
  const rows = Array.isArray(found) ? found : [];
  const done = [];
  for (const row of rows) {
    const recipients = (row.recipients || []).filter(e => S.EMAIL_RE.test(e)).slice(0, 5);
    if (!recipients.length) { done.push(row.lead_id); continue; }
    try {
      await S.sendMail(reminderEmail(Object.assign({}, row, { recipients })));
      done.push(row.lead_id);
      report.sent += 1;
    } catch (e) {
      console.error('lead-notify: reminder', row.lead_id, e.message);
      report.failed += 1;
    }
  }
  if (done.length) await S.db('rpc/zfind_mark_lead_reminders', { method: 'POST', body: { p_ids: done } });
  return report;
}

async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return S.sendJson(res, 405, { ok: false });
  if (!S.configured(['db', 'mail'])) return S.sendJson(res, 503, { ok: false, error: 'not_configured' });
  if (S.limited(req, 20, 10 * 60 * 1000)) return S.sendJson(res, 429, { ok: false });
  try {
    await processPending(10);
    // Also called by the Admin right after assigning an owner's request to an agency.
    await processEstimations(10).catch(e => console.error('lead-notify: estimations', e.message));
    return S.sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error('lead-notify', e.message);
    return S.sendJson(res, 500, { ok: false });
  }
}

module.exports = handler;
module.exports._internals = { processPending, leadEmail, price, processEstimations, estimationEmail, processReminders, reminderEmail };
