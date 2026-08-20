import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadWebStripeWebhookConfig,
  loadWebCommercialConfig,
} from '../lib/config.js';

const shared = {
  STRIPE_ENVIRONMENT: 'sandbox',
  STRIPE_SECRET_KEY: 'sk_test_example',
  STRIPE_WEBHOOK_SECRET: 'whsec_example123',
  STRIPE_PRICE_WEEKLY: 'price_weekly123',
  STRIPE_PRICE_MONTHLY: 'price_monthly123',
  STRIPE_PRICE_ANNUAL: 'price_annual123',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
};

test('webhook config requires only server reconciliation authority, not browser checkout config', () => {
  const config = loadWebStripeWebhookConfig(shared);
  assert.equal(config.environment, 'sandbox');
  assert.equal(config.stripeWebhookSecret, 'whsec_example123');
  assert.equal(config.supabaseSecretKey, 'sb_secret_test');
  assert.deepEqual(config.priceByPlan, {
    weekly: 'price_weekly123',
    monthly: 'price_monthly123',
    annual: 'price_annual123',
  });
  assert.equal('supabasePublishableKey' in config, false);
  assert.equal('successUrl' in config, false);
  assert.equal('cancelUrl' in config, false);
});

test('checkout config remains independent of webhook secret', () => {
  const checkoutEnv = {
    ...shared,
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    STRIPE_SUCCESS_URL: 'https://zstudio.space/billing/success',
    STRIPE_CANCEL_URL: 'https://zstudio.space/billing/cancel',
  };
  delete checkoutEnv.STRIPE_WEBHOOK_SECRET;
  const config = loadWebCommercialConfig(checkoutEnv);
  assert.equal(config.environment, 'sandbox');
  assert.equal('stripeWebhookSecret' in config, false);
});

test('webhook secret and environment-specific Stripe secret fail closed', () => {
  assert.throws(
    () => loadWebStripeWebhookConfig({ ...shared, STRIPE_WEBHOOK_SECRET: 'bad' }),
    /STRIPE_WEBHOOK_SECRET/,
  );
  assert.throws(
    () => loadWebStripeWebhookConfig({ ...shared, STRIPE_SECRET_KEY: 'sk_live_wrong' }),
    /STRIPE_SECRET_KEY/,
  );
});
