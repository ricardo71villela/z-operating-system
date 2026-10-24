-- ============================================================
-- Z JOBS — établissements à fort potentiel d'embauche (La Bonne Boîte), v1
--
-- Alimentée chaque mois par apps/jobs/ingest/labonneboite (GitHub Action
-- « Z Jobs — La Bonne Boîte »), depuis l'API La Bonne Boîte v2 de France
-- Travail : les établissements dont France Travail prévoit qu'ils vont
-- recruter dans les prochains mois (is_high_potential), par grand domaine
-- de métiers ROME et par département.
--
-- Sert à choisir d'abord, dans zjobs_empresas, les entreprises qui vont
-- recruter. Aucune adresse e-mail ni téléphone : l'API ne les donne pas
-- (accepts_email_applications dit seulement si l'entreprise accepte les
-- candidatures spontanées par e-mail).
--
-- public.zjobs_empresas_a_recrutar : chaque entreprise de zjobs_empresas
-- avec ses établissements à fort potentiel (nombre, potentiel maximal,
-- métiers), pour trier la prospection.
--
-- Accès : rôle serveur complet ; administrateurs (is_admin()) en lecture ;
-- rien pour anon. Idempotent : peut être relancé.
-- ============================================================

create table if not exists public.zjobs_recrutamento (
  siret text primary key check (siret ~ '^[0-9]{14}$'),
  siren text not null,
  company_name text,
  office_name text,
  naf text,
  naf_label text,
  headcount_min integer,
  headcount_max integer,
  city text,
  citycode text,
  postcode text,
  department text,
  hiring_potential numeric(5, 2),
  is_high_potential boolean not null default true,
  roms text[] not null default '{}',
  domains text[] not null default '{}',
  accepts_email_applications boolean,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists zjobs_recrutamento_siren_idx on public.zjobs_recrutamento (siren) where active;
create index if not exists zjobs_recrutamento_dept_idx on public.zjobs_recrutamento (department) where active;

comment on table public.zjobs_recrutamento is
  'Z Jobs — établissements à fort potentiel d''embauche selon La Bonne Boîte (France Travail). Lecture serveur et administrateurs.';
comment on column public.zjobs_recrutamento.roms is 'Codes métiers ROME pour lesquels l''établissement a un fort potentiel d''embauche.';
comment on column public.zjobs_recrutamento.domains is 'Grands domaines ROME (A à N) correspondants.';

alter table public.zjobs_recrutamento enable row level security;
revoke all on table public.zjobs_recrutamento from anon, authenticated;
grant select, insert, update, delete on table public.zjobs_recrutamento to service_role;
grant select on table public.zjobs_recrutamento to authenticated;

drop policy if exists "admin read recrutamento" on public.zjobs_recrutamento;
create policy "admin read recrutamento" on public.zjobs_recrutamento
  for select to authenticated using (public.is_admin());

-- Les administrateurs lisent aussi la base des entreprises (comme
-- zfind_agencias), pour la vue ci-dessous.
grant select on table public.zjobs_empresas to authenticated;
drop policy if exists "admin read empresas" on public.zjobs_empresas;
create policy "admin read empresas" on public.zjobs_empresas
  for select to authenticated using (public.is_admin());

create or replace view public.zjobs_empresas_a_recrutar
with (security_invoker = true) as
with por_empresa as (
  select siren,
         count(*) as etablissements_a_recrutar,
         max(hiring_potential) as hiring_potential_max,
         array_agg(distinct department) filter (where department is not null) as departments
    from public.zjobs_recrutamento
   where active
   group by siren
),
metiers as (
  select siren, array_agg(distinct rome order by rome) as roms
    from public.zjobs_recrutamento, unnest(roms) as rome
   where active
   group by siren
),
domaines as (
  select siren, array_agg(distinct domain order by domain) as domains
    from public.zjobs_recrutamento, unnest(domains) as domain
   where active
   group by siren
)
select
  e.id,
  e.source_id as siren,
  e.name,
  e.trade_name,
  e.naf_code,
  e.naf_section,
  e.employee_band,
  e.company_category,
  e.city,
  e.department,
  e.email,
  e.phone,
  e.website,
  e.do_not_contact,
  p.etablissements_a_recrutar,
  p.hiring_potential_max,
  m.roms,
  d.domains,
  p.departments
from public.zjobs_empresas e
join por_empresa p on p.siren = e.source_id
left join metiers m on m.siren = e.source_id
left join domaines d on d.siren = e.source_id
where e.active;

revoke all on public.zjobs_empresas_a_recrutar from anon;
grant select on public.zjobs_empresas_a_recrutar to authenticated, service_role;

comment on view public.zjobs_empresas_a_recrutar is
  'Z Jobs — entreprises (10 salariés et plus) avec au moins un établissement à fort potentiel d''embauche (La Bonne Boîte). Trier par hiring_potential_max.';

-- Vérification :
-- select name, city, employee_band, etablissements_a_recrutar, hiring_potential_max, domains
--   from public.zjobs_empresas_a_recrutar order by hiring_potential_max desc, etablissements_a_recrutar desc limit 20;
