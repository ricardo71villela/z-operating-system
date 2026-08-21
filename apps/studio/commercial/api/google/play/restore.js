import { loadGooglePlayCommercialConfig } from '../../../lib/google-play-config.js';
import { createGooglePlayAccessTokenClient } from '../../../lib/google-play-auth.js';
import { createGooglePlayCurrentStateClient } from '../../../lib/google-play-current-state.js';
import { createGooglePlayAuthorityClient } from '../../../lib/google-play-authority-client.js';
import { createGooglePlayRtdnAuthorityClient } from '../../../lib/google-play-rtdn-authority-client.js';
import { createCommercialWriterClient } from '../../../lib/commercial-writer-client.js';
import { validateSupabaseBearerAndResolvePerson } from '../../../lib/apple-device-reconcile-http.js';
import {
  googlePlayCurrentStateRequiresOrder,
  normalizeGooglePlayCommercialState,
} from '../../../lib/google-play-commercial-state.js';
import { createGooglePlayRestoreHttpHandler } from '../../../lib/google-play-restore-http.js';

function loadEndpointConfig() {
  const base = loadGooglePlayCommercialConfig(process.env);
  const supabasePublishableKey = String(
    process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
  ).trim();
  if (!supabasePublishableKey) {
    throw new Error('ZSTUDIO_GOOGLE_PLAY_CONFIG_MISSING:SUPABASE_PUBLISHABLE_KEY');
  }
  return Object.freeze({ ...base, supabasePublishableKey });
}

export default createGooglePlayRestoreHttpHandler({
  loadConfig: loadEndpointConfig,
  resolvePerson: validateSupabaseBearerAndResolvePerson,
  createCurrentStateClient: (config) => {
    const authClient = createGooglePlayAccessTokenClient(config);
    return createGooglePlayCurrentStateClient(config, { authClient });
  },
  createRtdnAuthorityClient: createGooglePlayRtdnAuthorityClient,
  createPurchaseAuthorityClient: createGooglePlayAuthorityClient,
  createWriterClient: createCommercialWriterClient,
  normalizeState: normalizeGooglePlayCommercialState,
  requiresOrder: googlePlayCurrentStateRequiresOrder,
});
