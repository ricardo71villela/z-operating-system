import { loadGooglePlayCommercialConfig } from '../../../lib/google-play-config.js';
import { resolveGooglePlayPlan } from '../../../lib/store-products.js';
import { createGooglePlayPreflightClient } from '../../../lib/google-play-preflight-client.js';
import { createGooglePlayPreflightHttpHandler } from '../../../lib/google-play-preflight-http.js';

function loadEndpointConfig() {
  const config = loadGooglePlayCommercialConfig(process.env);
  const supabasePublishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (!supabasePublishableKey) {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_MISSING:SUPABASE_PUBLISHABLE_KEY');
  }
  return Object.freeze({ ...config, supabasePublishableKey });
}

export default createGooglePlayPreflightHttpHandler({
  loadConfig: loadEndpointConfig,
  createClient: createGooglePlayPreflightClient,
  resolvePlan: resolveGooglePlayPlan,
});
