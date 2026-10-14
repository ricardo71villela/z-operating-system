// Z Studio — unified subscription UI v1.
// Provider choice is platform-only. Trial eligibility is always server-side.
(function installZStudioBilling(global) {
  'use strict';
  const PLAN_CODES = ['weekly', 'monthly', 'annual'];
  const PLAN_SET = new Set(PLAN_CODES);
  let overlay = null;
  let statusEl = null;
  let priceEls = new Map();
  let busy = false;
  const STRINGS = Object.freeze({
    pt: { plans:'Planos', title:'Z Studio', sub:'Escolha o seu plano. O teste gratuito de 3 dias é aplicado apenas se for elegível.', weekly:'Semanal', monthly:'Mensal', annual:'Anual', subscribe:'Subscrever', restore:'Restaurar compras', manage:'Gerir subscrição', close:'Fechar', working:'A processar…', restored:'Compras restauradas.', done:'Subscrição atualizada.', unavailable:'Subscrições temporariamente indisponíveis.', auth:'Inicie sessão para gerir a subscrição.', trial:'3 dias grátis se elegível' },
    en: { plans:'Plans', title:'Z Studio', sub:'Choose your plan. The 3-day free trial is applied only when eligible.', weekly:'Weekly', monthly:'Monthly', annual:'Annual', subscribe:'Subscribe', restore:'Restore purchases', manage:'Manage subscription', close:'Close', working:'Processing…', restored:'Purchases restored.', done:'Subscription updated.', unavailable:'Subscriptions are temporarily unavailable.', auth:'Sign in to manage your subscription.', trial:'3 days free if eligible' },
    fr: { plans:'Forfaits', title:'Z Studio', sub:'Choisissez votre forfait. L’essai gratuit de 3 jours est appliqué uniquement si vous êtes éligible.', weekly:'Hebdomadaire', monthly:'Mensuel', annual:'Annuel', subscribe:'S’abonner', restore:'Restaurer les achats', manage:'Gérer l’abonnement', close:'Fermer', working:'Traitement…', restored:'Achats restaurés.', done:'Abonnement mis à jour.', unavailable:'Les abonnements sont temporairement indisponibles.', auth:'Connectez-vous pour gérer votre abonnement.', trial:'3 jours gratuits si éligible' },
    es: { plans:'Planes', title:'Z Studio', sub:'Elige tu plan. La prueba gratuita de 3 días solo se aplica si eres elegible.', weekly:'Semanal', monthly:'Mensual', annual:'Anual', subscribe:'Suscribirse', restore:'Restaurar compras', manage:'Gestionar suscripción', close:'Cerrar', working:'Procesando…', restored:'Compras restauradas.', done:'Suscripción actualizada.', unavailable:'Las suscripciones no están disponibles temporalmente.', auth:'Inicia sesión para gestionar tu suscripción.', trial:'3 días gratis si eres elegible' },
    de: { plans:'Tarife', title:'Z Studio', sub:'Wähle deinen Tarif. Die 3-tägige kostenlose Testphase gilt nur bei Berechtigung.', weekly:'Wöchentlich', monthly:'Monatlich', annual:'Jährlich', subscribe:'Abonnieren', restore:'Käufe wiederherstellen', manage:'Abo verwalten', close:'Schließen', working:'Wird verarbeitet…', restored:'Käufe wiederhergestellt.', done:'Abo aktualisiert.', unavailable:'Abonnements sind vorübergehend nicht verfügbar.', auth:'Melde dich an, um dein Abo zu verwalten.', trial:'3 Tage gratis bei Berechtigung' },
    it: { plans:'Piani', title:'Z Studio', sub:'Scegli il tuo piano. La prova gratuita di 3 giorni si applica solo se idoneo.', weekly:'Settimanale', monthly:'Mensile', annual:'Annuale', subscribe:'Abbonati', restore:'Ripristina acquisti', manage:'Gestisci abbonamento', close:'Chiudi', working:'Elaborazione…', restored:'Acquisti ripristinati.', done:'Abbonamento aggiornato.', unavailable:'Gli abbonamenti non sono temporaneamente disponibili.', auth:'Accedi per gestire il tuo abbonamento.', trial:'3 giorni gratis se idoneo' },
  });
  // Data única de abertura das subscrições — usada no painel informativo quando
  // o runtime comercial ainda não está configurado (ZSTUDIO_COMMERCIAL_BASE_URL vazio).
  const SUBSCRIPTIONS_OPEN_DATE = '2026-12-01';
  // Textos de conformidade das lojas (Apple App Review 3.1.2, Google Play
  // Subscriptions policy): preço + período, renovação automática, conversão do
  // teste gratuito e como gerir/cancelar — adaptados à superfície (iOS/Android/Web).
  const EXTRA = Object.freeze({
    pt: { perWeek:'/ semana', perMonth:'/ mês', perYear:'/ ano',
      comingTitle:'As subscrições Z Studio abrem a {date}', comingSub:'Estes serão os preços a partir da abertura. Até lá, já pode criar e exportar os seus visuais.',
      trialInfo:'{days} dias de teste gratuito se for elegível',
      chargeApple:'O pagamento é cobrado na sua conta Apple quando confirma a compra.', chargeGoogle:'O pagamento é cobrado na sua conta Google Play quando confirma a compra.',
      renewStore:'A subscrição renova-se automaticamente ao mesmo preço e pela mesma duração, salvo se for cancelada pelo menos 24 horas antes do fim do período em curso.',
      renewWeb:'A subscrição renova-se automaticamente ao mesmo preço e pela mesma duração até a cancelar. Pode cancelar a qualquer momento antes do fim do período em curso; o acesso mantém-se até ao fim do período pago.',
      trialConvert:'O teste gratuito de {days} dias, se for elegível, converte-se numa subscrição paga no fim do teste, salvo se a cancelar antes do fim.',
      manageApple:'Gira ou cancele a subscrição nas definições da sua conta App Store.', manageGoogle:'Gira ou cancele a subscrição no Google Play > Pagamentos e subscrições > Subscrições.', manageWeb:'Gira ou cancele a subscrição em «{manage}».' },
    en: { perWeek:'/ week', perMonth:'/ month', perYear:'/ year',
      comingTitle:'Z Studio subscriptions open on {date}', comingSub:'These prices will apply from opening day. Until then, you can already create and export your visuals.',
      trialInfo:'{days}-day free trial if eligible',
      chargeApple:'Payment is charged to your Apple Account when you confirm the purchase.', chargeGoogle:'Payment is charged to your Google Play account when you confirm the purchase.',
      renewStore:'The subscription renews automatically at the same price and for the same period unless it is cancelled at least 24 hours before the end of the current period.',
      renewWeb:'The subscription renews automatically at the same price and for the same period until you cancel it. You can cancel at any time before the end of the current period; access continues until the end of the paid period.',
      trialConvert:'The {days}-day free trial, if you are eligible, converts to a paid subscription when it ends unless you cancel before the trial ends.',
      manageApple:'Manage or cancel your subscription in your App Store account settings.', manageGoogle:'Manage or cancel your subscription in Google Play > Payments & subscriptions > Subscriptions.', manageWeb:'Manage or cancel your subscription with “{manage}”.' },
    fr: { perWeek:'/ semaine', perMonth:'/ mois', perYear:'/ an',
      comingTitle:'Les abonnements Z Studio ouvrent le {date}', comingSub:'Ces prix s’appliqueront dès l’ouverture. En attendant, vous pouvez déjà créer et exporter vos visuels.',
      trialInfo:'{days} jours d’essai gratuit si vous êtes éligible',
      chargeApple:'Le paiement est débité sur votre compte Apple lors de la confirmation de l’achat.', chargeGoogle:'Le paiement est débité sur votre compte Google Play lors de la confirmation de l’achat.',
      renewStore:'L’abonnement se renouvelle automatiquement au même prix et pour la même durée, sauf s’il est annulé au moins 24 heures avant la fin de la période en cours.',
      renewWeb:'L’abonnement se renouvelle automatiquement au même prix et pour la même durée jusqu’à ce que vous l’annuliez. Vous pouvez l’annuler à tout moment avant la fin de la période en cours ; l’accès reste actif jusqu’à la fin de la période payée.',
      trialConvert:'L’essai gratuit de {days} jours, si vous y êtes éligible, se transforme en abonnement payant à son terme, sauf si vous l’annulez avant la fin de l’essai.',
      manageApple:'Gérez ou annulez votre abonnement dans les réglages de votre compte App Store.', manageGoogle:'Gérez ou annulez votre abonnement dans Google Play > Paiements et abonnements > Abonnements.', manageWeb:'Gérez ou annulez votre abonnement avec « {manage} ».' },
    es: { perWeek:'/ semana', perMonth:'/ mes', perYear:'/ año',
      comingTitle:'Las suscripciones de Z Studio abren el {date}', comingSub:'Estos precios se aplicarán desde la apertura. Mientras tanto, ya puedes crear y exportar tus diseños.',
      trialInfo:'{days} días de prueba gratuita si eres elegible',
      chargeApple:'El pago se carga en tu cuenta de Apple al confirmar la compra.', chargeGoogle:'El pago se carga en tu cuenta de Google Play al confirmar la compra.',
      renewStore:'La suscripción se renueva automáticamente al mismo precio y por el mismo periodo, salvo que se cancele al menos 24 horas antes del final del periodo en curso.',
      renewWeb:'La suscripción se renueva automáticamente al mismo precio y por el mismo periodo hasta que la canceles. Puedes cancelarla en cualquier momento antes del final del periodo en curso; el acceso se mantiene hasta el final del periodo pagado.',
      trialConvert:'La prueba gratuita de {days} días, si eres elegible, se convierte en una suscripción de pago al terminar, salvo que la canceles antes del final de la prueba.',
      manageApple:'Gestiona o cancela tu suscripción en los ajustes de tu cuenta del App Store.', manageGoogle:'Gestiona o cancela tu suscripción en Google Play > Pagos y suscripciones > Suscripciones.', manageWeb:'Gestiona o cancela tu suscripción con «{manage}».' },
    de: { perWeek:'/ Woche', perMonth:'/ Monat', perYear:'/ Jahr',
      comingTitle:'Z Studio-Abonnements starten am {date}', comingSub:'Diese Preise gelten ab dem Start. Bis dahin können Sie Ihre Visuals bereits erstellen und exportieren.',
      trialInfo:'{days} Tage kostenlos testen bei Berechtigung',
      chargeApple:'Die Zahlung wird bei Bestätigung des Kaufs Ihrem Apple Account belastet.', chargeGoogle:'Die Zahlung wird bei Bestätigung des Kaufs Ihrem Google Play-Konto belastet.',
      renewStore:'Das Abonnement verlängert sich automatisch zum gleichen Preis und für den gleichen Zeitraum, sofern es nicht mindestens 24 Stunden vor Ende des laufenden Zeitraums gekündigt wird.',
      renewWeb:'Das Abonnement verlängert sich automatisch zum gleichen Preis und für den gleichen Zeitraum, bis Sie es kündigen. Sie können jederzeit vor Ende des laufenden Zeitraums kündigen; der Zugang bleibt bis zum Ende des bezahlten Zeitraums bestehen.',
      trialConvert:'Die {days}-tägige kostenlose Testphase geht, sofern Sie berechtigt sind, an ihrem Ende in ein kostenpflichtiges Abonnement über, wenn Sie nicht vorher kündigen.',
      manageApple:'Verwalten oder kündigen Sie Ihr Abonnement in den Einstellungen Ihres App Store-Accounts.', manageGoogle:'Verwalten oder kündigen Sie Ihr Abonnement in Google Play > Zahlungen und Abos > Abos.', manageWeb:'Verwalten oder kündigen Sie Ihr Abonnement über „{manage}“.' },
    it: { perWeek:'/ settimana', perMonth:'/ mese', perYear:'/ anno',
      comingTitle:'Gli abbonamenti Z Studio aprono il {date}', comingSub:'Questi prezzi saranno validi dall’apertura. Nel frattempo puoi già creare ed esportare i tuoi contenuti.',
      trialInfo:'{days} giorni di prova gratuita se idoneo',
      chargeApple:'Il pagamento viene addebitato sul tuo account Apple alla conferma dell’acquisto.', chargeGoogle:'Il pagamento viene addebitato sul tuo account Google Play alla conferma dell’acquisto.',
      renewStore:'L’abbonamento si rinnova automaticamente allo stesso prezzo e per la stessa durata, salvo disdetta almeno 24 ore prima della fine del periodo in corso.',
      renewWeb:'L’abbonamento si rinnova automaticamente allo stesso prezzo e per la stessa durata finché non lo disdici. Puoi disdirlo in qualsiasi momento prima della fine del periodo in corso; l’accesso resta attivo fino alla fine del periodo pagato.',
      trialConvert:'La prova gratuita di {days} giorni, se idoneo, si trasforma in un abbonamento a pagamento alla scadenza, salvo disdetta prima della fine della prova.',
      manageApple:'Gestisci o disdici l’abbonamento nelle impostazioni del tuo account App Store.', manageGoogle:'Gestisci o disdici l’abbonamento in Google Play > Pagamenti e abbonamenti > Abbonamenti.', manageWeb:'Gestisci o disdici l’abbonamento con «{manage}».' },
  });
  function lang() { const value = String((typeof state === 'object' && state?.lang) || document.documentElement.lang || 'pt').toLowerCase().slice(0,2); return STRINGS[value] ? value : 'en'; }
  function t(key, vars) { const l = lang(); const raw = STRINGS[l][key] || EXTRA[l][key] || STRINGS.en[key] || EXTRA.en[key] || key; return String(raw).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)); }
  const PERIOD_KEYS = Object.freeze({ weekly: 'perWeek', monthly: 'perMonth', annual: 'perYear' });
  function trialDays() { const d = Number(config()?.trialDays); return Number.isInteger(d) && d > 0 ? d : 3; }
  function openDateLabel() {
    const [y, m, d] = SUBSCRIPTIONS_OPEN_DATE.split('-').map(Number);
    let label;
    try { label = new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))); }
    catch { label = SUBSCRIPTIONS_OPEN_DATE; }
    return lang() === 'fr' && d === 1 ? label.replace(/^1 /, '1er ') : label;
  }
  function renewalNotice() {
    const vars = { days: trialDays(), manage: t('manage') };
    const p = platform();
    const parts = p === 'ios' ? ['chargeApple', 'renewStore', 'trialConvert', 'manageApple']
      // Google Play: o cancelamento vale até ao fim do período (sem a regra Apple das 24 h).
      : p === 'android' ? ['chargeGoogle', 'renewWeb', 'trialConvert', 'manageGoogle']
      : ['renewWeb', 'trialConvert', 'manageWeb'];
    return parts.map((k) => t(k, vars)).join(' ');
  }
  function config() { return global.ZStudioCommercialConfig || null; }
  function baseUrl() { return String(config()?.baseUrl || global.ZSTUDIO_COMMERCIAL_BASE_URL || '').replace(/\/+$/, ''); }
  function enabled() { return config()?.enabled === true && /^https:\/\//.test(baseUrl()); }
  function platform() { if (global.Capacitor?.isNativePlatform?.() === true) return global.Capacitor?.getPlatform?.() || 'native'; return 'web'; }
  function targetPrice(planCode) { const minor = Number(config()?.plans?.[planCode]?.priceMinor); const currency = String(config()?.currency || 'EUR'); if (!Number.isInteger(minor) || minor <= 0) return ''; try { return new Intl.NumberFormat(lang(), {style:'currency',currency}).format(minor / 100); } catch { return `${(minor/100).toFixed(2)} ${currency}`; } }
  function setStatus(message, isError=false) { if (!statusEl) return; statusEl.textContent = message || ''; statusEl.style.color = isError ? '#D98980' : 'var(--text2, #B0B4B8)'; }
  function create(tag, props={}) { const el = document.createElement(tag); Object.entries(props).forEach(([key,value]) => { if (key === 'text') el.textContent = value; else if (key === 'className') el.className = value; else el.setAttribute(key, value); }); return el; }
  function injectStyle() { if (document.getElementById('zstudioBillingStyle')) return; const style = create('style',{id:'zstudioBillingStyle'}); style.textContent = `.zsb-trigger{margin-left:8px;padding:7px 12px;border:1px solid var(--border,#454A4F);background:transparent;color:var(--text,#F2F2EF);font:500 .74rem 'DM Sans',sans-serif;letter-spacing:.06em;border-radius:3px;cursor:pointer}.zsb-overlay{position:fixed;inset:0;z-index:1400;background:rgba(5,6,7,.86);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px}.zsb-overlay[hidden]{display:none}.zsb-card{width:min(820px,100%);max-height:min(760px,92vh);overflow:auto;background:var(--surface,#111315);border:1px solid var(--border,#454A4F);border-radius:8px;padding:24px;box-shadow:0 32px 90px rgba(0,0,0,.6)}.zsb-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.zsb-title{font:500 1.75rem 'Cormorant Garamond',serif}.zsb-sub{margin:6px 0 20px;color:var(--text2,#B0B4B8);font-size:.78rem;line-height:1.55;max-width:620px}.zsb-close{border:0;background:transparent;color:var(--text2,#B0B4B8);font-size:1.3rem;cursor:pointer}.zsb-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.zsb-plan{border:1px solid var(--border,#454A4F);border-radius:6px;padding:18px;background:var(--surface-2,#181A1D)}.zsb-plan-name{font-size:.78rem;text-transform:uppercase;letter-spacing:.14em;color:var(--text2,#B0B4B8)}.zsb-price{font:500 1.65rem 'Cormorant Garamond',serif;margin:8px 0}.zsb-trial{min-height:32px;color:var(--text2,#B0B4B8);font-size:.7rem;line-height:1.4}.zsb-buy{width:100%;margin-top:14px;padding:10px;border:1px solid var(--text,#F2F2EF);background:var(--text,#F2F2EF);color:#0A0A0A;border-radius:3px;cursor:pointer;font:500 .75rem 'DM Sans',sans-serif}.zsb-buy:disabled{opacity:.5;cursor:not-allowed}.zsb-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.zsb-action{padding:8px 12px;border:1px solid var(--border,#454A4F);background:transparent;color:var(--text,#F2F2EF);border-radius:3px;cursor:pointer;font-size:.72rem}.zsb-status{min-height:1.3em;margin-top:14px;font-size:.72rem}.zsb-period{font:400 .8rem 'DM Sans',sans-serif;color:var(--text2,#B0B4B8)}.zsb-renewal{margin:16px 0 0;font-size:.68rem;line-height:1.55;color:var(--text2,#B0B4B8)}.zsb-legal{margin-top:10px;font-size:.68rem;color:var(--text3,#8A8F94)}.zsb-legal a{color:inherit}@media(max-width:720px){.zsb-plans{grid-template-columns:1fr}.zsb-card{padding:18px}.zsb-trigger{padding:7px 9px}}`; document.head.appendChild(style); }
  async function accessToken() { const token = await global.ZStudioAuth?.getAccessToken?.({interactive:true}); if (!token) throw Object.assign(new Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'}); return token; }
  async function webPost(path, data) { const token = await accessToken(); let response; try { response = await fetch(baseUrl()+path,{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(data)}); } catch (cause) { throw Object.assign(new Error('WEB_COMMERCIAL_UNAVAILABLE'),{code:'WEB_COMMERCIAL_UNAVAILABLE',cause}); } const payload = await response.json().catch(()=>null); if (!response.ok) throw Object.assign(new Error(payload?.code || 'WEB_COMMERCIAL_FAILED'),{code:payload?.code || 'WEB_COMMERCIAL_FAILED',httpStatus:response.status}); return payload; }
  async function waitFor(name, maxMs=2500) { const start = Date.now(); while (Date.now() - start < maxMs) { if (global[name]) return global[name]; await new Promise((resolve)=>setTimeout(resolve,100)); } return global[name] || null; }
  function checkoutUrl(value) { const raw = String(value || ''); let url; try { url = new URL(raw); } catch { throw new Error('WEB_CHECKOUT_URL_INVALID'); } if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('WEB_CHECKOUT_URL_INVALID'); return url.href; }
  async function startPlan(planCode) { if (!PLAN_SET.has(planCode)) throw new Error('PLAN_INVALID'); if (!enabled()) throw Object.assign(new Error('COMMERCIAL_RUNTIME_DISABLED'),{code:'COMMERCIAL_RUNTIME_DISABLED'}); if (busy) return; busy = true; setStatus(t('working')); document.querySelectorAll('.zsb-buy').forEach((b)=>{b.disabled=true;}); try { const p = platform(); if (p === 'ios') { const bridge = await waitFor('ZStudioApple'); if (!bridge?.isAvailable?.()) throw new Error('APPLE_NATIVE_UNAVAILABLE'); await bridge.startPurchase(planCode); setStatus(t('done')); } else if (p === 'android') { const bridge = await waitFor('ZStudioGooglePlay'); if (!bridge?.isAvailable?.()) throw new Error('GOOGLE_PLAY_NATIVE_UNAVAILABLE'); await bridge.startPurchase(planCode); setStatus(t('done')); } else { const result = await webPost('/api/web/checkout',{plan_code:planCode}); global.location.assign(checkoutUrl(result?.checkout_url)); } } catch (cause) { setStatus(cause?.code === 'AUTH_REQUIRED' ? t('auth') : t('unavailable'), true); throw cause; } finally { busy = false; document.querySelectorAll('.zsb-buy').forEach((b)=>{b.disabled=false;}); } }
  async function restore() { if (busy) return; busy=true; setStatus(t('working')); try { const p=platform(); if (p==='ios') { const bridge=await waitFor('ZStudioApple'); if (!bridge?.isAvailable?.()) throw new Error('APPLE_NATIVE_UNAVAILABLE'); await bridge.restoreCurrentPurchases({sync:true,interactive:true}); } else if (p==='android') { const bridge=await waitFor('ZStudioGooglePlay'); if (!bridge?.isAvailable?.()) throw new Error('GOOGLE_PLAY_NATIVE_UNAVAILABLE'); await accessToken(); await bridge.restoreCurrentPurchases(); } else return; setStatus(t('restored')); } catch (cause) { setStatus(cause?.code==='AUTH_REQUIRED'?t('auth'):t('unavailable'),true); throw cause; } finally { busy=false; } }
  async function manage() { if (busy) return; busy=true; setStatus(t('working')); try { if (platform()!=='web') return; const result=await webPost('/api/web/portal',{}); const raw=String(result?.portal_url||''); const url=new URL(raw); if (url.protocol!=='https:' || !/(^|\.)stripe\.com$/.test(url.hostname)) throw new Error('WEB_PORTAL_URL_INVALID'); global.location.assign(url.href); } catch (cause) { setStatus(cause?.code==='AUTH_REQUIRED'?t('auth'):t('unavailable'),true); throw cause; } finally { busy=false; } }
  async function refreshNativePrices() { try { const p=platform(); if (p==='ios') { const bridge=await waitFor('ZStudioApple',800); if (!bridge?.isAvailable?.()) return; const products=await bridge.loadProducts(); const map=new Map((products?.products||[]).map((x)=>[x.productId,x.displayPrice])); for (const plan of PLAN_CODES) { const id=config()?.plans?.[plan]?.appleProductId; if (map.get(id) && priceEls.get(plan)) priceEls.get(plan).textContent=map.get(id); } } else if (p==='android') { const bridge=await waitFor('ZStudioGooglePlay',800); if (!bridge?.isAvailable?.()) return; const result=await bridge.loadProducts(); const offers=result?.products?.[0]?.offers||[]; for (const plan of PLAN_CODES) { const offer=offers.find((x)=>x.basePlanId===plan && x.offerId==null) || offers.find((x)=>x.basePlanId===plan); const phases=offer?.pricingPhases||[]; const paid=[...phases].reverse().find((x)=>Number(x.priceAmountMicros)>0) || phases[phases.length-1]; if (paid?.formattedPrice && priceEls.get(plan)) priceEls.get(plan).textContent=paid.formattedPrice; } } } catch {} }
  function legalLinks() { const legal=create('div',{className:'zsb-legal'}); for (const id of ['footerTermsLink','footerPrivacyLink']) { const src=document.getElementById(id); if (!src?.href) continue; const a=create('a',{href:src.href,target:'_blank',rel:'noopener',text:(src.textContent||'').trim()}); if (legal.childNodes.length) legal.append(' · '); legal.appendChild(a); } return legal; }
  function priceRow(plan) { const row=create('div',{className:'zsb-price'}); const amount=create('span',{text:targetPrice(plan)}); priceEls.set(plan,amount); row.append(amount,' ',create('span',{className:'zsb-period',text:t(PERIOD_KEYS[plan])})); return row; }
  function hide() { if (overlay) overlay.hidden = true; }
  // Quando o runtime comercial não está configurado, "Planos" abre um painel
  // informativo (data de abertura + preços) sem nenhum botão de compra: fail-closed.
  function open() {
    const live = enabled();
    if (overlay && (overlay.dataset.lang !== lang() || overlay.dataset.live !== String(live))) { overlay.remove(); overlay = null; }
    if (overlay) { overlay.hidden=false; if (live) refreshNativePrices(); return live; }
    injectStyle(); priceEls=new Map();
    overlay=create('div',{className:'zsb-overlay'}); overlay.dataset.lang=lang(); overlay.dataset.live=String(live);
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    const card=create('div',{className:'zsb-card'}); const head=create('div',{className:'zsb-head'}); const titleWrap=create('div');
    if (live) titleWrap.append(create('div',{className:'zsb-title',text:t('title')}),create('div',{className:'zsb-sub',text:t('sub')}));
    else titleWrap.append(create('div',{className:'zsb-title',text:t('comingTitle',{date:openDateLabel()})}),create('div',{className:'zsb-sub',text:t('comingSub')}));
    const close=create('button',{className:'zsb-close','aria-label':t('close'),text:'×'}); close.type='button'; close.addEventListener('click',hide);
    head.append(titleWrap,close); card.appendChild(head);
    const grid=create('div',{className:'zsb-plans'});
    for (const plan of PLAN_CODES) {
      const box=create('div',{className:'zsb-plan'});
      box.append(create('div',{className:'zsb-plan-name',text:t(plan)}),priceRow(plan),create('div',{className:'zsb-trial',text:t('trialInfo',{days:trialDays()})}));
      if (live) { const button=create('button',{className:'zsb-buy',text:t('subscribe')}); button.type='button'; button.dataset.plan=plan; button.addEventListener('click',()=>{startPlan(plan).catch(()=>{});}); box.appendChild(button); }
      grid.appendChild(box);
    }
    card.appendChild(grid);
    if (live) {
      card.appendChild(create('p',{className:'zsb-renewal',text:renewalNotice()}));
      const actions=create('div',{className:'zsb-actions'});
      if (platform()==='ios' || platform()==='android') { const restoreBtn=create('button',{className:'zsb-action',text:t('restore')}); restoreBtn.type='button'; restoreBtn.addEventListener('click',()=>{restore().catch(()=>{});}); actions.appendChild(restoreBtn); }
      if (platform()==='web') { const manageBtn=create('button',{className:'zsb-action',text:t('manage')}); manageBtn.type='button'; manageBtn.addEventListener('click',()=>{manage().catch(()=>{});}); actions.appendChild(manageBtn); }
      if (actions.childNodes.length) card.appendChild(actions);
      statusEl=create('div',{className:'zsb-status'}); card.appendChild(statusEl);
    }
    const legal=legalLinks(); if (legal.childNodes.length) card.appendChild(legal);
    overlay.appendChild(card); overlay.addEventListener('click',(e)=>{if(e.target===overlay) hide();});
    document.body.appendChild(overlay); if (live) refreshNativePrices(); return live;
  }
  function mount() { if (document.querySelector('[data-zstudio-billing-trigger]')) return false; injectStyle(); const button=create('button',{className:'zsb-trigger','data-zstudio-billing-trigger':'v1',text:t('plans')}); button.type='button'; button.addEventListener('click',open); document.getElementById('langSwitch')?.addEventListener('change',()=>setTimeout(()=>{button.textContent=t('plans');},0)); document.addEventListener('keydown',(e)=>{ if (e.key==='Escape' && overlay && !overlay.hidden) hide(); }); const header=document.querySelector('header'); const narrow=global.matchMedia?.('(max-width: 620px)');
    // Ecrã largo: junto aos controlos do cabeçalho (antes de Entrar). Telemóvel (≤620px,
    // cabeçalho mobile em grelha): linha própria no fim do cabeçalho.
    const place=()=>{ const langSwitch=document.getElementById('langSwitch'); if (langSwitch?.parentElement && !narrow?.matches) { button.className='btn btn-line zsb-trigger'; langSwitch.parentElement.insertBefore(button, document.getElementById('zstudioAuthButton') || langSwitch); } else if (header) { button.className='zsb-trigger'; header.appendChild(button); } };
    if (header) { place(); narrow?.addEventListener?.('change',place); setTimeout(place,0); } else { button.style.position='fixed'; button.style.right='16px'; button.style.bottom='16px'; button.style.zIndex='1300'; document.body.appendChild(button); } return true; }
  global.ZStudioBilling=Object.freeze({enabled,platform,open,close:hide,mount,startPlan,restore,manage,openDate:SUBSCRIPTIONS_OPEN_DATE});
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true}); else mount();
})(window);
