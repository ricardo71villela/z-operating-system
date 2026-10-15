-- ============================================================
-- Z Fashion — Cart & Checkout v2 (task 10 of the launch list)
-- Shared ZOS database (infrastructure/supabase)
--
-- Turns the cart/order primitives of cart_checkout_v1 and
-- order_authority_v1 into what the API needs to sell:
--
--  1. One open Cart per Client (carts.checked_out_at), one line per
--     product (unique cart_id, product_id). A Cart is closed when one
--     of its Orders is paid.
--  2. The Order snapshot no longer depends on Cart lines: removing a
--     line after a cancelled checkout is allowed (FKs from order_items
--     / order_reservations to cart_items become ON DELETE SET NULL;
--     order_reservations is keyed by order_item_id).
--  3. Orders carry the Client, currency, subtotal, delivery fee, a
--     frozen shipping address and a payment deadline.
--  4. fashion.order_tickets: one row per store and Order, with the
--     commission computed with the ticket tiers (pricing v2) at
--     checkout time — the store's own sales and what it owes.
--  5. Commands: set_cart_item(), checkout_cart(), cancel_unpaid_order(),
--     expire_pending_orders(). checkout_cart() reprices every line at
--     the CURRENT price, refuses inactive stores, and reserves stock
--     all-or-nothing for the payment window (30 min by default).
--
-- Mirrors fashion-domain/src/checkout.js. Error messages start with a
-- stable key (insufficient_stock, product_unavailable, empty_cart,
-- address_not_found, shipping_country_not_served,
-- payment_in_progress, invalid_quantity, order_not_cancellable); the
-- product id is in DETAIL where relevant. The API maps them to HTTP.
--
-- The tables were empty in production when this was written (no Cart
-- or Order had ever been created), so the NOT NULL additions need no
-- backfill.
-- ============================================================

-- ---------- 1. Carts: one open cart per client, one line per product ----------
alter table fashion.carts add column checked_out_at timestamptz;

create unique index uq_fashion_carts_one_open_per_client
  on fashion.carts(client_user_id) where checked_out_at is null;

alter table fashion.cart_items
  add constraint cart_items_cart_product_key unique (cart_id, product_id);

alter table fashion.cart_items
  add column updated_at timestamptz not null default now();

-- ---------- 2. Order snapshot independent from Cart lines ----------
alter table fashion.order_items drop constraint order_items_source_cart_item_id_fkey;
alter table fashion.order_items
  add constraint order_items_source_cart_item_id_fkey
  foreign key (source_cart_item_id) references fashion.cart_items(id) on delete set null;

alter table fashion.order_reservations drop constraint order_reservations_pkey;
alter table fashion.order_reservations drop constraint order_reservations_cart_item_id_fkey;
alter table fashion.order_reservations alter column cart_item_id drop not null;
alter table fashion.order_reservations
  add constraint order_reservations_cart_item_id_fkey
  foreign key (cart_item_id) references fashion.cart_items(id) on delete set null;
alter table fashion.order_reservations alter column order_item_id set not null;
alter table fashion.order_reservations add primary key (order_id, order_item_id);

-- ---------- 3. Order: client, amounts, address, payment deadline ----------
alter table fashion.orders add column client_user_id uuid not null references auth.users(id);
alter table fashion.orders add column currency text not null default 'eur' check (currency = 'eur');
alter table fashion.orders add column subtotal_minor_units integer not null default 0 check (subtotal_minor_units >= 0);
alter table fashion.orders add column shipping_minor_units integer not null default 0 check (shipping_minor_units >= 0);
alter table fashion.orders add column shipping_address jsonb;
alter table fashion.orders add column payment_expires_at timestamptz;

create index idx_fashion_orders_client on fashion.orders(client_user_id, created_at desc);
create index idx_fashion_orders_pending_expiry on fashion.orders(payment_expires_at) where status = 'pending_payment';

comment on column fashion.orders.shipping_address is
  'Frozen copy of the Client''s shipping address at checkout (recipientName, line1, line2, postalCode, city, countryIso). Later address-book edits never change it.';
comment on column fashion.orders.payment_expires_at is
  'End of the stock hold. An Order still unpaid after this (and not processing) is cancelled by fashion.expire_pending_orders().';

-- Legacy fashion.attempt_checkout() does not know client_user_id: take it from the Cart.
create or replace function fashion.fill_order_client()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.client_user_id is null then
    select c.client_user_id into new.client_user_id from fashion.carts c where c.id = new.cart_id;
  end if;
  return new;
end;
$$;

create trigger trg_fashion_orders_fill_client
  before insert on fashion.orders
  for each row execute function fashion.fill_order_client();

-- A paid Order closes its Cart; the Client's next add opens a new one.
create or replace function fashion.close_cart_when_paid()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update fashion.carts set checked_out_at = now()
    where id = new.cart_id and checked_out_at is null;
  end if;
  return new;
end;
$$;

create trigger trg_fashion_orders_close_cart
  after update of status on fashion.orders
  for each row execute function fashion.close_cart_when_paid();

-- ---------- 4. One ticket per store and Order ----------
create table fashion.order_tickets (
  order_id uuid not null references fashion.orders(id) on delete cascade,
  partner_id uuid not null references fashion.partners(id),
  subtotal_minor_units integer not null check (subtotal_minor_units >= 0),
  item_count integer not null check (item_count > 0),
  commission_rate_percent integer not null check (commission_rate_percent between 0 and 100),
  commission_minor_units integer not null check (commission_minor_units >= 0),
  created_at timestamptz not null default now(),
  primary key (order_id, partner_id)
);

create index idx_fashion_order_tickets_partner on fashion.order_tickets(partner_id, created_at desc);

comment on table fashion.order_tickets is
  'What one store sells in one Order (its "ticket") and the commission Z Fashion takes on it, rate chosen by the ticket amount (fashion.ticket_commission_tiers). Frozen at checkout; counts as a sale only once the Order is paid.';

alter table fashion.order_tickets enable row level security;
revoke all on table fashion.order_tickets from public, anon, authenticated, service_role;

-- ---------- 5. Commands ----------

-- Cancels an unpaid Order and releases its stock. Refuses when the
-- payment is being processed or has succeeded (refund path instead).
create or replace function fashion.cancel_unpaid_order(p_order_id uuid)
returns uuid
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_order fashion.orders%rowtype;
begin
  select * into v_order from fashion.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using detail = p_order_id::text;
  end if;
  if v_order.status = 'cancelled' then
    return p_order_id;
  end if;
  if v_order.status <> 'pending_payment' then
    raise exception 'order_not_cancellable' using detail = v_order.status;
  end if;
  if v_order.payment_status in ('processing', 'succeeded') then
    raise exception 'payment_in_progress' using detail = p_order_id::text;
  end if;
  return fashion.cancel_pending_order(p_order_id);
end;
$$;

-- Cancels every unpaid Order whose hold has run out. Safe to call often
-- (the API calls it before reading a Cart and before each checkout).
create or replace function fashion.expire_pending_orders()
returns integer
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select id from fashion.orders
    where status = 'pending_payment'
      and payment_expires_at is not null
      and payment_expires_at <= now()
      and payment_status in ('requires_payment_method', 'requires_confirmation', 'failed')
    order by payment_expires_at
    for update skip locked
  loop
    perform fashion.cancel_pending_order(v_order.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Returns the Client's open Cart id, creating it if needed.
create or replace function fashion.open_cart_for_client(p_client_user_id uuid)
returns uuid
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_cart_id uuid;
begin
  select id into v_cart_id from fashion.carts
  where client_user_id = p_client_user_id and checked_out_at is null
  for update;
  if found then
    return v_cart_id;
  end if;
  insert into fashion.carts (client_user_id) values (p_client_user_id)
  on conflict (client_user_id) where checked_out_at is null do nothing
  returning id into v_cart_id;
  if v_cart_id is null then
    select id into v_cart_id from fashion.carts
    where client_user_id = p_client_user_id and checked_out_at is null
    for update;
  end if;
  return v_cart_id;
end;
$$;

-- Any unpaid Order of this Cart is cancelled when the Cart changes or
-- is checked out again, so stock is never held twice for one Client.
create or replace function fashion.cancel_cart_pending_orders(p_cart_id uuid)
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_order record;
begin
  for v_order in
    select id from fashion.orders
    where cart_id = p_cart_id and status = 'pending_payment'
    order by created_at
  loop
    perform fashion.cancel_unpaid_order(v_order.id);
  end loop;
end;
$$;

-- Sets the quantity of one product in the Client's open Cart (0 removes).
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

  select p.partner_id, pa.onboarding_status::text
    into v_partner_id, v_partner_status
  from fashion.products p
  join fashion.partners pa on pa.id = p.partner_id
  where p.id = p_product_id;

  if not found or v_partner_status <> 'active' then
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

-- Checks out the Client's open Cart: pending-payment Order, frozen
-- lines, frozen address, one ticket per store, stock held until
-- payment_expires_at. All-or-nothing: any error undoes everything.
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
    select ci.id, ci.product_id, ci.quantity, p.partner_id
    from fashion.cart_items ci
    join fashion.products p on p.id = ci.product_id
    where ci.cart_id = v_cart_id
    order by ci.product_id
  loop
    select onboarding_status::text into v_partner_status from fashion.partners where id = v_item.partner_id;
    v_price := fashion.current_price(v_item.product_id);
    if v_partner_status is distinct from 'active' or v_price is null then
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

comment on function fashion.checkout_cart(uuid, uuid, text[], integer) is
  'Mirrors checkout.js priceCart()/ticketsFor(): reprices at current price, refuses inactive stores, reserves stock all-or-nothing for the payment window, freezes lines, address and per-store tickets. Creates a pending_payment Order; payment (Stripe) confirms it via fashion.confirm_order_payment().';

revoke all on function fashion.fill_order_client() from public, anon, authenticated;
revoke all on function fashion.close_cart_when_paid() from public, anon, authenticated;
revoke all on function fashion.cancel_unpaid_order(uuid) from public, anon, authenticated;
revoke all on function fashion.expire_pending_orders() from public, anon, authenticated;
revoke all on function fashion.open_cart_for_client(uuid) from public, anon, authenticated;
revoke all on function fashion.cancel_cart_pending_orders(uuid) from public, anon, authenticated;
revoke all on function fashion.set_cart_item(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function fashion.checkout_cart(uuid, uuid, text[], integer) from public, anon, authenticated;
