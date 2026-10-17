/* ============================================================
   Z FASHION — legal and service pages (task 5)
   ============================================================
   Renders, from legal-content.js, the pages whose text is legally
   binding or must match it: mentions légales, CGV, conditions
   d'utilisation, confidentialité, cookies, consentement, conditions
   Partner, livraisons, retours et remboursements, aide. French is the
   binding language: in another site language the French text is shown
   under a note saying so.

   Also fills the footer's legal links (data-legal-link) on every page
   that loads it.

   The older layers (customer-site.js, customer-completion*.js) leave
   these routes to this file (they check ZFashionLegal.DOCS). Every
   node is built with textContent; {{...}} placeholders (information
   still to provide before the launch) are shown highlighted.
   ============================================================ */

(function () {
  'use strict';
  var LEGAL = window.ZFashionLegal;
  if (!LEGAL) return;
  var ROUTES = window.ZFashionCustomerRoutes;

  var ASIDE = ['legalNotice', 'termsSale', 'termsUse', 'privacy', 'cookies', 'partnerTerms'];
  var PATHS = {
    legalNotice: '/mentions-legales', termsSale: '/cgv', termsUse: '/conditions-utilisation', privacy: '/confidentialite',
    cookies: '/cookies', consent: '/consentement', partnerTerms: '/conditions-partenaires',
    delivery: '/livraisons', refunds: '/retours-remboursements', help: '/aide', contact: '/contact',
  };
  var COPY = {
    fr: { updated: 'Mise à jour le', version: 'Version', others: 'Autres informations', contact: 'Nous écrire', todo: 'À compléter avant le lancement' },
    en: { updated: 'Updated on', version: 'Version', others: 'Other information', contact: 'Write to us', todo: 'To complete before launch' },
  };

  function locale() { return document.documentElement.dataset.locale || 'fr'; }
  function c(k) { return (COPY[locale()] || COPY.en)[k] || COPY.fr[k]; }
  function title(id) {
    var t = ROUTES && ROUTES.titles && ROUTES.titles[locale()] && ROUTES.titles[locale()][id];
    return t || (LEGAL.DOCS[id] && LEGAL.DOCS[id].title) || id;
  }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  // Text with {{placeholders}} highlighted.
  function rich(tag, text, attrs) {
    var n = el(tag, attrs);
    var parts = String(text).split(/(\{\{[^}]+\}\})/);
    parts.forEach(function (part) {
      var m = /^\{\{([^}]+)\}\}$/.exec(part);
      if (m) { var mark = el('mark', { class: 'zf-legal-todo', title: c('todo') }, '[' + m[1] + ']'); n.appendChild(mark); }
      else if (part) n.appendChild(document.createTextNode(part));
    });
    return n;
  }

  // ---------- footer links (every page)

  function fillFooter() {
    document.querySelectorAll('[data-legal-link]').forEach(function (a) {
      var id = a.getAttribute('data-legal-link');
      a.textContent = title(id);
      if (PATHS[id]) a.setAttribute('href', PATHS[id]);
    });
  }

  // ---------- pages

  function routeId() {
    var path = location.pathname.replace(/\/+$/, '') || '/';
    for (var id in PATHS) if (PATHS[id] === path && LEGAL.DOCS[id]) return id;
    return null;
  }

  function render() {
    fillFooter();
    var id = routeId();
    var page = document.getElementById('pageContent');
    if (!id || !page) return;
    var doc = LEGAL.DOCS[id];
    var nodes = [];
    var note = LEGAL.FRENCH_ONLY[locale()];
    if (note) nodes.push(el('p', { class: 'zf-legal-lang', lang: locale() }, note));

    var article = el('article', { class: 'legal-document zf-legal', lang: 'fr', 'data-legal': id });
    var aside = el('aside');
    aside.append(el('strong', null, 'Z FASHION'), el('span', null, doc.title));
    if (doc.version) aside.appendChild(el('small', null, c('version') + ' ' + doc.version));
    aside.appendChild(el('small', null, c('updated') + ' ' + LEGAL.VERSION.updated));
    var nav = el('nav', { 'aria-label': c('others') });
    ASIDE.concat(id === 'delivery' || id === 'refunds' || id === 'help' ? ['delivery', 'refunds', 'help'] : []).forEach(function (other) {
      if (other === id) return;
      nav.appendChild(el('a', { href: PATHS[other] }, title(other)));
    });
    aside.appendChild(nav);

    var body = el('div');
    (doc.sections || []).forEach(function (s) {
      var sec = el('section', s.box ? { class: 'zf-legal-box' } : null);
      sec.appendChild(rich('h2', s.h));
      (s.p || []).forEach(function (p) { sec.appendChild(rich('p', p)); });
      if (s.ul) { var ul = el('ul'); s.ul.forEach(function (li) { ul.appendChild(rich('li', li)); }); sec.appendChild(ul); }
      body.appendChild(sec);
    });
    if (doc.faq) {
      var faq = el('div', { class: 'faq-list' });
      doc.faq.forEach(function (qa, i) {
        var d = el('details'); if (i === 0) d.setAttribute('open', '');
        var sum = rich('summary', qa[0]); sum.appendChild(el('span', null, '+'));
        d.append(sum, rich('p', qa[1]));
        faq.appendChild(d);
      });
      body.appendChild(faq);
      var cta = el('p', { class: 'zf-legal-cta' });
      cta.appendChild(el('a', { class: 'route-button', href: '/contact' }, c('contact')));
      body.appendChild(cta);
    }
    article.append(aside, body);
    nodes.push(article);
    page.replaceChildren.apply(page, nodes);
    page.dataset.legal = id;
  }

  var style = document.createElement('style');
  style.textContent = [
    '.zf-legal-lang{background:#f1efeb;border-left:3px solid #111;padding:10px 14px;font-size:13px;margin:0 0 18px}',
    '.zf-legal aside small{display:block;font-size:11px;color:#777}',
    '.zf-legal aside nav{display:grid;gap:8px;margin-top:14px}.zf-legal aside nav a{font-size:12px;text-decoration:underline}',
    '.zf-legal ul{margin:0 0 8px 18px;padding:0}.zf-legal li{font-size:13px;line-height:1.75;color:#555;margin-bottom:6px}',
    '.zf-legal p{font-size:13px}.zf-legal h2{font-size:24px}',
    '.zf-legal .zf-legal-box{border:1px solid #111;padding:18px 20px;background:#faf9f6}',
    '.zf-legal mark.zf-legal-todo{background:#fff1a8;color:#5c4700;padding:0 3px}',
    '.zf-legal .faq-list details{border-bottom:1px solid var(--zf-line,#ddd);padding:14px 0}.zf-legal .faq-list summary{cursor:pointer;display:flex;justify-content:space-between;font-size:14px}',
    '.zf-legal-cta{margin-top:20px}',
  ].join('\n');
  document.head.appendChild(style);

  document.getElementById('localeSelect') && document.getElementById('localeSelect').addEventListener('change', function () { setTimeout(render, 0); });
  // Older layers may draw #pageContent on their own schedule: draw after them.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(render, 0); });
  else setTimeout(render, 0);
  window.ZFashionLegalPages = { owns: function (id) { return !!LEGAL.DOCS[id]; }, render: render };
})();
