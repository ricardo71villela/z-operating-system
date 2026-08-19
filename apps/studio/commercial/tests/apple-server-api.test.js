import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  AutoRenewStatus,
  Environment,
  OfferDiscountType,
  Status,
} from '@apple/app-store-server-library';
import { loadAppleCommercialConfig } from '../lib/config.js';
import {
  createAppleServerApiClient,
  reconcileAppleCurrentSubscription,
} from '../lib/apple-server-api.js';

const sandboxConfig = loadAppleCommercialConfig({
  APPLE_ENVIRONMENT: 'sandbox',
  APPLE_BUNDLE_ID: 'com.zoperatingsystem.zstudio',
  APPLE_ISSUER_ID: 'test-issuer',
  APPLE_KEY_ID: 'test-key',
  APPLE_PRIVATE_KEY:
    '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
});

const token = 'a1111111-b222-c333-d444-e55555555555';
const originalTransactionId = '2000000000000000';
const deviceTransactionId = '2000000000000001';
const currentTransactionId = '2000000000000005';
const monthlyProduct =
  'com.zoperatingsystem.zstudio.subscription.monthly';

const deviceEvidence = Object.freeze({
  verification: 'verified',
  transactionId: deviceTransactionId,
  originalTransactionId,
  productId: monthlyProduct,
  planCode: 'monthly',
  appAccountToken: token,
  bundleId: 'com.zoperatingsystem.zstudio',
  environment: 'sandbox',
});

function makeFixture({
  status = Status.ACTIVE,
  autoRenewStatus = AutoRenewStatus.ON,
  currentTransaction = {},
  renewal = {},
  statusResponse = {},
  lastTransactions,
  serverDeviceTransaction = {},
} = {}) {
  const deviceDecoded = {
    transactionId: deviceTransactionId,
    originalTransactionId,
    bundleId: 'com.zoperatingsystem.zstudio',
    productId: monthlyProduct,
    appAccountToken: token,
    purchaseDate: 1787169600000,
    originalPurchaseDate: 1787169500000,
    expiresDate: 1789761600000,
    signedDate: 1787169700000,
    environment: Environment.SANDBOX,
    inAppOwnershipType: 'PURCHASED',
    transactionReason: 'PURCHASE',
    ...serverDeviceTransaction,
  };

  const currentDecoded = {
    transactionId: currentTransactionId,
    originalTransactionId,
    bundleId: 'com.zoperatingsystem.zstudio',
    productId: monthlyProduct,
    appAccountToken: token,
    purchaseDate: 1789761600000,
    originalPurchaseDate: 1787169500000,
    expiresDate: 1792440000000,
    signedDate: 1789761700000,
    environment: Environment.SANDBOX,
    inAppOwnershipType: 'PURCHASED',
    transactionReason: 'RENEWAL',
    ...currentTransaction,
  };

  const renewalDecoded = {
    originalTransactionId,
    productId: monthlyProduct,
    autoRenewProductId: monthlyProduct,
    autoRenewStatus,
    appAccountToken: token,
    signedDate: 1789761800000,
    renewalDate: 1792440000000,
    environment: Environment.SANDBOX,
    ...renewal,
  };

  const verifier = {
    async verifyAndDecodeTransaction(jws) {
      if (jws === 'server-device-jws') return deviceDecoded;
      if (jws === 'current-transaction-jws') return currentDecoded;
      throw new Error(`unexpected transaction JWS: ${jws}`);
    },
    async verifyAndDecodeRenewalInfo(jws) {
      if (jws === 'current-renewal-jws') return renewalDecoded;
      throw new Error(`unexpected renewal JWS: ${jws}`);
    },
  };

  const calls = [];
  const defaultItems = [{
    status,
    originalTransactionId,
    signedTransactionInfo: 'current-transaction-jws',
    signedRenewalInfo: 'current-renewal-jws',
  }];

  const client = {
    async getTransactionInfo(transactionId) {
      calls.push(['getTransactionInfo', transactionId]);
      return { signedTransactionInfo: 'server-device-jws' };
    },
    async getAllSubscriptionStatuses(anyTransactionId, filter) {
      calls.push([
        'getAllSubscriptionStatuses',
        anyTransactionId,
        filter,
      ]);
      return {
        environment: Environment.SANDBOX,
        bundleId: 'com.zoperatingsystem.zstudio',
        appAppleId: 1234567890,
        data: [{
          subscriptionGroupIdentifier: '12345678',
          lastTransactions: lastTransactions ?? defaultItems,
        }],
        ...statusResponse,
      };
    },
  };

  return {
    client,
    verifier,
    calls,
    deviceDecoded,
    currentDecoded,
    renewalDecoded,
  };
}

test('constructs AppStoreServerAPIClient with exact Apple server credentials and environment', () => {
  let args;
  class CapturingClient {
    constructor(...values) {
      args = values;
    }
  }

  const client = createAppleServerApiClient(sandboxConfig, {
    ClientClass: CapturingClient,
  });

  assert.ok(client instanceof CapturingClient);
  assert.deepEqual(args, [
    sandboxConfig.privateKey,
    sandboxConfig.keyId,
    sandboxConfig.issuerId,
    'com.zoperatingsystem.zstudio',
    Environment.SANDBOX,
  ]);
});

test('reconciles exact device transaction against Apple transaction info and current subscription status', async () => {
  const fixture = makeFixture();
  const result = await reconcileAppleCurrentSubscription(
    deviceEvidence,
    sandboxConfig,
    fixture,
  );

  assert.deepEqual(fixture.calls, [
    ['getTransactionInfo', deviceTransactionId],
    [
      'getAllSubscriptionStatuses',
      originalTransactionId,
      undefined,
    ],
  ]);

  assert.equal(result.verification, 'verified_current_state');
  assert.equal(result.billingSource, 'apple_app_store');
  assert.equal(result.billingEnvironment, 'sandbox');
  assert.equal(result.sourceSubscriptionRef, originalTransactionId);
  assert.equal(result.sourceProductRef, monthlyProduct);
  assert.equal(result.personId, token);
  assert.equal(result.planCode, 'monthly');
  assert.equal(result.normalizedStatus, 'active');
  assert.equal(result.appleStatus, Status.ACTIVE);
  assert.equal(result.cancelAtPeriodEnd, false);
  assert.equal(result.subscriptionGroupIdentifier, '12345678');
  assert.equal(result.currentPeriodStartMs, 1789761600000);
  assert.equal(result.currentPeriodEndMs, 1792440000000);
  assert.equal(result.effectiveAtMs, 1789761800000);
  assert.equal(result.rawJwsIncluded, false);
  assert.equal('signedTransactionInfo' in result, false);
  assert.equal('signedRenewalInfo' in result, false);

  const expectedHash = createHash('sha256')
    .update('current-transaction-jws\ncurrent-renewal-jws')
    .digest('hex');
  assert.equal(result.sourceEventRef, `app:${expectedHash}`);
});

test('active free trial maps to trialing with exact trial window', async () => {
  const fixture = makeFixture({
    currentTransaction: {
      offerDiscountType: OfferDiscountType.FREE_TRIAL,
    },
  });

  const result = await reconcileAppleCurrentSubscription(
    deviceEvidence,
    sandboxConfig,
    fixture,
  );

  assert.equal(result.normalizedStatus, 'trialing');
  assert.equal(result.trialStartedAtMs, 1787169500000);
  assert.equal(result.trialEndsAtMs, 1792440000000);
  assert.equal(result.currentPeriodStartMs, null);
  assert.equal(result.currentPeriodEndMs, null);
});

test('renewal disabled preserves current active access and sets cancel-at-period-end', async () => {
  const fixture = makeFixture({
    autoRenewStatus: AutoRenewStatus.OFF,
  });

  const result = await reconcileAppleCurrentSubscription(
    deviceEvidence,
    sandboxConfig,
    fixture,
  );

  assert.equal(result.normalizedStatus, 'active');
  assert.equal(result.cancelAtPeriodEnd, true);
  assert.equal(result.currentPeriodEndMs, 1792440000000);
});

test('Apple status matrix maps to provider-neutral current access without terminal Apple revoke', async () => {
  const cases = [
    [Status.EXPIRED, 'expired', {}],
    [Status.BILLING_RETRY, 'past_due', {}],
    [
      Status.BILLING_GRACE_PERIOD,
      'grace',
      { gracePeriodExpiresDate: 1792526400000 },
    ],
    [Status.REVOKED, 'expired', {}],
  ];

  for (const [status, expectedStatus, renewal] of cases) {
    const fixture = makeFixture({ status, renewal });
    const result = await reconcileAppleCurrentSubscription(
      deviceEvidence,
      sandboxConfig,
      fixture,
    );

    assert.equal(result.normalizedStatus, expectedStatus);
    assert.notEqual(result.normalizedStatus, 'revoked');
    assert.equal(
      result.appleRevokedEquivalent,
      status === Status.REVOKED,
    );

    if (status === Status.BILLING_GRACE_PERIOD) {
      assert.equal(result.currentPeriodEndMs, 1792526400000);
    } else {
      assert.equal(result.currentPeriodStartMs, null);
      assert.equal(result.currentPeriodEndMs, null);
    }
  }
});

test('grace status without verified grace expiry fails closed', async () => {
  const fixture = makeFixture({
    status: Status.BILLING_GRACE_PERIOD,
  });

  await assert.rejects(
    () => reconcileAppleCurrentSubscription(
      deviceEvidence,
      sandboxConfig,
      fixture,
    ),
    /APPLE_GRACE_PERIOD_EXPIRES_DATE_REQUIRED/,
  );
});

test('server transaction info must match exact device transaction identity', async () => {
  const cases = [
    [{ transactionId: '2000000000000099' }, /DEVICE_TRANSACTION_ID_MISMATCH/],
    [{ originalTransactionId: '2000000000000098' }, /DEVICE_ORIGINAL_TRANSACTION_ID_MISMATCH/],
    [{ productId: 'com.zoperatingsystem.zstudio.subscription.weekly' }, /DEVICE_PRODUCT_ID_MISMATCH/],
    [{ appAccountToken: 'f1111111-b222-c333-d444-e55555555555' }, /DEVICE_APP_ACCOUNT_TOKEN_MISMATCH/],
  ];

  for (const [serverDeviceTransaction, expected] of cases) {
    const fixture = makeFixture({ serverDeviceTransaction });
    await assert.rejects(
      () => reconcileAppleCurrentSubscription(
        deviceEvidence,
        sandboxConfig,
        fixture,
      ),
      expected,
    );
  }
});

test('current transaction and renewal must remain bound to canonical original transaction and person', async () => {
  const cases = [
    [
      { currentTransaction: { originalTransactionId: '2000000000000099' } },
      /CURRENT_ORIGINAL_TRANSACTION_ID_MISMATCH/,
    ],
    [
      { renewal: { originalTransactionId: '2000000000000099' } },
      /RENEWAL_ORIGINAL_TRANSACTION_ID_MISMATCH/,
    ],
    [
      { currentTransaction: { appAccountToken: 'f1111111-b222-c333-d444-e55555555555' } },
      /CURRENT_APP_ACCOUNT_TOKEN_MISMATCH/,
    ],
    [
      { renewal: { appAccountToken: 'f1111111-b222-c333-d444-e55555555555' } },
      /RENEWAL_APP_ACCOUNT_TOKEN_MISMATCH/,
    ],
  ];

  for (const [patch, expected] of cases) {
    const fixture = makeFixture(patch);
    await assert.rejects(
      () => reconcileAppleCurrentSubscription(
        deviceEvidence,
        sandboxConfig,
        fixture,
      ),
      expected,
    );
  }
});

test('status response identity and exact subscription-chain selection fail closed', async () => {
  const wrongBundle = makeFixture({
    statusResponse: { bundleId: 'com.example.other' },
  });
  await assert.rejects(
    () => reconcileAppleCurrentSubscription(
      deviceEvidence,
      sandboxConfig,
      wrongBundle,
    ),
    /APPLE_STATUS_RESPONSE_BUNDLE_ID_INVALID/,
  );

  const wrongEnvironment = makeFixture({
    statusResponse: { environment: Environment.PRODUCTION },
  });
  await assert.rejects(
    () => reconcileAppleCurrentSubscription(
      deviceEvidence,
      sandboxConfig,
      wrongEnvironment,
    ),
    /APPLE_STATUS_RESPONSE_ENVIRONMENT_INVALID/,
  );

  const missingChain = makeFixture({
    lastTransactions: [{
      status: Status.ACTIVE,
      originalTransactionId: '2000000000000099',
      signedTransactionInfo: 'current-transaction-jws',
      signedRenewalInfo: 'current-renewal-jws',
    }],
  });
  await assert.rejects(
    () => reconcileAppleCurrentSubscription(
      deviceEvidence,
      sandboxConfig,
      missingChain,
    ),
    /APPLE_SUBSCRIPTION_CHAIN_NOT_FOUND/,
  );

  const item = {
    status: Status.ACTIVE,
    originalTransactionId,
    signedTransactionInfo: 'current-transaction-jws',
    signedRenewalInfo: 'current-renewal-jws',
  };
  const ambiguousChain = makeFixture({
    lastTransactions: [item, { ...item }],
  });
  await assert.rejects(
    () => reconcileAppleCurrentSubscription(
      deviceEvidence,
      sandboxConfig,
      ambiguousChain,
    ),
    /APPLE_SUBSCRIPTION_CHAIN_AMBIGUOUS/,
  );
});

test('unknown current or renewal products fail closed against frozen catalog', async () => {
  const unknownCurrent = makeFixture({
    currentTransaction: {
      productId: 'com.example.not-authorized',
    },
  });
  await assert.rejects(
    () => reconcileAppleCurrentSubscription(
      deviceEvidence,
      sandboxConfig,
      unknownCurrent,
    ),
    /APPLE_PRODUCT_NOT_AUTHORIZED/,
  );

  const unknownRenewal = makeFixture({
    renewal: {
      autoRenewProductId: 'com.example.not-authorized',
    },
  });
  await assert.rejects(
    () => reconcileAppleCurrentSubscription(
      deviceEvidence,
      sandboxConfig,
      unknownRenewal,
    ),
    /APPLE_PRODUCT_NOT_AUTHORIZED/,
  );
});
