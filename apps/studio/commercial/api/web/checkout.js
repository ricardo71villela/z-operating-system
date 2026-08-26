import { loadWebCommercialConfig } from '../../lib/config.js';
import { resolveWebPlan } from '../../lib/store-products.js';
import { createWebCheckoutPreflightClient } from '../../lib/web-checkout-preflight-client.js';
import { createStripeWebApi } from '../../lib/stripe-web-api.js';
import { createWebCheckoutHttpHandler } from '../../lib/web-checkout-http.js';

export default createWebCheckoutHttpHandler({
  loadConfig: () => loadWebCommercialConfig(process.env),
  createPreflightClient: (config) => createWebCheckoutPreflightClient(config),
  createStripeClient: (config) => createStripeWebApi(config),
  resolvePlan: resolveWebPlan,
});
