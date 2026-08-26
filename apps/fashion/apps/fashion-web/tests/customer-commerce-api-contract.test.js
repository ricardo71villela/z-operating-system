'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'customer-commerce-api.js'), 'utf8');

function createRuntime({ config = {}, fetchImpl } = {}) {
  const calls = [];
  const window = {
    location: { origin: 'https://preview.zfashion.test' },
    ZFashionCustomerCommerceConfig: config,
    fetch: fetchImpl || (async (...args) => {
      calls.push(args);
      return { ok: true, status: 200, async json() { return {}; } };
    }),
  };
  const context = vm.createContext({ window, URL, console });
  vm.runInContext(source, context, { filename: 'customer-commerce-api.js' });
  return { api: window.ZFashionCustomerCommerceApi, window, calls };
}

async function rejectsCode(promiseFactory, code) {
  await assert.rejects(promiseFactory, (err) => err && err.code === code);
}

async function run() {
  {
    const { api, calls, window } = createRuntime();
    assert.strictEqual(window.Z_FASHION_CUSTOMER_COMMERCE_API, 'FAIL_CLOSED_ADAPTER_V1');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(api.status())), {
      enabled: false,
      configured: false,
      baseUrlConfigured: false,
      authProviderConfigured: false,
    });
    await rejectsCode(() => api.listOrders(), 'commerce_disabled');
    assert.strictEqual(calls.length, 0, 'disabled adapter must not make a network request');
  }

  {
    const { api, calls } = createRuntime({
      config: { enabled: true, baseUrl: 'https://api.zfashion.test' },
    });
    await rejectsCode(() => api.listOrders(), 'commerce_not_configured');
    assert.strictEqual(calls.length, 0);
  }

  {
    const { api, calls } = createRuntime({
      config: {
        enabled: true,
        baseUrl: 'http://api.zfashion.test',
        getAccessToken: async () => 'token',
      },
    });
    await rejectsCode(() => api.listOrders(), 'insecure_api_url');
    assert.strictEqual(calls.length, 0);
  }

  {
    const calls = [];
    const { api } = createRuntime({
      config: {
        enabled: true,
        baseUrl: 'https://api.zfashion.test',
        getAccessToken: async () => 'client-access-token',
      },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/me/cart')) {
          return { ok: true, status: 201, async json() { return { cart: { id: 'cart-1' } }; } };
        }
        if (url.endsWith('/me/cart/cart-1/items')) {
          return { ok: true, status: 201, async json() { return { item: { productId: 'product-1', quantity: 2 } }; } };
        }
        if (url.endsWith('/checkout-preflight')) {
          return { ok: true, status: 200, async json() { return { preflight: { ready: true } }; } };
        }
        if (url.endsWith('/checkout')) {
          return { ok: true, status: 201, async json() { return { order: { id: 'order-1', status: 'pending_payment' } }; } };
        }
        if (url.endsWith('/me/orders/order-1')) {
          return { ok: true, status: 200, async json() { return { order: { id: 'order-1' } }; } };
        }
        return { ok: true, status: 200, async json() { return { orders: [{ id: 'order-1' }] }; } };
      },
    });

    const cart = await api.createCart();
    assert.strictEqual(cart.id, 'cart-1');
    await api.addCartItem('cart-1', { productId: 'product-1', quantity: 2, partnerId: 'ignored', unitPriceMinorUnits: 1 });
    const addRequest = calls.find((entry) => entry.url.endsWith('/items'));
    assert.deepStrictEqual(JSON.parse(addRequest.options.body), { productId: 'product-1', quantity: 2 });
    assert.strictEqual(addRequest.options.headers.Authorization, 'Bearer client-access-token');
    assert.strictEqual(addRequest.options.credentials, 'omit');

    const preflight = await api.checkoutPreflight('cart-1');
    assert.strictEqual(preflight.ready, true);

    await rejectsCode(() => api.checkout('cart-1'), 'idempotency_key_required');
    const order = await api.checkout('cart-1', { idempotencyKey: 'stable-checkout-key-0001' });
    assert.strictEqual(order.status, 'pending_payment');
    const checkoutRequest = calls.find((entry) => entry.url.endsWith('/checkout'));
    assert.strictEqual(checkoutRequest.options.headers['Idempotency-Key'], 'stable-checkout-key-0001');

    const orders = await api.listOrders();
    assert.strictEqual(orders.length, 1);
    const fetched = await api.getOrder('order-1');
    assert.strictEqual(fetched.id, 'order-1');
  }

  {
    const { api } = createRuntime({
      config: {
        enabled: true,
        baseUrl: 'https://api.zfashion.test',
        getAccessToken: async () => '',
      },
    });
    await rejectsCode(() => api.listOrders(), 'authentication_required');
  }

  {
    const { api } = createRuntime({
      config: {
        enabled: true,
        baseUrl: 'https://api.zfashion.test',
        getAccessToken: async () => 'token',
      },
      fetchImpl: async () => ({
        ok: false,
        status: 409,
        async json() { return { error: 'checkout_preflight_failed', message: 'Checkout preflight failed' }; },
      }),
    });
    await assert.rejects(
      () => api.checkoutPreflight('cart-1'),
      (err) => err && err.code === 'checkout_preflight_failed' && err.status === 409
    );
  }

  console.log('Z_FASHION_CUSTOMER_COMMERCE_API_CONTRACT=PASS');
}

run().catch((err) => { console.error(err); process.exit(1); });
