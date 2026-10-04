/* ============================================================
   Z FIND PARTNER — APP.JS  (interface en français)
   ============================================================
   Login + strict role check, self sign-up (signup.js), portfolio,
   listing workspace and leads. RLS does the isolation; publication
   always stays with the Admin.
   ============================================================ */

async function boot() {
  const hash = window.location.hash || '';
  const { data: sessionData } = await window.ZFindServices.auth.getSession();
  const session = sessionData && sessionData.session;
  // The confirmation link lands with tokens (or an error) in the URL:
  // the SDK has read them by now, so never leave them in the address bar.
  if (/access_token=|refresh_token=|error_description=/.test(hash)) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  if (session) {
    await tryEnterDashboard();
    return;
  }
  if (/error_code=otp_expired|error_description=/.test(hash)) {
    const errorEl = document.getElementById('login-error');
    if (errorEl) errorEl.textContent = 'Ce lien de confirmation a expiré ou a déjà servi. Connectez-vous avec votre e-mail et votre mot de passe ; si votre adresse n’est pas encore confirmée, écrivez-nous à hello@zfind.online.';
    return;
  }
  if (/inscription|signup/.test(hash)) showSignupView();
}

/* Property types (property_subtypes codes) in French. */
const SUBTYPE_FR = {
  apartment: 'Appartement', villa: 'Maison / villa', office: 'Bureaux', retail: 'Local commercial',
  industrial_logistics: 'Local d’activité / entrepôt', hospitality: 'Hôtellerie', land: 'Terrain'
};
function subtypeLabel(code) { return SUBTYPE_FR[code] || code || ''; }
function propertyTitle(p, fallback) {
  return [subtypeLabel(p.subtype), p.typology].filter(Boolean).join(' · ') || fallback;
}

async function handlePartnerLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = 'Saisissez votre e-mail et votre mot de passe.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Connexion…';

  const result = await window.ZFindServices.auth.signIn(email, password);
  if (result.error) {
    errorEl.textContent = loginErrorMessage(result.error);
    btn.disabled = false;
    btn.textContent = 'Se connecter';
    return;
  }

  await tryEnterDashboard();
  btn.disabled = false;
  btn.textContent = 'Se connecter';
}


/** Same discipline as the Admin's role !== 'admin' check — a
    successful Supabase login is NOT the same as being allowed into
    this app. Anyone who isn't specifically partner_user is signed
    back out immediately, with a clear reason, never silently let
    through to a dashboard that isn't theirs to use. */
async function tryEnterDashboard() {
  const errorEl = document.getElementById('login-error');
  let profileResult = await window.ZFindServices.auth.getCurrentProfile();
  let profile = profileResult.data;

  // First sign-in after a self sign-up: the application waiting in the
  // account's metadata becomes a partner account (server-side RPC).
  if (!(profile && profile.role === 'admin') && (!profile || profile.role !== 'partner_user' || !profile.partner_id)) {
    const done = await window.ZFindServices.partnerSignup.complete();
    if (done.error) {
      await window.ZFindServices.auth.signOut();
      showLoginView();
      if (errorEl) errorEl.textContent = signupCompletionError(done.error);
      return;
    }
    if (done.data && (done.data.status === 'created' || done.data.status === 'existing')) {
      profileResult = await window.ZFindServices.auth.getCurrentProfile();
      profile = profileResult.data;
    }
  }

  if (profileResult.error || !profile || profile.role !== 'partner_user' || !profile.partner_id) {
    await window.ZFindServices.auth.signOut();
    showLoginView();
    if (errorEl) errorEl.textContent = 'Ce compte n’est pas un compte partenaire Z Find. Pour inscrire votre agence, utilisez « Inscrire mon agence ».';
    return;
  }

  const partnerId = profile.partner_id;
  const partnerResult = await window.ZFindServices.partnerDashboard.getOwnPartnerSummary(partnerId);

  document.getElementById('view-login').style.display = 'none';
  document.getElementById('view-signup').style.display = 'none';
  document.getElementById('view-dashboard').style.display = '';
  document.getElementById('dash-partner-name').textContent = partnerResult.data ? partnerResult.data.name : '';
  if (window.location.hash === '#inscription') history.replaceState(null, '', window.location.pathname + window.location.search);
  renderSignupBanner();
  loadPortfolio();
}

function signupCompletionError(error) {
  const msg = String((error && error.message) || '');
  if (msg.includes('already_registered')) return 'Cet établissement est déjà inscrit sur Z Find. Si vous pensez qu’il s’agit d’une erreur, écrivez-nous à hello@zfind.online.';
  if (msg.includes('invalid_siret')) return 'Le SIRET de votre inscription est invalide. Écrivez-nous à hello@zfind.online pour la compléter.';
  return 'Votre inscription n’a pas pu être finalisée. Réessayez dans un instant ou écrivez-nous à hello@zfind.online.';
}

/* Offer wording comes from the public price list (zfind-web services/pro-offer.js). */
function signupPrices() { return (window.ZFindServices.proOffer && window.ZFindServices.proOffer.PRICES) || {}; }

function offerSummary(plan, wave) {
  const p = signupPrices();
  if (plan === 'founder') {
    const price = wave === 2 ? p.founderWave2Month : p.founderMonth;
    return `<strong>Offre Fondateur — ${wave === 2 ? '2e' : '1re'} vague.</strong> ${p.founderFreeMonths} mois gratuits (offre Pro complète), puis ${price} € HT par mois garantis ${p.founderPriceMonths} mois, sans engagement. Moins de ${p.founderMinLeads} contacts reçus pendant la période gratuite : ${p.founderExtensionMonths} mois offerts de plus.`;
  }
  if (plan === 'founder_developer') {
    return `<strong>Promoteur fondateur.</strong> Vos programmes neufs sont gratuits pendant ${p.founderFreeMonths} mois, sans engagement.`;
  }
  return `<strong>Programme neuf :</strong> ${p.developmentMonth} € HT par programme et par mois, sans engagement.`;
}

let partnerCountry = null;
async function renderSignupBanner() {
  const el = document.getElementById('signup-banner');
  if (!el) return;
  const res = await window.ZFindServices.partnerSignup.ownSignup();
  const s = res.data;
  if (s && s.country) partnerCountry = s.country;
  if (!s || s.status === 'verified') { el.style.display = 'none'; return; }
  if (s.status === 'rejected') {
    el.innerHTML = '<strong>Votre inscription n’a pas pu être validée.</strong> Écrivez-nous à hello@zfind.online pour en savoir plus.';
  } else {
    el.innerHTML = `<strong>Bienvenue sur Z Find.</strong> Nous vérifions votre ${s.role === 'promoter' ? 'inscription' : 'carte professionnelle'}. Vous pouvez déjà préparer vos annonces : elles seront mises en ligne après cette vérification.<br>${offerSummary(s.plan, s.founder_wave)}`;
  }
  el.style.display = '';
}

/* ---------------- Sign-up: SIREN → fiche pré-remplie → compte ---------------- */
const signupState = { results: [], picked: null, manual: false };

function showLoginView() {
  document.getElementById('view-signup').style.display = 'none';
  document.getElementById('view-login').style.display = '';
}

function showSignupView() {
  document.getElementById('view-login').style.display = 'none';
  document.getElementById('view-signup').style.display = '';
  document.getElementById('su-switch').style.display = '';
  signupGoto(1);
  onSignupCountryChange();
  renderSignupOfferPanel();
}

function signupRole() {
  const el = document.querySelector('input[name="su-role"]:checked');
  return el ? el.value : 'agency';
}
function signupCountry() { return document.getElementById('su-country').value; }
function suVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function suSet(id, v) { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; }
function suShow(id, on) { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; }
function suError(step, msg) { const el = document.getElementById('su-error-' + step); if (el) el.textContent = msg || ''; }

function signupGoto(step) {
  ['1', '2', '3', 'done'].forEach(k => suShow('su-pane-' + k, String(step) === k));
  document.querySelectorAll('.su-steps li').forEach(li => {
    const n = Number(li.dataset.step);
    li.classList.toggle('active', n === step);
    li.classList.toggle('done', typeof step === 'number' && n < step);
  });
  if (step === 3) renderSignupOfferBox();
}

function renderSignupOfferPanel() {
  const p = signupPrices();
  const lead = document.getElementById('su-offer-lead');
  const marks = document.getElementById('su-offer-marks');
  if (signupRole() === 'promoter') {
    lead.textContent = `${p.founderDevelopers} promoteurs fondateurs : vos programmes neufs gratuits pendant ${p.founderFreeMonths} mois, sans carte bancaire ni engagement.`;
    marks.innerHTML = `
      <div class="mark-row"><span class="k">Ensuite</span><span class="v">${p.developmentMonth} € HT / programme / mois</span></div>
      <div class="mark-row"><span class="k">Inclus</span><span class="v">Page programme, lots, une semaine « À la une »</span></div>`;
    return;
  }
  lead.textContent = `${p.founderFreeMonths} mois gratuits dès votre inscription : l’offre Pro complète, sans carte bancaire ni engagement.`;
  marks.innerHTML = `
    <div class="mark-row"><span class="k">${p.founderSeatsPerCountry} premières agences par pays</span><span class="v">${p.founderMonth} € HT / mois, ${p.founderPriceMonths} mois</span></div>
    <div class="mark-row"><span class="k">Agences suivantes</span><span class="v">${p.founderWave2Month} € HT / mois, ${p.founderPriceMonths} mois</span></div>
    <div class="mark-row"><span class="k">Moins de ${p.founderMinLeads} contacts en ${p.founderFreeMonths} mois</span><span class="v">${p.founderExtensionMonths} mois offerts de plus</span></div>`;
}

function renderSignupOfferBox() {
  const p = signupPrices();
  const box = document.getElementById('su-offer-box');
  const promoter = signupRole() === 'promoter';
  box.innerHTML = promoter
    ? `<strong>Votre offre.</strong> Si vous êtes parmi les ${p.founderDevelopers} premiers promoteurs, vos programmes neufs sont gratuits pendant ${p.founderFreeMonths} mois ; sinon ${p.developmentMonth} € HT par programme et par mois. Sans engagement.`
    : `<strong>Votre offre.</strong> ${p.founderFreeMonths} mois gratuits (offre Pro complète). Ensuite ${p.founderMonth} € HT par mois si vous êtes parmi les ${p.founderSeatsPerCountry} premières agences de votre pays, sinon ${p.founderWave2Month} € HT, garantis ${p.founderPriceMonths} mois. Sans carte bancaire ni engagement.`;
  document.getElementById('su-certify-text').textContent = promoter
    ? 'Je certifie représenter cette société et être habilité à l’inscrire.'
    : 'Je certifie être titulaire de la carte professionnelle indiquée (ou habilité par son titulaire) et représenter cette agence.';
  document.getElementById('su-terms-text').textContent = promoter
    ? 'J’accepte les règles de Z Find : annonces de professionnels identifiés, réponse aux demandes sous 24 heures.'
    : 'J’accepte les conditions de l’offre Fondateur : publier tout mon portefeuille, répondre aux demandes sous 24 heures et autoriser Z Find à citer mon agence comme référence.';
}

function onSignupRoleChange() {
  renderSignupOfferPanel();
  onSignupCountryChange();
}

function onSignupCountryChange() {
  const c = signupCountry();
  const promoter = signupRole() === 'promoter';
  const label = document.getElementById('su-number-label');
  const hint = document.getElementById('su-number-hint');
  suShow('su-number-field', c !== 'LU');
  suShow('su-lookup-btn', c !== 'LU');
  if (c === 'FR') {
    label.textContent = 'SIRET ou SIREN';
    hint.textContent = 'Le SIRET (14 chiffres) identifie votre agence ; le SIREN (9 chiffres) affiche tous vos établissements.';
  } else if (c === 'BE') {
    label.textContent = 'Numéro d’entreprise (BCE)';
    hint.textContent = '10 chiffres, par exemple 0123.456.789.';
  }
  document.getElementById('su-manual').textContent = c === 'LU' ? 'Saisir mes informations' : 'Saisir mes informations à la main';
  suShow('su-siret-field', c === 'FR');
  suShow('su-company-field', c !== 'FR');
  document.getElementById('su-company-label').textContent = c === 'BE' ? 'Numéro d’entreprise (BCE) *' : 'Numéro RCS (B…) *';
  const card = document.getElementById('su-card-label');
  if (promoter) {
    card.textContent = c === 'FR' ? 'N° RCS ou référence de la garantie financière d’achèvement *' : 'Numéro d’immatriculation ou d’autorisation *';
    suShow('su-card-authority-field', false);
  } else if (c === 'FR') {
    card.textContent = 'Carte professionnelle (CPI) n° *';
    document.getElementById('su-card-authority-label').textContent = 'Délivrée par (CCI)';
    suShow('su-card-authority-field', true);
  } else if (c === 'BE') {
    card.textContent = 'Numéro d’agréation IPI *';
    suShow('su-card-authority-field', false);
  } else {
    card.textContent = 'Autorisation d’établissement n° *';
    suShow('su-card-authority-field', false);
  }
  document.getElementById('su-results').innerHTML = '';
  suError(1, '');
}

async function signupLookup() {
  const c = signupCountry();
  const raw = suVal('su-number');
  suError(1, '');
  const check = window.ZFindServices.partnerSignup.validateNumber(c, raw);
  if (!check.ok) {
    suError(1, c === 'FR'
      ? (check.reason === 'length' ? 'Saisissez un SIRET (14 chiffres) ou un SIREN (9 chiffres).' : 'Ce numéro n’est pas valide : vérifiez les chiffres.')
      : (check.reason === 'length' ? 'Saisissez votre numéro d’entreprise à 10 chiffres.' : 'Ce numéro d’entreprise n’est pas valide : vérifiez les chiffres.'));
    return;
  }
  const btn = document.getElementById('su-lookup-btn');
  btn.disabled = true; btn.textContent = 'Recherche…';
  const res = await window.ZFindServices.partnerSignup.lookup(c, check.digits);
  btn.disabled = false; btn.textContent = 'Rechercher';
  const host = document.getElementById('su-results');
  if (res.error) { suError(1, 'La recherche n’a pas abouti. Réessayez ou saisissez vos informations à la main.'); return; }
  signupState.results = res.data;
  if (!res.data.length) {
    host.innerHTML = '<p class="su-hint">Nous ne trouvons pas ce numéro parmi les agences immobilières de notre base. Vérifiez-le, ou saisissez vos informations à la main.</p>';
    return;
  }
  host.innerHTML = '<p class="su-hint" style="margin-bottom:10px;">Choisissez votre établissement :</p>' + res.data.map((r, i) => `
    <button type="button" class="su-result" ${r.already_registered ? 'disabled' : ''} onclick="signupPick(${i})">
      <span class="n">${escapeHtmlPartner(r.trade_name || r.name)}${r.is_head_office ? '<span class="tag">Siège</span>' : ''}${r.already_registered ? '<span class="tag">Déjà inscrit</span>' : ''}</span>
      <span class="a">${escapeHtmlPartner([streetOnly(r), [r.postcode, r.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</span>
    </button>`).join('');
}

/* The registry address often ends with "postcode city": keep the street only. */
function streetOnly(r) {
  const address = (r && r.address) || '';
  return r && r.postcode && address.includes(r.postcode) ? address.slice(0, address.indexOf(r.postcode)).trim() : address;
}

function signupFillFrom(r) {
  suSet('su-legal', r ? r.name : '');
  suSet('su-trade', r ? (r.trade_name || '') : '');
  suSet('su-siret', r ? (r.establishment_id || '') : '');
  suSet('su-company', r ? (r.company_id || '') : '');
  suSet('su-address', r ? streetOnly(r) : '');
  suSet('su-postcode', r ? r.postcode : '');
  suSet('su-city', r ? r.city : '');
}

function signupPick(i) {
  const r = signupState.results[i];
  if (!r || r.already_registered) return;
  signupState.picked = r;
  signupState.manual = false;
  signupFillFrom(r);
  suError(2, '');
  signupGoto(2);
}

function signupManual() {
  signupState.picked = null;
  signupState.manual = true;
  const c = signupCountry();
  const typed = window.ZFindServices.partnerSignup._internals.digits(suVal('su-number'));
  signupFillFrom(null);
  if (c === 'FR' && typed.length === 14) suSet('su-siret', typed);
  if (c === 'BE' && typed.length >= 9) suSet('su-company', typed);
  suError(2, '');
  signupGoto(2);
}

function signupStep2Next() {
  const c = signupCountry();
  const v = window.ZFindServices.partnerSignup.validateNumber;
  if (!suVal('su-legal')) return suError(2, 'Indiquez la raison sociale.');
  if (c === 'FR') {
    const d = window.ZFindServices.partnerSignup._internals.digits(suVal('su-siret'));
    const ok = v('FR', d);
    if (d.length !== 14 || !ok.ok) return suError(2, 'Indiquez un SIRET valide (14 chiffres).');
  } else if (c === 'BE') {
    if (!v('BE', suVal('su-company')).ok) return suError(2, 'Indiquez un numéro d’entreprise BCE valide.');
  } else if (!suVal('su-company')) {
    return suError(2, 'Indiquez votre numéro RCS.');
  }
  if (!suVal('su-card')) return suError(2, document.getElementById('su-card-label').textContent.replace(' *', '') + ' : champ obligatoire.');
  suError(2, '');
  signupGoto(3);
}

function signupApplication() {
  const c = signupCountry();
  const digits = window.ZFindServices.partnerSignup._internals.digits;
  const picked = signupState.picked;
  return {
    version: '2026-10-04',
    role: signupRole(),
    country: c,
    legal_name: suVal('su-legal'),
    trade_name: suVal('su-trade'),
    establishment_id: c === 'FR' ? digits(suVal('su-siret')) : '',
    company_id: c === 'FR' ? digits(suVal('su-siret')).slice(0, 9) : (c === 'BE' ? window.ZFindServices.partnerSignup.validateNumber('BE', suVal('su-company')).digits : suVal('su-company')),
    agencia_id: picked ? picked.agencia_id : '',
    address: suVal('su-address'),
    postcode: suVal('su-postcode'),
    city: suVal('su-city'),
    phone: suVal('su-phone'),
    website: suVal('su-website'),
    card_number: suVal('su-card'),
    card_authority: suVal('su-card-authority'),
    terms_accepted: true
  };
}

async function signupSubmit() {
  const email = suVal('su-email');
  const pw = document.getElementById('su-password').value;
  const pw2 = document.getElementById('su-password2').value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return suError(3, 'Indiquez une adresse e-mail valide.');
  if (pw.length < 10) return suError(3, 'Le mot de passe doit contenir au moins 10 caractères.');
  if (pw !== pw2) return suError(3, 'Les deux mots de passe ne correspondent pas.');
  if (!document.getElementById('su-certify').checked || !document.getElementById('su-terms').checked) {
    return suError(3, 'Cochez les deux cases pour continuer.');
  }
  suError(3, '');
  const btn = document.getElementById('su-submit');
  btn.disabled = true; btn.textContent = 'Création…';
  const redirect = window.location.origin + window.location.pathname;
  const res = await window.ZFindServices.partnerSignup.register(email, pw, signupApplication(), redirect);
  btn.disabled = false; btn.textContent = 'Créer mon compte';
  if (res.error) {
    const m = String(res.error.message || '').toLowerCase();
    if (m.includes('already') || m.includes('registered')) return suError(3, 'Un compte existe déjà avec cet e-mail. Connectez-vous, ou utilisez une autre adresse.');
    if (m.includes('password')) return suError(3, 'Ce mot de passe est trop faible : choisissez-en un plus long ou moins courant.');
    return suError(3, 'La création du compte a échoué. Réessayez dans un instant.');
  }
  if (res.data.existing) return suError(3, 'Un compte existe déjà avec cet e-mail. Connectez-vous, ou utilisez une autre adresse.');
  if (res.data.session) { await tryEnterDashboard(); return; }
  document.getElementById('su-done-text').textContent =
    `Nous avons envoyé un lien de confirmation à ${email}. Cliquez dessus, puis connectez-vous ici avec votre mot de passe : votre espace sera créé automatiquement.`;
  suShow('su-switch', false);
  signupGoto('done');
}

/** Loads the partner's own properties/developments — reuses admin.js's
    listProperties/listDevelopments UNCHANGED. RLS (Migration 0006)
    does all the actual restricting; this never adds a partner_id
    filter itself, by design — if it needed to, that would mean RLS
    isn't trustworthy on its own, which the isolation test already
    disproved. */
async function loadPortfolio() {
  const listEl = document.getElementById('portfolio-list');
  const [propsResult, devsResult] = await Promise.all([
    window.ZFindServices.admin.listProperties(),
    window.ZFindServices.admin.listDevelopments(),
  ]);
  const properties = propsResult.error ? [] : propsResult.data;
  const developments = devsResult.error ? [] : devsResult.data;

  if (!properties.length && !developments.length) {
    listEl.innerHTML = '<div class="portfolio-empty">Rien pour l’instant — ajoutez votre premier bien ou programme ci-dessus.</div>';
    return;
  }

  const propRows = properties.map(p => `
    <div class="portfolio-row" onclick="openDetail('property','${p.id}')">
      <div>
        <div class="name">${escapeHtmlPartner(propertyTitle(p, 'Bien sans titre'))}</div>
        <div class="meta">${p.zones_lite ? escapeHtmlPartner(window.ZFindServices.commune.zoneLabel(p.zones_lite)) : 'Commune à définir'}${p.area_sqm ? ' · ' + p.area_sqm + ' m²' : ''}</div>
      </div>
      <span class="kind-tag">Bien</span>
    </div>`).join('');
  const devRows = developments.map(d => `
    <div class="portfolio-row" onclick="openDetail('development','${d.id}')">
      <div>
        <div class="name">${escapeHtmlPartner(d.name)}</div>
        <div class="meta">${d.zones_lite ? escapeHtmlPartner(window.ZFindServices.commune.zoneLabel(d.zones_lite)) : 'Commune à définir'}</div>
      </div>
      <span class="kind-tag">Programme neuf</span>
    </div>`).join('');

  listEl.innerHTML = propRows + devRows;
}

const LISTING_STATUS_FR = {
  draft: 'Brouillon', incomplete: 'Incomplète', pending_review: 'En vérification', ready: 'Prête à publier',
  published: 'En ligne', suspended: 'Suspendue', archived: 'Archivée'
};
const LEAD_STATUS_FR = { new: 'À répondre', contacted: 'Répondue', closed: 'Clôturée' };
function listingStatusLabel(s) { return LISTING_STATUS_FR[s] || s || ''; }
function leadStatusLabel(s) { return LEAD_STATUS_FR[s] || s || ''; }
function loginErrorMessage(error) {
  const msg = String((error && error.message) || '').toLowerCase();
  if (msg.includes('confirm')) return 'Confirmez d’abord votre adresse e-mail : cliquez sur le lien reçu, puis reconnectez-vous ici.';
  return 'E-mail ou mot de passe incorrect.';
}

function escapeHtmlPartner(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

let authoringTaxonomyCache = null;

async function getAuthoringTaxonomyCached() {
  if (authoringTaxonomyCache) {
    return {
      data: authoringTaxonomyCache,
      error: null
    };
  }

  const result =
    await window.ZFindServices.propertyTaxonomy
      .getAuthoringTaxonomy();

  if (!result.error) {
    authoringTaxonomyCache = result.data;
  }

  return result;
}

async function getResidentialDefaultSubtype() {
  const taxonomyResult =
    await getAuthoringTaxonomyCached();

  if (taxonomyResult.error) {
    return {
      data: null,
      error: taxonomyResult.error
    };
  }

  const subtype =
    window.ZFindServices.propertyTaxonomy
      .getDefaultSubtype(
        taxonomyResult.data,
        'residential'
      );

  if (!subtype) {
    return {
      data: null,
      error: new Error(
        'Aucun type de bien résidentiel disponible'
      )
    };
  }

  return {
    data: subtype,
    error: null
  };
}

/** No name field exists for a Property. This one-click Partner
    workflow preserves the existing lightweight creation UX, but
    its initial Residential subtype is now derived from canonical
    taxonomy sort order rather than hard-coded in the browser.
    Representation still starts as proposed; creating an Asset does
    not imply publication. */
async function createNewProperty() {
  const subtypeResult =
    await getResidentialDefaultSubtype();

  if (subtypeResult.error || !subtypeResult.data) {
    alert(
      'Aucun type de bien résidentiel n’est disponible pour le moment.'
    );
    return;
  }

  const result =
    await window.ZFindServices.admin
      .createPropertyForPartner({
        subtype: subtypeResult.data,
        typology: null,
        areaSqm: null,
        floor: null,
        zoneLiteId: null
      });

  if (result.error) {
    alert('Impossible de créer le bien.');
    return;
  }

  loadPortfolio();
}

function openNewDevelopmentForm() {
  document.getElementById('new-dev-form').style.display = '';
  document.getElementById('new-dev-name').focus();
}
function closeNewDevelopmentForm() {
  document.getElementById('new-dev-form').style.display = 'none';
  document.getElementById('new-dev-name').value = '';
  document.getElementById('new-dev-error').textContent = '';
}
async function saveNewDevelopment() {
  const name = document.getElementById('new-dev-name').value.trim();
  const errorEl = document.getElementById('new-dev-error');
  if (!name) { errorEl.textContent = 'Indiquez le nom du programme.'; return; }
  const result = await window.ZFindServices.admin.createDevelopmentForPartner({ name, zoneLiteId: null });
  if (result.error) { errorEl.textContent = 'Impossible de créer le programme.'; return; }
  closeNewDevelopmentForm();
  loadPortfolio();
}

/* ---------------- Detail view: full field taxonomy, shared with Admin ---------------- */
let detailKind = null;
let detailId = null;

function showStatus(type, message) {
  const host = document.getElementById('toast-host');
  const toast = document.createElement('div');
  toast.className = 'toast' + (type === 'error' ? ' error' : '');
  toast.textContent = message;
  host.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

async function openDetail(kind, id) {
  detailKind = kind; detailId = id;
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('view-detail').style.display = '';
  document.getElementById('dash-partner-name-2').textContent = document.getElementById('dash-partner-name').textContent;

  const result = kind === 'property' ? await window.ZFindServices.admin.getPropertyForEdit(id) : await window.ZFindServices.admin.getDevelopmentForEdit(id);
  if (result.error) { showStatus('error', 'Chargement impossible.'); backToPortfolio(); return; }
  const d = result.data;

  document.getElementById('detail-title').textContent = kind === 'property' ? propertyTitle(d, 'Bien') : d.name;
  document.getElementById('detail-extended-fields').innerHTML = kind === 'property'
    ? renderPropertyCoreFields(d) + window.ZFindServices.fieldForms.renderPropertyExtendedFields(d, { locale: 'fr' })
    : `<div class="page-title" style="font-size:1.1rem;">Localisation du programme</div><div class="detail-panel" style="margin-bottom:20px;">${renderCommunePicker('development', d)}</div>`
      + window.ZFindServices.fieldForms.renderDevelopmentExtendedFields(d, { locale: 'fr' });
  loadFeaturesGrid(kind, id);

  // Units only make sense for a Development — same analogous feature
  // as the Admin's own, reusing admin.js's listUnitsForDevelopment
  // and createProperty unchanged, RLS (not new code here) is what
  // correctly keeps this scoped to the partner's own development.
  const unitsSection = document.getElementById('detail-units-section');
  if (kind === 'development') {
    unitsSection.style.display = '';
    currentDevelopmentZoneLiteId = d.zone_lite_id || null;
    loadDetailUnits(id);
  } else {
    unitsSection.style.display = 'none';
  }
  ensurePartnerRemoveButton(kind, id);
  loadPartnerListingWorkspace(kind, id);
}

/* "Le bien": type, typology, surface, floor — the fields a partner may
   set through zfind_update_asset (subtype, typology, area_sqm, floor). */
function renderPropertyCoreFields(d) {
  const codes = Object.keys(SUBTYPE_FR);
  if (d.subtype && !codes.includes(d.subtype)) codes.push(d.subtype);
  return `
    <div class="page-title" style="font-size:1.1rem;">Le bien</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      ${renderCommunePicker('property', d)}
      <div class="form-grid">
        <div class="form-field"><label>Type de bien</label><select id="pp-subtype">${codes.map(c => `<option value="${escapeHtmlPartner(c)}" ${d.subtype === c ? 'selected' : ''}>${escapeHtmlPartner(subtypeLabel(c))}</option>`).join('')}</select></div>
        <div class="form-field"><label>Typologie</label><input type="text" id="pp-typology" maxlength="40" placeholder="T3, 4 pièces, studio…" value="${escapeHtmlPartner(d.typology || '')}"></div>
        <div class="form-field"><label>Surface (m²)</label><input type="number" min="0" step="0.01" id="pp-area" value="${d.area_sqm ?? ''}"></div>
        <div class="form-field"><label>Étage</label><input type="number" min="-5" max="200" id="pp-floor" value="${d.floor ?? ''}"></div>
      </div>
      <button class="btn btn-primary" style="margin-top:14px;" onclick="savePropertyCore('${d.id}')">Enregistrer</button>
    </div>`;
}

/* Commune (FR / BE / LU): search by postcode or name, pick, saved at once. */
let communeTimer = null;
function renderCommunePicker(kind, d) {
  const current = d.zones_lite ? window.ZFindServices.commune.zoneLabel(d.zones_lite) : '';
  const country = (d.zones_lite && ['FR', 'BE', 'LU'].includes(d.zones_lite.country_iso)) ? d.zones_lite.country_iso : (partnerCountry || 'FR');
  return `
    <div class="commune-picker">
      <div class="commune-current">Commune : <strong id="cm-current">${current ? escapeHtmlPartner(current) : 'à définir'}</strong>${current ? '' : ' <span class="commune-required">— nécessaire pour publier l’annonce</span>'}</div>
      <div class="commune-search">
        <select id="cm-country" aria-label="Pays" onchange="communeSearch('${kind}','${d.id}')">
          ${['FR', 'BE', 'LU'].map(c => `<option value="${c}" ${c === country ? 'selected' : ''}>${{ FR: 'France', BE: 'Belgique', LU: 'Luxembourg' }[c]}</option>`).join('')}
        </select>
        <input type="search" id="cm-q" placeholder="Code postal ou nom de la commune" autocomplete="off" oninput="communeSearch('${kind}','${d.id}')">
      </div>
      <div id="cm-results" class="commune-results"></div>
    </div>`;
}

function communeSearch(kind, id) {
  clearTimeout(communeTimer);
  communeTimer = setTimeout(async () => {
    const host = document.getElementById('cm-results');
    const country = document.getElementById('cm-country').value;
    const query = document.getElementById('cm-q').value;
    if (window.ZFindServices.commune.fold(query).length < 2) { host.innerHTML = ''; return; }
    const res = await window.ZFindServices.commune.search(country, query);
    if (res.error) { host.innerHTML = '<p class="commune-empty">La recherche n’a pas abouti. Réessayez dans un instant.</p>'; return; }
    if (!res.data.length) { host.innerHTML = '<p class="commune-empty">Aucune commune trouvée.</p>'; return; }
    host.innerHTML = res.data.map(c => `
      <button type="button" class="commune-option" onclick="communePick('${kind}','${id}','${country}','${escapeHtmlPartner(c.code)}')">
        <span class="n">${escapeHtmlPartner(c.zone_label)}</span><span class="p">${escapeHtmlPartner(c.parent || '')}</span>
      </button>`).join('');
  }, 250);
}

async function communePick(kind, id, country, code) {
  const res = await window.ZFindServices.commune.setAsset(kind, id, country, code);
  if (res.error) { showStatus('error', 'Impossible d’enregistrer la commune.'); return; }
  const label = res.data.name + (res.data.postcodes && res.data.postcodes.length === 1 ? ' (' + res.data.postcodes[0] + ')' : '');
  document.getElementById('cm-current').textContent = label;
  const req = document.querySelector('.commune-required'); if (req) req.remove();
  document.getElementById('cm-results').innerHTML = '';
  document.getElementById('cm-q').value = '';
  if (kind === 'development') currentDevelopmentZoneLiteId = res.data.zone_lite_id;
  showStatus('success', 'Commune enregistrée : ' + label + '.');
}

async function savePropertyCore(id) {
  const num = v => (v === '' || v == null ? null : Number(v));
  const fields = {
    subtype: document.getElementById('pp-subtype').value,
    typology: document.getElementById('pp-typology').value.trim() || null,
    areaSqm: num(document.getElementById('pp-area').value),
    floor: num(document.getElementById('pp-floor').value)
  };
  if ((fields.areaSqm != null && !(fields.areaSqm >= 0)) || (fields.floor != null && !Number.isInteger(fields.floor))) {
    showStatus('error', 'Vérifiez la surface et l’étage.');
    return;
  }
  const result = await window.ZFindServices.admin.updateProperty(id, fields);
  if (result.error) { showStatus('error', 'Impossible d’enregistrer.'); return; }
  document.getElementById('detail-title').textContent = propertyTitle({ subtype: fields.subtype, typology: fields.typology }, 'Bien');
  showStatus('success', 'Bien enregistré.');
}

let currentDevelopmentZoneLiteId = null;

async function loadDetailUnits(developmentId) {
  const listEl = document.getElementById('detail-units-list');
  const result = await window.ZFindServices.admin.listUnitsForDevelopment(developmentId);
  if (result.error) { listEl.innerHTML = 'Impossible de charger les lots.'; return; }
  if (!result.data.length) { listEl.innerHTML = '<p style="color:var(--gray-500);">Aucun lot pour l’instant.</p>'; return; }
  listEl.innerHTML = result.data.map(u => `
    <div class="portfolio-row" onclick="openDetail('property','${u.id}')">
      <div>
        <div class="name">${escapeHtmlPartner(propertyTitle(u, 'Lot'))}</div>
        <div class="meta">${u.area_sqm ? u.area_sqm + ' m²' : ''}${u.floor != null ? ' · Étage ' + u.floor : ''}</div>
      </div>
      <span class="kind-tag">${u.zones_lite ? escapeHtmlPartner(u.zones_lite.name) : ''}</span>
    </div>`).join('');
}

/** New unit inherits the development's own zone by default — same
    real convenience already built for Admin, still fully editable
    afterward like any other field. */
async function addUnitToCurrentDevelopment() {
  const subtypeResult =
    await getResidentialDefaultSubtype();

  if (subtypeResult.error || !subtypeResult.data) {
    showStatus(
      'error',
      'Aucun type de bien résidentiel disponible pour un nouveau lot.'
    );
    return;
  }

  const result =
    await window.ZFindServices.admin.createProperty({
      subtype: subtypeResult.data,
      typology: null,
      areaSqm: null,
      floor: null,
      zoneLiteId: currentDevelopmentZoneLiteId,
      developmentId: detailId
    });

  if (result.error) {
    showStatus(
      'error',
      'Impossible de créer le lot.'
    );
    return;
  }

  showStatus('success', 'Lot ajouté.');
  loadDetailUnits(detailId);
}

function backToPortfolio() {
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('view-dashboard').style.display = '';
  loadPortfolio();
}

function ensurePartnerRemoveButton(kind, id) {
  const host = document.getElementById('view-detail');
  if (!host) return;

  const previous = document.getElementById(
    'partner-remove-asset-zone'
  );
  if (previous) previous.remove();

  const zone = document.createElement('div');
  zone.id = 'partner-remove-asset-zone';
  zone.className = 'detail-panel';
  zone.style.marginTop = '24px';
  zone.style.borderColor = 'rgba(180,35,24,.25)';

  const label = kind === 'development'
    ? 'Supprimer le programme'
    : 'Supprimer le bien';

  zone.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;">
      <div>
        <div style="font-weight:600;">Retirer de votre portefeuille</div>
        <div style="font-size:.86rem;color:var(--gray-500);margin-top:4px;">
          Les demandes, vérifications et historiques protégés sont conservés automatiquement lorsque la loi l’exige.
        </div>
      </div>
      <button
        type="button"
        class="btn"
        style="border-color:#b42318;color:#b42318;background:#fff;"
        onclick="removePartnerAsset('${kind}','${id}')"
      >${label}</button>
    </div>
  `;

  host.appendChild(zone);
}

async function removePartnerAsset(kind, id) {
  const label = kind === 'development'
    ? 'ce programme'
    : 'ce bien';

  const ok = window.confirm(
    `Supprimer ${label} ?\n\n` +
    'Il disparaîtra de votre portefeuille et du site. ' +
    'Si des données commerciales ou d’audit protégées existent, Z Find ' +
    'les conserve au lieu de les effacer.'
  );

  if (!ok) return;

  const result =
    await window.ZFindServices.admin.removeAssetForPartner(
      kind,
      id
    );

  if (result.error) {
    showStatus(
      'error',
      result.error.message || `Impossible de supprimer ${label}.`
    );
    return;
  }

  const physicallyDeleted =
    result.data &&
    result.data.mode === 'hard_deleted';

  showStatus(
    'success',
    physicallyDeleted
      ? `${kind === 'development' ? 'Programme supprimé' : 'Bien supprimé'}.`
      : `${kind === 'development' ? 'Programme retiré' : 'Bien retiré'}. L’historique protégé a été conservé.`
  );

  backToPortfolio();
}

/** Reuses the exact same shared reader Admin uses — the 30+ field ids
    are read the exact same way in both apps, never duplicated or
    allowed to drift. */
async function saveExtendedAttrs(kind, id) {
  const result = kind === 'property'
    ? await window.ZFindServices.admin.updateProperty(id, window.ZFindServices.fieldForms.readPropertyExtendedFieldsFromDOM())
    : await window.ZFindServices.admin.updateDevelopment(id, window.ZFindServices.fieldForms.readDevelopmentExtendedFieldsFromDOM());
  showStatus(result.error ? 'error' : 'success', result.error ? 'Impossible d’enregistrer les champs.' : 'Champs enregistrés.');
}

async function loadFeaturesGrid(kind, id) {
  const grid = document.getElementById('detail-features-grid');
  if (!grid) return;
  const [allFeatures, linked] = await Promise.all([
    window.ZFindServices.admin.listFeatures(),
    kind === 'property' ? window.ZFindServices.admin.getPropertyFeatureIds(id) : window.ZFindServices.admin.getDevelopmentFeatureIds(id),
  ]);
  if (allFeatures.error) { grid.innerHTML = 'Impossible de charger les équipements.'; return; }
  const linkedIds = new Set((linked.data || []).map(r => r.feature_id));
  grid.innerHTML = window.ZFindServices.fieldForms.renderFeaturesChecklist(allFeatures.data, linkedIds, { locale: 'fr' });
}

async function saveFeatures(kind, id) {
  const checked = Array.from(document.querySelectorAll('.feature-checkbox:checked')).map(el => el.value);
  const result = kind === 'property'
    ? await window.ZFindServices.admin.setPropertyFeatures(id, checked)
    : await window.ZFindServices.admin.setDevelopmentFeatures(id, checked);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Impossible d’enregistrer les équipements.' : `${checked.length} équipement(s) enregistré(s).`);
}


/* ---------------- Partner Listing / Content / Media workspace ---------------- */


function renderPartnerListingCommercialEditor(listing) {
  const transactionType =
    listing.transaction_type === 'rent'
      ? 'rent'
      : 'sale';

  const rentalPeriod =
    ['monthly', 'seasonal', 'yearly']
      .includes(listing.rental_period)
      ? listing.rental_period
      : 'monthly';

  const currency =
    escapeHtmlPartner(
      String(listing.currency_iso || 'EUR')
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase()
    );

  const price =
    Number.isFinite(Number(listing.price_current))
      ? Number(listing.price_current)
      : 0;

  return `
    <div
      id="partner-listing-commercial-editor"
      style="
        border:1px solid #e5e5e5;
        border-radius:10px;
        padding:16px;
        margin-bottom:18px;
        background:#fff;
      "
    >
      <h3 style="margin:0 0 5px;">Conditions commerciales</h3>

      <p style="margin:0 0 14px;color:#777;font-size:.82rem;">
        Vous fixez les conditions commerciales de votre annonce.
        La publication est validée par Z Find.
      </p>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
          gap:12px;
        "
      >
        <label>
          <span>Transaction</span>
          <select
            id="partner-listing-transaction-type"
            onchange="syncPartnerRentalPeriodControl()"
          >
            <option value="sale" ${
              transactionType === 'sale' ? 'selected' : ''
            }>Vente</option>
            <option value="rent" ${
              transactionType === 'rent' ? 'selected' : ''
            }>Location</option>
          </select>
        </label>

        <label
          id="partner-listing-rental-period-wrap"
          style="${
            transactionType === 'rent'
              ? ''
              : 'display:none;'
          }"
        >
          <span>Type de location</span>
          <select id="partner-listing-rental-period">
            <option value="monthly" ${
              rentalPeriod === 'monthly' ? 'selected' : ''
            }>Au mois</option>
            <option value="seasonal" ${
              rentalPeriod === 'seasonal' ? 'selected' : ''
            }>Saisonnière</option>
            <option value="yearly" ${
              rentalPeriod === 'yearly' ? 'selected' : ''
            }>À l’année</option>
          </select>
        </label>

        <label>
          <span>Prix</span>
          <input
            id="partner-listing-price-current"
            type="number"
            min="0"
            step="0.01"
            value="${price}"
          >
        </label>

        <label>
          <span>Devise</span>
          <input
            id="partner-listing-currency-iso"
            type="text"
            maxlength="3"
            value="${currency}"
            placeholder="EUR"
          >
        </label>

        <label style="display:flex;align-items:center;gap:8px;">
          <input
            id="partner-listing-price-is-from"
            type="checkbox"
            ${listing.price_is_from ? 'checked' : ''}
          >
          <span>Prix « à partir de »</span>
        </label>
      </div>

      <button
        class="btn btn-primary"
        style="margin-top:14px;"
        onclick="
          savePartnerListingCommercial(
            '${listing.id}'
          )
        "
      >
        Enregistrer les conditions
      </button>
    </div>
  `;
}


function syncPartnerRentalPeriodControl() {
  const type = document.getElementById(
    'partner-listing-transaction-type'
  );

  const wrap = document.getElementById(
    'partner-listing-rental-period-wrap'
  );

  const period = document.getElementById(
    'partner-listing-rental-period'
  );

  if (!type || !wrap) return;

  const isRent = type.value === 'rent';

  wrap.style.display = isRent ? '' : 'none';

  if (
    isRent &&
    period &&
    !['monthly', 'seasonal', 'yearly']
      .includes(period.value)
  ) {
    period.value = 'monthly';
  }
}


async function savePartnerListingCommercial(listingId) {
  const transactionType =
    document.getElementById(
      'partner-listing-transaction-type'
    ).value;

  const rentalPeriod =
    transactionType === 'rent'
      ? document.getElementById(
          'partner-listing-rental-period'
        ).value
      : null;

  const result =
    await window.ZFindServices.admin
      .updateListingCommercial(
        listingId,
        {
          transactionType,
          rentalPeriod,
          priceCurrent:
            document.getElementById(
              'partner-listing-price-current'
            ).value,
          currencyIso:
            document.getElementById(
              'partner-listing-currency-iso'
            ).value,
          priceIsFrom:
            document.getElementById(
              'partner-listing-price-is-from'
            ).checked
        }
      );

  showStatus(
    result.error ? 'error' : 'success',
    result.error
      ? (
          result.error.message ||
          'Impossible d’enregistrer les conditions.'
        )
      : 'Conditions enregistrées.'
  );

  if (!result.error) {
    syncPartnerRentalPeriodControl();
  }
}


async function loadPartnerListingWorkspace(kind, assetId) {
  const host = document.getElementById('view-detail');
  if (!host) return;

  const old = document.getElementById(
    'partner-listing-workspace'
  );
  if (old) old.remove();

  const zone = document.createElement('div');
  zone.id = 'partner-listing-workspace';
  zone.className = 'detail-panel';
  zone.style.marginTop = '24px';

  zone.innerHTML = `
    <div class="page-title" style="font-size:1.05rem;">
      Annonce : textes et photos
    </div>
    <div id="partner-listing-workspace-body">
      Chargement…
    </div>
  `;

  const removeZone = document.getElementById(
    'partner-remove-asset-zone'
  );

  if (removeZone && removeZone.parentNode === host) {
    host.insertBefore(zone, removeZone);
  } else {
    host.appendChild(zone);
  }

  const body = document.getElementById(
    'partner-listing-workspace-body'
  );

  const listingResult =
    await window.ZFindServices.admin
      .getPartnerListingForAsset(kind, assetId);

  if (listingResult.error) {
    body.textContent =
      listingResult.error.message ||
      'Impossible de charger l’annonce.';
    return;
  }

  const listing = listingResult.data;

  if (!listing) {
    body.innerHTML = `
      <p style="color:var(--gray-500);margin:0 0 14px;">
        Ce bien n’a pas encore d’annonce.
        Créez un brouillon pour ajouter textes et photos.
      </p>
      <button
        type="button"
        class="btn btn-primary"
        onclick="createPartnerDraftListing('${kind}','${assetId}')"
      >Créer le brouillon d’annonce</button>
    `;
    return;
  }

  const [
    languagesResult,
    contentResult
  ] = await Promise.all([
    window.ZFindServices.admin
      .listPartnerEnabledLanguages(),
    window.ZFindServices.admin
      .listPartnerListingContent(listing.id)
  ]);

  if (languagesResult.error || contentResult.error) {
    body.textContent = 'Impossible de charger les textes de l’annonce.';
    return;
  }

  const languages = languagesResult.data || [];
  const rows = contentResult.data || [];

  const byLocale = new Map(
    rows.map(row => [row.locale, row])
  );

  const localePanels = languages.map(lang => {
    const row = byLocale.get(lang.code) || {};
    const label =
      lang.native_name ||
      lang.display_name ||
      lang.code.toUpperCase();

    return `
      <div
        style="border:1px solid var(--gray-200);border-radius:10px;padding:14px;margin-bottom:12px;"
      >
        <div style="font-weight:600;margin-bottom:10px;">
          ${escapeHtmlPartner(label)}
          <span style="font-weight:400;color:var(--gray-500);">
            · ${escapeHtmlPartner(lang.code.toUpperCase())}
          </span>
        </div>

        <div class="form-field" style="margin-bottom:10px;">
          <label>Titre</label>
          <input
            type="text"
            id="partner-content-title-${lang.code}"
            value="${escapeHtmlPartner(row.title || '')}"
          >
        </div>

        <div class="form-field">
          <label>Description</label>
          <textarea
            id="partner-content-description-${lang.code}"
            rows="6"
          >${escapeHtmlPartner(row.description || '')}</textarea>
        </div>

        <div style="margin-top:10px;">
          <button
            type="button"
            class="btn"
            onclick="savePartnerListingLocale(
              '${listing.id}',
              '${lang.code}'
            )"
          >Enregistrer ${escapeHtmlPartner(lang.code.toUpperCase())}</button>
        </div>
      </div>
    `;
  }).join('');

  body.innerHTML = `
      ${renderPartnerListingCommercialEditor(listing)}
    <div
      style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px;"
    >
      <div>
        <strong>Statut de l’annonce :</strong>
        ${escapeHtmlPartner(listingStatusLabel(listing.status))}
      </div>
      <div style="font-size:.82rem;color:var(--gray-500);">
        La publication est validée par Z Find (vérification de conformité).
      </div>
    </div>

    <div class="page-title" style="font-size:.95rem;">
      Textes
    </div>

    ${
      localePanels ||
      '<p style="color:var(--gray-500);">Aucune langue activée.</p>'
    }

    <div
      class="page-title"
      style="font-size:.95rem;margin-top:24px;"
    >
      Photos
    </div>

    <div
      style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;"
    >
      <input
        id="partner-media-file"
        type="file"
        accept="image/*"
      >
      <button
        type="button"
        class="btn btn-primary"
        onclick="uploadPartnerWorkspaceMedia(
          '${kind}',
          '${assetId}',
          '${listing.id}'
        )"
      >Ajouter la photo</button>
    </div>

    <div
      id="partner-media-grid"
      data-asset-kind="${kind}"
      data-asset-id="${assetId}"
      data-listing-id="${listing.id}"
    >
      Chargement des photos…
    </div>
  `;

  await loadPartnerWorkspaceMedia(
    kind,
    assetId,
    listing.id
  );
}

async function createPartnerDraftListing(kind, assetId) {
  const result =
    await window.ZFindServices.admin
      .ensurePartnerDraftListing(kind, assetId);

  if (result.error) {
    showStatus(
      'error',
      result.error.message ||
      'Impossible de créer le brouillon.'
    );
    return;
  }

  showStatus('success', 'Brouillon créé.');
  await loadPartnerListingWorkspace(kind, assetId);
}

async function savePartnerListingLocale(listingId, locale) {
  const titleEl = document.getElementById(
    `partner-content-title-${locale}`
  );
  const descriptionEl = document.getElementById(
    `partner-content-description-${locale}`
  );

  const result =
    await window.ZFindServices.admin
      .savePartnerListingContent(
        listingId,
        locale,
        {
          title: titleEl ? titleEl.value.trim() : '',
          description: descriptionEl
            ? descriptionEl.value.trim()
            : ''
        }
      );

  showStatus(
    result.error ? 'error' : 'success',
    result.error
      ? (
          result.error.message ||
          'Impossible d’enregistrer le texte.'
        )
      : `Texte ${locale.toUpperCase()} enregistré.`
  );
}

function _partnerWorkspaceMediaFns(kind) {
  if (kind === 'development') {
    return {
      list:
        window.ZFindServices.admin
          .listDevelopmentMedia,
      upload:
        window.ZFindServices.admin
          .uploadPartnerDevelopmentMedia,
      reorder:
        window.ZFindServices.admin
          .reorderPartnerDevelopmentMedia,
      cover:
        window.ZFindServices.admin
          .setPartnerDevelopmentMediaCover,
      remove:
        window.ZFindServices.admin
          .deletePartnerDevelopmentMedia
    };
  }

  return {
    list:
      window.ZFindServices.admin
        .listListingMedia,
    upload:
      window.ZFindServices.admin
        .uploadPartnerListingMedia,
    reorder:
      window.ZFindServices.admin
        .reorderPartnerListingMedia,
    cover:
      window.ZFindServices.admin
        .setPartnerListingMediaCover,
    remove:
      window.ZFindServices.admin
        .deletePartnerListingMedia
  };
}

async function loadPartnerWorkspaceMedia(
  kind,
  assetId,
  listingId
) {
  const grid = document.getElementById(
    'partner-media-grid'
  );
  if (!grid) return;

  const mediaKind =
    kind === 'development'
      ? 'development'
      : 'listing';

  const ownerId =
    mediaKind === 'development'
      ? assetId
      : listingId;

  const fns = _partnerWorkspaceMediaFns(kind);
  const result = await fns.list(ownerId);

  if (result.error) {
    grid.textContent =
      result.error.message ||
      'Impossible de charger les photos.';
    return;
  }

  const items = (result.data || []).slice().sort(
    (a, b) =>
      (a.position || 0) - (b.position || 0)
  );

  if (!items.length) {
    grid.innerHTML =
      '<p style="color:var(--gray-500);">Aucune photo pour l’instant.</p>';
    return;
  }

  grid.innerHTML = items.map((m, index) => {
    const asset = m.media_assets || {};
    const url = m.url || asset.url || '';

    return `
      <div
        data-partner-media-id="${m.media_asset_id}"
        style="display:flex;align-items:center;gap:12px;border:1px solid var(--gray-200);border-radius:10px;padding:10px;margin-bottom:8px;"
      >
        ${
          url
            ? `<img
                src="${escapeHtmlPartner(url)}"
                alt=""
                style="width:72px;height:54px;object-fit:cover;border-radius:7px;"
              >`
            : `<div
                style="width:72px;height:54px;background:var(--gray-100);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:.75rem;"
              >Photo</div>`
        }

        <div style="flex:1;">
          <div style="font-size:.84rem;">
            Photo ${index + 1}
            ${
              m.is_cover
                ? ' · <strong>Couverture</strong>'
                : ''
            }
          </div>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button
            type="button"
            class="btn"
            onclick="movePartnerWorkspaceMedia(
              '${kind}',
              '${assetId}',
              '${listingId}',
              '${m.media_asset_id}',
              -1
            )"
          >↑</button>

          <button
            type="button"
            class="btn"
            onclick="movePartnerWorkspaceMedia(
              '${kind}',
              '${assetId}',
              '${listingId}',
              '${m.media_asset_id}',
              1
            )"
          >↓</button>

          ${
            !m.is_cover
              ? `<button
                  type="button"
                  class="btn"
                  onclick="setPartnerWorkspaceCover(
                    '${kind}',
                    '${assetId}',
                    '${listingId}',
                    '${m.media_asset_id}'
                  )"
                >Mettre en couverture</button>`
              : ''
          }

          <button
            type="button"
            class="btn"
            style="border-color:#b42318;color:#b42318;"
            onclick="deletePartnerWorkspaceMedia(
              '${kind}',
              '${assetId}',
              '${listingId}',
              '${m.media_asset_id}'
            )"
          >Supprimer</button>
        </div>
      </div>
    `;
  }).join('');
}

async function uploadPartnerWorkspaceMedia(
  kind,
  assetId,
  listingId
) {
  const input = document.getElementById(
    'partner-media-file'
  );

  const file =
    input &&
    input.files &&
    input.files[0];

  if (!file) {
    showStatus('error', 'Choisissez d’abord une image.');
    return;
  }

  const mediaKind =
    kind === 'development'
      ? 'development'
      : 'listing';

  const ownerId =
    mediaKind === 'development'
      ? assetId
      : listingId;

  const fns = _partnerWorkspaceMediaFns(kind);

  const count = document.querySelectorAll(
    '#partner-media-grid [data-partner-media-id]'
  ).length;

  const result = await fns.upload(
    ownerId,
    file,
    {
      position: count,
      isCover: count === 0
    }
  );

  if (result.error) {
    showStatus(
      'error',
      result.error.message || 'Impossible d’envoyer la photo.'
    );
    return;
  }

  input.value = '';
  showStatus('success', 'Photo ajoutée.');

  await loadPartnerWorkspaceMedia(
    kind,
    assetId,
    listingId
  );
}

async function movePartnerWorkspaceMedia(
  kind,
  assetId,
  listingId,
  mediaAssetId,
  direction
) {
  const ids = Array.from(
    document.querySelectorAll(
      '#partner-media-grid [data-partner-media-id]'
    )
  ).map(el => el.dataset.partnerMediaId);

  const index = ids.indexOf(mediaAssetId);
  const next = index + direction;

  if (
    index < 0 ||
    next < 0 ||
    next >= ids.length
  ) return;

  [ids[index], ids[next]] = [
    ids[next],
    ids[index]
  ];

  const mediaKind =
    kind === 'development'
      ? 'development'
      : 'listing';

  const ownerId =
    mediaKind === 'development'
      ? assetId
      : listingId;

  const fns = _partnerWorkspaceMediaFns(kind);
  const result = await fns.reorder(ownerId, ids);

  if (result.error) {
    showStatus(
      'error',
      result.error.message ||
      'Impossible de réordonner les photos.'
    );
    return;
  }

  await loadPartnerWorkspaceMedia(
    kind,
    assetId,
    listingId
  );
}

async function setPartnerWorkspaceCover(
  kind,
  assetId,
  listingId,
  mediaAssetId
) {
  const ownerId =
    kind === 'development'
      ? assetId
      : listingId;

  const fns = _partnerWorkspaceMediaFns(kind);

  const result = await fns.cover(
    ownerId,
    mediaAssetId
  );

  if (result.error) {
    showStatus(
      'error',
      result.error.message ||
      'Impossible de changer la couverture.'
    );
    return;
  }

  showStatus('success', 'Couverture mise à jour.');

  await loadPartnerWorkspaceMedia(
    kind,
    assetId,
    listingId
  );
}

async function deletePartnerWorkspaceMedia(
  kind,
  assetId,
  listingId,
  mediaAssetId
) {
  const ok = window.confirm('Supprimer cette photo ?');
  if (!ok) return;

  const ownerId =
    kind === 'development'
      ? assetId
      : listingId;

  const fns = _partnerWorkspaceMediaFns(kind);

  const result = await fns.remove(
    ownerId,
    mediaAssetId
  );

  if (result.error) {
    showStatus(
      'error',
      result.error.message ||
      'Impossible de supprimer la photo.'
    );
    return;
  }

  showStatus('success', 'Photo supprimée.');

  await loadPartnerWorkspaceMedia(
    kind,
    assetId,
    listingId
  );
}

async function handlePartnerSignOut() {
  await window.ZFindServices.auth.signOut();
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('view-leads').style.display = 'none';
  document.getElementById('view-signup').style.display = 'none';
  document.getElementById('view-login').style.display = '';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}

/* ---------------- Navigation between Portfolio / Detail / Leads ---------------- */
function showPortfolioView() {
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('view-leads').style.display = 'none';
  document.getElementById('view-dashboard').style.display = '';
  loadPortfolio();
}

function showLeadsView() {
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('view-leads').style.display = '';
  document.getElementById('dash-partner-name-3').textContent = document.getElementById('dash-partner-name').textContent;
  loadLeadsView();
}

/** Reuses admin.js's listLeads UNCHANGED — same discipline as
    loadPortfolio: RLS (Migration 0006's "partner: read own leads",
    SELECT-only) does the real restricting, this never adds a
    partner_id filter itself. */
function renderLeadStats(st) {
  const el = document.getElementById('leads-stats');
  if (!el) return;
  if (!st) { el.innerHTML = ''; return; }
  const n = v => Number(v || 0);
  const parts = [`<span><strong>${n(st.total)}</strong> demande${n(st.total) > 1 ? 's' : ''} au total</span>`,
    `<span><strong>${n(st.last_30_days)}</strong> sur 30 jours</span>`];
  if (st.free_period_ends) {
    const end = new Date(st.free_period_ends).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const free = n(st.free_period);
    const min = (signupPrices().founderMinLeads) || 5;
    parts.push(`<span><strong>${free}</strong> pendant votre période gratuite (jusqu’au ${end})${free < min && new Date(st.free_period_ends) > new Date() ? ` — moins de ${min} : ${(signupPrices().founderExtensionMonths) || 3} mois offerts de plus` : ''}</span>`);
  }
  el.innerHTML = parts.join('');
}

/* Z Find follows the answer time promised to buyers and tenants: after
   24 h without « Répondue », one reminder e-mail (migration 20261004200000). */
function leadWaitingLabel(l) {
  if (l.status !== 'new') return '';
  const h = Math.floor((Date.now() - new Date(l.created_at).getTime()) / 3600000);
  return h >= 24 ? ` <span class="lead-late">en attente depuis ${h < 48 ? h + ' h' : Math.floor(h / 24) + ' jours'}</span>` : '';
}

async function markLead(id, status) {
  const res = await window.ZFindServices.partnerSignup.setLeadStatus(id, status);
  if (res.error) { showStatus('error', status === 'closed' ? 'Impossible de clôturer la demande.' : 'Impossible de marquer la demande comme répondue.'); return; }
  showStatus('success', status === 'closed' ? 'Demande clôturée.' : 'Demande marquée comme répondue. Merci !');
  loadLeadsView();
}

async function loadLeadsView() {
  const listEl = document.getElementById('leads-list');
  window.ZFindServices.partnerSignup.leadStats().then(r => renderLeadStats(r.data)).catch(() => {});
  const result = await window.ZFindServices.admin.listLeads({});
  if (result.error) { listEl.innerHTML = '<div class="portfolio-empty">Impossible de charger les demandes.</div>'; return; }
  if (!result.data.length) { listEl.innerHTML = '<div class="portfolio-empty">Aucune demande pour l’instant — elles apparaîtront ici dès qu’un acheteur ou un locataire vous contactera au sujet d’une de vos annonces.</div>'; return; }

  listEl.innerHTML = result.data.map(l => {
    const contact = [l.email, l.phone].filter(Boolean).join(' · ') || 'Pas de coordonnées';
    const date = new Date(l.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    return `
    <div class="lead-row">
      <div class="top">
        <span class="name">${escapeHtmlPartner(l.name || 'Sans nom')}</span>
        <span class="date">${date}</span>
      </div>
      <div class="contact">${escapeHtmlPartner(contact)} <span class="lead-status ${l.status}">${escapeHtmlPartner(leadStatusLabel(l.status))}</span>${leadWaitingLabel(l)}</div>
      ${l.message ? `<div class="message">${escapeHtmlPartner(l.message)}</div>` : ''}
      ${l.status !== 'closed' ? `<div class="lead-actions">${l.status === 'new' ? `<button class="btn-sm" data-lead-action="contacted" onclick="markLead('${l.id}','contacted')">Marquer comme répondue</button>` : ''}<button class="btn-sm ghost" data-lead-action="closed" onclick="markLead('${l.id}','closed')">Clôturer</button></div>` : ''}
    </div>`;
  }).join('');
}

boot();
