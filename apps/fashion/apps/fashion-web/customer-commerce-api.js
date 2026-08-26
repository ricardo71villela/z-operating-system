(() => {
  'use strict';

  class CustomerCommerceError extends Error {
    constructor(code, message, status = null, details = null) {
      super(message);
      this.name = 'CustomerCommerceError';
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }

  const runtimeConfig = () => {
    const source = window.ZFashionCustomerCommerceConfig || {};
    const baseUrl = String(source.baseUrl || '').trim().replace(/\/$/, '');
    return Object.freeze({
      enabled: source.enabled === true,
      baseUrl,
      getAccessToken: typeof source.getAccessToken === 'function' ? source.getAccessToken : null,
    });
  };

  const status = () => {
    const config = runtimeConfig();
    return Object.freeze({
      enabled: config.enabled,
      configured: Boolean(config.baseUrl && config.getAccessToken),
      baseUrlConfigured: Boolean(config.baseUrl),
      authProviderConfigured: Boolean(config.getAccessToken),
    });
  };

  const requireEnabledConfig = () => {
    const config = runtimeConfig();
    if (!config.enabled) {
      throw new CustomerCommerceError('commerce_disabled', 'Z Fashion customer commerce is disabled for this client runtime.');
    }
    if (!config.baseUrl || !config.getAccessToken) {
      throw new CustomerCommerceError('commerce_not_configured', 'Z Fashion customer commerce runtime is incomplete.');
    }
    let url;
    try {
      url = new URL(config.baseUrl, window.location?.origin || 'https://zfashion.invalid');
    } catch {
      throw new CustomerCommerceError('invalid_api_url', 'Z Fashion customer commerce API URL is invalid.');
    }
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localHttp) {
      throw new CustomerCommerceError('insecure_api_url', 'Z Fashion customer commerce API must use HTTPS outside local development.');
    }
    return { ...config, resolvedBaseUrl: url.toString().replace(/\/$/, '') };
  };

  const accessToken = async (config) => {
    const token = String(await config.getAccessToken() || '').trim();
    if (!token) {
      throw new CustomerCommerceError('authentication_required', 'A valid authenticated Z Fashion Client session is required.');
    }
    return token;
  };

  const parseResponse = async (response) => {
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      throw new CustomerCommerceError(
        body?.error || 'commerce_request_failed',
        body?.message || 'Z Fashion customer commerce request failed.',
        response.status,
        body
      );
    }
    return body || {};
  };

  const request = async (path, { method = 'GET', body, idempotencyKey } = {}) => {
    const config = requireEnabledConfig();
    const token = await accessToken(config);
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    let response;
    try {
      response = await window.fetch(`${config.resolvedBaseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
      });
    } catch {
      throw new CustomerCommerceError('commerce_unavailable', 'Z Fashion customer commerce service is temporarily unavailable.');
    }
    return parseResponse(response);
  };

  const createCart = async () => (await request('/me/cart', { method: 'POST' })).cart;

  const addCartItem = async (cartId, { productId, quantity = 1 } = {}) => {
    if (!cartId) throw new CustomerCommerceError('cart_required', 'cartId is required.');
    if (!productId) throw new CustomerCommerceError('product_required', 'productId is required.');
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new CustomerCommerceError('invalid_quantity', 'quantity must be a positive integer.');
    }
    return (await request(`/me/cart/${encodeURIComponent(cartId)}/items`, {
      method: 'POST',
      body: { productId, quantity },
    })).item;
  };

  const checkoutPreflight = async (cartId) => {
    if (!cartId) throw new CustomerCommerceError('cart_required', 'cartId is required.');
    return (await request(`/me/cart/${encodeURIComponent(cartId)}/checkout-preflight`)).preflight;
  };

  const checkout = async (cartId, { idempotencyKey } = {}) => {
    if (!cartId) throw new CustomerCommerceError('cart_required', 'cartId is required.');
    const key = String(idempotencyKey || '').trim();
    if (key.length < 8 || key.length > 200) {
      throw new CustomerCommerceError('idempotency_key_required', 'A stable 8..200 character Idempotency-Key is required for checkout.');
    }
    return (await request(`/me/cart/${encodeURIComponent(cartId)}/checkout`, {
      method: 'POST',
      idempotencyKey: key,
    })).order;
  };

  const listOrders = async () => (await request('/me/orders')).orders || [];

  const getOrder = async (orderId) => {
    if (!orderId) throw new CustomerCommerceError('order_required', 'orderId is required.');
    return (await request(`/me/orders/${encodeURIComponent(orderId)}`)).order;
  };

  window.ZFashionCustomerCommerceApi = Object.freeze({
    status,
    createCart,
    addCartItem,
    checkoutPreflight,
    checkout,
    listOrders,
    getOrder,
    CustomerCommerceError,
  });
  window.Z_FASHION_CUSTOMER_COMMERCE_API = 'FAIL_CLOSED_ADAPTER_V1';
})();
