-- ============================================================
-- Z Fashion — Cart & Checkout v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors fashion-domain/src/cart.js's attemptCheckoutReservation()
-- exactly: a single Order spans however many Partners the Cart
-- touches, but reservation across all line items is all-or-nothing.
-- Where cart.js has to manually roll back reservations it already
-- made in the same attempt, SQL gets this almost for free — the
-- whole function runs inside one transaction, and any RAISE
-- EXCEPTION inside a PL/pgSQL function automatically rolls back
-- every change made earlier in that same function call. This is the
-- one place where the database version is structurally safer than
-- the pure-JS version, not just an independent re-check of it.
-- ============================================================

create table fashion.carts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

comment on table fashion.carts is 'A Client''s cart. Deliberately minimal — line items live in fashion.cart_items, Partner splits are a query (partnerSplits() in cart.js), never a stored copy.';

alter table fashion.carts enable row level security;

create table fashion.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references fashion.carts(id) on delete cascade,
  product_id uuid not null references fashion.products(id),
  partner_id uuid not null references fashion.partners(id),
  quantity integer not null check (quantity > 0),
  unit_price_minor_units integer not null check (unit_price_minor_units >= 0),
  created_at timestamptz not null default now()
);

comment on table fashion.cart_items is 'Mirrors cart.js addItem(). partner_id is denormalized from product_id at add-time (mirrors the JS shape exactly) — this is what makes partnerSplits()-style grouping a simple GROUP BY, never a join surprise.';

alter table fashion.cart_items enable row level security;

create index idx_fashion_cart_items_cart on fashion.cart_items(cart_id);

create table fashion.orders (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references fashion.carts(id),
  total_minor_units integer not null check (total_minor_units >= 0),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

comment on table fashion.orders is 'Created only after attempt_checkout() successfully reserves every line item across every Partner the Cart touches — see that function for the all-or-nothing guarantee.';

alter table fashion.orders enable row level security;

create table fashion.order_reservations (
  order_id uuid not null references fashion.orders(id) on delete cascade,
  cart_item_id uuid not null references fashion.cart_items(id),
  reservation_id uuid not null references fashion.stock_reservations(id),
  primary key (order_id, cart_item_id)
);

comment on table fashion.order_reservations is 'Links each Order line item to the specific fashion.stock_reservations row that holds its stock — needed so a later cancellation/fulfillment step can confirm or release the exact right reservation per item.';

alter table fashion.order_reservations enable row level security;

-- Attempts to check out an entire Cart: reserves stock for every line
-- item, spanning however many Partners it touches. All-or-nothing by
-- construction — if fashion.reserve_stock() raises on any item (either
-- "no stock record" or "insufficient stock", both raised as exceptions
-- by that function), the entire transaction this function runs in is
-- rolled back automatically, including any reservations already made
-- earlier in the loop. No cart.js-style manual rollback loop is needed;
-- Postgres provides it for free via transactional exception handling.
create or replace function fashion.attempt_checkout(p_cart_id uuid) returns uuid as $$
declare
  v_item record;
  v_reservation_id uuid;
  v_order_id uuid;
  v_total integer := 0;
begin
  if not exists (select 1 from fashion.cart_items where cart_id = p_cart_id) then
    raise exception 'attempt_checkout: cart % has no items', p_cart_id;
  end if;

  insert into fashion.orders (cart_id, total_minor_units)
    values (p_cart_id, 0)
    returning id into v_order_id;

  for v_item in
    select id, product_id, quantity, unit_price_minor_units
    from fashion.cart_items
    where cart_id = p_cart_id
  loop
    -- Raises on insufficient stock or missing record — propagates out of
    -- this function, aborting the transaction, undoing the order insert
    -- above and every reservation already made in this loop.
    v_reservation_id := fashion.reserve_stock(v_item.product_id, v_item.quantity);

    insert into fashion.order_reservations (order_id, cart_item_id, reservation_id)
      values (v_order_id, v_item.id, v_reservation_id);

    v_total := v_total + (v_item.unit_price_minor_units * v_item.quantity);
  end loop;

  update fashion.orders set total_minor_units = v_total where id = v_order_id;

  return v_order_id;
end;
$$ language plpgsql;

comment on function fashion.attempt_checkout is 'Mirrors attemptCheckoutReservation() in cart.js. All-or-nothing across every Partner the Cart touches — a single RAISE EXCEPTION anywhere in the loop unwinds the entire transaction, including reservations already made for other Partners'' items in the same checkout attempt.';
