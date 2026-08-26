// Z Studio — passwordless Supabase Auth + authenticated AI bridge v1
// Browser/native-safe. Uses only the public Supabase publishable key.
const ZSTUDIO_PASSWORDLESS_AUTH_V1 = true;
const ZSTUDIO_SUPABASE_URL = 'https://dcdggqyazdddrfuzwavw.supabase.co';
const ZSTUDIO_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_LQqhseuSfNibffNh_cLLGQ_0cVxHQzX';
const ZSTUDIO_SUPABASE_JS_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0';

const ZSTUDIO_AUTH_STRINGS = Object.freeze({
  pt: {
    authSignIn: 'Entrar', authAccount: 'Conta', authTitle: 'Entrar no Z Studio',
    authSubtitle: 'Usa o teu email para receber um código de 6 dígitos. O acesso ao Studio e à IA depende de um plano ativo.',
    authEmailLabel: 'Email', authEmailPlaceholder: 'nome@exemplo.com', authSendCode: 'Enviar código',
    authCodeLabel: 'Código de 6 dígitos', authCodePlaceholder: '000000', authVerify: 'Confirmar código',
    authChangeEmail: 'Usar outro email', authCodeSent: 'Código enviado. Consulta o teu email.',
    authSignedIn: 'Sessão iniciada', authSignOut: 'Terminar sessão', authClose: 'Fechar',
    authRequired: 'Inicia sessão para usar a IA.', authSessionExpired: 'A sessão expirou. Inicia sessão novamente.',
    authPlanRequired: 'É necessário um plano ativo com acesso à IA.', authQuotaExceeded: 'A quota de IA do período foi atingida.',
    authUnavailable: 'Autenticação temporariamente indisponível.', authInvalidEmail: 'Introduz um email válido.',
    authInvalidCode: 'Introduz o código de 6 dígitos.', authSending: 'A enviar…', authChecking: 'A confirmar…',
    authAccountUnavailable: 'Não foi possível preparar a tua conta Z Studio.', authAiUnavailable: 'IA temporariamente indisponível.',
    authTimeout: 'A IA demorou demasiado tempo a responder — tenta outra vez.'
  },
  en: {
    authSignIn: 'Sign in', authAccount: 'Account', authTitle: 'Sign in to Z Studio',
    authSubtitle: 'Use your email to receive a 6-digit code. Studio and AI access require an active plan.',
    authEmailLabel: 'Email', authEmailPlaceholder: 'name@example.com', authSendCode: 'Send code',
    authCodeLabel: '6-digit code', authCodePlaceholder: '000000', authVerify: 'Confirm code',
    authChangeEmail: 'Use another email', authCodeSent: 'Code sent. Check your email.',
    authSignedIn: 'Signed in', authSignOut: 'Sign out', authClose: 'Close',
    authRequired: 'Sign in to use AI.', authSessionExpired: 'Your session expired. Sign in again.',
    authPlanRequired: 'An active plan with AI access is required.', authQuotaExceeded: 'Your AI quota for this period has been reached.',
    authUnavailable: 'Authentication is temporarily unavailable.', authInvalidEmail: 'Enter a valid email address.',
    authInvalidCode: 'Enter the 6-digit code.', authSending: 'Sending…', authChecking: 'Checking…',
    authAccountUnavailable: 'We could not prepare your Z Studio account.', authAiUnavailable: 'AI is temporarily unavailable.',
    authTimeout: 'AI took too long to respond — please try again.'
  },
  fr: {
    authSignIn: 'Connexion', authAccount: 'Compte', authTitle: 'Se connecter à Z Studio',
    authSubtitle: 'Utilisez votre e-mail pour recevoir un code à 6 chiffres. L’accès à Studio et à l’IA nécessite un forfait actif.',
    authEmailLabel: 'E-mail', authEmailPlaceholder: 'nom@exemple.com', authSendCode: 'Envoyer le code',
    authCodeLabel: 'Code à 6 chiffres', authCodePlaceholder: '000000', authVerify: 'Confirmer le code',
    authChangeEmail: 'Utiliser un autre e-mail', authCodeSent: 'Code envoyé. Consultez votre e-mail.',
    authSignedIn: 'Session ouverte', authSignOut: 'Se déconnecter', authClose: 'Fermer',
    authRequired: 'Connectez-vous pour utiliser l’IA.', authSessionExpired: 'Votre session a expiré. Reconnectez-vous.',
    authPlanRequired: 'Un forfait actif avec accès à l’IA est nécessaire.', authQuotaExceeded: 'Votre quota d’IA pour cette période est atteint.',
    authUnavailable: 'L’authentification est temporairement indisponible.', authInvalidEmail: 'Saisissez une adresse e-mail valide.',
    authInvalidCode: 'Saisissez le code à 6 chiffres.', authSending: 'Envoi…', authChecking: 'Vérification…',
    authAccountUnavailable: 'Impossible de préparer votre compte Z Studio.', authAiUnavailable: 'L’IA est temporairement indisponible.',
    authTimeout: 'L’IA a mis trop de temps à répondre — réessayez.'
  },
  es: {
    authSignIn: 'Entrar', authAccount: 'Cuenta', authTitle: 'Entrar en Z Studio',
    authSubtitle: 'Usa tu email para recibir un código de 6 dígitos. El acceso a Studio y a la IA requiere un plan activo.',
    authEmailLabel: 'Email', authEmailPlaceholder: 'nombre@ejemplo.com', authSendCode: 'Enviar código',
    authCodeLabel: 'Código de 6 dígitos', authCodePlaceholder: '000000', authVerify: 'Confirmar código',
    authChangeEmail: 'Usar otro email', authCodeSent: 'Código enviado. Revisa tu email.',
    authSignedIn: 'Sesión iniciada', authSignOut: 'Cerrar sesión', authClose: 'Cerrar',
    authRequired: 'Inicia sesión para usar la IA.', authSessionExpired: 'Tu sesión ha caducado. Inicia sesión de nuevo.',
    authPlanRequired: 'Se requiere un plan activo con acceso a la IA.', authQuotaExceeded: 'Has alcanzado la cuota de IA del periodo.',
    authUnavailable: 'La autenticación no está disponible temporalmente.', authInvalidEmail: 'Introduce un email válido.',
    authInvalidCode: 'Introduce el código de 6 dígitos.', authSending: 'Enviando…', authChecking: 'Comprobando…',
    authAccountUnavailable: 'No se pudo preparar tu cuenta Z Studio.', authAiUnavailable: 'La IA no está disponible temporalmente.',
    authTimeout: 'La IA ha tardado demasiado en responder — inténtalo de nuevo.'
  },
  de: {
    authSignIn: 'Anmelden', authAccount: 'Konto', authTitle: 'Bei Z Studio anmelden',
    authSubtitle: 'Nutze deine E-Mail-Adresse, um einen 6-stelligen Code zu erhalten. Studio- und KI-Zugriff erfordern einen aktiven Tarif.',
    authEmailLabel: 'E-Mail', authEmailPlaceholder: 'name@beispiel.de', authSendCode: 'Code senden',
    authCodeLabel: '6-stelliger Code', authCodePlaceholder: '000000', authVerify: 'Code bestätigen',
    authChangeEmail: 'Andere E-Mail verwenden', authCodeSent: 'Code gesendet. Prüfe deine E-Mails.',
    authSignedIn: 'Angemeldet', authSignOut: 'Abmelden', authClose: 'Schließen',
    authRequired: 'Melde dich an, um die KI zu nutzen.', authSessionExpired: 'Deine Sitzung ist abgelaufen. Melde dich erneut an.',
    authPlanRequired: 'Ein aktiver Tarif mit KI-Zugriff ist erforderlich.', authQuotaExceeded: 'Dein KI-Kontingent für diesen Zeitraum ist erreicht.',
    authUnavailable: 'Die Anmeldung ist vorübergehend nicht verfügbar.', authInvalidEmail: 'Gib eine gültige E-Mail-Adresse ein.',
    authInvalidCode: 'Gib den 6-stelligen Code ein.', authSending: 'Wird gesendet…', authChecking: 'Wird geprüft…',
    authAccountUnavailable: 'Dein Z Studio-Konto konnte nicht vorbereitet werden.', authAiUnavailable: 'Die KI ist vorübergehend nicht verfügbar.',
    authTimeout: 'Die KI hat zu lange für eine Antwort gebraucht — versuche es erneut.'
  },
  it: {
    authSignIn: 'Accedi', authAccount: 'Account', authTitle: 'Accedi a Z Studio',
    authSubtitle: 'Usa la tua email per ricevere un codice di 6 cifre. L’accesso a Studio e all’IA richiede un piano attivo.',
    authEmailLabel: 'Email', authEmailPlaceholder: 'nome@esempio.it', authSendCode: 'Invia codice',
    authCodeLabel: 'Codice di 6 cifre', authCodePlaceholder: '000000', authVerify: 'Conferma codice',
    authChangeEmail: 'Usa un’altra email', authCodeSent: 'Codice inviato. Controlla la tua email.',
    authSignedIn: 'Accesso effettuato', authSignOut: 'Esci', authClose: 'Chiudi',
    authRequired: 'Accedi per usare l’IA.', authSessionExpired: 'La sessione è scaduta. Accedi di nuovo.',
    authPlanRequired: 'È necessario un piano attivo con accesso all’IA.', authQuotaExceeded: 'Hai raggiunto la quota IA del periodo.',
    authUnavailable: 'L’autenticazione è temporaneamente non disponibile.', authInvalidEmail: 'Inserisci un indirizzo email valido.',
    authInvalidCode: 'Inserisci il codice di 6 cifre.', authSending: 'Invio…', authChecking: 'Verifica…',
    authAccountUnavailable: 'Non è stato possibile preparare il tuo account Z Studio.', authAiUnavailable: 'L’IA è temporaneamente non disponibile.',
    authTimeout: 'L’IA ha impiegato troppo tempo a rispondere — riprova.'
  }
});

try {
  if (typeof UI_STRINGS === 'object' && UI_STRINGS) {
    Object.keys(ZSTUDIO_AUTH_STRINGS).forEach((lang) => {
      if (UI_STRINGS[lang]) Object.assign(UI_STRINGS[lang], ZSTUDIO_AUTH_STRINGS[lang]);
    });
  }
} catch (_error) {
  // Auth keeps its own six-language dictionary even if the shared UI table is immutable.
}

function zstudioAuthLang() {
  const lang = (typeof state === 'object' && state && state.lang) || 'pt';
  return ZSTUDIO_AUTH_STRINGS[lang] ? lang : 'pt';
}
function zstudioAuthT(key) {
  const lang = zstudioAuthLang();
  return ZSTUDIO_AUTH_STRINGS[lang][key] || ZSTUDIO_AUTH_STRINGS.pt[key] || key;
}

let zstudioAuthClientPromise = null;
let zstudioAuthSession = null;
let zstudioAuthLoadError = false;
let zstudioPendingEmail = '';
let zstudioAuthUi = null;

function zstudioLoadSupabaseLibrary() {
  if (window.supabase && typeof window.supabase.createClient === 'function') return Promise.resolve(window.supabase);
  return new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-zstudio-supabase-js]');
    const finish = () => {
      if (window.supabase && typeof window.supabase.createClient === 'function') resolve(window.supabase);
      else reject(new Error('SUPABASE_LIBRARY_UNAVAILABLE'));
    };
    if (script) {
      if (script.dataset.loaded === 'true') finish();
      else {
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', () => reject(new Error('SUPABASE_LIBRARY_UNAVAILABLE')), { once: true });
      }
      return;
    }
    script = document.createElement('script');
    script.src = ZSTUDIO_SUPABASE_JS_CDN;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.zstudioSupabaseJs = '2.111.0';
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; finish(); }, { once: true });
    script.addEventListener('error', () => reject(new Error('SUPABASE_LIBRARY_UNAVAILABLE')), { once: true });
    document.head.appendChild(script);
  });
}

function zstudioGetAuthClient() {
  if (!zstudioAuthClientPromise) {
    zstudioAuthClientPromise = zstudioLoadSupabaseLibrary().then((sdk) => {
      const client = sdk.createClient(ZSTUDIO_SUPABASE_URL, ZSTUDIO_SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
      client.auth.onAuthStateChange((_event, session) => {
        zstudioAuthSession = session || null;
        queueMicrotask(() => zstudioRenderAuthUi());
      });
      return client;
    }).catch((error) => {
      zstudioAuthLoadError = true;
      zstudioRenderAuthUi();
      throw error;
    });
  }
  return zstudioAuthClientPromise;
}

async function zstudioEnsureStudioAccount(client) {
  const { error } = await client.rpc('zstudio_ensure_account');
  if (error) throw new Error('STUDIO_ACCOUNT_UNAVAILABLE');
}

async function zstudioRefreshSession() {
  const client = await zstudioGetAuthClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  zstudioAuthSession = data?.session || null;
  zstudioRenderAuthUi();
  return zstudioAuthSession;
}

function zstudioSetAuthStatus(message, isError) {
  if (!zstudioAuthUi?.status) return;
  zstudioAuthUi.status.textContent = message || '';
  zstudioAuthUi.status.style.color = isError ? '#D98980' : 'var(--text3)';
}

function zstudioCreateButton(text, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className || 'btn btn-line';
  button.textContent = text;
  if (handler) button.addEventListener('click', handler);
  return button;
}

function zstudioInjectAuthStyles() {
  if (document.getElementById('zstudioAuthStyles')) return;
  const style = document.createElement('style');
  style.id = 'zstudioAuthStyles';
  style.textContent = `
    .zstudio-auth-overlay{position:fixed;inset:0;z-index:1200;background:rgba(10,10,10,.82);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:24px}
    .zstudio-auth-card{width:min(440px,100%);background:var(--surface);border:1px solid rgba(var(--gold-rgb),.34);border-radius:6px;padding:28px;box-shadow:0 30px 80px rgba(0,0,0,.55)}
    .zstudio-auth-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
    .zstudio-auth-title{font-family:'Cormorant Garamond',serif;font-size:1.65rem;font-weight:500;color:var(--text)}
    .zstudio-auth-subtitle{font-size:.78rem;line-height:1.55;color:var(--text2);margin-bottom:18px}
    .zstudio-auth-label{display:block;font-size:.72rem;color:var(--text2);margin:10px 0 6px}
    .zstudio-auth-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
    .zstudio-auth-row .btn{flex:1;min-width:150px}
    .zstudio-auth-status{min-height:1.2em;margin-top:12px;font-size:.72rem;line-height:1.45;color:var(--text3)}
    .zstudio-auth-user{font-size:.76rem;color:var(--text2);overflow-wrap:anywhere;margin:8px 0 14px}
    .zstudio-auth-close{background:none;border:0;color:var(--text2);font-size:1.2rem;cursor:pointer;padding:2px 5px}
    #zstudioAuthButton{padding:9px 14px;font-size:.7rem;white-space:nowrap}
    @media(max-width:620px){.zstudio-auth-card{padding:22px}.zstudio-auth-row{flex-direction:column}.zstudio-auth-row .btn{width:100%}}
  `;
  document.head.appendChild(style);
}

function zstudioBuildAuthUi() {
  if (zstudioAuthUi) return zstudioAuthUi;
  zstudioInjectAuthStyles();

  const langSwitch = document.getElementById('langSwitch');
  const authButton = zstudioCreateButton(zstudioAuthT('authSignIn'), 'btn btn-line', () => zstudioOpenAuth());
  authButton.id = 'zstudioAuthButton';
  if (langSwitch?.parentElement) langSwitch.parentElement.insertBefore(authButton, langSwitch);

  const overlay = document.createElement('div');
  overlay.id = 'zstudioAuthOverlay';
  overlay.className = 'zstudio-auth-overlay hide';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.addEventListener('click', (event) => { if (event.target === overlay) zstudioCloseAuth(); });

  const card = document.createElement('div');
  card.className = 'zstudio-auth-card';
  const head = document.createElement('div');
  head.className = 'zstudio-auth-head';
  const title = document.createElement('div');
  title.className = 'zstudio-auth-title';
  const close = zstudioCreateButton('×', 'zstudio-auth-close', () => zstudioCloseAuth());
  close.setAttribute('aria-label', zstudioAuthT('authClose'));
  head.append(title, close);
  const subtitle = document.createElement('div');
  subtitle.className = 'zstudio-auth-subtitle';

  const emailStep = document.createElement('div');
  const emailLabel = document.createElement('label');
  emailLabel.className = 'zstudio-auth-label';
  emailLabel.htmlFor = 'zstudioAuthEmail';
  const email = document.createElement('input');
  email.type = 'email'; email.id = 'zstudioAuthEmail'; email.autocomplete = 'email'; email.inputMode = 'email';
  const send = zstudioCreateButton(zstudioAuthT('authSendCode'), 'btn btn-gold', () => zstudioSendOtp());
  send.style.width = '100%'; send.style.marginTop = '12px';
  emailStep.append(emailLabel, email, send);

  const codeStep = document.createElement('div');
  codeStep.className = 'hide';
  const codeLabel = document.createElement('label');
  codeLabel.className = 'zstudio-auth-label'; codeLabel.htmlFor = 'zstudioAuthCode';
  const code = document.createElement('input');
  code.type = 'text'; code.id = 'zstudioAuthCode'; code.autocomplete = 'one-time-code'; code.inputMode = 'numeric'; code.maxLength = 6;
  const codeRow = document.createElement('div'); codeRow.className = 'zstudio-auth-row';
  const verify = zstudioCreateButton(zstudioAuthT('authVerify'), 'btn btn-gold', () => zstudioVerifyOtp());
  const change = zstudioCreateButton(zstudioAuthT('authChangeEmail'), 'btn btn-line', () => zstudioShowEmailStep());
  codeRow.append(verify, change); codeStep.append(codeLabel, code, codeRow);

  const signedStep = document.createElement('div'); signedStep.className = 'hide';
  const signedLabel = document.createElement('div'); signedLabel.className = 'zstudio-auth-label';
  const signedUser = document.createElement('div'); signedUser.className = 'zstudio-auth-user';
  const signOut = zstudioCreateButton(zstudioAuthT('authSignOut'), 'btn btn-line', () => zstudioSignOut());
  signOut.style.width = '100%'; signedStep.append(signedLabel, signedUser, signOut);

  const status = document.createElement('div'); status.className = 'zstudio-auth-status'; status.setAttribute('aria-live', 'polite');
  card.append(head, subtitle, emailStep, codeStep, signedStep, status); overlay.appendChild(card); document.body.appendChild(overlay);

  zstudioAuthUi = { authButton, overlay, title, close, subtitle, emailStep, emailLabel, email, send, codeStep, codeLabel, code, verify, change, signedStep, signedLabel, signedUser, signOut, status };
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !overlay.classList.contains('hide')) zstudioCloseAuth(); });
  document.getElementById('langSwitch')?.addEventListener('click', () => setTimeout(zstudioRenderAuthUi, 0));
  return zstudioAuthUi;
}

function zstudioShowEmailStep() {
  if (!zstudioAuthUi) return;
  zstudioPendingEmail = '';
  zstudioAuthUi.emailStep.classList.remove('hide');
  zstudioAuthUi.codeStep.classList.add('hide');
  zstudioAuthUi.signedStep.classList.add('hide');
  zstudioAuthUi.code.value = '';
  zstudioSetAuthStatus('', false);
  zstudioAuthUi.email.focus();
}

function zstudioRenderAuthUi() {
  if (!zstudioAuthUi) return;
  const ui = zstudioAuthUi;
  ui.authButton.textContent = zstudioAuthSession ? zstudioAuthT('authAccount') : zstudioAuthT('authSignIn');
  ui.title.textContent = zstudioAuthT('authTitle');
  ui.subtitle.textContent = zstudioAuthT('authSubtitle');
  ui.close.setAttribute('aria-label', zstudioAuthT('authClose'));
  ui.emailLabel.textContent = zstudioAuthT('authEmailLabel');
  ui.email.placeholder = zstudioAuthT('authEmailPlaceholder');
  ui.send.textContent = zstudioAuthT('authSendCode');
  ui.codeLabel.textContent = zstudioAuthT('authCodeLabel');
  ui.code.placeholder = zstudioAuthT('authCodePlaceholder');
  ui.verify.textContent = zstudioAuthT('authVerify');
  ui.change.textContent = zstudioAuthT('authChangeEmail');
  ui.signedLabel.textContent = zstudioAuthT('authSignedIn');
  ui.signOut.textContent = zstudioAuthT('authSignOut');
  if (zstudioAuthLoadError) zstudioSetAuthStatus(zstudioAuthT('authUnavailable'), true);
  if (zstudioAuthSession) {
    ui.emailStep.classList.add('hide'); ui.codeStep.classList.add('hide'); ui.signedStep.classList.remove('hide');
    ui.signedUser.textContent = zstudioAuthSession.user?.email || '';
  }
}

function zstudioOpenAuth() {
  const ui = zstudioBuildAuthUi();
  ui.overlay.classList.remove('hide');
  zstudioRenderAuthUi();
  if (!zstudioAuthSession && !zstudioPendingEmail) ui.email.focus();
}
function zstudioCloseAuth() { zstudioAuthUi?.overlay.classList.add('hide'); }

async function zstudioSendOtp() {
  const ui = zstudioBuildAuthUi();
  const email = ui.email.value.trim();
  if (!email || !ui.email.checkValidity()) { zstudioSetAuthStatus(zstudioAuthT('authInvalidEmail'), true); return; }
  ui.send.disabled = true; ui.send.textContent = zstudioAuthT('authSending'); zstudioSetAuthStatus('', false);
  try {
    const client = await zstudioGetAuthClient();
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
    zstudioPendingEmail = email;
    ui.emailStep.classList.add('hide'); ui.codeStep.classList.remove('hide'); ui.signedStep.classList.add('hide');
    ui.code.value = ''; zstudioSetAuthStatus(zstudioAuthT('authCodeSent'), false); ui.code.focus();
  } catch (_error) {
    zstudioSetAuthStatus(zstudioAuthT('authUnavailable'), true);
  } finally {
    ui.send.disabled = false; ui.send.textContent = zstudioAuthT('authSendCode');
  }
}

async function zstudioVerifyOtp() {
  const ui = zstudioBuildAuthUi();
  const token = ui.code.value.trim();
  if (!zstudioPendingEmail || !/^\d{6}$/.test(token)) { zstudioSetAuthStatus(zstudioAuthT('authInvalidCode'), true); return; }
  ui.verify.disabled = true; ui.verify.textContent = zstudioAuthT('authChecking'); zstudioSetAuthStatus('', false);
  try {
    const client = await zstudioGetAuthClient();
    const { data, error } = await client.auth.verifyOtp({ email: zstudioPendingEmail, token, type: 'email' });
    if (error || !data?.session) throw error || new Error('AUTH_SESSION_MISSING');
    zstudioAuthSession = data.session;
    await zstudioEnsureStudioAccount(client);
    zstudioPendingEmail = '';
    zstudioRenderAuthUi();
  } catch (error) {
    zstudioSetAuthStatus(error?.message === 'STUDIO_ACCOUNT_UNAVAILABLE' ? zstudioAuthT('authAccountUnavailable') : zstudioAuthT('authInvalidCode'), true);
  } finally {
    ui.verify.disabled = false; ui.verify.textContent = zstudioAuthT('authVerify');
  }
}

async function zstudioSignOut() {
  try {
    const client = await zstudioGetAuthClient();
    await client.auth.signOut({ scope: 'local' });
  } catch (_error) {
    zstudioSetAuthStatus(zstudioAuthT('authUnavailable'), true);
    return;
  }
  zstudioAuthSession = null; zstudioPendingEmail = ''; zstudioRenderAuthUi(); zstudioShowEmailStep();
}

async function zstudioGetAccessToken({ interactive = false } = {}) {
  try {
    const session = await zstudioRefreshSession();
    const token = session?.access_token || '';
    if (token) return token;
  } catch (_error) {
    if (interactive) { zstudioOpenAuth(); zstudioSetAuthStatus(zstudioAuthT('authUnavailable'), true); }
    return '';
  }
  if (interactive) { zstudioOpenAuth(); zstudioSetAuthStatus(zstudioAuthT('authRequired'), false); }
  return '';
}

function zstudioMapAiError(status, payload) {
  const code = payload?.code || '';
  if (status === 401 || code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID') return code === 'AUTH_INVALID' ? zstudioAuthT('authSessionExpired') : zstudioAuthT('authRequired');
  if (status === 403 || code === 'AI_ENTITLEMENT_REQUIRED') return zstudioAuthT('authPlanRequired');
  if (code === 'AI_QUOTA_EXCEEDED') return zstudioAuthT('authQuotaExceeded');
  if (code === 'AI_QUOTA_UNAVAILABLE' || code === 'AI_METERING_UNAVAILABLE' || status >= 500) return zstudioAuthT('authAiUnavailable');
  return zstudioAuthT('authAiUnavailable');
}

// Replace the legacy unauthenticated bridge only after main.js has defined it.
askAI = async function zstudioAuthenticatedAskAI(system, user, maxTokens) {
  const accessToken = await zstudioGetAccessToken({ interactive: true });
  if (!accessToken) throw new Error(zstudioAuthT('authRequired'));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ system, user, max_tokens: maxTokens || 1200 }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) {
        zstudioAuthSession = null;
        zstudioRenderAuthUi();
        zstudioOpenAuth();
      }
      throw new Error(zstudioMapAiError(response.status, payload));
    }
    const text = (payload?.content || []).map((part) => part?.text || '').join('').trim();
    return text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(zstudioAuthT('authTimeout'));
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

window.ZStudioAuth = Object.freeze({
  open: zstudioOpenAuth,
  close: zstudioCloseAuth,
  getAccessToken: zstudioGetAccessToken,
  signOut: zstudioSignOut,
});

function zstudioAuthBootstrap() {
  zstudioBuildAuthUi();
  zstudioGetAuthClient()
    .then(async (client) => {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      zstudioAuthSession = data?.session || null;
      zstudioRenderAuthUi();
      if (zstudioAuthSession) {
        try { await zstudioEnsureStudioAccount(client); }
        catch (_error) { zstudioSetAuthStatus(zstudioAuthT('authAccountUnavailable'), true); }
      }
    })
    .catch(() => { zstudioAuthLoadError = true; zstudioRenderAuthUi(); });
}

// The built script is normally emitted after the DOM. Keep a fallback for tests/embeds.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', zstudioAuthBootstrap, { once: true });
else zstudioAuthBootstrap();
