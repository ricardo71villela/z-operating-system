-- ============================================================
-- Z Fashion — Shipment & Return v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors shipment.js and return.js: closes the "onde estamos" status
-- review's ponto 2 (2026-08-21) — fashion.orders.status was a single
-- global value ('confirmed'/'cancelled') with no fulfillment
-- progression, and no Return entity existed anywhere despite the
-- 14-day policy and Cosmetics hygiene-seal exception both already
-- being real rules with nowhere to invoke them.
-- ============================================================

create type fashion.shipment_status as enum ('confirmed', 'preparing', 'shipped', 'delivered', 'cancelled');

create table fashion.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references fashion.orders(id),
  partner_id uuid not null references fashion.partners(id),
  status fashion.shipment_status not null default 'confirmed',
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, partner_id)
);

comment on table fashion.shipments is 'Mirrors shipment.js. One row per Partner within an Order — an Order spanning 3 Partners has 3 Shipments, each progressing independently, same unit partnerSplits() (cart.js) already uses at checkout time carried forward into fulfillment.';

alter table fashion.shipments enable row level security;

create table fashion.shipment_items (
  shipment_id uuid not null references fashion.shipments(id) on delete cascade,
  product_id uuid not null references fashion.products(id),
  primary key (shipment_id, product_id)
);

comment on table fashion.shipment_items is 'Mirrors createShipment()''s productIds array in shipment.js.';

alter table fashion.shipment_items enable row level security;

-- Mirrors ALLOWED_TRANSITIONS in shipment.js exactly. A second,
-- independent enforcement point — same discipline as every other
-- state machine already mirrored in this schema (onboarding.js's
-- fashion.partner_applications, if/when that table exists — see this
-- as the same pattern applied to a new state machine).
create or replace function fashion.check_shipment_transition() returns trigger as $$
begin
  if old.status = new.status then
    return new; -- no-op update to an unrelated column, not a transition
  end if;

  if not (
    (old.status = 'confirmed' and new.status in ('preparing', 'cancelled')) or
    (old.status = 'preparing' and new.status in ('shipped', 'cancelled')) or
    (old.status = 'shipped' and new.status = 'delivered')
  ) then
    raise exception 'fashion.shipments: cannot move from "%" to "%"', old.status, new.status;
  end if;

  if new.status = 'delivered' and new.delivered_at is null then
    new.delivered_at := now();
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_fashion_shipments_transition
  before update on fashion.shipments
  for each row
  execute function fashion.check_shipment_transition();

comment on trigger trg_fashion_shipments_transition on fashion.shipments is 'Mirrors transition()/ALLOWED_TRANSITIONS in shipment.js.';

create type fashion.return_status as enum ('requested', 'approved', 'rejected', 'in_transit', 'refunded');

create table fashion.returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references fashion.orders(id),
  partner_id uuid not null references fashion.partners(id),
  product_id uuid not null references fashion.products(id),
  status fashion.return_status not null default 'requested',
  reason text,
  -- Mirrors requestReturn()'s sealBroken parameter in return.js exactly
  -- — Cosmetics-only in practice (isReturnEligible() ignores it for
  -- every other Category), but stored as a plain explicit flag rather
  -- than inferred from anything else on this row.
  seal_broken boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table fashion.returns is 'Mirrors return.js requestReturn(). One row per Product return request — a multi-item Order can have independent Returns per line item.';

alter table fashion.returns enable row level security;

-- Mirrors the 14-day window (RETURN_WINDOW_DAYS) and isReturnEligible()'s
-- Cosmetics-seal exception at the moment of creation — application-layer
-- requestReturn() already checks both, this is the second independent
-- enforcement, same discipline as every other cross-cutting rule in this
-- schema. seal_broken is passed explicitly by the insert, never inferred.
create or replace function fashion.check_return_eligibility() returns trigger as $$
declare
  v_delivered_at timestamptz;
  v_categories fashion.category[];
begin
  select s.delivered_at into v_delivered_at
  from fashion.shipments s
  join fashion.shipment_items si on si.shipment_id = s.id
  where s.order_id = new.order_id and s.partner_id = new.partner_id and si.product_id = new.product_id
  limit 1;

  if v_delivered_at is null then
    raise exception 'fashion.returns: no delivered Shipment found for order %, partner %, product % — a Return can only be requested after delivery', new.order_id, new.partner_id, new.product_id;
  end if;

  if now() > v_delivered_at + interval '14 days' then
    raise exception 'fashion.returns: the 14-day return window (from delivery) has closed for order %', new.order_id;
  end if;

  select categories into v_categories from fashion.products where id = new.product_id;

  if 'cosmetics' = any(v_categories) and new.seal_broken then
    raise exception 'fashion.returns: product % is not return-eligible (Cosmetics with a broken hygiene seal)', new.product_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_fashion_returns_eligibility
  before insert on fashion.returns
  for each row
  execute function fashion.check_return_eligibility();

comment on trigger trg_fashion_returns_eligibility on fashion.returns is 'Mirrors requestReturn()''s window + isReturnEligible() checks in return.js.';

-- Mirrors ALLOWED_TRANSITIONS in return.js exactly.
create or replace function fashion.check_return_transition() returns trigger as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if not (
    (old.status = 'requested' and new.status in ('approved', 'rejected')) or
    (old.status = 'approved' and new.status = 'in_transit') or
    (old.status = 'in_transit' and new.status = 'refunded')
  ) then
    raise exception 'fashion.returns: cannot move from "%" to "%"', old.status, new.status;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_fashion_returns_transition
  before update on fashion.returns
  for each row
  execute function fashion.check_return_transition();

comment on trigger trg_fashion_returns_transition on fashion.returns is 'Mirrors transition()/ALLOWED_TRANSITIONS in return.js.';

create index idx_fashion_shipments_order on fashion.shipments(order_id);
create index idx_fashion_returns_order on fashion.returns(order_id);
