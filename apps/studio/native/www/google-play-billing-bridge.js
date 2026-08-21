(function installZStudioGooglePlay(global) {
  'use strict';

  const PRODUCT_ID = 'zstudio.access';
  const PLAN_CODES = new Set(['weekly', 'monthly', 'annual']);
  const STORAGE_KEY = 'zstudio_google_play_pending_intent_v1';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TOKEN_RE = /^[^\s\u0000-\u001f\u007f]{1,4096}$/;

  let commercialBaseUrl = '';
  let listenerInstalled = false;
  let restorePromise = null;

  function error(code, details) {
    const value = new Error(code);
    value.code = code;
    if (details) Object.assign(value, details);
    return value;
  }

  function normalizeBaseUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let url;
    try { url = new URL(raw); }
    catch { throw error('GOOGLE_PLAY_RUNTIME_URL_INVALID'); }
    if (
      url.protocol !== 'https:' || url.username || url.password
      || url.search || url.hash || (url.pathname && url.pathname !== '/')
    ) throw error('GOOGLE_PLAY_RUNTIME_URL_INVALID');
    return url.origin;
  }

  function configure(options) {
    commercialBaseUrl = normalizeBaseUrl(options?.baseUrl || '');
    return Object.freeze({ configured: !!commercialBaseUrl, baseUrl: commercialBaseUrl });
  }

  function plugins() { return global.Capacitor?.Plugins || null; }
  function billing() { return plugins()?.ZStudioPlayBilling || null; }
  function http() { return plugins()?.CapacitorHttp || null; }
  function isAndroidNative() {
    return global.Capacitor?.isNativePlatform?.() === true
      && global.Capacitor?.getPlatform?.() === 'android';
  }
  function isAvailable() { return isAndroidNative() && !!billing(); }

  async function accessToken(interactive) {
    const token = await global.ZStudioAuth?.getAccessToken?.({ interactive: !!interactive });
    if (!token) throw error('AUTH_REQUIRED');
    return token;
  }

  function parseHttpData(value) {
    if (value && typeof value === 'object') return value;
    if (typeof value === 'string' && value.trim()) {
      try { return JSON.parse(value); } catch {}
    }
    return null;
  }

  async function post(path, data, { interactive = false } = {}) {
    if (!commercialBaseUrl) throw error('GOOGLE_PLAY_RUNTIME_UNCONFIGURED');
    const client = http();
    if (!client?.request) throw error('GOOGLE_PLAY_NATIVE_HTTP_UNAVAILABLE');
    const token = await accessToken(interactive);
    let response;
    try {
      response = await client.request({
        url: commercialBaseUrl + path,
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        data,
        responseType: 'json',
        connectTimeout: 10000,
        readTimeout: 15000,
      });
    } catch (cause) {
      throw error('GOOGLE_PLAY_RUNTIME_UNAVAILABLE', { retryable: true, cause });
    }
    const status = Number(response?.status || 0);
    const payload = parseHttpData(response?.data);
    if (status < 200 || status >= 300) {
      throw error(payload?.code || 'GOOGLE_PLAY_RUNTIME_REQUEST_FAILED', {
        httpStatus: status,
        retryable: status === 408 || status === 425 || status === 429 || status >= 500,
      });
    }
    if (!payload || typeof payload !== 'object') throw error('GOOGLE_PLAY_RUNTIME_RESPONSE_INVALID');
    return payload;
  }

  function validateIntent(value, planCode) {
    if (!value || value.ok !== true) throw error('GOOGLE_PLAY_PREFLIGHT_INVALID');
    const intentId = String(value.purchase_intent_id || '').toLowerCase();
    const personId = String(value.obfuscated_account_id || '').toLowerCase();
    if (!UUID_RE.test(intentId) || !UUID_RE.test(personId)) throw error('GOOGLE_PLAY_PREFLIGHT_ID_INVALID');
    if (!PLAN_CODES.has(planCode) || value.plan_code !== planCode) throw error('GOOGLE_PLAY_PREFLIGHT_PLAN_MISMATCH');
    if (typeof value.use_trial_offer !== 'boolean') throw error('GOOGLE_PLAY_PREFLIGHT_TRIAL_INVALID');
    const expiresAt = Date.parse(String(value.expires_at || ''));
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw error('GOOGLE_PLAY_PREFLIGHT_EXPIRED');
    return Object.freeze({
      intentId,
      personId,
      planCode,
      useTrialOffer: value.use_trial_offer,
      expiresAt,
    });
  }

  function persistIntent(value) {
    global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
  }
  function readIntent() {
    let raw = null;
    try { raw = global.localStorage?.getItem(STORAGE_KEY); } catch {}
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (!UUID_RE.test(value.intentId) || !UUID_RE.test(value.personId)) return null;
      if (!PLAN_CODES.has(value.planCode) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) return null;
      return value;
    } catch { return null; }
  }
  function clearIntent() { try { global.localStorage?.removeItem(STORAGE_KEY); } catch {} }

  function validatePurchase(value) {
    if (!value || value.evidence !== 'google_play_device_purchase' || value.rawProviderPayloadIncluded !== false) {
      throw error('GOOGLE_PLAY_DEVICE_EVIDENCE_INVALID');
    }
    const purchaseToken = String(value.purchaseToken || '');
    if (!TOKEN_RE.test(purchaseToken)) throw error('GOOGLE_PLAY_DEVICE_TOKEN_INVALID');
    const products = Array.isArray(value.products) ? value.products : [];
    if (products.length !== 1 || products[0] !== PRODUCT_ID) throw error('GOOGLE_PLAY_DEVICE_PRODUCT_INVALID');
    return { ...value, purchaseToken };
  }

  async function loadProducts() {
    if (!isAvailable()) throw error('GOOGLE_PLAY_NATIVE_UNAVAILABLE');
    return billing().loadProducts();
  }

  async function startPurchase(planCode) {
    if (!isAvailable()) throw error('GOOGLE_PLAY_NATIVE_UNAVAILABLE');
    if (!PLAN_CODES.has(planCode)) throw error('GOOGLE_PLAY_PLAN_INVALID');
    const intent = validateIntent(
      await post('/api/google/play/prepare', { plan_code: planCode }, { interactive: true }),
      planCode,
    );
    persistIntent(intent);
    return billing().purchase({
      basePlanId: intent.planCode,
      useTrialOffer: intent.useTrialOffer,
      obfuscatedAccountId: intent.personId,
    });
  }

  async function reconcilePurchase(purchase, { interactive = false } = {}) {
    const verified = validatePurchase(purchase);
    const intent = readIntent();
    let path = '/api/google/play/restore';
    let data = { purchase_token: verified.purchaseToken };
    if (
      intent && (
        verified.obfuscatedAccountId == null
        || intent.personId === String(verified.obfuscatedAccountId).toLowerCase()
      )
    ) {
      path = '/api/google/play/reconcile';
      data = { purchase_intent_id: intent.intentId, purchase_token: verified.purchaseToken };
    }
    try {
      const result = await post(path, data, { interactive });
      if (result.purchase_state === 'processed' || result.purchase_state === 'canceled') clearIntent();
      return result;
    } catch (cause) {
      if (path.endsWith('/reconcile') && cause?.httpStatus === 409) {
        const result = await post('/api/google/play/restore', { purchase_token: verified.purchaseToken }, { interactive });
        if (result.purchase_state === 'processed' || result.purchase_state === 'canceled') clearIntent();
        return result;
      }
      throw cause;
    }
  }

  async function restorePurchase(purchase, options) {
    return reconcilePurchase(purchase, options);
  }

  async function restoreCurrentPurchases() {
    if (restorePromise) return restorePromise;
    restorePromise = (async () => {
      if (!commercialBaseUrl || !isAvailable()) return Object.freeze({ result: 'skipped' });
      const token = await global.ZStudioAuth?.getAccessToken?.({ interactive: false });
      if (!token) return Object.freeze({ result: 'signed_out' });
      const current = await billing().currentPurchases();
      const list = Array.isArray(current?.purchases) ? current.purchases : [];
      const results = [];
      for (const purchase of list) {
        try { results.push(await reconcilePurchase(purchase, { interactive: false })); }
        catch (cause) { results.push({ error: cause?.code || 'GOOGLE_PLAY_RESTORE_FAILED' }); }
      }
      return Object.freeze({ result: 'restored', count: list.length, results });
    })().finally(() => { restorePromise = null; });
    return restorePromise;
  }

  async function onPurchaseUpdated(update) {
    const list = Array.isArray(update?.purchases) ? update.purchases : [];
    for (const purchase of list) {
      try { await reconcilePurchase(purchase, { interactive: false }); }
      catch {}
    }
  }

  async function installListener() {
    if (listenerInstalled || !isAvailable()) return;
    listenerInstalled = true;
    try { await billing().addListener('purchaseUpdated', onPurchaseUpdated); }
    catch { listenerInstalled = false; }
  }

  async function onNativeResume() {
    if (!isAndroidNative()) return Object.freeze({ result: 'not_android' });
    if (global.ZSTUDIO_COMMERCIAL_BASE_URL !== undefined) {
      try { configure({ baseUrl: global.ZSTUDIO_COMMERCIAL_BASE_URL }); }
      catch { commercialBaseUrl = ''; }
    }
    await installListener();
    try { return await restoreCurrentPurchases(); }
    catch { return Object.freeze({ result: 'error' }); }
  }

  global.ZStudioGooglePlay = Object.freeze({
    configure,
    isAvailable,
    loadProducts,
    startPurchase,
    restoreCurrentPurchases,
    reconcilePurchase,
    restorePurchase,
    onNativeResume,
  });

  if (global.ZSTUDIO_COMMERCIAL_BASE_URL) {
    try { configure({ baseUrl: global.ZSTUDIO_COMMERCIAL_BASE_URL }); } catch {}
  }
})(window);
