-- ============================================================
-- Z Fashion — Order commercial authority v1
-- Forward-only, source validation only. No live DB mutation here.
--
-- Closes two checkout integrity gaps:
-- 1) attempt_checkout() previously created orders as "confirmed" while
--    payment_status still defaulted to requires_payment_method.
-- 2) an Order had no immutable line snapshot; its historical commercial
--    truth still depended on the mutable Cart/cart_items graph.
--
-- Shipment remains the per-Partner physical fulfillment authority.
-- Return remains the per-item reverse-logistics authority.
-- Order owns payment/commercial aggregate state only.
-- ============================================================

-- ---------- 1. Immutable Order line snapshot ----------
create table fashion.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references fashion.orders(id) on delete cascade,
  source_cart_item_id uuid references fashion.cart_items(id),
  product_id uuid not null references fashion.products(id),
  partner_id uuid not null references fashion.partners(id),
  quantity integer not null check (quantity > 0),
  unit_price_minor_units integer not null check (unit_price_minor_units >= 0),
  line_total_minor_units integer not null check (line_total_minor_units >= 0),
  created_at timestamptz not null default now(),
  unique (order_id, source_cart_item_id)
);

comment on table fashion.order_items is
'Immutable commercial snapshot of the Cart at checkout. Order history never depends on later Cart/cart_items changes.';

alter table fashion.order_items enable row level security;
create index idx_fashion_order_items_order on fashion.order_items(order_id);
create index idx_fashion_order_items_partner on fashion.order_items(order_id, partner_id);

alter table fashion.order_reservations
  add column order_item_id uuid references fashion.order_items(id);

create unique index idx_fashion_order_reservations_order_item
  on fashion.order_reservations(order_item_id)
  where order_item_id is not null;

-- ---------- 2. Order commercial lifecycle ----------
alter table fashion.orders drop constraint if exists orders_status_check;

-- Forward-compatible mapping for any pre-production rows that may exist.
-- A historical "confirmed" row is only truly paid when the independent
-- payment authority says succeeded; otherwise it becomes pending_payment.
update fashion.orders
set status = case
  when payment_status = 'succeeded' then 'paid'
  else 'pending_payment'
end
where status = 'confirmed';

alter table fashion.orders
  alter column status set default 'pending_payment';

alter table fashion.orders
  add constraint orders_status_check check (
    status in (
      'pending_payment',
      'paid',
      'fulfilling',
      'fulfilled',
      'partially_refunded',
      'refunded',
      'cancelled'
    )
  );

alter table fashion.orders
  add column refunded_minor_units integer not null default 0
  check (refunded_minor_units >= 0 and refunded_minor_units <= total_minor_units);

create table fashion.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references fashion.orders(id) on delete cascade,
  status text not null check (
    status in (
      'pending_payment',
      'paid',
      'fulfilling',
      'fulfilled',
      'partially_refunded',
      'refunded',
      'cancelled'
    )
  ),
  recorded_at timestamptz not null default now()
);

alter table fashion.order_status_history enable row level security;
create index idx_fashion_order_status_history_order
  on fashion.order_status_history(order_id, recorded_at);

create or replace function fashion.check_order_status_transition()
returns trigger as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if not (
    (old.status = 'pending_payment' and new.status in ('paid', 'cancelled')) or
    (old.status = 'paid' and new.status in ('fulfilling', 'partially_refunded', 'refunded')) or
    (old.status = 'fulfilling' and new.status in ('fulfilled', 'partially_refunded', 'refunded')) or
    (old.status = 'fulfilled' and new.status in ('partially_refunded', 'refunded')) or
    (old.status = 'partially_refunded' and new.status = 'refunded')
  ) then
    raise exception 'fashion.orders: cannot move from "%" to "%"', old.status, new.status;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_fashion_orders_status_transition
  before update of status on fashion.orders
  for each row execute function fashion.check_order_status_transition();

create or replace function fashion.record_order_status_history()
returns trigger as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into fashion.order_status_history(order_id, status)
    values (new.id, new.status);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_fashion_orders_status_history
  after insert or update of status on fashion.orders
  for each row execute function fashion.record_order_status_history();

-- ---------- 3. Checkout now creates pending-payment Order + snapshots ----------
create or replace function fashion.attempt_checkout(p_cart_id uuid) returns uuid as $$
declare
  v_item record;
  v_reservation_id uuid;
  v_order_id uuid;
  v_order_item_id uuid;
  v_total integer := 0;
begin
  if not exists (select 1 from fashion.cart_items where cart_id = p_cart_id) then
    raise exception 'attempt_checkout: cart % has no items', p_cart_id;
  end if;

  insert into fashion.orders (cart_id, total_minor_units, status)
    values (p_cart_id, 0, 'pending_payment')
    returning id into v_order_id;

  for v_item in
    select id, product_id, partner_id, quantity, unit_price_minor_units
    from fashion.cart_items
    where cart_id = p_cart_id
    order by id
  loop
    insert into fashion.order_items (
      order_id,
      source_cart_item_id,
      product_id,
      partner_id,
      quantity,
      unit_price_minor_units,
      line_total_minor_units
    ) values (
      v_order_id,
      v_item.id,
      v_item.product_id,
      v_item.partner_id,
      v_item.quantity,
      v_item.unit_price_minor_units,
      v_item.unit_price_minor_units * v_item.quantity
    ) returning id into v_order_item_id;

    -- Any failure unwinds the whole PostgreSQL function transaction,
    -- including Order, snapshots and reservations across prior Partners.
    v_reservation_id := fashion.reserve_stock(v_item.product_id, v_item.quantity);

    insert into fashion.order_reservations (
      order_id,
      cart_item_id,
      reservation_id,
      order_item_id
    ) values (
      v_order_id,
      v_item.id,
      v_reservation_id,
      v_order_item_id
    );

    v_total := v_total + (v_item.unit_price_minor_units * v_item.quantity);
  end loop;

  update fashion.orders
  set total_minor_units = v_total
  where id = v_order_id;

  return v_order_id;
end;
$$ language plpgsql;

comment on function fashion.attempt_checkout(uuid) is
'Creates a pending_payment Order, immutable order_items snapshot and all-or-nothing stock reservations. It never marks an unpaid Order as confirmed/paid.';

-- ---------- 4. Payment success is the only stock-commit gate ----------
create or replace function fashion.confirm_order_payment(p_order_id uuid)
returns uuid as $$
declare
  v_order fashion.orders%rowtype;
  v_reservation record;
  v_split record;
  v_shipment_id uuid;
begin
  select * into v_order
  from fashion.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'confirm_order_payment: Order % not found', p_order_id;
  end if;

  -- Webhook retries are expected. Once paid, this command is a no-op.
  if v_order.status in ('paid', 'fulfilling', 'fulfilled', 'partially_refunded', 'refunded') then
    return p_order_id;
  end if;

  if v_order.status <> 'pending_payment' then
    raise exception 'confirm_order_payment: Order % is %, expected pending_payment', p_order_id, v_order.status;
  end if;

  if v_order.payment_status <> 'succeeded' then
    raise exception 'confirm_order_payment: payment_status is %, expected succeeded', v_order.payment_status;
  end if;

  if v_order.payment_amount_minor_units is null
     or v_order.payment_amount_minor_units <> v_order.total_minor_units then
    raise exception 'confirm_order_payment: paid amount (%) does not equal immutable Order total (%)',
      v_order.payment_amount_minor_units, v_order.total_minor_units;
  end if;

  for v_reservation in
    select sr.id
    from fashion.order_reservations ores
    join fashion.stock_reservations sr on sr.id = ores.reservation_id
    where ores.order_id = p_order_id
      and sr.status = 'active'
    order by sr.id
  loop
    perform fashion.confirm_reservation(v_reservation.id);
  end loop;

  -- One Shipment per Partner. This is where the physical fulfillment
  -- graph begins, only after the commercial/payment gate has passed.
  for v_split in
    select distinct partner_id
    from fashion.order_items
    where order_id = p_order_id
    order by partner_id
  loop
    insert into fashion.shipments(order_id, partner_id, status)
    values (p_order_id, v_split.partner_id, 'confirmed')
    on conflict (order_id, partner_id) do update
      set partner_id = excluded.partner_id
    returning id into v_shipment_id;

    insert into fashion.shipment_items(shipment_id, product_id)
    select v_shipment_id, oi.product_id
    from fashion.order_items oi
    where oi.order_id = p_order_id
      and oi.partner_id = v_split.partner_id
    on conflict do nothing;
  end loop;

  update fashion.orders set status = 'paid' where id = p_order_id;
  return p_order_id;
end;
$$ language plpgsql;

comment on function fashion.confirm_order_payment(uuid) is
'Idempotent payment-success gate. Requires payment_status=succeeded and exact amount; only then commits every stock reservation and creates per-Partner Shipments.';

-- ---------- 5. Unpaid cancellation releases every hold ----------
create or replace function fashion.cancel_pending_order(p_order_id uuid)
returns uuid as $$
declare
  v_status text;
  v_reservation record;
begin
  select status into v_status
  from fashion.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'cancel_pending_order: Order % not found', p_order_id;
  end if;

  if v_status = 'cancelled' then
    return p_order_id;
  end if;

  if v_status <> 'pending_payment' then
    raise exception 'cancel_pending_order: paid/fulfilling Orders require a refund workflow';
  end if;

  for v_reservation in
    select sr.id
    from fashion.order_reservations ores
    join fashion.stock_reservations sr on sr.id = ores.reservation_id
    where ores.order_id = p_order_id
      and sr.status = 'active'
    order by sr.id
  loop
    perform fashion.release_reservation(v_reservation.id);
  end loop;

  update fashion.orders set status = 'cancelled' where id = p_order_id;
  return p_order_id;
end;
$$ language plpgsql;

-- ---------- 6. Aggregate fulfillment follows independent Shipments ----------
create or replace function fashion.refresh_order_fulfillment_status(p_order_id uuid)
returns void as $$
declare
  v_status text;
  v_total integer;
  v_delivered integer;
  v_started integer;
begin
  select status into v_status from fashion.orders where id = p_order_id for update;
  if not found then return; end if;

  if v_status not in ('paid', 'fulfilling') then return; end if;

  select
    count(*),
    count(*) filter (where status = 'delivered'),
    count(*) filter (where status in ('preparing', 'shipped', 'delivered'))
  into v_total, v_delivered, v_started
  from fashion.shipments
  where order_id = p_order_id;

  if v_status = 'paid' and v_started > 0 then
    update fashion.orders set status = 'fulfilling' where id = p_order_id;
    v_status := 'fulfilling';
  end if;

  if v_status = 'fulfilling' and v_total > 0 and v_delivered = v_total then
    update fashion.orders set status = 'fulfilled' where id = p_order_id;
  end if;
end;
$$ language plpgsql;

create or replace function fashion.refresh_order_after_shipment_transition()
returns trigger as $$
begin
  perform fashion.refresh_order_fulfillment_status(new.order_id);
  return new;
end;
$$ language plpgsql;

create trigger trg_fashion_shipments_refresh_order
  after update of status on fashion.shipments
  for each row execute function fashion.refresh_order_after_shipment_transition();

-- ---------- 7. Refund accounting ----------
create or replace function fashion.record_order_refund(
  p_order_id uuid,
  p_amount_minor_units integer
) returns uuid as $$
declare
  v_order fashion.orders%rowtype;
  v_new_refunded integer;
  v_new_status text;
begin
  if p_amount_minor_units <= 0 then
    raise exception 'record_order_refund: amount must be positive';
  end if;

  select * into v_order
  from fashion.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'record_order_refund: Order % not found', p_order_id;
  end if;

  if v_order.status not in ('paid', 'fulfilling', 'fulfilled', 'partially_refunded') then
    raise exception 'record_order_refund: Order status % cannot be refunded', v_order.status;
  end if;

  v_new_refunded := v_order.refunded_minor_units + p_amount_minor_units;
  if v_new_refunded > v_order.total_minor_units then
    raise exception 'record_order_refund: cumulative refund % exceeds Order total %',
      v_new_refunded, v_order.total_minor_units;
  end if;

  v_new_status := case
    when v_new_refunded = v_order.total_minor_units then 'refunded'
    else 'partially_refunded'
  end;

  update fashion.orders
  set refunded_minor_units = v_new_refunded,
      status = v_new_status
  where id = p_order_id;

  return p_order_id;
end;
$$ language plpgsql;

comment on function fashion.record_order_refund(uuid, integer) is
'Records provider-confirmed refund value without ever allowing cumulative refunds above the immutable Order total.';
