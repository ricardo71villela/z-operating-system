// ═══════════════════════════════════════════════════════════════════════
//  MY STUDIO — VERIFICAÇÃO DE VIEWPORT DE TELEMÓVEL
// ═══════════════════════════════════════════════════════════════════════
//
// Abre a app num Chromium real a 390×844 (tamanho típico de telemóvel),
// procura overflow horizontal (a causa mais comum de "scroll lateral
// estranho" em telemóvel), testa o cabeçalho, os separadores, o modal
// de produção em massa, e tira screenshots reais para revisão visual.
//
// USO:
//   npm run test:mobile                 → testa studio.html
//   npm run test:mobile:agente          → testa a versão de agente
//
// As screenshots ficam em ./test-output/
// ═══════════════════════════════════════════════════════════════════════

const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
app.disableHardwareAcceleration();
// Nota: --no-sandbox e --ozone-platform=headless têm de ser passados como
// flags reais na linha de comandos (já estão nos scripts do package.json).

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
function startServer(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
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
  await sleep(500);
  const checks = [];
  const check = (name, pass, extra) => checks.push({ name, pass, extra });

  check('sem overflow horizontal na página (documentElement)', document.documentElement.scrollWidth <= window.innerWidth + 2,
    { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth });
  check('sem overflow horizontal no body', document.body.scrollWidth <= window.innerWidth + 2,
    { scrollWidth: document.body.scrollWidth, innerWidth: window.innerWidth });

  const header = document.querySelector('header');
  if (header) check('cabeçalho cabe no ecrã sem cortar', header.scrollWidth <= header.clientWidth + 2,
    { scrollWidth: header.scrollWidth, clientWidth: header.clientWidth });

  const canvasFrame = document.querySelector('.canvas-frame');
  if (canvasFrame) {
    const r = canvasFrame.getBoundingClientRect();
    check('pré-visualização cabe no ecrã sem cortar à direita', r.right <= window.innerWidth + 2, { right: r.right, viewport: window.innerWidth });
  }

  // testar o modal de produção em massa, se existir
  if (typeof toggleRealEstateModule === 'function' && typeof openBulk === 'function') {
    toggleRealEstateModule(true); await sleep(80);
    openBulk(); await sleep(150);
    const modal = document.querySelector('#bulkOverlay > div');
    if (modal) {
      const r = modal.getBoundingClientRect();
      check('modal de produção em massa cabe no ecrã', r.left >= -2 && r.right <= window.innerWidth + 2, { left: r.left, right: r.right });
    }
    closeBulk(); toggleRealEstateModule(false);
  }

  // testar toque numa foto depois de a tornar "arrastável" (verificar que não há conflito no telemóvel)
  if (typeof handleUploadFiles === 'function') {
    function makeTestFile(name, w, h, color) {
      const c = document.createElement('canvas'); c.width=w; c.height=h;
      const ctx = c.getContext('2d'); ctx.fillStyle=color; ctx.fillRect(0,0,w,h);
      return new Promise(res => c.toBlob(b => res(new File([b], name, {type:'image/png'})), 'image/png'));
    }
    const f1 = await makeTestFile('a.png', 800, 600, '#336699');
    const f2 = await makeTestFile('b.png', 800, 600, '#996633');
    await handleUploadFiles([f1, f2]); await sleep(200);
    const tile = document.querySelectorAll('#photoGrid .ph')[1];
    if (tile) {
      tile.querySelector('img').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(100);
      check('tocar numa foto seleciona-a (sem conflito com "arrastar")', state.photo === state.photos[1]);
    }
    document.getElementById('fTitle').value = 'Apartamento T2 com vista rio';
    state.title = 'Apartamento T2 com vista rio';
    document.getElementById('fPrice').value = '295.000€'; state.price = '295.000€';
    draw();
  }

  return { checks, totalHeight: document.body.scrollHeight };
})()
`;

async function main() {
  const server = await startServer(targetDir);
  const port = server.address().port;

  const win = new BrowserWindow({
    width: 390, height: 844, show: false,
    webPreferences: { offscreen: true, contextIsolation: false, sandbox: false }
  });
  win.webContents.setFrameRate(30);
  win.webContents.on('paint', () => {});
  win.setContentSize(390, 844);
  await new Promise(r => setTimeout(r, 100));

  await win.loadURL('http://127.0.0.1:' + port + '/' + targetName);
  await new Promise(r => setTimeout(r, 300));

  const shot1 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, targetName.replace('.html','') + '-mobile-topo.png'), shot1.toPNG());

  const report = await win.webContents.executeJavaScript(INSPECT_CODE, true);

  const shot2 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, targetName.replace('.html','') + '-mobile-depois.png'), shot2.toPNG());

  // screenshot a rolar até ao fundo, para ver a pré-visualização e as ações
  await win.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight * 0.35)');
  await new Promise(r => setTimeout(r, 200));
  const shot3 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, targetName.replace('.html','') + '-mobile-preview.png'), shot3.toPNG());

  server.close();

  const checks = report.checks || [];
  const failed = checks.filter(c => !c.pass);
  console.log('\n════════════════════════════════════════');
  console.log('MY STUDIO — verificação de telemóvel (390×844) — ' + targetName);
  console.log('════════════════════════════════════════\n');
  checks.forEach(c => console.log((c.pass ? '✅' : '❌') + ' ' + c.name + (c.pass ? '' : '  →  ' + JSON.stringify(c.extra))));
  console.log('\nAltura total da página: ' + report.totalHeight + 'px');
  console.log('Screenshots guardadas em: ' + outDir);

  app.exit(failed.length > 0 ? 1 : 0);
}

app.whenReady().then(main);
