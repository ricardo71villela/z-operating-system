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
      avg: 'Salaire moyen par ville',
      grids: 'Grilles conventionnelles',
      law: 'Droit du travail FR, BE, LU',
      econ: 'Inflation, chômage, SMIC',
      about2: 'Z Jobs',
      cities: 'Emploi par ville',
      trust: 'Employeur vérifié',
      free: 'Gratuit pour les candidats',
      contact: 'Nous écrire',
      soon: 'bientôt',
      rights: '© 2026 Z Jobs — construit sur le Z Operating System',
      place: 'Publier, Haute-Savoie, France',
      legal: 'Mentions légales'
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
      avg: 'Average salary by city',
      grids: 'Collective agreement scales',
      law: 'Labour law FR, BE, LU',
      econ: 'Inflation, unemployment, minimum wage',
      about2: 'Z Jobs',
      cities: 'Jobs by city',
      trust: 'Verified employers',
      free: 'Free for candidates',
      contact: 'Write to us',
      soon: 'soon',
      rights: '© 2026 Z Jobs — built on the Z Operating System',
      place: 'Publier, Haute-Savoie, France',
      legal: 'Legal notice'
    }
  };

  var ZOS = [
    { label: 'Z Find', href: 'https://zfind.online' },
    { label: 'Z Studio', href: 'https://zstudio.space' },
    { label: 'Z Fashion', href: 'https://zfashion.online' },
    { label: 'Z Desk', href: 'https://z-desk.vercel.app' },
    { label: 'Z Mobility', href: null },
    { label: 'Z Intelligence', href: null }
  ];

  function lang() { return document.documentElement.lang === 'en' ? 'en' : 'fr'; }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* Adresse d'une page dans la langue courante : les pages statiques ont
     leur version anglaise sous /en/… ; les pages de l'API prennent ?lang=en. */
  var STATIC = /^\/(candidats|employeurs|outils|mentions-legales)?(?=$|#)/;
  function href(p) {
    if (lang() !== 'en' || !/^\//.test(p)) return p;
    if (STATIC.test(p)) return p === '/' ? '/en' : p.charAt(1) === '#' ? '/en' + p.slice(1) : '/en' + p;
    return p + (p.indexOf('?') < 0 ? '?lang=en' : '&lang=en');
  }

  /* Pages « Emploi à {ville} » des 6 grandes villes (rendues par l'API, /emploi/<slug>-<insee>). */
  var CITIES = [['paris-75056', 'Paris'], ['marseille-13055', 'Marseille'], ['lyon-69123', 'Lyon'], ['toulouse-31555', 'Toulouse'], ['nice-06088', 'Nice'], ['nantes-44109', 'Nantes']];

  function footerHtml(c) {
    var col = function (title, links) {
      return '<nav aria-label="' + esc(title) + '"><h2 class="zj-foot-h">' + esc(title) + '</h2>' +
        links.map(function (l) { return '<a href="' + esc(href(l[0])) + '"' + (/^https?:/.test(l[0]) && l[0].indexOf('zjobs.online') < 0 ? ' rel="noopener"' : '') + '>' + esc(l[1]) + '</a>'; }).join('') + '</nav>';
    };
    return '<div class="wrap">' +
      '<div class="zj-foot-cols">' +
        '<div class="zj-foot-brand"><div class="zj-foot-logo">Z <b>Jobs</b></div>' +
          '<div class="zj-foot-tagline">' + esc(c.tagline) + '</div>' +
          '<p class="zj-foot-about">' + esc(c.about) + '</p>' +
          '<a href="mailto:hello@zjobs.online">hello@zjobs.online</a></div>' +
        col(c.candidates, [['/#recherche', c.search], ['/candidats#cvstudio', c.cv], ['/candidats#coverletter', c.letter], [APP_URL, c.alerts], [APP_URL, c.profile]]) +
        col(c.employers, [['/employeurs', c.post], ['/employeurs#pricing', c.pricing], ['/employeurs#badges', c.labels], ['/employeurs#scoring', c.scoring], [APP_URL, c.employerSpace]]) +
        col(c.tools, [[lang() === 'en' ? '/en/gross-to-net-salary-france' : '/salaire-brut-net', c.net], ['/salaire-moyen', c.avg], ['/outils#grilles', c.grids], ['/outils#legislation', c.law], ['/outils#economie', c.econ]]) +
        col(c.about2, [['/employeurs#badges', c.trust], ['/candidats', c.free], ['mailto:hello@zjobs.online', c.contact]]) +
      '</div>' +
      '<nav class="zj-foot-cities" aria-label="' + esc(c.cities) + '"><h2 class="zj-foot-h">' + esc(c.cities) + '</h2>' + CITIES.map(function (v) {
        return '<a href="' + href('/emploi/' + v[0]) + '">' + esc(v[1]) + '</a>';
      }).join('') + '</nav>' +
      '<nav class="zj-foot-zos" aria-label="Z Operating System">' + ZOS.map(function (a) {
        return a.href ? '<a href="' + a.href + '" target="_blank" rel="noopener">' + esc(a.label) + '</a>' : '<span>' + esc(a.label) + '<span class="soon">' + esc(c.soon) + '</span></span>';
      }).join('') + '</nav>' +
      '<div class="zj-foot-bottom"><span>' + esc(c.rights) + '</span><span class="zj-foot-legal"><a href="' + href('/mentions-legales') + '">' + esc(c.legal) + '</a><span>' + esc(c.place) + '</span></span></div>' +
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

  /* Boutons FR / EN : chaque langue a sa propre adresse (hreflang de la page). */
  function onLocaleClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('.locales button[data-locale]') : null;
    if (!btn) return;
    var alt = document.querySelector('link[rel="alternate"][hreflang="' + btn.getAttribute('data-locale') + '"]');
    if (!alt) return;
    var u = new URL(alt.getAttribute('href'), location.href);
    if (u.pathname.replace(/\/$/, '') === location.pathname.replace(/\.html$/, '').replace(/\/$/, '')) return;
    try { localStorage.setItem('zjobs_locale', btn.getAttribute('data-locale')); } catch (err) { /* sans stockage */ }
    location.href = u.pathname + u.search + location.hash;
  }

  function start() {
    document.addEventListener('click', onLocaleClick, true);
    render();
    new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
