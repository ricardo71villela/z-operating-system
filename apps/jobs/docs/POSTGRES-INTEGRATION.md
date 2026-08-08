# Ligar a API a Postgres real

## Como correr

```bash
# 1. Ter Postgres a correr e as migrations + seed aplicadas (ver README principal)
# 2. Correr a API com DATABASE_URL definida
DATABASE_URL="postgresql://user:password@host:5432/zjobs" npx tsx apps/api/src/server.ts

# Sem DATABASE_URL definida, a API usa o repositório em memória (comportamento antigo, inalterado)
npx tsx apps/api/src/server.ts
```

O ponto de decisão é `apps/api/src/db.ts` — escolhe `PgStore` (Postgres real,
`apps/api/src/pgStore.ts`) ou o `store` em memória (`apps/api/src/store.ts`)
consoante `DATABASE_URL` estar definida. `server.ts` importa sempre de `./db`,
nunca diretamente de `./store` ou `./pgStore`.

## Verificado nesta sessão

39/39 checks de `apps/api/scripts/verify-vertical-slice.ts` a passar contra
Postgres 16 real (não só contra o repositório em memória), incluindo os
casos negativos obrigatórios. Dados confirmados persistidos depois do
processo terminar (prova de que não é só um mock).

## Simplificações conscientes (sem autenticação real ainda)

Ver comentário no topo de `pgStore.ts`. Resumo:

1. **`ensureActor()`** — como não há login real, muitos IDs de ator que
   chegam à API são rótulos simbólicos (`"admin"`) ou UUIDs de organizações
   usadas como se fossem utilizadores. `ensureActor()` garante uma linha
   mínima em `auth.users` para qualquer identificador usado como ator,
   gerando um UUID determinístico a partir do rótulo quando não é já um
   UUID válido. Isto NÃO é autenticação — é o mínimo para não quebrar
   integridade referencial enquanto ela não existir a sério (ver P0.2 na
   auditoria técnica).
2. **`job_offers.created_by`** — é `NOT NULL` no schema mas a API atual não
   recebe esse campo do cliente. Usa-se o `created_by` da própria
   organização como valor.
3. **`candidate_documents.storage_path`** — pensado para um caminho num
   bucket privado; como não há upload de ficheiros ainda, guarda-se aqui o
   nome do ficheiro tal como chega.
4. **`company_profiles`** — desenhada no schema só para organizações tipo
   `employer`, mas criada aqui para qualquer tipo de organização, para que
   `verification_status` esteja sempre disponível por um único join.

## RLS (row-level security) — ativado a sério

Até esta sessão, o RLS existia bem desenhado nas migrations mas nunca se
aplicava de facto: a API ligava-se sempre como `postgres` (superutilizador),
e o Postgres **nunca** aplica RLS a superutilizadores nem a donos de
tabela, independentemente de quantas políticas existirem.

Isso mudou: existe agora um papel de aplicação sem privilégios
(`zjobs_app`, migration `0013_app_role.sql`), e cada pedido HTTP corre
dentro da SUA PRÓPRIA transação Postgres com
`set_config('request.jwt.claim.sub', <userId>, true)` definida logo no
início (`PgStore.withRequestContext`, usando `AsyncLocalStorage` para não
ter de passar um client explícito por cada um dos ~30 métodos e dezenas
de pontos de chamada em `server.ts`).

**Verificado por execução real, não por inspeção:** 43/43 testes de
integração a passar contra Postgres real, com RLS genuinamente a
bloquear o que deve bloquear — confirmado com três corridas limpas
seguidas, do zero.

### Achados reais só visíveis depois de ativar RLS a sério

Uma cadeia de problemas que estavam invisíveis enquanto a API corria como
superutilizador (migrations `0013` a `0019`):

- Quem cria uma organização nunca ficava registado como membro dela —
  paradoxo de arranque: o criador não pode inserir-se a si próprio como
  "owner" porque a política de `organization_memberships` exige já ser
  owner. Resolvido com uma política dedicada de auto-inserção.
- `countPlatformStaff()` estava sujeito ao próprio RLS — qualquer pessoa
  via sempre "0 staff" do seu ponto de vista, permitindo múltiplos
  "primeiros" bootstraps. Resolvido com uma função `SECURITY DEFINER`.
- `job_offer_reports` e `translations` **nunca tiveram RLS ativado, em
  lado nenhum** — tabelas completamente abertas. Fechado.
- `application_status_history` também sem RLS. Fechado.
- O Employment Responsibility Index (pensado para ser transparência
  pública) ficaria sempre a zero para quem não é membro da organização,
  porque lê `applications` — corretamente restrita por RLS. Resolvido com
  uma função de agregados `SECURITY DEFINER` que nunca expõe candidaturas
  individuais.
- O próprio registo (`signup`) tenta criar a pessoa (`persons`) antes de
  existir qualquer sessão — `auth.uid()` é `null` nesse instante exato.
  Resolvido à imagem de como o Supabase resolve isto com um trigger
  privilegiado em `auth.users`: uma função `SECURITY DEFINER` estreita
  (`bootstrap_person`).
- `createSession`/`resolveSession` usavam o `pool` diretamente (uma
  ligação separada) em vez do client da transação do pedido — tentavam
  ver um `auth.users` ainda não *committed* pela própria transação do
  pedido de signup.
- Faltava a função `record_audit_log()` que o comentário original em
  `0007` já prometia mas nunca chegou a existir.

### RESOLVIDO: o pool de ligações já não está preso a 1

Durante muito tempo, esta secção documentava uma mitigação, não uma
correção: `PgStore` forçava `max: 1` no pool porque um valor maior
causava falhas intermitentes e não-determinísticas — sem a causa raiz
alguma vez ter sido isolada com confiança.

**A causa raiz foi encontrada e corrigida numa sessão posterior.** Não
tinha nada a ver com `set_config`, `auth.uid()` nem reciclagem de
ligações — a raiz real estava em `server.ts`: a função `json()` chamava
`res.end()` **imediatamente**, dentro de `handleRoutes()`, mas o
`COMMIT` da transação só acontece **depois** de `handleRoutes()`
terminar (ver `withRequestContext`). Isto permitia ao cliente receber a
resposta HTTP e disparar o pedido seguinte antes de a escrita anterior
estar de facto visível na base de dados — uma corrida real de "ler o
que acabei de escrever". Com `max: 1`, o pedido seguinte nunca
conseguia sequer uma ligação livre antes do `COMMIT` libertar a única
que existe — os testes pareciam estáveis, mas só por acidente de
serialização forçada, nunca porque o pool pequeno resolvesse o
problema de facto.

**A correção:** `json()` deixou de chamar `res.end()` diretamente —
guarda a resposta pretendida, e só é efetivamente enviada depois de
`withRequestContext` (incluindo o `COMMIT`) estar completo, via
`flushPendingResponse()`. Verificado com **13 corridas limpas
seguidas, 43/43**, com o pool no tamanho por omissão do driver `pg`
(10 ligações) — exatamente o cenário que antes falhava de forma
intermitente. Confirmado também com concorrência genuína: 8 registos
de candidato disparados em simultâneo via `Promise.all` (não
sequenciais), todos bem-sucedidos, 8 identificadores únicos, sem
erros, em 1,3 segundos.

O pool voltou ao tamanho por omissão do driver — já não há motivo
para o restringir artificialmente.

## RESOLVIDO: autenticação real via Supabase Auth (não mais uma tabela própria)

Descoberto tarde, mas antes de causar dano: as migrações anteriores
(0012) tentavam `alter table auth.users add column password_hash` e
criar `auth.sessions` própria. No Supabase real, `auth.users` já existe,
gerida por eles — normalmente sem permissões de escrita direta para o
papel da aplicação. Escrever nessa tabela não era um ajuste pequeno de
fazer, era incompatível com o produto deles por desenho.

**A correção**: `apps/api/src/supabaseAuth.ts` chama a API REST real do
Supabase Auth para registo/login, e verifica os tokens que eles emitem
localmente (verificação criptográfica do JWT, sem nenhuma consulta à
base de dados por pedido — mais rápido do que a tabela de sessões
própria que existia antes). O mecanismo de RLS nunca mudou:
`auth.uid()` sempre leu `request.jwt.claim.sub` via `set_config` — só
mudou quem emite o valor desse claim.

**Caminho duplo, deliberado**: se `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
`SUPABASE_JWT_SECRET` estiverem definidas, usa-se o Supabase real.
Sem elas, cai-se para a autenticação local já testada 150+ vezes nesta
base de código — necessário porque este ambiente de desenvolvimento não
tem acesso de rede real a supabase.co.

**O que foi genuinamente testado**: a verificação criptográfica do JWT
(`apps/api/src/supabaseAuth.test.ts`, 5 testes) e o próprio servidor a
reconhecer corretamente um token assinado como o Supabase assinaria,
incluindo rejeitar um mal assinado (403). **O que NÃO foi testado**: as
chamadas de rede reais a `signupWithSupabase`/`loginWithSupabase` —
nunca tocaram um projeto Supabase real. A forma do pedido segue a
documentação pública deles, mas isso não é o mesmo que confirmado a
funcionar.

**Email real via Resend**: mesmo princípio — `RESEND_API_KEY` no
ambiente ativa `ResendEmailService`; sem ela, cai para o registo por
consola já usado nos testes desta sessão. Também nunca testado contra
a API real deles.

Ver `.env.example` na raiz do projeto para as variáveis exatas.

## O que ainda falta depois disto


- ~~Autenticação real (P0.2 da auditoria)~~ — **feito.** Signup/login por
  password (scrypt, nunca texto simples), sessões por token (hash guardado, nunca o
  token em si), e autorização de posse aplicada nas rotas de dados do candidato.
- ~~Autorização por papel (só staff pode aprovar verificação/publicar
  ofertas)~~ — **feito.** `POST /auth/bootstrap-admin` torna o primeiro
  utilizador autenticado em `platform_superadmin`; as quatro rotas de
  administração/moderação exigem staff real.
- ~~RLS do Postgres não refletia o utilizador autenticado por pedido~~ —
  **feito nesta sessão**, ver secção acima.
- ~~Resolver o pool de ligações a sério~~ — **feito.** Era uma corrida
  real entre a resposta HTTP e o `COMMIT`, não o pool em si — ver secção
  acima. Verificado com concorrência genuína, não só um pool maior.
- Migrar o cvStudio (estúdio de CV/carta) e o billing para dentro da API —
  continuam só no domínio + demo, nunca tocaram `server.ts`.
- Connection pooling / configuração de produção (timeouts, retries, TLS)
  — `pgStore.ts` usa a configuração por omissão do `pg.Pool`.
