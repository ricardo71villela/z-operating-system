#!/usr/bin/env node
// Monta os artefactos web do Z Studio a partir dos módulos em src/, aplica a
// identidade comercial visível e propaga o mesmo HTML aos destinos web/nativos.
//
// app/index.html é a entrada web canónica. app/my-studio.html mantém-se apenas
// como rota de compatibilidade. Ambos são FICHEIROS GERADOS — não editar
// diretamente. A fonte real vive em:
//   src/template.html              — estrutura HTML/CSS
//   src/data/*                     — conteúdo e catálogo visual
//   src/main.js                    — estado/rendering/UI/exportações
//   src/platform/auth.js           — sessão ZOS / Bearer bridge
//   src/platform/apple-billing.js  — lifecycle StoreKit 2
//   src/platform/billing-ui.js     — planos Web/Apple/Google/Microsoft PWA
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const WEB_INDEX_OUTPUT = path.join(ROOT, 'app', 'index.html');
const WEB_LEGACY_OUTPUT = path.join(ROOT, 'app', 'my-studio.html');
const STORE_CATALOG = path.join(ROOT, 'commercial', 'store-products.v1.json');
const LAPTOP_BRAND_HEADER_CSS = path.join(SRC, 'ux', 'laptop-brand-header.css');
const LAPTOP_PREMIUM_POLISH_CSS = path.join(SRC, 'ux', 'laptop-premium-polish-v2.css');
const LAPTOP_VIEWPORT_BALANCE_CSS = path.join(SRC, 'ux', 'laptop-viewport-balance-v1.css');
const MOBILE_HEADER_CSS = path.join(SRC, 'ux', 'mobile-header-v1.css');
const APP_THEME_CSS = path.join(SRC, 'ux', 'app-theme-v1.css');
const LAPTOP_ICON_RUNTIME_AUTHORITY_JS = path.join(SRC, 'ux', 'laptop-icon-runtime-authority-v2.js');
const PREVIEW_STATE_MACHINE_JS = path.join(SRC, 'ux', 'preview-state-machine-v1.js');
const APP_THEME_RUNTIME_JS = path.join(SRC, 'ux', 'app-theme-v1.js');

const PLACEHOLDER = '__MYSTUDIO_SCRIPT_PLACEHOLDER__';
const LEGACY_BRAND = 'My Studio';
const LEGACY_BRAND_UPPER = 'MY STUDIO';
const COMMERCIAL_BRAND = 'Z Studio';
const COMMERCIAL_BRAND_UPPER = 'Z STUDIO';
const SUPABASE_ORIGIN = 'https://dcdggqyazdddrfuzwavw.supabase.co';
const SUPABASE_CDN_ORIGIN = 'https://cdn.jsdelivr.net';
const LAPTOP_BRAND_HEADER_MARKER = 'ZSTUDIO_LAPTOP_BRAND_HEADER_V1';
const LAPTOP_PREMIUM_POLISH_MARKER = 'ZSTUDIO_LAPTOP_PREMIUM_POLISH_V2';
const LAPTOP_VIEWPORT_BALANCE_MARKER = 'ZSTUDIO_LAPTOP_VIEWPORT_BALANCE_V1';
const MOBILE_HEADER_MARKER = 'ZSTUDIO_MOBILE_HEADER_V1';
const APP_THEME_MARKER = 'ZSTUDIO_APP_THEME_V1';
const LAPTOP_ICON_RUNTIME_AUTHORITY_MARKER = 'ZSTUDIO_LAPTOP_ICON_RUNTIME_AUTHORITY_V2';
const PREVIEW_STATE_MACHINE_MARKER = 'ZSTUDIO_PREVIEW_STATE_MACHINE_V1';
const APP_THEME_RUNTIME_MARKER = 'ZSTUDIO_APP_THEME_RUNTIME_V1';

function applyCommercialIdentity(text) {
  return String(text)
    .replaceAll(LEGACY_BRAND_UPPER, COMMERCIAL_BRAND_UPPER)
    .replaceAll(LEGACY_BRAND, COMMERCIAL_BRAND);
}

function assertCommercialIdentity(text, label) {
  if (text.includes(LEGACY_BRAND) || text.includes(LEGACY_BRAND_UPPER)) {
    throw new Error(label + ' ainda contém a identidade legada My Studio.');
  }
}

function normalizeCommercialBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw new Error('ZSTUDIO_COMMERCIAL_BASE_URL inválido.'); }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (parsed.pathname && parsed.pathname !== '/')
  ) {
    throw new Error('ZSTUDIO_COMMERCIAL_BASE_URL deve ser uma origem HTTPS sem path/query/hash.');
  }
  return parsed.origin;
}

function publicCommercialConfig(baseUrl) {
  const catalog = JSON.parse(fs.readFileSync(STORE_CATALOG, 'utf-8'));
  if (
    catalog.authority !== 'ZSTUDIO_STORE_PRODUCT_AUTHORITY_V1'
    || catalog.appId !== 'com.zoperatingsystem.zstudio'
    || catalog.commercialTargetCurrency !== 'EUR'
    || catalog.trialDays !== 3
  ) throw new Error('Catálogo comercial Z Studio inválido para build público.');

  const plans = {};
  for (const planCode of ['weekly', 'monthly', 'annual']) {
    const plan = catalog.plans?.[planCode];
    if (
      plan?.billingCadence !== planCode
      || !Number.isInteger(plan?.commercialTargetPriceMinor)
      || plan.commercialTargetPriceMinor <= 0
      || typeof plan?.apple?.productId !== 'string'
      || typeof plan?.google?.productId !== 'string'
      || plan?.google?.basePlanId !== planCode
    ) throw new Error('Plano comercial público inválido: ' + planCode);
    plans[planCode] = Object.freeze({
      priceMinor: plan.commercialTargetPriceMinor,
      appleProductId: plan.apple.productId,
      googleProductId: plan.google.productId,
      googleBasePlanId: plan.google.basePlanId,
    });
  }

  return Object.freeze({
    authority: catalog.authority,
    enabled: Boolean(baseUrl),
    baseUrl,
    appId: catalog.appId,
    currency: catalog.commercialTargetCurrency,
    trialDays: catalog.trialDays,
    plans: Object.freeze(plans),
  });
}

function injectLaptopBrandHeaderCss(template) {
  const modules = [
    [LAPTOP_BRAND_HEADER_CSS, LAPTOP_BRAND_HEADER_MARKER, 'marca laptop'],
    [LAPTOP_PREMIUM_POLISH_CSS, LAPTOP_PREMIUM_POLISH_MARKER, 'polish premium laptop'],
    [LAPTOP_VIEWPORT_BALANCE_CSS, LAPTOP_VIEWPORT_BALANCE_MARKER, 'equilíbrio viewport laptop'],
    [MOBILE_HEADER_CSS, MOBILE_HEADER_MARKER, 'cabeçalho mobile'],
    [APP_THEME_CSS, APP_THEME_MARKER, 'tema dual da aplicação'],
  ];
  const cssParts = [];

  for (const [file, marker, label] of modules) {
    const css = fs.readFileSync(file, 'utf-8').trim();
    if (!css.includes(marker)) {
      throw new Error('CSS de ' + label + ' sem autoridade ' + marker + '.');
    }
    if (String(template).includes(marker)) {
      throw new Error('Template já contém a autoridade ' + marker + '; recusa duplicação.');
    }
    cssParts.push(css);
  }

  const closingStyle = '</style>';
  const occurrences = String(template).split(closingStyle).length - 1;
  if (occurrences !== 1) {
    throw new Error('Template Z Studio deve conter exatamente um </style> para injeção UX.');
  }

  const output = String(template).replace(closingStyle, '\n' + cssParts.join('\n\n') + '\n\n' + closingStyle);
  for (const [, marker] of modules) {
    const markerCount = output.split(marker).length - 1;
    if (markerCount !== 1) {
      throw new Error('Autoridade ' + marker + ' não foi injetada exatamente uma vez.');
    }
  }
  return output;
}

function injectPreviewStateMachine(main, runtime) {
  if (!String(runtime).includes(PREVIEW_STATE_MACHINE_MARKER)) {
    throw new Error('Preview runtime sem autoridade ' + PREVIEW_STATE_MACHINE_MARKER + '.');
  }
  if (String(main).includes(PREVIEW_STATE_MACHINE_MARKER)) {
    throw new Error('main.js já contém a autoridade ' + PREVIEW_STATE_MACHINE_MARKER + '; recusa duplicação.');
  }

  const bootSentinel = '\nloadAll();';
  const occurrences = String(main).split(bootSentinel).length - 1;
  if (occurrences !== 1) {
    throw new Error('main.js deve conter exatamente um boot loadAll() para injeção da preview state machine.');
  }

  const output = String(main).replace(
    bootSentinel,
    '\n\n' + String(runtime).trim() + '\n\nloadAll();'
  );
  const markerCount = output.split(PREVIEW_STATE_MACHINE_MARKER).length - 1;
  if (markerCount !== 1) {
    throw new Error('Preview state machine não foi injetada exatamente uma vez.');
  }
  return output;
}

function applyAuthRuntimeCsp(template) {
  const withScriptOrigin = String(template)
    .replaceAll(
      "script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline';",
      "script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net 'unsafe-inline';",
    )
    .replaceAll(
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com;",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;",
    );
  const output = withScriptOrigin.replaceAll(
    "connect-src 'self' https://z-studio-platform-seven.vercel.app;",
    "connect-src 'self' https://z-studio-platform-seven.vercel.app https://dcdggqyazdddrfuzwavw.supabase.co;",
  );
  const scriptPolicies = output.match(/script-src[^;]*https:\/\/cdn\.jsdelivr\.net/g) || [];
  const connectPolicies = output.match(/connect-src[^;]*https:\/\/dcdggqyazdddrfuzwavw\.supabase\.co/g) || [];
  if (scriptPolicies.length !== 2 || connectPolicies.length !== 2) {
    throw new Error('CSP do Z Studio não recebeu exatamente duas autoridades Auth (script/connect).');
  }
  if (!output.includes(SUPABASE_ORIGIN) || !output.includes(SUPABASE_CDN_ORIGIN)) {
    throw new Error('CSP Auth incompleta.');
  }
  return output;
}

function applyCommercialRuntimeCsp(template, baseUrl) {
  if (!baseUrl) return template;
  const marker = "connect-src 'self' https://z-studio-platform-seven.vercel.app https://dcdggqyazdddrfuzwavw.supabase.co;";
  const replacement = marker.slice(0, -1) + ' ' + baseUrl + ';';
  const occurrences = String(template).split(marker).length - 1;
  if (occurrences !== 2) throw new Error('CSP comercial não encontrou exatamente duas políticas connect-src canónicas.');
  const output = String(template).replaceAll(marker, replacement);
  const escaped = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const count = (output.match(new RegExp('connect-src[^;]*' + escaped, 'g')) || []).length;
  if (count !== 2) throw new Error('CSP comercial não recebeu a origem runtime exatamente duas vezes.');
  return output;
}

function assemble() {
  const template = fs.readFileSync(path.join(SRC, 'template.html'), 'utf-8');
  const i18n = fs.readFileSync(path.join(SRC, 'data', 'i18n.js'), 'utf-8');
  const categories = fs.readFileSync(path.join(SRC, 'data', 'categories.js'), 'utf-8');
  const stateModule = fs.readFileSync(path.join(SRC, 'state', 'state.js'), 'utf-8');
  const storage = fs.readFileSync(path.join(SRC, 'storage', 'indexeddb.js'), 'utf-8');
  const platformStorage = fs.readFileSync(path.join(SRC, 'platform', 'storage.js'), 'utf-8');
  const main = fs.readFileSync(path.join(SRC, 'main.js'), 'utf-8');
  const previewStateMachine = fs.readFileSync(PREVIEW_STATE_MACHINE_JS, 'utf-8');
  const mainWithPreviewState = injectPreviewStateMachine(main, previewStateMachine);
  const layoutGuards = fs.readFileSync(path.join(SRC, 'render', 'layout-guards.js'), 'utf-8');
  const laptopIconRuntimeAuthority = fs.readFileSync(LAPTOP_ICON_RUNTIME_AUTHORITY_JS, 'utf-8');
  const appThemeRuntime = fs.readFileSync(APP_THEME_RUNTIME_JS, 'utf-8');
  const auth = fs.readFileSync(path.join(SRC, 'platform', 'auth.js'), 'utf-8');
  const appleBilling = fs.readFileSync(path.join(SRC, 'platform', 'apple-billing.js'), 'utf-8');
  const billingUi = fs.readFileSync(path.join(SRC, 'platform', 'billing-ui.js'), 'utf-8');

  if (!template.includes(PLACEHOLDER)) {
    throw new Error('src/template.html não tem o placeholder ' + PLACEHOLDER + ' — a montagem não sabe onde inserir o script.');
  }
  if (!laptopIconRuntimeAuthority.includes(LAPTOP_ICON_RUNTIME_AUTHORITY_MARKER)) {
    throw new Error('Runtime de iconografia laptop sem autoridade ' + LAPTOP_ICON_RUNTIME_AUTHORITY_MARKER + '.');
  }
  if (!appThemeRuntime.includes(APP_THEME_RUNTIME_MARKER)) {
    throw new Error('Runtime de tema da aplicação sem autoridade ' + APP_THEME_RUNTIME_MARKER + '.');
  }

  const commercialBaseUrl = normalizeCommercialBaseUrl(process.env.ZSTUDIO_COMMERCIAL_BASE_URL);
  const commercialConfig = publicCommercialConfig(commercialBaseUrl);
  const commercialBoot = [
    '// ZSTUDIO_PUBLIC_COMMERCIAL_RUNTIME_V1',
    'window.ZSTUDIO_COMMERCIAL_BASE_URL=' + JSON.stringify(commercialBaseUrl) + ';',
    'window.ZStudioCommercialConfig=Object.freeze(' + JSON.stringify(commercialConfig) + ');',
  ].join('\n');

  const script = [
    commercialBoot,
    i18n,
    categories,
    stateModule,
    storage,
    platformStorage,
    mainWithPreviewState,
    layoutGuards,
    laptopIconRuntimeAuthority,
    appThemeRuntime,
    auth,
    appleBilling,
    billingUi,
  ].join('\n\n');

  const withLaptopBrandHeader = injectLaptopBrandHeaderCss(template);
  const withAuth = applyAuthRuntimeCsp(withLaptopBrandHeader);
  const withCommercialCsp = applyCommercialRuntimeCsp(withAuth, commercialBaseUrl);
  const html = applyCommercialIdentity(withCommercialCsp.replace(PLACEHOLDER, script));
  assertCommercialIdentity(html, 'artefacto web Z Studio');
  for (const marker of [
    LAPTOP_BRAND_HEADER_MARKER,
    LAPTOP_PREMIUM_POLISH_MARKER,
    LAPTOP_VIEWPORT_BALANCE_MARKER,
    MOBILE_HEADER_MARKER,
    APP_THEME_MARKER,
    LAPTOP_ICON_RUNTIME_AUTHORITY_MARKER,
    PREVIEW_STATE_MACHINE_MARKER,
    APP_THEME_RUNTIME_MARKER,
  ]) {
    const markerCount = html.split(marker).length - 1;
    if (markerCount !== 1) {
      throw new Error('Artefacto web não contém exatamente uma autoridade ' + marker + '.');
    }
  }

  fs.mkdirSync(path.dirname(WEB_INDEX_OUTPUT), { recursive: true });
  fs.writeFileSync(WEB_INDEX_OUTPUT, html, 'utf-8');
  fs.writeFileSync(WEB_LEGACY_OUTPUT, html, 'utf-8');
  console.log('✅ Montados app/index.html e app/my-studio.html com identidade Z Studio (' + html.length + ' caracteres)');
  console.log('LAPTOP_BRAND_HEADER=' + LAPTOP_BRAND_HEADER_MARKER);
  console.log('LAPTOP_PREMIUM_POLISH=' + LAPTOP_PREMIUM_POLISH_MARKER);
  console.log('LAPTOP_VIEWPORT_BALANCE=' + LAPTOP_VIEWPORT_BALANCE_MARKER);
  console.log('MOBILE_HEADER=' + MOBILE_HEADER_MARKER);
  console.log('APP_THEME=' + APP_THEME_MARKER);
  console.log('LAPTOP_ICON_RUNTIME=' + LAPTOP_ICON_RUNTIME_AUTHORITY_MARKER);
  console.log('PREVIEW_STATE_MACHINE=' + PREVIEW_STATE_MACHINE_MARKER);
  console.log('APP_THEME_RUNTIME=' + APP_THEME_RUNTIME_MARKER);
  console.log('COMMERCIAL_RUNTIME=' + (commercialConfig.enabled ? commercialConfig.baseUrl : 'DISABLED'));
  return html;
}

function copyTextWithIdentity(source, target) {
  const text = applyCommercialIdentity(fs.readFileSync(source, 'utf-8'));
  assertCommercialIdentity(text, path.relative(ROOT, target));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, 'utf-8');
}

function propagate() {
  const html = fs.readFileSync(WEB_INDEX_OUTPUT, 'utf-8');
  assertCommercialIdentity(html, 'app/index.html');

  const legacyHtml = fs.readFileSync(WEB_LEGACY_OUTPUT, 'utf-8');
  if (legacyHtml !== html) {
    throw new Error('app/index.html e app/my-studio.html divergiram durante o build.');
  }

  const nativeWww = path.join(ROOT, 'native', 'www');
  fs.mkdirSync(nativeWww, { recursive: true });
  fs.writeFileSync(path.join(nativeWww, 'index.html'), html, 'utf-8');
  console.log('✅ Copiado para native/www/index.html');

  const pwaDir = path.join(ROOT, 'pwa');
  const appDir = path.join(ROOT, 'app');
  const pwaTextFiles = ['manifest.webmanifest', 'sw.js'];
  for (const f of pwaTextFiles) {
    const source = path.join(pwaDir, f);
    if (!fs.existsSync(source)) continue;
    copyTextWithIdentity(source, path.join(appDir, f));
    copyTextWithIdentity(source, path.join(nativeWww, f));
  }

  const iconFiles = fs.existsSync(pwaDir) ? fs.readdirSync(pwaDir).filter(f => f.endsWith('.png')) : [];
  for (const f of iconFiles) {
    fs.copyFileSync(path.join(pwaDir, f), path.join(appDir, f));
    fs.copyFileSync(path.join(pwaDir, f), path.join(nativeWww, f));
  }
  if (iconFiles.length) console.log('✅ Copiados', iconFiles.length, 'ícones para app/ e native/www/');

  const legalDir = path.join(ROOT, 'legal');
  for (const f of ['termos-de-servico.html', 'politica-privacidade.html']) {
    const source = path.join(legalDir, f);
    if (!fs.existsSync(source)) continue;
    copyTextWithIdentity(source, path.join(appDir, f));
    copyTextWithIdentity(source, path.join(nativeWww, f));
  }

  console.log('\nBuild concluído — artefactos web/native sincronizados com identidade Z Studio');
  console.log('Lembrete: corre "npm run sync" a seguir para propagar ao iOS/Android (npx cap sync).');
}

assemble();
propagate();