-- ============================================================
-- Z Fashion — Return settlement authority v1
-- Forward-only source migration. No live DB mutation in this phase.
--
-- A Return is now tied to the immutable Order line and carries an
-- explicit quantity. Refund settlement updates the Return and the
-- Order aggregate inside the same PostgreSQL transaction and is safe
-- to retry after provider/webhook duplication.
-- ============================================================

alter table fashion.returns
  add column order_item_id uuid references fashion.order_items(id),
  add column quantity integer not null default 1 check (quantity > 0),
  add column refunded_minor_units integer not null default 0 check (refunded_minor_units >= 0),
  add column refunded_at timestamptz;

create index idx_fashion_returns_order_item
  on fashion.returns(order_item_id)
  where order_item_id is not null;

comment on column fashion.returns.order_item_id is
'Immutable purchased line this Return belongs to. New Returns are resolved and validated by check_return_eligibility().';
comment on column fashion.returns.quantity is
'Explicit number of purchased units being returned. Never inferred from the full Order line quantity.';
comment on column fashion.returns.refunded_minor_units is
'Provider-confirmed settled refund for this Return; zero until fashion.settle_return_refund succeeds.';

-- Safely attach any pre-existing pre-production Return only where the
-- historical (order, partner, product) tuple resolves to exactly one
-- immutable Order line. Ambiguous legacy rows remain NULL and therefore
-- cannot be financially settled until reviewed explicitly.
with resolved as (
  select
    r.id as return_id,
    (array_agg(oi.id order by oi.id))[1] as order_item_id,
    count(*) as candidate_count
  from fashion.returns r
  join fashion.order_items oi
    on oi.order_id = r.order_id
   and oi.partner_id = r.partner_id
   and oi.product_id = r.product_id
  where r.order_item_id is null
  group by r.id
)
update fashion.returns r
set order_item_id = resolved.order_item_id
from resolved
where r.id = resolved.return_id
  and resolved.candidate_count = 1;

-- Replace the existing eligibility trigger function so every new Return
-- resolves to one immutable purchase line and cannot cumulatively reserve
-- more return quantity than was purchased. Rejected requests no longer
-- consume the returnable quantity and may be resubmitted legitimately.
--
-- The matching Order line is row-locked before the cumulative SUM. This
-- serializes competing partial Return inserts for the same purchased line:
-- two concurrent requests can never both validate against the same stale
-- quantity snapshot and collectively over-return the purchase.
create or replace function fashion.check_return_eligibility() returns trigger as $$
declare
  v_delivered_at timestamptz;
  v_categories fashion.category[];
  v_order_item_id uuid;
  v_purchased_quantity integer;
  v_candidate_count integer;
  v_existing_return_quantity integer;
begin
  select s.delivered_at into v_delivered_at
  from fashion.shipments s
  join fashion.shipment_items si on si.shipment_id = s.id
  where s.order_id = new.order_id
    and s.partner_id = new.partner_id
    and si.product_id = new.product_id
  limit 1;

  if v_delivered_at is null then
    raise exception 'fashion.returns: no delivered Shipment found for order %, partner %, product %',
      new.order_id, new.partner_id, new.product_id;
  end if;

  if now() > v_delivered_at + interval '14 days' then
    raise exception 'fashion.returns: the 14-day return window has closed for order %', new.order_id;
  end if;

  select categories into v_categories
  from fashion.products
  where id = new.product_id;

  if 'cosmetics' = any(v_categories) and new.seal_broken then
    raise exception 'fashion.returns: product % is not return-eligible (Cosmetics with a broken hygiene seal)',
      new.product_id;
  end if;

  if new.quantity is null or new.quantity <= 0 then
    raise exception 'fashion.returns: quantity must be a positive integer';
  end if;

  if new.order_item_id is not null then
    select oi.id, oi.quantity
      into v_order_item_id, v_purchased_quantity
    from fashion.order_items oi
    where oi.id = new.order_item_id
      and oi.order_id = new.order_id
      and oi.partner_id = new.partner_id
      and oi.product_id = new.product_id
    for update;

    if v_order_item_id is null then
      raise exception 'fashion.returns: order_item_id does not match order/partner/product';
    end if;
  else
    -- Resolve cardinality first. We only take a row lock after proving the
    -- historical tuple maps to exactly one immutable Order line.
    select
      (array_agg(oi.id order by oi.id))[1],
      count(*)
    into v_order_item_id, v_candidate_count
    from fashion.order_items oi
    where oi.order_id = new.order_id
      and oi.partner_id = new.partner_id
      and oi.product_id = new.product_id;

    if v_candidate_count <> 1 then
      raise exception 'fashion.returns: expected exactly one immutable Order line, found %', v_candidate_count;
    end if;

    select oi.quantity
      into v_purchased_quantity
    from fashion.order_items oi
    where oi.id = v_order_item_id
    for update;

    new.order_item_id := v_order_item_id;
  end if;

  if new.quantity > v_purchased_quantity then
    raise exception 'fashion.returns: requested quantity % exceeds purchased quantity %',
      new.quantity, v_purchased_quantity;
  end if;

  select coalesce(sum(r.quantity), 0)::integer
    into v_existing_return_quantity
  from fashion.returns r
  where r.order_item_id = v_order_item_id
    and r.status <> 'rejected';

  if v_existing_return_quantity + new.quantity > v_purchased_quantity then
    raise exception 'fashion.returns: cumulative return quantity % exceeds purchased quantity %',
      v_existing_return_quantity + new.quantity, v_purchased_quantity;
  end if;

  return new;
end;
$$ language plpgsql;

comment on function fashion.check_return_eligibility() is
'Validates delivery window, product eligibility and exact immutable Order-line quantity for every new Return, serialized per Order line against concurrent over-return.';

-- One financial authority: a Return reaches `refunded` only here. The
-- existing transition trigger still independently enforces
-- in_transit -> refunded. record_order_refund() locks the Order and caps
-- aggregate refunds at the immutable Order total.
create or replace function fashion.settle_return_refund(p_return_id uuid)
returns jsonb as $$
declare
  v_return fashion.returns%rowtype;
  v_order_item fashion.order_items%rowtype;
  v_refund_minor_units integer;
begin
  select * into v_return
  from fashion.returns
  where id = p_return_id
  for update;

  if not found then
    raise exception 'settle_return_refund: Return % not found', p_return_id;
  end if;

  if v_return.order_item_id is null then
    raise exception 'settle_return_refund: Return % has no resolved immutable Order line', p_return_id;
  end if;

  select * into v_order_item
  from fashion.order_items
  where id = v_return.order_item_id;

  if not found then
    raise exception 'settle_return_refund: Order line % not found', v_return.order_item_id;
  end if;

  if v_return.order_id <> v_order_item.order_id
     or v_return.partner_id <> v_order_item.partner_id
     or v_return.product_id <> v_order_item.product_id then
    raise exception 'settle_return_refund: Return and immutable Order line authority disagree';
  end if;

  v_refund_minor_units := v_order_item.unit_price_minor_units * v_return.quantity;

  -- Expected webhook/provider retry: no second Order refund is added.
  if v_return.status = 'refunded' then
    if v_return.refunded_minor_units <> v_refund_minor_units then
      raise exception 'settle_return_refund: stored refund amount % conflicts with expected %',
        v_return.refunded_minor_units, v_refund_minor_units;
    end if;

    return jsonb_build_object(
      'return_id', v_return.id,
      'order_id', v_return.order_id,
      'refund_minor_units', v_refund_minor_units,
      'idempotent', true
    );
  end if;

  if v_return.status <> 'in_transit' then
    raise exception 'settle_return_refund: Return status is %, expected in_transit', v_return.status;
  end if;

  perform fashion.record_order_refund(v_return.order_id, v_refund_minor_units);

  update fashion.returns
  set status = 'refunded',
      refunded_minor_units = v_refund_minor_units,
      refunded_at = now()
  where id = p_return_id;

  return jsonb_build_object(
    'return_id', v_return.id,
    'order_id', v_return.order_id,
    'refund_minor_units', v_refund_minor_units,
    'idempotent', false
  );
end;
$$ language plpgsql;

comment on function fashion.settle_return_refund(uuid) is
'Atomically settles one in-transit Return against the immutable Order line and Order refund aggregate. Safe to retry.';
