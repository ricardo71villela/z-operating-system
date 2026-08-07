# ADR-0001 — Fundação do domínio Z Jobs

> **Historical note (2026-08-07):** this document predates access to the ZOS architecture. For current decisions, see `ADR-0003-zos-v1.1-convergence.md` and `docs/architecture/ZOS-ALIGNMENT-v1.1.md`.


## Contexto
Não existe, neste ambiente, acesso ao monorepo ZOS real (sem rede, sem repositório
carregado). Este ADR assume um projeto standalone que reproduz as convenções mais
comuns de um monorepo Supabase/PostgreSQL + TypeScript, para que possa ser
integrado manualmente no ZOS assim que houver acesso ao repositório real.

## Decisões

1. **Modelo de organizações genérico**, reutilizável por empresas, agências de
   recrutamento, universidades e entidades públicas — `organizations` +
   `organization_memberships` + `roles`, em vez de tabelas paralelas por tipo de
   entidade. O tipo de organização é um enum (`organization_type`), não uma tabela
   separada, para evitar explosão de esquemas.

2. **Salário estrutural, não texto livre.** `job_offers` tem
   `salary_min`, `salary_max`, `salary_currency`, `salary_period`,
   `salary_fixed_component` (boolean, sempre `true` para ser publicável) e
   `salary_variable_notes`. A regra "remuneração fixa garantida" é validada em
   código de domínio (`packages/domain/src/rules/jobOffer.ts`), não apenas na UI.

3. **i18n via tabela de traduções, não colunas `_en/_fr/_es`.**
   `translations(entity_type, entity_id, field, locale, value)` cobre qualquer
   entidade traduzível (ofertas, empresas, instituições) sem migrations novas por
   idioma.

4. **Geografia normalizada**: `countries`, `locations` (país + subdivisão + cidade),
   sem hardcode de moeda/idioma por país fixo em código — vêm de `countries.
   default_currency` / `countries.default_locale`, mas uma oferta pode ter moeda
   diferente do país (ex. remoto pago em EUR a partir de país fora da zona euro).

5. **RLS obrigatória em todas as tabelas com dados pessoais ou empresariais.**
   Sem uso de `service_role` em qualquer camada de frontend — só em jobs de
   background (moderação automática, expiração de ofertas).

6. **Estados como enums explícitos** (não strings livres) para `job_offers`,
   `applications`, `company_verification_status` — replicando exatamente os
   estados definidos no documento de princípios.

7. **Sem lógica de billing real neste sprint.** Existe apenas o enum
   `organization_plan` e uma tabela `billing_events` vazia de lógica, para não
   bloquear a fundação com decisões de pricing.

## Não incluído neste sprint (por desenho, ver secção 19 do briefing)
ATS avançado, matching por IA, billing real, scoring público, integrações
institucionais em massa.

## Risco assumido
Este ADR foi escrito sem visibilidade sobre esquemas ZOS já existentes
(`identity`, `registry`, `company`, `geography`). Os nomes de tabelas abaixo
(`organizations`, `locations`, etc.) **podem colidir ou duplicar** entidades já
existentes no ZOS real. Antes de aplicar estas migrations a uma base de dados
ZOS real, é obrigatório um diff de esquema — ver secção "Próximos passos" no
relatório final.
