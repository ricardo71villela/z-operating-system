-- ============================================================
-- Z FIND — base de prospection des professionnels de l'immobilier
-- (France, Belgique, Luxembourg)
--
-- Une ligne par établissement (FR : SIRET ; BE : établissement BCE, ou
-- l'entreprise quand elle n'en déclare pas ; LU : objet OpenStreetMap).
-- Alimentée chaque semaine par apps/find/ingest/agencias (GitHub Action
-- « Z Find — ingestion des agences »), via l'API REST et la clé secrète.
--
-- Données : uniquement des informations professionnelles publiées
-- (registres officiels, OpenStreetMap, site de l'agence), avec leur source
-- et leur date. Les mandataires / indépendants (personnes physiques) sont
-- classés à part (type = 'independent').
--
-- Prospection par e-mail (email_outreach_allowed) :
--   France : B2B autorisé sans consentement préalable si le message porte
--   sur la profession, avec information et désinscription (CNIL).
--   Belgique / Luxembourg : sans consentement préalable, seulement vers des
--   personnes morales — jamais vers une personne physique.
--   Toujours exclu après une demande de désinscription (do_not_contact).
--
-- Accès : aucune lecture publique (RLS sans politique pour anon /
-- authenticated) ; seul le rôle serveur (clé secrète) lit et écrit.
-- ============================================================

create table if not exists public.zfind_agencias (
  id uuid primary key default gen_random_uuid(),
  country text not null check (country in ('FR', 'BE', 'LU')),
  source text not null check (source in ('sirene', 'kbo', 'osm')),
  source_id text not null,
  company_id text,
  name text not null,
  trade_name text,
  type text not null check (type in ('agency', 'network_agency', 'network_hq', 'independent')),
  network text,
  is_natural_person boolean not null default false,
  legal_form text,
  activity_code text,
  is_head_office boolean,
  address text,
  postcode text,
  city text,
  commune_code text,
  latitude double precision,
  longitude double precision,
  phone text,
  phone_source text,
  email text,
  email_source text,
  website text,
  website_source text,
  enrich_status text,
  enriched_at timestamptz,
  registry_created date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  do_not_contact boolean not null default false,
  do_not_contact_at timestamptz,
  email_outreach_allowed boolean generated always as (
    email is not null and not do_not_contact and active and (country = 'FR' or not is_natural_person)
  ) stored,
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists zfind_agencias_country_type_idx on public.zfind_agencias (country, type);
create index if not exists zfind_agencias_postcode_idx on public.zfind_agencias (country, postcode);
create index if not exists zfind_agencias_email_idx on public.zfind_agencias (lower(email)) where email is not null;
create index if not exists zfind_agencias_enrich_idx on public.zfind_agencias (enriched_at nulls first) where active;

alter table public.zfind_agencias enable row level security;
revoke all on table public.zfind_agencias from anon, authenticated;
grant select, insert, update, delete on table public.zfind_agencias to service_role;

comment on table public.zfind_agencias is
  'Z Find — professionnels de l''immobilier FR/BE/LU à prospecter (registres officiels + OSM + sites). Lecture serveur uniquement.';
comment on column public.zfind_agencias.type is
  'agency = agence (personne morale) ; network_agency = agence sous enseigne d''un réseau ; network_hq = siège d''un réseau ; independent = mandataire ou agent indépendant (personne physique)';
comment on column public.zfind_agencias.email_outreach_allowed is
  'E-mail de prospection permis : FR toutes catégories (B2B, avec désinscription) ; BE/LU personnes morales seulement ; jamais si do_not_contact.';
