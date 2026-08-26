import {
  AutoRenewStatus,
  Environment,
  NotificationTypeV2,
  Subtype,
} from '@apple/app-store-server-library';
import { APPLE_APP_ID, resolveAppleProduct } from './store-products.js';
import {
  createAppleSignedDataVerifier,
  verifyAppleTransactionJWS,
} from './apple-signed-data.js';

const SUPPORTED_SUBSCRIPTION_NOTIFICATION_TYPES = new Set([
  NotificationTypeV2.SUBSCRIBED,
  NotificationTypeV2.DID_CHANGE_RENEWAL_PREF,
  NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS,
  NotificationTypeV2.OFFER_REDEEMED,
  NotificationTypeV2.DID_RENEW,
  NotificationTypeV2.EXPIRED,
  NotificationTypeV2.DID_FAIL_TO_RENEW,
  NotificationTypeV2.GRACE_PERIOD_EXPIRED,
  NotificationTypeV2.PRICE_INCREASE,
  NotificationTypeV2.REFUND,
  NotificationTypeV2.REFUND_DECLINED,
  NotificationTypeV2.RENEWAL_EXTENDED,
  NotificationTypeV2.REVOKE,
  NotificationTypeV2.REFUND_REVERSED,
]);

const KNOWN_SUBTYPES = new Set(Object.values(Subtype));

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function appleEnvironment(environment) {
  if (environment === 'sandbox') return Environment.SANDBOX;
  if (environment === 'production') return Environment.PRODUCTION;
  throw new Error('APPLE_NOTIFICATION_ENVIRONMENT_INVALID');
}

function requiredString(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function requiredUuid(value, code) {
  const normalized = requiredString(value, code).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function requiredEpochMilliseconds(value, code) {
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
  return value;
}

function exactDecimalString(value, code) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(code);
  }
  return value;
}

function normalizedSubtype(value) {
  if (value === undefined || value === null || value === '') return null;
  const subtype = requiredString(value, 'APPLE_NOTIFICATION_SUBTYPE_INVALID');
  if (!KNOWN_SUBTYPES.has(subtype)) {
    throw new Error('APPLE_NOTIFICATION_SUBTYPE_INVALID');
  }
  return subtype;
}

function validateNotificationVersion(value) {
  const version = requiredString(
    value,
    'APPLE_NOTIFICATION_VERSION_REQUIRED',
  );
  if (!/^2(?:\.\d+)*$/.test(version)) {
    throw new Error('APPLE_NOTIFICATION_VERSION_UNSUPPORTED');
  }
  return version;
}

function validateNotificationData(data, config) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('APPLE_NOTIFICATION_DATA_REQUIRED');
  }
  if (data.bundleId !== APPLE_APP_ID) {
    throw new Error('APPLE_NOTIFICATION_BUNDLE_ID_INVALID');
  }
  if (data.environment !== appleEnvironment(config.environment)) {
    throw new Error('APPLE_NOTIFICATION_ENVIRONMENT_INVALID');
  }

  if (config.environment === 'production') {
    const expectedAppAppleId = Number(config.appAppleId);
    if (
      !Number.isSafeInteger(expectedAppAppleId)
      || expectedAppAppleId <= 0
      || data.appAppleId !== expectedAppAppleId
    ) {
      throw new Error('APPLE_NOTIFICATION_APP_APPLE_ID_INVALID');
    }
  }

  return data;
}

async function verifyNotificationRenewalJWS(
  signedRenewalInfo,
  config,
  verifier,
) {
  const signed = requiredString(
    signedRenewalInfo,
    'APPLE_NOTIFICATION_SIGNED_RENEWAL_REQUIRED',
  );

  let decoded;
  try {
    decoded = await verifier.verifyAndDecodeRenewalInfo(signed);
  } catch (cause) {
    const error = new Error('APPLE_NOTIFICATION_SIGNED_RENEWAL_UNVERIFIED');
    error.cause = cause;
    throw error;
  }

  if (!decoded || typeof decoded !== 'object') {
    throw new Error('APPLE_NOTIFICATION_RENEWAL_INVALID');
  }
  if (decoded.environment !== appleEnvironment(config.environment)) {
    throw new Error('APPLE_NOTIFICATION_RENEWAL_ENVIRONMENT_INVALID');
  }

  const originalTransactionId = exactDecimalString(
    decoded.originalTransactionId,
    'APPLE_NOTIFICATION_RENEWAL_ORIGINAL_TRANSACTION_ID_INVALID',
  );
  const appAccountToken = requiredUuid(
    decoded.appAccountToken,
    'APPLE_NOTIFICATION_RENEWAL_APP_ACCOUNT_TOKEN_REQUIRED',
  );
  const product = resolveAppleProduct(decoded.productId);
  const autoRenewProduct = resolveAppleProduct(decoded.autoRenewProductId);

  if (
    decoded.autoRenewStatus !== AutoRenewStatus.OFF
    && decoded.autoRenewStatus !== AutoRenewStatus.ON
  ) {
    throw new Error('APPLE_NOTIFICATION_AUTO_RENEW_STATUS_INVALID');
  }

  return Object.freeze({
    originalTransactionId,
    appAccountToken,
    productId: product.productId,
    planCode: product.planCode,
    autoRenewProductId: autoRenewProduct.productId,
    autoRenewPlanCode: autoRenewProduct.planCode,
    autoRenewStatus: decoded.autoRenewStatus,
    signedDate: requiredEpochMilliseconds(
      decoded.signedDate,
      'APPLE_NOTIFICATION_RENEWAL_SIGNED_DATE_INVALID',
    ),
  });
}

function assertSame(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`APPLE_NOTIFICATION_${label}_MISMATCH`);
  }
}

export async function verifyAppleNotificationV2(
  signedPayload,
  config,
  { verifier } = {},
) {
  const signed = requiredString(
    signedPayload,
    'APPLE_SIGNED_NOTIFICATION_REQUIRED',
  );
  const activeVerifier =
    verifier ?? createAppleSignedDataVerifier(config);

  let decoded;
  try {
    decoded = await activeVerifier.verifyAndDecodeNotification(signed);
  } catch (cause) {
    const error = new Error('APPLE_SIGNED_NOTIFICATION_UNVERIFIED');
    error.cause = cause;
    throw error;
  }

  if (!decoded || typeof decoded !== 'object') {
    throw new Error('APPLE_NOTIFICATION_INVALID');
  }

  const notificationUUID = requiredUuid(
    decoded.notificationUUID,
    'APPLE_NOTIFICATION_UUID_INVALID',
  );
  const notificationType = requiredString(
    decoded.notificationType,
    'APPLE_NOTIFICATION_TYPE_REQUIRED',
  );
  const subtype = normalizedSubtype(decoded.subtype);
  const version = validateNotificationVersion(decoded.version);
  const signedDate = requiredEpochMilliseconds(
    decoded.signedDate,
    'APPLE_NOTIFICATION_SIGNED_DATE_INVALID',
  );
  const sourceEventRef = `notification:${notificationUUID}`;

  if (notificationType === NotificationTypeV2.TEST) {
    return Object.freeze({
      verification: 'verified_notification_test',
      notificationUUID,
      notificationType,
      subtype,
      version,
      signedDate,
      sourceEventRef,
      reconciliationRequired: false,
      rawJwsIncluded: false,
    });
  }

  if (!SUPPORTED_SUBSCRIPTION_NOTIFICATION_TYPES.has(notificationType)) {
    throw new Error('APPLE_NOTIFICATION_TYPE_UNSUPPORTED');
  }

  const data = validateNotificationData(decoded.data, config);
  const signedTransactionInfo = requiredString(
    data.signedTransactionInfo,
    'APPLE_NOTIFICATION_SIGNED_TRANSACTION_REQUIRED',
  );
  const signedRenewalInfo = requiredString(
    data.signedRenewalInfo,
    'APPLE_NOTIFICATION_SIGNED_RENEWAL_REQUIRED',
  );

  const transaction = await verifyAppleTransactionJWS(
    signedTransactionInfo,
    config,
    { verifier: activeVerifier },
  );
  const renewal = await verifyNotificationRenewalJWS(
    signedRenewalInfo,
    config,
    activeVerifier,
  );

  assertSame(
    'ORIGINAL_TRANSACTION_ID',
    renewal.originalTransactionId,
    transaction.originalTransactionId,
  );
  assertSame(
    'APP_ACCOUNT_TOKEN',
    renewal.appAccountToken,
    transaction.appAccountToken,
  );

  return Object.freeze({
    verification: 'verified_notification',
    notificationUUID,
    notificationType,
    subtype,
    version,
    signedDate,
    sourceEventRef,
    billingSource: 'apple_app_store',
    billingEnvironment: config.environment,
    personId: transaction.appAccountToken,
    transactionId: transaction.transactionId,
    originalTransactionId: transaction.originalTransactionId,
    productId: transaction.productId,
    planCode: transaction.planCode,
    transactionReason: transaction.transactionReason,
    renewalProductId: renewal.productId,
    autoRenewProductId: renewal.autoRenewProductId,
    autoRenewPlanCode: renewal.autoRenewPlanCode,
    autoRenewStatus: renewal.autoRenewStatus,
    transactionSignedDate: transaction.signedDate,
    renewalSignedDate: renewal.signedDate,
    effectiveAtMs: signedDate,
    reconciliationRequired: true,
    rawJwsIncluded: false,
  });
}
