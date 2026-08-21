-- ============================================================
-- Z Fashion — Campaign v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors fashion-domain/src/campaign.js exactly, including the
-- OFFICIAL_SOLDES_WINDOWS table and the rule that Soldes dates must
-- match a real decreed window — never invented. A CHECK constraint
-- cannot query another table, so this uses a BEFORE INSERT/UPDATE
-- trigger to enforce the same rule createCampaign() enforces in JS.
-- ============================================================

create type fashion.campaign_type as enum (
  'destaques',
  'saldos',
  'vendas_privadas',
  'novas_colecoes',
  'soldes',
  'black_friday'
);

create table fashion.official_soldes_windows (
  country_iso text not null check (country_iso ~ '^[A-Z]{2}$'),
  season text not null check (season in ('winter', 'summer')),
  start_date date not null,
  end_date date not null,
  year integer not null,
  primary key (country_iso, start_date, end_date),
  constraint fashion_soldes_windows_validity check (end_date > start_date)
);

comment on table fashion.official_soldes_windows is 'Mirrors OFFICIAL_SOLDES_WINDOWS in campaign.js. France-national baseline (Code de commerce L.310-3, arrêté du 27 mai 2019) — regional exceptions (Alsace-Moselle, Corsica, Overseas) deliberately not modeled here, same discipline Geography applied to Region being optional. Extend per real decreed windows only, never invented ones.';

alter table fashion.official_soldes_windows enable row level security;

insert into fashion.official_soldes_windows (country_iso, season, start_date, end_date, year) values
  ('FR', 'winter', '2026-01-07', '2026-02-03', 2026),
  ('FR', 'summer', '2026-06-24', '2026-07-28', 2026),
  ('FR', 'winter', '2027-01-06', '2027-02-02', 2027);

create table fashion.campaigns (
  id uuid primary key default gen_random_uuid(),
  type fashion.campaign_type not null,
  start_date date not null,
  end_date date not null,
  country_iso text check (country_iso is null or country_iso ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fashion_campaigns_date_order check (end_date >= start_date)
);

comment on table fashion.campaigns is 'Mirrors campaign.js. Soldes and Black Friday are distinct types on purpose — Soldes dates are legally fixed and checked against fashion.official_soldes_windows by trigger; Black Friday has no such constraint.';

alter table fashion.campaigns enable row level security;

create or replace function fashion.check_soldes_window() returns trigger as $$
begin
  if new.type = 'soldes' then
    if new.country_iso is null then
      raise exception 'type "soldes" requires country_iso — the legal window is per-country';
    end if;
    if not exists (
      select 1 from fashion.official_soldes_windows w
      where w.country_iso = new.country_iso
        and w.start_date = new.start_date
        and w.end_date = new.end_date
    ) then
      raise exception 'type "soldes" dates %..% do not match any registered official window for % — Soldes dates are fixed by law, not chosen; register the real decreed window in fashion.official_soldes_windows before creating this campaign', new.start_date, new.end_date, new.country_iso;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger fashion_campaigns_check_soldes_window
  before insert or update on fashion.campaigns
  for each row execute function fashion.check_soldes_window();

create index idx_fashion_campaigns_type_dates on fashion.campaigns(type, start_date, end_date);
