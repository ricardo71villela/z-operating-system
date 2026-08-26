# Z Studio — Google Play release runbook

Estado: **SOURCE READY / EXTERNAL ACTIVATION PENDING**

Este runbook não autoriza deployment, mutação Supabase live nem publicação Play. Serve para executar os gates externos sem reabrir decisões de arquitetura.

## 1. Autoridades congeladas

- package: `com.zoperatingsystem.zstudio`
- subscription product: `zstudio.access`
- base plans: `weekly`, `monthly`, `annual`
- trial offer id: `trial-3d`
- trial: 3 dias
- moeda comercial alvo: EUR
- preços alvo: weekly €5.99; monthly €14.99; annual €119.99
- trial Z Studio: uma utilização lifetime global por pessoa em produção, transversal a Web/Apple/Google
- Play Console não é autoridade para a elegibilidade global do trial; o servidor ZOS decide se envia `use_trial_offer=true`

A fonte canónica é `apps/studio/commercial/store-products.v1.json`.

## 2. Gate A — Google Play Console

Criar/confirmar a aplicação com package **exatamente** `com.zoperatingsystem.zstudio`.

Criar a subscrição `zstudio.access` e os três base plans com as cadências correspondentes. Configurar o offer `trial-3d` de 3 dias onde a UI atual do Play Console permitir a elegibilidade equivalente à aquisição de novo assinante. Não criar SKUs paralelos para weekly/monthly/annual: a separação é por base plan.

Antes de avançar, comparar todos os IDs e preços com `store-products.v1.json`.

## 3. Gate B — Google Play Developer API

Criar/selecionar uma service account dedicada ao runtime comercial e conceder apenas as permissões Play necessárias para consultar pedidos/assinaturas e gerir assinaturas/pedidos.

Runtime esperado:

- `GOOGLE_PLAY_ENVIRONMENT=sandbox` durante a prova com compras de teste;
- `GOOGLE_PLAY_PACKAGE_NAME=com.zoperatingsystem.zstudio`;
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=<secret>`;
- `SUPABASE_URL=<live project URL>`;
- `SUPABASE_SECRET_KEY=<server secret>`;
- `SUPABASE_PUBLISHABLE_KEY=<public key used only to validate user bearer>`.

Nunca colocar a service-account JSON, Supabase secret ou Android Publisher access token na app Android.

## 4. Gate C — Supabase commercial authority

Aplicar a cadeia de migrations Z Studio aprovada ao projeto live apenas no gate explicitamente autorizado. Confirmar pelo menos:

- commercial activation writer/current access;
- production trial authority;
- Google Play pause authority;
- Google Play purchase preflight;
- Google Play reconciliation hardening;
- Google Play RTDN authority.

Executar os testes PostgreSQL de autoridade contra um ambiente descartável antes do live e, depois da aplicação live, apenas smoke checks read-only/transaction-safe previstos pelo release gate.

## 5. Gate D — commercial runtime Vercel

O projeto `z-studio-commercial` deve receber o primeiro deployment autorizado e uma origem HTTPS estável/canónica.

Só depois dessa URL estar validada:

1. configurar as env vars Google/Supabase no runtime;
2. testar `/api/google/play/prepare`, `/reconcile`, `/restore` e `/rtdn` sem expor secrets;
3. colocar **a mesma origem HTTPS exata** em `apps/studio/native/capacitor.config.json` → `plugins.ZStudioPlayBilling.commercialBaseUrl`;
4. `npx cap sync android`;
5. recompilar o `.aab`.

Enquanto não existir URL canónica, `commercialBaseUrl` deve continuar vazio.

## 6. Gate E — Pub/Sub + RTDN

Criar um Cloud Pub/Sub topic dedicado e dar ao Google Play permissão de publicação. No Play Console ativar Real-time developer notifications e indicar o topic completo `projects/{project}/topics/{topic}`.

Criar uma push subscription autenticada para o endpoint `/api/google/play/rtdn`, usando uma service account de push dedicada e audience igual à URL esperada pelo runtime.

Runtime esperado:

- `GOOGLE_PLAY_PUBSUB_AUDIENCE=<exact HTTPS audience>`;
- `GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL=<push service account>`;
- `GOOGLE_PLAY_PUBSUB_SUBSCRIPTION=projects/{project}/subscriptions/{subscription}`.

Usar **Send Test Message** no Play Console e confirmar HTTP success + dedupe. O conteúdo RTDN nunca deve conceder acesso diretamente: após qualquer subscription RTDN, o runtime volta a consultar Google Play Developer API.

## 7. Gate F — internal testing

Configurar pelo menos um testador de licença e uma faixa de teste interna. A conta Google usada na compra deve estar no dispositivo e ser a conta relevante para o download do app.

Usar formas de pagamento de teste e Play Billing Lab para acelerar estados. Não assumir que uma compra numa faixa de teste é gratuita: contas que não sejam license testers podem ser cobradas.

## 8. Matriz end-to-end obrigatória

PASS individual para:

1. weekly sem trial;
2. monthly sem trial;
3. annual sem trial;
4. trial global elegível → 3-day offer apresentado;
5. pessoa que já consumiu trial noutro canal → Google purchase sem trial;
6. user cancels purchase sheet → nenhum entitlement;
7. pending purchase → nenhum entitlement até Google confirmar;
8. pending → purchased com app fechada → restore no resume;
9. reinstall / outro dispositivo → `currentPurchases()` + `/restore` recupera acesso;
10. duplicate device reconciliation → idempotente;
11. duplicate RTDN → idempotente;
12. RTDN fora de ordem → estado atual vence;
13. renewal → período/entitlement atualizados;
14. cancellation → acesso mantém-se até expiry;
15. grace → acesso mantém-se;
16. account hold → acesso bloqueado;
17. pause → acesso bloqueado;
18. recovery de pause/hold → acesso restaurado;
19. expiry → acesso bloqueado;
20. server acknowledge ocorre apenas depois do writer comercial;
21. purchase token bruto ausente de Supabase/ledger/logs persistentes;
22. identity mismatch → fail-closed;
23. produto/base plan/offer inesperado → fail-closed;
24. sandbox purchase rejeitado pelo runtime production e vice-versa;
25. RTDN test message autenticado e deduplicado.

## 9. Release gate

Google Play só pode passar a RELEASE_READY quando, simultaneamente:

- source readiness test PASS;
- Android build assinado PASS;
- Supabase migrations live aplicadas e verificadas;
- commercial runtime HTTPS live e env vars verificadas;
- Developer API auth PASS;
- RTDN test message PASS;
- matriz end-to-end PASS;
- nenhum secret dentro do APK/AAB;
- package/product/base-plan/offer IDs coincidem exatamente com a autoridade do repositório.

Até lá: **GOOGLE_PLAY_LIVE=false**.
