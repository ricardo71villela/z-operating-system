/* ============================================================
   Z JOBS — éléments communs du site public (pied de page, liens
   d'en-tête), en français et en anglais. Suit la langue de la page
   (attribut lang de <html>, changé par setLocale de chaque page).
   ============================================================ */
(function () {
  'use strict';

  var APP_URL = 'https://z-jobs-app.vercel.app/';

  var COPY = {
    fr: {
      signin: 'Se connecter',
      publish: 'Publier une offre',
      tagline: 'Le salaire fait partie de l’offre.',
      about: 'Le site d’emploi de la France, de la Belgique et du Luxembourg : employeurs vérifiés, salaire affiché, réponse sous 14 jours. Toujours gratuit pour les candidats.',
      candidates: 'Candidats',
      search: 'Rechercher une offre',
      cv: 'Améliorer mon CV',
      letter: 'Vérifier ma lettre',
      alerts: 'Alertes emploi',
      profile: 'Mon espace candidat',
      employers: 'Employeurs',
      post: 'Publier une offre',
      pricing: 'Tarifs',
      labels: 'Labels de confiance',
      scoring: 'Tri des candidatures',
      employerSpace: 'Espace employeur',
      tools: 'Salaires et droit du travail',
      net: 'Salaire brut → net',
      grids: 'Grilles conventionnelles',
      law: 'Droit du travail FR, BE, LU',
      econ: 'Inflation, chômage, SMIC',
      about2: 'Z Jobs',
      trust: 'Employeur vérifié',
      free: 'Gratuit pour les candidats',
      contact: 'Nous écrire',
      soon: 'bientôt',
      rights: '© 2026 Z Jobs — construit sur le Z Operating System',
      place: 'Publier, Haute-Savoie, France'
    },
    en: {
      signin: 'Sign in',
      publish: 'Post a job',
      tagline: 'Salary is part of the listing.',
      about: 'The job site for France, Belgium and Luxembourg: verified employers, salary shown, an answer within 14 days. Always free for candidates.',
      candidates: 'Candidates',
      search: 'Search jobs',
      cv: 'Improve my CV',
      letter: 'Check my cover letter',
      alerts: 'Job alerts',
      profile: 'My candidate space',
      employers: 'Employers',
      post: 'Post a job',
      pricing: 'Pricing',
      labels: 'Trust labels',
      scoring: 'Application sorting',
      employerSpace: 'Employer space',
      tools: 'Salaries and labour law',
      net: 'Gross → net salary',
      grids: 'Collective agreement scales',
      law: 'Labour law FR, BE, LU',
      econ: 'Inflation, unemployment, minimum wage',
      about2: 'Z Jobs',
      trust: 'Verified employers',
      free: 'Free for candidates',
      contact: 'Write to us',
      soon: 'soon',
      rights: '© 2026 Z Jobs — built on the Z Operating System',
      place: 'Publier, Haute-Savoie, France'
    }
  };

  var ZOS = [
    { label: 'Z Find', href: 'https://zfind.online' },
    { label: 'Z Studio', href: 'https://zstudio.space' },
    { label: 'Z Fashion', href: 'https://zfashion.online' },
    { label: 'Z Desk', href: null },
    { label: 'Z Mobility', href: null },
    { label: 'Z Intelligence', href: null }
  ];

  function lang() { return document.documentElement.lang === 'en' ? 'en' : 'fr'; }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function footerHtml(c) {
    var col = function (title, links) {
      return '<nav aria-label="' + esc(title) + '"><h2 class="zj-foot-h">' + esc(title) + '</h2>' +
        links.map(function (l) { return '<a href="' + esc(l[0]) + '"' + (/^https?:/.test(l[0]) && l[0].indexOf('zjobs.online') < 0 ? ' rel="noopener"' : '') + '>' + esc(l[1]) + '</a>'; }).join('') + '</nav>';
    };
    return '<div class="wrap">' +
      '<div class="zj-foot-cols">' +
        '<div class="zj-foot-brand"><div class="zj-foot-logo">Z <b>Jobs</b></div>' +
          '<div class="zj-foot-tagline">' + esc(c.tagline) + '</div>' +
          '<p class="zj-foot-about">' + esc(c.about) + '</p>' +
          '<a href="mailto:hello@zjobs.online">hello@zjobs.online</a></div>' +
        col(c.candidates, [['/#recherche', c.search], ['/candidats#cvstudio', c.cv], ['/candidats#coverletter', c.letter], [APP_URL, c.alerts], [APP_URL, c.profile]]) +
        col(c.employers, [['/employeurs', c.post], ['/employeurs#pricing', c.pricing], ['/employeurs#badges', c.labels], ['/employeurs#scoring', c.scoring], [APP_URL, c.employerSpace]]) +
        col(c.tools, [['/outils#simulateur', c.net], ['/outils#grilles', c.grids], ['/outils#legislation', c.law], ['/outils#economie', c.econ]]) +
        col(c.about2, [['/employeurs#badges', c.trust], ['/candidats', c.free], ['mailto:hello@zjobs.online', c.contact]]) +
      '</div>' +
      '<nav class="zj-foot-zos" aria-label="Z Operating System">' + ZOS.map(function (a) {
        return a.href ? '<a href="' + a.href + '" target="_blank" rel="noopener">' + esc(a.label) + '</a>' : '<span>' + esc(a.label) + '<span class="soon">' + esc(c.soon) + '</span></span>';
      }).join('') + '</nav>' +
      '<div class="zj-foot-bottom"><span>' + esc(c.rights) + '</span><span>' + esc(c.place) + '</span></div>' +
    '</div>';
  }

  function render() {
    var c = COPY[lang()];
    var footer = document.querySelector('footer');
    if (footer) footer.innerHTML = footerHtml(c);
    document.querySelectorAll('[data-zj]').forEach(function (el) {
      var key = el.getAttribute('data-zj');
      if (c[key]) el.textContent = c[key];
    });
    document.querySelectorAll('a[data-zj-app]').forEach(function (a) { a.setAttribute('href', APP_URL); });
    // Lien de la page courante dans le menu.
    var here = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    document.querySelectorAll('.navlinks a').forEach(function (a) {
      var target = (a.getAttribute('href') || '').split('#')[0].replace(/\.html$/, '') || '/';
      if (target === here && target !== '/') a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function start() {
    render();
    new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
