/* ============================================================
   Z FIND — /api/cron-daily (Vercel Cron, every day 06:00 UTC)

   1. Data retention: unconfirmed and unsubscribed alerts after 30 days,
      alerts confirmed more than 3 years ago, review invitations never
      answered after 60 days, rejected reviews after 30 days.
   2. Review invitations due (7 days after the enquiry).
   3. Value alerts: a new e-mail only when the official data period
      behind the estimate has changed (same engine as the site).
   4. Search alerts, on Mondays: the new listings of the past week that
      match each confirmed search; no e-mail when there is nothing new.
   5. Mondays: a short activity summary to Z Find.
   6. Enquiries not yet sent to their agency (normally sent at once by
      /api/lead-notify): sent now. Same for owner estimation requests the
      Admin assigned to an agency.
   7. Enquiries unanswered 24 h after being sent: one reminder to the agency.

   Protected by CRON_SECRET (Vercel sends "Authorization: Bearer …").
   Each step is independent: one failure does not stop the others.
   ============================================================ */
'use strict';

const S = require('./_lib/server');
const core = require('./_lib/alerts-core');
const estimation = require('./estimation.js');
const engine = require('../src/services/estimation.js');
const leadNotify = require('./lead-notify.js');

const DAY = 24 * 3600 * 1000;
const iso = ms => new Date(ms).toISOString();

const INVITE = {
  fr: {
    subject: a => `Votre avis sur ${a}`,
    heading: a => `Comment s’est passé votre contact avec ${a} ?`,
    body: 'Il y a une semaine, vous avez contacté cette agence via Z Find et accepté d’être invité(e) à donner votre avis. Deux minutes suffisent ; il est relu avant publication.',
    button: 'Donner mon avis',
    footer: 'Une seule invitation, sans relance. Sans réponse, votre adresse est effacée sous 60 jours. Vos données : hello@zfind.online'
  },
  en: {
    subject: a => `Your review of ${a}`,
    heading: a => `How was your contact with ${a}?`,
    body: 'A week ago you contacted this agency through Z Find and agreed to be invited to review it. It takes two minutes; reviews are checked before publication.',
    button: 'Write my review',
    footer: 'A single invitation, no reminder. Without an answer your address is erased within 60 days. Your data: hello@zfind.online'
  }
};

function inviteEmail(row) {
  const l = S.lang(row.lang);
  const w = INVITE[l];
  const agency = (row.partners && row.partners.name) || 'Z Find';
  const link = `${S.siteUrl()}/api/reviews?token=${row.invite_token}`;
  return {
    to: [row.invite_email], subject: S.oneLine(w.subject(agency), 150),
    html: S.mailHtml(l, w.heading(agency), `<p style="line-height:1.6">${S.esc(w.body)}</p>` + S.button(link, w.button), S.esc(w.footer)),
    text: `${w.heading(agency)}\n\n${w.body}\n\n${w.button}: ${link}\n\n${w.footer}`
  };
}

async function purge(now) {
  const del = q => S.db(q, { method: 'DELETE', prefer: 'return=minimal' });
  await del(`zfind_alert_subscriptions?status=eq.pending&created_at=lt.${encodeURIComponent(iso(now - 30 * DAY))}`);
  await del(`zfind_alert_subscriptions?status=eq.unsubscribed&unsubscribed_at=lt.${encodeURIComponent(iso(now - 30 * DAY))}`);
  await del(`zfind_alert_subscriptions?status=eq.active&confirmed_at=lt.${encodeURIComponent(iso(now - 3 * 365 * DAY))}`);
  await del(`zfind_partner_reviews?status=eq.invited&created_at=lt.${encodeURIComponent(iso(now - 60 * DAY))}`);
  await del(`zfind_partner_reviews?status=eq.rejected&submitted_at=lt.${encodeURIComponent(iso(now - 30 * DAY))}`);
  return 'ok';
}

async function sendInvitations(now) {
  const due = await S.db(`zfind_partner_reviews?status=eq.invited&invite_sent_at=is.null&invite_email=not.is.null&send_after=lte.${encodeURIComponent(iso(now))}&select=id,lang,invite_email,invite_token,partners(name)&limit=100`);
  let sent = 0;
  for (const row of due || []) {
    try {
      await S.sendMail(inviteEmail(row));
      await S.db(`zfind_partner_reviews?id=eq.${row.id}`, { method: 'PATCH', body: { invite_sent_at: iso(Date.now()) }, prefer: 'return=minimal' });
      sent += 1;
    } catch (e) { console.error('cron: invite', row.id, e.message); }
  }
  return sent;
}

async function sendValueAlerts() {
  const subs = await S.db('zfind_alert_subscriptions?status=eq.active&kind=eq.value&select=id,email,lang,criteria,token,last_reference,sent_count&limit=1000');
  let sent = 0;
  for (const row of subs || []) {
    try {
      const input = estimation._internals.cleanInput((row.criteria || {}).input);
      const result = await engine.estimate(input, estimation._internals.loadJson);
      if (!result.ok) continue;
      const [previousPeriod, previousCentral] = String(row.last_reference || '').split('|');
      const reference = `${result.basis.period}|${result.central}`;
      if (previousPeriod === String(result.basis.period)) continue;
      if (previousPeriod) {
        const l = S.lang(row.lang);
        await S.sendMail(core.valueEmail(row, result, Number(previousCentral) || null, `${result.basis.source} · ${engine.formatPeriod(result.basis.period, l)}`));
      }
      await S.db(`zfind_alert_subscriptions?id=eq.${row.id}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: previousPeriod ? { last_reference: reference, last_sent_at: iso(Date.now()), sent_count: (row.sent_count || 0) + 1 } : { last_reference: reference }
      });
      if (previousPeriod) sent += 1;
    } catch (e) { console.error('cron: value', row.id, e.message); }
  }
  return sent;
}

async function sendSearchAlerts(now) {
  const windowStart = now - 8 * DAY;
  const rows = core.publicRows(await S.db(core.propertiesSinceQuery(iso(windowStart))));
  const cards = rows.map(core.toCard);
  const subs = await S.db('zfind_alert_subscriptions?status=eq.active&kind=eq.search&select=id,email,lang,criteria,token,confirmed_at,last_sent_at,sent_count&limit=5000');
  let sent = 0;
  for (const row of subs || []) {
    try {
      const since = Math.max(Date.parse(row.last_sent_at || row.confirmed_at) || 0, windowStart);
      const matches = core.matchSearch(row.criteria || {}, cards, since);
      if (!matches.length) continue;
      await S.sendMail(core.digestEmail(row, matches));
      await S.db(`zfind_alert_subscriptions?id=eq.${row.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { last_sent_at: iso(Date.now()), sent_count: (row.sent_count || 0) + 1 } });
      sent += 1;
    } catch (e) { console.error('cron: search', row.id, e.message); }
  }
  return { sent, newListings: cards.length };
}

async function count(table, filter) {
  const rows = await S.db(`${table}?${filter}&select=id&limit=10000`);
  return (rows || []).length;
}

async function summary(report) {
  const to = S.env('ZFIND_LEAD_NOTIFY_EMAIL');
  if (!to) return 'skipped';
  const lines = [
    ['Alertes de recherche actives', await count('zfind_alert_subscriptions', 'status=eq.active&kind=eq.search')],
    ['Alertes de valeur actives', await count('zfind_alert_subscriptions', 'status=eq.active&kind=eq.value')],
    ['Inscriptions à confirmer', await count('zfind_alert_subscriptions', 'status=eq.pending')],
    ['E-mails de recherche envoyés aujourd’hui', report.search && report.search.sent != null ? report.search.sent : '—'],
    ['Nouvelles annonces (8 jours)', report.search && report.search.newListings != null ? report.search.newListings : '—'],
    ['Avis publiés', await count('zfind_partner_reviews', 'status=eq.published')],
    ['Avis à modérer', await count('zfind_partner_reviews', 'status=eq.pending')],
    ['Invitations d’avis à envoyer', await count('zfind_partner_reviews', 'status=eq.invited&invite_sent_at=is.null')]
  ];
  await S.sendMail({
    to: [to], subject: 'Z Find — résumé hebdomadaire (alertes et avis)',
    html: S.mailHtml('fr', 'Résumé hebdomadaire', `<table style="border-collapse:collapse">${lines.map(([k, v]) => `<tr><td style="padding:6px 18px 6px 0;color:#7a7266">${S.esc(k)}</td><td style="padding:6px 0;font-weight:600">${S.esc(v)}</td></tr>`).join('')}</table>`, 'Z Find'),
    text: lines.map(([k, v]) => `${k} : ${v}`).join('\n')
  });
  return 'sent';
}

async function run(options) {
  const now = (options && options.now) || Date.now();
  const monday = new Date(now).getUTCDay() === 1 || (options && options.force === 'weekly');
  const report = {};
  const step = async (name, fn) => {
    try { report[name] = await fn(); } catch (e) { report[name] = `error: ${e.message}`; console.error('cron:', name, e.message); }
  };
  await step('purge', () => purge(now));
  if (S.configured(['mail'])) {
    await step('leads', () => leadNotify._internals.processPending(100));
    await step('estimations', () => leadNotify._internals.processEstimations(50));
    await step('reminders', () => leadNotify._internals.processReminders(100));
    await step('invitations', () => sendInvitations(now));
    await step('value', () => sendValueAlerts());
    if (monday) {
      await step('search', () => sendSearchAlerts(now));
      await step('summary', () => summary(report));
    }
  } else {
    report.mail = 'not_configured';
  }
  return report;
}

async function handler(req, res) {
  const secret = S.env('CRON_SECRET');
  if (!secret || !S.configured(['db'])) return S.sendJson(res, 503, { ok: false, error: 'not_configured' });
  if (String((req.headers && req.headers.authorization) || '') !== `Bearer ${secret}`) return S.sendJson(res, 401, { ok: false, error: 'unauthorized' });
  const query = S.queryOf(req);
  const report = await run({ force: query.force === 'weekly' ? 'weekly' : null });
  console.log('cron-daily', JSON.stringify(report));
  return S.sendJson(res, 200, { ok: true, report });
}

module.exports = handler;
module.exports._internals = { run, inviteEmail, purge, sendInvitations, sendValueAlerts, sendSearchAlerts };
