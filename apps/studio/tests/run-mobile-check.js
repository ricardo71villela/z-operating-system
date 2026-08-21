// ═══════════════════════════════════════════════════════════════════════
//  Z STUDIO — MOBILE CENTER + INFORMATION FLOW CONTRACT
// ═══════════════════════════════════════════════════════════════════════
//
// Abre a app num Chromium real a 390×844 e prova:
// - ausência de overflow horizontal;
// - preview state EMPTY → READY;
// - EMPTY = criação primeiro, sem export/caption prematuros;
// - READY = preview primeiro, export/caption novamente disponíveis;
// - fit responsivo dos cinco formatos;
// - identidade Z Studio e SVG icon system no header mobile;
// - copy de upload própria de telefone e sem pasta desktop;
// - detalhes de texto em progressive disclosure;
// - scroll vertical natural da página.
//
// As screenshots ficam em ./test-output/ para revisão visual opcional.
// ═══════════════════════════════════════════════════════════════════════

const { app, BrowserWindow, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const targetFile = (() => {
  const idx = process.argv.findIndex(a => path.resolve(a) === path.resolve(__filename));
  return (idx >= 0 && process.argv[idx + 1]) || 'my-studio.html';
})();
const targetPath = path.isAbsolute(targetFile) ? targetFile : path.join(process.cwd(), targetFile);
const targetDir = path.dirname(targetPath);
const targetName = path.basename(targetPath);
const outDir = path.join(process.cwd(), 'test-output');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

if (!fs.existsSync(targetPath)) {
  console.error('❌ Não encontrei o ficheiro: ' + targetPath);
  process.exit(1);
}

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
function startServer(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(dir, pathname);
      if (!filePath.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const INSPECT_CODE = `
(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 1800) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (fn()) return true;
      await sleep(40);
    }
    return false;
  };
  await sleep(650);

  const checks = [];
  const check = (name, pass, extra) => checks.push({ name, pass: !!pass, extra: extra ?? null });
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

  check('viewport real é 390×844', window.innerWidth === 390 && window.innerHeight === 844, viewport());
  check('mobile runtime authority carregada', !!window.ZStudioMobileRuntime && window.ZStudioMobileRuntime.authority === 'ZSTUDIO_MOBILE_RUNTIME_AUTHORITY_V1');
  check('mobile information flow v2 carregado', !!window.ZStudioMobileRuntime && window.ZStudioMobileRuntime.flowAuthority === 'ZSTUDIO_MOBILE_INFORMATION_FLOW_V2',
    window.ZStudioMobileRuntime && window.ZStudioMobileRuntime.flowAuthority);
  check('preview state authority carregada', !!window.ZStudioPreviewRuntime && window.ZStudioPreviewRuntime.authority === 'ZSTUDIO_PREVIEW_STATE_MACHINE_V1');

  if (window.ZStudioMobileRuntime) window.ZStudioMobileRuntime.refresh();
  await sleep(120);

  check('fit mobile runtime aplicado', document.documentElement.getAttribute('data-zstudio-preview-fit') === 'mobile-runtime-v1',
    document.documentElement.getAttribute('data-zstudio-preview-fit'));
  check('flow mobile v2 aplicado', document.documentElement.getAttribute('data-zstudio-mobile-flow') === 'v2',
    document.documentElement.getAttribute('data-zstudio-mobile-flow'));

  const bodyStyle = getComputedStyle(document.body);
  const htmlStyle = getComputedStyle(document.documentElement);
  check('mobile preserva scroll vertical natural', bodyStyle.overflowY !== 'hidden' && htmlStyle.overflowY !== 'hidden',
    { body: bodyStyle.overflowY, html: htmlStyle.overflowY });

  check('sem overflow horizontal na página (documentElement)', document.documentElement.scrollWidth <= window.innerWidth + 2,
    { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth });
  check('sem overflow horizontal no body', document.body.scrollWidth <= window.innerWidth + 2,
    { scrollWidth: document.body.scrollWidth, innerWidth: window.innerWidth });

  const header = document.querySelector('header');
  if (header) check('cabeçalho cabe no ecrã sem cortar', header.scrollWidth <= header.clientWidth + 2,
    { scrollWidth: header.scrollWidth, clientWidth: header.clientWidth });

  const brandTag = document.querySelector('header .brand .tag');
  const brandBefore = brandTag ? getComputedStyle(brandTag, '::before').content : '';
  check('header mobile mostra identidade Z Studio', !!brandTag && getComputedStyle(brandTag).display !== 'none' && /Z Studio/.test(brandBefore),
    { display: brandTag && getComputedStyle(brandTag).display, before: brandBefore });

  check('estado inicial sem rascunho é EMPTY', window.ZStudioPreviewRuntime && window.ZStudioPreviewRuntime.getState() === 'empty',
    window.ZStudioPreviewRuntime && window.ZStudioPreviewRuntime.getState());

  const primary = document.querySelector('.actions .export-primary, [data-i18n="downloadPngBtn"]');
  check('EMPTY bloqueia Download PNG no mobile', !!primary && primary.disabled === true,
    primary && { disabled: primary.disabled, ariaDisabled: primary.getAttribute('aria-disabled') });

  check('SVG icon system chegou ao header mobile', !!document.querySelector('#btnHeaderBulk .zs-icon'));
  check('SVG icon system chegou à dropzone mobile', !!document.querySelector('.dropzone > .zs-dropzone-icon'));
  check('Brand & Languages usa SVG no mobile', !!document.querySelector('#brandStep .step-label .zs-icon'));

  const controls = document.querySelector('.controls');
  const stage = document.querySelector('.stage');
  if (controls && stage) {
    const cr = controls.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    check('EMPTY põe criação antes do preview', cr.top < sr.top, { controlsTop: cr.top, stageTop: sr.top });
  }

  const exportRow = document.querySelector('.export-row');
  const captionBox = document.querySelector('.caption-box');
  check('EMPTY não ocupa espaço com exportações', !!exportRow && getComputedStyle(exportRow).display === 'none',
    exportRow && getComputedStyle(exportRow).display);
  check('EMPTY não ocupa espaço com Caption', !!captionBox && getComputedStyle(captionBox).display === 'none',
    captionBox && getComputedStyle(captionBox).display);

  const folderPicker = document.getElementById('btnFolderPicker');
  check('mobile remove ação de pasta sincronizada no computador', !!folderPicker && getComputedStyle(folderPicker).display === 'none',
    folderPicker && getComputedStyle(folderPicker).display);

  const uploadLabel = document.querySelector('#mediaStep > label.f');
  check('mobile usa copy de upload própria de telefone', !!uploadLabel && /phone|telemóvel|téléphone|teléfono|Smartphone|telefono/i.test(uploadLabel.textContent),
    uploadLabel && uploadLabel.textContent);

  const detailsToggle = document.getElementById('zsMobileTextDetailsToggle');
  const details = document.getElementById('zsMobileTextDetails');
  check('detalhes adicionais têm disclosure mobile', !!detailsToggle && getComputedStyle(detailsToggle).display !== 'none');
  check('detalhes adicionais começam recolhidos', !!details && getComputedStyle(details).display === 'none',
    details && getComputedStyle(details).display);

  const canvasFrame = document.querySelector('.canvas-frame');
  if (canvasFrame) {
    const r = canvasFrame.getBoundingClientRect();
    check('pré-visualização vazia cabe no ecrã sem cortar', r.left >= -2 && r.right <= window.innerWidth + 2,
      { left: r.left, right: r.right, viewport: window.innerWidth });
    check('preview EMPTY é compacto no mobile', r.height <= Math.min(window.innerHeight * 0.42, 355),
      { height: r.height, viewportHeight: window.innerHeight });
    check('preview EMPTY também funciona como ação de upload', canvasFrame.getAttribute('role') === 'button' && canvasFrame.dataset.zsMobileEmptyAction === 'true',
      { role: canvasFrame.getAttribute('role'), action: canvasFrame.dataset.zsMobileEmptyAction });
  }

  // testar o modal de produção em massa, se existir
  if (typeof toggleRealEstateModule === 'function' && typeof openBulk === 'function') {
    toggleRealEstateModule(true); await sleep(80);
    openBulk(); await sleep(150);
    const modal = document.querySelector('#bulkOverlay > div');
    if (modal) {
      const r = modal.getBoundingClientRect();
      check('modal de produção em massa cabe no ecrã', r.left >= -2 && r.right <= window.innerWidth + 2,
        { left: r.left, right: r.right });
    }
    closeBulk(); toggleRealEstateModule(false);
  }

  // Carrega duas fotos reais em memória para provar EMPTY → READY e carousel.
  if (typeof handleUploadFiles === 'function') {
    function makeTestFile(name, w, h, color) {
      const c = document.createElement('canvas'); c.width=w; c.height=h;
      const ctx = c.getContext('2d'); ctx.fillStyle=color; ctx.fillRect(0,0,w,h);
      return new Promise(res => c.toBlob(b => res(new File([b], name, {type:'image/png'})), 'image/png'));
    }
    const f1 = await makeTestFile('a.png', 800, 600, '#336699');
    const f2 = await makeTestFile('b.png', 800, 600, '#996633');
    await handleUploadFiles([f1, f2]);
    await waitFor(() => window.ZStudioPreviewRuntime && window.ZStudioPreviewRuntime.isReady(), 2200);
    if (window.ZStudioMobileRuntime) window.ZStudioMobileRuntime.refresh();
    await sleep(160);

    check('2 fotos carregadas', state.photos && state.photos.length === 2, state.photos && state.photos.length);
    check('mobile passa a READY depois do decode', window.ZStudioPreviewRuntime && window.ZStudioPreviewRuntime.isReady(),
      window.ZStudioPreviewRuntime && window.ZStudioPreviewRuntime.getState());
    check('READY desbloqueia Download PNG no mobile', !!primary && primary.disabled === false,
      primary && { disabled: primary.disabled, ariaDisabled: primary.getAttribute('aria-disabled') });

    if (controls && stage) {
      const cr = controls.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      check('READY devolve preview ao topo', sr.top < cr.top, { controlsTop: cr.top, stageTop: sr.top });
    }
    check('READY volta a mostrar exportações', !!exportRow && getComputedStyle(exportRow).display !== 'none',
      exportRow && getComputedStyle(exportRow).display);
    check('READY volta a mostrar Caption', !!captionBox && getComputedStyle(captionBox).display !== 'none',
      captionBox && getComputedStyle(captionBox).display);

    if (captionBox && typeof syncStudioAssistantEmptyState === 'function') {
      captionBox.classList.add('open');
      syncStudioAssistantEmptyState();
      await sleep(60);
      const assistantEmpty = document.getElementById('zsAssistantEmptyState');
      check('Z AI empty state existe no mobile READY', !!assistantEmpty);
      check('Z AI empty state fica visível ao abrir Caption vazio', !!assistantEmpty && getComputedStyle(assistantEmpty).display !== 'none',
        assistantEmpty && getComputedStyle(assistantEmpty).display);
      captionBox.classList.remove('open');
    }

    const tile = document.querySelectorAll('#photoGrid .ph')[1];
    if (tile) {
      tile.querySelector('img').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(100);
      check('tocar numa foto seleciona-a (sem conflito com arrastar)', state.photo === state.photos[1]);
    }

    document.getElementById('fTitle').value = 'Apartamento T2 com vista rio';
    state.title = 'Apartamento T2 com vista rio';
    document.getElementById('fPrice').value = '295.000€';
    state.price = '295.000€';
    draw();

    const formats = ['feed45', 'square', 'story', 'wide', 'pin'];
    for (const format of formats) {
      setFormat(format);
      draw();
      if (window.ZStudioMobileRuntime) window.ZStudioMobileRuntime.fit();
      await sleep(80);
      const preview = document.getElementById('preview');
      const frame = document.querySelector('.canvas-frame');
      const pr = preview.getBoundingClientRect();
      const fr = frame.getBoundingClientRect();
      check(format + ': preview cabe horizontalmente', pr.left >= -2 && pr.right <= window.innerWidth + 2,
        { left: pr.left, right: pr.right, viewport: window.innerWidth });
      check(format + ': frame cabe horizontalmente', fr.left >= -2 && fr.right <= window.innerWidth + 2,
        { left: fr.left, right: fr.right, viewport: window.innerWidth });
      check(format + ': preview respeita teto móvel de altura', pr.height <= Math.min(window.innerHeight * 0.60, 530),
        { height: pr.height, viewportHeight: window.innerHeight });
    }

    const actions = document.querySelector('.actions');
    if (actions && primary) {
      const ar = actions.getBoundingClientRect();
      const pr = primary.getBoundingClientRect();
      check('Download PNG ocupa a largura principal no mobile', pr.width >= ar.width - 3,
        { primary: pr.width, actions: ar.width });
    }

    const carousel = document.getElementById('btnCarousel');
    if (carousel && !carousel.classList.contains('hide') && primary) {
      const primaryBg = getComputedStyle(primary).backgroundColor;
      const carouselBg = getComputedStyle(carousel).backgroundColor;
      check('Full Carousel é visualmente secundário ao PNG', primaryBg !== carouselBg,
        { primaryBg, carouselBg });
    }

    const moreToggle = document.querySelector('.export-more-toggle');
    check('Mais opções de exportação continua acessível em READY', !!moreToggle && getComputedStyle(moreToggle).display !== 'none');
  }

  check('sem overflow horizontal depois de carregar media', document.documentElement.scrollWidth <= window.innerWidth + 2,
    { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth });

  return { checks, totalHeight: document.body.scrollHeight };
})()
`;

async function main() {
  const server = await startServer(targetDir);
  const port = server.address().port;

  await session.defaultSession.clearStorageData({ storages: ['indexeddb', 'localstorage'] });

  const win = new BrowserWindow({
    width: 390,
    height: 844,
    show: false,
    webPreferences: { offscreen: true, contextIsolation: false, sandbox: false }
  });
  win.webContents.setFrameRate(30);
  win.webContents.setZoomFactor(1);
  win.webContents.on('paint', () => {});
  win.setContentSize(390, 844);
  await new Promise(r => setTimeout(r, 100));

  await win.loadURL('http://127.0.0.1:' + port + '/' + targetName);
  win.setContentSize(390, 844);
  win.webContents.setZoomFactor(1);
  await new Promise(r => setTimeout(r, 350));

  const shot1 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, targetName.replace('.html','') + '-mobile-topo.png'), shot1.toPNG());

  const report = await win.webContents.executeJavaScript(INSPECT_CODE, true);

  const shot2 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, targetName.replace('.html','') + '-mobile-depois.png'), shot2.toPNG());

  await win.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight * 0.35)');
  await new Promise(r => setTimeout(r, 200));
  const shot3 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, targetName.replace('.html','') + '-mobile-preview.png'), shot3.toPNG());

  server.close();

  const checks = report.checks || [];
  const failed = checks.filter(c => !c.pass);
  console.log('\n════════════════════════════════════════');
  console.log('Z STUDIO — MOBILE CENTER + INFORMATION FLOW CONTRACT (390×844) — ' + targetName);
  console.log('RESULTADO: ' + (checks.length - failed.length) + ' passaram, ' + failed.length + ' falharam (de ' + checks.length + ')');
  console.log('════════════════════════════════════════\n');
  checks.forEach(c => console.log((c.pass ? '✅ ' : '❌ ') + c.name + (c.pass ? '' : ' → ' + JSON.stringify(c.extra))));
  console.log('\nAltura total da página: ' + report.totalHeight + 'px');
  console.log('Screenshots guardadas em: ' + outDir);

  app.exit(failed.length > 0 ? 1 : 0);
}

app.whenReady().then(main);
