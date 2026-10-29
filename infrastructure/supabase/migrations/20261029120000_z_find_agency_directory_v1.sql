-- Z Find — annuaire public des agences immobilières par commune
-- (/fr/agences-immobilieres/{commune}-{insee}, api/agences.js).
--
-- Sources : registre SIRENE (INSEE, licence ouverte) déjà chargé dans
-- zfind_agencias. Seules les personnes morales actives, d'activité 68.31Z
-- (agences immobilières), qui ne se sont pas opposées à être contactées,
-- apparaissent. Les contacts (e-mail, téléphone, site) et les
-- entrepreneurs individuels (personnes physiques) restent hors de l'annuaire.
--
-- Deux vues en lecture seule, réservées au rôle serveur (service_role) :
-- la page ne lit que ces colonnes. Idempotent.

create index if not exists zfind_agencias_commune_idx
  on public.zfind_agencias (commune_code) where active;

create or replace view public.zfind_agency_directory as
select a.id, a.country, a.commune_code, a.postcode, a.city,
       coalesce(nullif(btrim(a.trade_name), ''), a.name) as display_name,
       a.name as legal_name, a.type, a.network, a.address, a.registry_created
from public.zfind_agencias a
where a.active
  and not coalesce(a.is_natural_person, false)
  and not coalesce(a.do_not_contact, false)
  and a.type in ('agency', 'network_agency')
  and a.activity_code = '68.31Z'
  and a.commune_code is not null;

create or replace view public.zfind_agency_commune_counts as
select commune_code, count(*)::int as n,
       count(*) filter (where type = 'network_agency')::int as networks
from public.zfind_agency_directory
group by commune_code;

revoke all on public.zfind_agency_directory from public, anon, authenticated;
revoke all on public.zfind_agency_commune_counts from public, anon, authenticated;
grant select on public.zfind_agency_directory to service_role;
grant select on public.zfind_agency_commune_counts to service_role;
