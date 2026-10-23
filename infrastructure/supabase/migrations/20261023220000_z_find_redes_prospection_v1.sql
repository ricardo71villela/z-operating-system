-- ============================================================
-- Z FIND — réseaux immobiliers à prospecter séparément, v1
--
-- Les têtes de réseau (franchises, coopératives, réseaux intégrés et
-- réseaux de mandataires) se démarchent à part des agences : un accord avec
-- un réseau peut amener toutes ses agences ou tous ses conseillers.
--
-- public.zfind_redes : une ligne par réseau. La clé `network` est la même
-- que la colonne zfind_agencias.network (détection par le nom / l'enseigne
-- dans apps/find/ingest/agencias/src/common.py), ce qui permet de voir
-- quelles agences de la base appartiennent à chaque réseau.
--
-- Colonnes de référence (nom, modèle, pays, site, taille) : remplies ici,
-- mises à jour quand on relance ce fichier. Colonnes de suivi (statut,
-- contact, dates, notes) : jamais écrasées par ce fichier.
--
-- Tailles : ordres de grandeur publiés (sources indiquées), à revérifier
-- avant tout rendez-vous. NULL = pas de chiffre fiable trouvé.
--
-- public.zfind_redes_resumo : le réseau + ses agences et mandataires
-- présents dans zfind_agencias (actifs), et combien ont un e-mail.
--
-- Accès : administrateurs Z Find (is_admin()) en lecture et en mise à jour
-- du suivi, comme zfind_agencias ; rôle serveur complet ; rien pour anon.
-- Idempotent : peut être relancé.
-- ============================================================

create table if not exists public.zfind_redes (
  network text primary key,
  name text not null,
  model text not null check (model in ('franchise', 'cooperative', 'integrated', 'mandataires', 'mixed')),
  countries text[] not null default array['FR'],
  website text,
  hq_legal_name text,
  hq_siren text,
  hq_city text,
  size_agencies integer,
  size_agents integer,
  size_source text,
  size_as_of date,
  prospect_status text not null default 'a_contactar'
    check (prospect_status in ('a_contactar', 'contactado', 'em_conversa', 'acordo', 'recusou', 'nao_contactar')),
  contact_name text,
  contact_role text,
  contact_email text,
  contact_phone text,
  last_contact_at date,
  next_step text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.zfind_redes is
  'Z Find — têtes de réseau immobilier (FR/BE/LU) prospectées à part. network = zfind_agencias.network.';
comment on column public.zfind_redes.model is
  'franchise ; cooperative (Orpi, L''Adresse) ; integrated (succursales) ; mandataires (réseau de conseillers indépendants) ; mixed';
comment on column public.zfind_redes.prospect_status is
  'a_contactar, contactado, em_conversa, acordo, recusou, nao_contactar';

alter table public.zfind_redes enable row level security;
revoke all on table public.zfind_redes from anon, authenticated;
grant select, insert, update, delete on table public.zfind_redes to service_role;
grant select on table public.zfind_redes to authenticated;
grant update (prospect_status, contact_name, contact_role, contact_email, contact_phone, last_contact_at, next_step, notes,
              hq_legal_name, hq_siren, hq_city, website, size_agencies, size_agents, size_source, size_as_of, updated_at)
  on table public.zfind_redes to authenticated;

drop policy if exists "admin read redes" on public.zfind_redes;
create policy "admin read redes" on public.zfind_redes
  for select to authenticated using (public.is_admin());

drop policy if exists "admin update redes" on public.zfind_redes;
create policy "admin update redes" on public.zfind_redes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Données de référence ------------------------------------------------------

insert into public.zfind_redes as r
  (network, name, model, countries, website, hq_legal_name, hq_siren, hq_city, size_agencies, size_agents, size_source, size_as_of)
values
  -- Franchises, coopératives et réseaux intégrés
  ('orpi', 'Orpi', 'cooperative', array['FR'], 'https://www.orpi.com', null, null, null, 1250, null, 'imprimerie-immo.com, enseignes d''agences (non daté)', null),
  ('century-21', 'Century 21', 'franchise', array['FR', 'BE', 'LU'], 'https://www.century21.fr', null, null, null, 940, null, 'imprimerie-immo.com, enseignes d''agences (non daté) ; 850 selon dartagnans-invest.fr', null),
  ('stephane-plaza', 'Stéphane Plaza Immobilier', 'franchise', array['FR'], 'https://www.stephaneplazaimmobilier.com', null, null, null, 670, null, 'imprimerie-immo.com (non daté)', null),
  ('laforet', 'Laforêt', 'franchise', array['FR'], 'https://www.laforet.com', null, null, null, 700, null, 'imprimerie-immo.com (non daté) ; 750 selon dartagnans-invest.fr', null),
  ('human-immobilier', 'Human Immobilier', 'integrated', array['FR'], 'https://www.human-immobilier.fr', null, null, null, 650, null, 'imprimerie-immo.com (non daté)', null),
  ('foncia', 'Foncia', 'integrated', array['FR'], 'https://fr.foncia.com', null, null, null, 600, null, 'imprimerie-immo.com (non daté)', null),
  ('guy-hoquet', 'Guy Hoquet l''Immobilier', 'franchise', array['FR'], 'https://www.guy-hoquet.com', null, null, null, 500, null, 'imprimerie-immo.com (non daté)', null),
  ('nestenn', 'Nestenn', 'franchise', array['FR'], 'https://www.nestenn.com', 'NESTENN', '439679713', 'La Garde', 400, null, 'imprimerie-immo.com (non daté)', null),
  ('era', 'ERA Immobilier', 'franchise', array['FR', 'BE', 'LU'], 'https://www.erafrance.com', null, null, null, 380, null, 'imprimerie-immo.com, France (non daté)', null),
  ('l-adresse', 'L''Adresse', 'cooperative', array['FR'], 'https://www.ladresse.com', null, null, null, 300, null, 'imprimerie-immo.com (non daté)', null),
  ('citya', 'Citya Immobilier', 'integrated', array['FR'], 'https://www.citya.com', 'CITYA DEVELOPPEMENT', '832416242', 'Tours', 250, null, 'dartagnans-invest.fr (non daté)', null),
  ('square-habitat', 'Square Habitat (Crédit Agricole)', 'integrated', array['FR'], 'https://www.squarehabitat.fr', null, null, null, null, null, null, null),
  ('arthurimmo', 'Arthurimmo.com', 'franchise', array['FR'], 'https://www.arthurimmo.com', null, null, null, null, null, null, null),
  ('nexity', 'Nexity', 'integrated', array['FR'], 'https://www.nexity.fr', null, null, 'Saint-Ouen-sur-Seine', null, null, null, null),
  ('cimm', 'Cimm Immobilier', 'franchise', array['FR'], 'https://www.cimm-immobilier.fr', null, null, null, null, null, null, null),
  ('oralia', 'Oralia', 'integrated', array['FR'], 'https://www.oralia.fr', null, null, null, null, null, null, null),
  ('imogroup', 'Imogroup', 'franchise', array['FR'], null, null, null, null, null, null, null, null),
  ('remax', 'RE/MAX', 'franchise', array['FR', 'BE', 'LU'], 'https://www.remax.fr', null, null, null, null, null, null, null),
  ('keller-williams', 'Keller Williams', 'franchise', array['FR'], 'https://www.kwfrance.com', null, null, null, null, null, null, null),
  ('coldwell-banker', 'Coldwell Banker', 'franchise', array['FR'], 'https://www.coldwellbanker.fr', null, null, null, null, null, null, null),
  -- Haut de gamme
  ('barnes', 'Barnes', 'mixed', array['FR'], 'https://www.barnes-international.com', 'BARNES', '414057992', 'Neuilly-sur-Seine', null, null, null, null),
  ('sothebys', 'Sotheby''s International Realty', 'franchise', array['FR', 'BE', 'LU'], null, null, null, null, null, null, null, null),
  ('john-taylor', 'John Taylor', 'mixed', array['FR'], 'https://www.john-taylor.com', 'JOHN TAYLOR', '775550510', 'Cannes', null, null, null, null),
  ('engel-volkers', 'Engel & Völkers', 'franchise', array['FR', 'BE', 'LU'], 'https://www.engelvoelkers.com', null, null, null, null, null, null, null),
  -- Réseaux de mandataires (taille = conseillers en France)
  ('iad', 'iad France', 'mandataires', array['FR'], 'https://www.iadfrance.fr', 'I@D FRANCE', '503676421', 'Lieusaint', null, 14000, 'imprimerie-immo.com, classement mandataires : ~14 000-15 000 au 1er janvier 2026', '2026-01-01'),
  ('safti', 'SAFTI', 'mandataires', array['FR'], 'https://www.safti.fr', 'SAFTI', '523964328', 'Toulouse', null, 6000, 'imprimerie-immo.com, classement mandataires, au 1er janvier 2026', '2026-01-01'),
  ('bsk', 'BSK Immobilier', 'mandataires', array['FR'], 'https://www.bskimmobilier.com', 'BSK IMMOBILIER', '521907519', 'Labège', null, 4600, 'imprimerie-immo.com : ~4 600-4 900 au 1er janvier 2026', '2026-01-01'),
  ('proprietes-privees', 'Propriétés-privées.com', 'mandataires', array['FR'], 'https://www.proprietes-privees.com', 'PROPRIETES PRIVEES', '487624777', 'Vertou', null, 4000, 'imprimerie-immo.com : 4 000+ au 1er janvier 2026', '2026-01-01'),
  ('capifrance', 'Capifrance', 'mandataires', array['FR'], 'https://www.capifrance.fr', null, null, null, null, 2700, 'imprimerie-immo.com : ~2 700-3 000 au 1er janvier 2026', '2026-01-01'),
  ('optimhome', 'Optimhome', 'mandataires', array['FR'], 'https://www.optimhome.com', 'SAS OPTIMHOME', '491698643', 'Castelnau-le-Lez', null, 1700, 'imprimerie-immo.com, au 1er janvier 2026', '2026-01-01'),
  ('megagence', 'megAgence', 'mandataires', array['FR'], 'https://www.megagence.com', 'MEGAGENCE', '531140515', 'Toulouse', null, 1500, 'imprimerie-immo.com, au 1er janvier 2026', '2026-01-01'),
  ('efficity', 'efficity', 'mandataires', array['FR'], 'https://www.efficity.com', 'EFFICITY', '497617746', 'Paris', null, 1500, 'imprimerie-immo.com, au 1er janvier 2026', '2026-01-01'),
  ('3g-immo', '3G Immo', 'mandataires', array['FR'], 'https://www.3gimmo.com', null, null, null, null, 1200, 'imprimerie-immo.com, au 1er janvier 2026', '2026-01-01'),
  ('exp', 'eXp France', 'mandataires', array['FR'], 'https://www.expfrance.fr', null, null, null, null, null, null, null),
  ('expertimo', 'Expertimo', 'mandataires', array['FR'], null, null, null, null, null, null, null, null),
  ('dr-house', 'Dr House Immo', 'mandataires', array['FR'], null, null, null, null, null, null, null, null),
  ('sextant', 'Sextant France', 'mandataires', array['FR'], null, null, null, null, null, null, null, null),
  -- Belgique
  ('dewaele', 'Dewaele', 'integrated', array['BE'], 'https://www.dewaele.com', null, null, null, null, null, null, null),
  ('trevi', 'Trevi', 'franchise', array['BE'], 'https://www.trevi.be', null, null, null, null, null, null, null),
  ('latour-petit', 'Latour & Petit', 'integrated', array['BE'], 'https://www.latouretpetit.be', null, null, null, null, null, null, null)
on conflict (network) do update set
  name = excluded.name,
  model = excluded.model,
  countries = excluded.countries,
  website = coalesce(r.website, excluded.website),
  hq_legal_name = coalesce(r.hq_legal_name, excluded.hq_legal_name),
  hq_siren = coalesce(r.hq_siren, excluded.hq_siren),
  hq_city = coalesce(r.hq_city, excluded.hq_city),
  size_agencies = coalesce(excluded.size_agencies, r.size_agencies),
  size_agents = coalesce(excluded.size_agents, r.size_agents),
  size_source = coalesce(excluded.size_source, r.size_source),
  size_as_of = coalesce(excluded.size_as_of, r.size_as_of),
  updated_at = now();

-- Vue de suivi ---------------------------------------------------------------

create or replace view public.zfind_redes_resumo
with (security_invoker = true) as
select
  r.network,
  r.name,
  r.model,
  r.countries,
  r.size_agencies,
  r.size_agents,
  r.prospect_status,
  r.contact_name,
  r.last_contact_at,
  r.next_step,
  coalesce(b.agencias_na_base, 0) as agencias_na_base,
  coalesce(b.mandatarios_na_base, 0) as mandatarios_na_base,
  coalesce(b.com_email, 0) as com_email,
  r.website,
  r.hq_city
from public.zfind_redes r
left join (
  select network,
         count(*) filter (where type <> 'independent') as agencias_na_base,
         count(*) filter (where type = 'independent') as mandatarios_na_base,
         count(*) filter (where email_outreach_allowed) as com_email
    from public.zfind_agencias
   where active and network is not null
   group by network
) b using (network);

revoke all on public.zfind_redes_resumo from anon;
grant select on public.zfind_redes_resumo to authenticated, service_role;

comment on view public.zfind_redes_resumo is
  'Z Find — chaque réseau avec ses agences et mandataires présents dans zfind_agencias (actifs). Administrateurs uniquement (RLS des tables).';

-- Vérification :
-- select network, name, model, size_agencies, size_agents, agencias_na_base, prospect_status
--   from public.zfind_redes_resumo order by coalesce(size_agents, size_agencies, 0) desc;
