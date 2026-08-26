# Z Studio — wrapper nativo (iOS + Android)

Este projeto Capacitor empacota o Z Studio para iOS e Android. A identidade nativa está congelada e não é placeholder:

- App ID / Android package / namespace: `com.zoperatingsystem.zstudio`
- Nome: `Z Studio`
- Android Play Billing Library: `9.1.0`
- Autoridade de catálogo: `../commercial/store-products.v1.json`

**Não alterar o App ID durante a preparação das lojas.** O package `com.zoperatingsystem.zstudio` é também a autoridade usada pelo backend Google Play e pelo contrato de produtos.

## Estado atual

### Base nativa

- projetos `ios/` e `android/` presentes;
- ícones e permissões nativas presentes;
- autenticação ZOS/Supabase já disponível no WebView;
- `@capacitor/filesystem` e `@capacitor/share` instalados;
- Android BillingClient first-party registado em `MainActivity`;
- compras Google nunca concedem entitlement no cliente.

### Google Play billing

O fluxo fonte atual é:

1. login Z Studio;
2. `/api/google/play/prepare` resolve a pessoa ZOS e reserva, se elegível, o trial global;
3. o servidor devolve `obfuscated_account_id` = UUID canónico ZOS e decide `use_trial_offer`;
4. `ZStudioPlayBilling.purchase()` abre Google Play com o base plan exato;
5. `purchaseUpdated` ou `currentPurchases()` entrega apenas evidência transitória ao bridge;
6. `/api/google/play/reconcile` ou `/api/google/play/restore` volta a consultar `purchases.subscriptionsv2.get`;
7. o backend escreve estado comercial/entitlements;
8. só depois o backend confirma (`acknowledge`) a compra;
9. RTDN funciona apenas como trigger e também volta a consultar o estado atual Google.

No `onResume`, `MainActivity` injeta `www/google-play-billing-bridge.js`. O bridge chama `currentPurchases()` para recuperar compras concluídas enquanto a app esteve fechada, reinstalada ou usada noutro dispositivo. O purchase token não é persistido em `localStorage`.

## Bloqueio deliberado antes da ativação

`capacitor.config.json` mantém:

```json
"ZStudioPlayBilling": {
  "commercialBaseUrl": ""
}
```

Isto é **fail-closed por desenho**. Enquanto `z-studio-commercial` não tiver deployment HTTPS autorizado, a app não mostra/ativa o fluxo comercial Google. Não preencher com uma URL inventada ou preview efémero.

Quando o runtime comercial tiver uma URL HTTPS canónica validada:

1. colocar essa origem exata em `plugins.ZStudioPlayBilling.commercialBaseUrl`;
2. correr `npm install` se necessário;
3. correr `npx cap sync` para copiar `www/` e a configuração para os projetos nativos;
4. compilar novamente Android;
5. executar a matriz de teste do runbook `../docs/google-play-release-runbook.md`.

## Android — build e teste

1. Instalar Android Studio e SDK exigido pelo projeto.
2. Nesta pasta: `npm install`.
3. Executar `npm run test:google-play`.
4. Executar `npx cap sync android`.
5. Executar `npx cap open android`.
6. Confirmar em Android Studio que `applicationId` permanece `com.zoperatingsystem.zstudio`.
7. Compilar e testar primeiro com testador de licença / faixa interna.
8. Só gerar o `.aab` de release depois da matriz comercial estar PASS.

A chave de assinatura/Play App Signing é autoridade externa e deve ser guardada fora do repositório.

## iOS

O projeto iOS continua separado do Google Play. Para alterações web comuns em `www/`, correr `npx cap sync ios` antes de compilar no Xcode. Não reutilizar credenciais ou identificadores Google no target iOS.

## Riscos nativos que continuam a exigir dispositivo real

- downloads PNG/ZIP/PDF e integração Filesystem/Share;
- seletor de pasta (File System Access API não é uma autoridade nativa portátil);
- folha de partilha;
- Billing UI/Play Store real, pending purchase, renewal, grace, hold, pause, cancel, restore e reinstall.

## Estrutura

```text
capacitor.config.json  — app id, cores e plugins; commercialBaseUrl fica vazio até ativação
package.json           — Capacitor + teste Google Play
www/                    — artefactos web empacotados, incluindo google-play-billing-bridge.js
ios/                    — projeto Xcode
android/                — projeto Android Studio + ZStudioPlayBillingPlugin
```

`www/` é uma cópia estática. Depois de qualquer alteração ao conteúdo empacotado, correr `npx cap sync` antes da compilação nativa.
