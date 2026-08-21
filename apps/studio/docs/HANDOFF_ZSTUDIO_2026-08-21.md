# Z STUDIO — MASTER HANDOFF / CONTINUIDADE TOTAL

**Data de congelação:** 2026-08-21  
**Timezone operacional:** Europe/Lisbon  
**Objetivo:** permitir continuar o projeto Z Studio noutra conversa/sessão como se esta conversa não tivesse sido perdida.

---

## 0. INSTRUÇÃO DE RETOMA — LER PRIMEIRO

Numa nova conversa, este ficheiro deve ser tratado como **handoff autoritativo de continuidade**.

Antes de qualquer alteração:

1. Abrir o repositório `ricardo71villela/z-operating-system`.
2. Verificar a branch:
   `feature/zstudio-microsoft-store-v1`
3. Verificar que a branch contém pelo menos o SHA congelado neste handoff como parent de autoridade:
   `7cb2877931aabbb787e3638379eb2f63bbb83cd5`
4. Se a branch tiver avançado entretanto, **não fazer reset, force-push ou rewrite de história**. Auditar apenas os commits posteriores.
5. Não recomeçar arquitetura, billing, trials ou store strategy do zero.
6. Não assumir CI remoto PASS se não tiver sido observado.
7. Não fazer live Supabase, live Stripe, store-console mutation, deploy, merge ou release sem o gate correspondente.
8. A arquitetura comercial das 4 superfícies está congelada em source; o próximo trabalho é essencialmente **external activation + sandbox/live E2E + store submission**.

---

# 1. REPOSITÓRIO E AUTORIDADE GIT

**GitHub:** `ricardo71villela/z-operating-system`

**Branch atual de autoridade Z Studio:**
`feature/zstudio-microsoft-store-v1`

**HEAD confirmado imediatamente antes da criação deste handoff:**
`7cb2877931aabbb787e3638379eb2f63bbb83cd5`

A comparação:
`7cb2877931aabbb787e3638379eb2f63bbb83cd5`
vs
`feature/zstudio-microsoft-store-v1`
foi confirmada como **identical / ahead_by=0 / behind_by=0**.

A criação deste próprio ficheiro gera necessariamente um commit posterior. Numa nova sessão, deve-se auditar esse commit de documentação e continuar forward-only.

## Commits de checkpoint mais recentes antes do handoff

### 1.1 Quatro superfícies comerciais unificadas
`ec9f897b53fa5553f6f771152af206d92e1b8d89`

Mensagem:
`feat(studio): unify four-surface commercial launch readiness`

Net diff: 33 ficheiros.

Este commit fechou:
- UI comercial comum;
- Web/Stripe Checkout;
- Web/Stripe Billing Portal;
- Apple StoreKit purchase lifecycle;
- Apple global trial preflight;
- Apple signed introductory-offer eligibility;
- Apple restore/reconcile/finish ordering;
- build commercial runtime;
- migrations Apple/Web portal;
- testes;
- runbooks;
- cross-platform readiness;
- PostgreSQL disposable workflow.

### 1.2 Matriz de ativação externa congelada
`7cb2877931aabbb787e3638379eb2f63bbb83cd5`

Mensagem:
`docs(studio): freeze external activation matrix`

Ficheiro:
`apps/studio/docs/external-activation-matrix.md`

---

# 2. OBJETIVO FINAL

Colocar as quatro superfícies Z Studio no mesmo ponto final e depois lançá-las:

1. **Web**
2. **Apple App Store**
3. **Google Play**
4. **Microsoft Store**

Estado alvo antes dos consoles/credenciais/live:

**SOURCE_READY / EXTERNAL_ACTIVATION_PENDING**

Este estado foi atingido em source para as quatro superfícies.

---

# 3. PRINCÍPIO COMERCIAL GLOBAL

Existe **uma única autoridade comercial ZOS** em Supabase/Postgres.

Nenhuma app/browser concede acesso comercial por si.

Todos os providers apenas produzem evidência que o runtime comercial verifica antes de escrever o estado ZOS.

## Billing sources canónicas

A autoridade atual aceita exatamente:

- `manual`
- `web`
- `apple_app_store`
- `google_play`

**NÃO existe e NÃO deve ser criado `microsoft_store`.**

Microsoft Store reutiliza o billing Web/Stripe.

## Trial global

Existe **um único trial lifetime de produção por pessoa canónica ZOS**, transversal a:

- Web
- Apple
- Google Play

Microsoft usa Web, portanto não cria uma quarta trial authority.

Trial target:
**3 dias**

---

# 4. PREÇOS / CATÁLOGO COMERCIAL CONGELADO

Fonte canónica:
`apps/studio/commercial/store-products.v1.json`

App/package:
`com.zoperatingsystem.zstudio`

Moeda comercial alvo:
`EUR`

Planos:

- Weekly: **€5.99**
- Monthly: **€14.99**
- Annual: **€119.99**

Trial:
**3 dias**

## Google

Subscription product:
`zstudio.access`

Base plans:
- `weekly`
- `monthly`
- `annual`

Offer:
`trial-3d`

## Apple

Produtos atuais continuam um por plano:

- `com.zoperatingsystem.zstudio.subscription.weekly`
- `com.zoperatingsystem.zstudio.subscription.monthly`
- `com.zoperatingsystem.zstudio.subscription.annual`

Não duplicar produtos Apple para paid/trial.

A decisão global de trial é enviada para StoreKit via eligibility assinada pelo servidor.

---

# 5. ESTADO DAS 4 SUPERFÍCIES

| Superfície | Distribuição | Compra | Reconciliação | Gestão | Estado |
|---|---|---|---|---|---|
| Web | HTTPS Web/PWA | Stripe Checkout | Stripe current-state + webhook | Stripe Billing Portal | SOURCE_READY |
| Apple | App Store | StoreKit 2 | App Store Server API + notifications | App Store | SOURCE_READY |
| Google | Play Store | Play Billing | Android Publisher API + RTDN | Google Play | SOURCE_READY |
| Microsoft | PWA / Store package | Stripe Checkout | mesma autoridade Web | Stripe Billing Portal | SOURCE_READY |

Todas permanecem:
**EXTERNAL_ACTIVATION_PENDING**

---

# 6. FLAGS / LIMITES LIVE

Até ao handoff, manter como falsas / não executadas:

- `STRIPE_LIVE_ACTIVATION=false`
- `STRIPE_WEBHOOK_CREATED_LIVE=false`
- `CHECKOUT_LIVE=false`
- `PAYMENTS_LIVE=false`
- `SUPABASE_LIVE_MUTATION=false`
- `GOOGLE_PLAY_CONSOLE_MUTATION=false`
- `GOOGLE_PLAY_LIVE_PRODUCTS_CREATED=false`
- `GOOGLE_PLAY_RTDN_CONFIGURED=false`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_LIVE=false`
- `MANUAL_DEPLOYMENT=false`
- `PRODUCTION_DEPLOYMENT_CREATED=false`
- `MERGE_CREATED=false`

A instrução anterior era manter Stripe live desligado até o gate explicitamente autorizado.

---

# 7. AUTORIDADE SUPABASE / POSTGRES

## Base comercial principal

Migration histórica:
`20260819130000_zstudio_commercial_activation_authority_v1.sql`

Princípios:
- ledger billing append-only;
- subscriptions provider-neutral;
- entitlement Z Studio/AI centralizado;
- high-water ordering;
- idempotência;
- revoked terminal;
- current-state wins over trigger content;
- clients nunca escrevem entitlement diretamente.

RPC principal:
`zstudio_apply_verified_commercial_event(...)`

## Global trial authority

Migration:
`20260820150000_zstudio_web_checkout_preflight_authority_v1.sql`

Tabela:
`studio.production_trial_authority`

Esta tabela controla o lifetime trial production.

## Web terminal-trial authority

Migration:
`20260820220000_zstudio_web_terminal_trial_claim_authority_v1.sql`

Commit:
`c32722c6bebc95b9dad6f8762220cad11b0fc375`

Disposable test source commit:
`ac49c00b59b37ae1313cb3aa62d7dcb6d693cd83`

Não declarar remote Postgres PASS apenas com base nestes commits; o run remoto anterior não foi observável.

## Google pause authority

Migration:
`20260820235500_zstudio_google_play_pause_authority_v1.sql`

## Google preflight

Migration:
`20260821002000_zstudio_google_play_purchase_preflight_authority_v1.sql`

## Google reconciliation hardening

Migration:
`20260821004000_zstudio_google_play_reconciliation_hardening_v1.sql`

## Google RTDN

Migration:
`20260821005000_zstudio_google_play_rtdn_authority_v1.sql`

## Apple purchase preflight — novo

Migration:
`20260821010000_zstudio_apple_purchase_preflight_authority_v1.sql`

Esta migration cria a authority server-side para:
- preparar intent Apple;
- reservar trial global;
- bloquear provider-race;
- permitir trial apenas após preflight válido;
- associar current Apple subscription ao intent;
- completar intent depois do writer.

## Web customer portal — novo

Migration:
`20260821011000_zstudio_web_customer_portal_authority_v1.sql`

Usada pelo Stripe Billing Portal.

---

# 8. WEB / STRIPE — ESTADO

Branch Web histórica:
`feature/zstudio-web-billing-v1`

Checkpoint D4:
`5e2b5d5df6c499c8836b4043011d715d4fa10a7b`
`feat(studio): publish Stripe webhook current-state reconciliation`

D4 já tinha:
- webhook como trigger apenas;
- raw signature verification primeiro;
- current Checkout Session/Subscription re-fetch;
- fail-closed identity/customer/env/price/plan;
- invoice parent subscription moderno;
- period vindo do SubscriptionItem;
- `stripe:web:*` refs;
- local tests 33/33 PASS.

## `/api/web/checkout`

Já é server-side.

Body:
`{ plan_code }`

O browser:
- não escolhe Stripe price ID;
- não escolhe trial;
- não escolhe customer;
- envia apenas plan code + bearer auth.

Resposta inclui:
- `checkout_url`
- `intent_id`
- `plan_code`
- `trial_eligible`
- `expires_at`
- `commercial_state`
- `request_id`

O cliente valida:
- HTTPS
- hostname exato `checkout.stripe.com`

## Billing Portal

Novo endpoint:
`/api/web/portal`

Usa customer já associado ao person ZOS.

Não cria customer a partir do browser.

Serve Web e Microsoft PWA para:
- gerir subscrição;
- atualizar payment method;
- cancelar/alterar dentro das permissões Stripe Portal.

---

# 9. STRIPE SANDBOX — ESTADO EXTERNO REAL

Existe uma conta Stripe conectada com display name:

`environnement de test Z Studio`

Account ID observado:
`acct_1U6hOhLelsX3mv7i`

No início da auditoria tinha:
- 0 products
- 0 prices
- 0 webhook endpoints
- 0 Billing Portal configurations

Foi criado **apenas em sandbox / `livemode=false`**:

## Produto

`prod_V6vQHl1tOiyBaP`
Nome:
`Z Studio Access`

## Preços recorrentes EUR sandbox

Weekly €5.99:
`price_1U6haiLelsX3mv7ivtJpIntG`

Monthly €14.99:
`price_1U6haqLelsX3mv7i60H6VWAH`

Annual €119.99:
`price_1U6hayLelsX3mv7iJ7kluTSE`

Isto está documentado em:
`apps/studio/docs/stripe-sandbox-state.md`

## Ainda não criado

- webhook Stripe sandbox, porque ainda não existe canonical HTTPS commercial runtime URL;
- Billing Portal configuration, porque o conector expôs apenas leitura para configurations;
- nada live.

---

# 10. APPLE — ESTADO ATUAL

Apple era a superfície que ainda tinha a maior assimetria; foi alinhada.

## Native plugin

Ficheiro:
`apps/studio/native/ios/App/App/ZStudioStoreKitPlugin.swift`

O plugin já é registado por:
`ZStudioBridgeViewController.swift`

App bundle:
`com.zoperatingsystem.zstudio`

Deployment target iOS:
`15.0`

## Lifecycle atual

Fluxo de compra:

1. utilizador autenticado ZOS;
2. JS pede `/api/apple/prepare`;
3. servidor resolve person ZOS canónica;
4. servidor prepara Apple purchase intent;
5. trial global decide eligible/not eligible;
6. servidor assina eligibility do introductory offer;
7. StoreKit recebe:
   - `appAccountToken` = canonical ZOS person UUID;
   - signed introductory-offer eligibility;
8. StoreKit processa compra;
9. transaction JWS vai para `/api/apple/reconcile`;
10. servidor verifica Apple evidence;
11. servidor re-fetch current subscription state;
12. writer comercial aplica;
13. Apple purchase intent é completado;
14. só depois o device recebe autorização para `finishTransaction`.

## Identidades Apple

Não confundir:

- `appAccountToken`: canonical ZOS person UUID
- `appTransactionID`: Apple app/account transaction identity usada para a assinatura Apple

A identidade comercial continua a ser ZOS, não Apple.

## Trial Apple

Não usar dois produtos por plano.

Foi escolhido o mecanismo oficial StoreKit de introductory-offer eligibility assinada.

O objetivo é impedir que alguém que já consumiu trial no Web ou Google receba outro trial Apple.

## Notification-before-device race

A authority foi desenhada para convergir mesmo se App Store Server Notification chegar antes da reconciliação do device.

## Restore

A app deve suportar:
- current entitlements;
- unfinished transactions;
- explicit Restore Purchases;
- reinstall/novo device.

## Não fazer

Não promover o trial como “Promoted In-App Purchase” se isso puder expor o introductory offer fora do ZOS preflight.

---

# 11. GOOGLE PLAY — ESTADO ATUAL

Branch histórica:
`feature/zstudio-google-play-billing-v1`

Commits importantes:

1. `074a925b3828d5c11357b1cfd2b1059fab5e7b78`
   `feat(studio): add Google Play Billing native foundation`

2. `b2a8daf4e0e4d5b0866ca2a1e7ddcc3a1357fd7e`
   pause authority

3. `9a30d8ddbaf512d9c5fd4710491e6bc19583576d`
   server current-state/auth/client

4. `bee53a057a704b24cf737916abb9a4e2937b2f7b`
   global trial purchase preflight

5. `7d6b54a23ad0c2ddd18eb6a79ea312c2315d881f`
   device current-state reconciliation

6. `4f353042cba2948c99c1e2a8b4f622813673f2c8`
   `feat(studio): add Google Play RTDN reconciliation`

7. `a57a80afa88feff7dca6d23d7c006d5216045396`
   `feat(studio): complete Google Play native lifecycle bridge`

8. `abaa8832f2a11ed0c73f2298b05e88b3d9872e82`
   `docs(studio): freeze Google Play release readiness`

## Native lifecycle

Ficheiro:
`apps/studio/native/www/google-play-billing-bridge.js`

Faz:
- prepare;
- purchase;
- canonical person obfuscatedAccountId;
- persist intent metadata apenas;
- reconcile;
- restore fallback;
- currentPurchases restore on resume;
- purchaseUpdated listener.

Nunca deve persistir raw purchase token em storage/DB/ledger.

## Android MainActivity

Ficheiro:
`apps/studio/native/android/app/src/main/java/com/zoperatingsystem/zstudio/MainActivity.java`

Injeta a Google Play bridge no resume.

Foi corrigido no checkpoint transversal para não apagar uma commercial runtime URL já configurada pelo build.

## Billing

Google Play Billing Library:
`9.1.0`

Package:
`com.zoperatingsystem.zstudio`

Product:
`zstudio.access`

Base plans:
weekly/monthly/annual

Offer:
`trial-3d`

## RTDN

RTDN é trigger-only.

Nunca usar RTDN payload como entitlement authority.

Sempre:
RTDN -> authenticate Pub/Sub -> parse -> Android Publisher API current state -> ZOS writer.

## Accidental historical blobs/commits

Histórico antigo tinha sentinelas acidentais:
- `66ef4962...` zero-byte `__should_not_use__`
- `8befbb92...` `__another__`

A árvore final RTDN foi criada a partir de parent limpo e **não contém esses sentinelas**.

Também existiram orphan blobs durante experiências Git Data API. Orphan blobs não são branch mutations.

Não reescrever história.

---

# 12. MICROSOFT STORE — ARQUITETURA FINAL

Decisão congelada:

**Microsoft Store = PWA distribution**
+
**Web/Stripe commerce**

Não implementar:
- `Windows.Services.Store`
- Microsoft recurring billing
- `microsoft_store` billing source
- trial authority separada

## PWA

`apps/studio/pwa/manifest.webmanifest`

Já tem:
- name
- short_name
- start_url
- scope
- display standalone
- colors
- categories
- icons 192/512/maskable

`apps/studio/pwa/sw.js`
é service worker network-first.

`apps/studio/src/main.js`
regista `./sw.js`.

`apps/studio/scripts/build.js`
propaga PWA assets para:
- `apps/studio/app`
- `apps/studio/native/www`

## Microsoft compra

A PWA Microsoft usa a mesma browser bridge e:
- Stripe Checkout
- Stripe Billing Portal
- billing source = `web`

O próximo gate Microsoft é distribuição/certificação, não nova engenharia comercial.

---

# 13. BUILD COMERCIAL COMUM

Checkpoint transversal modificou:
`apps/studio/scripts/build.js`

O build lê:
`ZSTUDIO_COMMERCIAL_BASE_URL`

Regra:
- deve ser uma origem HTTPS exata;
- sem path;
- sem query;
- sem hash;
- sem credentials;
- se ausente, billing UI fica fail-closed/inativa.

Quando presente:
- a origem é injetada no runtime;
- adicionada a `connect-src` da CSP;
- usada pelo browser/PWA;
- copiada para native www.

Módulos comerciais são montados após auth, porque precisam de:
`window.ZStudioAuth`.

---

# 14. UI COMERCIAL COMUM

Novo módulo:
`apps/studio/src/platform/billing-ui.js`

Apple:
- StoreKit

Android:
- Google Play

Browser / Microsoft PWA:
- Stripe Checkout

A seleção é automática pela plataforma.

Não deve existir uma UI que permita escolher provider manualmente.

---

# 15. TESTES / PROVAS OBSERVADAS

Na tranche transversal foram observados localmente:

- **7/7 PASS** runtime Apple + Stripe Portal
- **4/4 PASS** bridges/routing lifecycle
- **3/3 PASS** build commercial/fail-closed
- `swiftc -parse` PASS
- `node --check` PASS nos módulos novos

Google anteriormente:
- restore server 3/3 PASS
- bridge/native lifecycle 7/7 PASS após compact
- syntax checks PASS

Web D4:
- local tests 33/33 PASS

## Checks Vercel do commit `ec9f897b...`

Observados:
- `Vercel – z-find-platform`: success
- `Vercel – z-studio-platform`: success
- `Vercel – z-studio-web`: success

Isto **não significa** que o commercial runtime foi deployed.

## PostgreSQL

Novo workflow:
`.github/workflows/studio-cross-platform-release-postgres.yml`

O workflow foi publicado, mas o conector GitHub não tornou o push run observável.

Portanto classificação correta:

`POSTGRES_SOURCE_PROOF=PUBLISHED`
`POSTGRES_REMOTE_PASS=UNPROVEN`

Nunca dizer PostgreSQL remote PASS sem observar o run/log.

---

# 16. VERCEL — ESTADO

Team:
`team_UefeEpjGbq9JI2TG2649yNl0`

## z-studio-commercial

Project:
`prj_QUH84E9fYw8D5FJb95kgC9GlWwUr`

Estado observado:
- `live: false`
- `latestDeployment: null`
- `domains: []`
- 0 deployments

Isto é deliberado.

Não inventar canonical URL.

## z-studio-web

Project:
`prj_NuxBQ02yZpSKJToUruN8AldBM4um`

## z-studio-platform

Project:
`prj_Vit4OYkKSoDVXNGPPHHQjOpTqzeK`

O commercial runtime é o blocker para:
- Stripe webhook;
- browser commercial origin;
- native commercial base URL;
- Google RTDN endpoint;
- Apple endpoints live.

---

# 17. ENV VAR MATRIX — NÃO GUARDAR SECRETS NO GITHUB

A matriz foi congelada em:
`apps/studio/docs/external-activation-matrix.md`

## Shared Supabase

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_PUBLISHABLE_KEY`

## Build

- `ZSTUDIO_COMMERCIAL_BASE_URL`

## Stripe

- `STRIPE_ENVIRONMENT`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_WEEKLY`
- `STRIPE_PRICE_MONTHLY`
- `STRIPE_PRICE_ANNUAL`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

## Apple

- `APPLE_ENVIRONMENT`
- `APPLE_BUNDLE_ID`
- `APPLE_APP_APPLE_ID`
- `APPLE_ISSUER_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`

## Google

- `GOOGLE_PLAY_ENVIRONMENT`
- `GOOGLE_PLAY_PACKAGE_NAME`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `GOOGLE_PLAY_PUBSUB_AUDIENCE`
- `GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PLAY_PUBSUB_SUBSCRIPTION`

Nunca versionar private keys, service account JSON, Stripe secrets ou Supabase secret key.

---

# 18. CONTAS / CONSOLES EXTERNOS

Foi pesquisada integração para:

- App Store Connect
- Google Play Console
- Microsoft Partner Center

Não existem conectores instaláveis disponíveis neste ambiente para esses três consoles.

Logo, as seguintes ações exigem presença do titular / login / identidade / contratos:

## Apple
- developer account / App Store Connect;
- agreements/tax/banking;
- app record;
- subscription group;
- IAP products;
- App Store Server API key;
- App Store Server Notifications;
- TestFlight;
- review/submission.

## Google
- Play Console account;
- app record/package;
- subscription/base plans/offer;
- Google Cloud service account;
- Android Publisher API permissions;
- Pub/Sub topic/subscription;
- RTDN;
- internal test track;
- tester/license tester;
- review/submission.

## Microsoft
- Partner Center account;
- legal identity;
- app name reservation;
- PWA/MSIX/PWABuilder path;
- store listing/assets;
- certification/submission.

---

# 19. SEQUÊNCIA EXATA A PARTIR DAQUI

A ordem recomendada para não reabrir arquitetura é:

## GATE 1 — Confirmar Git authority
- branch exata;
- HEAD;
- worktree/remote sem drift.

## GATE 2 — PostgreSQL disposable proof
- executar/observar workflow PostgreSQL;
- se falhar, corrigir forward-only;
- não ir live antes do PASS.

## GATE 3 — Supabase production
Só com autorização:
- aplicar cadeia Z Studio commercial migrations;
- verificar tabelas/RPCs;
- smoke checks seguros;
- confirmar global trial authority.

## GATE 4 — Primeiro `z-studio-commercial` HTTPS
- fazer deployment autorizado;
- obter canonical HTTPS origin;
- não inventar URL;
- configurar env vars sandbox;
- validar endpoints fail-closed.

## GATE 5 — Stripe sandbox E2E
Usar os 3 price IDs já criados.
Criar:
- webhook sandbox para `/api/web/webhook`;
- Billing Portal configuration;
- success/cancel URLs;
- sandbox secret/env;
- checkout E2E;
- webhook current-state E2E;
- portal E2E;
- trial global E2E.

## GATE 6 — Apple sandbox/TestFlight
- App Store Connect;
- 3 subscription products;
- trial intro offer de 3 dias;
- server API credentials;
- notifications;
- build;
- sandbox purchase;
- no-trial user;
- restore;
- renewal/cancel/expiry;
- TestFlight.

## GATE 7 — Google internal testing
- Play products;
- service account;
- Developer API;
- Pub/Sub/RTDN;
- license testers;
- Billing Lab;
- 25-case matrix from Google runbook.

## GATE 8 — Microsoft package/submission
Depois da PWA HTTPS estável:
- PWABuilder / current recommended Store path;
- reserve name;
- package identity;
- listing;
- screenshots;
- certification.

## GATE 9 — Stripe live
Apenas quando explicitamente autorizado:
- create live product/prices mirroring canonical EUR catalog;
- live restricted/server credential policy;
- live webhook;
- live Portal;
- live success/cancel;
- live E2E minimal;
- confirm no sandbox/live cross-use.

## GATE 10 — Store launches
- Apple review/submission
- Google production rollout
- Microsoft certification/publish
- Web production publication

---

# 20. NÃO FAZER

1. Não criar `microsoft_store` billing source.
2. Não criar uma quarta trial authority.
3. Não colocar Stripe price IDs no browser como autoridade.
4. Não deixar client escolher trial.
5. Não aceitar raw RTDN as entitlement authority.
6. Não persistir Google raw purchase tokens.
7. Não dar entitlement antes do server writer.
8. Não terminar Apple transaction antes do server delivery.
9. Não usar Apple account como identidade ZOS.
10. Não inventar URL `z-studio-commercial`.
11. Não declarar CI/Postgres PASS sem evidência.
12. Não rewrite Git history.
13. Não force-push.
14. Não resetar para branches antigas.
15. Não criar deployment live por “teste”.
16. Não versionar secrets.
17. Não ativar Stripe live antes do gate.
18. Não misturar store billing provider rules com entitlement authority.
19. Não reabrir a arquitetura Microsoft para native Microsoft commerce sem nova razão forte.
20. Não alterar os preços canónicos sem decisão comercial explícita.

---

# 21. FICHEIROS DE DOCUMENTAÇÃO QUE DEVEM SER LIDOS NUMA NOVA SESSÃO

Prioridade:

1. `apps/studio/docs/HANDOFF_ZSTUDIO_2026-08-21.md`
2. `apps/studio/docs/external-activation-matrix.md`
3. `apps/studio/docs/zstudio-four-surface-launch-runbook.md`
4. `apps/studio/docs/web-stripe-release-runbook.md`
5. `apps/studio/docs/apple-release-runbook.md`
6. `apps/studio/docs/google-play-release-runbook.md`
7. `apps/studio/docs/microsoft-store-release-runbook.md`
8. `apps/studio/docs/stripe-sandbox-state.md`
9. `apps/studio/native/README.md`

Depois:
- `apps/studio/commercial/store-products.v1.json`
- `apps/studio/scripts/build.js`
- `apps/studio/src/platform/billing-ui.js`
- Apple/Google bridges
- migrations commercial trial authorities.

---

# 22. PROMPT EXATO PARA ABRIR UMA NOVA CONVERSA

Copiar e colar:

> **CONTINUAÇÃO Z STUDIO — NÃO RECOMEÇAR.**
>
> Repo: `ricardo71villela/z-operating-system`
>
> Branch de autoridade:
> `feature/zstudio-microsoft-store-v1`
>
> Parent HEAD congelado imediatamente antes do handoff:
> `7cb2877931aabbb787e3638379eb2f63bbb83cd5`
>
> Leia primeiro:
> `apps/studio/docs/HANDOFF_ZSTUDIO_2026-08-21.md`
>
> Depois leia:
> `apps/studio/docs/external-activation-matrix.md`
> e
> `apps/studio/docs/zstudio-four-surface-launch-runbook.md`
>
> Não recomece arquitetura. As quatro superfícies estão em
> `SOURCE_READY / EXTERNAL_ACTIVATION_PENDING`.
>
> Preserve os gates fail-closed e as flags no-live.
> Não declare PostgreSQL remote PASS sem evidência observada.
> Não faça merge/deploy/live mutation sem gate autorizado.
>
> Comece por comparar o HEAD atual da branch ao SHA do handoff. O commit que cria o próprio handoff é esperado; qualquer outro commit posterior deve ser auditado forward-only. Depois continue a sequência a partir do primeiro gate externo ainda não executado.

---

# 23. SE ESTA CONVERSA FOR PERDIDA

Não é necessário reconstruir tudo manualmente.

Basta numa nova conversa dizer:

**“Leia o handoff Z Studio no GitHub em `apps/studio/docs/HANDOFF_ZSTUDIO_2026-08-21.md` na branch `feature/zstudio-microsoft-store-v1` e continue do último estado validado, sem recomeçar.”**

Se o GitHub connector estiver disponível, a nova sessão consegue ler diretamente o documento e o source.

Também guardar a cópia local deste ficheiro fora do ChatGPT.

---

# 24. CLASSIFICAÇÃO FINAL DESTE HANDOFF

```text
ZSTUDIO_HANDOFF_DATE=2026-08-21
REPO=ricardo71villela/z-operating-system
BRANCH=feature/zstudio-microsoft-store-v1
HANDOFF_PARENT_HEAD=7cb2877931aabbb787e3638379eb2f63bbb83cd5

WEB=SOURCE_READY_EXTERNAL_ACTIVATION_PENDING
APPLE=SOURCE_READY_EXTERNAL_ACTIVATION_PENDING
GOOGLE_PLAY=SOURCE_READY_EXTERNAL_ACTIVATION_PENDING
MICROSOFT_STORE=SOURCE_READY_EXTERNAL_ACTIVATION_PENDING

STRIPE_SANDBOX_CATALOG=CREATED
STRIPE_LIVE_ACTIVATION=false
STRIPE_WEBHOOK_CREATED_LIVE=false

Z_STUDIO_COMMERCIAL_VERCEL_PROJECT=EXISTS
Z_STUDIO_COMMERCIAL_LIVE=false
Z_STUDIO_COMMERCIAL_DEPLOYMENTS=0

SUPABASE_LIVE_MUTATION=false
GOOGLE_PLAY_CONSOLE_MUTATION=false
MICROSOFT_PARTNER_CENTER_MUTATION=false
APP_STORE_CONNECT_MUTATION=false

POSTGRES_SOURCE_PROOF=PUBLISHED
POSTGRES_REMOTE_PASS=UNPROVEN

MERGE_CREATED=false
PRODUCTION_DEPLOYMENT_CREATED=false
```

---

# 25. REGRA DE OURO

A próxima sessão deve tratar este handoff como **continuação de execução**, não como pedido de consultoria nem como projeto novo.

O source já atingiu o limite seguro possível sem credenciais/consoles/live.

O próximo objetivo é:

**PROVAR DB → LIGAR RUNTIME HTTPS → E2E SANDBOX → CRIAR/CONFIGURAR CONTAS/CONSOLES → LIVE GATES → SUBMISSÕES → LANÇAMENTO DAS 4 SUPERFÍCIES.**
