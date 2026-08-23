-- ============================================================
-- Z Fashion — Stock Persistence API v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Reconciled during five-product convergence.
--
-- Stock persistence, reservation rows and row-locking authority already
-- exist in 20260821130000_z_fashion_stock_v1.sql. The later Fashion
-- branch was developed against a stale assumption that those tables did
-- not yet exist and attempted to create a second, incompatible stock
-- model. This forward-only migration therefore adds only the missing
-- database API required by the current Partner service:
-- fashion.apply_stock_update(uuid, integer, timestamptz).
--
-- Reservation authority remains exclusively with the earlier migration's
-- fashion.reserve_stock(), fashion.release_reservation() and
-- fashion.confirm_reservation() functions.
-- ============================================================

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

  select *
    into v_current
    from fashion.stock
    where product_id = p_product_id
    for update;

  if found then
    if v_current.last_updated_at is not null
       and p_observed_at <= v_current.last_updated_at then
      raise exception 'apply_stock_update: stale update rejected — observedAt (%) is not newer than the currently applied timestamp (%)',
        p_observed_at,
        v_current.last_updated_at;
    end if;

    update fashion.stock
       set quantity_available = p_quantity_available,
           last_updated_at = p_observed_at,
           updated_at = now()
     where product_id = p_product_id
     returning * into v_result;
  else
    insert into fashion.stock (
      product_id,
      quantity_available,
      quantity_reserved,
      last_updated_at
    ) values (
      p_product_id,
      p_quantity_available,
      0,
      p_observed_at
    )
    returning * into v_result;
  end if;

  return v_result;
end;
$$ language plpgsql;

comment on function fashion.apply_stock_update(uuid, integer, timestamptz) is
  'Partner stock-feed write API over the canonical fashion.stock authority created by 20260821130000_z_fashion_stock_v1.sql. Rejects stale observations and preserves reservation semantics owned by that earlier migration.';
