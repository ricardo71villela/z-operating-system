import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Environment,
} from '@apple/app-store-server-library';
import { loadAppleCommercialConfig } from '../lib/config.js';
import {
  createAppleSignedDataVerifier,
  loadAppleRootCertificates,
  verifyAppleTransactionJWS,
} from '../lib/apple-signed-data.js';

const sandboxConfig = loadAppleCommercialConfig({
  APPLE_ENVIRONMENT: 'sandbox',
  APPLE_BUNDLE_ID: 'com.zoperatingsystem.zstudio',
  APPLE_ISSUER_ID: 'test-issuer',
  APPLE_KEY_ID: 'test-key',
  APPLE_PRIVATE_KEY:
    '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE: 'test-only-not-a-real-secret',
});

const canonicalDecodedTransaction = Object.freeze({
  transactionId: '2000000000000001',
  originalTransactionId: '2000000000000000',
  bundleId: 'com.zoperatingsystem.zstudio',
  productId: 'com.zoperatingsystem.zstudio.subscription.monthly',
  appAccountToken: 'A1111111-B222-C333-D444-E55555555555',
  purchaseDate: 1787169600000,
  originalPurchaseDate: 1787169500000,
  expiresDate: 1789761600000,
  signedDate: 1787169700000,
  environment: Environment.SANDBOX,
  inAppOwnershipType: 'PURCHASED',
  transactionReason: 'PURCHASE',
});

test('loads exactly three hash-pinned Apple PKI root certificates', () => {
  const roots = loadAppleRootCertificates();
  assert.equal(roots.length, 3);
  for (const root of roots) {
    assert.ok(Buffer.isBuffer(root));
    assert.ok(root.length > 0);
  }
});

test('constructs SignedDataVerifier with online checks, exact environment, and bundle authority', () => {
  let captured;
  class CapturingVerifier {
    constructor(...args) {
      captured = args;
    }
  }

  const roots = [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')];
  const verifier = createAppleSignedDataVerifier(sandboxConfig, {
    rootCertificates: roots,
    VerifierClass: CapturingVerifier,
  });

  assert.ok(verifier instanceof CapturingVerifier);
  assert.equal(captured[0], roots);
  assert.equal(captured[1], true);
  assert.equal(captured[2], Environment.SANDBOX);
  assert.equal(captured[3], 'com.zoperatingsystem.zstudio');
  assert.equal(captured[4], undefined);
});

test('production verifier requires a positive safe numeric Apple app id', () => {
  const roots = [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')];
  class CapturingVerifier {
    constructor(...args) {
      this.args = args;
    }
  }

  const config = loadAppleCommercialConfig({
    APPLE_ENVIRONMENT: 'production',
    APPLE_BUNDLE_ID: 'com.zoperatingsystem.zstudio',
    APPLE_APP_APPLE_ID: '1234567890',
    APPLE_ISSUER_ID: 'test-issuer',
    APPLE_KEY_ID: 'test-key',
    APPLE_PRIVATE_KEY:
      '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE: 'test-only-not-a-real-secret',
  });

  const verifier = createAppleSignedDataVerifier(config, {
    rootCertificates: roots,
    VerifierClass: CapturingVerifier,
  });

  assert.equal(verifier.args[2], Environment.PRODUCTION);
  assert.equal(verifier.args[4], 1234567890);
});

test('online certificate checks cannot be disabled', () => {
  assert.throws(
    () => createAppleSignedDataVerifier(sandboxConfig, {
      rootCertificates: [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')],
      enableOnlineChecks: false,
    }),
    /APPLE_ONLINE_CHECKS_REQUIRED/,
  );
});

test('verified transaction is reduced to canonical Z Studio commercial evidence', async () => {
  const verifier = {
    async verifyAndDecodeTransaction(value) {
      assert.equal(value, 'signed-transaction');
      return canonicalDecodedTransaction;
    },
  };

  const result = await verifyAppleTransactionJWS(
    ' signed-transaction ',
    sandboxConfig,
    { verifier },
  );

  assert.deepEqual(
    {
      verification: result.verification,
      transactionId: result.transactionId,
      originalTransactionId: result.originalTransactionId,
      productId: result.productId,
      planCode: result.planCode,
      appAccountToken: result.appAccountToken,
      bundleId: result.bundleId,
      environment: result.environment,
      inAppOwnershipType: result.inAppOwnershipType,
    },
    {
      verification: 'verified',
      transactionId: '2000000000000001',
      originalTransactionId: '2000000000000000',
      productId: 'com.zoperatingsystem.zstudio.subscription.monthly',
      planCode: 'monthly',
      appAccountToken: 'a1111111-b222-c333-d444-e55555555555',
      bundleId: 'com.zoperatingsystem.zstudio',
      environment: 'sandbox',
      inAppOwnershipType: 'PURCHASED',
    },
  );
  assert.equal(result.decodedTransaction, canonicalDecodedTransaction);
  assert.equal('jwsRepresentation' in result, false);
});

test('family sharing fails closed in Z Studio v1', async () => {
  const verifier = {
    async verifyAndDecodeTransaction() {
      return {
        ...canonicalDecodedTransaction,
        inAppOwnershipType: 'FAMILY_SHARED',
      };
    },
  };

  await assert.rejects(
    () => verifyAppleTransactionJWS('signed', sandboxConfig, { verifier }),
    /APPLE_FAMILY_SHARING_NOT_SUPPORTED/,
  );
});

test('unknown product and missing canonical person token fail closed', async () => {
  await assert.rejects(
    () => verifyAppleTransactionJWS('signed', sandboxConfig, {
      verifier: {
        async verifyAndDecodeTransaction() {
          return {
            ...canonicalDecodedTransaction,
            productId: 'com.example.not-authorized',
          };
        },
      },
    }),
    /APPLE_PRODUCT_NOT_AUTHORIZED/,
  );

  await assert.rejects(
    () => verifyAppleTransactionJWS('signed', sandboxConfig, {
      verifier: {
        async verifyAndDecodeTransaction() {
          return {
            ...canonicalDecodedTransaction,
            appAccountToken: undefined,
          };
        },
      },
    }),
    /APPLE_APP_ACCOUNT_TOKEN_REQUIRED/,
  );
});

test('bundle, environment, and exact decimal transaction identity fail closed', async () => {
  const cases = [
    [{ bundleId: 'com.example.other' }, /APPLE_TRANSACTION_BUNDLE_ID_INVALID/],
    [{ environment: Environment.PRODUCTION }, /APPLE_TRANSACTION_ENVIRONMENT_INVALID/],
    [{ transactionId: '2.5' }, /APPLE_TRANSACTION_ID_INVALID/],
    [{ originalTransactionId: 'abc' }, /APPLE_ORIGINAL_TRANSACTION_ID_INVALID/],
  ];

  for (const [patch, expected] of cases) {
    await assert.rejects(
      () => verifyAppleTransactionJWS('signed', sandboxConfig, {
        verifier: {
          async verifyAndDecodeTransaction() {
            return { ...canonicalDecodedTransaction, ...patch };
          },
        },
      }),
      expected,
    );
  }
});

test('real Apple verifier rejects malformed signed transaction evidence', async () => {
  const verifier = createAppleSignedDataVerifier(sandboxConfig);
  await assert.rejects(
    () => verifyAppleTransactionJWS(
      'not.a.valid.apple.jws',
      sandboxConfig,
      { verifier },
    ),
    /APPLE_SIGNED_TRANSACTION_UNVERIFIED/,
  );
});
