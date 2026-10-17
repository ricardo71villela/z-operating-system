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

1. **Developers → Webhooks → Add endpoint**: `https://api.zfashion.online/stripe/webhook`, eventos `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed` (encomendas) e `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed` (assinaturas das lojas). Copiar o *Signing secret* para `STRIPE_WEBHOOK_SECRET` no projeto `z-fashion-api`.
2. **Connect → Get started**: ativar o Connect (plataforma em França, contas Express). Os pagamentos às lojas usam *separate charges and transfers*.
3. **Settings → Branding / Public details**: nome Z Fashion, site, e-mail de apoio (aparecem no formulário de pagamento e nos recibos).
4. **Assinaturas das lojas (tarefa 9)**:
   - **Settings → Payment methods**: ativar *Cards* e *SEPA Direct Debit* (a página de assinatura mostra os meios ativos que aceitam pagamentos recorrentes).
   - **Settings → Billing → Customer portal**: guardar a configuração (permitir mudar o meio de pagamento, ver faturas, cancelar no fim do período). Sem isto o botão "Moyen de paiement, factures, résiliation" falha.
   - **Settings → Billing → Invoices**: dados da empresa e número de TVA nas faturas; **Subscriptions and emails**: ativar os e-mails de pagamento falhado e as novas tentativas automáticas.
   - A taxa de TVA de 20 % é criada automaticamente na primeira assinatura.
5. Começar em **modo de teste** (`sk_test_`/`pk_test_`). Passar a `live` só depois do teste completo (tarefa 20): novas chaves, novo webhook live, novo `whsec_`.

## 5. Site público (projeto `z-fashion`, já existe)

1. **Settings → Environment Variables**: `FASHION_API_BASE_URL` = `https://api.zfashion.online`. Novo deploy: o site passa do catálogo de demonstração para o catálogo real.
2. **Domains**: `zfashion.online` e `www.zfashion.online`.
3. Cabeçalhos (incluindo a política de segurança que autoriza o Stripe) vêm de `vercel.json`.

## 5b. E-mails (Resend, tarefa 16)

O Z Fashion envia: confirmação de encomenda ao cliente, aviso de nova encomenda a cada loja, decisões de adesão, produto recusado ou retirado, e as mensagens do formulário de contacto (para `contact@…`, com cópia ao cliente). Sem `RESEND_API_KEY` nada é enviado (só fica registado no log).

1. **DNS de `zfashion.online`** (o domínio já existe na Resend, região Irlanda, por verificar):

| Nome | Tipo | Valor |
| --- | --- | --- |
| `resend._domainkey` | TXT | ver em resend.com → Domains → zfashion.online (chave DKIM, começa por `p=MIGfMA0…`) |
| `send` | CNAME | `send.forge.rmta.net` |
| `rsend` | CNAME | `rsend-euw1.forge.rmta.net` |

   Depois **Verify** na Resend.
2. **Resend → API Keys**: criar uma chave *Sending access* só para `zfashion.online`.
3. **Variáveis no projeto `z-fashion-api`**: `RESEND_API_KEY` (a chave, *Sensitive*), `FASHION_EMAIL_FROM` = `Z Fashion <commandes@zfashion.online>`, `FASHION_SUPPORT_EMAIL` = `contact@zfashion.online`, `FASHION_SITE_URL` = `https://zfashion.online`.
4. **Caixa `contact@zfashion.online`**: tem de receber correio (é para lá que vão as mensagens do site e as respostas dos clientes) — criar a caixa ou um reencaminhamento no fornecedor do domínio.
5. **Códigos de acesso por e-mail (Supabase Auth)**: Supabase → Authentication → Emails → **SMTP Settings**: host `smtp.resend.com`, porta `465`, utilizador `resend`, palavra-passe = uma chave Resend, remetente `Z Fashion <acesso@zfashion.online>`. Sem isto o Supabase só envia poucos códigos por hora.

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
