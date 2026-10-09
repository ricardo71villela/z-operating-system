-- Z FIND — Listing compliance review queue v1
--
-- Read-only companions to 20260830112835_z_find_global_listing_compliance_launch_v2.
-- zfind_listing_compliance has RLS enabled, no policy and no table grant, so
-- neither the Partner panel nor the Admin can list compliance rows today:
--   * zfind_list_listing_compliance_status(uuid[]) — status badges for the
--     listings the caller may manage (Admin, or the Partner controlling the
--     Listing: same zfind_can_manage_listing_compliance check as
--     zfind_get_listing_compliance). Unmanageable ids are silently skipped.
--   * zfind_admin_list_listing_compliance(text, uuid) — Admin review queue
--     (« Mentions obligatoires à valider »), same Admin check as
--     zfind_admin_review_listing_compliance.
-- No table, column, policy or existing function is changed. Idempotent.

create or replace function public.zfind_list_listing_compliance_status(p_listing_ids uuid[])
returns table (
  listing_id uuid,
  jurisdiction_iso text,
  profile text,
  review_status text,
  review_note text,
  facts_valid boolean,
  missing jsonb,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_listing_ids is null or cardinality(p_listing_ids) = 0 then
    return;
  end if;
  if cardinality(p_listing_ids) > 1000 then
    raise exception 'At most 1000 listings per call' using errcode = '22023';
  end if;

  return query
  select
    l.id,
    public.zfind_listing_jurisdiction(l.id),
    public.zfind_listing_compliance_profile(l.id),
    coalesce(c.review_status, 'unreviewed'),
    c.review_note,
    coalesce((v.validation ->> 'facts_valid')::boolean, false),
    coalesce(v.validation -> 'missing', '[]'::jsonb),
    c.updated_at
  from (select distinct x.id from unnest(p_listing_ids) as x(id)) ids
  join public.listings l on l.id = ids.id
  left join public.zfind_listing_compliance c on c.listing_id = l.id
  cross join lateral (select public.zfind_validate_listing_compliance_facts(l.id) as validation) v
  where public.zfind_can_manage_listing_compliance(l.id);
end;
$$;

create or replace function public.zfind_admin_list_listing_compliance(
  p_review_status text default 'pending',
  p_listing_id uuid default null
)
returns table (
  listing_id uuid,
  review_status text,
  review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  facts jsonb,
  jurisdiction_iso text,
  profile text,
  facts_valid boolean,
  missing jsonb,
  listing_status text,
  transaction_type text,
  price_current numeric,
  currency_iso text,
  title text,
  partner_id uuid,
  partner_name text,
  property_id uuid,
  development_id uuid,
  agency_reference text,
  commune text,
  postal_code text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'admin') then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  if p_review_status is not null and p_review_status not in ('unreviewed', 'pending', 'approved', 'rejected') then
    raise exception 'p_review_status must be unreviewed, pending, approved, rejected or null' using errcode = '22023';
  end if;

  return query
  select
    c.listing_id,
    c.review_status,
    c.review_note,
    c.updated_at,
    c.reviewed_at,
    c.facts,
    public.zfind_listing_jurisdiction(c.listing_id),
    public.zfind_listing_compliance_profile(c.listing_id),
    coalesce((v.validation ->> 'facts_valid')::boolean, false),
    coalesce(v.validation -> 'missing', '[]'::jsonb),
    l.status::text,
    l.transaction_type::text,
    l.price_current::numeric,
    l.currency_iso::text,
    (
      select lc.title
      from public.listing_content lc
      where lc.listing_id = l.id and nullif(pg_catalog.btrim(lc.title), '') is not null
      order by (lc.locale = 'fr') desc, lc.locale
      limit 1
    ),
    r.partner_id,
    pa.name::text,
    r.property_id,
    r.development_id,
    pr.agency_reference::text,
    coalesce(z.name, z.city)::text,
    pr.postal_code::text
  from public.zfind_listing_compliance c
  join public.listings l on l.id = c.listing_id
  join public.representations r on r.id = l.representation_id
  left join public.partners pa on pa.id = r.partner_id
  left join public.properties pr on pr.id = r.property_id
  left join public.developments d on d.id = r.development_id
  left join public.zones_lite z on z.id = coalesce(pr.zone_lite_id, d.zone_lite_id)
  cross join lateral (select public.zfind_validate_listing_compliance_facts(c.listing_id) as validation) v
  where (p_review_status is null or c.review_status = p_review_status)
    and (p_listing_id is null or c.listing_id = p_listing_id)
  order by c.updated_at asc, c.listing_id
  limit 500;
end;
$$;

revoke all on function public.zfind_list_listing_compliance_status(uuid[]) from public, anon, authenticated;
revoke all on function public.zfind_admin_list_listing_compliance(text, uuid) from public, anon, authenticated;
grant execute on function public.zfind_list_listing_compliance_status(uuid[]) to authenticated;
grant execute on function public.zfind_admin_list_listing_compliance(text, uuid) to authenticated;

comment on function public.zfind_list_listing_compliance_status(uuid[]) is
  'Compliance status (review_status, facts_valid, missing) for the given Listings the caller may manage (Admin or controlling Partner). Read-only.';
comment on function public.zfind_admin_list_listing_compliance(text, uuid) is
  'Admin-only compliance review queue: compliance rows with Listing, agency and commune context, oldest submission first. Read-only.';
