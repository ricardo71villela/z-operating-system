-- ============================================================
-- Z FASHION — Adhésion des boutiques (Partner onboarding) v1
--
-- A store applies from the Z Fashion adhesion page after signing in
-- with an e-mail code. One call, one transaction:
--
--   auth user → zos.persons (created if missing)
--             → new zos.organisations row (the store's company)
--             → active zos.memberships row (person ∈ organisation)
--             → new fashion.partners row (onboarding_status 'applied')
--             → fashion.partner_applications row (the form, the offer
--               shown, the Partner terms version accepted and when)
--             → zos.registry_bindings Partner ↔ Organisation
--               (platform_internal.link_fashion_partner_organisation)
--
-- From then on platform_internal.fashion_partner_ids_for_auth_user()
-- returns the Partner for that person, so the Partner API and the
-- Partner dashboard recognise them. Approval stays an admin action
-- (POST /partners/:id/transition, admins only): applying never
-- activates anything and never publishes products.
--
-- Called only by the Partner API's privileged connection, after the
-- API has verified the caller's Supabase token and validated the form
-- (fashion-domain/src/partner-application.js). Not exposed to anon,
-- authenticated or service_role.
--
-- Refused inside the function (errcode 23505, message prefix used by
-- the API to map the refusal):
--   fashion_application_pending   — this person already has a store
--                                   application awaiting review
--   fashion_application_duplicate — this SIRET already belongs to a
--                                   store that is not rejected
-- ============================================================

create table if not exists fashion.partner_applications (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null unique references fashion.partners(id) on delete cascade,
  organisation_id uuid not null references zos.organisations(id) on delete restrict,
  applicant_user_id uuid not null references auth.users(id) on delete restrict,
  trade_name text not null check (char_length(trade_name) between 2 and 120),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  country_iso text not null check (country_iso ~ '^[A-Z]{2}$'),
  registration_number text not null check (registration_number ~ '^[0-9]{14}$'),
  vat_number text check (vat_number is null or vat_number ~ '^[A-Z]{2}[0-9A-Z]{2,13}$'),
  address_line1 text not null,
  postal_code text not null,
  city text not null,
  contact_email text not null,
  contact_phone text not null,
  website text,
  terms_version text not null check (char_length(terms_version) > 0),
  terms_accepted_at timestamptz not null,
  offer_snapshot jsonb not null,
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table fashion.partner_applications is
  'Store applications to Z Fashion: the adhesion form as submitted, the commercial offer shown at that moment (offer_snapshot) and the exact Partner terms version accepted, with timestamp. Written only by platform_internal.fashion_submit_partner_application().';

create index if not exists fashion_partner_applications_applicant_idx
  on fashion.partner_applications (applicant_user_id);
create index if not exists fashion_partner_applications_registration_idx
  on fashion.partner_applications (country_iso, registration_number);
create index if not exists fashion_partner_applications_created_idx
  on fashion.partner_applications (created_at desc);

alter table fashion.partner_applications enable row level security;
revoke all on table fashion.partner_applications from public, anon, authenticated, service_role;


create or replace function platform_internal.fashion_submit_partner_application(
  p_auth_user_id uuid,
  p_application jsonb,
  p_offer_snapshot jsonb
)
returns table (partner_id uuid, organisation_id uuid, application_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_person_id uuid;
  v_organisation_id uuid;
  v_partner_id uuid;
  v_application_id uuid;
  v_country text := upper(coalesce(p_application ->> 'countryIso', ''));
  v_siret text := coalesce(p_application ->> 'registrationNumber', '');
begin
  if p_auth_user_id is null or p_application is null or p_offer_snapshot is null then
    raise exception 'auth user, application and offer snapshot are required'
      using errcode = '22004';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_auth_user_id) then
    raise exception 'no auth user with id %', p_auth_user_id
      using errcode = '23503';
  end if;

  -- Serialise concurrent submissions by the same person and for the same SIRET.
  perform pg_advisory_xact_lock(hashtextextended('fashion_application_user:' || p_auth_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('fashion_application_siret:' || v_country || v_siret, 0));

  if exists (
    select 1
    from fashion.partner_applications a
    join fashion.partners p on p.id = a.partner_id
    where a.applicant_user_id = p_auth_user_id
      and p.onboarding_status in ('applied', 'under_review')
  ) then
    raise exception 'fashion_application_pending: this account already has a store application awaiting review'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from fashion.partner_applications a
    join fashion.partners p on p.id = a.partner_id
    where a.country_iso = v_country
      and a.registration_number = v_siret
      and p.onboarding_status <> 'rejected'
  ) then
    raise exception 'fashion_application_duplicate: a store with this registration number already applied'
      using errcode = '23505';
  end if;

  insert into zos.persons (auth_user_id)
  values (p_auth_user_id)
  on conflict (auth_user_id) do nothing;

  select zp.id into v_person_id from zos.persons zp where zp.auth_user_id = p_auth_user_id;

  insert into zos.organisations (name, legal_name, country_iso)
  values (p_application ->> 'tradeName', p_application ->> 'legalName', v_country)
  returning id into v_organisation_id;

  insert into zos.memberships (person_id, organisation_id, status, joined_at)
  values (v_person_id, v_organisation_id, 'active', now());

  insert into fashion.partners (legal_name, country_iso, locales, categories, age_segments, minor_safe_data_acknowledged)
  values (
    p_application ->> 'legalName',
    v_country,
    array(select jsonb_array_elements_text(p_application -> 'locales')),
    array(select jsonb_array_elements_text(p_application -> 'categories'))::fashion.category[],
    array(select jsonb_array_elements_text(p_application -> 'ageSegments'))::fashion.age_segment[],
    coalesce((p_application ->> 'minorSafeDataAcknowledged')::boolean, false)
  )
  returning id into v_partner_id;

  insert into fashion.partner_applications (
    partner_id, organisation_id, applicant_user_id,
    trade_name, legal_name, country_iso, registration_number, vat_number,
    address_line1, postal_code, city, contact_email, contact_phone, website,
    terms_version, terms_accepted_at, offer_snapshot
  )
  values (
    v_partner_id, v_organisation_id, p_auth_user_id,
    p_application ->> 'tradeName', p_application ->> 'legalName', v_country, v_siret,
    nullif(p_application ->> 'vatNumber', ''),
    p_application ->> 'addressLine1', p_application ->> 'postalCode', p_application ->> 'city',
    p_application ->> 'contactEmail', p_application ->> 'contactPhone',
    nullif(p_application ->> 'website', ''),
    p_application ->> 'termsVersion', now(), p_offer_snapshot
  )
  returning id into v_application_id;

  perform platform_internal.link_fashion_partner_organisation(v_partner_id, v_organisation_id);

  return query select v_partner_id, v_organisation_id, v_application_id;
end;
$$;

revoke execute
on function platform_internal.fashion_submit_partner_application(uuid, jsonb, jsonb)
from public, anon, authenticated, service_role;

comment on function platform_internal.fashion_submit_partner_application(uuid, jsonb, jsonb) is
  'Atomically creates a store application: ZOS person (if missing), organisation, active membership, fashion.partners row (applied), fashion.partner_applications row with offer snapshot and accepted terms version, and the Partner<->Organisation binding. Called only by the Partner API privileged connection after token verification and form validation.';
