// Z Studio — Apple StoreKit lifecycle bridge v1.
// Runs in every build but activates only inside the native iOS Capacitor shell.
(function installZStudioApple(global) {
  'use strict';
  const PLANS = new Set(['weekly','monthly','annual']);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TX_RE = /^\d{1,40}$/;
  const APP_TX_RE = /^[^\s\u0000-\u001f\u007f]{1,256}$/;
  let commercialBaseUrl = '';
  let listenerInstalled = false;
  let restorePromise = null;

  function error(code, details) { const e = new Error(code); e.code = code; if (details) Object.assign(e, details); return e; }
  function normalizeBaseUrl(value) {
    const raw = String(value || '').trim(); if (!raw) return '';
    let url; try { url = new URL(raw); } catch { throw error('APPLE_RUNTIME_URL_INVALID'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) throw error('APPLE_RUNTIME_URL_INVALID');
    return url.origin;
  }
  function configure(options) { commercialBaseUrl = normalizeBaseUrl(options?.baseUrl || ''); return Object.freeze({configured:!!commercialBaseUrl,baseUrl:commercialBaseUrl}); }
  function plugins() { return global.Capacitor?.Plugins || null; }
  function store() { return plugins()?.ZStudioStoreKit || null; }
  function http() { return plugins()?.CapacitorHttp || null; }
  function isAvailable() { return global.Capacitor?.isNativePlatform?.() === true && global.Capacitor?.getPlatform?.() === 'ios' && !!store(); }

  async function accessToken(interactive) {
    const token = await global.ZStudioAuth?.getAccessToken?.({interactive:!!interactive});
    if (!token) throw error('AUTH_REQUIRED');
    return token;
  }
  function parseHttpData(value) {
    if (value && typeof value === 'object') return value;
    if (typeof value === 'string' && value.trim()) { try { return JSON.parse(value); } catch {} }
    return null;
  }
  async function post(path, data, {interactive=false}={}) {
    if (!commercialBaseUrl) throw error('APPLE_RUNTIME_UNCONFIGURED');
    const token = await accessToken(interactive);
    const nativeHttp = http();
    let status, payload;
    try {
      if (nativeHttp?.request) {
        const response = await nativeHttp.request({
          url:commercialBaseUrl+path, method:'POST',
          headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},
          data, responseType:'json', connectTimeout:10000, readTimeout:15000,
        });
        status = Number(response?.status || 0); payload = parseHttpData(response?.data);
      } else {
        const response = await fetch(commercialBaseUrl+path,{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(data)});
        status = response.status; payload = await response.json().catch(()=>null);
      }
    } catch (cause) { throw error('APPLE_RUNTIME_UNAVAILABLE',{retryable:true,cause}); }
    if (status < 200 || status >= 300) throw error(payload?.code || 'APPLE_RUNTIME_REQUEST_FAILED',{httpStatus:status,retryable:status===408||status===425||status===429||status>=500});
    if (!payload || typeof payload !== 'object') throw error('APPLE_RUNTIME_RESPONSE_INVALID');
    return payload;
  }

  function catalog() { return global.ZStudioCommercialConfig?.plans || {}; }
  function productId(planCode) {
    if (!PLANS.has(planCode)) throw error('APPLE_PLAN_INVALID');
    const value = String(catalog()?.[planCode]?.appleProductId || '').trim();
    if (!value) throw error('APPLE_PRODUCT_UNCONFIGURED');
    return value;
  }
  async function loadProducts() {
    if (!isAvailable()) throw error('APPLE_NATIVE_UNAVAILABLE');
    return store().loadProducts({productIds:[...PLANS].map(productId)});
  }
  async function appTransactionId() {
    if (!isAvailable()) throw error('APPLE_NATIVE_UNAVAILABLE');
    const value = await store().appTransaction();
    const id = String(value?.appTransactionId || '').trim();
    if (value?.verification !== 'verified' || !APP_TX_RE.test(id)) throw error('APPLE_APP_TRANSACTION_INVALID');
    return id;
  }
  function validatePrepared(value, planCode, expectedProduct) {
    const intentId = String(value?.purchase_intent_id || '').toLowerCase();
    const personId = String(value?.app_account_token || '').toLowerCase();
    const jws = String(value?.introductory_offer_eligibility_jws || '');
    const expiresAt = Date.parse(String(value?.expires_at || ''));
    if (value?.ok !== true || !UUID_RE.test(intentId) || !UUID_RE.test(personId) || value.plan_code !== planCode || value.product_id !== expectedProduct) throw error('APPLE_PREFLIGHT_INVALID');
    if (typeof value.trial_eligible !== 'boolean' || jws.split('.').length !== 3 || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw error('APPLE_PREFLIGHT_INVALID');
    return Object.freeze({intentId,personId,planCode,productId:expectedProduct,trialEligible:value.trial_eligible,eligibilityJws:jws,expiresAt});
  }
  async function prepare(planCode) {
    const expectedProduct = productId(planCode);
    const transactionId = await appTransactionId();
    return validatePrepared(await post('/api/apple/prepare',{plan_code:planCode,app_transaction_id:transactionId},{interactive:true}),planCode,expectedProduct);
  }
  function validateTransaction(tx) {
    if (!tx || tx.verification !== 'verified' || !TX_RE.test(String(tx.transactionId||'')) || !TX_RE.test(String(tx.originalTransactionId||''))) throw error('APPLE_DEVICE_EVIDENCE_INVALID');
    const jws = String(tx.jwsRepresentation || ''); if (jws.split('.').length !== 3 || jws.length > 65536) throw error('APPLE_DEVICE_EVIDENCE_INVALID');
    return tx;
  }
  async function reconcileTransaction(tx, {intentId=null,interactive=false}={}) {
    const value = validateTransaction(tx);
    const data = {jwsRepresentation:value.jwsRepresentation};
    if (intentId) data.purchase_intent_id = intentId;
    const result = await post('/api/apple/reconcile',data,{interactive});
    const finishId = String(result?.finish_transaction_id || '');
    if (result?.ok !== true || !TX_RE.test(finishId)) throw error('APPLE_RECONCILE_INVALID');
    await store().finishTransaction({transactionId:finishId});
    return result;
  }
  async function startPurchase(planCode) {
    if (!isAvailable()) throw error('APPLE_NATIVE_UNAVAILABLE');
    const prepared = await prepare(planCode);
    const result = await store().purchase({
      productId:prepared.productId,
      appAccountToken:prepared.personId,
      introductoryOfferEligibilityJws:prepared.eligibilityJws,
    });
    if (result?.status !== 'verified') return result;
    return reconcileTransaction(result.transaction,{intentId:prepared.intentId,interactive:false});
  }
  async function restoreCurrentPurchases({sync=false,interactive=false}={}) {
    if (restorePromise) return restorePromise;
    restorePromise = (async()=>{
      if (!commercialBaseUrl || !isAvailable()) return Object.freeze({result:'skipped'});
      const token = await global.ZStudioAuth?.getAccessToken?.({interactive:!!interactive});
      if (!token) return Object.freeze({result:'signed_out'});
      if (sync) await store().syncPurchases();
      const unfinished = await store().unfinishedTransactions();
      const current = await store().currentEntitlements();
      const byId = new Map();
      for (const tx of [...(unfinished?.transactions||[]),...(current?.transactions||[])]) byId.set(String(tx.transactionId||''),tx);
      const results=[];
      for (const tx of byId.values()) { try { results.push(await reconcileTransaction(tx,{interactive:false})); } catch (cause) { results.push({error:cause?.code||'APPLE_RESTORE_FAILED'}); } }
      return Object.freeze({result:'restored',count:byId.size,results});
    })().finally(()=>{restorePromise=null;});
    return restorePromise;
  }
  async function installListener() {
    if (listenerInstalled || !isAvailable()) return;
    listenerInstalled = true;
    try { await store().addListener('transactionUpdated',(tx)=>{ reconcileTransaction(tx,{interactive:false}).catch(()=>{}); }); }
    catch { listenerInstalled=false; }
  }
  async function onNativeResume() {
    if (!isAvailable()) return Object.freeze({result:'not_ios'});
    if (global.ZSTUDIO_COMMERCIAL_BASE_URL !== undefined) { try { configure({baseUrl:global.ZSTUDIO_COMMERCIAL_BASE_URL}); } catch { commercialBaseUrl=''; } }
    await installListener();
    try { return await restoreCurrentPurchases(); } catch { return Object.freeze({result:'error'}); }
  }

  global.ZStudioApple = Object.freeze({configure,isAvailable,loadProducts,startPurchase,restoreCurrentPurchases,reconcileTransaction,onNativeResume});
  if (global.ZSTUDIO_COMMERCIAL_BASE_URL) { try { configure({baseUrl:global.ZSTUDIO_COMMERCIAL_BASE_URL}); } catch {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>{onNativeResume();},{once:true}); else onNativeResume();
})(window);
