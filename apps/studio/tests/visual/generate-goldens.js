const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

const OUT = process.env.MYSTUDIO_GOLDENS_OUT || path.join(__dirname, '..', '..', 'goldens');
fs.mkdirSync(OUT, { recursive: true });

async function shot(win, name) {
  await win.webContents.executeJavaScript('draw()', true);
  await new Promise(r => setTimeout(r, 250));
  const canvas = await win.webContents.executeJavaScript(`document.getElementById('preview').toDataURL('image/png')`, true);
  const base64 = canvas.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(base64, 'base64'));
  console.log('golden:', name);
}

async function main() {
  const win = new BrowserWindow({ width: 1000, height: 900, show: false, webPreferences: { offscreen: true, contextIsolation: false, sandbox: false } });
  win.webContents.setFrameRate(30);
  win.webContents.on('paint', () => {});
  await win.loadURL(process.env.MYSTUDIO_URL || 'http://localhost:8791/my-studio.html');
  await new Promise(r => setTimeout(r, 500));

  // conteúdo sintético determinístico — mesma "foto" (gradiente fixo) sempre
  await win.webContents.executeJavaScript(`(async () => {
    function mkPhoto(seed) {
      const c = document.createElement('canvas'); c.width = 1000; c.height = 1000;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0,0,1000,1000);
      g.addColorStop(0, seed); g.addColorStop(1, '#1a1008');
      ctx.fillStyle = g; ctx.fillRect(0,0,1000,1000);
      return new Promise(res => c.toBlob(b => res(new File([b], 'golden.png', {type:'image/png'})), 'image/png'));
    }
    window.__mkPhoto = mkPhoto;
    const f = await mkPhoto('#8a5a2a');
    await handleUploadFiles([f]);
    document.getElementById('fTitle').value = 'Golden Reference Title'; state.title = 'Golden Reference Title';
    document.getElementById('fPrice').value = '123.456€'; state.price = '123.456€';
    document.getElementById('fLoc').value = 'Porto'; state.loc = 'Porto';
    document.getElementById('fBadge').value = 'Golden Badge'; state.badge = 'Golden Badge';
    onSpecChange(0, 'Valor A'); onSpecChange(1, 'Valor B'); onSpecChange(2, 'Valor C'); onSpecChange(3, 'Valor D');
    state._styleCustomized = true; // não deixar a paleta automática interferir nos goldens
    state.brand.accent = '#B8935A'; setGoldVar('#B8935A');
  })()`, true);
  await new Promise(r => setTimeout(r, 300));

  // 1) todos os formatos × Clássico
  for (const fmt of ['feed45','square','story','wide','pin']) {
    await win.webContents.executeJavaScript(`setFormat('${fmt}'); setTemplate('classico');`, true);
    await shot(win, `formato-${fmt}-classico`);
  }

  // 2) todos os templates × Feed 4:5 (exceto colagem/antesdepois, tratados à parte)
  await win.webContents.executeJavaScript(`setFormat('feed45');`, true);
  for (const tpl of ['classico','editorial','minimalista']) {
    await win.webContents.executeJavaScript(`setTemplate('${tpl}');`, true);
    await shot(win, `template-${tpl}-feed45`);
  }

  // 3) Colagem com 2, 4, 6, 8 fotos
  await win.webContents.executeJavaScript(`(async () => {
    const cores = ['#a04','#0a4','#04a','#aa4','#a4a','#0aa','#555','#fa5'];
    const files = await Promise.all(cores.map((c,i) => window.__mkPhoto(c)));
    await handleUploadFiles(files);
    setTemplate('colagem');
  })()`, true);
  for (const n of [2,4,6,8]) {
    await win.webContents.executeJavaScript(`state.carPhotos = state.photos.slice(-${n});`, true);
    await shot(win, `colagem-${n}fotos`);
  }

  // 4) Antes/Depois
  await win.webContents.executeJavaScript(`state.carPhotos = state.photos.slice(-2); setTemplate('antesdepois');`, true);
  await shot(win, 'antesdepois');

  // 5) categorias específicas
  await win.webContents.executeJavaScript(`(async () => {
    setTemplate('classico');
    state.carPhotos = [state.photo];
    applyCategoryPreset('imoveis'); state._styleCustomized = true; state.brand.accent='#B8935A'; setGoldVar('#B8935A');
    onSpecChange(0,'120'); pickEnergyRating('A');
  })()`, true);
  await shot(win, 'categoria-imoveis-certificado');

  await win.webContents.executeJavaScript(`(async () => {
    applyCategoryPreset('viagens'); state._styleCustomized = true; state.brand.accent='#B8935A'; setGoldVar('#B8935A');
    pickStarRating(4);
  })()`, true);
  await shot(win, 'categoria-viagens-estrelas');

  await win.webContents.executeJavaScript(`(async () => {
    applyCategoryPreset('gastronomia'); state._styleCustomized = true; state.brand.accent='#B8935A'; setGoldVar('#B8935A');
    toggleAllergen('gluten'); toggleAllergen('lactose');
  })()`, true);
  await shot(win, 'categoria-gastronomia-alergenios');

  await win.webContents.executeJavaScript(`(async () => {
    applyCategoryPreset('moda'); state._styleCustomized = true; state.brand.accent='#B8935A'; setGoldVar('#B8935A');
    toggleSize('M'); toggleSize('L');
  })()`, true);
  await shot(win, 'categoria-moda-tamanhos');

  // 6) estado vazio (placeholder)
  await win.webContents.executeJavaScript(`(async () => {
    const originalConfirm = window.confirm; window.confirm = () => true;
    clearDraft(); await new Promise(r=>setTimeout(r,200));
    window.confirm = originalConfirm;
  })()`, true);
  await shot(win, 'estado-vazio');

  app.exit(0);
}
app.whenReady().then(main);
