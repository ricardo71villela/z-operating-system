// Z STUDIO — laptop preview state + viewport regression contract
// Proves the failures caught by visual review cannot regress:
// - EMPTY never paints production title/price/badge over the placeholder;
// - restored media is LOADING until decoded, then READY;
// - export is disabled outside READY;
// - all five formats fit inside the creative column at a true 1440x900 content viewport.

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
app.commandLine.appendSwitch('force-device-scale-factor', '1');
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

const TEST_CODE = String.raw`
(async () => {
  const results = [];
  const assert = (name, cond, extra) => results.push({ name, pass: !!cond, extra: extra ?? null });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(450);

  assert(
    'harness abriu viewport laptop real',
    window.innerWidth >= 1380 && window.innerHeight >= 840,
    { innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio }
  );

  const runtime = window.ZStudioPreviewRuntime;
  assert('preview state authority carregada', !!runtime && runtime.authority === 'ZSTUDIO_PREVIEW_STATE_MACHINE_V1');
  if (!runtime) return results;

  const originalLoadImg = loadImg;
  const snapshot = {
    photos: state.photos,
    carPhotos: state.carPhotos,
    photo: state.photo,
    img: state.img,
    title: state.title,
    price: state.price,
    loc: state.loc,
    badge: state.badge,
    format: state.format
  };

  try {
    // 1. EMPTY is a distinct renderer state: placeholder only, no production copy.
    state.photos = [];
    state.carPhotos = [];
    state.photo = null;
    state.img = null;
    state.title = 'Moradia T4';
    state.price = '750 000€';
    state.loc = 'Porto';
    state.badge = 'UNDER OFFER';
    await runtime.hydrateActivePhoto('test-empty');

    const emptyCanvas = document.createElement('canvas');
    emptyCanvas.width = 1080;
    emptyCanvas.height = 1350;
    const emptyCtx = emptyCanvas.getContext('2d');
    const seenText = [];
    const baseFillText = emptyCtx.fillText.bind(emptyCtx);
    emptyCtx.fillText = function(text) {
      seenText.push(String(text));
      return baseFillText.apply(null, arguments);
    };
    await drawListing(emptyCtx, emptyCanvas.width, emptyCanvas.height);

    assert('EMPTY não pinta o título de produção', !seenText.includes('Moradia T4'), seenText);
    assert('EMPTY não pinta o preço de produção', !seenText.includes('750 000€'), seenText);
    assert('EMPTY não pinta o selo de produção', !seenText.some(t => t.includes('UNDER OFFER')), seenText);
    assert('EMPTY mantém texto de placeholder', seenText.some(t => /photo|foto|image|imagem/i.test(t)), seenText);

    const download = document.querySelector('[data-i18n="downloadPngBtn"]');
    assert('EMPTY bloqueia Download PNG', !!download && download.disabled === true);
    const nav = document.querySelector('.slide-nav');
    assert('EMPTY esconde navegação de slides', !nav || getComputedStyle(nav).display === 'none' || !nav.classList.contains('on'));

    // 2. Draft/media hydration is explicitly LOADING until decode completes.
    const mockImage = document.createElement('canvas');
    mockImage.width = 1080;
    mockImage.height = 1350;
    mockImage.getContext('2d').fillRect(0, 0, 1080, 1350);
    state.photos = ['mock://draft-photo'];
    state.carPhotos = ['mock://draft-photo'];
    state.photo = 'mock://draft-photo';
    state.img = null;

    let resolveDecode;
    loadImg = () => new Promise(resolve => { resolveDecode = resolve; });
    const hydration = runtime.hydrateActivePhoto('test-draft');
    await Promise.resolve();
    assert('draft com foto entra em LOADING antes do decode', runtime.getState() === runtime.states.LOADING, runtime.getState());
    assert('LOADING mantém export bloqueado', !!download && download.disabled === true);
    resolveDecode(mockImage);
    await hydration;
    assert('draft passa a READY depois do decode', runtime.getState() === runtime.states.READY, runtime.getState());
    assert('READY liga a imagem ativa', state.img === mockImage);
    assert('READY desbloqueia Download PNG', !!download && download.disabled === false);

    // 3. A decode failure is explicit ERROR, never a fake empty/ready state.
    state.img = null;
    loadImg = async () => { throw new Error('decode test failure'); };
    await runtime.hydrateActivePhoto('test-error');
    assert('falha de decode entra em ERROR', runtime.getState() === runtime.states.ERROR, runtime.getState());
    assert('ERROR bloqueia Download PNG', !!download && download.disabled === true);

    // Restore a valid decoded image for viewport tests.
    loadImg = async () => mockImage;
    state.img = mockImage;
    await runtime.hydrateActivePhoto('test-ready-fit');
    buildSlides(0);

    // 4. Runtime fit owns all canonical formats at 1440x900.
    const formats = ['feed45', 'square', 'story', 'wide', 'pin'];
    for (const format of formats) {
      setFormat(format);
      await sleep(35);
      runtime.fit();
      await sleep(20);

      const preview = document.getElementById('preview');
      const frame = document.querySelector('.canvas-frame');
      const stage = document.querySelector('.stage');
      const actions = document.querySelector('.actions');
      const footer = document.querySelector('.site-footer');
      const pr = preview.getBoundingClientRect();
      const fr = frame.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      const ar = actions.getBoundingClientRect();
      const footerTop = footer ? footer.getBoundingClientRect().top : window.innerHeight;

      assert(format + ': preview fica dentro do stage', pr.left >= sr.left - 1 && pr.right <= sr.right + 1 && pr.top >= sr.top - 1 && pr.bottom <= sr.bottom + 1, { pr, sr });
      assert(format + ': frame não atravessa o footer', fr.bottom <= footerTop + 1, { fr, footerTop });
      assert(format + ': export não atravessa o footer', ar.bottom <= footerTop + 1, { ar, footerTop });
    }

    const htmlOverflow = getComputedStyle(document.documentElement).overflowY;
    const bodyOverflow = getComputedStyle(document.body).overflowY;
    assert(
      'workspace fixa o documento e delega scroll ao rail',
      ['hidden', 'clip'].includes(htmlOverflow) && ['hidden', 'clip'].includes(bodyOverflow),
      {
        htmlOverflow,
        bodyOverflow,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        innerHeight: window.innerHeight
      }
    );
    assert('runtime fit authority aplicada', document.documentElement.getAttribute('data-zstudio-preview-fit') === 'runtime-v1');
  } catch (error) {
    assert('preview state contract executa sem exceção', false, error.message + ' | ' + error.stack);
  } finally {
    loadImg = originalLoadImg;
    state.photos = snapshot.photos;
    state.carPhotos = snapshot.carPhotos;
    state.photo = snapshot.photo;
    state.img = snapshot.img;
    state.title = snapshot.title;
    state.price = snapshot.price;
    state.loc = snapshot.loc;
    state.badge = snapshot.badge;
    if (snapshot.format) setFormat(snapshot.format);
  }

  return results;
})()
`;

async function main() {
  const server = await startServer(targetDir);
  const port = server.address().port;
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, contextIsolation: false, sandbox: false }
  });
  win.setContentSize(1440, 900, false);
  win.webContents.setZoomFactor(1);
  win.webContents.setFrameRate(30);
  win.webContents.on('paint', () => {});

  await win.loadURL('http://127.0.0.1:' + port + '/' + targetName);
  win.setContentSize(1440, 900, false);
  let results;
  try {
    results = await win.webContents.executeJavaScript(TEST_CODE, true);
  } catch (error) {
    results = [{ name: 'execução do contrato', pass: false, extra: String(error) }];
  }

  server.close();
  const failed = results.filter(r => !r.pass);
  console.log('\n════════════════════════════════════════');
  console.log('Z STUDIO — PREVIEW STATE + VIEWPORT CONTRACT');
  console.log('RESULTADO: ' + (results.length - failed.length) + ' passaram, ' + failed.length + ' falharam (de ' + results.length + ')');
  console.log('════════════════════════════════════════\n');
  results.forEach(r => console.log((r.pass ? '✅ ' : '❌ ') + r.name + (r.pass ? '' : ' → ' + JSON.stringify(r.extra))));
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(main);
