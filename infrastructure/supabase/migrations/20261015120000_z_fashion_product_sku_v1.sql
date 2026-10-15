-- ============================================================
-- Z FASHION — Store product reference (SKU) v1
--
-- A store's own reference for each product (one size / one format is
-- one product). Optional, unique per store, and CSV-safe so a stock
-- file "reference;quantity" can be matched to products. Mirrors SKU_RE
-- in fashion-domain/src/product.js.
--
-- Additive only: a nullable column, a check and a partial unique index.
-- ============================================================

alter table fashion.products
  add column if not exists partner_sku text;

alter table fashion.products
  drop constraint if exists fashion_products_partner_sku_format;

alter table fashion.products
  add constraint fashion_products_partner_sku_format
  check (partner_sku is null or (partner_sku ~ '^[^;,"\r\n]{1,64}$' and partner_sku = btrim(partner_sku)));

create unique index if not exists fashion_products_partner_sku_unique
  on fashion.products (partner_id, partner_sku)
  where partner_sku is not null;

comment on column fashion.products.partner_sku is
  'The store''s own reference for this product (SKU), unique per store, used to match stock files. Optional.';
