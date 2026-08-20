import { loadGooglePlayCommercialConfig } from '../../../lib/google-play-config.js';
import { createGooglePlayAccessTokenClient } from '../../../lib/google-play-auth.js';
import { createGooglePlayCurrentStateClient } from '../../../lib/google-play-current-state.js';
import { createGooglePlayAuthorityClient } from '../../../lib/google-play-authority-client.js';
import { createCommercialWriterClient } from '../../../lib/commercial-writer-client.js';
import { createGooglePlayDeviceReconcileHttpHandler } from '../../../lib/google-play-device-reconcile-http.js';

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

export default createGooglePlayDeviceReconcileHttpHandler({
  loadConfig: loadEndpointConfig,
  createCurrentStateClient: (config) => {
    const authClient = createGooglePlayAccessTokenClient(config);
    return createGooglePlayCurrentStateClient(config, { authClient });
  },
  createAuthorityClient: (config) => createGooglePlayAuthorityClient(config),
  createWriterClient: (config) => createCommercialWriterClient(config),
});
