-- ============================================================
-- Z Fashion — Current Price v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors currentPrice() added to price-history.js (2026-08-21): the
-- price a Client actually pays right now — the most recent entry by
-- observed_at — is a genuinely different question from
-- fashion.reference_price() (the *lowest* price in a lookback window,
-- used only for discount-legality checks). Neither function should be
-- used in place of the other; this migration adds the one that was
-- missing, it does not touch reference_price()/validate_campaign_discount().
-- ============================================================

create or replace function fashion.current_price(p_product_id uuid) returns integer as $$
  select price_minor_units
  from fashion.price_history
  where product_id = p_product_id
  order by observed_at desc
  limit 1;
$$ language sql stable;

comment on function fashion.current_price is 'Mirrors currentPrice() in price-history.js. Returns null (never 0 or a fabricated value) when no price has been recorded yet — never the same thing as fashion.reference_price(), which intentionally returns the lowest price in a lookback window for discount-legality purposes.';
