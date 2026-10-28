/* ============================================================
   Z FIND — ZOS ECOSYSTEM FOOTER + FOOTER PAGES
   Keeps Z Find independent while exposing the wider ZOS family.

   - The ZOS portals row: a portal with a validated public address
     opens it (new tab); every other portal opens the « en
     développement » page of Z Find (#/<lang>/bientot/<portal>) — never
     a dead or inert link.
   - Footer shortcuts are real hash links in the current language:
     type filters (#/<lang>/search?subtype=…), the professionals page,
     and the « Confiance et vérification » page (#/<lang>/confiance).
   - The two small pages (bientot, confiance) are rendered here; the
     router (app.js render()) calls renderComingSoonPage / renderTrustPage.
   ============================================================ */

(function () {
  'use strict';

  /* status 'live': canonical public address validated (zstudio.space is the
     Z Studio domain configured in apps/studio). Everything else is in
     development: preview deployments (*.vercel.app) are not public links. */
  const ZOS_APPS = [
    { key: 'studio', label: 'Z Studio', href: 'https://zstudio.space', status: 'live',
      desc: { fr: 'Création de contenus visuels et vidéo pour les professionnels.', en: 'Visual and video content creation for professionals.' } },
    { key: 'fashion', label: 'Z Fashion', href: null, status: 'development',
      desc: { fr: 'La mode et le lifestyle des boutiques indépendantes : vêtements, chaussures, sport, maroquinerie et cosmétique, réunis sur une même place de marché.', en: 'Fashion and lifestyle from independent stores — clothing, footwear, sportswear, leather goods and cosmetics — on one marketplace.' } },
    { key: 'desk', label: 'Z Desk', href: null, status: 'development',
      desc: { fr: 'L’espace de travail des équipes : e-mails, WhatsApp, agenda, tâches et planning réunis au même endroit.', en: 'The workspace for teams: e-mail, WhatsApp, calendar, tasks and schedules in one place.' } },
    { key: 'jobs', label: 'Z Jobs', href: null, status: 'development',
      desc: { fr: 'L’emploi en Europe : des offres d’employeurs vérifiés, gratuites pour les candidats.', en: 'Jobs in Europe: offers from verified employers, free for candidates.' } },
    { key: 'mobility', label: 'Z Mobility', href: null, status: 'development',
      desc: { fr: 'La place de marché automobile, appuyée sur les données officielles des constructeurs.', en: 'The car marketplace, built on official manufacturer data.' } },
    { key: 'intelligence', label: 'Z Intelligence', href: null, status: 'development',
      desc: { fr: 'Analyses de marché et outils de prospection pour les professionnels de l’immobilier.', en: 'Market analysis and prospecting tools for real estate professionals.' } }
  ];

  const COPY = {
    fr: {
      soon: 'bientôt',
      comingTitle: name => `${name} est en cours de développement`,
      comingLead: 'Bientôt disponible',
      comingNote: 'Ce portail fait partie du Z Operating System, la famille de services indépendants dont Z Find fait partie. Il ouvrira prochainement à cette adresse.',
      otherPortals: 'Les portails Z Operating System',
      live: 'Disponible', inDev: 'En développement',
      back: 'Retour à Z Find', search: 'Rechercher un bien',
      unknownTitle: 'Portail introuvable',
      trustEyebrow: 'Z Find',
      trustTitle: 'Confiance et vérification',
      trustLead: 'Z Find ne publie que des annonces de professionnels de l’immobilier identifiés, et vérifie les informations exigées par la loi avant toute mise en ligne.',
      trust: [
        ['provenance', 'Provenance des annonces', [
          'Chaque annonce est publiée par une agence ou un promoteur identifié (SIRET, numéro d’entreprise ou d’immatriculation), jamais par un particulier.',
          'L’annonce est rattachée au mandat de l’agence qui la diffuse : son nom figure sur chaque fiche, avec ses coordonnées.',
          'Les annonces importées depuis le logiciel d’une agence peuvent être synchronisées chaque nuit avec leur source, sans saisie en double.'
        ]],
        ['verification', 'Comment les annonces sont vérifiées', [
          'Avant publication, Z Find contrôle les mentions obligatoires de chaque pays : DPE, honoraires, copropriété et Géorisques en France ; certificat PEB ou EPC, inondation et urbanisme en Belgique ; passeport énergétique au Luxembourg.',
          'Une annonce dont les mentions sont incomplètes ou non validées ne peut pas être mise en ligne.',
          'Les chiffres affichés (prix, surfaces, charges) sont ceux déclarés par l’agence ; Z Find ne les recalcule pas.'
        ]],
        ['neutralite', 'Des résultats neutres', [
          'Une mise en avant payée n’est jamais mélangée aux résultats de recherche et porte toujours la mention « À la une ».',
          'Les avis sont laissés uniquement par des personnes qui ont contacté l’agence via Z Find, et relus avant publication.'
        ]]
      ],
      contact: 'Une question ou une annonce à signaler ? Écrivez-nous à',
      pageTitleComing: name => `${name} — bientôt disponible — Z Find`,
      pageTitleTrust: 'Confiance et vérification — Z Find'
    },
    en: {
      soon: 'soon',
      comingTitle: name => `${name} is under development`,
      comingLead: 'Coming soon',
      comingNote: 'This portal is part of the Z Operating System, the family of independent services Z Find belongs to. It will open soon.',
      otherPortals: 'Z Operating System portals',
      live: 'Available', inDev: 'In development',
      back: 'Back to Z Find', search: 'Search properties',
      unknownTitle: 'Portal not found',
      trustEyebrow: 'Z Find',
      trustTitle: 'Trust and verification',
      trustLead: 'Z Find only publishes listings from identified real estate professionals, and checks the information required by law before anything goes online.',
      trust: [
        ['provenance', 'Where listings come from', [
          'Every listing is published by an identified agency or developer (company or registration number), never by a private individual.',
          'A listing is tied to the mandate of the agency that publishes it: its name and contact details appear on every page.',
          'Listings imported from an agency’s software can be synchronised with their source every night, without double entry.'
        ]],
        ['verification', 'How listings are verified', [
          'Before publication, Z Find checks each country’s mandatory information: energy rating, fees, condominium and Géorisques in France; EPB / EPC certificate, flood risk and planning in Belgium; energy pass in Luxembourg.',
          'A listing whose mandatory information is incomplete or not validated cannot go online.',
          'Figures (price, areas, charges) are those declared by the agency; Z Find does not recompute them.'
        ]],
        ['neutralite', 'Neutral results', [
          'A paid placement is never mixed into search results and is always labelled « Featured ».',
          'Reviews come only from people who contacted the agency through Z Find, and are read before publication.'
        ]]
      ],
      contact: 'A question, or a listing to report? Write to',
      pageTitleComing: name => `${name} — coming soon — Z Find`,
      pageTitleTrust: 'Trust and verification — Z Find'
    }
  };

  /* Footer shortcuts: data-i18n key → route (without the language). */
  const FOOTER_ROUTES = {
    'footer.buyApartments': 'search?subtype=apartment',
    'footer.buyHouses': 'search?subtype=villa',
    'footer.rentals': 'search?transactionType=rent',
    'footer.developments': 'search?subtype=development',
    'footer.land': 'search?subtype=land',
    'footer.publishListings': 'pro',
    'footer.pricing': 'pro',
    'footer.trust': 'confiance?section=verification'
  };

  const STYLE_ID = 'zfind-zos-ecosystem-footer-style';
  const ROW_ID = 'zfind-zos-ecosystem-footer';

  function lang() {
    const raw = (location.hash.replace(/^#\/?/, '').split('/')[0] || document.documentElement.lang || 'fr').toLowerCase();
    return raw === 'en' ? 'en' : 'fr';
  }
  function copy(l) { return COPY[l] || COPY.fr; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function routeHref(route, l) { return '#/' + (l || lang()) + '/' + route; }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      footer.site .cols {
        grid-template-columns: 1.6fr repeat(5, 1fr);
        gap: 28px;
      }
      footer.site .footer-about {
        margin: 14px 0 16px;
        max-width: 260px;
        color: var(--gray-400);
        font-size: 0.85rem;
        line-height: 1.6;
      }

      #${ROW_ID} {
        border-top: 1px solid var(--gray-700);
        margin-top: 44px;
        padding-top: 20px;
        display: flex;
        justify-content: flex-end;
      }

      #${ROW_ID} .zos-ecosystem-links {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        flex-wrap: wrap;
      }

      #${ROW_ID} .zos-app-link {
        display: inline-flex;
        align-items: baseline;
        gap: 5px;
        padding: 5px 0;
        color: var(--gray-400);
        font-size: 0.78rem;
        letter-spacing: 0.015em;
        line-height: 1.35;
        white-space: nowrap;
      }

      #${ROW_ID} .zos-app-link + .zos-app-link::before {
        content: "·";
        color: var(--gray-600);
        margin: 0 10px 0 5px;
      }

      #${ROW_ID} a.zos-app-link:hover {
        color: #fff;
      }

      #${ROW_ID} .zos-app-soon {
        color: var(--gold-light, #D4AF7A);
        font-size: 0.64rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        opacity: 0.85;
      }

      footer.site .bottom {
        margin-top: 20px;
      }

      .zfoot-page { padding-top: 56px; padding-bottom: 72px; }
      .zfoot-page h1 { font-size: 2.3rem; margin: 6px 0 12px; line-height: 1.15; }
      .zfoot-page h2 { font-size: 1.45rem; margin: 34px 0 12px; }
      .zfoot-lead { max-width: 720px; color: var(--gray-700); line-height: 1.7; font-size: 1.02rem; }
      .zfoot-soon-card {
        max-width: 720px; margin-top: 26px; padding: 26px 28px;
        border: 1px solid var(--gold-light, #D4AF7A); border-radius: var(--radius, 14px);
        background: var(--gold-pale, #F5EDD8);
      }
      .zfoot-soon-card .zfoot-status {
        display: inline-block; margin-bottom: 10px; padding: 4px 10px; border-radius: 999px;
        background: #fff; color: var(--gold-dark, #8B6B3A); font-size: .72rem; font-weight: 600;
        letter-spacing: .08em; text-transform: uppercase;
      }
      .zfoot-soon-card p { margin: 0 0 10px; color: var(--gray-700); line-height: 1.65; }
      .zfoot-soon-card p:last-child { margin-bottom: 0; }
      .zfoot-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
      .zfoot-portals { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); max-width: 900px; }
      .zfoot-portal {
        display: block; padding: 16px 18px; border: 1px solid var(--gray-200); border-radius: var(--radius, 14px);
        background: #fff; color: var(--gray-900); text-decoration: none;
      }
      .zfoot-portal:hover { border-color: var(--gold, #B8935A); }
      .zfoot-portal.is-current { border-color: var(--gold, #B8935A); box-shadow: inset 0 0 0 1px var(--gold, #B8935A); }
      .zfoot-portal strong { display: block; font-size: 1rem; margin-bottom: 4px; }
      .zfoot-portal span { color: var(--gray-500); font-size: .8rem; }
      .zfoot-trust { max-width: 760px; }
      .zfoot-trust ul { padding-left: 20px; line-height: 1.75; color: var(--gray-700); margin: 0; }
      .zfoot-trust section { scroll-margin-top: 90px; }
      .zfoot-contact { margin-top: 30px; color: var(--gray-500); font-size: .9rem; }

      @media (max-width: 1100px) {
        footer.site .cols {
          grid-template-columns: repeat(3, 1fr);
        }
        footer.site .footer-brand {
          grid-column: 1 / -1;
        }
        footer.site .footer-about {
          max-width: 520px;
        }
      }

      @media (max-width: 900px) {
        footer.site .cols {
          grid-template-columns: 1fr 1fr;
        }

        #${ROW_ID},
        #${ROW_ID} .zos-ecosystem-links {
          justify-content: flex-start;
        }
      }

      @media (max-width: 560px) {
        footer.site .cols {
          grid-template-columns: 1fr 1fr;
          gap: 22px 16px;
        }
        footer.site a {
          padding: 6px 0;
        }

        #${ROW_ID} .zos-ecosystem-links {
          row-gap: 2px;
        }

        .zfoot-page { padding-top: 34px; padding-bottom: 52px; }
        .zfoot-page h1 { font-size: 1.8rem; }
        .zfoot-soon-card { padding: 20px; }
        .zfoot-actions .btn { width: 100%; justify-content: center; text-align: center; }
      }
    `;

    document.head.appendChild(style);
  }

  function createAppItem(app) {
    const node = document.createElement('a');
    node.className = 'zos-app-link' + (app.status === 'live' ? '' : ' is-coming');
    node.dataset.zosApp = app.key;
    node.dataset.linkState = app.status;
    node.textContent = app.label;
    if (app.status === 'live') {
      node.href = app.href;
      node.target = '_blank';
      node.rel = 'noopener';
    } else {
      node.href = routeHref('bientot/' + app.key);
      const soon = document.createElement('span');
      soon.className = 'zos-app-soon';
      soon.textContent = copy(lang()).soon;
      node.appendChild(soon);
    }
    return node;
  }

  /* Language-aware hrefs of the footer (static HTML is French by default). */
  function syncLinks() {
    const l = lang();
    document.querySelectorAll('footer.site a[data-i18n]').forEach(a => {
      const route = FOOTER_ROUTES[a.dataset.i18n];
      if (!route) return;
      a.setAttribute('href', routeHref(route, l));
      a.removeAttribute('onclick');
      a.dataset.footerRoute = route;
    });
    // Static pages that exist in English (glossary): follow the language.
    document.querySelectorAll('footer.site a[data-href-en]').forEach(a => {
      if (!a.dataset.hrefFr) a.dataset.hrefFr = a.getAttribute('href');
      a.setAttribute('href', l === 'en' ? a.dataset.hrefEn : a.dataset.hrefFr);
      a.setAttribute('hreflang', l === 'en' ? 'en' : 'fr');
    });
    document.querySelectorAll('#' + ROW_ID + ' a.is-coming').forEach(a => {
      a.setAttribute('href', routeHref('bientot/' + a.dataset.zosApp, l));
      const soon = a.querySelector('.zos-app-soon');
      if (soon) soon.textContent = copy(l).soon;
    });
  }

  function mount() {
    const footer = document.querySelector('footer.site .wrap');
    if (!footer) return;
    installStyles();

    if (!document.getElementById(ROW_ID)) {
      const bottom = footer.querySelector('.bottom');
      if (!bottom) return;
      const row = document.createElement('div');
      row.id = ROW_ID;
      row.className = 'zos-ecosystem-footer';

      const nav = document.createElement('nav');
      nav.className = 'zos-ecosystem-links';
      nav.setAttribute('aria-label', 'Z Operating System');

      ZOS_APPS.forEach((app) => nav.appendChild(createAppItem(app)));
      row.appendChild(nav);
      footer.insertBefore(row, bottom);
    }
    syncLinks();
  }

  /* ---------------- « en développement » page ---------------- */
  function portalCards(currentKey, l) {
    const c = copy(l);
    return ZOS_APPS.map(app => {
      const live = app.status === 'live';
      const href = live ? app.href : routeHref('bientot/' + app.key, l);
      return `<a class="zfoot-portal${app.key === currentKey ? ' is-current' : ''}" href="${esc(href)}"${live ? ' target="_blank" rel="noopener"' : ''} data-zos-portal="${esc(app.key)}">
        <strong>${esc(app.label)}</strong><span>${esc(live ? c.live : c.inDev)}</span></a>`;
    }).join('');
  }

  function renderComingSoonPage(root, key, l) {
    if (!root) return null;
    const lg = l === 'en' ? 'en' : 'fr';
    const c = copy(lg);
    const app = ZOS_APPS.find(a => a.key === key && a.status !== 'live') || null;
    const name = app ? app.label : c.unknownTitle;
    root.innerHTML = `
      <div class="wrap zfoot-page" data-zfoot-page="bientot">
        <p class="eyebrow">Z Operating System</p>
        <h1>${esc(app ? c.comingTitle(app.label) : c.unknownTitle)}</h1>
        ${app ? `<div class="zfoot-soon-card">
          <span class="zfoot-status">${esc(c.comingLead)}</span>
          <p><strong>${esc(app.desc[lg])}</strong></p>
          <p>${esc(c.comingNote)}</p>
        </div>` : ''}
        <div class="zfoot-actions">
          <a class="btn btn-gold" href="#/${lg}/home">${esc(c.back)}</a>
          <a class="btn btn-outline" href="#/${lg}/search">${esc(c.search)}</a>
        </div>
        <h2>${esc(c.otherPortals)}</h2>
        <div class="zfoot-portals">${portalCards(app && app.key, lg)}</div>
      </div>`;
    const title = app ? c.pageTitleComing(name) : name + ' — Z Find';
    document.title = title;
    return title;
  }

  /* ---------------- « Confiance et vérification » page ---------------- */
  function renderTrustPage(root, l, section) {
    if (!root) return null;
    const lg = l === 'en' ? 'en' : 'fr';
    const c = copy(lg);
    root.innerHTML = `
      <div class="wrap zfoot-page zfoot-trust" data-zfoot-page="confiance">
        <p class="eyebrow">${esc(c.trustEyebrow)}</p>
        <h1>${esc(c.trustTitle)}</h1>
        <p class="zfoot-lead">${esc(c.trustLead)}</p>
        ${c.trust.map(([id, title, items]) => `<section id="confiance-${esc(id)}"><h2>${esc(title)}</h2><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>`).join('')}
        <p class="zfoot-contact">${esc(c.contact)} <a href="mailto:hello@zfind.online">hello@zfind.online</a>.</p>
        <div class="zfoot-actions"><a class="btn btn-gold" href="#/${lg}/search">${esc(c.search)}</a></div>
      </div>`;
    document.title = c.pageTitleTrust;
    if (section) {
      const target = root.querySelector('#confiance-' + String(section).replace(/[^a-z-]/g, ''));
      if (target) setTimeout(() => target.scrollIntoView({ block: 'start' }), 30);
    } else {
      window.scrollTo(0, 0);
    }
    return c.pageTitleTrust;
  }

  window.ZFindZOSEcosystemFooter = Object.freeze({
    apps: ZOS_APPS.map((app) => Object.freeze({ ...app })),
    routes: Object.freeze({ ...FOOTER_ROUTES }),
    mount,
    syncLinks,
    renderComingSoonPage,
    renderTrustPage
  });

  window.addEventListener('hashchange', syncLinks);
  mount();
})();
