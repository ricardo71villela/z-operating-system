import { loadGooglePlayRtdnConfig } from '../../../lib/google-play-config.js';
import { createGooglePlayAccessTokenClient } from '../../../lib/google-play-auth.js';
import { createGooglePlayCurrentStateClient } from '../../../lib/google-play-current-state.js';
import { createGooglePlayAuthorityClient } from '../../../lib/google-play-authority-client.js';
import { createCommercialWriterClient } from '../../../lib/commercial-writer-client.js';
import { verifyGooglePubSubOidcAuthorization } from '../../../lib/google-play-rtdn-auth.js';
import { parseGooglePlayRtdnEnvelope } from '../../../lib/google-play-rtdn-parser.js';
import { createGooglePlayRtdnAuthorityClient } from '../../../lib/google-play-rtdn-authority-client.js';
import { reconcileGooglePlayRtdn } from '../../../lib/google-play-rtdn-reconciliation.js';
import { createGooglePlayRtdnHttpHandler } from '../../../lib/google-play-rtdn-http.js';

export default createGooglePlayRtdnHttpHandler({
  loadConfig: () => loadGooglePlayRtdnConfig(process.env),
  verifyOidc: verifyGooglePubSubOidcAuthorization,
  parseEnvelope: parseGooglePlayRtdnEnvelope,
  createCurrentStateClient: (config) => createGooglePlayCurrentStateClient(
    config,
    { authClient: createGooglePlayAccessTokenClient(config) },
  ),
  createRtdnAuthorityClient: createGooglePlayRtdnAuthorityClient,
  createPurchaseAuthorityClient: createGooglePlayAuthorityClient,
  createWriterClient: createCommercialWriterClient,
  reconcileRtdn: reconcileGooglePlayRtdn,
});
