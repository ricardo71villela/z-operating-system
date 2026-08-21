import { loadAppleCommercialConfig } from '../../lib/config.js';
import { verifyAppleTransactionJWS } from '../../lib/apple-signed-data.js';
import { reconcileAppleCurrentSubscription } from '../../lib/apple-server-api.js';
import { applyAppleCurrentStateCommercialEvent } from '../../lib/commercial-writer-client.js';
import { createApplePurchaseAuthorityClient } from '../../lib/apple-purchase-authority-client.js';
import { createAppleDeviceReconcileHttpHandler } from '../../lib/apple-device-reconcile-http.js';

function loadEndpointConfig() {
  const base = loadAppleCommercialConfig(process.env);
  const supabasePublishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (!supabasePublishableKey) throw new Error('ZSTUDIO_COMMERCIAL_CONFIG_MISSING:SUPABASE_PUBLISHABLE_KEY');
  return Object.freeze({ ...base, supabasePublishableKey });
}

export default createAppleDeviceReconcileHttpHandler({
  loadConfig: loadEndpointConfig,
  verifyTransaction: verifyAppleTransactionJWS,
  reconcileCurrentState: reconcileAppleCurrentSubscription,
  applyCommercialEvent: applyAppleCurrentStateCommercialEvent,
  createPurchaseAuthorityClient: createApplePurchaseAuthorityClient,
});
