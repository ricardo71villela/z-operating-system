-- 0023_labor_legislation_and_tax_simulator.sql
-- Z Jobs — guia de legislação laboral por país e simulador bruto->líquido.
--
-- Escala explicitamente pan-europeia: os cinco países do bloco de
-- lançamento (PT/IT/ES/FR/DE) são tratados em pé de igualdade — nenhum
-- é o "país principal" da plataforma. Onde existe uma diretiva da UE que
-- estabelece um mínimo comum (tempo de trabalho, férias), essa é a
-- fonte citada para todos; onde a regra é só nacional (salário mínimo),
-- cada país tem a sua própria fonte oficial, sem hierarquia entre elas.

begin;

create table if not exists country_labor_profiles (
  country_code            char(2) primary key references countries(code),

  has_statutory_minimum_wage boolean not null,
  minimum_wage_monthly    numeric(12,2),          -- null quando has_statutory_minimum_wage = false
  minimum_wage_currency   char(3) references currencies(code),
  minimum_wage_source     text not null,
  minimum_wage_source_url text not null,
  minimum_wage_effective_date date not null,

  max_weekly_hours        numeric(5,2) not null,   -- baseline UE: 48h (Diretiva 2003/88/CE, Art. 6.º)
  min_annual_leave_days   integer not null,         -- baseline UE: 20 dias úteis (Diretiva 2003/88/CE, Art. 7.º)
  working_time_source     text not null default 'Diretiva 2003/88/CE do Parlamento Europeu e do Conselho',
  working_time_source_url text not null default 'https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32003L0088',

  notes                   text,
  updated_at              timestamptz not null default now()
);

comment on table country_labor_profiles is
  'Factos verificáveis, nunca interpretação jurídica. Cada organização
   deve sempre confirmar a aplicação ao seu caso concreto junto de
   aconselhamento jurídico local — esta tabela é ponto de partida
   informativo, não substitui aconselhamento profissional.';

-- ---------- Simulador salário bruto -> líquido ----------
create table if not exists country_income_tax_brackets (
  id             uuid primary key default gen_random_uuid(),
  country_code   char(2) not null references countries(code),
  bracket_order  integer not null,
  income_from    numeric(14,2) not null,
  income_to      numeric(14,2),        -- null = sem limite superior (último escalão)
  marginal_rate  numeric(5,4) not null,   -- ex: 0.1100 = 11%
  unique (country_code, bracket_order)
);

create table if not exists country_tax_profiles (
  country_code                     char(2) primary key references countries(code),
  employee_social_contribution_rate numeric(5,4) not null,  -- taxa agregada simplificada
  currency                         char(3) not null references currencies(code),
  tax_bracket_source               text not null,
  tax_bracket_source_url           text not null,
  social_contribution_source       text not null,
  social_contribution_source_url   text not null,
  applicable_tax_year              integer not null,
  scope_notes                      text not null,   -- OBRIGATÓRIO: que simplificações foram feitas
  updated_at                       timestamptz not null default now()
);

comment on table country_tax_profiles is
  'scope_notes é obrigatório e tem de descrever exatamente que
   simplificações o cálculo assume (ex: pessoa solteira, sem
   dependentes, sem quociente familiar) — ver
   packages/domain/src/rules/netSalarySimulator.ts. Este simulador NUNCA
   substitui o simulador oficial do país nem aconselhamento fiscal
   profissional — é só uma estimativa de orientação.';

-- ---------- RLS: dados de referência oficiais, leitura pública, escrita só staff ----------
alter table country_labor_profiles enable row level security;
alter table country_income_tax_brackets enable row level security;
alter table country_tax_profiles enable row level security;

create policy country_labor_profiles_select_public on country_labor_profiles for select using (true);
create policy country_labor_profiles_manage_staff on country_labor_profiles for all using (is_platform_staff()) with check (is_platform_staff());

create policy country_tax_brackets_select_public on country_income_tax_brackets for select using (true);
create policy country_tax_brackets_manage_staff on country_income_tax_brackets for all using (is_platform_staff()) with check (is_platform_staff());

create policy country_tax_profiles_select_public on country_tax_profiles for select using (true);
create policy country_tax_profiles_manage_staff on country_tax_profiles for all using (is_platform_staff()) with check (is_platform_staff());

commit;
