/* ============================================================
   Z FIND — WEBSITE LEGAL / PRIVACY RUNTIME

   This module publishes only source-backed statements.
   It deliberately DOES NOT publish incomplete Mentions légales or a
   full Article 13 privacy policy until the controller/operator legal
   identity is authoritative. Missing legal identity fails closed.
   ============================================================ */

(function () {
  'use strict';

  const DATA_CONTACT = 'hello@zfind.online';
  const COOKIE_VIEW_ID = 'view-cookies';
  const COOKIE_LINK_ID = 'zfind-cookie-policy-link';

  /* Hosting authority is public Vercel legal information. It is kept
     here for the future Mentions légales renderer, but that renderer
     remains disabled until Z Find's own publisher identity is complete. */
  const HOST = Object.freeze({
    legalName: 'Vercel Inc.',
    address: '440 N Barranca Avenue #4133, Covina, CA 91723, United States',
    privacyEmail: 'privacy@vercel.com'
  });

  const LEGAL_IDENTITY = Object.freeze({
    publisherLegalName: null,
    publisherLegalForm: null,
    registeredAddress: null,
    registrationNumber: null,
    publicationDirector: null,
    publisherPhone: null,
    vatNumber: null
  });

  const REQUIRED_PUBLISHER_FIELDS = Object.freeze([
    'publisherLegalName',
    'publisherLegalForm',
    'registeredAddress',
    'registrationNumber',
    'publicationDirector',
    'publisherPhone'
  ]);

  const missingPublisherFields = Object.freeze(
    REQUIRED_PUBLISHER_FIELDS.filter(key => !LEGAL_IDENTITY[key])
  );

  const publisherIdentityComplete = missingPublisherFields.length === 0;

  const COPY = Object.freeze({
    fr: Object.freeze({
      cookieLink: 'Cookies et traceurs',
      cookieTitle: 'Cookies et traceurs',
      cookieIntro: 'Z Find limite le stockage sur votre appareil aux fonctions techniques actuellement nécessaires à l’expérience demandée.',
      currentTitle: 'Utilisation actuelle',
      currentBody: 'Le code public Z Find ne contient actuellement aucun outil publicitaire ni aucun outil de mesure d’audience nécessitant un consentement. La préférence de langue peut être conservée localement et, lorsque vous vous connectez, le service d’authentification conserve les informations techniques nécessaires à votre session.',
      consentTitle: 'Consentement',
      consentBody: 'Aucun bandeau de consentement n’est affiché tant qu’aucun traceur non essentiel n’est utilisé. Si Z Find ajoute ultérieurement des traceurs soumis au consentement, ils devront être bloqués jusqu’à votre choix et la présente information sera mise à jour.',
      thirdPartyTitle: 'Infrastructure',
      thirdPartyBody: 'Le site est hébergé sur Vercel et utilise Supabase pour les services de données et d’authentification. Ces fournisseurs peuvent mettre en œuvre des mécanismes techniques nécessaires à la sécurité, à la livraison du service ou à une session expressément demandée. Lorsqu’une annonce affiche une carte, le navigateur se connecte également à OpenStreetMap afin de charger ce contenu cartographique.',
      contactTitle: 'Question sur vos données ou traceurs',
      back: '← Retour à Z Find',
      rgpd: 'Les données saisies (nom, e-mail ou téléphone, message et, le cas échéant, réponses de qualification) sont utilisées pour traiter cette demande et la transmettre au partenaire qui représente cette opportunité. Pour toute question relative à vos données :'
    }),
    en: Object.freeze({
      cookieLink: 'Cookies & trackers',
      cookieTitle: 'Cookies & trackers',
      cookieIntro: 'Z Find limits device storage to technical functions currently necessary for the experience you request.',
      currentTitle: 'Current use',
      currentBody: 'The public Z Find code currently contains no advertising tracker or audience-measurement tool requiring consent. Your language preference may be stored locally and, when you sign in, the authentication service retains technical information needed for your session.',
      consentTitle: 'Consent',
      consentBody: 'No consent banner is displayed while no non-essential tracker is used. If Z Find later adds trackers requiring consent, they must be blocked until you make a choice and this notice will be updated.',
      thirdPartyTitle: 'Infrastructure',
      thirdPartyBody: 'The site is hosted on Vercel and uses Supabase for data and authentication services. These providers may use technical mechanisms necessary for security, service delivery or a session you expressly request. When a listing displays a map, the browser also connects to OpenStreetMap to load that map content.',
      contactTitle: 'Questions about your data or trackers',
      back: '← Back to Z Find',
      rgpd: 'The data you enter (name, email or phone, message and, where applicable, qualification answers) is used to process this enquiry and route it to the partner representing this opportunity. For questions about your data:'
    }),
    pt: Object.freeze({
      cookieLink: 'Cookies e rastreadores',
      cookieTitle: 'Cookies e rastreadores',
      cookieIntro: 'O Z Find limita o armazenamento no seu dispositivo às funções técnicas atualmente necessárias à experiência solicitada.',
      currentTitle: 'Utilização atual',
      currentBody: 'O código público do Z Find não contém atualmente ferramentas publicitárias nem ferramentas de medição de audiência que exijam consentimento. A preferência de idioma pode ser guardada localmente e, quando inicia sessão, o serviço de autenticação conserva a informação técnica necessária à sessão.',
      consentTitle: 'Consentimento',
      consentBody: 'Não é apresentado um banner de consentimento enquanto não forem utilizados rastreadores não essenciais. Se o Z Find vier a adicionar rastreadores sujeitos a consentimento, estes deverão ficar bloqueados até à sua escolha e esta informação será atualizada.',
      thirdPartyTitle: 'Infraestrutura',
      thirdPartyBody: 'O site é alojado na Vercel e utiliza Supabase para serviços de dados e autenticação. Estes fornecedores podem utilizar mecanismos técnicos necessários à segurança, entrega do serviço ou a uma sessão expressamente solicitada. Quando um anúncio apresenta um mapa, o navegador também se liga ao OpenStreetMap para carregar esse conteúdo cartográfico.',
      contactTitle: 'Questões sobre os seus dados ou rastreadores',
      back: '← Voltar ao Z Find',
      rgpd: 'Os dados introduzidos (nome, e-mail ou telefone, mensagem e, quando aplicável, respostas de qualificação) são utilizados para tratar este pedido e encaminhá-lo para o parceiro que representa esta oportunidade. Para questões sobre os seus dados:'
    })
  });

  function locale() {
    const hashLang = location.hash.replace(/^#\/?/, '').split('/')[0].toLowerCase();
    if (hashLang === 'en' || hashLang === 'pt') return hashLang;
    return 'fr';
  }

  function copy() { return COPY[locale()] || COPY.fr; }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function installStyles() {
    if (document.getElementById('zfind-website-legal-style')) return;
    const style = document.createElement('style');
    style.id = 'zfind-website-legal-style';
    style.textContent = `
      #${COOKIE_VIEW_ID} .zfind-legal-shell { max-width: 780px; padding-top: 54px; padding-bottom: 76px; }
      #${COOKIE_VIEW_ID} .zfind-legal-shell h1 { margin: 8px 0 12px; font-size: clamp(2rem,5vw,3rem); line-height: 1.04; }
      #${COOKIE_VIEW_ID} .zfind-legal-lead { color: var(--gray-500); line-height: 1.7; margin-bottom: 34px; }
      #${COOKIE_VIEW_ID} .zfind-legal-section { padding: 22px 0; border-top: 1px solid var(--gray-200); }
      #${COOKIE_VIEW_ID} .zfind-legal-section h2 { font-size: 1.35rem; margin: 0 0 8px; }
      #${COOKIE_VIEW_ID} .zfind-legal-section p { color: var(--gray-600); line-height: 1.75; margin: 0; }
      #${COOKIE_VIEW_ID} .zfind-legal-contact { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
      #${COOKIE_LINK_ID} { cursor: pointer; }
      .zfind-rgpd-first-layer { display: block; margin-top: 12px; color: var(--gray-500); font-size: .72rem; line-height: 1.55; text-align: left; }
      .zfind-rgpd-first-layer a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
      @media (max-width:640px) {
        #${COOKIE_VIEW_ID} .zfind-legal-shell { padding-top: 36px; padding-bottom: 54px; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderCookieView() {
    const view = document.getElementById(COOKIE_VIEW_ID);
    if (!view) return;
    const c = copy();
    view.innerHTML = `
      <div class="wrap zfind-legal-shell">
        <button class="btn btn-ghost" type="button" onclick="navigate('home')">${escapeHtml(c.back)}</button>
        <span class="eyebrow" style="display:block;margin-top:28px;">Z Find</span>
        <h1>${escapeHtml(c.cookieTitle)}</h1>
        <p class="zfind-legal-lead">${escapeHtml(c.cookieIntro)}</p>
        <section class="zfind-legal-section"><h2>${escapeHtml(c.currentTitle)}</h2><p>${escapeHtml(c.currentBody)}</p></section>
        <section class="zfind-legal-section"><h2>${escapeHtml(c.consentTitle)}</h2><p>${escapeHtml(c.consentBody)}</p></section>
        <section class="zfind-legal-section"><h2>${escapeHtml(c.thirdPartyTitle)}</h2><p>${escapeHtml(c.thirdPartyBody)}</p></section>
        <section class="zfind-legal-section"><h2>${escapeHtml(c.contactTitle)}</h2><p><a class="zfind-legal-contact" href="mailto:${DATA_CONTACT}">${DATA_CONTACT}</a></p></section>
      </div>`;
  }

  function installCookieView() {
    if (document.getElementById(COOKIE_VIEW_ID)) return;
    const main = document.querySelector('main');
    if (!main) return;
    const section = document.createElement('section');
    section.className = 'view';
    section.id = COOKIE_VIEW_ID;
    main.appendChild(section);
    renderCookieView();
  }

  function installCookieFooterLink() {
    if (document.getElementById(COOKIE_LINK_ID)) return;
    const bottom = document.querySelector('footer.site .bottom');
    if (!bottom) return;
    const link = document.createElement('a');
    link.id = COOKIE_LINK_ID;
    link.href = '#';
    link.style.marginLeft = '14px';
    link.addEventListener('click', event => {
      event.preventDefault();
      navigate('cookies');
    });
    bottom.appendChild(link);
    syncCopy();
  }

  function installRgpdNotice() {
    const body = document.getElementById('enquiry-body');
    if (!body) return;
    const disclaimer = body.querySelector('.disclaimer');
    if (!disclaimer) return;

    disclaimer.classList.add('zfind-rgpd-first-layer');
    disclaimer.classList.remove('disclaimer');
    disclaimer.style.cssText = '';
    disclaimer.innerHTML = `${escapeHtml(copy().rgpd)} <a href="mailto:${DATA_CONTACT}">${DATA_CONTACT}</a>`;
  }

  function syncCopy() {
    const link = document.getElementById(COOKIE_LINK_ID);
    if (link) link.textContent = copy().cookieLink;
    if (document.getElementById(COOKIE_VIEW_ID)) renderCookieView();
    installRgpdNotice();
  }

  function observeEnquiry() {
    const body = document.getElementById('enquiry-body');
    if (!body || body.dataset.rgpdObserverInstalled === 'true') return;
    body.dataset.rgpdObserverInstalled = 'true';
    new MutationObserver(installRgpdNotice).observe(body, { childList:true, subtree:true });
  }

  function mount() {
    installStyles();
    installCookieView();
    installCookieFooterLink();
    observeEnquiry();
    syncCopy();
  }

  window.addEventListener('hashchange', syncCopy);
  document.addEventListener('DOMContentLoaded', mount);

  window.ZFindWebsiteLegalReadiness = Object.freeze({
    publisherIdentityComplete,
    missingPublisherFields,
    mentionsLegalesReady: false,
    privacyPolicyArticle13Ready: false,
    cookiePolicyReady: true,
    nonEssentialTrackingFoundInApplicationSource: false,
    consentBannerRequiredByCurrentApplicationSource: false,
    dataContact: DATA_CONTACT,
    host: HOST
  });
})();
