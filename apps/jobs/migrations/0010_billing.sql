-- 0010_billing.sql
-- Z Jobs — abstrações de billing (secção 13). Deliberadamente sem lógica
-- financeira: sem preços, sem processamento de pagamento, sem gateway.
-- Serve só para registar QUE produto foi concedido a QUE organização e
-- durante quanto tempo — a decisão de preços/pagamento fica fora deste
-- sprint (secção 13: "não implementes pagamentos reais sem antes
-- apresentar o modelo de produtos, preços, permissões e eventos").
--
-- Candidatos nunca aparecem nesta migration — são sempre gratuitos
-- (secção 3.1) e este domínio não os modela de todo.

begin;

do $$ begin
  create type billing_product_code as enum (
    'job_post_single',
    'job_post_bundle',
    'subscription_standard',
    'subscription_enterprise',
    'talent_search_access',
    'employer_branding_page',
    'featured_placement',
    'ats_integration',
    'career_day_listing',
    'market_analytics_report'
  );
exception when duplicate_object then null; end $$;

-- Eventos de concessão de acesso — nunca uma tabela de "faturas" ou
-- "pagamentos"; a integração com um gateway real fica para quando o
-- modelo de preços for aprovado.
create table if not exists billing_events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  product_code      billing_product_code not null,
  granted_at        timestamptz not null default now(),
  expires_at        timestamptz,
  granted_by        uuid references auth.users(id),  -- operador manual nesta fase; nunca um gateway
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_billing_events_org on billing_events(organization_id);
create index if not exists idx_billing_events_product on billing_events(product_code);

comment on table billing_events is
  'Registo de concessão de funcionalidades, não de pagamentos. A ligação
   entre isto e dinheiro real acontece fora da plataforma nesta fase
   (ex: contrato comercial manual). Nunca usar esta tabela para calcular
   receita — não tem preços.';

alter table billing_events enable row level security;

create policy billing_events_select_org on billing_events
  for select using (is_org_member(organization_id) or is_platform_staff());

create policy billing_events_manage_platform_staff on billing_events
  for all using (is_platform_staff());

commit;
