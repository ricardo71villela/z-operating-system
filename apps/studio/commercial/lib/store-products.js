import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(here, '..', 'store-products.v1.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

if (catalog.authority !== 'ZSTUDIO_STORE_PRODUCT_AUTHORITY_V1') {
  throw new Error('ZSTUDIO_STORE_PRODUCT_AUTHORITY_INVALID');
}
if (typeof catalog.appId !== 'string' || !catalog.appId.trim()) {
  throw new Error('ZSTUDIO_STORE_APP_ID_INVALID');
}
if (catalog.commercialTargetCurrency !== 'EUR') {
  throw new Error('ZSTUDIO_STORE_PRODUCT_CURRENCY_INVALID');
}
if (!Number.isInteger(catalog.trialDays) || catalog.trialDays !== 3) {
  throw new Error('ZSTUDIO_STORE_PRODUCT_TRIAL_INVALID');
}

export const APPLE_APP_ID = catalog.appId.trim();
export const GOOGLE_PLAY_PACKAGE_NAME = APPLE_APP_ID;
export const STORE_COMMERCIAL_TARGET_CURRENCY = catalog.commercialTargetCurrency;
export const STORE_TRIAL_DAYS = catalog.trialDays;

const appleByProductId = new Map();
const webPlans = new Map();
const googlePlans = new Map();
const googleByAuthorityRef = new Map();
const googleProductIds = new Set();

function requiredCatalogString(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

for (const [planCode, plan] of Object.entries(catalog.plans ?? {})) {
  const productId = plan?.apple?.productId;
  if (!productId || appleByProductId.has(productId)) {
    throw new Error('ZSTUDIO_STORE_PRODUCT_CATALOG_INVALID');
  }
  appleByProductId.set(productId, Object.freeze({ planCode, productId }));

  if (
    !['weekly', 'monthly', 'annual'].includes(planCode)
    || plan?.billingCadence !== planCode
    || !Number.isInteger(plan?.commercialTargetPriceMinor)
    || plan.commercialTargetPriceMinor <= 0
  ) {
    throw new Error('ZSTUDIO_STORE_WEB_PLAN_CATALOG_INVALID');
  }
  const commercial = Object.freeze({
    planCode,
    billingCadence: plan.billingCadence,
    commercialTargetPriceMinor: plan.commercialTargetPriceMinor,
    currency: STORE_COMMERCIAL_TARGET_CURRENCY,
    trialDays: STORE_TRIAL_DAYS,
  });
  webPlans.set(planCode, commercial);

  const google = plan?.google;
  const googleProductId = requiredCatalogString(
    google?.productId,
    'ZSTUDIO_STORE_GOOGLE_PRODUCT_CATALOG_INVALID',
  );
  const basePlanId = requiredCatalogString(
    google?.basePlanId,
    'ZSTUDIO_STORE_GOOGLE_BASE_PLAN_CATALOG_INVALID',
  );
  const offerId = requiredCatalogString(
    google?.offerId,
    'ZSTUDIO_STORE_GOOGLE_OFFER_CATALOG_INVALID',
  );
  if (
    google?.offerType !== 'free_trial'
    || google?.trialDurationDays !== STORE_TRIAL_DAYS
    || google?.eligibility !== 'never_had_subscription'
  ) {
    throw new Error('ZSTUDIO_STORE_GOOGLE_TRIAL_CATALOG_INVALID');
  }
  if (googlePlans.has(planCode)) {
    throw new Error('ZSTUDIO_STORE_GOOGLE_PLAN_CATALOG_INVALID');
  }
  const authorityRef = `${googleProductId}:${basePlanId}`;
  if (googleByAuthorityRef.has(authorityRef)) {
    throw new Error('ZSTUDIO_STORE_GOOGLE_PLAN_CATALOG_INVALID');
  }
  googleProductIds.add(googleProductId);
  const googlePlan = Object.freeze({
    ...commercial,
    productId: googleProductId,
    basePlanId,
    offerId,
    offerType: google.offerType,
    eligibility: google.eligibility,
  });
  googlePlans.set(planCode, googlePlan);
  googleByAuthorityRef.set(authorityRef, googlePlan);
}

if (appleByProductId.size !== 3 || webPlans.size !== 3 || googlePlans.size !== 3) {
  throw new Error('ZSTUDIO_STORE_PRODUCT_CATALOG_INVALID');
}
if (googleProductIds.size !== 1) {
  throw new Error('ZSTUDIO_STORE_GOOGLE_PRODUCT_CATALOG_INVALID');
}

export const APPLE_PRODUCT_IDS = Object.freeze([...appleByProductId.keys()].sort());
export const WEB_PLAN_CODES = Object.freeze([...webPlans.keys()].sort());
export const GOOGLE_PLAY_PLAN_CODES = Object.freeze([...googlePlans.keys()].sort());
export const GOOGLE_PLAY_PRODUCT_ID = [...googleProductIds][0];
export const GOOGLE_PLAY_BASE_PLAN_IDS = Object.freeze(
  [...googlePlans.values()].map((plan) => plan.basePlanId).sort(),
);

export function resolveAppleProduct(productId) {
  const normalized = String(productId ?? '').trim();
  const match = appleByProductId.get(normalized);
  if (!match) throw new Error('APPLE_PRODUCT_NOT_AUTHORIZED');
  return match;
}

export function resolveWebPlan(planCode) {
  const normalized = String(planCode ?? '').trim().toLowerCase();
  const match = webPlans.get(normalized);
  if (!match) throw new Error('WEB_PLAN_NOT_AUTHORIZED');
  return match;
}

export function resolveGooglePlayPlan(planCode) {
  const normalized = String(planCode ?? '').trim().toLowerCase();
  const match = googlePlans.get(normalized);
  if (!match) throw new Error('GOOGLE_PLAY_PLAN_NOT_AUTHORIZED');
  return match;
}

export function resolveGooglePlayBasePlan(productId, basePlanId) {
  const product = String(productId ?? '').trim();
  const basePlan = String(basePlanId ?? '').trim();
  const match = googleByAuthorityRef.get(`${product}:${basePlan}`);
  if (!match) throw new Error('GOOGLE_PLAY_BASE_PLAN_NOT_AUTHORIZED');
  return match;
}
