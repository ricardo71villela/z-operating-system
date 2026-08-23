-- ============================================================
-- Z Fashion — Commission & Subscription v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors fashion-domain/src/commission.js exactly: Partner
-- monetization positioned deliberately below the two direct
-- France-market precedents (Miinto ~16-20% + ~EUR98/month; Galeries
-- Lafayette ~15% + ~EUR40-49/month — see
-- Z-FASHION-COMPETITIVE-LANDSCAPE.md). First month free, lower
-- category base rates, and a volume-progressive discount are the
-- concrete market-entry mechanism, re-enforced here as a second,
-- independent computation point — not only trusted from application
-- code, same discipline as fashion.validate_campaign_discount.
-- ============================================================

create table fashion.commission_rates (
  category fashion.category primary key,
  base_rate_percent integer not null check (base_rate_percent between 0 and 100)
);

comment on table fashion.commission_rates is 'Mirrors BASE_COMMISSION_RATE_PERCENT in commission.js. Sportswear and Cosmetics sit below Clothing/Footwear/Accessories — thinner real-world margins (technical-brand pricing discipline; Sephora/Douglas-style price competition) — see Z-FASHION-STRATEGY.md Sportswear positioning.';

insert into fashion.commission_rates (category, base_rate_percent) values
  ('clothing', 13),
  ('footwear', 13),
  ('sportswear', 10),
  ('accessories_leather_goods', 15),
  ('cosmetics', 11);

create table fashion.volume_discount_tiers (
  min_monthly_gmv_minor_units bigint primary key check (min_monthly_gmv_minor_units >= 0),
  discount_percentage_points integer not null check (discount_percentage_points >= 0)
);

comment on table fashion.volume_discount_tiers is 'Mirrors VOLUME_DISCOUNT_TIERS in commission.js. A small, ordered table, not a formula — a new tier is a reviewable one-line insert, same discipline fashion.official_soldes_windows applies to a different legally/commercially sensitive table.';

insert into fashion.volume_discount_tiers (min_monthly_gmv_minor_units, discount_percentage_points) values
  (0, 0),        -- below EUR 5,000
  (500000, 1),   -- EUR 5,000 - 15,000
  (1500000, 2),  -- EUR 15,000 - 40,000
  (4000000, 3);  -- above EUR 40,000

create table fashion.partner_monetization_config (
  key text primary key,
  value_minor_units integer,
  value_integer integer
);

comment on table fashion.partner_monetization_config is 'Single-row-per-key config mirroring commission.js constants (MONTHLY_SUBSCRIPTION_FEE_MINOR_UNITS, DEFAULT_MINIMUM_PQS_FOR_DISCOUNT, MAX_PQS_DISCOUNT_PERCENTAGE_POINTS, MAX_COMBINED_DISCOUNT_PERCENTAGE_POINTS) — kept as data, not hardcoded in the functions below, so a rate change never requires a migration.';

insert into fashion.partner_monetization_config (key, value_minor_units) values
  ('monthly_subscription_fee_minor_units', 3500); -- EUR 35.00

insert into fashion.partner_monetization_config (key, value_integer) values
  ('default_minimum_pqs_for_discount', 60),
  ('max_pqs_discount_percentage_points', 2),
  ('max_combined_discount_percentage_points', 5);

-- Mirrors volumeDiscount() in commission.js: highest tier whose threshold
-- the Partner's monthly GMV meets or exceeds. Never a formula — reads the
-- reviewable table above.
create or replace function fashion.volume_discount(p_monthly_gmv_minor_units bigint)
returns integer as $$
  select discount_percentage_points
  from fashion.volume_discount_tiers
  where min_monthly_gmv_minor_units <= p_monthly_gmv_minor_units
  order by min_monthly_gmv_minor_units desc
  limit 1;
$$ language sql stable;

comment on function fashion.volume_discount is 'Mirrors volumeDiscount() in commission.js.';

-- Mirrors qualityScoreDiscount() in commission.js: zero for a missing or
-- below-minimum score — never inferred or defaulted upward.
create or replace function fashion.quality_score_discount(p_partner_quality_score integer)
returns integer as $$
declare
  v_minimum integer;
  v_max_discount integer;
begin
  if p_partner_quality_score is null then
    return 0;
  end if;

  select value_integer into v_minimum from fashion.partner_monetization_config where key = 'default_minimum_pqs_for_discount';
  select value_integer into v_max_discount from fashion.partner_monetization_config where key = 'max_pqs_discount_percentage_points';

  if p_partner_quality_score < v_minimum then
    return 0;
  end if;

  return v_max_discount;
end;
$$ language plpgsql stable;

comment on function fashion.quality_score_discount is 'Mirrors qualityScoreDiscount() in commission.js.';

-- Mirrors effectiveCommissionRate() in commission.js: category base rate,
-- minus the volume and PQS discounts, combined discount capped at
-- max_combined_discount_percentage_points — the cap is enforced here
-- independently of the application layer, same discipline
-- fashion_stock_reserved_not_exceeding_available applies to stock.
create or replace function fashion.effective_commission_rate(
  p_category fashion.category,
  p_monthly_gmv_minor_units bigint,
  p_partner_quality_score integer default null
) returns integer as $$
declare
  v_base_rate integer;
  v_volume_discount integer;
  v_pqs_discount integer;
  v_max_combined integer;
  v_applied_discount integer;
begin
  select base_rate_percent into v_base_rate from fashion.commission_rates where category = p_category;
  if v_base_rate is null then
    raise exception 'effective_commission_rate: no base rate configured for category %', p_category;
  end if;

  v_volume_discount := fashion.volume_discount(p_monthly_gmv_minor_units);
  v_pqs_discount := fashion.quality_score_discount(p_partner_quality_score);

  select value_integer into v_max_combined from fashion.partner_monetization_config where key = 'max_combined_discount_percentage_points';
  v_applied_discount := least(v_volume_discount + v_pqs_discount, v_max_combined);

  return v_base_rate - v_applied_discount;
end;
$$ language plpgsql stable;

comment on function fashion.effective_commission_rate is 'Mirrors effectiveCommissionRate().effectiveRatePercent in commission.js.';

-- Mirrors commissionOwedMinorUnits() in commission.js: floors, never rounds
-- up past what the effective rate actually implies.
create or replace function fashion.commission_owed_minor_units(
  p_sale_amount_minor_units bigint,
  p_effective_rate_percent integer
) returns bigint as $$
  select floor((p_sale_amount_minor_units * p_effective_rate_percent) / 100.0)::bigint;
$$ language sql immutable;

comment on function fashion.commission_owed_minor_units is 'Mirrors commissionOwedMinorUnits() in commission.js.';

-- Mirrors subscriptionFeeOwedMinorUnits() in commission.js: month 1 is
-- always free (access, not a performance fee), the standard fee applies
-- from month 2 onward regardless of month-1 sales.
create or replace function fashion.subscription_fee_owed_minor_units(p_months_since_partner_activated integer)
returns integer as $$
declare
  v_fee integer;
begin
  if p_months_since_partner_activated is null or p_months_since_partner_activated < 1 then
    raise exception 'subscription_fee_owed_minor_units: months_since_partner_activated must be >= 1, got %', p_months_since_partner_activated;
  end if;

  if p_months_since_partner_activated = 1 then
    return 0;
  end if;

  select value_minor_units into v_fee from fashion.partner_monetization_config where key = 'monthly_subscription_fee_minor_units';
  return v_fee;
end;
$$ language plpgsql stable;

comment on function fashion.subscription_fee_owed_minor_units is 'Mirrors subscriptionFeeOwedMinorUnits() in commission.js.';

alter table fashion.commission_rates enable row level security;
alter table fashion.volume_discount_tiers enable row level security;
alter table fashion.partner_monetization_config enable row level security;

create policy fashion_commission_rates_public_read on fashion.commission_rates for select using (true);
create policy fashion_volume_discount_tiers_public_read on fashion.volume_discount_tiers for select using (true);
create policy fashion_partner_monetization_config_public_read on fashion.partner_monetization_config for select using (true);

comment on policy fashion_commission_rates_public_read on fashion.commission_rates is 'Rate tables are reference data, not Partner-specific — safe to read publicly (e.g. a Partner-facing pricing page). Writes are not granted here; left to a future admin-role migration, same as other reference tables in this schema.';
