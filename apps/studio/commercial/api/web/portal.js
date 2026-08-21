import { loadWebCommercialConfig } from '../../lib/config.js';
import { createWebPortalAuthorityClient } from '../../lib/web-portal-authority-client.js';
import { createStripeWebPortalApi } from '../../lib/stripe-web-portal-api.js';
import { createWebPortalHttpHandler } from '../../lib/web-portal-http.js';

export default createWebPortalHttpHandler({
  loadConfig: () => loadWebCommercialConfig(process.env),
  createAuthorityClient: createWebPortalAuthorityClient,
  createStripePortalClient: createStripeWebPortalApi,
});
