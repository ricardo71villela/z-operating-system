-- ============================================================
-- Z FASHION — Product photos and store logos v1
--
-- 1. fashion.product_images: one row per photo of a product, ordered
--    by position (0 = cover). At most 8 per product (trigger). Written
--    only by the Partner API's privileged connection, which checks the
--    store owns the product before writing and validates the file
--    (fashion-domain/src/media.js: JPEG/PNG/WebP by content, 5 MB).
-- 2. Storage bucket zfashion-media, PUBLIC READ: photos and logos are
--    shown on the public storefront. No storage policy grants anon or
--    authenticated users any write: only the Partner API (server-side
--    secret key) writes, under partners/<partnerId>/..., paths built
--    from ids only.
--
-- Additive only. The bucket insert follows the same guarded pattern as
-- the Z Find baseline (storage schema may be absent in CI).
-- ============================================================

create table if not exists fashion.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references fashion.products(id) on delete cascade,
  partner_id uuid not null references fashion.partners(id) on delete cascade,
  storage_path text not null unique
    check (storage_path ~ '^partners/[0-9a-f-]{36}/products/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

comment on table fashion.product_images is
  'Photos of a product, ordered by position (0 = cover shown on listings). Files live in the public Storage bucket zfashion-media at storage_path. Max 8 per product.';

create index if not exists fashion_product_images_product_idx
  on fashion.product_images (product_id, position, created_at);

alter table fashion.product_images enable row level security;
revoke all on table fashion.product_images from public, anon, authenticated, service_role;

-- Product and image must belong to the same store.
create or replace function fashion.check_product_image()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_owner uuid;
  v_count integer;
begin
  select p.partner_id into v_owner from fashion.products p where p.id = new.product_id;
  if v_owner is distinct from new.partner_id then
    raise exception 'product_image: product % does not belong to partner %', new.product_id, new.partner_id
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('fashion_product_images:' || new.product_id::text, 0));
    select count(*) into v_count from fashion.product_images i where i.product_id = new.product_id;
    if v_count >= 8 then
      raise exception 'product_image_limit: a product has at most 8 photos'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fashion_product_images_check on fashion.product_images;
create trigger trg_fashion_product_images_check
  before insert or update of product_id, partner_id on fashion.product_images
  for each row execute function fashion.check_product_image();


do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('zfashion-media', 'zfashion-media', true)
    on conflict (id) do update set public = true;

    -- On real Supabase the bucket also enforces size and type limits.
    if exists (select 1 from information_schema.columns
               where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
      execute $sql$update storage.buckets set file_size_limit = 5242880 where id = 'zfashion-media'$sql$;
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
      execute $sql$update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id = 'zfashion-media'$sql$;
    end if;
  end if;
end;
$$;
