-- ============================================================
-- Z Fashion — Product moderation v1 (task 8)
-- Shared ZOS database (infrastructure/supabase)
--
-- Decided 2026-10-17: a new product waits for a Z Fashion admin's
-- approval before it appears on the site. Only the first publication
-- is moderated: later changes (price, stock, photos) of an approved
-- product show at once, and an admin can withdraw any product at any
-- time with a note the store sees. A withdrawn or refused product goes
-- back to the queue when the store asks for a new review.
--
--  1. fashion.product_moderation_status: pending / approved / rejected.
--  2. fashion.products: moderation_status (new products start pending),
--     moderation_note (required when rejected, shown to the store),
--     moderated_at, moderated_by (the admin's auth user id),
--     submitted_at (when the product entered the queue).
--     Products that existed before this migration are approved: they
--     were already on the site.
--  3. set_cart_item() and checkout_cart(): a product that is not
--     approved cannot be added to a cart or ordered (same error as an
--     inactive store: product_unavailable). Bodies are those of
--     checkout v2 with that one extra condition.
-- ============================================================

create type fashion.product_moderation_status as enum ('pending', 'approved', 'rejected');

alter table fashion.products
  add column moderation_status fashion.product_moderation_status not null default 'pending',
  add column moderation_note text,
  add column moderated_at timestamptz,
  add column moderated_by uuid,
  add column submitted_at timestamptz not null default now();

update fashion.products
   set moderation_status = 'approved', moderated_at = now(), submitted_at = created_at;

alter table fashion.products
  add constraint fashion_products_rejection_needs_note check (
    moderation_status <> 'rejected' or (moderation_note is not null and length(btrim(moderation_note)) between 1 and 1000)
  ),
  add constraint fashion_products_moderation_note_length check (
    moderation_note is null or length(moderation_note) <= 1000
  );

create index fashion_products_moderation_queue_idx
  on fashion.products (submitted_at)
  where moderation_status = 'pending';

comment on column fashion.products.moderation_status is
  'pending: waits for a Z Fashion admin; approved: can appear on the site; rejected: refused or withdrawn, with moderation_note for the store.';
comment on column fashion.products.moderation_note is
  'Admin note shown to the store. Required when rejected.';

-- 3. Cart and checkout refuse products that are not approved.

create or replace function fashion.set_cart_item(
  p_client_user_id uuid,
  p_product_id uuid,
  p_quantity integer
)
returns uuid
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_cart_id uuid;
  v_partner_id uuid;
  v_partner_status text;
  v_moderation text;
  v_price integer;
  v_sellable integer;
begin
  if p_quantity is null or p_quantity < 0 or p_quantity > 10 then
    raise exception 'invalid_quantity' using detail = coalesce(p_quantity::text, 'null');
  end if;

  v_cart_id := fashion.open_cart_for_client(p_client_user_id);
  perform fashion.cancel_cart_pending_orders(v_cart_id);

  if p_quantity = 0 then
    delete from fashion.cart_items where cart_id = v_cart_id and product_id = p_product_id;
    return v_cart_id;
  end if;

  select p.partner_id, pa.onboarding_status::text, p.moderation_status::text
    into v_partner_id, v_partner_status, v_moderation
  from fashion.products p
  join fashion.partners pa on pa.id = p.partner_id
  where p.id = p_product_id;

  if not found or v_partner_status <> 'active' or v_moderation <> 'approved' then
    raise exception 'product_unavailable' using detail = p_product_id::text;
  end if;

  v_price := fashion.current_price(p_product_id);
  if v_price is null then
    raise exception 'product_unavailable' using detail = p_product_id::text;
  end if;

  select quantity_available - quantity_reserved into v_sellable
  from fashion.stock where product_id = p_product_id;
  if coalesce(v_sellable, 0) < p_quantity then
    raise exception 'insufficient_stock'
      using detail = p_product_id::text, hint = coalesce(v_sellable, 0)::text;
  end if;

  insert into fashion.cart_items (cart_id, product_id, partner_id, quantity, unit_price_minor_units)
  values (v_cart_id, p_product_id, v_partner_id, p_quantity, v_price)
  on conflict (cart_id, product_id) do update
    set quantity = excluded.quantity,
        unit_price_minor_units = excluded.unit_price_minor_units,
        partner_id = excluded.partner_id,
        updated_at = now();

  return v_cart_id;
end;
$$;

create or replace function fashion.checkout_cart(
  p_client_user_id uuid,
  p_address_id uuid,
  p_allowed_countries text[] default array['FR'],
  p_hold_seconds integer default 1800
)
returns uuid
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_cart_id uuid;
  v_address fashion.client_addresses%rowtype;
  v_item record;
  v_price integer;
  v_partner_status text;
  v_sellable integer;
  v_order_id uuid;
  v_order_item_id uuid;
  v_reservation_id uuid;
  v_subtotal integer := 0;
  v_shipping integer := 0; -- delivery included at launch (checkout.js SHIPPING_FEE_MINOR_UNITS)
begin
  if p_hold_seconds is null or p_hold_seconds < 60 or p_hold_seconds > 86400 then
    raise exception 'checkout_cart: hold must be between 60 and 86400 seconds';
  end if;

  perform fashion.expire_pending_orders();

  select id into v_cart_id from fashion.carts
  where client_user_id = p_client_user_id and checked_out_at is null
  for update;
  if not found or not exists (select 1 from fashion.cart_items where cart_id = v_cart_id) then
    raise exception 'empty_cart';
  end if;

  perform fashion.cancel_cart_pending_orders(v_cart_id);

  select * into v_address from fashion.client_addresses
  where id = p_address_id and client_user_id = p_client_user_id and type = 'shipping';
  if not found then
    raise exception 'address_not_found' using detail = coalesce(p_address_id::text, 'null');
  end if;
  if not (v_address.country_iso = any (coalesce(p_allowed_countries, array['FR']))) then
    raise exception 'shipping_country_not_served' using detail = v_address.country_iso;
  end if;

  insert into fashion.orders (
    cart_id, client_user_id, total_minor_units, status, shipping_address, payment_expires_at
  ) values (
    v_cart_id, p_client_user_id, 0, 'pending_payment',
    jsonb_build_object(
      'recipientName', v_address.recipient_name,
      'line1', v_address.line1,
      'line2', v_address.line2,
      'postalCode', v_address.postal_code,
      'city', v_address.city,
      'countryIso', v_address.country_iso
    ),
    now() + make_interval(secs => p_hold_seconds)
  ) returning id into v_order_id;

  for v_item in
    select ci.id, ci.product_id, ci.quantity, p.partner_id, p.moderation_status::text as moderation
    from fashion.cart_items ci
    join fashion.products p on p.id = ci.product_id
    where ci.cart_id = v_cart_id
    order by ci.product_id
  loop
    select onboarding_status::text into v_partner_status from fashion.partners where id = v_item.partner_id;
    v_price := fashion.current_price(v_item.product_id);
    if v_partner_status is distinct from 'active' or v_item.moderation is distinct from 'approved' or v_price is null then
      raise exception 'product_unavailable' using detail = v_item.product_id::text;
    end if;

    -- Current price, never the price seen when the line was added.
    update fashion.cart_items
      set unit_price_minor_units = v_price, partner_id = v_item.partner_id, updated_at = now()
      where id = v_item.id;

    select quantity_available - quantity_reserved into v_sellable
    from fashion.stock where product_id = v_item.product_id
    for update;
    if coalesce(v_sellable, 0) < v_item.quantity then
      raise exception 'insufficient_stock'
        using detail = v_item.product_id::text, hint = coalesce(v_sellable, 0)::text;
    end if;

    insert into fashion.order_items (
      order_id, source_cart_item_id, product_id, partner_id,
      quantity, unit_price_minor_units, line_total_minor_units
    ) values (
      v_order_id, v_item.id, v_item.product_id, v_item.partner_id,
      v_item.quantity, v_price, v_price * v_item.quantity
    ) returning id into v_order_item_id;

    v_reservation_id := fashion.reserve_stock(v_item.product_id, v_item.quantity, p_hold_seconds);

    insert into fashion.order_reservations (order_id, cart_item_id, reservation_id, order_item_id)
    values (v_order_id, v_item.id, v_reservation_id, v_order_item_id);

    v_subtotal := v_subtotal + v_price * v_item.quantity;
  end loop;

  insert into fashion.order_tickets (
    order_id, partner_id, subtotal_minor_units, item_count, commission_rate_percent, commission_minor_units
  )
  select
    v_order_id,
    oi.partner_id,
    sum(oi.line_total_minor_units)::integer,
    sum(oi.quantity)::integer,
    fashion.ticket_commission_rate_percent(sum(oi.line_total_minor_units)::bigint),
    fashion.ticket_commission_owed_minor_units(sum(oi.line_total_minor_units)::bigint)::integer
  from fashion.order_items oi
  where oi.order_id = v_order_id
  group by oi.partner_id;

  update fashion.orders
    set subtotal_minor_units = v_subtotal,
        shipping_minor_units = v_shipping,
        total_minor_units = v_subtotal + v_shipping
    where id = v_order_id;

  return v_order_id;
end;
$$;

revoke all on function fashion.set_cart_item(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function fashion.checkout_cart(uuid, uuid, text[], integer) from public, anon, authenticated;
