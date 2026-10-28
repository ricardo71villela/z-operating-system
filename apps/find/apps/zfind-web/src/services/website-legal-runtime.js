/* ============================================================
   Z FIND — WEBSITE LEGAL / PRIVACY RUNTIME

   This module publishes only source-backed statements: the cookie notice
   and, now that the publisher identity is complete, the Mentions légales
   (route #/<lang>/mentions-legales). A missing identity field still fails
   closed: the page and its footer link are then not shown.
   ============================================================ */

(function () {
  'use strict';

  const DATA_CONTACT = 'hello@zfind.online';
  const COOKIE_VIEW_ID = 'view-cookies';
  const COOKIE_LINK_ID = 'zfind-cookie-policy-link';
  const LEGAL_VIEW_ID = 'view-mentions-legales';
  const LEGAL_LINK_ID = 'zfind-legal-notice-link';

  /* Hosting authority is public Vercel legal information. It is kept
     here for the future Mentions légales renderer, but that renderer
     remains disabled until Z Find's own publisher identity is complete. */
  const HOST = Object.freeze({
    legalName: 'Vercel Inc.',
    address: '440 N Barranca Avenue #4133, Covina, CA 91723, United States',
    privacyEmail: 'privacy@vercel.com'
  });

  /* Publisher identity (owner's decision of 28 Oct 2026): everywhere on the
     site the publisher is « ZOS », its trade name. The person behind the
     individual business (entreprise individuelle) appears once, on the
     Mentions légales page only, because the law requires it there
     (LCEN art. 6-III ; Code de commerce, mention « EI »). */
  const LEGAL_IDENTITY = Object.freeze({
    publisherLegalName: 'ZOS',
    publisherLegalForm: 'nom commercial de José Ricardo Coelho de Vilela, entrepreneur individuel (EI)',
    registeredAddress: '204 rue de la Plaine, 74500 Publier, France',
    registrationNumber: 'SIREN 750 908 493',
    publicationDirector: 'l’entrepreneur individuel exploitant ZOS',
    publisherPhone: '+33 6 74 06 10 15',
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
      legalLink: 'Mentions légales',
      legalTitle: 'Mentions légales',
      legalLead: 'Informations sur l’éditeur et l’hébergeur du site zfind.online.',
      publisherTitle: 'Éditeur',
      publisherBody: id => `Le site zfind.online est édité par ${id.publisherLegalName}, ${id.publisherLegalForm}, immatriculé sous le numéro ${id.registrationNumber}. Adresse : ${id.registeredAddress}.`,
      contactLine: 'Contact',
      directorTitle: 'Directeur de la publication',
      directorBody: id => `${id.publicationDirector.charAt(0).toUpperCase()}${id.publicationDirector.slice(1)}.`,
      hostTitle: 'Hébergement',
      hostBody: h => `Site : ${h.legalName}, ${h.address}. Données et comptes : Supabase, centre de données de l’Union européenne (Irlande).`,
      ipTitle: 'Propriété intellectuelle',
      ipBody: 'La marque Z Find, le logo, la charte graphique et les textes du site appartiennent à ZOS. Les annonces, photos et descriptions des biens sont publiées sous la responsabilité des agences qui les diffusent. Toute reproduction sans autorisation est interdite.',
      reportTitle: 'Signaler un contenu',
      reportBody: 'Une annonce ou un contenu vous paraît illicite ou trompeur ? Écrivez-nous en indiquant l’adresse de la page et la raison du signalement ; chaque signalement reçoit une réponse.',
      cookieLink: 'Cookies et traceurs',
      cookieTitle: 'Cookies et traceurs',
      cookieIntro: 'Z Find limite le stockage sur votre appareil aux fonctions techniques actuellement nécessaires à l’expérience demandée.',
      currentTitle: 'Utilisation actuelle',
      currentBody: 'Le code public Z Find ne contient aucun outil publicitaire. La fréquentation est mesurée avec Vercel Web Analytics, sans cookie ni identifiant stocké sur votre appareil : seules des statistiques agrégées (pages vues, pays, type d’appareil) sont produites, ce qui ne nécessite pas de consentement. La préférence de langue peut être conservée localement et, lorsque vous vous connectez, le service d’authentification conserve les informations techniques nécessaires à votre session.',
      consentTitle: 'Consentement',
      consentBody: 'Aucun bandeau de consentement n’est affiché tant qu’aucun traceur non essentiel n’est utilisé. Si Z Find ajoute ultérieurement des traceurs soumis au consentement, ils devront être bloqués jusqu’à votre choix et la présente information sera mise à jour.',
      thirdPartyTitle: 'Infrastructure',
      thirdPartyBody: 'Le site est hébergé sur Vercel et utilise Supabase pour les services de données et d’authentification. Ces fournisseurs peuvent mettre en œuvre des mécanismes techniques nécessaires à la sécurité, à la livraison du service ou à une session expressément demandée.',
      contactTitle: 'Question sur vos données ou traceurs',
      alertsTitle: 'E-mails, alertes et avis',
      alertsBody: 'Les alertes e-mail (nouvelles annonces, valeur de votre bien) ne démarrent qu’après confirmation du lien reçu par e-mail ; chaque envoi contient un lien de désinscription en un clic. Les demandes non confirmées et les désinscriptions sont effacées sous 30 jours, les alertes au plus tard 3 ans après leur confirmation. Si vous acceptez d’être invité(e) à noter une agence, une seule invitation vous est envoyée une semaine après votre demande ; votre adresse est effacée dès l’envoi de votre avis, ou après 60 jours sans réponse. Les e-mails sont envoyés par Resend.',
      back: '← Retour à Z Find',
      rgpd: 'Les données saisies (nom, e-mail ou téléphone, message et, le cas échéant, réponses de qualification) sont utilisées pour traiter cette demande et la transmettre au partenaire qui représente cette opportunité. Pour toute question relative à vos données :'
    }),
    en: Object.freeze({
      legalLink: 'Legal notice',
      legalTitle: 'Legal notice',
      legalLead: 'Information about the publisher and the host of zfind.online.',
      publisherTitle: 'Publisher',
      publisherBody: id => `zfind.online is published by ${id.publisherLegalName}, the trade name of José Ricardo Coelho de Vilela, sole trader (entrepreneur individuel, EI) registered under ${id.registrationNumber}. Address: ${id.registeredAddress}.`,
      contactLine: 'Contact',
      directorTitle: 'Publication director',
      directorBody: () => 'The sole trader operating ZOS.',
      hostTitle: 'Hosting',
      hostBody: h => `Website: ${h.legalName}, ${h.address}. Data and accounts: Supabase, European Union data centre (Ireland).`,
      ipTitle: 'Intellectual property',
      ipBody: 'The Z Find brand, logo, design and texts belong to ZOS. Listings, photos and property descriptions are published under the responsibility of the agencies that post them. Any reproduction without permission is prohibited.',
      reportTitle: 'Report content',
      reportBody: 'Does a listing or content seem unlawful or misleading? Write to us with the page address and the reason; every report receives an answer.',
      cookieLink: 'Cookies & trackers',
      cookieTitle: 'Cookies & trackers',
      cookieIntro: 'Z Find limits device storage to technical functions currently necessary for the experience you request.',
      currentTitle: 'Current use',
      currentBody: 'The public Z Find code contains no advertising tracker. Traffic is measured with Vercel Web Analytics, without cookies or any identifier stored on your device: only aggregated statistics (page views, country, device type) are produced, which does not require consent. Your language preference may be stored locally and, when you sign in, the authentication service retains technical information needed for your session.',
      consentTitle: 'Consent',
      consentBody: 'No consent banner is displayed while no non-essential tracker is used. If Z Find later adds trackers requiring consent, they must be blocked until you make a choice and this notice will be updated.',
      thirdPartyTitle: 'Infrastructure',
      thirdPartyBody: 'The site is hosted on Vercel and uses Supabase for data and authentication services. These providers may use technical mechanisms necessary for security, service delivery or a session you expressly request.',
      contactTitle: 'Questions about your data or trackers',
      alertsTitle: 'E-mails, alerts and reviews',
      alertsBody: 'E-mail alerts (new listings, value of your property) start only after you confirm the link received by e-mail; every message has a one-click unsubscribe link. Unconfirmed requests and unsubscriptions are erased within 30 days, alerts at the latest 3 years after confirmation. If you agree to be invited to rate an agency, a single invitation is sent a week after your enquiry; your address is erased as soon as you submit your review, or after 60 days without an answer. E-mails are sent through Resend.',
      back: '← Back to Z Find',
      rgpd: 'The data you enter (name, email or phone, message and, where applicable, qualification answers) is used to process this enquiry and route it to the partner representing this opportunity. For questions about your data:'
    }),
    pt: Object.freeze({
      legalLink: 'Informação legal',
      legalTitle: 'Informação legal (Mentions légales)',
      legalLead: 'Informação sobre o editor e o alojamento do site zfind.online.',
      publisherTitle: 'Editor',
      publisherBody: id => `O site zfind.online é editado por ${id.publisherLegalName}, nome comercial de José Ricardo Coelho de Vilela, empresário em nome individual (entrepreneur individuel, EI), registado sob o número ${id.registrationNumber}. Morada: ${id.registeredAddress}.`,
      contactLine: 'Contacto',
      directorTitle: 'Diretor da publicação',
      directorBody: () => 'O empresário em nome individual que explora a ZOS.',
      hostTitle: 'Alojamento',
      hostBody: h => `Site: ${h.legalName}, ${h.address}. Dados e contas: Supabase, centro de dados da União Europeia (Irlanda).`,
      ipTitle: 'Propriedade intelectual',
      ipBody: 'A marca Z Find, o logótipo, o grafismo e os textos do site pertencem à ZOS. Os anúncios, fotografias e descrições dos imóveis são publicados sob a responsabilidade das agências que os divulgam. É proibida a reprodução sem autorização.',
      reportTitle: 'Denunciar um conteúdo',
      reportBody: 'Um anúncio ou conteúdo parece-lhe ilícito ou enganoso? Escreva-nos indicando o endereço da página e o motivo; cada denúncia recebe resposta.',
      cookieLink: 'Cookies e rastreadores',
      cookieTitle: 'Cookies e rastreadores',
      cookieIntro: 'O Z Find limita o armazenamento no seu dispositivo às funções técnicas atualmente necessárias à experiência solicitada.',
      currentTitle: 'Utilização atual',
      currentBody: 'O código público do Z Find não contém atualmente ferramentas publicitárias nem ferramentas de medição de audiência que exijam consentimento. A preferência de idioma pode ser guardada localmente e, quando inicia sessão, o serviço de autenticação conserva a informação técnica necessária à sessão.',
      consentTitle: 'Consentimento',
      consentBody: 'Não é apresentado um banner de consentimento enquanto não forem utilizados rastreadores não essenciais. Se o Z Find vier a adicionar rastreadores sujeitos a consentimento, estes deverão ficar bloqueados até à sua escolha e esta informação será atualizada.',
      thirdPartyTitle: 'Infraestrutura',
      thirdPartyBody: 'O site é alojado na Vercel e utiliza Supabase para serviços de dados e autenticação. Estes fornecedores podem utilizar mecanismos técnicos necessários à segurança, entrega do serviço ou a uma sessão expressamente solicitada.',
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
      #${LEGAL_VIEW_ID} .zfind-legal-shell { max-width: 780px; padding-top: 54px; padding-bottom: 76px; }
      #${LEGAL_VIEW_ID} .zfind-legal-shell h1 { margin: 8px 0 12px; font-size: clamp(2rem,5vw,3rem); line-height: 1.04; }
      #${LEGAL_VIEW_ID} .zfind-legal-lead { color: var(--gray-500); line-height: 1.7; margin-bottom: 34px; }
      #${LEGAL_VIEW_ID} .zfind-legal-section { padding: 22px 0; border-top: 1px solid var(--gray-200); }
      #${LEGAL_VIEW_ID} .zfind-legal-section h2 { font-size: 1.35rem; margin: 0 0 8px; }
      #${LEGAL_VIEW_ID} .zfind-legal-section p { color: var(--gray-600); line-height: 1.75; margin: 0; }
      #${LEGAL_VIEW_ID} .zfind-legal-contact { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
      #${COOKIE_LINK_ID}, #${LEGAL_LINK_ID} { cursor: pointer; }
      .zfind-rgpd-first-layer { display: block; margin-top: 12px; color: var(--gray-500); font-size: .72rem; line-height: 1.55; text-align: left; }
      .zfind-rgpd-first-layer a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
      @media (max-width:640px) {
        #${COOKIE_VIEW_ID} .zfind-legal-shell, #${LEGAL_VIEW_ID} .zfind-legal-shell { padding-top: 36px; padding-bottom: 54px; }
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
        ${c.alertsTitle ? `<section class="zfind-legal-section" id="zfind-legal-alerts"><h2>${escapeHtml(c.alertsTitle)}</h2><p>${escapeHtml(c.alertsBody)}</p></section>` : ''}
        <section class="zfind-legal-section"><h2>${escapeHtml(c.contactTitle)}</h2><p><a class="zfind-legal-contact" href="mailto:${DATA_CONTACT}">${DATA_CONTACT}</a></p></section>
      </div>`;
  }

  function renderLegalView() {
    const view = document.getElementById(LEGAL_VIEW_ID);
    if (!view) return;
    const c = copy();
    const id = LEGAL_IDENTITY;
    const tel = id.publisherPhone.replace(/\s+/g, '');
    view.innerHTML = `
      <div class="wrap zfind-legal-shell">
        <button class="btn btn-ghost" type="button" onclick="navigate('home')">${escapeHtml(c.back)}</button>
        <span class="eyebrow" style="display:block;margin-top:28px;">Z Find</span>
        <h1>${escapeHtml(c.legalTitle)}</h1>
        <p class="zfind-legal-lead">${escapeHtml(c.legalLead)}</p>
        <section class="zfind-legal-section"><h2>${escapeHtml(c.publisherTitle)}</h2><p>${escapeHtml(c.publisherBody(id))}</p>
          <p style="margin-top:10px">${escapeHtml(c.contactLine)} : <a class="zfind-legal-contact" href="mailto:${DATA_CONTACT}">${DATA_CONTACT}</a> · <a class="zfind-legal-contact" href="tel:${tel}">${escapeHtml(id.publisherPhone)}</a></p></section>
        <section class="zfind-legal-section"><h2>${escapeHtml(c.directorTitle)}</h2><p>${escapeHtml(c.directorBody(id))}</p></section>
        <section class="zfind-legal-section"><h2>${escapeHtml(c.hostTitle)}</h2><p>${escapeHtml(c.hostBody(HOST))}</p></section>
        <section class="zfind-legal-section"><h2>${escapeHtml(c.ipTitle)}</h2><p>${escapeHtml(c.ipBody)}</p></section>
        <section class="zfind-legal-section"><h2>${escapeHtml(c.reportTitle)}</h2><p>${escapeHtml(c.reportBody)} <a class="zfind-legal-contact" href="mailto:${DATA_CONTACT}">${DATA_CONTACT}</a></p></section>
      </div>`;
  }

  function installLegalView() {
    if (document.getElementById(LEGAL_VIEW_ID) || !publisherIdentityComplete) return;
    const main = document.querySelector('main');
    if (!main) return;
    const section = document.createElement('section');
    section.className = 'view';
    section.id = LEGAL_VIEW_ID;
    main.appendChild(section);
    renderLegalView();
  }

  function installLegalFooterLink() {
    if (document.getElementById(LEGAL_LINK_ID) || !publisherIdentityComplete) return;
    const bottom = document.querySelector('footer.site .bottom');
    if (!bottom) return;
    const link = document.createElement('a');
    link.id = LEGAL_LINK_ID;
    link.href = '#';
    link.addEventListener('click', event => {
      event.preventDefault();
      navigate('mentions-legales');
    });
    const cookie = document.getElementById(COOKIE_LINK_ID);
    bottom.insertBefore(link, cookie || null);
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
    const legalLink = document.getElementById(LEGAL_LINK_ID);
    if (legalLink) {
      legalLink.textContent = copy().legalLink;
      legalLink.setAttribute('href', '#/' + (COPY[locale()] ? locale() : 'fr') + '/mentions-legales');
    }
    if (document.getElementById(LEGAL_VIEW_ID)) renderLegalView();
    const link = document.getElementById(COOKIE_LINK_ID);
    if (link) {
      link.textContent = copy().cookieLink;
      // A real address too (new tab, no-JS): the click handler still routes in place.
      link.setAttribute('href', '#/' + (COPY[locale()] ? locale() : 'fr') + '/cookies');
    }
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
    installLegalView();
    installCookieFooterLink();
    installLegalFooterLink();
    observeEnquiry();
    syncCopy();
  }

  window.addEventListener('hashchange', syncCopy);
  document.addEventListener('DOMContentLoaded', mount);

  window.ZFindWebsiteLegalReadiness = Object.freeze({
    publisherIdentityComplete,
    missingPublisherFields,
    mentionsLegalesReady: publisherIdentityComplete,
    privacyPolicyArticle13Ready: false,
    cookiePolicyReady: true,
    nonEssentialTrackingFoundInApplicationSource: false,
    consentBannerRequiredByCurrentApplicationSource: false,
    dataContact: DATA_CONTACT,
    host: HOST
  });
})();
