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
    // Golden content language is explicitly PT.
    // App first-run language must not silently redefine golden authority.
    setLang('pt');
    function mkPhoto(seed) {
      const c = document.createElement('canvas'); c.width = 1000; c.height = 1000;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0,0,1000,1000);
      g.addColorStop(0, seed); g.addColorStop(1, '#1a1008');
      ctx.fillStyle = g; ctx.fillRect(0,0,1000,1000);
      return new Promise(res => c.toBlob(b => res(new File([b], 'golden.png', {type:'image/png'})), 'image/png'));
    }
    window.__mkPhoto = mkPhoto;

    // ZSTUDIO_P1_2_WIDE_PORTRAIT_VISUAL_GOLDENS_V1
    // Deterministic portrait fixtures for the approved Wide portrait path.
    function mkSizedPhoto(seed, width, height, filename) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, seed);
      g.addColorStop(1, '#1a1008');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);

      // Fixed reference lines make crop/contain regressions visually obvious.
      ctx.strokeStyle = 'rgba(255,255,255,0.24)';
      ctx.lineWidth = Math.max(2, width / 320);
      for (let i = 1; i < 6; i++) {
        const x = width * i / 6;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let i = 1; i < 8; i++) {
        const y = height * i / 8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      return new Promise(res =>
        c.toBlob(
          b => res(
            new File(
              [b],
              filename,
              { type: 'image/png' }
            )
          ),
          'image/png'
        )
      );
    }

    window.__mkSizedPhoto = mkSizedPhoto;

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

  // 6) P1.2 — Wide portrait Cinematic Right V2.
  // Two portrait source ratios × three single-photo templates.
  // These six goldens are the persistent visual authority for P1.2.
  for (const source of [
    {
      key: 'portrait916',
      width: 900,
      height: 1600,
      seed: '#394a88'
    },
    {
      key: 'portrait45',
      width: 1000,
      height: 1250,
      seed: '#69732f'
    }
  ]) {
    await win.webContents.executeJavaScript(`(async () => {
      const file = await window.__mkSizedPhoto(
        '${source.seed}',
        ${source.width},
        ${source.height},
        'golden-${source.key}.png'
      );

      const url = URL.createObjectURL(file);

      state.photos = [url];
      state.carPhotos = [url];
      state.photo = url;
      state.img = await loadImg(url);

      state.format = 'wide';
      state.title = 'Golden Wide Portrait';
      state.price = '123.456€';
      state.loc = 'Porto';
      state.badge = 'Golden Badge';
      state.showSpecs = true;
      state.cropAdjust = {};
      state.filter = 'auto';
      state.smartCrop = true;
      state.bg = 'dark';

      state._styleCustomized = true;
      state.brand.accent = '#B8935A';
      setGoldVar('#B8935A');

      state.category = 'generico';
      onSpecChange(0, 'Valor A');
      onSpecChange(1, 'Valor B');
      onSpecChange(2, 'Valor C');
      onSpecChange(3, 'Valor D');
    })()`, true);

    for (const tpl of [
      'classico',
      'editorial',
      'minimalista'
    ]) {
      await win.webContents.executeJavaScript(
        `setTemplate('${tpl}');`,
        true
      );

      await shot(
        win,
        `wide-${source.key}-${tpl}`
      );
    }
  }

  // 7) estado vazio (placeholder)
  await win.webContents.executeJavaScript(`(async () => {
    const originalConfirm = window.confirm; window.confirm = () => true;
    clearDraft(); await new Promise(r=>setTimeout(r,200));
    window.confirm = originalConfirm;
  })()`, true);
  await shot(win, 'estado-vazio');

  app.exit(0);
}
app.whenReady().then(main);
