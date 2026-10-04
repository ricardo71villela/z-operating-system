/* ============================================================
   Z FIND — /api/reviews (Vercel serverless function)

   Reviews of partner agencies, only from people who really contacted the
   agency through Z Find:

   POST {action:'optin', listingId, email, lang, consent:true, website}
        Called by the enquiry form, after the enquiry is saved, when the
        visitor ticked "invite me to review the agency". Accepted only if
        an enquiry with this e-mail exists for this listing in the last
        24 hours (verified contact). The daily job sends the invitation
        7 days later.
   GET  ?token=<invite>           → the review form
   POST action=submit (form)      → pending; Z Find gets a moderation e-mail
   GET  ?moderate=<token>         → the review with Publish / Reject buttons
   POST action=moderate (form)    → published | rejected

   The visitor's e-mail is erased as soon as the review is submitted.
   ============================================================ */
'use strict';

const S = require('./_lib/server');

const PAGE = {
  fr: {
    formTitle: agency => `Votre avis sur ${agency}`,
    formLead: 'Vous avez contacté cette agence via Z Find. Votre avis aide les autres acheteurs et locataires. Il est relu avant publication.',
    rating: 'Votre note', stars: n => `${n} ★`, comment: 'Votre commentaire (facultatif)', commentPh: 'Réactivité, qualité des informations, visite…',
    author: 'Nom affiché', authorPh: 'Ex. : Marie D.', consent: 'J’accepte que cet avis et le nom indiqué soient publiés sur zfind.online.',
    send: 'Publier mon avis', thanksTitle: 'Merci pour votre avis', thanksBody: 'Il sera publié après relecture par Z Find, en général sous 48 heures.',
    doneTitle: 'Avis déjà reçu', doneBody: 'Merci : votre avis a bien été enregistré.',
    missingTitle: 'Lien expiré', missingBody: 'Cette invitation n’existe plus (elles expirent après 60 jours).',
    invalid: 'Choisissez une note et indiquez le nom à afficher, puis cochez la case d’accord.',
    unavailableTitle: 'Service momentanément indisponible', unavailableBody: 'Réessayez dans quelques minutes.'
  },
  en: {
    formTitle: agency => `Your review of ${agency}`,
    formLead: 'You contacted this agency through Z Find. Your review helps other buyers and tenants. It is checked before publication.',
    rating: 'Your rating', stars: n => `${n} ★`, comment: 'Your comment (optional)', commentPh: 'Responsiveness, quality of information, viewing…',
    author: 'Name shown', authorPh: 'e.g. Mary D.', consent: 'I agree that this review and the name above are published on zfind.online.',
    send: 'Publish my review', thanksTitle: 'Thank you for your review', thanksBody: 'It will be published after Z Find has checked it, usually within 48 hours.',
    doneTitle: 'Review already received', doneBody: 'Thank you: your review has been recorded.',
    missingTitle: 'Link expired', missingBody: 'This invitation no longer exists (invitations expire after 60 days).',
    invalid: 'Choose a rating and enter the name to show, then tick the agreement box.',
    unavailableTitle: 'Service temporarily unavailable', unavailableBody: 'Please try again in a few minutes.'
  }
};

const REVIEW_SELECT = 'id,partner_id,listing_id,status,rating,comment,author_label,lang,invite_token,moderation_token,partners(name)';

async function one(query) {
  const rows = await S.db(query);
  return rows && rows[0] ? rows[0] : null;
}

function agencyName(row) { return (row.partners && row.partners.name) || 'l’agence'; }

function formHTML(row, p, error) {
  const radios = [5, 4, 3, 2, 1].map(n => `<label><input type="radio" name="rating" value="${n}" required> ${p.stars(n)}</label>`).join('');
  return `${error ? `<p style="color:#a33">${S.esc(error)}</p>` : ''}<p>${S.esc(p.formLead)}</p>
<form method="post" action="/api/reviews">
<input type="hidden" name="action" value="submit"><input type="hidden" name="token" value="${S.esc(row.invite_token)}">
<label>${S.esc(p.rating)}</label><div class="stars">${radios}</div>
<label for="c">${S.esc(p.comment)}</label><textarea id="c" name="comment" maxlength="1200" placeholder="${S.esc(p.commentPh)}"></textarea>
<label for="a">${S.esc(p.author)}</label><input id="a" type="text" name="author" maxlength="60" required placeholder="${S.esc(p.authorPh)}">
<label class="check"><input type="checkbox" name="consent" value="yes" required> <span>${S.esc(p.consent)}</span></label>
<button type="submit">${S.esc(p.send)}</button></form>`;
}

async function optin(req, res) {
  if (S.limited(req, 6, 600000)) return S.sendJson(res, 429, { ok: false, error: 'rate_limited' });
  const body = await S.readBody(req);
  if (body.website) return S.sendJson(res, 200, { ok: true });
  if (body.consent !== true) return S.sendJson(res, 400, { ok: false, error: 'consent' });
  const email = String(body.email || '').trim().toLowerCase();
  if (!S.EMAIL_RE.test(email) || email.length > 254) return S.sendJson(res, 400, { ok: false, error: 'email' });
  if (!S.UUID_RE.test(String(body.listingId || ''))) return S.sendJson(res, 400, { ok: false, error: 'listing' });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const leads = await S.db(`leads?listing_id=eq.${body.listingId}&created_at=gt.${encodeURIComponent(since)}&select=email&limit=200`);
  if (!(leads || []).some(l => String(l.email || '').trim().toLowerCase() === email)) return S.sendJson(res, 400, { ok: false, error: 'not_verified' });

  const listing = await one(`listings?id=eq.${body.listingId}&select=id,representations(partner_id)`);
  const rep = listing && (Array.isArray(listing.representations) ? listing.representations[0] : listing.representations);
  const partnerId = rep && rep.partner_id;
  if (!partnerId) return S.sendJson(res, 400, { ok: false, error: 'partner' });

  const existing = await one(`zfind_partner_reviews?partner_id=eq.${partnerId}&invite_email=eq.${encodeURIComponent(email)}&select=id`);
  if (existing) return S.sendJson(res, 200, { ok: true });
  await S.db('zfind_partner_reviews', { method: 'POST', body: { partner_id: partnerId, listing_id: body.listingId, lang: S.lang(body.lang), invite_email: email }, prefer: 'return=minimal' });
  return S.sendJson(res, 200, { ok: true });
}

function moderationEmail(row, agency) {
  const link = `${S.siteUrl()}/api/reviews?moderate=${row.moderation_token}`;
  const html = S.mailHtml('fr', `Nouvel avis à modérer — ${agency}`,
    `<p><strong>${'★'.repeat(row.rating)}${'☆'.repeat(5 - row.rating)}</strong> — ${S.esc(row.author_label)}</p><p style="white-space:pre-wrap;line-height:1.6">${S.esc(row.comment || '(sans commentaire)')}</p>` + S.button(link, 'Modérer (publier ou refuser)'),
    'Z Find — modération des avis');
  return { to: [S.env('ZFIND_LEAD_NOTIFY_EMAIL')], subject: S.oneLine(`Avis à modérer : ${row.rating}/5 — ${agency}`, 150), html, text: `${row.rating}/5 — ${row.author_label}\n${row.comment || ''}\n\nModérer : ${link}` };
}

async function submit(req, res, body) {
  const token = String(body.token || '');
  const row = S.UUID_RE.test(token) ? await one(`zfind_partner_reviews?invite_token=eq.${token}&select=${REVIEW_SELECT}`) : null;
  const l = S.lang(row ? row.lang : body.lang);
  const p = PAGE[l];
  if (!row) return S.sendPage(res, 404, l, p.missingTitle, `<p>${p.missingBody}</p>`);
  if (row.status !== 'invited') return S.sendPage(res, 200, l, p.doneTitle, `<p>${p.doneBody}</p>`);
  const rating = Number(body.rating);
  const author = S.oneLine(body.author, 60);
  const comment = String(body.comment || '').replace(/\r\n/g, '\n').trim().slice(0, 1200);
  if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5) || !author || body.consent !== 'yes') {
    return S.sendPage(res, 400, l, p.formTitle(agencyName(row)), formHTML(row, p, p.invalid));
  }
  const updated = await S.db(`zfind_partner_reviews?id=eq.${row.id}&status=eq.invited`, {
    method: 'PATCH',
    body: { status: 'pending', rating, comment: comment || null, author_label: author, submitted_at: new Date().toISOString(), invite_email: null }
  });
  const saved = updated && updated[0];
  if (saved && S.env('ZFIND_LEAD_NOTIFY_EMAIL')) {
    await S.sendMail(moderationEmail(saved, agencyName(row))).catch(e => console.error('reviews: moderation mail', e.message));
  }
  return S.sendPage(res, 200, l, p.thanksTitle, `<p>${p.thanksBody}</p>`);
}

async function moderatePage(res, token) {
  const row = S.UUID_RE.test(String(token || '')) ? await one(`zfind_partner_reviews?moderation_token=eq.${token}&select=${REVIEW_SELECT}`) : null;
  if (!row) return S.sendPage(res, 404, 'fr', 'Avis introuvable', '<p>Ce lien ne correspond plus à aucun avis.</p>');
  const state = { invited: 'pas encore envoyé', pending: 'en attente de modération', published: 'publié', rejected: 'refusé' }[row.status];
  const buttons = row.status === 'pending' || row.status === 'published' || row.status === 'rejected'
    ? `<form method="post" action="/api/reviews"><input type="hidden" name="action" value="moderate"><input type="hidden" name="token" value="${S.esc(row.moderation_token)}">
${row.status !== 'published' ? '<button type="submit" name="decision" value="publish">Publier</button>' : ''}${row.status !== 'rejected' ? '<button class="alt" type="submit" name="decision" value="reject">Refuser</button>' : ''}</form>` : '';
  return S.sendPage(res, 200, 'fr', `Avis sur ${agencyName(row)}`,
    `<p class="muted">Statut : ${S.esc(state)}</p><p><strong>${row.rating ? '★'.repeat(row.rating) + '☆'.repeat(5 - row.rating) : ''}</strong> ${S.esc(row.author_label || '')}</p><p style="white-space:pre-wrap">${S.esc(row.comment || '')}</p>${buttons}
<p class="muted">Ne publier que si l’avis respecte les règles : expérience réelle, pas d’insultes, pas de données personnelles de tiers. Refuser ne doit jamais servir à cacher un avis négatif légitime.</p>`);
}

async function moderate(res, body) {
  const token = String(body.token || '');
  if (!S.UUID_RE.test(token) || !['publish', 'reject'].includes(body.decision)) return S.sendPage(res, 400, 'fr', 'Demande invalide', '<p>—</p>');
  const patch = body.decision === 'publish'
    ? { status: 'published', published_at: new Date().toISOString() }
    : { status: 'rejected', published_at: null };
  const rows = await S.db(`zfind_partner_reviews?moderation_token=eq.${token}&status=in.(pending,published,rejected)`, { method: 'PATCH', body: patch });
  if (!rows || !rows[0]) return S.sendPage(res, 404, 'fr', 'Avis introuvable', '<p>—</p>');
  return S.sendPage(res, 200, 'fr', body.decision === 'publish' ? 'Avis publié' : 'Avis refusé',
    body.decision === 'publish' ? '<p>Il apparaît déjà sur la page de l’agence et sur ses annonces.</p>' : '<p>Il ne sera pas affiché. Les données sont effacées au bout de 30 jours.</p>');
}

async function handler(req, res) {
  if (!S.configured(['db'])) {
    console.error('reviews: not configured (ZFIND_SUPABASE_SERVICE_KEY)');
    if (req.method === 'GET') return S.sendPage(res, 503, 'fr', PAGE.fr.unavailableTitle, `<p>${PAGE.fr.unavailableBody}</p>`);
    return S.sendJson(res, 503, { ok: false, error: 'not_configured' });
  }
  const query = S.queryOf(req);
  try {
    if (req.method === 'GET') {
      if (query.moderate) return await moderatePage(res, query.moderate);
      const token = String(query.token || '');
      const row = S.UUID_RE.test(token) ? await one(`zfind_partner_reviews?invite_token=eq.${token}&select=${REVIEW_SELECT}`) : null;
      const l = S.lang(row ? row.lang : query.lang);
      const p = PAGE[l];
      if (!row) return S.sendPage(res, 404, l, p.missingTitle, `<p>${p.missingBody}</p>`);
      if (row.status !== 'invited') return S.sendPage(res, 200, l, p.doneTitle, `<p>${p.doneBody}</p>`);
      return S.sendPage(res, 200, l, p.formTitle(agencyName(row)), formHTML(row, p));
    }
    if (req.method === 'POST') {
      const type = String((req.headers && req.headers['content-type']) || '');
      if (/json/i.test(type)) {
        return await optin(req, res);
      }
      const body = await S.readBody(req);
      if (body.action === 'submit') return await submit(req, res, body);
      if (body.action === 'moderate') return await moderate(res, body);
      return S.sendPage(res, 400, 'fr', 'Demande invalide', '<p>—</p>');
    }
    res.setHeader('Allow', 'GET, POST');
    return S.sendJson(res, 405, { ok: false, error: 'method' });
  } catch (e) {
    console.error('reviews:', e.message);
    if (req.method === 'GET' || !/json/i.test(String((req.headers && req.headers['content-type']) || ''))) {
      return S.sendPage(res, 500, 'fr', PAGE.fr.unavailableTitle, `<p>${PAGE.fr.unavailableBody}</p>`);
    }
    return S.sendJson(res, 500, { ok: false, error: 'server' });
  }
}

module.exports = handler;
module.exports._internals = { PAGE, formHTML, moderationEmail };
