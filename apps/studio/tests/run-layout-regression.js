// Z STUDIO — renderer layout regression contract
// Runs inside Electron against the built app and verifies the geometry that
// previously caused badge/title overlap and right-edge brand clipping.

const { app, BrowserWindow } = require('electron');
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

if (!fs.existsSync(targetPath)) {
  console.error('❌ Não encontrei o ficheiro: ' + targetPath);
  process.exit(1);
}

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

function startServer(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(dir, pathname);
      if (!filePath.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        const ext = path.extname(filePath);
        const mime = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const TEST_CODE = `
(async () => {
  const results = [];
  const assert = (name, cond, extra) => results.push({ name, pass: !!cond, extra: extra ?? null });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(350);

  const snap = {
    lang: state.lang,
    badge: state.badge,
    title: state.title,
    price: state.price,
    loc: state.loc,
    showWatermark: state.brand.showWatermark,
    logoUrl: state.brand.logoUrl
  };

  try {
    assert('layout guard marker carregado', typeof getGridTextBandLayout === 'function' && typeof getLogoSafeLayout === 'function');

    state.lang = 'pt';
    state.badge = 'GOLDEN BADGE';
    state.title = 'Golden Reference Title';
    state.price = '450.000€';
    state.loc = 'Porto';
    state.brand.showWatermark = true;
    state.brand.logoUrl = null;
    brandLogoImg = null;

    const feed = document.createElement('canvas');
    feed.width = 1080; feed.height = 1350;
    const fctx = feed.getContext('2d');
    const feedLayout = getGridTextBandLayout(fctx, 1080, 1350, 1350 - 230, 1, false);
    assert('Feed: título começa pelo menos 12px abaixo do badge', feedLayout.gap >= 12, feedLayout);
    assert('Feed: localização fica acima do rodapé com folga', feedLayout.locationY <= feedLayout.footerY - 28, feedLayout);

    const story = document.createElement('canvas');
    story.width = 1080; story.height = 1920;
    const sctx = story.getContext('2d');
    const storyLayout = getGridTextBandLayout(sctx, 1080, 1920, 1920 - 300, 1, true);
    assert('Story: título começa pelo menos 12px abaixo do badge', storyLayout.gap >= 12, storyLayout);
    assert('Story: localização fica acima do rodapé com folga', storyLayout.locationY <= storyLayout.footerY - 28, storyLayout);

    const requestedCx = 1080 - 118;
    const logoLayout = getLogoSafeLayout(fctx, requestedCx, 0.72);
    assert('branding da direita é deslocado para dentro quando necessário', logoLayout.cx <= requestedCx, logoLayout);
    assert('branding nunca ultrapassa a margem direita', logoLayout.cx + logoLayout.halfWidth + logoLayout.margin <= 1080 + 0.5, logoLayout);
    assert('branding nunca ultrapassa a margem esquerda', logoLayout.cx - logoLayout.halfWidth - logoLayout.margin >= -0.5, logoLayout);

    const P = pal();
    drawGridTextBand(fctx, 1080, 1350, P, 1350 - 230, 1, false, 'Porto');
    drawLogo(fctx, requestedCx, 118, 0.72, P.overPhoto);
    assert('renderer corrigido desenha sem exceção', true);
  } catch (e) {
    assert('contrato de layout executa sem exceção', false, e.message + ' | ' + e.stack);
  } finally {
    state.lang = snap.lang;
    state.badge = snap.badge;
    state.title = snap.title;
    state.price = snap.price;
    state.loc = snap.loc;
    state.brand.showWatermark = snap.showWatermark;
    state.brand.logoUrl = snap.logoUrl;
  }

  return results;
})()
`;

async function main() {
  const server = await startServer(targetDir);
  const port = server.address().port;
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    webPreferences: { offscreen: true, contextIsolation: false, sandbox: false }
  });
  win.webContents.setFrameRate(30);
  win.webContents.on('paint', () => {});

  await win.loadURL('http://127.0.0.1:' + port + '/' + targetName);
  let results;
  try {
    results = await win.webContents.executeJavaScript(TEST_CODE, true);
  } catch (e) {
    results = [{ name: 'execução do contrato', pass: false, extra: String(e) }];
  }

  server.close();
  const failed = results.filter(r => !r.pass);
  console.log('\n════════════════════════════════════════');
  console.log('Z STUDIO — RENDERER LAYOUT CONTRACT');
  console.log('RESULTADO: ' + (results.length - failed.length) + ' passaram, ' + failed.length + ' falharam (de ' + results.length + ')');
  console.log('════════════════════════════════════════\n');
  results.forEach(r => console.log((r.pass ? '✅ ' : '❌ ') + r.name + (r.pass ? '' : ' → ' + JSON.stringify(r.extra))));
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(main);
