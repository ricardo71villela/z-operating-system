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
export const STORE_COMMERCIAL_TARGET_CURRENCY = catalog.commercialTargetCurrency;
export const STORE_TRIAL_DAYS = catalog.trialDays;

const byProductId = new Map();
const webPlans = new Map();

for (const [planCode, plan] of Object.entries(catalog.plans ?? {})) {
  const productId = plan?.apple?.productId;
  if (!productId || byProductId.has(productId)) {
    throw new Error('ZSTUDIO_STORE_PRODUCT_CATALOG_INVALID');
  }
  byProductId.set(productId, Object.freeze({ planCode, productId }));

  if (
    !['weekly', 'monthly', 'annual'].includes(planCode)
    || plan?.billingCadence !== planCode
    || !Number.isInteger(plan?.commercialTargetPriceMinor)
    || plan.commercialTargetPriceMinor <= 0
  ) {
    throw new Error('ZSTUDIO_STORE_WEB_PLAN_CATALOG_INVALID');
  }
  webPlans.set(
    planCode,
    Object.freeze({
      planCode,
      billingCadence: plan.billingCadence,
      commercialTargetPriceMinor: plan.commercialTargetPriceMinor,
      currency: STORE_COMMERCIAL_TARGET_CURRENCY,
      trialDays: STORE_TRIAL_DAYS,
    }),
  );
}

if (byProductId.size !== 3 || webPlans.size !== 3) {
  throw new Error('ZSTUDIO_STORE_PRODUCT_CATALOG_INVALID');
}

export const APPLE_PRODUCT_IDS = Object.freeze([...byProductId.keys()].sort());
export const WEB_PLAN_CODES = Object.freeze([...webPlans.keys()].sort());

export function resolveAppleProduct(productId) {
  const normalized = String(productId ?? '').trim();
  const match = byProductId.get(normalized);
  if (!match) throw new Error('APPLE_PRODUCT_NOT_AUTHORIZED');
  return match;
}

export function resolveWebPlan(planCode) {
  const normalized = String(planCode ?? '').trim().toLowerCase();
  const match = webPlans.get(normalized);
  if (!match) throw new Error('WEB_PLAN_NOT_AUTHORIZED');
  return match;
}
