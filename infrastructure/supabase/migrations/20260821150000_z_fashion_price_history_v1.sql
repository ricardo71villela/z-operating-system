-- ============================================================
-- Z Fashion — Price History & Campaign Pricing v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors fashion-domain/src/price-history.js and campaign-pricing.js
-- exactly. Any advertised Campaign discount must reference the
-- lowest price actually charged in the 30 days before the promotion
-- (EU Omnibus Directive, transposed in France since 28 May 2022) — a
-- Partner cannot inflate the "before" price, because the reference
-- is computed from real price history, never taken from input.
-- ============================================================

create table fashion.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references fashion.products(id) on delete cascade,
  price_minor_units integer not null check (price_minor_units >= 0),
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table fashion.price_history is 'Mirrors price-history.js. Append-only — a Partner''s price changes over time, never overwritten, since the 30-day reference calculation needs the full history, not just the latest value.';

alter table fashion.price_history enable row level security;

create index idx_fashion_price_history_product_time on fashion.price_history(product_id, observed_at desc);

-- The legally required reference price: the lowest price charged in the
-- 30 days (default) before as_of. Returns null if there's no price data
-- in that window — callers must treat that as "cannot legally advertise
-- a reduction," never fall back to guessing.
create or replace function fashion.reference_price(
  p_product_id uuid,
  p_as_of timestamptz,
  p_lookback_days integer default 30
) returns integer as $$
declare
  v_reference integer;
begin
  select min(price_minor_units) into v_reference
  from fashion.price_history
  where product_id = p_product_id
    and observed_at >= (p_as_of - make_interval(days => p_lookback_days))
    and observed_at <= p_as_of;

  return v_reference; -- null if no rows in window, by design
end;
$$ language plpgsql stable;

comment on function fashion.reference_price is 'Mirrors referencePrice() in price-history.js. Returns null (never a guess) when there is no price data in the lookback window.';

-- Validates a Campaign discount against the real reference price. Raises
-- an exception rather than returning a soft failure, matching the "this
-- is not just a data gap" severity price-history.js already establishes —
-- a caller attempting to record an illegal discount should not be able to
-- silently ignore the result.
create or replace function fashion.validate_campaign_discount(
  p_product_id uuid,
  p_final_price_minor_units integer,
  p_as_of timestamptz,
  p_lookback_days integer default 30
) returns integer as $$
declare
  v_reference integer;
  v_discount_percent integer;
begin
  v_reference := fashion.reference_price(p_product_id, p_as_of, p_lookback_days);

  if v_reference is null then
    raise exception 'no price history in the required lookback window for product % — cannot legally advertise a reduction without a genuine reference price (EU Omnibus Directive)', p_product_id;
  end if;

  if p_final_price_minor_units >= v_reference then
    raise exception 'final price % is not below the %-day reference price % for product % — this is not a genuine reduction and cannot be advertised as a discount', p_final_price_minor_units, p_lookback_days, v_reference, p_product_id;
  end if;

  v_discount_percent := round(((v_reference - p_final_price_minor_units)::numeric / v_reference) * 100);
  return v_discount_percent;
end;
$$ language plpgsql stable;

comment on function fashion.validate_campaign_discount is 'Mirrors computeCampaignDiscount() in campaign-pricing.js. Raises on a fake or unsupported discount rather than returning a silent false — a caller cannot accidentally ignore an illegal-discount result the way it might ignore a returned {ok:false}.';
