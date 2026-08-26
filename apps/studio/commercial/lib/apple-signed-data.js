import fs from 'node:fs';
import path from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  Environment,
  SignedDataVerifier,
} from '@apple/app-store-server-library';
import {
  APPLE_APP_ID,
  resolveAppleProduct,
} from './store-products.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultCertificateDirectory = path.join(here, '..', 'certs');
const rootManifestPath = path.join(
  defaultCertificateDirectory,
  'root-authority.v1.json',
);

const rootManifest = JSON.parse(
  fs.readFileSync(rootManifestPath, 'utf8'),
);

if (
  rootManifest.authority !==
    'ZSTUDIO_APPLE_ROOT_CERTIFICATE_AUTHORITY_V1'
  || !Array.isArray(rootManifest.certificates)
  || rootManifest.certificates.length !== 3
) {
  throw new Error('ZSTUDIO_APPLE_ROOT_AUTHORITY_INVALID');
}

const expectedRootFiles = [
  'AppleIncRootCertificate.cer',
  'AppleRootCA-G2.cer',
  'AppleRootCA-G3.cer',
];

if (
  rootManifest.certificates
    .map((entry) => entry?.file)
    .sort()
    .join('\n') !== expectedRootFiles.slice().sort().join('\n')
) {
  throw new Error('ZSTUDIO_APPLE_ROOT_AUTHORITY_INVALID');
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function appleEnvironment(environment) {
  if (environment === 'sandbox') return Environment.SANDBOX;
  if (environment === 'production') return Environment.PRODUCTION;
  throw new Error('APPLE_VERIFIER_ENVIRONMENT_INVALID');
}

function productionAppAppleId(config) {
  if (config.environment !== 'production') return undefined;

  const value = Number(config.appAppleId);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('APPLE_VERIFIER_APP_APPLE_ID_INVALID');
  }
  return value;
}

function exactDecimalString(value, code) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(code);
  }
  return value;
}

function canonicalUuid(value) {
  if (
    typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error('APPLE_APP_ACCOUNT_TOKEN_REQUIRED');
  }
  return value.toLowerCase();
}

function optionalEpochMilliseconds(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('APPLE_TRANSACTION_TIMESTAMP_INVALID');
  }
  return value;
}

export function loadAppleRootCertificates({
  certificateDirectory = defaultCertificateDirectory,
} = {}) {
  return rootManifest.certificates.map((entry) => {
    if (
      typeof entry.file !== 'string'
      || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')
    ) {
      throw new Error('ZSTUDIO_APPLE_ROOT_AUTHORITY_INVALID');
    }

    const certificatePath = path.join(certificateDirectory, entry.file);
    const bytes = fs.readFileSync(certificatePath);

    if (sha256Hex(bytes) !== entry.sha256) {
      throw new Error(`APPLE_ROOT_CERTIFICATE_HASH_MISMATCH:${entry.file}`);
    }

    // Parsing the DER certificate here fails closed before the Apple verifier is
    // constructed and prevents arbitrary bytes from satisfying only the hash
    // manifest contract.
    new X509Certificate(bytes);
    return bytes;
  });
}

export function createAppleSignedDataVerifier(
  config,
  {
    rootCertificates,
    VerifierClass = SignedDataVerifier,
    enableOnlineChecks = true,
  } = {},
) {
  if (!config || typeof config !== 'object') {
    throw new Error('APPLE_VERIFIER_CONFIG_REQUIRED');
  }
  if (config.bundleId !== APPLE_APP_ID) {
    throw new Error('APPLE_VERIFIER_BUNDLE_ID_INVALID');
  }
  if (enableOnlineChecks !== true) {
    throw new Error('APPLE_ONLINE_CHECKS_REQUIRED');
  }

  const roots = rootCertificates ?? loadAppleRootCertificates();
  if (!Array.isArray(roots) || roots.length !== 3) {
    throw new Error('APPLE_ROOT_CERTIFICATES_REQUIRED');
  }

  return new VerifierClass(
    roots,
    true,
    appleEnvironment(config.environment),
    config.bundleId,
    productionAppAppleId(config),
  );
}

export async function verifyAppleTransactionJWS(
  signedTransactionInfo,
  config,
  { verifier } = {},
) {
  const signed = String(signedTransactionInfo ?? '').trim();
  if (!signed) {
    throw new Error('APPLE_SIGNED_TRANSACTION_REQUIRED');
  }

  const activeVerifier =
    verifier ?? createAppleSignedDataVerifier(config);

  let decoded;
  try {
    decoded = await activeVerifier.verifyAndDecodeTransaction(signed);
  } catch (cause) {
    const error = new Error('APPLE_SIGNED_TRANSACTION_UNVERIFIED');
    error.cause = cause;
    throw error;
  }

  if (!decoded || typeof decoded !== 'object') {
    throw new Error('APPLE_SIGNED_TRANSACTION_INVALID');
  }

  if (decoded.bundleId !== APPLE_APP_ID) {
    throw new Error('APPLE_TRANSACTION_BUNDLE_ID_INVALID');
  }

  if (decoded.environment !== appleEnvironment(config.environment)) {
    throw new Error('APPLE_TRANSACTION_ENVIRONMENT_INVALID');
  }

  if (decoded.inAppOwnershipType !== 'PURCHASED') {
    throw new Error('APPLE_FAMILY_SHARING_NOT_SUPPORTED');
  }

  const transactionId = exactDecimalString(
    decoded.transactionId,
    'APPLE_TRANSACTION_ID_INVALID',
  );
  const originalTransactionId = exactDecimalString(
    decoded.originalTransactionId,
    'APPLE_ORIGINAL_TRANSACTION_ID_INVALID',
  );
  const product = resolveAppleProduct(decoded.productId);
  const appAccountToken = canonicalUuid(decoded.appAccountToken);

  return Object.freeze({
    verification: 'verified',
    transactionId,
    originalTransactionId,
    productId: product.productId,
    planCode: product.planCode,
    appAccountToken,
    bundleId: decoded.bundleId,
    environment: config.environment,
    inAppOwnershipType: decoded.inAppOwnershipType,
    signedDate: optionalEpochMilliseconds(decoded.signedDate),
    purchaseDate: optionalEpochMilliseconds(decoded.purchaseDate),
    originalPurchaseDate: optionalEpochMilliseconds(
      decoded.originalPurchaseDate,
    ),
    expiresDate: optionalEpochMilliseconds(decoded.expiresDate),
    revocationDate: optionalEpochMilliseconds(decoded.revocationDate),
    revocationReason: decoded.revocationReason ?? null,
    offerType: decoded.offerType ?? null,
    offerIdentifier: decoded.offerIdentifier ?? null,
    transactionReason: decoded.transactionReason ?? null,
    decodedTransaction: decoded,
  });
}
