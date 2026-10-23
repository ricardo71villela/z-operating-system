-- ============================================================
-- Z JOBS — base de prospection des employeurs (France)
--
-- Une ligne par entreprise (unité légale, SIREN), avec l'adresse de son
-- siège, sa tranche d'effectif salarié, son secteur (NAF) et sa catégorie
-- (PME / ETI / GE). Alimentée chaque semaine par apps/jobs/ingest/empresas
-- (GitHub Action « Z Jobs — ingestion des entreprises »), via l'API REST
-- et la clé secrète.
--
-- Périmètre v1 : entreprises actives en France avec au moins 10 salariés
-- (tranches INSEE 11 et plus), hors administration publique (section O),
-- organisations extraterritoriales (U), ménages employeurs (T) et
-- entreprises individuelles (personnes physiques).
--
-- Données : uniquement des informations publiques des registres officiels
-- (SIRENE / RNE via recherche-entreprises.api.gouv.fr), avec leur date.
-- Les entreprises en diffusion partielle (opposition à la diffusion) ne
-- sont jamais enregistrées.
--
-- Prospection par e-mail (email_outreach_allowed) : France, B2B, message
-- lié à l'activité de l'entreprise (recrutement), avec identification de
-- l'expéditeur, origine des données et désinscription (CNIL). Toujours
-- exclu après une demande de désinscription (do_not_contact).
--
-- Accès : aucune lecture publique (RLS sans politique pour anon /
-- authenticated) ; seul le rôle serveur (clé secrète) lit et écrit.
-- Idempotent : peut être relancé.
-- ============================================================

create table if not exists public.zjobs_empresas (
  id uuid primary key default gen_random_uuid(),
  country text not null default 'FR' check (country in ('FR', 'BE', 'LU')),
  source text not null check (source in ('sirene')),
  source_id text not null,
  name text not null,
  trade_name text,
  legal_form text,
  naf_code text,
  naf_section text,
  employee_band text,
  employee_band_year integer,
  company_category text check (company_category is null or company_category in ('PME', 'ETI', 'GE')),
  establishments_open integer,
  is_association boolean not null default false,
  is_ess boolean not null default false,
  head_office_siret text,
  address text,
  postcode text,
  city text,
  commune_code text,
  department text,
  latitude double precision,
  longitude double precision,
  registry_created date,
  phone text,
  phone_source text,
  email text,
  email_source text,
  website text,
  website_source text,
  enrich_status text,
  enriched_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  do_not_contact boolean not null default false,
  do_not_contact_at timestamptz,
  email_outreach_allowed boolean generated always as (
    email is not null and not do_not_contact and active
  ) stored,
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists zjobs_empresas_dept_idx on public.zjobs_empresas (country, department);
create index if not exists zjobs_empresas_band_idx on public.zjobs_empresas (employee_band);
create index if not exists zjobs_empresas_section_idx on public.zjobs_empresas (naf_section);
create index if not exists zjobs_empresas_email_idx on public.zjobs_empresas (lower(email)) where email is not null;

alter table public.zjobs_empresas enable row level security;
revoke all on table public.zjobs_empresas from anon, authenticated;
grant select, insert, update, delete on table public.zjobs_empresas to service_role;

comment on table public.zjobs_empresas is
  'Z Jobs — employeurs à prospecter (France, 10 salariés et plus ; registre SIRENE/RNE). Lecture serveur uniquement.';
comment on column public.zjobs_empresas.employee_band is
  'Tranche d''effectif salarié INSEE : 11 = 10-19, 12 = 20-49, 21 = 50-99, 22 = 100-199, 31 = 200-249, 32 = 250-499, 41 = 500-999, 42 = 1000-1999, 51 = 2000-4999, 52 = 5000-9999, 53 = 10000 et plus';
comment on column public.zjobs_empresas.email_outreach_allowed is
  'E-mail de prospection permis (B2B France, avec désinscription) ; jamais si do_not_contact ou entreprise fermée.';

-- Vérification (attendu : true, false, false) :
-- select has_table_privilege('service_role', 'public.zjobs_empresas', 'insert') as service_role,
--        has_table_privilege('anon', 'public.zjobs_empresas', 'select') as anon,
--        has_table_privilege('authenticated', 'public.zjobs_empresas', 'select') as authenticated;
