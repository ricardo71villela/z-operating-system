# Z Jobs — Auditoria Técnica: o que está feito, o que falta

**Data:** agosto de 2026
**Método:** inspeção direta do código-fonte + execução de toda a suite de testes.

> **Nota de atualização:** as três correções de maior prioridade identificadas
> neste relatório (secções 2, 3 e 5) foram **corrigidas e verificadas** depois
> da auditoria original. Ver "Correções aplicadas" no final do documento.


---

## 1. Resultado dos testes (executados agora, não assumidos)

| Suite | Resultado |
|---|---|
| Testes unitários de domínio (8 ficheiros) | **70 passaram, 0 falharam** |
| Testes de integração da API (`verify-vertical-slice.ts`) | **39 passaram, 0 falharam** |
| Verificação de sintaxe do frontend (`ZJobsDemo.jsx`, via esbuild) | **válido** |

Isto é bom sinal: tudo o que existe, existe a funcionar. O problema do projeto não é qualidade do que está feito — é **cobertura** do que ainda não foi feito.

---

## 2. 🐞 Bug real encontrado (prioridade imediata)

Em `PublicView` (`apps/web/ZJobsDemo.jsx`, linha 751), **todos os cartões de oferta no portal público mostram o selo "Verified" sempre**, independentemente do estado real de verificação do empregador:

```
<VerificationBadge status="verified" />
```

Todos os outros três usos deste componente no ficheiro passam corretamente `org.verificationStatus`. Este é o único hardcoded. `PublicView` nem sequer recebe a lista de organizações como propriedade, por isso é estruturalmente impossível corrigir sem passar `orgs` para baixo.

**Porque é que isto importa mais do que um bug normal:** a proposta de valor central do Z Jobs é "empregador verificado, selo não comprável". Mostrar "Verified" em ofertas de empregadores não verificados contradiz diretamente essa proposta — é o tipo de falha que, num produto real, mina a própria razão de existir da plataforma. Prioridade P0, correção trivial (passar `orgs` a `PublicView` e usar o valor real).

---

## 3. Camada de domínio (`packages/domain`)

**Feito:** 9 módulos de regras — ofertas, candidaturas, perfil de candidato, índice de responsabilidade do empregador, moderação, instituições, i18n, billing, e agora o estúdio de CV/carta. Lógica pura, sem dependência de infraestrutura, fácil de testar.

**Falta:**
- **`candidateProfile.ts` é o único módulo sem ficheiro de testes próprio.** Todos os outros oito têm `.test.ts` dedicado; este não tem — a completude de perfil só é exercitada indiretamente pelos testes de integração da API, o que é uma cobertura mais fraca e mais frágil a regressões silenciosas.
- `cvStudio.ts` tem testes (17, todos a passar) mas **nunca foi ligado à API real** — existe só como lógica pura + reimplementação inline no demo React. Não há persistência de CV nem de carta de motivação.

---

## 4. API (`apps/api`)

**Feito:** servidor HTTP nativo, ~29 rotas, cobrindo candidatos, ofertas, candidaturas, denúncias/moderação, auditoria, organizações/verificação, instituições, traduções. 39 verificações de integração, todas a passar, incluindo casos negativos (ex.: não é possível resolver a mesma denúncia duas vezes).

**Falta:**
- **`billing.ts` nunca é importado no servidor.** Não há uma única rota de billing — o módulo de domínio existe, a tabela `billing_events` existe na base de dados, mas não há ligação entre os dois no servidor.
- **`cvStudio.ts` nunca é importado no servidor.** Mesma situação — lógica pronta, zero rotas.
- Sem autenticação real — o servidor confia no `candidateId`/`organizationId` que vem no pedido, sem verificar identidade. Aceitável para um protótipo, inaceitável antes de qualquer dado real.
- Sem upload de ficheiros — documentos são só nome de ficheiro em texto, não existe armazenamento binário nem geração de PDF em lado nenhum.

---

## 5. Base de dados (`migrations/`)

**Feito:** 10 migrations numeradas, ~35 tabelas, RLS ativado com políticas explícitas em três ficheiros (`0007`, `0009`, `0010` — este último cobre a tabela de billing). O comentário na tabela `billing_events` deixa claro, no próprio schema, que é um registo de concessão manual, não um gateway de pagamentos — desenho honesto sobre o que está e não está pronto.

**Falta:**
- **Nunca foi corrida contra um Postgres real neste ambiente** (nem aqui, nem, aparentemente, em lado nenhum ainda) — é desenho válido no papel, não testado em execução.
- Sem tabela para CVs/cartas de motivação guardadas (consistente com a lacuna da API).
- Sem campo de consentimento RGPD explícito nem política de retenção de dados de candidatura.

---

## 6. Frontend (`apps/web/ZJobsDemo.jsx`)

**Feito:** demo React interativo e autocontido (sem build step), quatro papéis funcionais (público, candidato, empresa, admin), painel de completude de perfil, estúdio de CV/carta de motivação (adicionado nesta sessão), seletor de 6 idiomas, logótipo integrado no cabeçalho. Também já existe uma versão offline empacotada (HTML + JS compilado, sem dependências externas de CDN, só as fontes Google continuam a precisar de rede).

**Falta:**
- **Sem pesquisa nem filtros no portal público** — só há separação por "pilar" (ex: primeiro emprego, carreira sénior). Nada de pesquisa por palavra-chave, localização ou intervalo salarial. Para um job board, isto é funcionalidade base em falta, não um extra.
- **Zero atributos de acessibilidade** — nenhum `aria-*`, nenhum `role=`, e só uma imagem com `alt` (o logótipo). Dado que a UE já exige WCAG 2.1 AA (European Accessibility Act) para plataformas de emprego desde junho de 2025, isto é uma lacuna de conformidade, não só de qualidade.
- Sem persistência real — tudo vive em `useState` do React; recarregar a página apaga tudo.
- Só uma media query de responsividade (1499px) — não foi testado a sério em ecrãs pequenos.
- Multi-moeda ainda não implementada na UI apesar do campo `salaryCurrency` existir no domínio.

---

## 7. Infraestrutura e processo

**Falta por completo:**
- Sem `package.json` na raiz do monorepo, sem workspaces configurados, sem script único para correr tudo de uma vez.
- Sem repositório git inicializado neste pacote (não há histórico de commits a acompanhar as decisões).
- Sem CI — os testes só correm porque foram corridos manualmente agora.
- Sem linting configurado (ESLint/Prettier) — o estilo é consistente porque foi escrito com cuidado, não porque é imposto.

---

## Resumo de uma linha por camada

| Camada | Estado |
|---|---|
| Regras de domínio | Sólida, uma lacuna de teste (`candidateProfile`) |
| API | Funcional para o que cobre; billing e CV studio ainda não ligados |
| Base de dados | Bem desenhada, nunca testada contra Postgres real |
| Frontend | Demonstra bem o conceito; falta pesquisa, acessibilidade, persistência |
| Infraestrutura | Inexistente — tudo a correr manualmente |

**Se só puderes resolver três coisas antes do próximo passo:** o bug do selo "Verified" (é rápido e é uma questão de integridade do produto), a suite de testes de `candidateProfile.ts` (fecha a única lacuna de cobertura), e correr as migrations contra um Postgres/Supabase real pelo menos uma vez (é o maior risco desconhecido do projeto inteiro).

---

## Correções aplicadas (depois desta auditoria)

**1. Bug do selo "Verified" — corrigido.**
`PublicView` passou a receber `orgs` e a `VerificationBadge` no cartão de oferta usa agora `orgs.find(...).verificationStatus` real, em vez do valor fixo `"verified"`. De caminho, corrigi também uma sombra de variável (`o` reutilizado no `find` interno) que teria feito a correção falhar silenciosamente se aplicada sem cuidado.

**2. Testes de `candidateProfile.ts` — corrigido, com uma correção à própria auditoria.**
Ao escrever os testes, descobri que já existiam 3 testes de `computeProfileCompleteness`, só que dentro de `employerResponsibility.test.ts` em vez de um ficheiro próprio — a afirmação original de "sem testes" estava incorreta, era um problema de organização, não de cobertura zero. Criei `candidateProfile.test.ts` dedicado com 7 testes, incluindo um caso que os testes anteriores não cobriam: o campo `hasVisibilitySet` existe na interface mas nunca entra no cálculo da pontuação — comportamento agora documentado explicitamente em teste, para que uma mudança futura seja uma decisão consciente e não uma lacuna silenciosa.

**3. Migrations contra Postgres real — corrido pela primeira vez, e encontrado um bug de desenho real.**
Instalei PostgreSQL 16 no ambiente, criei um stub mínimo do esquema `auth` do Supabase (necessário porque as migrations assumem `auth.users`/`auth.uid()`, que não existem num Postgres genérico), e corri as 10 migrations por ordem.

Resultado da primeira tentativa: **3 das 10 falharam.** A causa raiz era uma só — `candidate_profiles.desired_salary_currency` e `job_offers.salary_currency` tentavam ter uma foreign key para `countries(default_currency)`, mas essa coluna não tem (nem pode ter) uma restrição de unicidade, porque vários países partilham a mesma moeda (ex.: Portugal e Espanha usam ambos EUR). O erro em cascata derrubou as migrations seguintes, que dependiam das tabelas que nunca chegaram a ser criadas.

**Correção:** criei uma tabela de referência `currencies` (ISO 4217) em `0001_geography_and_i18n.sql`, semeada com EUR e as principais moedas não-euro da UE (SEK, DKK, PLN, CZK, HUF, RON, BGN) mais USD/GBP/CHF, e apontei as duas foreign keys problemáticas para lá em vez de para `countries`.

Depois da correção: **as 10 migrations correram sem erro, do zero, contra Postgres 16 real** — 36 tabelas criadas (as 35 originais + `currencies`), 22 com row-level security ativo, seed de geografia inserido sem problemas. Isto resolve o maior risco desconhecido identificado na auditoria original.

**Estado final verificado (não assumido):** 77 testes unitários de domínio a passar (70 + 7 novos), 39 testes de integração da API a passar, sintaxe do frontend válida, migrations validadas contra Postgres real.
