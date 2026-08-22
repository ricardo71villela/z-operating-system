/* Run with: node apps/fashion/packages/fashion-domain/tests/product-page.test.js */

const assert = require('assert');
const { createProduct } = require('../src/product');
const { createBrand } = require('../src/brand');
const { createPartner } = require('../src/partner');
const { initStock, applyStockUpdate } = require('../src/stock');
const {
  stockAvailabilityLabel,
  buildProductPageViewModel,
  STOCK_LABELS,
  LOW_STOCK_THRESHOLD,
} = require('../src/product-page');

// --- stockAvailabilityLabel: the three bands, never a raw number ---
assert.strictEqual(stockAvailabilityLabel(initStock('p1')), STOCK_LABELS.OUT_OF_STOCK);

const lowStock = applyStockUpdate(initStock('p1'), { quantityAvailable: LOW_STOCK_THRESHOLD, observedAt: '2026-08-21T10:00:00.000Z' });
assert.strictEqual(stockAvailabilityLabel(lowStock), STOCK_LABELS.LOW_STOCK);

const healthyStock = applyStockUpdate(initStock('p1'), { quantityAvailable: LOW_STOCK_THRESHOLD + 1, observedAt: '2026-08-21T10:00:00.000Z' });
assert.strictEqual(stockAvailabilityLabel(healthyStock), STOCK_LABELS.IN_STOCK);

// --- full view model assembly ---
const partner = createPartner({
  id: 'partner_atelier', legalName: 'Atelier Rive Gauche', countryIso: 'FR',
  locales: ['fr'], categories: ['clothing', 'footwear'],
});
const brand = createBrand({ id: 'brand_atelier', name: 'Atelier Rive Gauche' });

const shoe = createProduct({
  id: 'prod_shoe', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  gender: 'female', categories: ['footwear'], size: { system: 'EU', value: 38 },
});
const otherShoe = createProduct({
  id: 'prod_other_shoe', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  gender: 'female', categories: ['footwear'], size: { system: 'EU', value: 39 },
});
const catalog = [shoe, otherShoe];

let stock = applyStockUpdate(initStock('prod_shoe'), { quantityAvailable: 3, observedAt: '2026-08-21T10:00:00.000Z' });

const vm = buildProductPageViewModel({
  product: shoe, stock, brand, partner,
  discount: null, priceMinorUnits: 15500, allProducts: catalog,
});

assert.strictEqual(vm.productId, 'prod_shoe');
assert.strictEqual(vm.brandName, 'Atelier Rive Gauche');
assert.strictEqual(vm.seller.legalName, 'Atelier Rive Gauche');
assert.strictEqual(vm.price.amountMinorUnits, 15500);
assert.strictEqual(vm.price.discount, null);
assert.strictEqual(vm.availability.label, STOCK_LABELS.LOW_STOCK);
assert.strictEqual(vm.availability.sellable, true);
assert.strictEqual(vm.returnEligible, true);
// Same-Corner recommendation kicks in even below the 4-item threshold
// default only if it actually has genuinely related products — here
// there's exactly one other Footwear product in the same Corner, so
// it falls back (threshold not met), never mislabeled as same-Corner.
assert.strictEqual(vm.recommendations.label, 'fallback');

// --- degrades gracefully with a dangling/unresolved brand (never throws) ---
const vmNoBrand = buildProductPageViewModel({
  product: shoe, stock, brand: null, partner,
  discount: null, priceMinorUnits: 15500, allProducts: catalog,
});
assert.strictEqual(vmNoBrand.brandName, null);

// --- discount surfaces exactly what it's given, never recomputed here ---
const vmDiscount = buildProductPageViewModel({
  product: shoe, stock, brand, partner,
  discount: { referencePriceMinorUnits: 19000, discountPercent: 18 },
  priceMinorUnits: 15500, allProducts: catalog,
});
assert.strictEqual(vmDiscount.price.discount.discountPercent, 18);
assert.strictEqual(vmDiscount.price.discount.referencePriceMinorUnits, 19000);

// --- out-of-stock Product still renders a full view model, just not sellable ---
const vmOutOfStock = buildProductPageViewModel({
  product: shoe, stock: initStock('prod_shoe'), brand, partner,
  discount: null, priceMinorUnits: 15500, allProducts: catalog,
});
assert.strictEqual(vmOutOfStock.availability.label, STOCK_LABELS.OUT_OF_STOCK);
assert.strictEqual(vmOutOfStock.availability.sellable, false);

// --- Cosmetics: returnEligible reuses product.js's own rule, not a duplicate ---
const perfume = createProduct({
  id: 'prod_perfume', partnerId: 'partner_atelier', brandId: 'brand_atelier',
  gender: 'unisex', categories: ['cosmetics'], format: { volumeMl: 50 },
});
const perfumeStock = applyStockUpdate(initStock('prod_perfume'), { quantityAvailable: 10, observedAt: '2026-08-21T10:00:00.000Z' });
const vmPerfume = buildProductPageViewModel({
  product: perfume, stock: perfumeStock, brand, partner,
  discount: null, priceMinorUnits: 9800, allProducts: [perfume],
});
// Browsing-time default assumption is sealBroken:false — an unopened
// perfume is still return-eligible before purchase.
assert.strictEqual(vmPerfume.returnEligible, true);

// --- partner is mandatory — the professional-seller disclosure is never optional ---
assert.throws(
  () => buildProductPageViewModel({
    product: shoe, stock, brand, partner: null,
    discount: null, priceMinorUnits: 15500, allProducts: catalog,
  }),
  /partner is required/
);

console.log('product-page.js: all invariant checks passed.');
