const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../www/google-play-billing-bridge.js'), 'utf8');

function localStorage() {
  const values = new Map();
  return {
    getItem: (k) => values.has(k) ? values.get(k) : null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
}

function context({ request, purchases = [] } = {}) {
  const purchaseCalls = [];
  const listeners = {};
  const win = {
    state: { lang: 'pt' },
    localStorage: localStorage(),
    dispatchEvent() {},
    ZStudioAuth: { getAccessToken: async () => 'user-token' },
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: {
        CapacitorHttp: { request: request || (async () => ({ status: 500, data: {} })) },
        ZStudioPlayBilling: {
          purchase: async (args) => { purchaseCalls.push(args); return { launched: true }; },
          loadProducts: async () => ({ products: [] }),
          currentPurchases: async () => ({ purchases }),
          addListener: async (name, cb) => { listeners[name] = cb; return { remove: async () => {} }; },
        },
      },
    },
  };
  win.window = win;
  const doc = {
    documentElement: { lang: 'pt' },
    getElementById: () => null,
  };
  vm.runInNewContext(source, {
    window: win,
    document: doc,
    URL,
    CustomEvent: class { constructor(name, options) { this.type = name; this.detail = options?.detail; } },
    console,
    setTimeout,
    clearTimeout,
  });
  return { win, purchaseCalls, listeners };
}

test('commercial runtime URL is fail-closed and HTTPS-only', () => {
  const { win } = context();
  assert.equal(win.ZStudioGooglePlay.configure({ baseUrl: '' }).configured, false);
  assert.throws(() => win.ZStudioGooglePlay.configure({ baseUrl: 'http://example.com' }), /GOOGLE_PLAY_RUNTIME_URL_INVALID/);
  assert.equal(win.ZStudioGooglePlay.configure({ baseUrl: 'https://commercial.example.com/' }).baseUrl, 'https://commercial.example.com');
});

test('purchase uses server-decided trial and canonical ZOS UUID', async () => {
  const requests = [];
  const personId = '11111111-1111-4111-8111-111111111111';
  const intentId = '22222222-2222-4222-8222-222222222222';
  const { win, purchaseCalls } = context({
    request: async (options) => {
      requests.push(options);
      return {
        status: 200,
        data: {
          ok: true,
          purchase_intent_id: intentId,
          obfuscated_account_id: personId,
          plan_code: 'monthly',
          use_trial_offer: true,
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      };
    },
  });
  win.ZStudioGooglePlay.configure({ baseUrl: 'https://commercial.example.com' });
  await win.ZStudioGooglePlay.startPurchase('monthly');
  assert.equal(requests[0].url, 'https://commercial.example.com/api/google/play/prepare');
  assert.equal(requests[0].headers.Authorization, 'Bearer user-token');
  assert.equal(JSON.stringify(purchaseCalls[0]), JSON.stringify({
    basePlanId: 'monthly',
    useTrialOffer: true,
    obfuscatedAccountId: personId,
  }));
});

test('restore after reinstall needs no local purchase intent and never persists raw token', async () => {
  const rawToken = 'raw-purchase-token-123';
  const seen = [];
  const purchase = {
    evidence: 'google_play_device_purchase',
    purchaseToken: rawToken,
    products: ['zstudio.access'],
    purchaseState: 'purchased',
    obfuscatedAccountId: '11111111-1111-4111-8111-111111111111',
    rawProviderPayloadIncluded: false,
  };
  const { win } = context({
    purchases: [purchase],
    request: async (options) => {
      seen.push(options);
      return { status: 200, data: { ok: true, purchase_state: 'processed', plan_code: 'monthly' } };
    },
  });
  win.ZStudioGooglePlay.configure({ baseUrl: 'https://commercial.example.com' });
  const result = await win.ZStudioGooglePlay.restoreCurrentPurchases();
  assert.equal(result.result, 'restored');
  assert.equal(seen[0].url, 'https://commercial.example.com/api/google/play/restore');
  assert.equal(seen[0].data.purchase_token, rawToken);
  const persisted = win.localStorage.getItem('zstudio_google_play_pending_intent_v1');
  assert.equal(persisted, null);
});
