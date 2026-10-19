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
    if (doc.form) body.appendChild(contactForm());
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

  // ---------- contact form (POST /contact on the API, task 16)

  var TOPICS = ['Commande', 'Livraison', 'Retour', 'Paiement', 'Compte', 'Devenir partenaire', 'Autre'];
  var FORM = {
    fr: { name: 'Nom', email: 'E-mail', topic: 'Sujet', order: 'Référence de commande (facultatif)', message: 'Message', send: 'Envoyer', sending: 'Envoi…',
      sent: 'Merci, votre message est envoyé. Une copie vous a été adressée par e-mail ; nous répondons sous 48 heures ouvrées.',
      invalid: 'Vérifiez votre nom, votre e-mail et votre message (10 caractères au moins).', tooMany: 'Trop de messages envoyés : réessayez dans une heure ou écrivez-nous directement par e-mail.',
      failed: 'L’envoi a échoué. Réessayez, ou écrivez-nous directement par e-mail.', offline: 'Écrivez-nous à ' },
    en: { name: 'Name', email: 'E-mail', topic: 'Subject', order: 'Order reference (optional)', message: 'Message', send: 'Send', sending: 'Sending…',
      sent: 'Thank you, your message has been sent. A copy was e-mailed to you; we answer within 2 working days.',
      invalid: 'Check your name, your e-mail and your message (at least 10 characters).', tooMany: 'Too many messages: try again in an hour or e-mail us directly.',
      failed: 'Sending failed. Try again, or e-mail us directly.', offline: 'Write to us at ' },
  };
  function f(k) { return (FORM[locale()] || FORM.en)[k]; }
  function apiBase() {
    var u = String((window.__ZFASHION_CONFIG__ || {}).apiBaseUrl || '').replace(/\/+$/, '');
    return /^https?:\/\//.test(u) ? u : null;
  }
  function contactForm() {
    var api = apiBase();
    if (!api) {
      var p = el('p', { class: 'zf-contact-offline' }, f('offline'));
      p.appendChild(el('a', { href: 'mailto:' + LEGAL.ENTITY.email }, LEGAL.ENTITY.email));
      return p;
    }
    var form = el('form', { class: 'zf-contact', novalidate: '' });
    function field(label, control) { var l = el('label'); l.appendChild(el('span', null, label)); l.appendChild(control); return l; }
    var name = el('input', { name: 'name', autocomplete: 'name', maxlength: '120', required: '' });
    var email = el('input', { name: 'email', type: 'email', autocomplete: 'email', maxlength: '200', required: '' });
    var topic = el('select', { name: 'topic' });
    TOPICS.forEach(function (t) { topic.appendChild(el('option', { value: t }, t)); });
    var order = el('input', { name: 'orderRef', maxlength: '40', placeholder: 'ZF-…' });
    var message = el('textarea', { name: 'message', rows: '6', maxlength: '5000', required: '' });
    var trap = el('input', { name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', class: 'zf-contact-trap' });
    var status = el('p', { class: 'zf-contact-status', role: 'status' });
    var button = el('button', { type: 'submit', class: 'route-button' }, f('send'));
    form.append(field(f('name'), name), field(f('email'), email), field(f('topic'), topic), field(f('order'), order), field(f('message'), message), trap, button, status);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      button.disabled = true; button.textContent = f('sending'); status.textContent = '';
      fetch(api + '/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.value, email: email.value, topic: topic.value, orderRef: order.value, message: message.value, website: trap.value }) })
        .then(function (res) {
          button.disabled = false; button.textContent = f('send');
          if (res.ok) { form.reset(); status.textContent = f('sent'); status.className = 'zf-contact-status ok'; return; }
          status.className = 'zf-contact-status error';
          status.textContent = res.status === 422 ? f('invalid') : res.status === 429 ? f('tooMany') : f('failed');
        })
        .catch(function () { button.disabled = false; button.textContent = f('send'); status.className = 'zf-contact-status error'; status.textContent = f('failed'); });
    });
    return form;
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
    '.zf-contact{display:grid;gap:14px;max-width:560px;margin-top:8px}.zf-contact label{display:grid;gap:6px;font-size:13px}',
    '.zf-contact input,.zf-contact select,.zf-contact textarea{font:inherit;font-size:15px;padding:10px 12px;border:1px solid var(--zf-line,#ccc);background:#fff}',
    '.zf-contact .route-button{justify-self:start}.zf-contact-trap{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}',
    '.zf-contact-status.ok{color:#22613f}.zf-contact-status.error{color:#8f2b2b}',
  ].join('\n');
  document.head.appendChild(style);

  document.getElementById('localeSelect') && document.getElementById('localeSelect').addEventListener('change', function () { setTimeout(render, 0); });
  // Older layers may draw #pageContent on their own schedule: draw after them.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(render, 0); });
  else setTimeout(render, 0);
  window.ZFashionLegalPages = { owns: function (id) { return !!LEGAL.DOCS[id]; }, render: render };
})();
