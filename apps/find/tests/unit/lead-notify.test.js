/* Contract: /api/lead-notify sends each new enquiry to the agency of the
   listing (Reply-To = the person), copies Z Find, forwards to Z Find when
   there is no active agency, and marks what was sent. No network. */
'use strict';
const path = require('path');
const assert = require('assert');
const { EventEmitter } = require('events');
const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

const mails = []; const calls = []; let pending = []; let notices = []; let failMailTo = null;
global.fetch = async (url, opts) => {
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  if (String(url).startsWith('https://api.resend.com/')) {
    if (failMailTo && body.to.includes(failMailTo)) return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
    mails.push(body);
    return { ok: true, status: 200, json: async () => ({ id: 'm' }), text: async () => '{}' };
  }
  calls.push({ url: String(url), body, headers: opts.headers });
  const data = /zfind_pending_lead_notifications/.test(url) ? pending : /zfind_pending_listing_review_notices/.test(url) ? notices : 1;
  return { ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data };
};
function req(method) { const r = new EventEmitter(); r.method = method; r.headers = { 'x-forwarded-for': '10.9.9.' + Math.floor(Math.random() * 200) }; r.query = {}; r.url = '/api/lead-notify'; return r; }
function res() { return { statusCode: 0, headers: {}, raw: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.raw = b || ''; } }; }
const row = o => Object.assign({ lead_id: 'l1', created_at: '2026-10-04T10:00:00Z', contact_type: 'qualified', name: 'Marie <b>', email: 'marie@example.com', phone: '+33 6 00 00 00 00',
  message: 'Bonjour,\nvisite possible samedi ?', listing_id: 'x', listing_title: 'T3 vue lac', transaction_type: 'sale', price: 420000, currency: 'EUR',
  partner_id: 'p', partner_name: 'LAC IMMO', partner_active: true, recipients: ['agent@lac-immo.fr', 'contact@lac-immo.fr'] }, o);

(async () => {
  console.log('\n=== Z FIND LEAD NOTIFY ===');
  Object.assign(process.env, { ZFIND_SUPABASE_SERVICE_KEY: 'sb_secret_test', RESEND_API_KEY: 'resend-test', ZFIND_EMAIL_FROM: 'Z Find <hello@zfind.online>', ZFIND_LEAD_NOTIFY_EMAIL: 'leads@zfind.online' });
  const api = require(path.join(WEB, 'api', 'lead-notify.js'));

  pending = [row(), row({ lead_id: 'l2', partner_active: false, partner_name: 'OLD AGENCY', recipients: ['b@old.fr'] }), row({ lead_id: 'l3', recipients: [], partner_active: true, email: null })];
  const r = res();
  await api(req('POST'), r);
  check('POST answers 200 without revealing anything', r.statusCode === 200 && r.raw === '{"ok":true}');
  const toAgency = mails.find(m => m.to.includes('agent@lac-immo.fr'));
  check('agency gets the enquiry: to its accounts, Reply-To the person, Z Find in copy', toAgency && toAgency.to.length === 2 && toAgency.reply_to === 'marie@example.com' && toAgency.bcc[0] === 'leads@zfind.online');
  check('French subject with the listing title', toAgency.subject === 'Nouvelle demande : T3 vue lac');
  check('content: price, type, message, 24 h reminder, link to the partner panel, HTML escaped',
    toAgency.html.replace(/[\u202f\u00a0]/g, ' ').includes('420 000 €') && toAgency.html.includes('Demande qualifiée') && toAgency.html.includes('visite possible samedi') &&
    toAgency.html.includes('24 heures') && toAgency.html.includes('https://partner.zfind.online') && toAgency.html.includes('Marie &lt;b&gt;') && !toAgency.html.includes('<b>'));
  const forwarded = mails.filter(m => m.to.length === 1 && m.to[0] === 'leads@zfind.online');
  check('inactive agency or no account: forwarded to Z Find to pass on by hand', forwarded.length === 2 && forwarded.every(m => m.subject.startsWith('[À transmettre]')) && !forwarded.some(m => m.to.includes('b@old.fr')));
  check('no Reply-To when the person left no e-mail', forwarded.filter(m => m.reply_to === undefined).length === 1 && forwarded.filter(m => m.reply_to === 'marie@example.com').length === 1);
  const marks = calls.filter(c => /zfind_mark_leads_notified/.test(c.url));
  check('each sent enquiry marked delivered', marks.length === 3 && marks.every(m => m.body.p_delivered === true));
  check('server key in the apikey header only (new sb_secret key)', calls.every(c => c.headers.apikey === 'sb_secret_test' && !c.headers.Authorization));

  mails.length = 0; calls.length = 0; failMailTo = 'agent@lac-immo.fr'; pending = [row()];
  const report = await api._internals.processPending(10);
  const failedMark = calls.find(c => /zfind_mark_leads_notified/.test(c.url));
  check('send failure: counted as an attempt, retried later', report.failed === 1 && failedMark.body.p_delivered === false);
  failMailTo = null;

  delete process.env.RESEND_API_KEY;
  const r2 = res(); await api(req('POST'), r2);
  check('not configured: 503, nothing sent', r2.statusCode === 503);
  process.env.RESEND_API_KEY = 'resend-test';
  const r3 = res(); await api(req('DELETE'), r3);
  check('other methods refused', r3.statusCode === 405);

  check('rent price shown per month', api._internals.price({ price: 1200, currency: 'EUR', transaction_type: 'rent' }).replace(/[\u202f\u00a0]/g, ' ') === '1 200 € / mois');
  const cron = require(path.join(WEB, 'api', 'cron-daily.js'));
  check('daily job catches up on unsent enquiries', /step\('leads'/.test(require('fs').readFileSync(path.join(WEB, 'api', 'cron-daily.js'), 'utf8')) && typeof cron._internals.run === 'function');
  const app = require('fs').readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
  const vercel = JSON.parse(require('fs').readFileSync(path.join(WEB, 'vercel.json'), 'utf8'));
  check('enquiry form triggers the notification; route before the SPA fallback; ignore step within 256 characters',
    /showEnquiryFeedback\('success', 'enquiry\.submitSuccess'\);\n  requestLeadNotification\(\);/.test(app) &&
    vercel.rewrites.findIndex(x => x.source === '/api/lead-notify') < vercel.rewrites.findIndex(x => x.source === '/(.*)') && vercel.ignoreCommand.length <= 256);

  /* ---------- Z Find decisions on a listing (migration 20261009180000) ---------- */
  const notice = o => Object.assign({ notice_id: 'n1', created_at: '2026-10-09T10:00:00Z', kind: 'returned_to_draft', reason: 'Photos floues <i>merci</i>\nAjoutez la façade.', listing_id: 'x',
    listing_status: 'draft', listing_title: 'T3 vue lac', agency_reference: 'EV-001', transaction_type: 'sale', price: 472000, currency: 'EUR', partner_id: 'p', partner_name: 'LAC IMMO',
    partner_active: true, recipients: ['agent@lac-immo.fr'] }, o);
  mails.length = 0; calls.length = 0; pending = [];
  notices = [notice(), notice({ notice_id: 'n2', kind: 'compliance_rejected', reason: 'Montant des honoraires à corriger' }), notice({ notice_id: 'n3', recipients: [] }), notice({ notice_id: 'n4', partner_active: false })];
  const rv = await api._internals.processReviewNotices(20);
  const back = mails.find(m => m.subject.startsWith('Annonce renvoyée'));
  const refused = mails.find(m => m.subject.startsWith('Mentions obligatoires refusées'));
  check('return to draft: French e-mail to the agency with the reason (escaped), the next step and its space', back && back.to[0] === 'agent@lac-immo.fr' && back.subject === 'Annonce renvoyée en brouillon : T3 vue lac'
    && back.html.includes('Photos floues &lt;i&gt;merci&lt;/i&gt;') && back.html.includes('(réf. EV-001)') && back.html.includes('« Soumettre à validation »') && back.html.includes('https://partner.zfind.online') && back.text.includes('Motif :'));
  check('refused mentions: its own French e-mail', refused && refused.subject === 'Mentions obligatoires refusées : T3 vue lac' && refused.html.includes('Montant des honoraires à corriger') && refused.html.includes('Mentions obligatoires (France)'));
  check('the agency can answer Z Find directly (Reply-To)', back.reply_to === 'leads@zfind.online');
  const nmarks = calls.filter(c => /zfind_mark_listing_review_notices/.test(c.url));
  check('every notice marked once (no account / inactive agency: skipped, reason stays in the partner space)', rv.sent === 2 && rv.skipped === 2 && nmarks.length === 4 && nmarks.every(m => m.body.p_delivered === true));
  mails.length = 0; calls.length = 0; failMailTo = 'agent@lac-immo.fr'; notices = [notice()];
  const rv2 = await api._internals.processReviewNotices(20);
  check('send failure: counted as an attempt, retried later', rv2.failed === 1 && calls.find(c => /zfind_mark_listing_review_notices/.test(c.url)).body.p_delivered === false);
  failMailTo = null; notices = [];
  check('daily job also sends the listing decisions', /step\('reviewNotices'/.test(require('fs').readFileSync(path.join(WEB, 'api', 'cron-daily.js'), 'utf8')));
  console.log(`\nLEAD NOTIFY: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
