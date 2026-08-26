import { createHash } from 'node:crypto';
import {
  AppStoreServerAPIClient,
  AutoRenewStatus,
  Environment,
  OfferDiscountType,
  Status,
} from '@apple/app-store-server-library';
import { APPLE_APP_ID, resolveAppleProduct } from './store-products.js';
import {
  createAppleSignedDataVerifier,
  verifyAppleTransactionJWS,
} from './apple-signed-data.js';

function appleEnvironment(environment) {
  if (environment === 'sandbox') return Environment.SANDBOX;
  if (environment === 'production') return Environment.PRODUCTION;
  throw new Error('APPLE_SERVER_ENVIRONMENT_INVALID');
}

function exactDecimalString(value, code) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(code);
  }
  return value;
}

function canonicalUuid(value, code = 'APPLE_APP_ACCOUNT_TOKEN_REQUIRED') {
  if (
    typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error(code);
  }
  return value.toLowerCase();
}

function requiredSigned(value, code) {
  const signed = String(value ?? '').trim();
  if (!signed) throw new Error(code);
  return signed;
}

function requiredEpochMilliseconds(value, code) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(code);
  }
  return value;
}

function optionalEpochMilliseconds(value, code) {
  if (value === undefined || value === null) return null;
  return requiredEpochMilliseconds(value, code);
}

function assertSame(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`APPLE_RECONCILIATION_${label}_MISMATCH`);
  }
}

export function createAppleServerApiClient(
  config,
  { ClientClass = AppStoreServerAPIClient } = {},
) {
  if (!config || typeof config !== 'object') {
    throw new Error('APPLE_SERVER_CONFIG_REQUIRED');
  }
  if (config.bundleId !== APPLE_APP_ID) {
    throw new Error('APPLE_SERVER_BUNDLE_ID_INVALID');
  }

  return new ClientClass(
    config.privateKey,
    config.keyId,
    config.issuerId,
    config.bundleId,
    appleEnvironment(config.environment),
  );
}

async function verifyAppleRenewalJWS(
  signedRenewalInfo,
  config,
  { verifier } = {},
) {
  const signed = requiredSigned(
    signedRenewalInfo,
    'APPLE_SIGNED_RENEWAL_REQUIRED',
  );
  const activeVerifier =
    verifier ?? createAppleSignedDataVerifier(config);

  let decoded;
  try {
    decoded = await activeVerifier.verifyAndDecodeRenewalInfo(signed);
  } catch (cause) {
    const error = new Error('APPLE_SIGNED_RENEWAL_UNVERIFIED');
    error.cause = cause;
    throw error;
  }

  if (!decoded || typeof decoded !== 'object') {
    throw new Error('APPLE_SIGNED_RENEWAL_INVALID');
  }
  if (decoded.environment !== appleEnvironment(config.environment)) {
    throw new Error('APPLE_RENEWAL_ENVIRONMENT_INVALID');
  }

  const originalTransactionId = exactDecimalString(
    decoded.originalTransactionId,
    'APPLE_RENEWAL_ORIGINAL_TRANSACTION_ID_INVALID',
  );
  const appAccountToken = canonicalUuid(
    decoded.appAccountToken,
    'APPLE_RENEWAL_APP_ACCOUNT_TOKEN_REQUIRED',
  );
  const product = resolveAppleProduct(decoded.productId);
  const autoRenewProduct = resolveAppleProduct(decoded.autoRenewProductId);

  if (
    decoded.autoRenewStatus !== AutoRenewStatus.OFF
    && decoded.autoRenewStatus !== AutoRenewStatus.ON
  ) {
    throw new Error('APPLE_AUTO_RENEW_STATUS_INVALID');
  }

  return Object.freeze({
    originalTransactionId,
    productId: product.productId,
    planCode: product.planCode,
    autoRenewProductId: autoRenewProduct.productId,
    autoRenewPlanCode: autoRenewProduct.planCode,
    appAccountToken,
    autoRenewStatus: decoded.autoRenewStatus,
    signedDate: requiredEpochMilliseconds(
      decoded.signedDate,
      'APPLE_RENEWAL_SIGNED_DATE_INVALID',
    ),
    renewalDate: optionalEpochMilliseconds(
      decoded.renewalDate,
      'APPLE_RENEWAL_DATE_INVALID',
    ),
    gracePeriodExpiresDate: optionalEpochMilliseconds(
      decoded.gracePeriodExpiresDate,
      'APPLE_GRACE_PERIOD_EXPIRES_DATE_INVALID',
    ),
    expirationIntent: decoded.expirationIntent ?? null,
    isInBillingRetryPeriod: decoded.isInBillingRetryPeriod ?? false,
    decodedRenewal: decoded,
  });
}

function validateStatusResponse(response, config) {
  if (!response || typeof response !== 'object') {
    throw new Error('APPLE_STATUS_RESPONSE_INVALID');
  }
  if (response.environment !== appleEnvironment(config.environment)) {
    throw new Error('APPLE_STATUS_RESPONSE_ENVIRONMENT_INVALID');
  }
  if (response.bundleId !== APPLE_APP_ID) {
    throw new Error('APPLE_STATUS_RESPONSE_BUNDLE_ID_INVALID');
  }

  if (config.environment === 'production') {
    const expectedAppAppleId = Number(config.appAppleId);
    if (
      !Number.isSafeInteger(expectedAppAppleId)
      || expectedAppAppleId <= 0
      || response.appAppleId !== expectedAppAppleId
    ) {
      throw new Error('APPLE_STATUS_RESPONSE_APP_APPLE_ID_INVALID');
    }
  }

  if (!Array.isArray(response.data)) {
    throw new Error('APPLE_STATUS_RESPONSE_DATA_INVALID');
  }
  return response;
}

function selectExactSubscriptionChain(response, originalTransactionId) {
  const matches = [];

  for (const group of response.data) {
    if (!group || typeof group !== 'object') {
      throw new Error('APPLE_STATUS_GROUP_INVALID');
    }
    if (!Array.isArray(group.lastTransactions)) continue;

    for (const item of group.lastTransactions) {
      if (!item || typeof item !== 'object') {
        throw new Error('APPLE_STATUS_ITEM_INVALID');
      }
      if (item.originalTransactionId === originalTransactionId) {
        matches.push({
          subscriptionGroupIdentifier:
            String(group.subscriptionGroupIdentifier ?? '').trim() || null,
          item,
        });
      }
    }
  }

  if (matches.length === 0) {
    throw new Error('APPLE_SUBSCRIPTION_CHAIN_NOT_FOUND');
  }
  if (matches.length !== 1) {
    throw new Error('APPLE_SUBSCRIPTION_CHAIN_AMBIGUOUS');
  }
  return matches[0];
}

function normalizeAppleStatus(appleStatus, transaction, renewal) {
  switch (appleStatus) {
    case Status.ACTIVE:
      return transaction.decodedTransaction.offerDiscountType
        === OfferDiscountType.FREE_TRIAL
        ? 'trialing'
        : 'active';
    case Status.EXPIRED:
      return 'expired';
    case Status.BILLING_RETRY:
      return 'past_due';
    case Status.BILLING_GRACE_PERIOD:
      if (renewal.gracePeriodExpiresDate === null) {
        throw new Error('APPLE_GRACE_PERIOD_EXPIRES_DATE_REQUIRED');
      }
      return 'grace';
    case Status.REVOKED:
      // Apple refund/revocation may later be reversed. Z Studio's provider-
      // neutral `revoked` state is terminal, so Apple v1 deliberately maps
      // this reversible access loss to non-terminal `expired`.
      return 'expired';
    default:
      throw new Error('APPLE_SUBSCRIPTION_STATUS_INVALID');
  }
}

function commercialPeriod(normalizedStatus, transaction, renewal) {
  if (normalizedStatus === 'trialing') {
    return {
      trialStartedAtMs: requiredEpochMilliseconds(
        transaction.originalPurchaseDate ?? transaction.purchaseDate,
        'APPLE_TRIAL_START_DATE_REQUIRED',
      ),
      trialEndsAtMs: requiredEpochMilliseconds(
        transaction.expiresDate,
        'APPLE_TRIAL_EXPIRES_DATE_REQUIRED',
      ),
      currentPeriodStartMs: null,
      currentPeriodEndMs: null,
    };
  }

  if (normalizedStatus === 'active') {
    return {
      trialStartedAtMs: null,
      trialEndsAtMs: null,
      currentPeriodStartMs: requiredEpochMilliseconds(
        transaction.purchaseDate,
        'APPLE_CURRENT_PERIOD_START_REQUIRED',
      ),
      currentPeriodEndMs: requiredEpochMilliseconds(
        transaction.expiresDate,
        'APPLE_CURRENT_PERIOD_END_REQUIRED',
      ),
    };
  }

  if (normalizedStatus === 'grace') {
    return {
      trialStartedAtMs: null,
      trialEndsAtMs: null,
      currentPeriodStartMs: requiredEpochMilliseconds(
        transaction.purchaseDate,
        'APPLE_CURRENT_PERIOD_START_REQUIRED',
      ),
      currentPeriodEndMs: renewal.gracePeriodExpiresDate,
    };
  }

  return {
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: null,
    currentPeriodEndMs: null,
  };
}

export async function reconcileAppleCurrentSubscription(
  deviceEvidence,
  config,
  {
    client,
    verifier,
  } = {},
) {
  if (
    !deviceEvidence
    || deviceEvidence.verification !== 'verified'
  ) {
    throw new Error('APPLE_DEVICE_EVIDENCE_REQUIRED');
  }

  const deviceTransactionId = exactDecimalString(
    deviceEvidence.transactionId,
    'APPLE_DEVICE_TRANSACTION_ID_INVALID',
  );
  const deviceOriginalTransactionId = exactDecimalString(
    deviceEvidence.originalTransactionId,
    'APPLE_DEVICE_ORIGINAL_TRANSACTION_ID_INVALID',
  );
  const deviceProduct = resolveAppleProduct(deviceEvidence.productId);
  const deviceAppAccountToken = canonicalUuid(
    deviceEvidence.appAccountToken,
  );
  assertSame(
    'DEVICE_BUNDLE_ID',
    deviceEvidence.bundleId,
    APPLE_APP_ID,
  );
  assertSame(
    'DEVICE_ENVIRONMENT',
    deviceEvidence.environment,
    config.environment,
  );

  const activeClient = client ?? createAppleServerApiClient(config);
  const activeVerifier =
    verifier ?? createAppleSignedDataVerifier(config);

  const transactionInfo =
    await activeClient.getTransactionInfo(deviceTransactionId);
  const serverDeviceSignedTransaction = requiredSigned(
    transactionInfo?.signedTransactionInfo,
    'APPLE_TRANSACTION_INFO_SIGNED_TRANSACTION_REQUIRED',
  );
  const serverDeviceTransaction = await verifyAppleTransactionJWS(
    serverDeviceSignedTransaction,
    config,
    { verifier: activeVerifier },
  );

  assertSame(
    'DEVICE_TRANSACTION_ID',
    serverDeviceTransaction.transactionId,
    deviceTransactionId,
  );
  assertSame(
    'DEVICE_ORIGINAL_TRANSACTION_ID',
    serverDeviceTransaction.originalTransactionId,
    deviceOriginalTransactionId,
  );
  assertSame(
    'DEVICE_PRODUCT_ID',
    serverDeviceTransaction.productId,
    deviceProduct.productId,
  );
  assertSame(
    'DEVICE_APP_ACCOUNT_TOKEN',
    serverDeviceTransaction.appAccountToken,
    deviceAppAccountToken,
  );

  const statusResponse = validateStatusResponse(
    await activeClient.getAllSubscriptionStatuses(
      deviceOriginalTransactionId,
    ),
    config,
  );

  const {
    subscriptionGroupIdentifier,
    item,
  } = selectExactSubscriptionChain(
    statusResponse,
    deviceOriginalTransactionId,
  );

  if (!Number.isInteger(item.status)) {
    throw new Error('APPLE_SUBSCRIPTION_STATUS_INVALID');
  }

  const currentSignedTransaction = requiredSigned(
    item.signedTransactionInfo,
    'APPLE_CURRENT_SIGNED_TRANSACTION_REQUIRED',
  );
  const currentSignedRenewal = requiredSigned(
    item.signedRenewalInfo,
    'APPLE_CURRENT_SIGNED_RENEWAL_REQUIRED',
  );

  const currentTransaction = await verifyAppleTransactionJWS(
    currentSignedTransaction,
    config,
    { verifier: activeVerifier },
  );
  const currentRenewal = await verifyAppleRenewalJWS(
    currentSignedRenewal,
    config,
    { verifier: activeVerifier },
  );

  assertSame(
    'CURRENT_ORIGINAL_TRANSACTION_ID',
    currentTransaction.originalTransactionId,
    deviceOriginalTransactionId,
  );
  assertSame(
    'RENEWAL_ORIGINAL_TRANSACTION_ID',
    currentRenewal.originalTransactionId,
    deviceOriginalTransactionId,
  );
  assertSame(
    'CURRENT_APP_ACCOUNT_TOKEN',
    currentTransaction.appAccountToken,
    deviceAppAccountToken,
  );
  assertSame(
    'RENEWAL_APP_ACCOUNT_TOKEN',
    currentRenewal.appAccountToken,
    deviceAppAccountToken,
  );

  const normalizedStatus = normalizeAppleStatus(
    item.status,
    currentTransaction,
    currentRenewal,
  );
  const period = commercialPeriod(
    normalizedStatus,
    currentTransaction,
    currentRenewal,
  );

  const effectiveAtMs = Math.max(
    requiredEpochMilliseconds(
      currentTransaction.signedDate,
      'APPLE_CURRENT_TRANSACTION_SIGNED_DATE_REQUIRED',
    ),
    currentRenewal.signedDate,
  );

  const sourceEventRef =
    `app:${createHash('sha256')
      .update(`${currentSignedTransaction}\n${currentSignedRenewal}`)
      .digest('hex')}`;

  return Object.freeze({
    verification: 'verified_current_state',
    billingSource: 'apple_app_store',
    billingEnvironment: config.environment,
    sourceEventRef,
    sourceSubscriptionRef: deviceOriginalTransactionId,
    sourceProductRef: currentTransaction.productId,
    personId: deviceAppAccountToken,
    planCode: currentTransaction.planCode,
    normalizedStatus,
    appleStatus: item.status,
    appleRevokedEquivalent: item.status === Status.REVOKED,
    cancelAtPeriodEnd:
      currentRenewal.autoRenewStatus === AutoRenewStatus.OFF,
    subscriptionGroupIdentifier,
    effectiveAtMs,
    ...period,
    transactionId: currentTransaction.transactionId,
    originalTransactionId: currentTransaction.originalTransactionId,
    currentProductId: currentTransaction.productId,
    autoRenewProductId: currentRenewal.autoRenewProductId,
    rawJwsIncluded: false,
  });
}
