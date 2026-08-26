import { loadAppleCommercialConfig } from '../../lib/config.js';
import { resolveWebPlan, resolveAppleProduct } from '../../lib/store-products.js';
import { createApplePurchaseAuthorityClient } from '../../lib/apple-purchase-authority-client.js';
import { createApplePurchasePreflightHttpHandler } from '../../lib/apple-purchase-preflight-http.js';

function resolveApplePlan(planCode) {
  const web = resolveWebPlan(planCode);
  const productId = `com.zoperatingsystem.zstudio.subscription.${web.planCode}`;
  const apple = resolveAppleProduct(productId);
  return Object.freeze({ ...web, productId: apple.productId });
}
function loadEndpointConfig() {
  const base = loadAppleCommercialConfig(process.env);
  const supabasePublishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (!supabasePublishableKey) throw new Error('ZSTUDIO_COMMERCIAL_CONFIG_MISSING:SUPABASE_PUBLISHABLE_KEY');
  return Object.freeze({ ...base, supabasePublishableKey });
}

export default createApplePurchasePreflightHttpHandler({
  loadConfig: loadEndpointConfig,
  createAuthorityClient: createApplePurchaseAuthorityClient,
  resolvePlan: resolveApplePlan,
});
