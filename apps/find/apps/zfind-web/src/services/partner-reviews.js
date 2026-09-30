/* ============================================================
   Z FIND — PARTNER REVIEWS (public side)

   Reads the published reviews of a partner agency (anonymous read,
   published rows and non-personal columns only — see migration
   20260930120000) and renders them for the agency page and the listing
   sidebar. Reviews come only from people who contacted the agency
   through Z Find (verified contact), and are checked before publication.

   While the table does not exist yet, or on any read error, nothing is
   shown. In demonstration mode (demo-mode.js), clearly labelled
   fictitious examples fill the space when there are no real reviews.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null);
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.partnerReviews = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {
  'use strict';

  const COLUMNS = 'id, partner_id, rating, comment, author_label, lang, verified_contact, published_at, partner_reply, partner_replied_at';

  const COPY = Object.freeze({
    fr: Object.freeze({
      title: 'Avis clients', verified: 'Contact vérifié via Z Find', reply: 'Réponse de l’agence',
      count: n => `${n} avis`, none: 'Pas encore d’avis publié.', method: 'Seules les personnes ayant contacté l’agence via Z Find peuvent laisser un avis ; chaque avis est relu avant publication.',
      demo: 'Exemples fictifs — démonstration', seeAll: 'Voir les avis'
    }),
    en: Object.freeze({
      title: 'Client reviews', verified: 'Verified contact through Z Find', reply: 'Agency reply',
      count: n => `${n} review${n > 1 ? 's' : ''}`, none: 'No published review yet.', method: 'Only people who contacted the agency through Z Find can leave a review; every review is checked before publication.',
      demo: 'Fictitious examples — demonstration', seeAll: 'See reviews'
    })
  });

  function copyFor(lang) { return COPY[lang] || COPY.en; }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function listPublished(partnerId) {
    if (!partnerId || !supabaseClientModule || typeof supabaseClientModule.getSupabaseClient !== 'function') return { data: [], error: null };
    try {
      const client = supabaseClientModule.getSupabaseClient();
      const { data, error } = await client
        .from('zfind_partner_reviews')
        .select(COLUMNS)
        .eq('partner_id', partnerId)
        .order('published_at', { ascending: false })
        .limit(50);
      if (error) return { data: [], error };
      return { data: Array.isArray(data) ? data : [], error: null };
    } catch (error) {
      return { data: [], error };
    }
  }

  function summarize(reviews) {
    const list = (reviews || []).filter(r => r && r.rating >= 1 && r.rating <= 5);
    if (!list.length) return { count: 0, average: null };
    const average = list.reduce((s, r) => s + Number(r.rating), 0) / list.length;
    return { count: list.length, average: Math.round(average * 10) / 10 };
  }

  function stars(rating) {
    const n = Math.round(Number(rating) || 0);
    return `<span class="zr-stars" aria-label="${n}/5">${'★'.repeat(n)}<span class="zr-off">${'★'.repeat(5 - n)}</span></span>`;
  }

  function dateLabel(value, lang) {
    const t = Date.parse(value || '');
    return t ? new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric' }).format(new Date(t)) : '';
  }

  function averageLabel(avg, lang) {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(avg);
  }

  /* Full block for the agency page. */
  function sectionHTML(lang, reviews, options) {
    const c = copyFor(lang);
    const demo = Boolean(options && options.demo);
    const s = summarize(reviews);
    if (!s.count) return '';
    const items = reviews.map(r => `
      <article class="zr-item">
        <div class="zr-item-head">${stars(r.rating)} <strong>${esc(r.author_label)}</strong>
          <span class="zr-date">${esc(dateLabel(r.published_at, lang))}</span></div>
        ${r.verified_contact ? `<div class="zr-verified">✓ ${esc(c.verified)}</div>` : ''}
        ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
        ${r.partner_reply ? `<div class="zr-reply"><strong>${esc(c.reply)}</strong><p>${esc(r.partner_reply)}</p></div>` : ''}
      </article>`).join('');
    return `
      <section class="block zr-section${demo ? ' zr-demo' : ''}" id="partner-reviews">
        ${demo ? `<div class="zr-demo-label">${esc(c.demo)}</div>` : ''}
        <div class="zr-head">
          <h2>${esc(c.title)}</h2>
          <div class="zr-score"><b>${averageLabel(s.average, lang)}</b>/5 ${stars(s.average)} <span>${esc(c.count(s.count))}</span></div>
        </div>
        <p class="zr-method">${esc(c.method)}</p>
        <div class="zr-list">${items}</div>
      </section>`;
  }

  /* One line for the listing sidebar, under the agency name. */
  function summaryHTML(lang, reviews, partnerId, options) {
    const c = copyFor(lang);
    const s = summarize(reviews);
    if (!s.count) return '';
    const demo = Boolean(options && options.demo);
    return `<div class="zr-summary${demo ? ' zr-demo' : ''}">${stars(s.average)} <b>${averageLabel(s.average, lang)}</b>
      <a href="#/${lang}/partner/${esc(partnerId)}" onclick="event.stopPropagation()">${esc(c.count(s.count))}</a>
      ${demo ? `<span class="zr-demo-label">${esc(c.demo)}</span>` : ''}</div>`;
  }

  return Object.freeze({ COPY, COLUMNS, listPublished, summarize, sectionHTML, summaryHTML, _internals: Object.freeze({ esc, stars }) });
});
