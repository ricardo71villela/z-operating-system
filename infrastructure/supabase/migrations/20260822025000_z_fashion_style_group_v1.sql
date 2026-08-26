-- ============================================================
-- Z Fashion — Style Group v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors the styleId field added to product.js and the consistency
-- rule in style-group.js's validateStyleGroups(): every Product
-- sharing a style_id must agree on Partner/Brand/Gender/Categories/
-- French name — only `size` may differ. Closes a genuine
-- architectural gap flagged twice during the customer-side audit
-- (2026-08-21): a Product row is one size (DOMAIN-SKETCH.md), so a
-- Product Page size-selector had nothing to group sibling sizes under
-- until this.
-- ============================================================

alter table fashion.products add column style_id text;

create index idx_fashion_products_style on fashion.products(style_id) where style_id is not null;

comment on column fashion.products.style_id is 'Mirrors styleId in product.js. Optional — a Product with no style_id is standalone, never bucketed under a fabricated group. Every Product sharing a style_id must agree on partner_id/brand_id/gender/categories/names->>''fr'' — enforced below as a second, independent check, not only in application code.';

-- Mirrors validateStyleGroups() in style-group.js: on insert or update
-- of a styled Product, compares it against one existing sibling in the
-- same style_id (if any) — comparing against just one is sufficient
-- because the same trigger already guaranteed every existing member of
-- the group agrees with each other at their own insert/update time,
-- the same inductive argument fashion_products_sportswear_requires_
-- technical_purpose-style CHECK constraints rely on implicitly, made
-- explicit here since this needs a cross-row comparison a plain CHECK
-- cannot express.
create or replace function fashion.check_style_group_consistency() returns trigger as $$
declare
  v_sibling fashion.products%rowtype;
begin
  if new.style_id is null then
    return new;
  end if;

  select * into v_sibling
  from fashion.products
  where style_id = new.style_id and id <> new.id
  limit 1;

  if not found then
    return new; -- first Product in this style_id — nothing to compare against yet
  end if;

  if v_sibling.partner_id <> new.partner_id
    or v_sibling.brand_id <> new.brand_id
    or v_sibling.gender <> new.gender
    or v_sibling.categories <> new.categories
    or (v_sibling.names->>'fr') <> (new.names->>'fr')
  then
    raise exception 'style_id "%": product % disagrees with existing sibling % on partner/brand/gender/categories/name — a style group may only differ by size', new.style_id, new.id, v_sibling.id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_fashion_products_style_group_consistency
  before insert or update on fashion.products
  for each row
  execute function fashion.check_style_group_consistency();

comment on trigger trg_fashion_products_style_group_consistency on fashion.products is 'Mirrors validateStyleGroups() in style-group.js as a second, independent enforcement point.';
