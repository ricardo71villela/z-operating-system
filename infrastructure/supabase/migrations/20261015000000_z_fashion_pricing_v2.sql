-- ============================================================
-- Z FASHION — Partner pricing v2 (decided 2026-10-14)
--
-- Mirrors apps/fashion/packages/fashion-domain/src/commission.js.
--
-- 1. Monthly subscription, HT, by number of categories sold:
--      1 → EUR 39 · 2 → EUR 49 · 3 or more → EUR 59
--    First month as an active Partner is free.
-- 2. Commission per ticket (the store's part of a customer order),
--    whole ticket at one rate:
--      up to EUR 100 → 10 % · up to EUR 200 → 8 % · above → 6 %
--
-- Replaces the v1 model of 20260822020000_z_fashion_commission_v1.sql
-- (rate by category, monthly-volume discount, quality-score discount,
-- single EUR 35 fee). Its tables and functions are dropped so the
-- database never holds two price lists. Nothing references them: no
-- order or settlement function calls them, and no real sale exists.
-- Drops are RESTRICT, so this migration fails rather than break any
-- unexpected dependent object. fashion.commission_owed_minor_units()
-- (generic floor arithmetic) is kept.
-- ============================================================

drop function if exists fashion.effective_commission_rate(fashion.category, bigint, integer) restrict;
drop function if exists fashion.volume_discount(bigint) restrict;
drop function if exists fashion.quality_score_discount(integer) restrict;
drop function if exists fashion.subscription_fee_owed_minor_units(integer) restrict;

drop table if exists fashion.commission_rates restrict;
drop table if exists fashion.volume_discount_tiers restrict;
drop table if exists fashion.partner_monetization_config restrict;


create table fashion.subscription_fee_tiers (
  min_category_count integer primary key check (min_category_count >= 1),
  monthly_fee_minor_units integer not null check (monthly_fee_minor_units > 0)
);

comment on table fashion.subscription_fee_tiers is
  'Monthly Partner subscription, EUR cents excluding VAT, by number of product categories sold: the row with the highest min_category_count not above the store''s count applies. Mirrors SUBSCRIPTION_TIERS in commission.js.';

insert into fashion.subscription_fee_tiers (min_category_count, monthly_fee_minor_units) values
  (1, 3900),
  (2, 4900),
  (3, 5900);


create table fashion.ticket_commission_tiers (
  max_ticket_minor_units bigint unique check (max_ticket_minor_units is null or max_ticket_minor_units > 0),
  rate_percent integer not null check (rate_percent between 0 and 100)
);

create unique index fashion_ticket_commission_tiers_single_open_ended
  on fashion.ticket_commission_tiers ((max_ticket_minor_units is null))
  where max_ticket_minor_units is null;

comment on table fashion.ticket_commission_tiers is
  'Commission rate per ticket (a store''s part of a customer order, EUR cents): the first row whose max_ticket_minor_units is at or above the ticket applies to the whole ticket; the single NULL row is the open-ended top tier. Mirrors TICKET_COMMISSION_TIERS in commission.js.';

insert into fashion.ticket_commission_tiers (max_ticket_minor_units, rate_percent) values
  (10000, 10),
  (20000, 8),
  (null, 6);


alter table fashion.subscription_fee_tiers enable row level security;
alter table fashion.ticket_commission_tiers enable row level security;
revoke all on fashion.subscription_fee_tiers from public, anon, authenticated;
revoke all on fashion.ticket_commission_tiers from public, anon, authenticated;
grant select on fashion.subscription_fee_tiers to anon, authenticated;
grant select on fashion.ticket_commission_tiers to anon, authenticated;

create policy fashion_subscription_fee_tiers_public_read on fashion.subscription_fee_tiers for select using (true);
create policy fashion_ticket_commission_tiers_public_read on fashion.ticket_commission_tiers for select using (true);

comment on policy fashion_subscription_fee_tiers_public_read on fashion.subscription_fee_tiers is
  'Public price list (shown on the adhesion page). Read-only; no write grant.';
comment on policy fashion_ticket_commission_tiers_public_read on fashion.ticket_commission_tiers is
  'Public price list (shown on the adhesion page). Read-only; no write grant.';


create or replace function fashion.subscription_fee_minor_units(p_category_count integer)
returns integer
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_fee integer;
begin
  if p_category_count is null or p_category_count < 1 then
    raise exception 'subscription_fee_minor_units: a store sells at least one category, got %', p_category_count;
  end if;
  select t.monthly_fee_minor_units into v_fee
  from fashion.subscription_fee_tiers t
  where t.min_category_count <= p_category_count
  order by t.min_category_count desc
  limit 1;
  return v_fee;
end;
$$;

comment on function fashion.subscription_fee_minor_units(integer) is 'Mirrors subscriptionFeeMinorUnits() in commission.js (argument: number of distinct categories).';


create or replace function fashion.subscription_fee_owed_minor_units(
  p_months_since_partner_activated integer,
  p_category_count integer
)
returns integer
language plpgsql
stable
set search_path = pg_catalog
as $$
begin
  if p_months_since_partner_activated is null or p_months_since_partner_activated < 1 then
    raise exception 'subscription_fee_owed_minor_units: months_since_partner_activated must be >= 1, got %', p_months_since_partner_activated;
  end if;
  if p_months_since_partner_activated = 1 then
    return 0; -- first month free
  end if;
  return fashion.subscription_fee_minor_units(p_category_count);
end;
$$;

comment on function fashion.subscription_fee_owed_minor_units(integer, integer) is 'Mirrors subscriptionFeeOwedMinorUnits() in commission.js: month 1 free, then the tier fee.';


create or replace function fashion.ticket_commission_rate_percent(p_ticket_minor_units bigint)
returns integer
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_rate integer;
begin
  if p_ticket_minor_units is null or p_ticket_minor_units < 0 then
    raise exception 'ticket_commission_rate_percent: ticket amount must be >= 0, got %', p_ticket_minor_units;
  end if;
  select t.rate_percent into v_rate
  from fashion.ticket_commission_tiers t
  where t.max_ticket_minor_units is null or p_ticket_minor_units <= t.max_ticket_minor_units
  order by t.max_ticket_minor_units asc nulls last
  limit 1;
  return v_rate;
end;
$$;

comment on function fashion.ticket_commission_rate_percent(bigint) is 'Mirrors ticketCommissionRatePercent() in commission.js.';


create or replace function fashion.ticket_commission_owed_minor_units(p_ticket_minor_units bigint)
returns bigint
language sql
stable
set search_path = pg_catalog
as $$
  select fashion.commission_owed_minor_units(p_ticket_minor_units, fashion.ticket_commission_rate_percent(p_ticket_minor_units));
$$;

comment on function fashion.ticket_commission_owed_minor_units(bigint) is 'Mirrors ticketCommissionOwedMinorUnits() in commission.js.';
