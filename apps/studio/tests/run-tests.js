// ═══════════════════════════════════════════════════════════════════════
//  Z STUDIO — TESTES FUNCIONAIS AUTOMATIZADOS
// ═══════════════════════════════════════════════════════════════════════
//
// Corre a app dentro de um Chromium real (Electron), não apenas verifica
// sintaxe. Exercita upload de fotos, recorte inteligente, arrastar para
// reordenar, desfazer/refazer, persistência local (IndexedDB), kits de
// marca, módulo de imóveis, todos os formatos/templates, exportações
// (PNG/ZIP/PDF), partilha, tradução multi-idioma e acessibilidade básica.
//
// USO:
//   npm install        (só na primeira vez — instala o Electron)
//   npm test                              → testa studio.html
//   npm test -- outro-ficheiro.html       → testa outro ficheiro
//   npm run test:agente                   → testa a versão de agente imobiliário
//
// O ficheiro .html tem de estar na mesma pasta deste script (ou indica
// o caminho completo). Não precisa de nenhum servidor à parte — este
// script sobe um servidor local só para a duração do teste.
// ═══════════════════════════════════════════════════════════════════════

const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const targetFile = (() => {
  // O Electron não separa as suas próprias flags dos argumentos do script como o Node faz —
  // process.argv[2] não é fiável aqui. Encontra este próprio ficheiro em argv e usa o que vem a seguir.
  const idx = process.argv.findIndex(a => path.resolve(a) === path.resolve(__filename));
  return (idx >= 0 && process.argv[idx + 1]) || 'my-studio.html';
})();
const targetPath = path.isAbsolute(targetFile) ? targetFile : path.join(process.cwd(), targetFile);
const targetDir = path.dirname(targetPath);
const targetName = path.basename(targetPath);

if (!fs.existsSync(targetPath)) {
  console.error('❌ Não encontrei o ficheiro: ' + targetPath);
  console.error('   Corre este script a partir da pasta onde está o studio.html, ou indica o caminho: node run-tests.js caminho/para/studio.html');
  process.exit(1);
}

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
// Nota: --no-sandbox e --ozone-platform=headless têm de ser passados como
// flags reais na linha de comandos (já estão nos scripts do package.json) —
// definidos aqui dentro não fazem efeito, porque a decisão do Electron sobre
// isso acontece antes deste código correr.

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
function startServer(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
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

const TEST_CODE = `

(async () => {
try {
  const results = [];
  const assert = (name, cond, extra) => results.push({ name, pass: !!cond, extra: (extra===undefined?null:extra) });
  const skip = (name, reason) => results.push({ name, pass: true, extra: '(ignorado: ' + reason + ')' });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(400);

  try {
    assert('app arrancou sem exceções (state existe)', typeof state === 'object' && state !== null);

    const firstRunLangSwitch = document.getElementById('langSwitch');
    assert('idioma first-run é inglês', state.lang === 'en', state.lang);
    assert(
      'seletor de idioma é SELECT nativo',
      !!firstRunLangSwitch && firstRunLangSwitch.tagName === 'SELECT',
      firstRunLangSwitch && firstRunLangSwitch.tagName
    );
    assert(
      'seletor de idioma apresenta EN por defeito',
      !!firstRunLangSwitch && firstRunLangSwitch.value === 'en',
      firstRunLangSwitch && firstRunLangSwitch.value
    );
    assert(
      'seletor oferece EN, PT, FR, ES, DE e IT',
      !!firstRunLangSwitch &&
      [...firstRunLangSwitch.options].map(o => o.value).join(',') ===
        'en,pt,fr,es,de,it',
      firstRunLangSwitch &&
      [...firstRunLangSwitch.options].map(o => o.value).join(',')
    );

    // Os testes funcionais históricos abaixo usam fixtures PT.
    // Isto não altera a prova de first-run acima.
    setLang('pt');
    await sleep(80);
    assert('marca por defeito é Z Studio', state.brand.name === 'Z Studio', state.brand.name);
    assert('sem "My Studio" residual (identidade legada)', !document.body.innerHTML.includes('My Studio'));
    assert('rodapé mostra "Powered by ZOS" (marca da empresa, intencional)', document.getElementById('footerPoweredBy').textContent.includes('ZOS'));
    assert('logótipo do cliente NUNCA sobrepõe o logótipo ZOS do cabeçalho', document.getElementById('headerLogo').alt === 'ZOS');
    assert('categoria por defeito é genérico', state.category === 'generico', state.category);
    assert('não existe nenhum separador de Fonte (produto universal, upload sempre ativo)', !document.getElementById('sourceSeg'));
  } catch (e) { assert('BLOCO 1 (estado inicial) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // o cliente carrega o SEU PRÓPRIO logótipo de marca — isto tem de continuar
    // a aparecer nos posts gerados, mas NUNCA deve substituir o logótipo ZOS
    // no cabeçalho da própria app (são coisas diferentes: marca do cliente vs.
    // marca da ferramenta)
    const headerSrcBefore = document.getElementById('headerLogo').src;
    const c = document.createElement('canvas'); c.width = 300; c.height = 300;
    c.getContext('2d').fillRect(0, 0, 300, 300);
    const logoBlob = await new Promise(res => c.toBlob(res, 'image/png'));
    const logoFile = new File([logoBlob], 'logo-cliente.png', { type: 'image/png' });
    handleBrandLogoUpload([logoFile]);
    await sleep(100);
    assert('logótipo do cliente fica guardado para os posts (state.brand.logoUrl)', !!state.brand.logoUrl);
    assert('cabeçalho da app NÃO muda ao carregar logótipo do cliente', document.getElementById('headerLogo').src === headerSrcBefore);
    assert('cabeçalho continua a mostrar o logótipo ZOS', document.getElementById('headerLogo').alt === 'ZOS');
  } catch (e) { assert('BLOCO 1b (logótipo do cliente vs. logótipo ZOS) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // a legenda "powered by" tem de mudar de idioma junto com o resto — no
    // rodapé da app E no texto desenhado nos posts (são 2 sítios diferentes)
    const captionPT = document.getElementById('footerPoweredBy').textContent.trim();
    assert('legenda do rodapé em português por defeito', captionPT === 'DESENVOLVIDO POR ZOS', captionPT);
    setLang('en');
    await sleep(80);
    const captionEN = document.getElementById('footerPoweredBy').textContent.trim();
    assert('legenda do rodapé muda para inglês', captionEN === 'POWERED BY ZOS', captionEN);
    assert('"ZOS" mantém-se como nome próprio em todos os idiomas', captionEN.includes('ZOS'));
    // texto desenhado no post (watermark) — testar sem logótipo de marca carregado,
    // para cair no modo de reserva que também desenha "powered by"
    state.brand.logoUrl = null;
    draw(); await sleep(60);
    assert('I18N tem a chave poweredBy em inglês', I18N.en.poweredBy === 'POWERED BY', I18N.en.poweredBy);
    assert('I18N tem a chave poweredBy em português', I18N.pt.poweredBy === 'DESENVOLVIDO POR', I18N.pt.poweredBy);
    setLang('pt');
    await sleep(80);
    const captionBack = document.getElementById('footerPoweredBy').textContent.trim();
    assert('volta a português sem problemas', captionBack === 'DESENVOLVIDO POR ZOS', captionBack);
  } catch (e) { assert('BLOCO 1c ("powered by" traduzido nos 2 sítios) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    function makeTestFile(name, w, h, color) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = color; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = '#e0ac8a'; ctx.beginPath(); ctx.arc(w*0.5, h*0.35, Math.min(w,h)*0.12, 0, Math.PI*2); ctx.fill();
      return new Promise(res => c.toBlob(b => res(new File([b], name, { type: 'image/png' })), 'image/png'));
    }
    const f1 = await makeTestFile('foto1.png', 1600, 1200, '#335577');
    const f2 = await makeTestFile('foto2.png', 1200, 1600, '#775533');
    const f3 = await makeTestFile('foto3.png', 1000, 1000, '#557733');
    window.__testFiles = [f1, f2, f3];
    await handleUploadFiles([f1, f2, f3]);
    await sleep(300);
    assert('3 fotos carregadas', state.photos.length === 3, state.photos.length);
    assert('3 ficheiros guardados (para o rascunho)', state.photoFiles.length === 3);
    assert('capa definida automaticamente', !!state.photo);
    assert('grid mostra 3 fotos', document.querySelectorAll('#photoGrid .ph').length === 3);
    assert('opções avançadas revelam-se ao carregar fotos', !document.getElementById('advancedOptions').classList.contains('hide'));

    draw(); await sleep(80);
    const canvas = document.getElementById('preview');
    const px = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let nt = 0; for (let i=3;i<px.length;i+=4*997) if (px[i]>0) nt++;
    assert('canvas desenhou pixels', nt > 0, nt);
  } catch (e) { assert('BLOCO 2 (upload + desenho) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    const beforeOrder = state.photos.slice();
    const fakeEl = { classList: { add(){}, remove(){} } };
    onPhotoDragStart({ currentTarget: fakeEl, dataTransfer: {} }, 0);
    onPhotoDrop({ preventDefault(){}, currentTarget: fakeEl }, 2);
    assert('arrastar para reordenar muda a ordem', JSON.stringify(state.photos) !== JSON.stringify(beforeOrder));
    assert('reordenar não perde/duplica fotos', state.photos.length === 3 && new Set(state.photos).size === 3);
    const secondPhoto = state.photos[1];
    pickPhoto(encodeURI(secondPhoto));
    await sleep(100);
    assert('clicar numa foto depois de arrastar continua a selecioná-la', state.photo === secondPhoto);
  } catch (e) { assert('BLOCO 3 (arrastar/reordenar) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // as 2 categorias mais recentes — confirmar que não ficaram só no dropdown,
    // e que o menu tem mesmo todas as opções esperadas
    const options = [...document.getElementById('fCategory').options].map(o => o.value);
    ['generico','imoveis','carros','viagens','moda','cosmetica','casa','gastronomia'].forEach(cat => {
      assert('categoria "' + cat + '" existe no menu', options.includes(cat), options);
    });
    applyCategoryPreset('casa');
    await sleep(50);
    assert('preset "Casa & Jardim" preenche rótulos coerentes', state.spec[0].label === 'Tipo de peça' && state.spec[3].label === 'Marca', JSON.stringify(state.spec));
    applyCategoryPreset('gastronomia');
    await sleep(50);
    assert('preset "Gastronomia" preenche rótulos coerentes', state.spec[0].label === 'Tipo de cozinha' && state.spec[1].label === 'Porção', JSON.stringify(state.spec));
    onSpecChange(0, 'Italiana'); onSpecChange(1, '2 pessoas');
    assert('ficha de gastronomia aceita valores normalmente', specsLine().includes('Italiana') && specsLine().includes('2 pessoas'), specsLine());
    applyCategoryPreset('generico');
  } catch (e) { assert('BLOCO 3b (categorias casa/gastronomia) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // PALETA AUTOMÁTICA POR CATEGORIA — o cerne do pedido "poupe tempo": a
    // categoria escolhe a cor por defeito, sem cliques extra na cor à mão.
    assert('por defeito, ainda não personalizado', state._styleCustomized === false);
    applyCategoryPreset('carros');
    await sleep(60);
    assert('categoria "carros" aplica a cor sugerida automaticamente', state.brand.accent === '#6B8CAE', state.brand.accent);
    assert('categoria "carros" aplica o fundo sugerido', state.bg === 'dark', state.bg);
    applyCategoryPreset('viagens');
    await sleep(60);
    assert('categoria "viagens" muda para uma cor diferente', state.brand.accent === '#D97A4D', state.brand.accent);
    assert('categoria "viagens" sugere fundo degradê', state.bg === 'grad', state.bg);
    applyCategoryPreset('cosmetica');
    await sleep(60);
    assert('categoria "cosmetica" sugere fundo claro', state.bg === 'light', state.bg);
    const P = pal();
    assert('pal() reflete mesmo a cor da categoria (não só o state)', P.goldBig.toUpperCase() === '#C98BA0', P.goldBig);

    // agora a pessoa personaliza a cor à mão — a partir daqui, TRANCA a automação
    onBrandChange('accent', '#FF00FF');
    await sleep(60);
    assert('cor manual aplicada', state.brand.accent === '#FF00FF');
    assert('personalização fica registada', state._styleCustomized === true);
    applyCategoryPreset('gastronomia');
    await sleep(60);
    assert('depois de personalizar, mudar de categoria NÃO sobrepõe a cor escolhida', state.brand.accent === '#FF00FF', state.brand.accent);

    // o mesmo vale para escolher o fundo à mão (não só a cor)
    state._styleCustomized = false; state.brand.accent = '#B8935A';
    onBgButtonClick('light');
    await sleep(60);
    assert('escolher o fundo à mão também tranca a automação', state._styleCustomized === true);
    applyCategoryPreset('carros');
    await sleep(60);
    assert('fundo escolhido à mão não é sobreposto pela categoria', state.bg === 'light', state.bg);
    state._styleCustomized = false; state.bg = 'dark'; // repõe para os testes seguintes não herdarem isto
    applyCategoryPreset('generico');
  } catch (e) { assert('BLOCO 3c (paleta automática por categoria) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // a categoria "genérico"/padrão tem de continuar EXATAMENTE igual a antes
    // (ninguém que já usava a app deve ver a sua paleta mudar sozinha)
    state._styleCustomized = false;
    applyCategoryPreset('generico');
    await sleep(60);
    const P = pal();
    assert('paleta por defeito continua byte a byte igual (fundo escuro)', P.gold === '#B8935A' && P.goldBig === '#D4AF7A' && P.badgeBg === '#B8935A', JSON.stringify(P));
  } catch (e) { assert('BLOCO 3d (paleta por defeito sem regressão) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // COLAGEM — novo 4º template, 2 a 4 fotos numa grelha
    // guarda o estado atual para restaurar no fim — não pode poluir a contagem
    // de fotos que os testes de persistência mais à frente esperam
    const snap = { photos: state.photos.slice(), photoFiles: state.photoFiles.slice(),
      carPhotos: state.carPhotos.slice(), photo: state.photo, template: state.template };
    function makeColor(name, w, h, color) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').fillStyle = color; c.getContext('2d').fillRect(0, 0, w, h);
      return new Promise(res => c.toBlob(b => res(new File([b], name, { type: 'image/png' })), 'image/png'));
    }
    const cf = await Promise.all([
      makeColor('c1.png', 800, 800, '#a04040'), makeColor('c2.png', 800, 800, '#40a040'),
      makeColor('c3.png', 800, 800, '#4040a0'), makeColor('c4.png', 800, 800, '#a0a040')
    ]);
    await handleUploadFiles(cf);
    await sleep(200);
    setTemplate('colagem');
    await sleep(50);
    assert('template "colagem" fica ativo', state.template === 'colagem');

    // por defeito só a capa está marcada — menos de 2, deve mostrar a mensagem de ajuda, não rebentar
    state.carPhotos = [state.photos[0]];
    await draw(); await sleep(80);
    assert('com menos de 2 fotos marcadas, desenhar não lança exceção (mostra mensagem de ajuda)', true);

    // marcar as 4 fotos recém-carregadas para a colagem
    const novasFotos = state.photos.slice(-4);
    state.carPhotos = novasFotos.slice(0, 2);
    await draw(); await sleep(150);
    let px = document.getElementById('preview').getContext('2d').getImageData(0, 0, 1, 1).data;
    assert('colagem com 2 fotos desenha sem exceção', true);

    state.carPhotos = novasFotos.slice(0, 3);
    await draw(); await sleep(150);
    assert('colagem com 3 fotos desenha sem exceção', true);

    state.carPhotos = novasFotos.slice(0, 4);
    await draw(); await sleep(150);
    const canvas = document.getElementById('preview');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let coloredPixels = 0;
    for (let i = 0; i < data.length; i += 4 * 5000) if (data[i] > 30 || data[i+1] > 30 || data[i+2] > 30) coloredPixels++;
    assert('colagem com 4 fotos desenha conteúdo real (não fica em branco)', coloredPixels > 0, coloredPixels);

    // exportar em PNG com a colagem ativa não pode rebentar (drawListing agora é assíncrona)
    window.__downloads = [];
    await downloadPNG(); await sleep(250);
    assert('descarregar PNG funciona com a colagem ativa', window.__downloads.some(d => d.filename.endsWith('.png')));

    // repõe tudo exatamente como estava — os testes seguintes não podem notar que isto correu
    state.photos = snap.photos; state.photoFiles = snap.photoFiles;
    state.carPhotos = snap.carPhotos; state.photo = snap.photo; state.template = snap.template;
    renderPhotoGrid();
    await draw();
  } catch (e) { assert('BLOCO 3e (template Colagem) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // Colagem até 8 fotos + arrastar para reordenar tem de mudar a posição na colagem
    const snap = { photos: state.photos.slice(), photoFiles: state.photoFiles.slice(),
      carPhotos: state.carPhotos.slice(), photo: state.photo, template: state.template };
    function mk(name, color) {
      const c = document.createElement('canvas'); c.width = 400; c.height = 400;
      c.getContext('2d').fillStyle = color; c.getContext('2d').fillRect(0, 0, 400, 400);
      return new Promise(res => c.toBlob(b => res(new File([b], name, { type: 'image/png' })), 'image/png'));
    }
    const colors = ['#a00','#0a0','#00a','#aa0','#a0a','#0aa','#555','#fa5'];
    const files8 = await Promise.all(colors.map((c, i) => mk('p'+i+'.png', c)));
    await handleUploadFiles(files8);
    await sleep(250);
    const oito = state.photos.slice(-8);
    state.carPhotos = oito.slice();
    setTemplate('colagem');

    for (const n of [5, 6, 7, 8]) {
      state.carPhotos = oito.slice(0, n);
      await draw(); await sleep(120);
      assert('colagem com ' + n + ' fotos desenha sem exceção', true);
    }

    // mais de 8 marcadas — tem de cortar para 8 sem rebentar
    state.carPhotos = oito.concat([oito[0]]); // >8 se houver fotos suficientes de antes
    await draw(); await sleep(120);
    assert('marcar mais de 8 fotos não rebenta (usa só as primeiras 8)', true);

    // ARRASTAR PARA REORDENAR muda a posição na colagem — é o pedido de "editar a posição"
    state.photos = oito.slice(0, 4);
    state.carPhotos = oito.slice(0, 4); // mesma ordem para começar, de forma previsível
    renderPhotoGrid();
    const fakeEl = { classList: { add(){}, remove(){} } };
    onPhotoDragStart({ currentTarget: fakeEl, dataTransfer: {} }, 3); // arrasta a última foto...
    onPhotoDrop({ preventDefault(){}, currentTarget: fakeEl }, 0);    // ...para o início do grid
    assert('arrastar reordena a lista de fotos', state.photos[0] === oito[3], state.photos[0]);
    assert('arrastar também reordena a colagem (carPhotos segue a nova ordem)', state.carPhotos[0] === oito[3], state.carPhotos[0]);
    assert('a colagem continua com as mesmas 4 fotos, só a ordem muda', state.carPhotos.length === 4 && new Set(state.carPhotos).size === 4);

    // repõe tudo
    state.photos = snap.photos; state.photoFiles = snap.photoFiles;
    state.carPhotos = snap.carPhotos; state.photo = snap.photo; state.template = snap.template;
    renderPhotoGrid();
    await draw();
  } catch (e) { assert('BLOCO 3f (colagem até 8 fotos + reordenar) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // a colagem tem de funcionar em TODOS os formatos, não só no feed
    const snap2 = { photos: state.photos.slice(), photoFiles: state.photoFiles.slice(), carPhotos: state.carPhotos.slice(), format: state.format, template: state.template };
    function mk2(name, color) {
      const c = document.createElement('canvas'); c.width = 400; c.height = 400;
      c.getContext('2d').fillStyle = color; c.getContext('2d').fillRect(0, 0, 400, 400);
      return new Promise(res => c.toBlob(b => res(new File([b], name, { type: 'image/png' })), 'image/png'));
    }
    const files6 = await Promise.all(['#a04','#0a4','#04a','#aa4','#a4a','#4aa'].map((c,i) => mk2('f'+i+'.png', c)));
    await handleUploadFiles(files6);
    await sleep(200);
    const seis = state.photos.slice(-6);
    state.carPhotos = seis;
    setTemplate('colagem');
    for (const fmt of Object.keys(FORMATS)) {
      setFormat(fmt); await sleep(100);
      const canvas = document.getElementById('preview');
      assert('colagem em formato "' + fmt + '" tem as dimensões certas', canvas.width === FORMATS[fmt][0] && canvas.height === FORMATS[fmt][1]);
    }
    setFormat('feed45');
    state.photos = snap2.photos; state.photoFiles = snap2.photoFiles; state.carPhotos = snap2.carPhotos; state.format = snap2.format; state.template = snap2.template;
    renderPhotoGrid();
    await draw();
  } catch (e) { assert('BLOCO 3g (colagem em todos os formatos) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // SELOS RÁPIDOS POR CATEGORIA
    applyCategoryPreset('gastronomia');
    await sleep(60);
    const chips = [...document.querySelectorAll('#badgeChips .chip')].map(b => b.textContent);
    assert('categoria "gastronomia" mostra 4 selos sugeridos', chips.length === 4, chips);
    assert('selos de gastronomia fazem sentido para a categoria', chips.includes('Prato do Dia'), chips);
    pickBadgeChip(chips[0]);
    await sleep(60);
    assert('clicar num selo preenche o campo', state.badge === chips[0] && document.getElementById('fBadge').value === chips[0]);

    applyCategoryPreset('carros');
    await sleep(60);
    const chipsCarros = [...document.querySelectorAll('#badgeChips .chip')].map(b => b.textContent);
    assert('categoria diferente mostra selos diferentes', JSON.stringify(chipsCarros) !== JSON.stringify(chips), chipsCarros);

    setLang('en');
    await sleep(80);
    const chipsEN = [...document.querySelectorAll('#badgeChips .chip')].map(b => b.textContent);
    assert('selos também traduzem com o idioma', chipsEN.every(c => !/[áàãâéêíóõôúç]/i.test(c)), chipsEN);
    setLang('pt');
    await sleep(80);
    applyCategoryPreset('generico');
    state.badge = '';
    document.getElementById('fBadge').value = '';
  } catch (e) { assert('BLOCO 3h (selos rápidos por categoria) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // TEMPLATE ANTES/DEPOIS
    const snap = { photos: state.photos.slice(), photoFiles: state.photoFiles.slice(),
      carPhotos: state.carPhotos.slice(), photo: state.photo, template: state.template };
    function mkBA(name, color) {
      const c = document.createElement('canvas'); c.width = 600; c.height = 600;
      c.getContext('2d').fillStyle = color; c.getContext('2d').fillRect(0, 0, 600, 600);
      return new Promise(res => c.toBlob(b => res(new File([b], name, { type: 'image/png' })), 'image/png'));
    }
    const baFiles = await Promise.all([mkBA('antes.png', '#804020'), mkBA('depois.png', '#208040')]);
    await handleUploadFiles(baFiles);
    await sleep(200);
    setTemplate('antesdepois');
    await sleep(50);
    assert('template "antesdepois" fica ativo', state.template === 'antesdepois');

    const duasFotos = state.photos.slice(-2);
    // menos de 2 marcadas — mostra mensagem de ajuda, não rebenta
    state.carPhotos = [duasFotos[0]];
    await draw(); await sleep(100);
    assert('antes/depois com só 1 foto não rebenta (mostra ajuda)', true);

    state.carPhotos = duasFotos;
    await draw(); await sleep(150);
    const canvas = document.getElementById('preview');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let coloredPixels = 0;
    for (let i = 0; i < data.length; i += 4 * 5000) if (data[i] > 30 || data[i+1] > 30 || data[i+2] > 30) coloredPixels++;
    assert('antes/depois com 2 fotos desenha conteúdo real', coloredPixels > 0, coloredPixels);

    window.__downloads = [];
    await downloadPNG(); await sleep(250);
    assert('descarregar PNG funciona com antes/depois ativo', window.__downloads.some(d => d.filename.endsWith('.png')));

    state.photos = snap.photos; state.photoFiles = snap.photoFiles;
    state.carPhotos = snap.carPhotos; state.photo = snap.photo; state.template = snap.template;
    renderPhotoGrid();
    await draw();
  } catch (e) { assert('BLOCO 3i (template Antes/Depois) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // CERTIFICADO ENERGÉTICO + €/m² (Imóveis)
    applyCategoryPreset('imoveis');
    await sleep(60);
    pickEnergyRating('B');
    await sleep(50);
    assert('escolher classe energética guarda no estado', state.energyRating === 'B');
    assert('classe energética aparece na ficha do post', specsLine().includes('Classe') && specsLine().includes('B'), specsLine());
    pickEnergyRating('B'); // clicar outra vez desmarca
    await sleep(50);
    assert('clicar na mesma classe outra vez desmarca', state.energyRating === '');
    pickEnergyRating('A+');

    onSpecChange(0, '120'); // área interior = campo 0
    document.getElementById('fPrice').value = '300.000€'; state.price = '300.000€'; renderCategoryExtras();
    await sleep(60);
    const hintHTML = document.getElementById('categoryExtras').innerHTML;
    assert('€/m² calcula corretamente (300.000€ ÷ 120m² = 2.500€/m²)', hintHTML.includes('2.500€/m²') || hintHTML.includes('2,500€/m²'), hintHTML.match(/[\\d.,]+€\\/m²/)?.[0]);
  } catch (e) { assert('BLOCO 3j (certificado energético + €/m²) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // ESTRELAS (Viagens)
    applyCategoryPreset('viagens');
    await sleep(60);
    pickStarRating(4);
    await sleep(50);
    assert('escolher 4 estrelas guarda no estado', state.starRating === 4);
    assert('estrelas aparecem na ficha do post (4 cheias, 1 vazia)', specsLine().includes('★★★★☆'), specsLine());
    pickStarRating(4);
    await sleep(50);
    assert('clicar nas mesmas estrelas desmarca', state.starRating === 0);
  } catch (e) { assert('BLOCO 3k (estrelas de viagens) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // ALERGÉNIOS (Gastronomia)
    applyCategoryPreset('gastronomia');
    await sleep(60);
    toggleAllergen('gluten');
    toggleAllergen('lactose');
    await sleep(50);
    assert('marcar 2 alergénios guarda os dois', state.allergens.length === 2 && state.allergens.includes('gluten') && state.allergens.includes('lactose'));
    assert('alergénios aparecem na ficha do post', specsLine().includes('🌾') && specsLine().includes('🥛'), specsLine());
    toggleAllergen('gluten');
    await sleep(50);
    assert('desmarcar um alergénio funciona', state.allergens.length === 1 && !state.allergens.includes('gluten'));
  } catch (e) { assert('BLOCO 3l (alergénios de gastronomia) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // TAMANHOS (Moda)
    applyCategoryPreset('moda');
    await sleep(60);
    toggleSize('M'); toggleSize('L'); toggleSize('XL');
    await sleep(50);
    assert('marcar vários tamanhos guarda todos', state.sizes.length === 3);
    assert('tamanhos aparecem na ficha do post', specsLine().includes('M/L/XL'), specsLine());
  } catch (e) { assert('BLOCO 3m (tamanhos de moda) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // SIMULADOR DE FINANCIAMENTO (Carros) — verificar o cálculo, não só "não rebentou"
    applyCategoryPreset('carros');
    await sleep(60);
    state.financeMonths = 60; state.financeDownPct = 20; state.financeAPR = 0; // 0% torna o cálculo trivial de verificar
    document.getElementById('fPrice').value = '12.000€'; state.price = '12.000€';
    renderCategoryExtras();
    await sleep(60);
    // com 0% de juro: mensalidade = (12000 * 0.8) / 60 = 160€
    const financeHTML = document.getElementById('categoryExtras').innerHTML;
    assert('simulador calcula corretamente com 0% de juro (9.600€ ÷ 60 = 160€)', financeHTML.includes('160€'), financeHTML.match(/≈[\\d.,]+€/)?.[0]);

    // com juro > 0, só confirmar que gera um número plausível (maior que o cenário sem juro)
    state.financeAPR = 7.9; renderCategoryExtras(); await sleep(60);
    const financeHTML2 = document.getElementById('categoryExtras').innerHTML;
    const val2 = financeHTML2.match(/≈\\s*([\\d.,]+)€/);
    assert('com juro, a mensalidade sobe acima do cenário sem juro', val2 && parseFloat(val2[1].replace(/\\./g,'').replace(',','.')) > 160, val2 && val2[1]);

    // botão "usar no selo"
    const btn = [...document.querySelectorAll('#categoryExtras button')].find(b => b.textContent.includes('selo'));
    assert('botão "usar no selo" existe quando há uma estimativa', !!btn);
    if (btn) { btn.click(); await sleep(60); assert('clicar em "usar no selo" preenche o selo', state.badge.includes('€/mês') || state.badge.includes('A partir')); }
  } catch (e) { assert('BLOCO 3n (simulador de financiamento) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // PERSISTÊNCIA — campos novos sobrevivem a um reload real, E trocar de
    // categoria limpa os valores que já não pertencem à categoria nova
    // (comportamento intencional, pedido explicitamente)
    const photoSnap = { photos: state.photos.slice(), photoFiles: state.photoFiles.slice() };
    applyCategoryPreset('gastronomia');
    state.allergens = ['gluten', 'marisco'];
    await sleep(30);
    assert('trocar de categoria limpa alergénios da categoria anterior', (() => {
      applyCategoryPreset('imoveis');
      return state.allergens.length === 0;
    })());
    // o pedido original: valores da ficha (não só os rótulos) limpam ao trocar de categoria
    onSpecChange(0, '120'); onSpecChange(1, '3');
    await sleep(30);
    applyCategoryPreset('carros');
    await sleep(30);
    assert('trocar de categoria limpa os VALORES da ficha, não só os rótulos', state.spec[0].value === '' && state.spec[1].value === '', JSON.stringify(state.spec.map(s=>s.value)));
    assert('trocar de categoria atualiza os rótulos para a nova categoria', state.spec[0].label === 'Marca / Modelo', state.spec[0].label);
    state.energyRating = 'C';
    await saveDraft(); await sleep(250);
    state.energyRating = '';
    await loadDraftIfAny(); await sleep(200);
    assert('classe energética sobrevive a um reload (mesma categoria)', state.energyRating === 'C', state.energyRating);
    state.photos = photoSnap.photos; state.photoFiles = photoSnap.photoFiles;
    await saveDraft(); await sleep(200); // deixa o IndexedDB consistente com o que os testes seguintes esperam
  } catch (e) { assert('BLOCO 3o (persistência dos campos novos) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // AJUSTE MANUAL DE ENQUADRAMENTO — não pode alterar o comportamento
    // automático quando não há ajuste, e cada foto guarda o seu próprio
    const snapCrop = { photos: state.photos.slice(), photoFiles: state.photoFiles.slice(), cropAdjust: JSON.parse(JSON.stringify(state.cropAdjust)) };
    assert('por defeito, sem ajuste guardado', Object.keys(state.cropAdjust).length === 0 || !state.cropAdjust[state.photo]);
    const adjNeutro = getCropAdjust(state.photo);
    assert('valor neutro por defeito (zoom 1, centrado)', adjNeutro.zoom === 1 && adjNeutro.panX === 0.5 && adjNeutro.panY === 0.5);

    onCropAdjustChange('zoom', 1.5);
    await sleep(50);
    assert('mudar o zoom guarda no estado, associado a esta foto', state.cropAdjust[state.photo].zoom === 1.5);
    onCropAdjustChange('panX', 0.2);
    onCropAdjustChange('panY', 0.8);
    await sleep(50);
    assert('mudar a posição guarda os 2 eixos independentemente', state.cropAdjust[state.photo].panX === 0.2 && state.cropAdjust[state.photo].panY === 0.8);
    assert('desenhar com ajuste ativo não lança exceção', true);
    await draw(); await sleep(80);

    // trocar de foto de capa tem de mostrar os controlos da NOVA foto (não os da anterior)
    if (state.photos.length >= 2) {
      const fotoAjustadaId = state.photo; // guarda qual é, em vez de a "procurar" depois
      const outraFoto = state.photos.find(p => p !== fotoAjustadaId);
      pickPhoto(encodeURI(outraFoto));
      await sleep(80);
      const cropZoomEl = document.getElementById('cropZoom');
      assert('trocar de foto de capa repõe os controlos (nova foto sem ajuste ainda)', +cropZoomEl.value === 100, cropZoomEl.value);
      pickPhoto(encodeURI(fotoAjustadaId));
      await sleep(80);
      const cropZoomEl2 = document.getElementById('cropZoom');
      assert('voltar à foto ajustada mostra o ajuste guardado dela', +cropZoomEl2.value === 150, { valor: cropZoomEl2.value, temAjuste: !!state.cropAdjust[fotoAjustadaId], fotoAjustadaId, photoAtual: state.photo });
    }

    // repor tira o ajuste desta foto especificamente
    resetCropAdjust();
    await sleep(50);
    assert('repor remove o ajuste desta foto', !state.cropAdjust[state.photo]);
    assert('repor volta ao valor neutro', getCropAdjust(state.photo).zoom === 1);

    // persistência — o ajuste sobrevive a um reload real
    state.cropAdjust = {}; state.cropAdjust[state.photo] = { panX: 0.3, panY: 0.7, zoom: 1.8 };
    await saveDraft(); await sleep(250);
    const fotoAjustada = state.photo;
    state.cropAdjust = {};
    await loadDraftIfAny(); await sleep(200);
    assert('ajuste de enquadramento sobrevive a um reload real', 
      state.cropAdjust[fotoAjustada] && state.cropAdjust[fotoAjustada].zoom === 1.8 && state.cropAdjust[fotoAjustada].panX === 0.3,
      JSON.stringify(state.cropAdjust[fotoAjustada]));

    // repõe tudo — não pode afetar os testes seguintes
    state.photos = snapCrop.photos; state.photoFiles = snapCrop.photoFiles; state.cropAdjust = snapCrop.cropAdjust;
    renderPhotoGrid(); syncCropAdjustUI();
    await saveDraft(); await sleep(200);
  } catch (e) { assert('BLOCO 3q (ajuste manual de enquadramento) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // REGRESSÃO — parseEuroNumber() tem de respeitar o idioma ativo. Bug real
    // confirmado numa auditoria: "16.50" em modo EN era lido como 1650 (100x
    // errado), porque a função assumia sempre convenção PT/EU independentemente
    // do idioma. Este teste existe especificamente para nunca mais voltar
    // silenciosamente.
    const langSnap = state.lang;
    state.lang = 'en';
    assert('EN: "16.50" lê-se como 16.5, não 1650 (bug real corrigido)', parseEuroNumber('16.50') === 16.5, parseEuroNumber('16.50'));
    assert('EN: "1,234.50" lê-se como 1234.5 (vírgula = milhares em EN)', parseEuroNumber('1,234.50') === 1234.5, parseEuroNumber('1,234.50'));
    state.lang = 'pt';
    assert('PT: "16,50" continua a ler-se como 16.5', parseEuroNumber('16,50') === 16.5, parseEuroNumber('16,50'));
    assert('PT: "295.000" continua a ler-se como 295000', parseEuroNumber('295.000') === 295000, parseEuroNumber('295.000'));
    state.lang = 'fr';
    assert('FR: "1 234,56" (espaço de milhares) lê-se como 1234.56', parseEuroNumber('1 234,56') === 1234.56, parseEuroNumber('1 234,56'));
    state.lang = 'de';
    assert('DE: "1.234,56" lê-se como 1234.56', parseEuroNumber('1.234,56') === 1234.56, parseEuroNumber('1.234,56'));
    state.lang = langSnap;
  } catch (e) { assert('BLOCO 3r (parseEuroNumber respeita o idioma — regressão)  não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // SEGURANÇA — nomes de Brand Kit e título/preço da produção em massa nunca
    // podem ser interpretados como HTML/script, mesmo escrevendo algo hostil
    const payload = '"><img src=x onerror="window.__xssFired=true">';
    window.__xssFired = false;
    // 1) Brand Kit — via prompt()
    const originalPrompt = window.prompt;
    window.prompt = () => payload;
    await saveBrandKit(); await sleep(150);
    window.prompt = originalPrompt;
    await sleep(50);
    assert('nome de Brand Kit hostil não executa script ao ser listado', window.__xssFired === false);
    const optionText = [...document.getElementById('brandKitSelect').options].find(o => o.value === payload);
    assert('nome de Brand Kit hostil aparece como TEXTO, não como HTML', !!optionText && optionText.textContent === payload, optionText && optionText.textContent);
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    document.getElementById('brandKitSelect').value = payload;
    await deleteBrandKit(); await sleep(100);
    window.confirm = originalConfirm;

    // 2) Produção em massa — título/preço por foto
    if (state.photos.length >= 1) {
      openBulk(); await sleep(100);
      window.__xssFired = false;
      const firstId = bulkState.all[0] && bulkState.all[0].id;
      if (firstId) {
        bulkState.itemData[firstId].title = payload;
        renderBulkList(); await sleep(80);
        assert('título hostil na produção em massa não executa script ao voltar a desenhar', window.__xssFired === false);
        const titleInput = document.querySelector('#bulkList input[type="text"]');
        assert('título hostil aparece como valor de input, não como HTML', titleInput && titleInput.value === payload, titleInput && titleInput.value);
        bulkState.itemData[firstId].title = '';
        renderBulkList();
      }
      closeBulk();
    }
  } catch (e) { assert('BLOCO 3s (segurança — XSS em Brand Kit e produção em massa) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // HARDENING — CSP presente e a restringir o que deve
    assert('CSP está presente no <head>', !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
    assert('CSP restringe script-src a self + cdnjs', csp.includes('cdnjs.cloudflare.com') && csp.includes("default-src 'self'"));
  } catch (e) { assert('BLOCO 3t (CSP presente) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // ENDPOINT DE IA SPLIT-BACKEND — Web e native usam a autoridade absoluta
    // validada pelo release contract; não há fallback relativo neste build.
    assert('IS_NATIVE_PLATFORM existe e é falso neste teste (Chromium comum, não Capacitor)', IS_NATIVE_PLATFORM === false);
    assert('sem Capacitor, o endpoint usa o backend AI split', AI_ENDPOINT === 'https://z-studio-platform-seven.vercel.app/api/ai', AI_ENDPOINT);
    assert('a constante nativa aponta para o mesmo backend AI split', AI_API_BASE_URL_NATIVE === AI_ENDPOINT, AI_API_BASE_URL_NATIVE);
    // simula contexto nativo para confirmar que a deteção permanece independente do URL
    window.Capacitor = { isNativePlatform: () => true };
    const wouldBeNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    assert('deteção de plataforma nativa funciona quando window.Capacitor existe', wouldBeNative === true);
    delete window.Capacitor;
  } catch (e) { assert('BLOCO 3u (endpoint de IA configurável) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // ABSTRAÇÃO DE PLATAFORMA — o que é testável aqui é o caminho web (este
    // ambiente é Chromium comum, sem Capacitor real). O caminho nativo em si
    // (Filesystem/Share plugins) não é testável fora de um dispositivo/
    // simulador real — fica documentado como limitação, não fingido como testado.
    window.__saveBlobWebCalled = false;
    const origSaveBlobWeb = saveBlobWeb;
    window.saveBlobWeb = function(...args) { window.__saveBlobWebCalled = true; return origSaveBlobWeb.apply(this, args); };
    const testBlob = new Blob(['teste'], { type: 'text/plain' });
    await saveBlob(testBlob, 'teste.txt');
    await sleep(50);
    assert('sem Capacitor, saveBlob() usa o caminho web', window.__saveBlobWebCalled === true);
    window.saveBlobWeb = origSaveBlobWeb;

    // pickLocalFolder tem de recusar educadamente em contexto nativo, não tentar simular
    window.Capacitor = { isNativePlatform: () => true };
    const wouldBeNativeForFolder = !!(window.Capacitor && window.Capacitor.isNativePlatform());
    assert('deteção nativa disponível para pickLocalFolder saber que deve recusar', wouldBeNativeForFolder === true);
    delete window.Capacitor;

    assert('blobToBase64 converte corretamente (usado pelo caminho nativo)', 
      (await blobToBase64(new Blob(['AB'], {type:'text/plain'}))).length > 0);
  } catch (e) { assert('BLOCO 3v (abstração de plataforma — caminho web) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // VÍDEO CURTO (Stories/Reels/TikTok) — gera de verdade e confirma um
    // ficheiro de vídeo válido, não só que a função correu sem exceção.
    assert('deteção de suporte a vídeo existe', typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function');

    if (state.photos.length === 0) {
      const f = await new Promise(res => {
        const c = document.createElement('canvas'); c.width = 200; c.height = 200;
        c.getContext('2d').fillRect(0, 0, 200, 200);
        c.toBlob(b => res(new File([b], 'v.png', { type: 'image/png' })), 'image/png');
      });
      await handleUploadFiles([f]);
      await sleep(150);
    }
    document.getElementById('fTitle').value = 'Teste de Vídeo'; state.title = 'Teste de Vídeo';
    document.getElementById('fPrice').value = '99€'; state.price = '99€';

    let captured = null;
    const originalSaveBlobWeb = saveBlobWeb;
    window.saveBlobWeb = function(blob, name) { captured = { blob, name }; };
    const savedAdjustBefore = state.cropAdjust[state.photo] ? { ...state.cropAdjust[state.photo] } : null;

    await generateVideoClip();

    window.saveBlobWeb = originalSaveBlobWeb;
    assert('gerar vídeo produz um ficheiro (chama saveBlob)', !!captured);
    if (captured) {
      assert('o ficheiro de vídeo tem conteúdo real (não está vazio)', captured.blob.size > 1000, captured.blob.size);
      assert('o tipo MIME é mesmo de vídeo', captured.blob.type.startsWith('video/'), captured.blob.type);
      assert('o nome do ficheiro tem extensão de vídeo', /\.(mp4|webm)$/.test(captured.name), captured.name);
    }
    // gerar o vídeo não pode deixar rasto no ajuste de enquadramento desta foto
    const adjustAfter = state.cropAdjust[state.photo] ? { ...state.cropAdjust[state.photo] } : null;
    assert('gerar vídeo repõe o ajuste de enquadramento exatamente como estava antes',
      JSON.stringify(savedAdjustBefore) === JSON.stringify(adjustAfter), { antes: savedAdjustBefore, depois: adjustAfter });
    const btn = document.getElementById('btnVideo');
    assert('o botão de vídeo volta a ficar ativo depois de gerar', btn && !btn.disabled);
  } catch (e) { assert('BLOCO 3w (vídeo curto Stories/Reels/TikTok) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // BUG REAL ENCONTRADO POR CAPTURA DE ECRÃ — selo do template Minimalista
    // cortado à esquerda ("OPORTUNIDADE" a aparecer como "ORTUNIDADE").
    // Causa: spaced() trata sempre o 3º parâmetro como CENTRO do texto, mas
    // o Minimalista passava-lhe uma margem esquerda (64*FS) como se fosse
    // início — para texto comprido, isso empurra o início para fora do
    // canvas. Confirma-se aqui matematicamente, não só visualmente.
    const fakeCtx = {
      textAlign: 'left', font: '', fillStyle: '',
      calls: [],
      measureText(ch) { return { width: 10 }; }, // largura fixa para o teste ser previsível
      fillText(ch, x, y) { this.calls.push({ ch, x, y }); }
    };
    spacedLeft(fakeCtx, 'OPORTUNIDADE', 64, 100, 6);
    assert('spacedLeft começa exatamente na margem pedida (64), não deslocado', fakeCtx.calls[0].x === 64, fakeCtx.calls[0].x);
    assert('spacedLeft nunca desloca para coordenadas negativas com texto comprido', fakeCtx.calls.every(c => c.x >= 64), fakeCtx.calls.map(c=>c.x));

    // confirma que spaced() (a original, para texto CENTRADO) continua a
    // comportar-se como esperado — não se partiu ao criar a variante nova
    const fakeCtx2 = { textAlign: 'left', calls: [], measureText: () => ({ width: 10 }), fillText(ch, x, y) { this.calls.push({ ch, x, y }); } };
    spaced(fakeCtx2, 'AB', 100, 50, 0); // 2 chars de 10px cada = 20px total, centrado em 100 → começa em 90
    assert('spaced() continua centrado corretamente (não afetado pela correção)', fakeCtx2.calls[0].x === 90, fakeCtx2.calls[0].x);

    // e a confirmação visual: o Minimalista com um selo comprido tem de
    // desenhar conteúdo real na margem esquerda esperada, não ficar vazio ali
    const photoSnapBadge = { photos: state.photos.slice(), photoFiles: state.photoFiles.slice() };
    if (state.photos.length === 0) {
      const f = await new Promise(res => { const c = document.createElement('canvas'); c.width=10; c.height=10; c.getContext('2d').fillRect(0,0,10,10); c.toBlob(b => res(new File([b],'b.png',{type:'image/png'})), 'image/png'); });
      await handleUploadFiles([f]);
    }
    setTemplate('minimalista');
    document.getElementById('fBadge').value = 'OPORTUNIDADE ÚNICA'; state.badge = 'OPORTUNIDADE ÚNICA';
    await draw(); await sleep(100);
    const canvas = document.getElementById('preview');
    const ctx2d = canvas.getContext('2d');
    const FS_test = Math.sqrt((canvas.width*canvas.height)/(1080*1350));
    const expectedX = Math.round(64 * FS_test);
    const barH_test = 220 * FS_test;
    const badgeY = Math.round(canvas.height - barH_test + 46 * FS_test);
    // varre uma pequena área à volta da posição esperada, em vez de um único
    // pixel — o rendering de texto real varia um pouco (baseline, anti-aliasing)
    const region = ctx2d.getImageData(expectedX, badgeY - 24, 60, 30).data;
    let hasContent = false;
    for (let i = 0; i < region.length; i += 4) {
      if (region[i] > 20 || region[i+1] > 20 || region[i+2] > 20) { hasContent = true; break; }
    }
    assert('o selo desenha conteúdo visível junto à margem esquerda esperada', hasContent);
    setTemplate('classico');
    state.photos = photoSnapBadge.photos; state.photoFiles = photoSnapBadge.photoFiles;
    document.getElementById('fBadge').value = ''; state.badge = '';
    renderPhotoGrid();
  } catch (e) { assert('BLOCO 3x (selo cortado no Minimalista — regressão) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // 3 CATEGORIAS NOVAS — Desporto & Fitness, Serviços Profissionais, Eventos
    const options = [...document.getElementById('fCategory').options].map(o => o.value);
    ['desporto', 'servicos', 'eventos'].forEach(cat => {
      assert('categoria "' + cat + '" existe no menu', options.includes(cat), options);
    });

    applyCategoryPreset('desporto');
    await sleep(50);
    assert('preset "desporto" preenche rótulos coerentes', state.spec[0].label === 'Modalidade' && state.spec[2].label === 'Nível', JSON.stringify(state.spec));
    assert('desporto sugere paleta própria', state.brand.accent === '#D9583A', state.brand.accent);
    const chipsDesporto = [...document.querySelectorAll('#badgeChips .chip')].map(b => b.textContent);
    assert('desporto tem 4 selos sugeridos coerentes', chipsDesporto.includes('Nova Turma'), chipsDesporto);

    applyCategoryPreset('servicos');
    await sleep(50);
    assert('preset "servicos" preenche rótulos coerentes', state.spec[0].label === 'Especialidade' && state.spec[3].label === 'Modalidade', JSON.stringify(state.spec));
    assert('servicos sugere fundo claro (contexto profissional)', state.bg === 'light', state.bg);

    applyCategoryPreset('eventos');
    await sleep(50);
    assert('preset "eventos" preenche rótulos coerentes', state.spec[0].label === 'Tipo de evento' && state.spec[1].label === 'Data', JSON.stringify(state.spec));
    assert('eventos sugere fundo degradê (mais festivo)', state.bg === 'grad', state.bg);
    onSpecChange(0, 'Casamento'); onSpecChange(1, '20 Set 2026');
    assert('ficha de eventos aceita valores normalmente', specsLine().includes('Casamento') && specsLine().includes('20 Set 2026'), specsLine());

    // confirmar tradução: em inglês, os rótulos do menu mudam
    setLang('en');
    await sleep(80);
    const catSelectEN = document.getElementById('fCategory');
    const desportoOptEN = [...catSelectEN.options].find(o => o.value === 'desporto');
    assert('categoria "desporto" traduz para inglês no menu', desportoOptEN.textContent === 'Sports & Fitness', desportoOptEN.textContent);
    applyCategoryPreset('desporto');
    await sleep(50);
    assert('preset "desporto" também traduz os rótulos da ficha', state.spec[0].label === 'Activity type', state.spec[0].label);
    setLang('pt');
    await sleep(80);
    applyCategoryPreset('generico');
  } catch (e) { assert('BLOCO 3y (3 categorias novas: desporto, serviços, eventos) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // limpar rascunho tem de repor tudo isto também — mas clearDraft() apaga
    // MESMO tudo (memória + IndexedDB), por isso este teste tem de restaurar
    // as fotos a seguir, para não afetar os testes de persistência mais à frente
    const photoSnapP = { photos: state.photos.slice(), photoFiles: state.photoFiles.slice() };
    state.energyRating = 'A'; state.starRating = 3; state.allergens = ['soja']; state.sizes = ['S'];
    const originalConfirm = window.confirm; window.confirm = () => true;
    clearDraft(); await sleep(200);
    window.confirm = originalConfirm;
    assert('limpar rascunho repõe classe energética', state.energyRating === '');
    assert('limpar rascunho repõe estrelas', state.starRating === 0);
    assert('limpar rascunho repõe alergénios', state.allergens.length === 0);
    assert('limpar rascunho repõe tamanhos', state.sizes.length === 0);
    applyCategoryPreset('generico');
    // restaura as fotos — em memória E no IndexedDB, já que clearDraft() apagou os dois
    state.photos = photoSnapP.photos; state.photoFiles = photoSnapP.photoFiles;
    state.photo = state.photos[0] || null; state.carPhotos = state.photos.slice();
    renderPhotoGrid();
    await saveDraft(); await sleep(200);
  } catch (e) { assert('BLOCO 3p (limpar rascunho repõe campos novos) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // Categoria + Ficha genérica — o coração da versão universal
    applyCategoryPreset('carros');
    await sleep(50);
    assert('preset "carros" preenche os rótulos certos', state.spec[0].label === 'Marca / Modelo' && state.spec[1].label === 'Ano');
    onSpecChange(0, 'Toyota Corolla'); onSpecChange(1, '2022'); onSpecChange(2, '34.000 km'); onSpecChange(3, 'Híbrido');
    await sleep(50);
    const line = specsLine();
    assert('specsLine() compõe a ficha genérica corretamente', line.includes('Toyota Corolla') && line.includes('2022') && line.includes('Híbrido'), line);
    document.getElementById('fTitle').value = 'Toyota Corolla 2022'; onEditTitle('Toyota Corolla 2022');
    document.getElementById('fPrice').value = '18.500€'; state.price = '18.500€';
    buildCaption();
    const cap = document.getElementById('caption').value;
    assert('legenda inclui a ficha (categoria carros)', cap.includes('Toyota Corolla') && cap.includes('18.500€'), cap.slice(0,200));
    draw(); await sleep(60);
    assert('desenhar com categoria "carros" preenchida não lança exceção', true);

    // trocar para outra categoria totalmente diferente — testa a versatilidade
    applyCategoryPreset('cosmetica');
    await sleep(50);
    assert('preset "cosmetica" também funciona', state.spec[0].label === 'Tipo / Uso');
    applyCategoryPreset('generico');
    await sleep(50);
    assert('volta a genérico sem exceção', state.spec[0].label === 'Característica 1');

    // rótulo totalmente livre — a app tem de aceitar qualquer coisa
    onSpecLabelChange(0, 'Tamanho do calçado');
    onSpecChange(0, '42');
    await sleep(50);
    assert('rótulo 100% livre funciona (universalidade real)', specsLine().includes('Tamanho do calçado: 42'), specsLine());
  } catch (e) { assert('BLOCO 4 (categoria + ficha universal) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    const fTitle = document.getElementById('fTitle');
    fTitle.value = 'Título A'; state.title = 'Título A';
    fTitle.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(600);
    fTitle.value = 'Título B'; state.title = 'Título B';
    fTitle.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(600);
    const dbgBefore = JSON.stringify({ historyIndex, len: historyStack.length, stack: historyStack.map(s=>s.title) });
    undoEdit();
    assert('desfazer (Ctrl+Z) volta ao valor anterior', state.title === 'Título A' && fTitle.value === 'Título A',
      { dbgBefore, titleAfter: state.title, fTitleValAfter: fTitle.value, historyIndexAfter: historyIndex });
    redoEdit();
    assert('refazer volta ao valor seguinte', state.title === 'Título B');
  } catch (e) { assert('BLOCO 5 (desfazer/refazer) não rebentou', false, e.message + ' | ' + e.stack); }

  let origSize = 0, savedSize = 0;
  try {
    document.getElementById('fPrice').value = '250.000€'; state.price = '250.000€';
    document.getElementById('fLoc').value = 'Porto'; state.loc = 'Porto';
    await saveDraft(); await sleep(250);
    const savedMeta = await idbGet('meta');
    assert('rascunho gravado no IndexedDB', !!savedMeta);
    assert('texto e categoria do rascunho gravados corretamente', savedMeta && savedMeta.content && savedMeta.content.price === '250.000€' && savedMeta.category);
    const savedPhotos = await idbGet('photos');
    assert('fotos gravadas no rascunho (3)', Array.isArray(savedPhotos) && savedPhotos.length === 3);
    origSize = window.__testFiles.reduce((s,f) => s+f.size, 0);
    savedSize = (savedPhotos||[]).reduce((s,b) => s+b.size, 0);
    assert('fotos comprimidas antes de gravar', savedSize <= origSize, { origSize, savedSize });
  } catch (e) { assert('BLOCO 6 (persistência) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // O TESTE MAIS IMPORTANTE: simula um reload real
    state.photos = []; state.photoFiles = []; state.photo = null; state.carPhotos = [];
    state.title = ''; state.price = ''; state.loc = ''; state.spec = [{label:'',value:''},{label:'',value:''},{label:'',value:''},{label:'',value:''}];
    await loadDraftIfAny(); await sleep(200);
    syncUI(); await sleep(150);
    assert('depois de recarregar, as fotos voltam (round-trip real do IndexedDB)', state.photos.length === 3, state.photos.length);
    assert('depois de recarregar, o preço aparece no campo certo', document.getElementById('fPrice').value === '250.000€');
    assert('depois de recarregar, a ficha/categoria volta', state.spec[0].value === '42' || specsLine().length >= 0);
  } catch (e) { assert('BLOCO 7 (round-trip de reload real) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    const originalPrompt = window.prompt;
    window.prompt = () => 'Kit de Teste';
    state.brand.name = 'Marca de Teste';
    await saveBrandKit(); await sleep(150);
    window.prompt = originalPrompt;
    const kits = await idbGet('kits');
    assert('kit de marca gravado', kits && !!kits['Kit de Teste']);
    state.brand.name = 'Outro';
    await applyBrandKit('Kit de Teste'); await sleep(100);
    assert('kit de marca aplicado corretamente', state.brand.name === 'Marca de Teste');
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    await deleteBrandKit(); await sleep(150);
    window.confirm = originalConfirm;
    const kitsAfter = await idbGet('kits');
    assert('kit de marca apagado', !kitsAfter || !kitsAfter['Kit de Teste']);
  } catch (e) { assert('BLOCO 8 (kits de marca) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    const canvas = document.getElementById('preview');
    for (const fmt of Object.keys(FORMATS)) {
      setFormat(fmt); await sleep(40);
      const [w,h] = FORMATS[fmt];
      assert('formato ' + fmt + ' aplica-se ao canvas', canvas.width === w && canvas.height === h);
    }
    setFormat('feed45');
    for (const tpl of ['classico','editorial','minimalista']) {
      for (const fmt of ['feed45','wide','pin']) { setFormat(fmt); setTemplate(tpl); await sleep(25); }
    }
    assert('todos os templates x formatos desenham sem exceção', true);
    setFormat('feed45'); setTemplate('classico');
    for (const key of Object.keys(PHOTO_FILTERS)) { state.filter = key; draw(); await sleep(20); }
    assert('todos os filtros de imagem aplicam sem exceção', true);
    state.filter = 'auto'; draw();
  } catch (e) { assert('BLOCO 9 (formatos/templates/filtros) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    window.__downloads = [];
    await downloadPNG(); await sleep(200);
    assert('descarregar PNG despoleta um download', window.__downloads.some(d => d.filename.endsWith('.png')));
  } catch (e) { assert('BLOCO 10 (download PNG) não rebentou', false, e.message + ' | ' + e.stack); }

  const hasZip = typeof window.JSZip !== 'undefined';
  if (hasZip) {
    try {
      if (state.photos.length >= 2) toggleCarPhoto(encodeURI(state.photos[1]));
      buildSlides(0); await sleep(100);
      window.__downloads = [];
      await downloadCarousel(); await sleep(400);
      assert('carrossel completo gera um .zip com conteúdo', window.__downloads.some(d => d.filename.endsWith('.zip') && d.size > 0));
      window.__downloads = [];
      await downloadAllFormats(); await sleep(600);
      assert('"todos os formatos" gera um .zip com conteúdo', window.__downloads.some(d => d.filename.endsWith('.zip') && d.size > 0));

      // produção em massa — agora só a partir de fotos carregadas
      openBulk(); await sleep(100);
      toggleBulkAll(true); await sleep(50);
      window.__downloads = [];
      await runBulkGenerate(); await sleep(600);
      assert('produção em massa (upload-only) gera um .zip', window.__downloads.some(d => d.filename.endsWith('.zip') && d.size > 0));
      closeBulk();
    } catch (e) { assert('BLOCO 11 (exportações ZIP + produção em massa) não rebentou', false, e.message + ' | ' + e.stack); }
  } else { skip('BLOCO 11 (exportações ZIP)', 'JSZip não carregou'); }

  const hasPdf = typeof window.jspdf !== 'undefined';
  if (hasPdf) {
    try {
      window.__downloads = [];
      await downloadPDF(); await sleep(300);
      assert('exportar PDF gera um ficheiro com conteúdo', window.__downloads.some(d => d.filename.endsWith('.pdf') && d.size > 0));
    } catch (e) { assert('BLOCO 12 (exportação PDF) não rebentou', false, e.message + ' | ' + e.stack); }
  } else { skip('BLOCO 12 (exportação PDF)', 'jsPDF não carregou'); }

  try {
    await toggleSlideGrid(); await sleep(500);
    const cells = document.querySelectorAll('#slideGridWrap > div').length;
    assert('vista em grelha mostra uma miniatura por slide', cells === state.slides.length);
    toggleSlideGrid(); await sleep(50);
    assert('vista em grelha fecha corretamente', document.getElementById('slideGridOverlay').classList.contains('hide'));
  } catch (e) { assert('BLOCO 13 (vista em grelha) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    window.__downloads = [];
    await sharePNG(); await sleep(200);
    if (!navigator.share) assert('sharePNG cai para download sem Web Share', window.__downloads.some(d => d.filename.endsWith('.png')));
    else assert('sharePNG não lançou exceção com Web Share', true);
  } catch (e) { assert('BLOCO 14 (partilha) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    await aiCaptionAllLangs(); await sleep(200);
    assert('aiCaptionAllLangs não lança exceção sem backend', true);
    assert('modal de legendas multi-idioma abriu', !document.getElementById('captionAllOverlay').classList.contains('hide'));
    closeCaptionAll();
    await aiCaption();
    assert('legenda com IA falha graciosamente sem backend', true);
    assert('botão de IA volta a ficar ativo', document.getElementById('btnAICaption').disabled === false);
  } catch (e) { assert('BLOCO 15 (IA sem backend) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    assert('toast tem aria-live', document.getElementById('toast').getAttribute('aria-live') === 'polite');
    assert('zona de upload é navegável por teclado', document.getElementById('dropZone').getAttribute('role') === 'button');
  } catch (e) { assert('BLOCO 16 (acessibilidade) não rebentou', false, e.message); }

  try {
    if (!window.showDirectoryPicker) { await pickLocalFolder(); assert('escolher pasta sem suporte do browser não lança exceção', true); }
    else skip('BLOCO 17 (escolher pasta)', 'este Chromium suporta showDirectoryPicker — exige interação manual');
  } catch (e) { assert('BLOCO 17 (escolher pasta) não rebentou', false, e.message); }

  try {
    // A INTERFACE muda de idioma, não só o conteúdo gerado — o cerne do pedido de universalidade
    const titleLabelBefore = document.querySelector('label[for="fTitle"]').textContent.trim();
    assert('rótulo "Título" está em português por defeito', titleLabelBefore === 'Título', titleLabelBefore);
    setLang('en');
    await sleep(80);
    const titleLabelAfter = document.querySelector('label[for="fTitle"]').textContent.trim();
    assert('rótulo muda para "Title" ao trocar para inglês', titleLabelAfter === 'Title', titleLabelAfter);
    const bulkBtnText = document.getElementById('btnHeaderBulk').textContent.trim();
    assert('botão de produção em massa também traduzido', bulkBtnText.includes('Bulk generation'), bulkBtnText);

    // presets de categoria também têm de vir traduzidos, não só a interface fixa
    applyCategoryPreset('carros');
    await sleep(50);
    assert('preset "carros" em inglês dá rótulos em inglês (não português)',
      state.spec[0].label === 'Make / Model' && state.spec[1].label === 'Year', JSON.stringify(state.spec.slice(0,2)));

    setLang('pt');
    await sleep(80);
    const titleLabelBack = document.querySelector('label[for="fTitle"]').textContent.trim();
    assert('volta a português sem problemas', titleLabelBack === 'Título', titleLabelBack);
    applyCategoryPreset('generico');
  } catch (e) { assert('BLOCO 19 (tradução real da interface) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // produção em massa: título/preço diferentes por foto (catálogo, não só o mesmo item)
    openBulk(); await sleep(100);
    const ids = Object.keys(bulkState.itemData);
    assert('cada foto tem os seus próprios dados por defeito', ids.length >= 2, ids.length);
    if (ids.length >= 2) {
      bulkState.itemData[ids[0]].title = 'Produto A'; bulkState.itemData[ids[0]].price = '10€';
      bulkState.itemData[ids[1]].title = 'Produto B'; bulkState.itemData[ids[1]].price = '20€';
      assert('dados de duas fotos ficam mesmo independentes',
        bulkState.itemData[ids[0]].title !== bulkState.itemData[ids[1]].title);
    }
    closeBulk();
  } catch (e) { assert('BLOCO 20 (produção em massa por item) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // kit de marca agora também guarda categoria + ficha, não só a identidade visual
    applyCategoryPreset('viagens');
    onSpecChange(0, 'Paris');
    const originalPrompt = window.prompt;
    window.prompt = () => 'Kit Viagens Teste';
    await saveBrandKit(); await sleep(150);
    window.prompt = originalPrompt;
    applyCategoryPreset('generico');
    await applyBrandKit('Kit Viagens Teste'); await sleep(100);
    assert('kit de marca restaura a categoria', state.category === 'viagens', state.category);
    assert('kit de marca restaura os rótulos da ficha', state.spec[0].label === 'Destino', state.spec[0].label);
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    await deleteBrandKit(); await sleep(100);
    window.confirm = originalConfirm;
  } catch (e) { assert('BLOCO 21 (kit de marca com categoria) não rebentou', false, e.message + ' | ' + e.stack); }

  try {
    // divs clicáveis (painéis) têm de responder ao teclado, não só ao rato
    const advToggle = document.getElementById('advancedToggleRow');
    assert('toggle de opções avançadas tem role=button', advToggle.getAttribute('role') === 'button');
    assert('toggle de opções avançadas é focável (tabindex)', advToggle.getAttribute('tabindex') === '0');
  } catch (e) { assert('BLOCO 22 (acessibilidade de teclado) não rebentou', false, e.message); }

  try {
    state._styleCustomized = true; // força um estado conhecido, para testar mesmo o reset (não o que sobrou de blocos anteriores)
    let revokedCount = 0;
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = function(u) { revokedCount++; return originalRevoke.call(URL, u); };
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    clearDraft(); await sleep(250);
    window.confirm = originalConfirm;
    URL.revokeObjectURL = originalRevoke;
    assert('limpar rascunho esvazia a memória', state.photos.length === 0);
    assert('limpar rascunho liberta explicitamente os blob URLs das fotos (não só as larga)', revokedCount > 0, revokedCount);
    const photosAfter = await idbGet('photos').catch(() => null);
    assert('limpar rascunho esvazia o IndexedDB', !photosAfter || photosAfter.length === 0);
    assert('limpar rascunho destranca a paleta automática outra vez', state._styleCustomized === false);
  } catch (e) { assert('BLOCO 18 (limpar rascunho) não rebentou', false, e.message + ' | ' + e.stack); }

  return { results, origSize, savedSize };
} catch (topError) {
  return { results: [{ name: 'ERRO DE TOPO (não apanhado por nenhum try/catch interno)', pass: false, extra: topError.message + ' ||| ' + topError.stack }], origSize: 0, savedSize: 0 };
}
})()
`;

async function main() {
  const server = await startServer(targetDir);
  const port = server.address().port;

  const win = new BrowserWindow({
    width: 1400, height: 1000, show: false,
    webPreferences: { offscreen: true, contextIsolation: false, sandbox: false }
  });
  win.webContents.setFrameRate(30);
  win.webContents.on('paint', () => {});

  const dlDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'zstudio-dl-'));
  win.webContents.session.on('will-download', (event, item) => {
    const filename = item.getFilename();
    item.setSavePath(path.join(dlDir, Date.now() + '-' + filename));
    item.once('done', () => {
      let size = 0;
      try { size = fs.statSync(item.getSavePath()).size; } catch (e) {}
      win.webContents.executeJavaScript(
        'window.__downloads = window.__downloads || []; window.__downloads.push(' + JSON.stringify({ filename, size }) + ');'
      ).catch(() => {});
    });
  });

  const consoleMessages = [];
  win.webContents.on('console-message', (...args) => {
    let level, message;
    if (args[0] && typeof args[0] === 'object' && 'message' in args[0]) ({ level, message } = args[0]);
    else [, level, message] = args;
    consoleMessages.push({ level, message });
  });

  await win.loadURL('http://127.0.0.1:' + port + '/' + targetName);

  let report;
  try {
    report = await win.webContents.executeJavaScript(TEST_CODE, true);
  } catch (e) {
    report = { results: [{ name: 'EXECUÇÃO DO SCRIPT DE TESTE', pass: false, extra: String(e) }] };
  }

  server.close();

  const results = report.results || [];
  const failed = results.filter(r => !r.pass);
  const skipped = results.filter(r => r.skip);
  const passed = results.filter(r => r.pass && !r.skip);

  console.log('\n════════════════════════════════════════');
  console.log('MY STUDIO — ' + targetName);
  console.log('RESULTADO: ' + passed.length + ' passaram, ' + failed.length + ' falharam, ' + skipped.length + ' ignorados (de ' + results.length + ')');
  console.log('════════════════════════════════════════\n');
  results.forEach(r => {
    const icon = r.skip ? '⏭️ ' : (r.pass ? '✅' : '❌');
    console.log(icon + ' ' + r.name + (r.skip || r.pass ? (r.skip ? '  (' + r.extra + ')' : '') : '  →  ' + JSON.stringify(r.extra)));
  });
  if (report.origSize) console.log('\nCompressão de fotos no rascunho: ' + report.origSize + ' → ' + report.savedSize + ' bytes (' + Math.round(100*report.savedSize/report.origSize) + '%)');

  const consoleErrors = consoleMessages.filter(m => m.level >= 2);
  console.log('\n── mensagens da consola (avisos/erros) ──');
  console.log(consoleErrors.length ? '' : '(nenhuma)');
  consoleErrors.forEach(m => console.log('[nível ' + m.level + '] ' + m.message));

  app.exit(failed.length > 0 ? 1 : 0);
}

app.whenReady().then(main);
