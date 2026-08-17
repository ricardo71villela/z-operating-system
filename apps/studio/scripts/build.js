#!/usr/bin/env node
// Monta os artefactos web do Z Studio a partir dos módulos em src/, aplica a
// identidade comercial visível e propaga o mesmo HTML aos destinos web/nativos.
//
// app/index.html é a entrada web canónica. app/my-studio.html mantém-se apenas
// como rota de compatibilidade. Ambos são FICHEIROS GERADOS — não editar
// diretamente. A fonte real vive em:
//   src/template.html              — a estrutura HTML/CSS, com um placeholder
//   src/data/i18n.js               — traduções (conteúdo dos posts + interface)
//   src/data/categories.js         — categorias, paletas, selos, campos extra
//   src/main.js                    — estado, rendering, UI, exportações
//   src/render/layout-guards.js    — guards de layout carregados após o renderer legado
//
// Durante a convergência comercial A1.2A, os módulos históricos ainda podem
// conter o nome legado "My Studio". A identidade emitida pelo build é sempre
// "Z Studio"; um contrato explícito impede que o nome antigo volte ao artefacto.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const WEB_INDEX_OUTPUT = path.join(ROOT, 'app', 'index.html');
const WEB_LEGACY_OUTPUT = path.join(ROOT, 'app', 'my-studio.html');

const PLACEHOLDER = '__MYSTUDIO_SCRIPT_PLACEHOLDER__';
const LEGACY_BRAND = 'My Studio';
const LEGACY_BRAND_UPPER = 'MY STUDIO';
const COMMERCIAL_BRAND = 'Z Studio';
const COMMERCIAL_BRAND_UPPER = 'Z STUDIO';

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

function assemble() {
  const template = fs.readFileSync(path.join(SRC, 'template.html'), 'utf-8');
  const i18n = fs.readFileSync(path.join(SRC, 'data', 'i18n.js'), 'utf-8');
  const categories = fs.readFileSync(path.join(SRC, 'data', 'categories.js'), 'utf-8');
  const stateModule = fs.readFileSync(path.join(SRC, 'state', 'state.js'), 'utf-8');
  const storage = fs.readFileSync(path.join(SRC, 'storage', 'indexeddb.js'), 'utf-8');
  const platformStorage = fs.readFileSync(path.join(SRC, 'platform', 'storage.js'), 'utf-8');
  const main = fs.readFileSync(path.join(SRC, 'main.js'), 'utf-8');
  const layoutGuards = fs.readFileSync(path.join(SRC, 'render', 'layout-guards.js'), 'utf-8');

  if (!template.includes(PLACEHOLDER)) {
    throw new Error('src/template.html não tem o placeholder ' + PLACEHOLDER + ' — a montagem não sabe onde inserir o script.');
  }

  // ordem importa: dados primeiro (main.js lê I18N/CATEGORY_* como já definidos),
  // depois state, storage, platform/storage e renderer legado. Os guards vêm no
  // fim para substituir apenas as primitivas de layout estabilizadas.
  const script = [i18n, categories, stateModule, storage, platformStorage, main, layoutGuards].join('\n\n');
  const html = applyCommercialIdentity(template.replace(PLACEHOLDER, script));
  assertCommercialIdentity(html, 'artefacto web Z Studio');

  fs.mkdirSync(path.dirname(WEB_INDEX_OUTPUT), { recursive: true });
  fs.writeFileSync(WEB_INDEX_OUTPUT, html, 'utf-8');
  fs.writeFileSync(WEB_LEGACY_OUTPUT, html, 'utf-8');
  console.log('✅ Montados app/index.html e app/my-studio.html com identidade Z Studio (' + html.length + ' caracteres)');
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

  // PWA: a mesma fonte serve o web build e o wrapper nativo. A raiz web é agora
  // a entrada canónica; my-studio.html permanece apenas para links legados.
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

  // Legal: mantém uma única fonte em legal/ e publica cópias coerentes nos dois
  // destinos. A1.2A altera apenas a marca; a revisão jurídica continua separada.
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
