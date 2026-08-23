-- ============================================================
-- Z Fashion — Stock Persistence v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Closes the first of three "Still open" items honestly flagged in
-- STOCK-FEED-CONTRACT.md (2026-08-21): Stock was the one entity in the
-- entire Fashion schema with no Postgres table at all — both the
-- single-item and bulk stock endpoints stayed in-memory in every mode,
-- unlike every other entity here. Mirrors stock.js exactly: the same
-- staleness-rejection rule for applyStockUpdate(), and the same
-- reservation/release/confirm shape reserveStock()/
-- releaseReservation()/confirmReservation() already define — this
-- migration does not redesign the model, only gives it a real table.
--
-- Concurrency: reserve_stock() uses `select ... for update` to lock the
-- Stock row before checking sellable quantity — the same discipline
-- attempt_checkout() already uses elsewhere in this schema (multi-
-- Partner checkout), preventing two concurrent checkouts from both
-- reserving the last unit.
-- ============================================================

create table fashion.stock (
  product_id uuid primary key references fashion.products(id),
  quantity_available integer not null default 0 check (quantity_available >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  last_updated_at timestamptz
);

comment on table fashion.stock is 'Mirrors stock.js''s Stock record (initStock()/applyStockUpdate() shape) — one row per Product, created lazily on first update, never assumed to exist.';

alter table fashion.stock enable row level security;

create table fashion.stock_reservations (
  id text primary key,
  product_id uuid not null references fashion.stock(product_id),
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table fashion.stock_reservations is 'Mirrors the reservation object reserveStock() returns in stock.js. A row here corresponds exactly to quantity_reserved on the owning fashion.stock row — every insert/delete must keep both in sync in the same transaction, enforced by the functions below, never by application-layer bookkeeping alone.';

alter table fashion.stock_reservations enable row level security;

create index idx_fashion_stock_reservations_product on fashion.stock_reservations(product_id);

-- Mirrors applyStockUpdate() in stock.js: creates the row lazily on
-- first update (initStock() equivalent), rejects a stale update
-- (observedAt at or before the currently applied timestamp) rather
-- than silently overwriting — same error condition, raised as an
-- exception rather than returned, since this is a SQL function, not a
-- pure JS transform.
create or replace function fashion.apply_stock_update(
  p_product_id uuid,
  p_quantity_available integer,
  p_observed_at timestamptz
) returns fashion.stock as $$
declare
  v_current fashion.stock%rowtype;
  v_result fashion.stock%rowtype;
begin
  if p_quantity_available < 0 then
    raise exception 'apply_stock_update: quantityAvailable must be a non-negative number';
  end if;
  if p_observed_at is null then
    raise exception 'apply_stock_update: observedAt is required — every update must be timestamped';
  end if;

  select * into v_current from fashion.stock where product_id = p_product_id for update;

  if found and v_current.last_updated_at is not null and p_observed_at <= v_current.last_updated_at then
    raise exception 'apply_stock_update: stale update rejected — observedAt (%) is not newer than the currently applied timestamp (%)', p_observed_at, v_current.last_updated_at;
  end if;

  insert into fashion.stock (product_id, quantity_available, last_updated_at)
  values (p_product_id, p_quantity_available, p_observed_at)
  on conflict (product_id) do update
    set quantity_available = excluded.quantity_available,
        last_updated_at = excluded.last_updated_at
  returning * into v_result;

  return v_result;
end;
$$ language plpgsql;

comment on function fashion.apply_stock_update is 'Mirrors applyStockUpdate() in stock.js.';

-- Mirrors reserveStock() in stock.js: locks the Stock row first (FOR
-- UPDATE), same discipline attempt_checkout() already uses for
-- multi-Partner checkout elsewhere in this schema — two concurrent
-- calls for the same Product can never both succeed past the sellable
-- check, one always waits for the other's transaction to commit or
-- roll back first.
create or replace function fashion.reserve_stock(
  p_product_id uuid,
  p_quantity integer,
  p_hold_seconds integer default 600,
  p_reservation_id text default null
) returns fashion.stock_reservations as $$
declare
  v_stock fashion.stock%rowtype;
  v_sellable integer;
  v_reservation_id text;
  v_result fashion.stock_reservations%rowtype;
begin
  if p_quantity <= 0 then
    raise exception 'reserve_stock: quantity must be positive';
  end if;

  select * into v_stock from fashion.stock where product_id = p_product_id for update;
  if not found then
    raise exception 'reserve_stock: no stock record for product %', p_product_id;
  end if;

  v_sellable := v_stock.quantity_available - v_stock.quantity_reserved;
  if v_sellable < p_quantity then
    raise exception 'reserve_stock: insufficient stock — requested %, % sellable', p_quantity, v_sellable;
  end if;

  v_reservation_id := coalesce(p_reservation_id, 'res_' || p_product_id::text || '_' || extract(epoch from now())::text);

  insert into fashion.stock_reservations (id, product_id, quantity, expires_at)
  values (v_reservation_id, p_product_id, p_quantity, now() + (p_hold_seconds || ' seconds')::interval)
  returning * into v_result;

  update fashion.stock set quantity_reserved = quantity_reserved + p_quantity where product_id = p_product_id;

  return v_result;
end;
$$ language plpgsql;

comment on function fashion.reserve_stock is 'Mirrors reserveStock() in stock.js. Row-locks fashion.stock before checking sellable quantity — same concurrency discipline as attempt_checkout().';

-- Mirrors releaseReservation() in stock.js — an expired hold or
-- abandoned checkout, never a sale.
create or replace function fashion.release_stock_reservation(p_reservation_id text) returns void as $$
declare
  v_reservation fashion.stock_reservations%rowtype;
begin
  select * into v_reservation from fashion.stock_reservations where id = p_reservation_id for update;
  if not found then
    return; -- already released/confirmed — releasing twice is a no-op, never an error
  end if;

  update fashion.stock
  set quantity_reserved = greatest(0, quantity_reserved - v_reservation.quantity)
  where product_id = v_reservation.product_id;

  delete from fashion.stock_reservations where id = p_reservation_id;
end;
$$ language plpgsql;

comment on function fashion.release_stock_reservation is 'Mirrors releaseReservation() in stock.js.';

-- Mirrors confirmReservation() in stock.js — commits the deduction as
-- a completed sale.
create or replace function fashion.confirm_stock_reservation(p_reservation_id text) returns void as $$
declare
  v_reservation fashion.stock_reservations%rowtype;
begin
  select * into v_reservation from fashion.stock_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'confirm_stock_reservation: no reservation with id %', p_reservation_id;
  end if;

  update fashion.stock
  set quantity_available = greatest(0, quantity_available - v_reservation.quantity),
      quantity_reserved = greatest(0, quantity_reserved - v_reservation.quantity)
  where product_id = v_reservation.product_id;

  delete from fashion.stock_reservations where id = p_reservation_id;
end;
$$ language plpgsql;

comment on function fashion.confirm_stock_reservation is 'Mirrors confirmReservation() in stock.js.';
