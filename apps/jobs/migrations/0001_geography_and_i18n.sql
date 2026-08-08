-- 0001_geography_and_i18n.sql
-- Z Jobs — fundação: geografia, idiomas, moedas, traduções.
-- Idempotente: usa IF NOT EXISTS / CREATE TYPE guarded.

begin;

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type work_regime as enum ('on_site', 'hybrid', 'remote');
exception when duplicate_object then null; end $$;

-- ---------- Currencies ----------
-- Tabela de referência ISO 4217. Introduzida para corrigir um erro de
-- desenho: countries.default_currency, candidate_profiles.desired_salary_currency
-- e job_offers.salary_currency tentavam referenciar countries(default_currency),
-- uma coluna sem restrição de unicidade — nunca tinha sido testado contra
-- Postgres real, por isso a migration nunca tinha chegado a correr.
create table if not exists currencies (
  code    char(3) primary key,   -- ISO 4217
  name    text not null
);

insert into currencies (code, name) values
  ('EUR', 'Euro'),
  ('USD', 'US Dollar'),
  ('GBP', 'Pound Sterling'),
  ('CHF', 'Swiss Franc'),
  ('SEK', 'Swedish Krona'),
  ('DKK', 'Danish Krone'),
  ('PLN', 'Polish Złoty'),
  ('CZK', 'Czech Koruna'),
  ('HUF', 'Hungarian Forint'),
  ('RON', 'Romanian Leu'),
  ('BGN', 'Bulgarian Lev')
on conflict (code) do nothing;

-- ---------- Countries ----------
create table if not exists countries (
  code            char(2) primary key,           -- ISO 3166-1 alpha-2
  name            text not null,
  default_locale  text not null,                  -- ex: 'pt-PT'
  default_currency char(3) not null references currencies(code),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table countries is
  'Países suportados pelo Z Jobs. is_active controla expansão faseada.';

-- ---------- Locales (idiomas suportados na plataforma) ----------
create table if not exists locales (
  code        text primary key,   -- ex: 'pt', 'en', 'fr', 'es'
  name        text not null,
  is_active   boolean not null default true
);

-- ---------- Locations (localização de oferta/empresa/candidato) ----------
create table if not exists locations (
  id              uuid primary key default gen_random_uuid(),
  country_code    char(2) not null references countries(code),
  admin_area      text,              -- subdivisão administrativa (distrito, région...)
  city            text,
  postal_code     text,
  latitude        double precision,
  longitude       double precision,
  created_at      timestamptz not null default now()
);

create index if not exists idx_locations_country on locations(country_code);
create index if not exists idx_locations_city on locations(city);

-- ---------- Translations (conteúdo localizável genérico) ----------
create table if not exists translations (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,      -- ex: 'job_offer', 'company_profile'
  entity_id     uuid not null,
  field         text not null,      -- ex: 'title', 'description'
  locale        text not null references locales(code),
  value         text not null,
  updated_at    timestamptz not null default now(),
  unique (entity_type, entity_id, field, locale)
);

create index if not exists idx_translations_lookup
  on translations(entity_type, entity_id, locale);

comment on table translations is
  'Conteúdo traduzível genérico. Evita colunas title_en/title_fr rígidas
   (ver secção 14 do briefing de produto).';

commit;
