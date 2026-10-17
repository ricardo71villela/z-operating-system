# Z Fashion — pôr em linha (tarefa 18)

Quatro peças, todas na Vercel, por esta ordem:

| Peça | Onde | Pasta | Endereço previsto |
| --- | --- | --- | --- |
| API | Vercel (projeto `z-fashion-api`) | `apps/fashion/apps/fashion-api` (chama `fashion-partner/src/server.js`) | `https://api.zfashion.online` |
| Painel das lojas | Vercel | `apps/fashion/apps/fashion-partner` (páginas em `public/`) | `https://partner.zfashion.online` |
| Backoffice | Vercel | `apps/fashion/apps/fashion-admin` | `https://admin.zfashion.online` |
| Site público | Vercel (projeto `z-fashion`, já existe) | `apps/fashion/apps/fashion-web` | `https://zfashion.online` |

Os três sites são estáticos. O endereço da API não está escrito no código: cada projeto Vercel recebe a variável `FASHION_API_BASE_URL` e o build gera `zfashion-config.js` (`apps/fashion/scripts/write-zfashion-config.js`). Sem a variável, o site mostra a demonstração e os painéis deixam entrar mas não mostram dados.

---

## 0. Domínio (tarefa 15)

Comprar `zfashion.online` (se ainda não estiver comprado) e, no registo DNS, criar os registos que a Vercel indicar nos passos seguintes:

| Nome | Tipo | Valor |
| --- | --- | --- |
| `api` | CNAME | `cname.vercel-dns.com` |
| `partner` | CNAME | `cname.vercel-dns.com` |
| `admin` | CNAME | `cname.vercel-dns.com` |
| `@` (zfashion.online) | A | `76.76.21.21` (Vercel) |
| `www` | CNAME | `cname.vercel-dns.com` |

## 1. API na Vercel

1. **Add New → Project** a partir do repositório `ricardo71villela/z-operating-system`; nome `z-fashion-api`.
2. **Root Directory**: `apps/fashion/apps/fashion-api`; *Framework Preset*: Other. Deixar ligada a opção *Include files outside the Root Directory in the Build Step* (o código da API está em `../fashion-partner`). O resto vem de `vercel.json`: instalação das dependências de `fashion-partner`, uma função Node 22 que recebe todos os caminhos, 60 s no máximo por pedido.
3. **Domains**: `api.zfashion.online`.
4. **Environment Variables** (Production):

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | Supabase → Project Settings → Database → *Connection string*, modo **Transaction pooler** (porta 6543, adequado a funções serverless), sem `?sslmode=` no fim |
| `FASHION_DB_SSL_MODE` | `verify-full` |
| `SUPABASE_URL` | `https://dcdggqyazdddrfuzwavw.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_LQqhseuSfNibffNh_cLLGQ_0cVxHQzX` |
| `SUPABASE_SECRET_KEY` | Supabase → API Keys → *secret* (só aqui, nunca num site) |
| `FASHION_ADMIN_USER_IDS` | `e1a18bfc-6fa1-46fd-b4b4-0e96d2c4972e` (a sua conta; separar outras por vírgulas) |
| `FASHION_ALLOWED_ORIGINS` | `https://zfashion.online,https://www.zfashion.online,https://partner.zfashion.online,https://admin.zfashion.online` |
| `FASHION_PARTNER_TERMS_VERSION` | `cgv-partner-2026-10` (igual a `VERSION.partner` em `fashion-web/legal-content.js`; mudar os dois juntos) |
| `FASHION_PARTNER_TERMS_URL` | `https://zfashion.online/conditions-partenaires` |
| `FASHION_PARTNER_CONSOLE_URL` | `https://partner.zfashion.online/dashboard.html` |
| `FASHION_SHIPPING_COUNTRIES` | `FR` |
| `STRIPE_SECRET_KEY` | `sk_test_…` (depois `sk_live_…`) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (depois `pk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` do passo 4 |
| `FASHION_CRON_SECRET` | 48 caracteres aleatórios (ex. `openssl rand -hex 24`) |

5. Verificar: `https://api.zfashion.online/health` responde `{"ok":true,"usingPostgres":true}`.

Limite da Vercel: um pedido não passa de 4,5 MB. As fotos são reduzidas a 2000 px no painel antes do envio (normalmente menos de 1,5 MB), por isso cabem; um ficheiro maior é recusado.

Alternativa: `fashion-partner/railway.json` continua pronto para pôr a mesma API na Railway, se um dia for preferível um servidor permanente.

## 2. Painel das lojas na Vercel

1. **Add New → Project** a partir do mesmo repositório; nome `z-fashion-partner`.
2. **Root Directory**: `apps/fashion/apps/fashion-partner`; *Framework Preset*: Other. O resto vem de `vercel.json` (build, cabeçalhos de segurança, `/` → painel).
3. **Environment Variables**: `FASHION_API_BASE_URL` = `https://api.zfashion.online` (Production e Preview).
4. **Domains**: `partner.zfashion.online`.
5. Páginas: `https://partner.zfashion.online/` (painel) e `https://partner.zfashion.online/adhesion` (pedido de adesão).

## 3. Backoffice na Vercel

Igual ao passo 2: projeto `z-fashion-admin`, Root Directory `apps/fashion/apps/fashion-admin`, mesma variável, domínio `admin.zfashion.online`. Só as contas de `FASHION_ADMIN_USER_IDS` veem dados.

## 4. Stripe

1. **Developers → Webhooks → Add endpoint**: `https://api.zfashion.online/stripe/webhook`, eventos `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`. Copiar o *Signing secret* para `STRIPE_WEBHOOK_SECRET` no projeto `z-fashion-api`.
2. **Connect → Get started**: ativar o Connect (plataforma em França, contas Express). Os pagamentos às lojas usam *separate charges and transfers*.
3. **Settings → Branding / Public details**: nome Z Fashion, site, e-mail de apoio (aparecem no formulário de pagamento e nos recibos).
4. Começar em **modo de teste** (`sk_test_`/`pk_test_`). Passar a `live` só depois do teste completo (tarefa 20): novas chaves, novo webhook live, novo `whsec_`.

## 5. Site público (projeto `z-fashion`, já existe)

1. **Settings → Environment Variables**: `FASHION_API_BASE_URL` = `https://api.zfashion.online`. Novo deploy: o site passa do catálogo de demonstração para o catálogo real.
2. **Domains**: `zfashion.online` e `www.zfashion.online`.
3. Cabeçalhos (incluindo a política de segurança que autoriza o Stripe) vêm de `vercel.json`.

## 6. Pagamentos semanais às lojas

O ficheiro `.github/workflows/fashion-payouts.yml` corre todas as segundas às 06:00 UTC. No GitHub, **Settings → Secrets and variables → Actions**, criar:

- `FASHION_API_BASE_URL` = `https://api.zfashion.online`
- `FASHION_CRON_SECRET` = o mesmo valor do projeto `z-fashion-api`

Sem estes dois segredos o trabalho não faz nada. Pode ser lançado à mão em **Actions → Z Fashion weekly store payouts → Run workflow**.

## 7. Supabase

- **Authentication → URL Configuration**: *Site URL* `https://zfashion.online`; *Redirect URLs*: `https://zfashion.online/**`, `https://partner.zfashion.online/**`, `https://admin.zfashion.online/**`.
- **Authentication → Emails**: o código de 6 dígitos precisa de um SMTP próprio para volumes reais (tarefa 16, Resend).
- Este projeto chama-se *ZOS-staging*: a decisão sobre o projeto de produção é a tarefa 4.

## Textos legais (tarefa 5)

Os textos estão em `apps/fashion-web/legal-content.js` (francês, versão que faz fé). Faltam os dados da empresa que explora o Z Fashion e o mediador do consumo: aparecem a amarelo no site. Antes do lançamento:

1. Criar a empresa e escolher um mediador do consumo (obrigatório, art. L. 612-1 do code de la consommation).
2. Substituir cada `{{...}}` em `legal-content.js`.
3. `node apps/fashion/scripts/check-legal-ready.js` tem de passar.
4. Fazer reler os textos por um advogado.

## Verificação final

1. `https://partner.zfashion.online/adhesion` → pedido de adesão de uma loja de teste.
2. `https://admin.zfashion.online` → aprovar e ativar a loja.
3. Painel da loja → produto com foto, preço e stock; Corner configurado; "Versements" → configurar a conta Stripe (modo teste).
4. `https://zfashion.online` → o produto aparece; comprar com o cartão de teste `4242 4242 4242 4242`.
5. A encomenda aparece paga no "Compte" do cliente e nas vendas da loja.
