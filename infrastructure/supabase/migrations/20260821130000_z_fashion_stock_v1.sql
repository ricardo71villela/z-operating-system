-- ============================================================
-- Z Fashion — Stock & Reservations v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors fashion-domain/src/stock.js, with one addition JS alone
-- cannot provide: real row-level locking (SELECT ... FOR UPDATE)
-- against concurrent reservation attempts on the same Product —
-- the actual mechanism that makes "all-or-nothing across Partners"
-- (cart.js) safe when two Clients try to buy the last unit at once.
-- See STOCK-FEED-CONTRACT.md for the full rationale.
-- ============================================================

create table fashion.stock (
  product_id uuid primary key references fashion.products(id) on delete cascade,
  quantity_available integer not null default 0 check (quantity_available >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  last_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint fashion_stock_reserved_not_exceeding_available check (quantity_reserved <= quantity_available)
);

comment on table fashion.stock is 'Mirrors stock.js''s Stock record. quantity_reserved can never exceed quantity_available — this is the same invariant sellableQuantity() protects in JS, enforced here independently.';

alter table fashion.stock enable row level security;

-- Stale-update rejection: only fires when quantity_available itself is
-- being changed by a Partner feed push (not when a reservation merely
-- changes quantity_reserved) — mirrors applyStockUpdate()'s exact rule.
create or replace function fashion.check_stock_update_not_stale() returns trigger as $$
begin
  -- Only fires when the caller is asserting a NEW observation time (a
  -- Partner feed push) — confirm_reservation() legitimately reduces
  -- quantity_available on a completed sale without touching
  -- last_updated_at at all, and must never be caught by this check.
  if new.last_updated_at is distinct from old.last_updated_at then
    if old.last_updated_at is not null and new.last_updated_at <= old.last_updated_at then
      raise exception 'stale update rejected — observed_at (%) is not newer than the currently applied timestamp (%)', new.last_updated_at, old.last_updated_at;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger fashion_stock_check_not_stale
  before update on fashion.stock
  for each row execute function fashion.check_stock_update_not_stale();

create table fashion.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references fashion.products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'released', 'confirmed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table fashion.stock_reservations is 'Checkout-time holds — the mechanism that actually prevents oversell between Partner feed pushes (STOCK-FEED-CONTRACT.md). One row per line item reserved, released on abandoned checkout, confirmed on completed sale.';

alter table fashion.stock_reservations enable row level security;

create index idx_fashion_stock_reservations_product_active
  on fashion.stock_reservations(product_id) where status = 'active';

-- Reserves stock for a single Product, row-locked against concurrent
-- reservation attempts (the real answer to "two Clients buy the last
-- unit at once" — cart.js's attemptCheckoutReservation() calls this once
-- per line item and must roll back on any failure, same as the JS version).
create or replace function fashion.reserve_stock(
  p_product_id uuid,
  p_quantity integer,
  p_hold_seconds integer default 600
) returns uuid as $$
declare
  v_available integer;
  v_reserved integer;
  v_reservation_id uuid;
begin
  if p_quantity <= 0 then
    raise exception 'reserve_stock: quantity must be positive';
  end if;

  select quantity_available, quantity_reserved
    into v_available, v_reserved
    from fashion.stock
    where product_id = p_product_id
    for update;

  if not found then
    raise exception 'reserve_stock: no stock record for product %', p_product_id;
  end if;

  if (v_available - v_reserved) < p_quantity then
    raise exception 'reserve_stock: insufficient stock — requested %, % sellable', p_quantity, (v_available - v_reserved);
  end if;

  update fashion.stock
    set quantity_reserved = quantity_reserved + p_quantity
    where product_id = p_product_id;

  insert into fashion.stock_reservations (product_id, quantity, expires_at)
    values (p_product_id, p_quantity, now() + make_interval(secs => p_hold_seconds))
    returning id into v_reservation_id;

  return v_reservation_id;
end;
$$ language plpgsql;

create or replace function fashion.release_reservation(p_reservation_id uuid) returns void as $$
declare
  v_product_id uuid;
  v_quantity integer;
begin
  select product_id, quantity into v_product_id, v_quantity
    from fashion.stock_reservations
    where id = p_reservation_id and status = 'active'
    for update;

  if not found then
    raise exception 'release_reservation: no active reservation %', p_reservation_id;
  end if;

  update fashion.stock_reservations set status = 'released' where id = p_reservation_id;
  update fashion.stock set quantity_reserved = greatest(0, quantity_reserved - v_quantity)
    where product_id = v_product_id;
end;
$$ language plpgsql;

create or replace function fashion.confirm_reservation(p_reservation_id uuid) returns void as $$
declare
  v_product_id uuid;
  v_quantity integer;
begin
  select product_id, quantity into v_product_id, v_quantity
    from fashion.stock_reservations
    where id = p_reservation_id and status = 'active'
    for update;

  if not found then
    raise exception 'confirm_reservation: no active reservation %', p_reservation_id;
  end if;

  update fashion.stock_reservations set status = 'confirmed' where id = p_reservation_id;
  update fashion.stock
    set quantity_available = greatest(0, quantity_available - v_quantity),
        quantity_reserved = greatest(0, quantity_reserved - v_quantity)
    where product_id = v_product_id;
end;
$$ language plpgsql;
