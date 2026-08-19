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

export const APPLE_APP_ID = catalog.appId.trim();

const byProductId = new Map();
for (const [planCode, plan] of Object.entries(catalog.plans ?? {})) {
  const productId = plan?.apple?.productId;
  if (!productId || byProductId.has(productId)) {
    throw new Error('ZSTUDIO_STORE_PRODUCT_CATALOG_INVALID');
  }
  byProductId.set(productId, Object.freeze({ planCode, productId }));
}

if (byProductId.size !== 3) {
  throw new Error('ZSTUDIO_STORE_PRODUCT_CATALOG_INVALID');
}

export const APPLE_PRODUCT_IDS = Object.freeze([...byProductId.keys()].sort());

export function resolveAppleProduct(productId) {
  const normalized = String(productId ?? '').trim();
  const match = byProductId.get(normalized);
  if (!match) throw new Error('APPLE_PRODUCT_NOT_AUTHORIZED');
  return match;
}
