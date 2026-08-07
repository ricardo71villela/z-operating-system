# Guia de Integração — Z Jobs → ZOS real

> **Historical note (2026-08-07):** this document predates access to the ZOS architecture. For current decisions, see `ADR-0003-zos-v1.1-convergence.md` and `docs/architecture/ZOS-ALIGNMENT-v1.1.md`.


Este documento assume que vais fazer a integração do lado de fora desta
sandbox (opção 3 escolhida: sem upload de ficheiros nem conector ligado).
É o caminho mais seguro dado que nunca vi o teu repositório real — segue-o
literalmente, não saltes passos de verificação.

## 0. Antes de tocar em código

Faz um branch novo. Não integres diretamente em `main`/`develop`.

```bash
git checkout -b feature/z-jobs-foundation
```

## 1. Diagnóstico obrigatório (secção 1 do briefing)

Corre isto no teu repositório ZOS real e guarda o resultado — vais precisar
dele no passo 3:

```bash
# Lista todos os schemas/tabelas existentes relacionados com os domínios
# que este protótipo também modela
grep -ril "identity\|registry\|company\|geography\|organization" --include="*.sql" .
find . -path "*/migrations/*.sql" | sort

# Se usas Supabase CLI:
supabase db diff --schema public
```

Responde a estas perguntas antes de continuar:

- [ ] Já existe uma tabela `organizations` ou equivalente (`registry.entities`,
      `companies`, etc.)? Qual o nome real?
- [ ] Já existe um sistema de papéis/permissões (`organization_memberships`,
      `roles`, `permissions`)? Qual o nome real?
- [ ] Já existe um modelo de geografia (`countries`, `locations`)?
- [ ] Já existe uma tabela de traduções genérica, ou o ZOS usa outra
      estratégia de i18n?
- [ ] O ZOS usa Supabase Auth (`auth.users`) ou um sistema de identidade
      próprio?

## 2. Mapeamento de tabelas — o que é novo vs. o que colide

| Tabela deste protótipo | Ação provável |
|---|---|
| `countries`, `locales`, `locations`, `translations` | **Reutilizar se já existir** um domínio `Geography`/`i18n` no ZOS. Só criar se não existir. |
| `persons`, `organizations`, `organization_memberships`, `organization_invitations` | **Muito provavelmente colide** com `Identity`/`Registry`/`Company` do ZOS. Não criar às cegas — ver passo 3. |
| `company_profiles`, `company_locations`, `employer_responsibility_metrics`, `employer_badges` | Específico do Z Jobs. Deve **referenciar** a tabela de organizações real do ZOS via FK, não duplicá-la. |
| `candidate_profiles`, `candidate_private_data`, `candidate_data_consents`, `candidate_experiences`, `candidate_education`, `skills`, `candidate_skills`, `candidate_languages`, `candidate_documents` | Específico do Z Jobs — só existe se o ZOS não tiver já um domínio de "perfil profissional". Referenciar `auth.users`/identidade real. |
| `job_offers`, `job_offer_revisions`, `job_offer_reports`, `applications`, `application_status_history`, `application_notes`, `saved_job_offers`, `job_alerts` | Sempre novo — é o núcleo do Z Jobs, não deve existir no ZOS genérico. |
| `institution_profiles`, `institution_courses`, `institution_affiliations`, `offer_institution_reservations` | Específico do Z Jobs, referencia organizações reais. |
| `billing_events` | Específico do Z Jobs — verifica se o ZOS já tem uma tabela de billing genérica antes de criar outra. |
| `audit_logs` | **Muito provavelmente já existe** no ZOS a nível de plataforma. Reutilizar se possível. |

## 3. Resolver colisões (regra de decisão)

Para cada tabela marcada "provavelmente colide" acima:

1. Se o ZOS já tem o equivalente funcional → **apaga a tabela deste
   protótipo** e reescreve as FKs de `apps/api` e `packages/domain` para
   apontar para o nome real do ZOS.
2. Se o ZOS tem algo parecido mas insuficiente (ex: falta
   `verification_status` em `organizations`) → **estende a tabela do ZOS**
   com uma migration `ALTER TABLE`, nunca dupliques o conceito.
3. Se não existe nada → aplica a migration deste protótipo tal como está,
   apenas renumerando o prefixo (ver passo 4).

## 4. Renumerar as migrations

As migrations deste protótipo (`0001` a `0010`) foram numeradas para uma
sequência isolada. Ao integrar:

```bash
# Renomeia com o timestamp/sequência que o teu ZOS já usa, ex:
# 20260731120000_zjobs_geography_and_i18n.sql
for f in migrations/*.sql; do
  ts=$(date -u +%Y%m%d%H%M%S)
  mv "$f" "supabase/migrations/${ts}_zjobs_$(basename "$f" | sed 's/^[0-9]*_//')"
  sleep 1  # garante timestamps únicos e ordenados
done
```

Aplica uma migration de cada vez, num ambiente de staging, nunca todas de
uma vez em produção:

```bash
supabase db push --dry-run   # revê o SQL gerado antes de aplicar a sério
supabase db push
```

## 5. Substituir o repositório em memória por Supabase real

`apps/api/src/store.ts` foi desenhado exatamente para ser descartável.
Cria um novo ficheiro `apps/api/src/supabaseStore.ts` que implemente a
mesma interface pública (`createUser`, `createOrganization`,
`createJobOffer`, `validateJobOfferForPublication` via
`packages/domain`, etc.), mas com chamadas Supabase reais:

```typescript
// esboço — adapta aos nomes reais do teu schema após o passo 3
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// NUNCA uses a service_role key no frontend — só em apps/api (backend).

export async function createJobOffer(draft: JobOfferDraft) {
  const { data, error } = await supabase.from('job_offers').insert(draft).select().single();
  if (error) throw error;
  return data;
}
```

`server.ts` não precisa de mudar — só o import de `store.ts` para
`supabaseStore.ts`. Toda a lógica de negócio (`packages/domain`) já está
desacoplada do armazenamento e não muda nada.

## 6. Autenticação

Este protótipo assume `auth.users` do Supabase Auth. Se o ZOS usa outro
sistema de identidade:

- Substitui todas as FKs `references auth.users(id)` nas migrations pelo
  equivalente real (ex: `references identity.users(id)`).
- Ajusta as funções RLS `is_org_member`, `is_platform_staff`,
  `is_verified_employer` em `0007_rls_policies.sql` para usarem a função
  de identidade do utilizador atual que o ZOS já usa (pode não ser
  `auth.uid()`).

## 7. Frontend — de protótipo autocontido para apps reais

`ZJobsDemo.jsx` é deliberadamente autocontido (estado em memória) para ser
testável sem infraestrutura. Para produção, divide-o em três apps reais
conforme a secção 16 do briefing:

- `apps/jobs-web` — portal público + área do candidato. Migra `PublicView`
  e `CandidateView` para páginas Next.js (ou o framework que o ZOS usa),
  trocando `useState` por chamadas fetch a `apps/api`.
- `apps/jobs-partner` — `CompanyView`.
- `apps/jobs-admin` — `AdminView`.

Os componentes já estão isolados (`SalaryLedger`, `VerificationBadge`,
`OfferForm`, etc.) — copia-os quase sem alterações; só a fonte de dados
muda de `useState` para `fetch`/React Query contra `apps/api`.

## 8. Ordem de integração recomendada

Não integres tudo de uma vez. Ordem sugerida, cada passo com testes a
passar antes do seguinte:

1. Migrations de geografia/i18n (só se não colidirem — passo 3).
2. Migrations de organizações/identidade (mais provável colisão — cuidado).
3. `packages/domain` completo (zero dependências de infraestrutura, é o
   mais seguro de copiar tal como está).
4. Migrations de empresas + candidatos.
5. Migrations de ofertas + candidaturas.
6. RLS (só depois de todas as tabelas existirem).
7. `apps/api` com `supabaseStore.ts` a substituir `store.ts`.
8. Frontend, app a app.

## 9. Checklist final antes de merge para produção

- [ ] `supabase db diff` não mostra alterações inesperadas a tabelas
      existentes do ZOS.
- [ ] Todos os testes de `packages/domain` continuam a passar
      (`npm test` — 53 testes).
- [ ] RLS testada com um utilizador real de cada papel (candidato,
      recrutador, admin) — não só com `service_role`.
- [ ] Nenhum `service_role` key exposto em código de frontend.
- [ ] `apps/api/scripts/verify-vertical-slice.ts` adaptado para correr
      contra o Supabase real de staging (troca só o import do store) e
      continua a passar os 39 cenários.
