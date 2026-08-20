import { loadWebStripeWebhookConfig } from '../../lib/config.js';
import { resolveWebPlan } from '../../lib/store-products.js';
import { buildVerifiedCommercialWriterArgs } from '../../lib/commercial-event-adapter.js';
import { createCommercialWriterClient } from '../../lib/commercial-writer-client.js';
import { createWebCheckoutPreflightClient } from '../../lib/web-checkout-preflight-client.js';
import { createStripeWebCurrentStateClient } from '../../lib/stripe-web-current-state.js';
import { createWebReconciliationClient } from '../../lib/web-reconciliation-client.js';
import { verifyStripeWebhookTrigger } from '../../lib/stripe-webhook-signature.js';
import { reconcileStripeWebTrigger } from '../../lib/stripe-web-reconciliation.js';
import { createStripeWebhookHttpHandler } from '../../lib/stripe-webhook-http.js';

// Vercel must preserve the exact Stripe-signed request bytes.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default createStripeWebhookHttpHandler({
  loadConfig: () => loadWebStripeWebhookConfig(process.env),
  verifyTrigger: verifyStripeWebhookTrigger,
  reconcileTrigger: reconcileStripeWebTrigger,
  createStripeClient: (runtimeConfig) =>
    createStripeWebCurrentStateClient(runtimeConfig),
  createIdentityClient: (runtimeConfig) =>
    createWebReconciliationClient(runtimeConfig),
  createWriterClient: (runtimeConfig) =>
    createCommercialWriterClient(runtimeConfig),
  createPreflightClient: (runtimeConfig) =>
    createWebCheckoutPreflightClient(runtimeConfig),
  resolvePlan: resolveWebPlan,
  buildWriterArgs: buildVerifiedCommercialWriterArgs,
});
