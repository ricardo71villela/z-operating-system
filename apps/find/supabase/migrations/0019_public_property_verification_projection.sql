-- ============================================================
-- Z FIND — MIGRATION 0019
-- Safe Public Property Verification Projection
-- ============================================================
--
-- verification_assessments remains the canonical append-only
-- Verification audit truth.
--
-- It is deliberately NOT exposed directly to anon because it
-- contains internal/audit material such as:
--   confidence
--   source_reference
--   evidence
--   assessor_profile_id
--
-- Public visibility is a separate Z Find marketplace concern.
--
-- verification_publication_rules is therefore an explicit,
-- admin-controlled publication gate by verification_kind.
--
-- IMPORTANT:
-- No publication rules are seeded by this migration.
-- Unknown/internal verification kinds remain private by default.
--
-- The public RPC additionally:
--   * requires a real Property with an active Representation
--     attached to a published Listing;
--   * projects only the latest assessment for each explicitly
--     public verification kind;
--   * exposes only positive current outcomes:
--       verified / partially_verified;
--   * excludes expired positive assessments;
--   * returns only explicitly approved public fields.
--
-- Verification remains separate from Trust.
-- No Trust Score or Trust Level is derived here.
-- ============================================================

create table verification_publication_rules (
  verification_kind text primary key,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

alter table verification_publication_rules enable row level security;

create policy "admin: full access to verification_publication_rules"
on verification_publication_rules
for all
to authenticated
using (is_admin())
with check (is_admin());

grant select, insert, update, delete
on verification_publication_rules
to authenticated;

-- Defense in depth: neither the canonical audit table nor the
-- publication-policy table is directly readable by anon.
revoke all
on verification_assessments
from anon;

revoke all
on verification_publication_rules
from anon;

create index verification_assessments_property_public_lookup_idx
on verification_assessments (
  property_id,
  verification_kind,
  assessed_at desc
)
where subject_type = 'property';

create function public.zfind_public_property_verification(
  p_property_id uuid
)
returns table (
  verification_kind text,
  outcome text,
  assessed_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with latest as (
    select
      va.verification_kind,
      va.outcome,
      va.assessed_at,
      va.expires_at,
      row_number() over (
        partition by va.verification_kind
        order by va.assessed_at desc, va.id desc
      ) as rn
    from public.verification_assessments va
    join public.verification_publication_rules vpr
      on vpr.verification_kind = va.verification_kind
     and vpr.is_public = true
    where va.subject_type = 'property'
      and va.property_id = p_property_id
      and exists (
        select 1
        from public.representations r
        join public.listings l
          on l.representation_id = r.id
        where r.target_type = 'property'
          and r.property_id = p_property_id
          and r.status = 'active'
          and l.status = 'published'
      )
  )
  select
    latest.verification_kind,
    latest.outcome,
    latest.assessed_at,
    latest.expires_at
  from latest
  where latest.rn = 1
    and latest.outcome in ('verified', 'partially_verified')
    and (
      latest.expires_at is null
      or latest.expires_at > now()
    )
  order by
    latest.assessed_at desc,
    latest.verification_kind;
$$;

revoke all
on function public.zfind_public_property_verification(uuid)
from public;

grant execute
on function public.zfind_public_property_verification(uuid)
to anon, authenticated;

comment on table verification_publication_rules
is 'Z Find marketplace publication gate for Verification kinds. Empty/private by default; canonical Verification truth remains in verification_assessments.';

comment on function public.zfind_public_property_verification(uuid)
is 'Safe public Property Verification projection. Returns only explicitly publishable, latest, positive, non-expired Verification assessments for Properties that are currently represented and published. Does not expose audit evidence or derive Trust.';
