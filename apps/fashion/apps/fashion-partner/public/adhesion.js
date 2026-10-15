/* ============================================================
   Z FASHION — store adhesion page
   ============================================================
   Runs after zfashion-auth.js (data-surface="onboarding") has signed the
   person in. Reads the public offer and the Partner terms from the API
   (GET /onboarding/offer), shows the form, and submits it to
   POST /partner-applications. The API validates everything again
   (fashion-domain/src/partner-application.js) and maps its refusals to
   { field, code } pairs that this page translates.

   Every node is built with textContent; nothing returned by the API is
   ever parsed as HTML.
   ============================================================ */

(function () {
  'use strict';

  var STRINGS = {
    fr: {
      partners: 'Partners', language: 'Langue', eyebrow: 'Adhésion des boutiques', title: 'Vendez sur Z Fashion',
      lead: 'Présentez votre boutique, vos marques et vos collections dans un espace à votre image, avec un panier commun à toutes les boutiques. Votre demande est examinée par l’équipe Z Fashion avant toute mise en ligne.',
      offerTitle: 'L’offre Partner', loading: 'Chargement…',
      subscriptionTitle: 'Abonnement mensuel, selon le nombre de catégories vendues', perMonth: 'HT / mois',
      tierOne: '1 catégorie', tierN: '{n} catégories', tierNPlus: '{n} catégories ou plus',
      firstMonthFree: 'Premier mois d’abonnement offert. Prix hors TVA.',
      commissionTitle: 'Commission par commande (ticket), selon son montant', ticketCol: 'Montant de la commande', rate: 'Commission',
      ticketUpTo: 'Jusqu’à {max}', ticketBetween: 'De {min} à {max}', ticketAbove: 'Au-delà de {min}',
      ticketNote: 'Le taux s’applique à l’ensemble des articles de votre boutique dans une même commande, sans condition de volume.',
      yourFee: 'Votre abonnement : {fee} HT / mois ({n}).',
      formTitle: 'Votre boutique', formIntro: 'Les champs marqués * sont obligatoires. L’adhésion est ouverte aux boutiques établies en France.',
      companyLegend: 'Entreprise', tradeName: 'Nom de la boutique *', legalName: 'Raison sociale *', siret: 'SIRET *', vat: 'N° de TVA intracommunautaire',
      addressLegend: 'Adresse de la boutique', address: 'Adresse *', postalCode: 'Code postal *', city: 'Ville *',
      contactLegend: 'Contact', email: 'E-mail du compte', emailHint: 'C’est l’adresse de votre compte : nous l’utiliserons pour vous contacter.', phone: 'Téléphone *', website: 'Site web',
      catalogLegend: 'Ce que vous vendez', categories: 'Catégories *', ageSegments: 'Clientèle *',
      cat_clothing: 'Vêtements', cat_footwear: 'Chaussures', cat_sportswear: 'Sport', cat_accessories_leather_goods: 'Accessoires et maroquinerie', cat_cosmetics: 'Cosmétiques et parfums',
      age_adults: 'Adultes', age_youth: 'Adolescents', age_children: 'Enfants', age_baby: 'Bébés',
      minorSafe: 'Je m’engage à respecter les règles Z Fashion de protection des données des mineurs pour les produits enfants, adolescents et bébés.',
      termsBefore: 'J’ai lu et j’accepte les ', termsLink: 'Conditions générales Partner', termsAfter: ' (version {v}).',
      submit: 'Envoyer ma demande d’adhésion', submitting: 'Envoi…',
      closedTitle: 'Les adhésions ne sont pas encore ouvertes',
      closedBody: 'Vous pourrez déposer votre demande dès la publication des Conditions générales Partner. Votre compte est créé : revenez sur cette page avec la même adresse e-mail.',
      alreadyTitle: 'Votre boutique a déjà un dossier Z Fashion',
      alreadyBody: 'Ce compte est déjà relié à une boutique. Suivez l’avancement de votre demande depuis votre espace Partner.',
      openDashboard: 'Ouvrir mon espace Partner',
      st_applied: 'Votre demande est en cours d’examen', st_under_review: 'Votre demande est en cours d’examen',
      st_approved: 'Demande approuvée', st_active: 'Votre boutique est en ligne', st_suspended: 'Boutique suspendue', st_rejected: 'Demande non retenue',
      stb_applied: 'Nous examinons la demande de {store}, reçue le {date}. Revenez sur cette page pour suivre son avancement.',
      stb_under_review: 'Nous examinons la demande de {store}, reçue le {date}. Revenez sur cette page pour suivre son avancement.',
      stb_approved: 'La demande de {store} est approuvée. L’équipe Z Fashion prépare l’activation de votre boutique.',
      stb_active: '{store} est visible dans le catalogue Z Fashion.',
      stb_suspended: '{store} n’est plus visible dans le catalogue Z Fashion pour le moment.',
      stb_rejected: 'La demande de {store} n’a pas été retenue.',
      teamNote: 'Message de l’équipe Z Fashion :', reapply: 'Vous pouvez déposer une nouvelle demande ci-dessous.',
      successTitle: 'Demande d’adhésion envoyée',
      successBody: 'Merci. Votre demande est en cours d’examen par l’équipe Z Fashion. Nous vous écrirons à {email}. Aucun produit n’est publié avant validation.',
      unavailable: 'Le service est momentanément indisponible. Réessayez plus tard.',
      fixErrors: 'Vérifiez les champs signalés ci-dessous.',
      err_required: 'Ce champ est obligatoire.', err_too_long: 'Texte trop long.', err_invalid_siret: 'Numéro SIRET invalide (14 chiffres).',
      err_invalid_vat: 'Numéro de TVA invalide (format FR + 11 caractères).', err_vat_does_not_match_siret: 'Ce numéro de TVA ne correspond pas au SIREN du SIRET.',
      err_invalid_postal_code: 'Code postal invalide (5 chiffres).', err_invalid_phone: 'Numéro de téléphone français invalide.',
      err_invalid_url: 'Adresse web invalide (commence par https://).', err_unknown_value: 'Valeur non reconnue.',
      err_required_for_minors: 'Obligatoire si vous vendez pour enfants, adolescents ou bébés.',
      err_terms_version_changed: 'Les conditions ont été mises à jour : rechargez la page pour lire la nouvelle version.',
      err_market_not_open: 'L’adhésion est ouverte aux boutiques établies en France.',
      err_fashion_application_pending: 'Une demande est déjà en cours d’examen pour ce compte.',
      err_fashion_application_duplicate: 'Une boutique avec ce SIRET a déjà déposé une demande. Contactez-nous si vous pensez qu’il s’agit d’une erreur.',
      err_partner_terms_not_published: 'Les adhésions ne sont pas encore ouvertes.',
    },
    en: {
      partners: 'Partners', language: 'Language', eyebrow: 'Store adhesion', title: 'Sell on Z Fashion',
      lead: 'Present your store, your brands and your collections in a space that looks like you, with one bag shared by every store. Your application is reviewed by the Z Fashion team before anything goes live.',
      offerTitle: 'The Partner offer', loading: 'Loading…',
      subscriptionTitle: 'Monthly subscription, by number of categories sold', perMonth: 'excl. VAT / month',
      tierOne: '1 category', tierN: '{n} categories', tierNPlus: '{n} or more categories',
      firstMonthFree: 'First month of subscription free. Prices exclude VAT.',
      commissionTitle: 'Commission per order (ticket), by amount', ticketCol: 'Order amount', rate: 'Commission',
      ticketUpTo: 'Up to {max}', ticketBetween: '{min} to {max}', ticketAbove: 'Above {min}',
      ticketNote: 'The rate applies to all of your store’s items in one order, with no volume condition.',
      yourFee: 'Your subscription: {fee} excl. VAT / month ({n}).',
      formTitle: 'Your store', formIntro: 'Fields marked * are required. Adhesion is open to stores established in France.',
      companyLegend: 'Company', tradeName: 'Store name *', legalName: 'Registered company name *', siret: 'SIRET *', vat: 'EU VAT number',
      addressLegend: 'Store address', address: 'Address *', postalCode: 'Postcode *', city: 'City *',
      contactLegend: 'Contact', email: 'Account e-mail', emailHint: 'This is your account address; we will use it to contact you.', phone: 'Phone *', website: 'Website',
      catalogLegend: 'What you sell', categories: 'Categories *', ageSegments: 'Customers *',
      cat_clothing: 'Clothing', cat_footwear: 'Footwear', cat_sportswear: 'Sportswear', cat_accessories_leather_goods: 'Accessories and leather goods', cat_cosmetics: 'Cosmetics and fragrance',
      age_adults: 'Adults', age_youth: 'Teens', age_children: 'Children', age_baby: 'Babies',
      minorSafe: 'I commit to Z Fashion’s rules on protecting minors’ data for children’s, teen and baby products.',
      termsBefore: 'I have read and accept the ', termsLink: 'Partner Terms and Conditions', termsAfter: ' (version {v}).',
      submit: 'Submit my application', submitting: 'Sending…',
      closedTitle: 'Applications are not open yet',
      closedBody: 'You will be able to apply as soon as the Partner Terms and Conditions are published. Your account is created: come back to this page with the same e-mail.',
      alreadyTitle: 'Your store already has a Z Fashion file',
      alreadyBody: 'This account is already linked to a store. Follow your application from your Partner space.',
      openDashboard: 'Open my Partner space',
      st_applied: 'Your application is being reviewed', st_under_review: 'Your application is being reviewed',
      st_approved: 'Application approved', st_active: 'Your store is live', st_suspended: 'Store suspended', st_rejected: 'Application not accepted',
      stb_applied: 'We are reviewing the application for {store}, received on {date}. Come back to this page to follow it.',
      stb_under_review: 'We are reviewing the application for {store}, received on {date}. Come back to this page to follow it.',
      stb_approved: 'The application for {store} is approved. The Z Fashion team is preparing your store’s activation.',
      stb_active: '{store} is visible in the Z Fashion catalogue.',
      stb_suspended: '{store} is not visible in the Z Fashion catalogue for now.',
      stb_rejected: 'The application for {store} was not accepted.',
      teamNote: 'Message from the Z Fashion team:', reapply: 'You can submit a new application below.',
      successTitle: 'Application sent',
      successBody: 'Thank you. Your application is being reviewed by the Z Fashion team. We will write to {email}. No product is published before approval.',
      unavailable: 'The service is temporarily unavailable. Try again later.',
      fixErrors: 'Please check the fields marked below.',
      err_required: 'This field is required.', err_too_long: 'Text is too long.', err_invalid_siret: 'Invalid SIRET number (14 digits).',
      err_invalid_vat: 'Invalid VAT number (FR + 11 characters).', err_vat_does_not_match_siret: 'This VAT number does not match the SIRET’s SIREN.',
      err_invalid_postal_code: 'Invalid postcode (5 digits).', err_invalid_phone: 'Invalid French phone number.',
      err_invalid_url: 'Invalid web address (starts with https://).', err_unknown_value: 'Unrecognised value.',
      err_required_for_minors: 'Required if you sell for children, teens or babies.',
      err_terms_version_changed: 'The terms have been updated: reload the page to read the new version.',
      err_market_not_open: 'Adhesion is open to stores established in France.',
      err_fashion_application_pending: 'An application is already being reviewed for this account.',
      err_fashion_application_duplicate: 'A store with this SIRET has already applied. Contact us if you think this is a mistake.',
      err_partner_terms_not_published: 'Applications are not open yet.',
    },
  };

  var locale = 'fr';
  try { var saved = localStorage.getItem('zfashion_adhesion_locale'); if (STRINGS[saved]) locale = saved; } catch (e) {}

  function t(key, vars) {
    var s = (STRINGS[locale] && STRINGS[locale][key]) || STRINGS.fr[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function money(minor) {
    return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
  }

  var $ = function (id) { return document.getElementById(id); };
  var state = { offer: null, me: null, email: '', view: 'loading' };

  // ---------- language

  function applyLanguage() {
    document.documentElement.lang = locale === 'fr' ? 'fr-FR' : 'en-GB';
    document.documentElement.dataset.locale = locale;
    $('adLocale').value = locale;
    document.querySelectorAll('[data-i18n]').forEach(function (node) { node.textContent = t(node.dataset.i18n); });
    renderOffer();
    renderTerms();
    renderState();
  }
  $('adLocale').addEventListener('change', function (e) {
    locale = STRINGS[e.target.value] ? e.target.value : 'fr';
    try { localStorage.setItem('zfashion_adhesion_locale', locale); } catch (err) {}
    applyLanguage();
  });

  // ---------- offer

  function tierLabel(tiers, i) {
    var n = tiers[i].minCategories;
    if (i === tiers.length - 1 && n > 1) return t('tierNPlus', { n: n });
    return n === 1 ? t('tierOne') : t('tierN', { n: n });
  }

  function feeFor(categoryCount) {
    var tiers = state.offer.offer.subscriptionTiers, fee = null;
    tiers.forEach(function (x) { if (categoryCount >= x.minCategories) fee = x.monthlyFeeMinorUnits; });
    return fee;
  }

  function table(headers, rows) {
    var tbl = el('table', { class: 'ad-table' });
    if (headers) {
      var head = el('thead'); var hr = el('tr');
      headers.forEach(function (h) { hr.appendChild(el('th', { scope: 'col' }, h)); });
      head.appendChild(hr); tbl.appendChild(head);
    }
    var body = el('tbody');
    rows.forEach(function (r) { var tr = el('tr'); tr.append(el('th', { scope: 'row' }, r[0]), el('td', null, r[1])); body.appendChild(tr); });
    tbl.appendChild(body);
    return tbl;
  }

  function renderOffer() {
    var body = $('adOfferBody');
    if (!state.offer) return;
    var o = state.offer.offer;
    var subs = o.subscriptionTiers;
    var nodes = [el('h3', { class: 'ad-label' }, t('subscriptionTitle'))];
    nodes.push(table(null, subs.map(function (x, i) { return [tierLabel(subs, i), money(x.monthlyFeeMinorUnits) + ' ' + t('perMonth')]; })));
    if (o.firstMonthFree) nodes.push(el('p', { class: 'ad-muted' }, t('firstMonthFree')));

    nodes.push(el('h3', { class: 'ad-label' }, t('commissionTitle')));
    var prev = null;
    var rows = o.ticketCommissionTiers.map(function (x) {
      var label = x.maxTicketMinorUnits === null
        ? t('ticketAbove', { min: money(prev) })
        : prev === null ? t('ticketUpTo', { max: money(x.maxTicketMinorUnits) })
          : t('ticketBetween', { min: money(prev + 1), max: money(x.maxTicketMinorUnits) });
      prev = x.maxTicketMinorUnits;
      return [label, x.ratePercent + ' %'];
    });
    nodes.push(table([t('ticketCol'), t('rate')], rows));
    nodes.push(el('p', { class: 'ad-muted' }, t('ticketNote')));
    body.replaceChildren.apply(body, nodes);
    renderYourFee();
  }

  function renderYourFee() {
    var slot = $('adYourFee');
    if (!slot || !state.offer) return;
    var n = checked('categories').length;
    if (n === 0) { slot.textContent = ''; return; }
    var label = n === 1 ? t('tierOne') : t('tierN', { n: n });
    slot.textContent = t('yourFee', { fee: money(feeFor(n)), n: label });
  }

  function renderTerms() {
    var holder = $('acceptTermsText');
    if (!state.offer || !state.offer.terms) { holder.replaceChildren(); return; }
    var link = el('a', { href: state.offer.terms.url, target: '_blank', rel: 'noopener' }, t('termsLink'));
    holder.replaceChildren(document.createTextNode(t('termsBefore')), link, document.createTextNode(t('termsAfter', { v: state.offer.terms.version })));
  }

  // ---------- views

  function renderApplicationStatus(box, form) {
    var a = state.application;
    var status = a.onboardingStatus;
    var canReapply = status === 'rejected' && state.offer && state.offer.applicationsOpen;
    box.hidden = false;
    box.className = 'ad-card' + (status === 'active' || status === 'approved' ? ' ad-success' : '');
    var date = a.createdAt ? new Date(a.createdAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB') : '';
    var nodes = [el('h2', null, t('st_' + status)), el('p', null, t('stb_' + status, { store: a.tradeName || '', date: date }))];
    if (a.decisionNote && (status === 'rejected' || status === 'suspended')) {
      var note = el('p', { class: 'ad-notice' });
      note.append(el('strong', null, t('teamNote') + ' '), document.createTextNode(a.decisionNote));
      nodes.push(note);
    }
    if (canReapply) nodes.push(el('p', null, t('reapply')));
    else if (status !== 'rejected') nodes.push(el('a', { class: 'ad-button', href: './dashboard.html' }, t('openDashboard')));
    box.replaceChildren.apply(box, nodes);
    form.hidden = !canReapply;
  }

  function renderState() {
    var box = $('adState');
    var form = $('adForm');
    if (state.view === 'status' && state.application) return renderApplicationStatus(box, form);
    if (state.view === 'form') { box.hidden = true; form.hidden = false; return; }
    form.hidden = true;
    if (state.view === 'loading') { box.hidden = true; return; }
    box.hidden = false;
    box.className = 'ad-card' + (state.view === 'success' ? ' ad-success' : '');
    var title, text, withDashboard = false;
    if (state.view === 'closed') { title = t('closedTitle'); text = t('closedBody'); }
    else if (state.view === 'already') { title = t('alreadyTitle'); text = t('alreadyBody'); withDashboard = true; }
    else if (state.view === 'success') { title = t('successTitle'); text = t('successBody', { email: state.email }); withDashboard = true; }
    else { title = t('unavailable'); text = ''; }
    var nodes = [el('h2', null, title)];
    if (text) nodes.push(el('p', null, text));
    if (withDashboard) nodes.push(el('a', { class: 'ad-button', href: './dashboard.html' }, t('openDashboard')));
    box.replaceChildren.apply(box, nodes);
  }

  // ---------- form

  var FIELDS = ['tradeName', 'legalName', 'registrationNumber', 'vatNumber', 'addressLine1', 'postalCode', 'city', 'contactPhone', 'website'];

  function checked(name) {
    return Array.prototype.slice.call(document.querySelectorAll('input[name="' + name + '"]:checked')).map(function (i) { return i.value; });
  }
  function servesMinors() {
    return checked('ageSegments').some(function (s) { return s !== 'adults'; });
  }
  document.querySelectorAll('input[name="categories"]').forEach(function (i) {
    i.addEventListener('change', renderYourFee);
  });
  document.querySelectorAll('input[name="ageSegments"]').forEach(function (i) {
    i.addEventListener('change', function () { $('minorSafeRow').hidden = !servesMinors(); });
  });

  function clearErrors() {
    $('adErrors').hidden = true; $('adErrors').textContent = '';
    document.querySelectorAll('.ad-field-error').forEach(function (p) { p.textContent = ''; });
    document.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
  }
  function showErrors(fieldErrors) {
    $('adErrors').textContent = t('fixErrors'); $('adErrors').hidden = false;
    var first = null;
    fieldErrors.forEach(function (fe) {
      var slot = document.querySelector('.ad-field-error[data-for="' + fe.field + '"]');
      var message = t('err_' + fe.code);
      if (slot) slot.textContent = message;
      else { $('adErrors').textContent = message; }
      var input = $(fe.field);
      if (input && input.tagName === 'INPUT') { input.setAttribute('aria-invalid', 'true'); first = first || input; }
    });
    ($('adErrors')).scrollIntoView({ block: 'center' });
    if (first) first.focus({ preventScroll: true });
  }

  $('adForm').addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    var payload = { countryIso: 'FR', locales: ['fr'] };
    FIELDS.forEach(function (f) { payload[f] = $(f).value; });
    payload.categories = checked('categories');
    payload.ageSegments = checked('ageSegments');
    payload.minorSafeDataAcknowledged = servesMinors() && $('minorSafeDataAcknowledged').checked;
    payload.acceptTerms = $('acceptTerms').checked;
    payload.termsVersion = state.offer && state.offer.terms ? state.offer.terms.version : null;

    var button = $('adSubmit');
    button.disabled = true; button.textContent = t('submitting');
    window.ZFashionAuth.apiFetch('/partner-applications', { method: 'POST', body: payload })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body }; }); })
      .then(function (r) {
        button.disabled = false; button.textContent = t('submit');
        if (r.status === 201) { state.view = 'success'; renderState(); window.scrollTo(0, 0); return; }
        if (r.status === 422 && Array.isArray(r.body.fieldErrors)) return showErrors(r.body.fieldErrors);
        if (r.status === 409 || r.status === 503) return showErrors([{ field: 'form', code: r.body.error }]);
        showErrors([{ field: 'form', code: 'unavailable_generic' }]);
        $('adErrors').textContent = t('unavailable');
      })
      .catch(function () {
        button.disabled = false; button.textContent = t('submit');
        $('adErrors').textContent = t('unavailable'); $('adErrors').hidden = false;
      });
  });

  // ---------- start (after sign-in)

  function start() {
    var auth = window.ZFashionAuth;
    state.me = auth.me();
    state.email = auth.email() || '';
    $('contactEmail').value = state.email;
    auth.apiFetch('/onboarding/offer')
      .then(function (res) { if (!res.ok) throw new Error('offer ' + res.status); return res.json(); })
      .then(function (offer) {
        state.offer = offer;
        var ids = state.me && Array.isArray(state.me.partnerIds) ? state.me.partnerIds : [];
        if (ids.length === 0) {
          state.view = offer.applicationsOpen ? 'form' : 'closed';
          return applyLanguage();
        }
        // Linked to one or more stores: show the most relevant application
        // (a pending/live one before a rejected one, newest first).
        return Promise.all(ids.map(function (id) {
          return auth.apiFetch('/partners/' + encodeURIComponent(id) + '/application')
            .then(function (res) { return res.ok ? res.json() : null; })
            .catch(function () { return null; });
        })).then(function (apps) {
          apps = apps.filter(Boolean).sort(function (x, y) {
            var rx = x.onboardingStatus === 'rejected' ? 1 : 0, ry = y.onboardingStatus === 'rejected' ? 1 : 0;
            if (rx !== ry) return rx - ry;
            return String(y.createdAt).localeCompare(String(x.createdAt));
          });
          state.application = apps[0] || null;
          state.view = state.application ? 'status' : 'already';
          applyLanguage();
        });
      })
      .catch(function () { state.view = 'error'; applyLanguage(); $('adOfferBody').replaceChildren(el('p', { class: 'ad-muted' }, t('unavailable'))); });
  }

  applyLanguage();
  if (window.ZFashionAuth && window.ZFashionAuth.me()) start();
  else document.addEventListener('zfashion:auth', start);
})();
