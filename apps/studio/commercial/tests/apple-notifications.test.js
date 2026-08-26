import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AutoRenewStatus,
  Environment,
  NotificationTypeV2,
  Subtype,
} from '@apple/app-store-server-library';
import { verifyAppleNotificationV2 } from '../lib/apple-notifications.js';

const personId = 'a1111111-b222-c333-d444-e55555555555';
const otherPersonId = 'b1111111-b222-c333-d444-e55555555555';
const notificationUUID = '11111111-2222-4333-8444-555555555555';
const originalTransactionId = '2000000000000000';
const transactionId = '2000000000000005';
const productId =
  'com.zoperatingsystem.zstudio.subscription.monthly';

const sandboxConfig = Object.freeze({
  environment: 'sandbox',
  bundleId: 'com.zoperatingsystem.zstudio',
  appAppleId: null,
  issuerId: 'test-issuer',
  keyId: 'test-key',
  privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceRole: 'test-only-not-a-real-secret',
});

function notification(overrides = {}) {
  return {
    notificationUUID,
    notificationType: NotificationTypeV2.DID_RENEW,
    subtype: Subtype.BILLING_RECOVERY,
    version: '2.0',
    signedDate: 1789761900000,
    data: {
      appAppleId: 1234567890,
      bundleId: sandboxConfig.bundleId,
      environment: Environment.SANDBOX,
      signedTransactionInfo: 'notification-transaction-jws',
      signedRenewalInfo: 'notification-renewal-jws',
    },
    ...overrides,
  };
}

function decodedTransaction(overrides = {}) {
  return {
    bundleId: sandboxConfig.bundleId,
    environment: Environment.SANDBOX,
    inAppOwnershipType: 'PURCHASED',
    transactionId,
    originalTransactionId,
    productId,
    appAccountToken: personId,
    signedDate: 1789761800000,
    purchaseDate: 1789761600000,
    originalPurchaseDate: 1787169500000,
    expiresDate: 1792440000000,
    transactionReason: 'RENEWAL',
    ...overrides,
  };
}

function decodedRenewal(overrides = {}) {
  return {
    environment: Environment.SANDBOX,
    originalTransactionId,
    appAccountToken: personId,
    productId,
    autoRenewProductId: productId,
    autoRenewStatus: AutoRenewStatus.ON,
    signedDate: 1789761850000,
    ...overrides,
  };
}

function fakeVerifier({
  outer = notification(),
  transaction = decodedTransaction(),
  renewal = decodedRenewal(),
  notificationError = null,
  transactionError = null,
  renewalError = null,
} = {}) {
  return {
    async verifyAndDecodeNotification(value) {
      assert.equal(value, 'outer-notification-jws');
      if (notificationError) throw notificationError;
      return outer;
    },
    async verifyAndDecodeTransaction(value) {
      assert.equal(value, 'notification-transaction-jws');
      if (transactionError) throw transactionError;
      return transaction;
    },
    async verifyAndDecodeRenewalInfo(value) {
      assert.equal(value, 'notification-renewal-jws');
      if (renewalError) throw renewalError;
      return renewal;
    },
  };
}

test('verified subscription notification becomes reconciliation trigger with notification UUID idempotency', async () => {
  const result = await verifyAppleNotificationV2(
    'outer-notification-jws',
    sandboxConfig,
    { verifier: fakeVerifier() },
  );

  assert.equal(result.verification, 'verified_notification');
  assert.equal(result.notificationUUID, notificationUUID);
  assert.equal(result.notificationType, NotificationTypeV2.DID_RENEW);
  assert.equal(result.subtype, Subtype.BILLING_RECOVERY);
  assert.equal(result.sourceEventRef, `notification:${notificationUUID}`);
  assert.equal(result.personId, personId);
  assert.equal(result.transactionId, transactionId);
  assert.equal(result.originalTransactionId, originalTransactionId);
  assert.equal(result.productId, productId);
  assert.equal(result.planCode, 'monthly');
  assert.equal(result.autoRenewProductId, productId);
  assert.equal(result.autoRenewStatus, AutoRenewStatus.ON);
  assert.equal(result.effectiveAtMs, 1789761900000);
  assert.equal(result.reconciliationRequired, true);
  assert.equal(result.rawJwsIncluded, false);
});

test('notification signedDate, not inner JWS date, is the reconciliation effective time', async () => {
  const result = await verifyAppleNotificationV2(
    'outer-notification-jws',
    sandboxConfig,
    {
      verifier: fakeVerifier({
        outer: notification({ signedDate: 1789761999999 }),
        transaction: decodedTransaction({ signedDate: 1789762999999 }),
        renewal: decodedRenewal({ signedDate: 1789763999999 }),
      }),
    },
  );

  assert.equal(result.effectiveAtMs, 1789761999999);
  assert.equal(result.transactionSignedDate, 1789762999999);
  assert.equal(result.renewalSignedDate, 1789763999999);
});

test('TEST notification verifies without fabricating subscription state', async () => {
  const result = await verifyAppleNotificationV2(
    'outer-notification-jws',
    sandboxConfig,
    {
      verifier: fakeVerifier({
        outer: notification({
          notificationType: NotificationTypeV2.TEST,
          subtype: undefined,
          data: undefined,
        }),
      }),
    },
  );

  assert.equal(result.verification, 'verified_notification_test');
  assert.equal(result.notificationType, NotificationTypeV2.TEST);
  assert.equal(result.reconciliationRequired, false);
  assert.equal('personId' in result, false);
  assert.equal('productId' in result, false);
});

test('outer signedPayload verification failure fails closed', async () => {
  await assert.rejects(
    () => verifyAppleNotificationV2(
      'outer-notification-jws',
      sandboxConfig,
      {
        verifier: fakeVerifier({
          notificationError: new Error('bad signature'),
        }),
      },
    ),
    /APPLE_SIGNED_NOTIFICATION_UNVERIFIED/,
  );
});

test('subscription notification requires verified transaction and renewal JWS', async () => {
  await assert.rejects(
    () => verifyAppleNotificationV2(
      'outer-notification-jws',
      sandboxConfig,
      {
        verifier: fakeVerifier({
          transactionError: new Error('bad transaction'),
        }),
      },
    ),
    /APPLE_SIGNED_TRANSACTION_UNVERIFIED/,
  );

  await assert.rejects(
    () => verifyAppleNotificationV2(
      'outer-notification-jws',
      sandboxConfig,
      {
        verifier: fakeVerifier({
          renewalError: new Error('bad renewal'),
        }),
      },
    ),
    /APPLE_NOTIFICATION_SIGNED_RENEWAL_UNVERIFIED/,
  );
});

test('transaction and renewal must bind to the same original transaction and canonical appAccountToken', async () => {
  await assert.rejects(
    () => verifyAppleNotificationV2(
      'outer-notification-jws',
      sandboxConfig,
      {
        verifier: fakeVerifier({
          renewal: decodedRenewal({
            originalTransactionId: '2000000000000099',
          }),
        }),
      },
    ),
    /APPLE_NOTIFICATION_ORIGINAL_TRANSACTION_ID_MISMATCH/,
  );

  await assert.rejects(
    () => verifyAppleNotificationV2(
      'outer-notification-jws',
      sandboxConfig,
      {
        verifier: fakeVerifier({
          renewal: decodedRenewal({
            appAccountToken: otherPersonId,
          }),
        }),
      },
    ),
    /APPLE_NOTIFICATION_APP_ACCOUNT_TOKEN_MISMATCH/,
  );
});

test('unsupported notification families and malformed V2 identity metadata fail closed', async () => {
  const cases = [
    [
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      /APPLE_NOTIFICATION_TYPE_UNSUPPORTED/,
    ],
    [
      notification({ notificationUUID: 'not-a-uuid' }),
      /APPLE_NOTIFICATION_UUID_INVALID/,
    ],
    [
      notification({ version: '1.0' }),
      /APPLE_NOTIFICATION_VERSION_UNSUPPORTED/,
    ],
    [
      notification({ signedDate: -1 }),
      /APPLE_NOTIFICATION_SIGNED_DATE_INVALID/,
    ],
    [
      notification({ data: { ...notification().data, bundleId: 'com.example.other' } }),
      /APPLE_NOTIFICATION_BUNDLE_ID_INVALID/,
    ],
    [
      notification({ data: { ...notification().data, environment: Environment.PRODUCTION } }),
      /APPLE_NOTIFICATION_ENVIRONMENT_INVALID/,
    ],
    [
      notification({ data: { ...notification().data, signedTransactionInfo: '' } }),
      /APPLE_NOTIFICATION_SIGNED_TRANSACTION_REQUIRED/,
    ],
    [
      notification({ data: { ...notification().data, signedRenewalInfo: '' } }),
      /APPLE_NOTIFICATION_SIGNED_RENEWAL_REQUIRED/,
    ],
  ];

  for (const [outer, expected] of cases) {
    await assert.rejects(
      () => verifyAppleNotificationV2(
        'outer-notification-jws',
        sandboxConfig,
        { verifier: fakeVerifier({ outer }) },
      ),
      expected,
    );
  }
});

test('production notification requires exact appAppleId in verified data', async () => {
  const productionConfig = {
    ...sandboxConfig,
    environment: 'production',
    appAppleId: '1234567890',
  };

  const productionOuter = notification({
    data: {
      ...notification().data,
      environment: Environment.PRODUCTION,
      appAppleId: 1234567891,
    },
  });

  await assert.rejects(
    () => verifyAppleNotificationV2(
      'outer-notification-jws',
      productionConfig,
      {
        verifier: fakeVerifier({
          outer: productionOuter,
          transaction: decodedTransaction({
            environment: Environment.PRODUCTION,
          }),
          renewal: decodedRenewal({
            environment: Environment.PRODUCTION,
          }),
        }),
      },
    ),
    /APPLE_NOTIFICATION_APP_APPLE_ID_INVALID/,
  );
});

test('family-shared notification transaction remains forbidden by existing Apple transaction authority', async () => {
  await assert.rejects(
    () => verifyAppleNotificationV2(
      'outer-notification-jws',
      sandboxConfig,
      {
        verifier: fakeVerifier({
          transaction: decodedTransaction({
            inAppOwnershipType: 'FAMILY_SHARED',
          }),
        }),
      },
    ),
    /APPLE_FAMILY_SHARING_NOT_SUPPORTED/,
  );
});

test('verified notification output never contains raw JWS or decoded Apple payloads', async () => {
  const result = await verifyAppleNotificationV2(
    'outer-notification-jws',
    sandboxConfig,
    { verifier: fakeVerifier() },
  );
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes('outer-notification-jws'), false);
  assert.equal(serialized.includes('notification-transaction-jws'), false);
  assert.equal(serialized.includes('notification-renewal-jws'), false);
  assert.equal('decodedNotification' in result, false);
  assert.equal('decodedTransaction' in result, false);
  assert.equal('decodedRenewal' in result, false);
});
