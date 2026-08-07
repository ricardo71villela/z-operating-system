# Sprint 1.7 — Checklist de Validação Real contra o Supabase

Este documento é um protocolo, não código. Segue-o por ordem. Cada passo diz onde o executas: **Dashboard**, **SQL Editor**, **Auth**, **Terminal local**, **Admin UI**, ou **Site público**.

Nunca cola aqui, nem em lado nenhum partilhado, a tua `SUPABASE_ANON_KEY` completa ou qualquer palavra-passe.

---

## 1. Segurança Pré-Migração

### 1.1 — Confirmar o projeto Supabase ativo
**Dashboard** → canto superior esquerdo, confirma o nome do projeto e a região. Compara com o `SUPABASE_URL` do teu `.env`:
```
https://<project-ref>.supabase.co
```
O `<project-ref>` no separador do browser tem de ser **exatamente** o mesmo que aparece no início do teu `SUPABASE_URL`.

**PASS:** os dois `project-ref` coincidem carácter a carácter.
**FAIL:** para tudo — estás prestes a aplicar a migração no projeto errado.

### 1.2 — Confirmar que a Migration 0002 não foi já parcialmente aplicada
**SQL Editor**, corre isto primeiro (só leitura, seguro):
```sql
select proname from pg_proc where proname = 'is_admin';
```
- **0 linhas** → 0002 nunca foi aplicada. Segue para a secção 2.
- **1 linha** → já foi aplicada, pelo menos em parte. **Não a corras outra vez sem investigar primeiro** (ver 1.6).

### 1.3 — Confirmar se as colunas de `partners` já existem
```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'partners'
and column_name in ('status', 'logo_storage_path');
```
- **0 linhas** → confirmado, ainda não existem (estado esperado antes da 0002).
- **1 ou 2 linhas** → aplicação parcial. Anota exatamente quais existem antes de continuares.

### 1.4 — Confirmar que `zones_lite` é tabela, não view
```sql
select table_type from information_schema.tables
where table_schema = 'public' and table_name = 'zones_lite';
```
**Esperado:** `BASE TABLE`. Se vier `VIEW`, para — a migração 0002 assume uma tabela real (para `create policy`); uma view precisaria de uma abordagem diferente, não a aplique.

### 1.5 — Guardar uma cópia do estado atual antes de aplicar
**SQL Editor**, corre e guarda o resultado (copiar para um ficheiro de texto local, ex. `pre-migration-snapshot.txt`):
```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated'
order by table_name, privilege_type;

select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```
Isto é o teu "antes" — se algo correr mal, comparas com o "depois".

### 1.6 — Se algo em 1.2–1.4 indicar aplicação parcial
**Não voltes a correr a migração às cegas.** Documenta exatamente:
- que funções/colunas/políticas já existem (resultado exato das queries acima);
- guarda esse resultado num ficheiro;
- volta a mim com essa informação antes de avançares — vou ajudar a adaptar a migração para ser idempotente nos pontos que já existem, em vez de arriscar um erro a meio.

---

## 2. Aplicação da Migração

**Ordem exata, sem desvios:**

1. **Terminal local** ou editor de texto: abre o ficheiro completo `supabase/migrations/0002_admin_access.sql`.
2. **Dashboard**: confirma outra vez o project reference (repetição intencional do passo 1.1 — é a última oportunidade de apanhar o erro antes de escrever na base de dados).
3. **SQL Editor**: cola o ficheiro **completo**, do início ao fim, numa única caixa de edição.
4. Corre-o **uma única vez, como um bloco só**.
5. Regista o resultado exato:
   - Sucesso → o SQL Editor mostra "Success. No rows returned" (ou semelhante).
   - Falha → **copia a mensagem de erro exata e o número da linha/statement**, antes de fazeres seja o que for a seguir.

### O que NÃO fazer:
- **Não** corras secções da migração separadamente ("só os grants primeiro", "só as políticas depois") — foram desenhadas para correr como uma unidade.
- **Não** edites manualmente nenhuma política RLS durante este teste, nem para "testar mais depressa".
- **Não** concedas ao `anon` nenhum acesso adicional, por nenhum motivo, nem temporariamente.
- **Não** uses `service_role` no browser, no Admin, nem em nenhum script local — em circunstância nenhuma.

---

## 3. Verificação Pós-Migração

As duas queries de verificação já estão no fim do próprio ficheiro `0002_admin_access.sql`, como comentário. Descomenta-as e corre-as no **SQL Editor**.

### 3.1 — Grants para `authenticated`
```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated'
order by table_name, privilege_type;
```
**PASS** se aparecerem exatamente estas tabelas com `SELECT, INSERT, UPDATE, DELETE`:
`partners, developments, properties, representations, listings, listing_content, media_assets, media_variants, listing_media, development_media, media_asset_content, zones_lite`

E estas só com `SELECT`:
`profiles, leads, system_languages`

**FAIL** se aparecer qualquer tabela fora desta lista, ou se faltar alguma da lista.

### 3.2 — Políticas RLS para `authenticated`
```sql
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public' and 'authenticated' = any(roles)
order by tablename, policyname;
```
**PASS** se cada tabela da lista acima tiver exatamente uma política `admin: full access to X` (ou `admin: read X` para leads/system_languages), e `profiles` tiver a política `profiles: self read`.

**FAIL** se faltar alguma, ou se aparecer alguma política extra que não reconheças.

### 3.3 — Políticas de Storage
```sql
select policyname, roles, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
and 'authenticated' = any(roles);
```
**PASS:** uma linha, `admin: manage listing-media storage objects`, `cmd = ALL`.

### 3.4 — Confirmar zero acesso extra para `anon`
```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
order by table_name, privilege_type;
```
**PASS:** este resultado tem de ser **idêntico** ao que já tinhas documentado no snapshot da migração 0001 — a 0002 nunca deveria alterar nada aqui. Se houver qualquer diferença, **para e não avances** — algo correu mal.

### 3.5 — `is_admin()` existe e resolve
```sql
select proname, prosecdef from pg_proc where proname = 'is_admin';
```
**PASS:** 1 linha, `prosecdef = true` (confirma que é SECURITY DEFINER, como desenhado).

---

## 4. Configuração do Utilizador Admin

### 4.1 — Criar ou identificar o utilizador real
**Dashboard** → **Authentication** → **Users** → **Add user** (ou usa um utilizador que já exista). Usa um email real que consigas aceder.

### 4.2 — Copiar o UUID exato
Na lista de utilizadores, clica no utilizador → copia o campo `UID` (um UUID como `a1b2c3d4-...`). Vais precisar dele exatamente, sem espaços.

### 4.3 — Criar a linha em `profiles`
**SQL Editor**, com o UUID copiado no passo anterior:
```sql
insert into profiles (id, role)
values ('COLA_AQUI_O_UUID_COPIADO', 'admin');
```

### 4.4 — Verificar a linha
```sql
select id, partner_id, role from profiles where role = 'admin';
```
**PASS:** o `id` mostrado é **exatamente** o mesmo UUID que copiaste em 4.2 (compara carácter a carácter, não "parece igual").

### 4.5 — Confirmar a correspondência de UUID entre Auth e profiles
```sql
select u.id as auth_id, p.id as profile_id, p.role
from auth.users u
join profiles p on p.id = u.id
where u.email = 'o-email-que-usaste@exemplo.com';
```
**PASS:** uma linha, `auth_id = profile_id`, `role = 'admin'`.

### 4.6 — Diagnosticar "This account does not have Admin access."
Se vires esta mensagem no Admin depois do login, a causa é sempre uma destas três — verifica por esta ordem:
1. **Login funcionou mas não existe linha em `profiles` para este utilizador** → repete 4.3.
2. **Existe linha em `profiles`, mas `role` não é `'admin'`** → `update profiles set role = 'admin' where id = 'UUID';`
3. **O UUID em `profiles.id` não é o mesmo do utilizador que fez login** → normalmente por teres copiado o UUID errado em 4.2, ou por teres criado dois utilizadores por engano. Repete 4.5 para confirmar.

---

## 5. Ambiente Local

**Terminal local**, na raiz do repositório:

```bash
git status
```
**Confirma:** branch correto, sem alterações não commitadas que não esperes.

```bash
git branch --show-current
```
**Confirma:** é o branch onde esperas estar.

```bash
ls -la .env
```
**Confirma:** o ficheiro existe. Não o abras num editor partilhado nem o cola em lado nenhum.

```bash
git check-ignore .env
```
**PASS:** o comando imprime `.env` (confirma que está no `.gitignore` e nunca seria commitado). **FAIL:** não imprime nada — para imediatamente e corrige o `.gitignore` antes de continuares.

```bash
grep SUPABASE_URL .env
```
**Confirma:** o URL bate certo com o projeto que confirmaste em 1.1.

```bash
grep -o 'SUPABASE_ANON_KEY=.\{0,14\}' .env
```
Isto mostra só os primeiros ~14 carateres da chave — suficiente para confirmares que não está vazia, sem expor a chave completa em nenhum lado.

### Build e arranque
```bash
npm run build:admin
```
**Confirma:** termina com `Supabase config placeholders: resolved, 0 remaining` e sem erro.

```bash
npm run build:zfind
```
Mesma confirmação, para o site público.

```bash
npx http-server apps/zfind-admin/dist -p 8910
```
(Ou qualquer servidor estático equivalente que já uses localmente — o Admin não pode ser aberto via `file://`, precisa de ser servido por http(s), pela mesma razão de CORS já documentada no smoke test do Sprint 1.2.)

**Abrir:** `http://localhost:8910/z-find-admin.html`

Para o site público, num segundo terminal:
```bash
npx http-server apps/zfind-web/dist -p 8911
```
**Abrir:** `http://localhost:8911/z-find-prototype.html`

---

## 6. Validação Mínima End-to-End — Propriedade

Para cada passo: **resultado esperado na UI**, **resultado esperado na base de dados**, **critério PASS/FAIL**, **evidência a guardar**.

| # | Ação | Onde | UI esperada | BD esperada | PASS/FAIL | Evidência |
|---|---|---|---|---|---|---|
| 1 | Login como admin | Admin UI | Dashboard visível, contagens reais | — | Shell aparece, sem erro | Screenshot do dashboard |
| 2 | Criar parceiro de teste | Admin UI | Parceiro aparece na lista | 1 linha nova em `partners` | Nome correto na lista | Screenshot |
| 3 | Upload do logótipo | Admin UI | Imagem aparece no formulário | `partners.logo_storage_path` preenchido | Imagem visível, não quebrada | Screenshot com logo visível |
| 4 | Criar propriedade de teste | Admin UI | Aparece na lista de Properties | 1 linha nova em `properties` | Subtype/zona corretos | Screenshot |
| 5 | Criar listing inicial | Admin UI | Botão "Create listing" muda para tag "draft" + Publish | 1 linha em `representations`, 1 em `listings` (status=draft) | Tag "draft" visível | Screenshot |
| 6 | Traduções PT/EN/FR | Admin UI | Cada separador de idioma guarda sem erro | 3 linhas em `listing_content` | Título/descrição batem certo nos 3 idiomas | Screenshot de cada separador |
| 7 | Upload de 2 fotos | Admin UI | 2 miniaturas na grelha | 2 linhas em `listing_media`, 2 em `media_assets` | Ambas visíveis, sem ícone quebrado | Screenshot da grelha |
| 8 | Reordenar (arrastar) | Admin UI | Ordem visual muda | `position` atualizado nas 2 linhas | Ordem mantém-se depois de recarregar a página | Screenshot antes/depois |
| 9 | Definir capa | Admin UI | Badge "Cover" na foto escolhida | `is_cover=true` só nessa linha | Só uma foto com badge | Screenshot |
| 10 | Publicar | Admin UI | Tag muda para "published" | `listings.status='published'` | Botão muda para "Unpublish" | Screenshot |
| 11 | Confirmar no site público | Site público | Aparece na Homepage, na Pesquisa, e a página própria carrega com título/preço/foto reais | — | Título e preço batem com o que puseste no Admin | Screenshot das 3 páginas |
| 12 | Editar preço ou título | Admin UI | Guarda sem erro | `listings.price_current` ou `listing_content.title` atualizado | — | Screenshot |
| 13 | Confirmar atualização no site público | Site público | Novo valor aparece (pode precisar de recarregar a página) | — | Valor novo visível | Screenshot |
| 14 | Despublicar | Admin UI | Tag volta a "draft" | `listings.status='draft'` | Botão volta a "Publish" | Screenshot |
| 15 | Confirmar desaparecimento | Site público | Já não aparece na Homepage nem na Pesquisa | — | Ausente das listas | Screenshot |
| 16 | Aceder ao URL direto despublicado | Site público | Mostra "This listing is no longer available" — nunca um erro genérico nem dados fantasma | — | Mensagem correta, não um crash | Screenshot |
| 17 | Eliminar a propriedade de teste | Admin UI, com confirmação | Desaparece da lista | Linha removida de `properties` (e cascata) | Confirma que pede confirmação antes | Screenshot |
| 18 | Eliminar/desativar o parceiro de teste | Admin UI | Estado muda para "Inactive" (não há eliminar duro para parceiros, por desenho) | `partners.status='inactive'` | — | Screenshot |

---

## 7. Validação — Empreendimento

Repete a essência do fluxo acima, mais curto:

| # | Ação | PASS/FAIL |
|---|---|---|
| 1 | Criar empreendimento de teste | Aparece na lista |
| 2 | Criar listing inicial | Tag "draft" aparece |
| 3 | Traduções PT/EN/FR | 3 idiomas guardam |
| 4 | Upload de 2+ fotos e reordenar | Ordem correta, persiste |
| 5 | Publicar | Tag "published" |
| 6 | Confirmar página pública de Development | Título/preço/galeria reais |
| 7 | Duplicar | Novo registo com "(copy)" no nome, sem as fotos do original |
| 8 | Despublicar o original | Desaparece do público |
| 9 | Eliminar o duplicado | Desaparece da lista do Admin |

---

## 8. Validação de Leads

1. **Site público**: na página da propriedade de teste (antes de a eliminares — ajusta a ordem se necessário), submete um pedido real através do modal de contacto.
2. **Confirmar sucesso na UI pública**: mensagem de confirmação aparece.
3. **SQL Editor**:
   ```sql
   select count(*) from leads where listing_id = 'O_LISTING_ID_DE_TESTE';
   ```
   **PASS:** exatamente `1`.
4. **Admin UI**: abre o lead na lista de Leads → confirma nome, contacto, e que o campo de mensagem contém o bloco `[Context — ...]` com idioma, página, source (`zfind_property`), e o partner id reais.
5. **Confirmar que o Admin é só-leitura para leads**: tenta editar ou eliminar um lead a partir da UI — não deve existir nenhum botão para isso (confirma visualmente que não existe, não precisas de tentar contornar via consola).

---

## 9. Testes Negativos de Segurança

### 9.1 — Segundo utilizador, sem admin
1. **Auth**: cria um segundo utilizador de teste.
2. **Não** cries linha em `profiles` para ele (ou cria com `role='partner_user'`).
3. **Admin UI**: faz login com este utilizador.
   **PASS:** autentica (login em si funciona), mas mostra "This account does not have Admin access." e não mostra o shell do Admin.

### 9.2 — Pedidos REST diretos deste utilizador
Com o token de sessão deste segundo utilizador (visível na aba Network do browser depois do login), tenta uma chamada direta:
```bash
curl -X POST 'https://SEU-PROJETO.supabase.co/rest/v1/partners' \
  -H "apikey: SUA_ANON_KEY" \
  -H "Authorization: Bearer TOKEN_DO_UTILIZADOR_SEM_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Tentativa não autorizada","role":"agency"}'
```
**PASS:** resposta de erro de permissão (RLS bloqueia), nenhuma linha criada.

### 9.3 — Anónimo não consegue abrir nem operar o Admin
Abre o Admin sem fazer login nenhum. **PASS:** só o ecrã de login aparece, nunca o shell.

### 9.4 — Site público continua legível
Confirma que Homepage/Search/Property/Development continuam a carregar normalmente para um visitante anónimo, exatamente como antes da migração 0002.

### 9.5 — INSERT anónimo de lead continua permitido
Repete o passo 8.1 sem estar autenticado (é sempre assim no site público) — já confirmaste isto no passo 8, mas vale confirmar explicitamente que a 0002 não afetou isto.

### 9.6 — SELECT anónimo de leads continua negado
```bash
curl 'https://SEU-PROJETO.supabase.co/rest/v1/leads?select=*' \
  -H "apikey: SUA_ANON_KEY_PUBLICA"
```
**PASS:** erro de permissão, nunca uma lista de leads.

**Em nenhum destes testes alteres nenhuma política para "fazer passar" — se algum falhar, o problema é a migração ou a configuração, nunca a política em si.**

---

## 10. Validação de Storage

- **Logo do parceiro carrega e aparece** (já confirmado no passo 6.3).
- **Fotos de propriedade carregam** (já confirmado no passo 6.7).
- **Fotos de empreendimento carregam** (já confirmado no passo 7.4).
- **Caminhos privados**: no **Dashboard** → **Storage** → bucket `listing-media` → confirma que o bucket mostra como **privado** (não público) mesmo depois da 0002 — a migração nunca deveria ter mudado isto.
- **URLs assinadas no site público**: no site público, com as ferramentas de programador do browser abertas, confirma que os pedidos de imagem vão para `.../storage/v1/object/sign/...?token=...`, nunca para um URL direto sem token.
- **Eliminar remove a associação e o ficheiro**: elimina uma foto de teste no Admin, depois confirma no Dashboard → Storage que o ficheiro correspondente desapareceu do bucket.
- **Nenhuma chave `service_role` exposta**: nas ferramentas de programador do browser, no separador Network, procura no código-fonte servido (`Ctrl+F` no HTML) por `service_role` — não deve aparecer nenhuma ocorrência.

---

## 11. Recuperação de Falhas

| Situação | Diagnóstico antes de agir |
|---|---|
| Migração falha a meio | Copia a mensagem de erro exata e o statement onde falhou. Corre as queries da secção 1.2–1.4 para veres exatamente até onde chegou. Não repitas a migração inteira sem saberes isto. |
| Coluna já existe | Confirma com a query da secção 1.3 exatamente quais. Remove só essa linha `alter table` específica antes de recorrer, ou fala comigo para adaptar a migração. |
| Política já existe | `create policy` falha se o nome já existir — a mensagem de erro diz qual. Confirma com a query da secção 3.2 se o conteúdo da política existente já é o que querias; se for, ignora essa linha específica. |
| `zones_lite` é view | Para. Não corras a migração como está — fala comigo primeiro. |
| Login funciona mas acesso de Admin falha | Segue o diagnóstico da secção 4.6, por ordem. |
| Upload falha | Confirma no Dashboard → Storage → Policies que a política `admin: manage listing-media storage objects` existe e está ativa. Confirma que o utilizador logado tem `profiles.role='admin'` (secção 4.4). Verifica o separador Network do browser para o código de erro exato (403 = RLS/permissão; outro código = problema diferente). |
| Publica no Admin mas não aparece no site público | Confirma que o `listings.status` realmente mudou para `'published'` via SQL Editor diretamente. Se sim, o problema está do lado da leitura pública — confirma que a Homepage/Search estão a ler dados frescos (não uma cache de browser antiga; tenta recarregar sem cache). |
| Imagens assinadas não carregam | Confirma no separador Network o código de resposta do pedido à imagem. 403 = política de storage; 400/404 = caminho errado guardado em `original_storage_path`; expirado = o token de assinatura tem validade de 1 hora, tenta recarregar a página para gerar um novo. |

---

## 12. Sign-off Final

| Item | Estado |
|---|---|
| Migration 0002 aplicada | PASS / FAIL / NOT TESTED |
| Autenticação de Admin | PASS / FAIL / NOT TESTED |
| CRUD de Parceiros | PASS / FAIL / NOT TESTED |
| CRUD de Propriedades | PASS / FAIL / NOT TESTED |
| CRUD de Empreendimentos | PASS / FAIL / NOT TESTED |
| Listings (criação inicial) | PASS / FAIL / NOT TESTED |
| Traduções | PASS / FAIL / NOT TESTED |
| Media (upload/ordem/capa/eliminar) | PASS / FAIL / NOT TESTED |
| Publicar/Despublicar | PASS / FAIL / NOT TESTED |
| Leads | PASS / FAIL / NOT TESTED |
| Sincronização com o site público | PASS / FAIL / NOT TESTED |
| Testes negativos de segurança | PASS / FAIL / NOT TESTED |
| Nenhuma exposição de credenciais | PASS / FAIL / NOT TESTED |

### Evidência exigida para encerrar oficialmente o Sprint 1.7
- Resultado exato (texto ou screenshot) das 5 queries de verificação da secção 3.
- Screenshots de cada passo marcado "Evidência" nas secções 6 e 7.
- Confirmação escrita de que os testes negativos da secção 9 passaram sem alterar nenhuma política.
- Esta tabela de sign-off, preenchida, devolvida a mim.

Só depois disso avançamos para code freeze do Admin, Vercel, domínio, DNS, Resend, e Release Candidate — como combinado.
