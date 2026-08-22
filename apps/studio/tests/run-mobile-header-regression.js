// ═══════════════════════════════════════════════════════════════════════
// Z STUDIO — MOBILE HEADER GEOMETRY CONTRACT
// ═══════════════════════════════════════════════════════════════════════
// Measures the real rendered header at 390×844. This contract exists because
// a legacy runtime style once reduced Bulk Generation to an icon-sized box
// while leaving its label overflowing and split Sign In / language too far apart.

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

if (!fs.existsSync(targetPath)) {
  console.error('❌ Não encontrei o ficheiro: ' + targetPath);
  process.exit(1);
}

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
  const waitFor = async (fn, timeout = 2200) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (fn()) return true;
      await sleep(40);
    }
    return false;
  };

  await waitFor(() => document.documentElement.getAttribute('data-zstudio-mobile-flow') === 'v2');
  await waitFor(() => !!document.getElementById('zstudioAuthButton'));
  await sleep(220);

  const checks = [];
  const check = (name, pass, extra) => checks.push({ name, pass: !!pass, extra: extra ?? null });
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
  };

  const header = document.querySelector('header');
  const brand = document.querySelector('header .brand');
  const actions = document.querySelector('header .header-actions');
  const bulk = document.getElementById('btnHeaderBulk');
  const auth = document.getElementById('zstudioAuthButton');
  const langWrap = document.querySelector('header .lang-switch');
  const lang = document.getElementById('langSwitch');
  const firstTextInput = document.querySelector('.controls input[type="text"]');
  const mediaLabel = document.querySelector('#mediaStep .step-label');

  check('header controls existem', !!header && !!brand && !!actions && !!bulk && !!auth && !!langWrap && !!lang,
    { header:!!header, brand:!!brand, actions:!!actions, bulk:!!bulk, auth:!!auth, langWrap:!!langWrap, lang:!!lang });
  if (!header || !brand || !actions || !bulk || !auth || !langWrap || !lang) return checks;

  const hr = rect(header), br = rect(brand), ar = rect(actions), bur = rect(bulk), aur = rect(auth), lwr = rect(langWrap), lr = rect(lang);
  const gap = lr.left - aur.right;

  check('viewport real é 390×844', window.innerWidth === 390 && window.innerHeight === 844,
    { width:window.innerWidth, height:window.innerHeight });
  check('header não cria overflow horizontal', document.documentElement.scrollWidth <= window.innerWidth + 2,
    { scrollWidth:document.documentElement.scrollWidth, innerWidth:window.innerWidth });
  check('Bulk Generation ocupa a barra útil inteira', bur.width >= 330 && bur.left >= 8 && bur.right <= window.innerWidth - 8,
    bur);
  check('texto de Bulk Generation fica contido no próprio botão', bulk.scrollWidth <= bulk.clientWidth + 1,
    { scrollWidth:bulk.scrollWidth, clientWidth:bulk.clientWidth, text:bulk.textContent.trim() });
  check('Bulk Generation não é um botão icon-only residual', parseFloat(getComputedStyle(bulk).fontSize) >= 9,
    { fontSize:getComputedStyle(bulk).fontSize });
  check('Sign In e idioma formam um cluster compacto', lwr.width >= 190 && lwr.width <= 255 && lwr.right <= window.innerWidth - 8,
    lwr);
  check('Sign In e idioma estão na mesma linha', Math.abs(aur.top - lr.top) <= 2 && Math.abs(aur.height - lr.height) <= 2,
    { auth:aur, lang:lr });
  check('gap Sign In → idioma é curto e deliberado', gap >= 6 && gap <= 12,
    { gap, authRight:aur.right, langLeft:lr.left });
  check('Sign In tem largura útil real', aur.width >= 120,
    aur);
  check('idioma mantém largura compacta', lr.width >= 58 && lr.width <= 72,
    lr);
  check('cluster Sign In/idioma está alinhado à direita', Math.abs(lwr.right - ar.right) <= 2,
    { langWrapRight:lwr.right, actionsRight:ar.right });
  check('logo/identidade continuam numa barra própria', br.bottom <= bur.top - 4,
    { brand:br, bulk:bur });

  const borderTargets = [bulk, auth, lang, firstTextInput].filter(Boolean);
  check('molduras principais usam espessura óptica de 1px', borderTargets.every(el => getComputedStyle(el).borderTopWidth === '1px'),
    borderTargets.map(el => ({ id:el.id || el.tagName, border:getComputedStyle(el).borderTopWidth })));

  if (mediaLabel) {
    const accent = getComputedStyle(mediaLabel, '::after').backgroundImage;
    check('linha de secção usa gradiente de marca sem colorir o texto', accent.includes('linear-gradient') && getComputedStyle(mediaLabel).color !== 'transparent',
      { accent, textColor:getComputedStyle(mediaLabel).color });
  }

  return checks;
})()
`;

let server;
app.whenReady().then(async () => {
  server = await startServer(targetDir);
  const port = server.address().port;
  const ses = session.fromPartition('persist:zstudio-mobile-header-contract-' + Date.now());
  await ses.clearStorageData();

  const win = new BrowserWindow({
    show: false,
    width: 390,
    height: 844,
    useContentSize: true,
    webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false }
  });

  await win.loadURL(`http://127.0.0.1:${port}/${encodeURIComponent(targetName)}`);
  const checks = await win.webContents.executeJavaScript(INSPECT_CODE, true);
  const failed = checks.filter(c => !c.pass);

  console.log('\n════════════════════════════════════════');
  console.log('Z STUDIO — MOBILE HEADER GEOMETRY CONTRACT (390×844)');
  console.log(`RESULTADO: ${checks.length - failed.length} passaram, ${failed.length} falharam (de ${checks.length})`);
  console.log('════════════════════════════════════════\n');
  checks.forEach(c => console.log(`${c.pass ? '✅' : '❌'} ${c.name}${c.pass || c.extra == null ? '' : ' → ' + JSON.stringify(c.extra)}`));

  win.destroy();
  server.close();
  if (failed.length) process.exitCode = 1;
  app.quit();
}).catch(err => {
  console.error(err);
  if (server) server.close();
  process.exitCode = 1;
  app.quit();
});
