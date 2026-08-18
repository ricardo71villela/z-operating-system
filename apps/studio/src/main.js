// src/main.js — estado, rendering (canvas), UI, exportações, IndexedDB.
// Depende de src/data/i18n.js e src/data/categories.js (concatenados antes
// deste ficheiro pelo scripts/build.js — precisam de estar definidos
// primeiro, já que main.js lê I18N/UI_STRINGS/CATEGORY_* diretamente).
// Extraído de app/my-studio.html — Phase 2 da auditoria de estabilização.

// [FORMATS + state extraídos para src/state/state.js — ver ficheiro]
// [idbOpen/idbSet/idbGet/idbDelete extraídos para src/storage/indexeddb.js — ver ficheiro]
let _saveDraftTimer = null;
// Contador de geração: uma limpeza de rascunho incrementa isto, para que uma
// gravação automática que já estava "em voo" (ex.: a meio da compressão de uma
// foto) não ressuscite dados que acabaram de ser apagados.
let _draftGeneration = 0;
function scheduleSaveDraft() {
  clearTimeout(_saveDraftTimer);
  _saveDraftTimer = setTimeout(saveDraft, 900);
}
// Reduz o tamanho das fotos antes de as guardar localmente — sem isto, fotos de
// telemóvel em alta resolução esgotam depressa o espaço do browser. A foto original
// usada na edição/exportação nunca é tocada, isto é só para a cópia do rascunho.
const compressedCache = new WeakMap();
function compressImageFile(file, maxDim, quality) {
  if (compressedCache.has(file)) return Promise.resolve(compressedCache.get(file));
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale)); height = Math.max(1, Math.round(height * scale));
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      c.toBlob(blob => {
        URL.revokeObjectURL(url);
        const result = blob || file;
        compressedCache.set(file, result);
        resolve(result);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
async function saveDraft() {
  const myGen = _draftGeneration;
  try {
    const meta = {
      lang: state.lang, format: state.format, template: state.template, bg: state.bg,
      smartCrop: state.smartCrop, filter: state.filter, category: state.category, styleCustomized: state._styleCustomized,
      brand: { name: state.brand.name, site: state.brand.site, sub: state.brand.sub, phone: state.brand.phone,
                accent: state.brand.accent, showWatermark: state.brand.showWatermark, langs: [...state.brand.langs] },
      content: { title: state.title, price: state.price, loc: state.loc, badge: state.badge, spec: state.spec,
                 energyRating: state.energyRating, starRating: state.starRating, allergens: state.allergens, sizes: state.sizes,
                 financeMonths: state.financeMonths, financeDownPct: state.financeDownPct, financeAPR: state.financeAPR,
                 cropAdjust: state.cropAdjust },
      caption: document.getElementById('caption') ? document.getElementById('caption').value : ''
    };
    if (myGen !== _draftGeneration) return; // uma limpeza aconteceu entretanto
    await idbSet('meta', meta);
    const files = state.photoFiles || [];
    if (files.length) {
      const compressed = await Promise.all(files.map(f => compressImageFile(f, 1600, 0.82)));
      if (myGen !== _draftGeneration) return; // idem — não voltar a escrever por cima de uma limpeza
      await idbSet('photos', compressed);
    } else if (myGen === _draftGeneration) {
      await idbDelete('photos');
    }
    if (state._customLogoFile && myGen === _draftGeneration) await idbSet('logo', state._customLogoFile);
  } catch (e) { console.warn('Não foi possível guardar o rascunho local:', e); }
}
async function loadDraftIfAny() {
  try {
    const meta = await idbGet('meta');
    if (!meta) return;
    if (meta.brand) {
      Object.assign(state.brand, meta.brand, { langs: new Set(meta.brand.langs && meta.brand.langs.length ? meta.brand.langs : ['pt', 'en']) });
      document.getElementById('brandName').value = state.brand.name || '';
      document.getElementById('brandSite').value = state.brand.site || '';
      document.getElementById('brandSub').value = state.brand.sub || '';
      document.getElementById('brandPhone').value = state.brand.phone || '';
      document.getElementById('brandColor').value = state.brand.accent || '#B8935A';
      document.getElementById('brandWatermark').checked = state.brand.showWatermark !== false;
      setGoldVar(state.brand.accent || '#B8935A');
      document.querySelectorAll('#langsSeg button').forEach(b => b.classList.toggle('active', state.brand.langs.has(b.dataset.l)));
    }
    state.lang = meta.lang || state.lang;
    const restoredLangSwitch = document.getElementById('langSwitch');
    if (restoredLangSwitch) restoredLangSwitch.value = state.lang;
    document.documentElement.lang = state.lang;
    applyUIStrings(); // se o rascunho trouxer outro idioma, a interface já arranca traduzida
    state.smartCrop = meta.smartCrop !== false;
    state.filter = meta.filter || 'auto';
    state.category = meta.category || 'generico';
    state._styleCustomized = !!meta.styleCustomized;
    document.getElementById('fSmartCrop').checked = state.smartCrop;
    document.getElementById('fFilter').value = state.filter;
    if (meta.content) {
      state.title = meta.content.title || ''; state.price = meta.content.price || '';
      state.loc = meta.content.loc || ''; state.badge = meta.content.badge || '';
      state.spec = meta.content.spec || [{label:'',value:''},{label:'',value:''},{label:'',value:''},{label:'',value:''}];
      state.energyRating = meta.content.energyRating || ''; state.starRating = meta.content.starRating || 0;
      state.allergens = meta.content.allergens || []; state.sizes = meta.content.sizes || [];
      state.financeMonths = meta.content.financeMonths || 60; state.financeDownPct = meta.content.financeDownPct ?? 20;
      state.financeAPR = meta.content.financeAPR ?? 7.9;
      state.cropAdjust = meta.content.cropAdjust || {};
    }
    const photos = await idbGet('photos');
    if (photos && photos.length) {
      state.photoFiles = photos;
      state.photos = photos.map(f => URL.createObjectURL(f));
      state.carPhotos = state.photos.slice(0, 10);
      state.photo = state.photos[0];
    }
    const logoBlob = await idbGet('logo');
    if (logoBlob) {
      state._customLogoFile = logoBlob;
      const url = URL.createObjectURL(logoBlob);
      state.brand.logoUrl = url;
      // idem: não mexe no #headerLogo — esse é sempre o logótipo ZOS da app
    }
    if (meta.format) state.format = meta.format;
    if (meta.template) state.template = meta.template;
    if (meta.bg) state.bg = meta.bg;
    setFormat(state.format); setTemplate(state.template); setBg(state.bg);
    const hint = document.getElementById('draftHintText');
    if (photos && photos.length && hint) hint.textContent = '📂 Rascunho anterior recuperado (' + photos.length + ' foto(s))';
  } catch (e) { console.warn('Sem rascunho anterior ou erro ao recuperar:', e); }
}

// ═══════════════════════════════════════════════════════════════
//  DESFAZER / REFAZER — histórico leve dos campos de texto (título,
//  preço, localização, selo, legenda). Ctrl/Cmd+Z e Ctrl/Cmd+Shift+Z.
// ═══════════════════════════════════════════════════════════════
let historyStack = [], historyIndex = -1, _histTimer = null;
function pushHistory() {
  clearTimeout(_histTimer);
  _histTimer = setTimeout(() => {
    const captionEl = document.getElementById('caption');
    const snap = { title: state.title, price: state.price, loc: state.loc, badge: state.badge,
                    caption: captionEl ? captionEl.value : '' };
    const last = historyStack[historyIndex];
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(snap);
    if (historyStack.length > 50) historyStack.shift();
    historyIndex = historyStack.length - 1;
  }, 500);
}
function applyHistorySnap(snap) {
  if (!snap) return;
  state.title = snap.title; state.price = snap.price; state.loc = snap.loc; state.badge = snap.badge;
  const fTitle = document.getElementById('fTitle'), fPrice = document.getElementById('fPrice'),
        fLoc = document.getElementById('fLoc'), fBadge = document.getElementById('fBadge'), cap = document.getElementById('caption');
  if (fTitle) fTitle.value = snap.title; if (fPrice) fPrice.value = snap.price;
  if (fLoc) fLoc.value = snap.loc; if (fBadge) fBadge.value = snap.badge;
  if (cap) cap.value = snap.caption;
  draw();
}
function undoEdit() { if (historyIndex > 0) { historyIndex--; applyHistorySnap(historyStack[historyIndex]); } }
function redoEdit() { if (historyIndex < historyStack.length - 1) { historyIndex++; applyHistorySnap(historyStack[historyIndex]); } }
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  if (e.shiftKey) redoEdit(); else undoEdit();
});

// ═══════════════════════════════════════════════════════════════
//  KITS DE MARCA — perfis guardados (nome, cores, site, idiomas…)
//  para quem gere várias marcas/agentes na mesma app.
// ═══════════════════════════════════════════════════════════════
async function refreshBrandKitSelect() {
  const sel = document.getElementById('brandKitSelect');
  if (!sel) return;
  const kits = (await idbGet('kits').catch(() => null)) || {};
  const cur = sel.value;
  // Usa APIs DOM seguras (createElement + textContent), não innerHTML —
  // o nome do kit é texto escrito livremente pela pessoa (via prompt()) e
  // nunca deve ser interpretado como HTML. Vulnerabilidade XSS real,
  // confirmada e corrigida numa auditoria de segurança.
  sel.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = ''; noneOpt.textContent = '— nenhum —';
  sel.appendChild(noneOpt);
  Object.keys(kits).forEach(n => {
    const opt = document.createElement('option');
    opt.value = n; opt.textContent = n;
    sel.appendChild(opt);
  });
  if (kits[cur]) sel.value = cur;
}
async function saveBrandKit() {
  const name = prompt('Nome para este kit de marca (ex.: "Loja Sunset — Calçado"):');
  if (!name) return;
  const kits = (await idbGet('kits').catch(() => null)) || {};
  kits[name] = { name: state.brand.name, site: state.brand.site, sub: state.brand.sub, phone: state.brand.phone,
                 accent: state.brand.accent, showWatermark: state.brand.showWatermark, langs: [...state.brand.langs],
                 category: state.category, spec: state.spec.map(s => ({ label: s.label, value: '' })) };
  await idbSet('kits', kits);
  await refreshBrandKitSelect();
  document.getElementById('brandKitSelect').value = name;
  toast('Kit "' + name + '" guardado');
}
async function applyBrandKit(name) {
  if (!name) return;
  const kits = (await idbGet('kits').catch(() => null)) || {};
  const k = kits[name]; if (!k) return;
  Object.assign(state.brand, k, { langs: new Set(k.langs && k.langs.length ? k.langs : ['pt', 'en']) });
  document.getElementById('brandName').value = state.brand.name || '';
  document.getElementById('brandSite').value = state.brand.site || '';
  document.getElementById('brandSub').value = state.brand.sub || '';
  document.getElementById('brandPhone').value = state.brand.phone || '';
  document.getElementById('brandColor').value = state.brand.accent || '#B8935A';
  document.getElementById('brandWatermark').checked = state.brand.showWatermark !== false;
  setGoldVar(state.brand.accent || '#B8935A');
  document.querySelectorAll('#langsSeg button').forEach(b => b.classList.toggle('active', state.brand.langs.has(b.dataset.l)));
  renderLangSwitch();
  // um kit também guarda a categoria/ficha típica deste negócio (só os rótulos, não valores antigos)
  if (k.category && k.spec) {
    state.category = k.category;
    document.getElementById('fCategory').value = k.category;
    k.spec.forEach((s, i) => {
      if (!state.spec[i]) return;
      state.spec[i].label = s.label || '';
      const lblEl = document.getElementById('specLabel' + i);
      if (lblEl) lblEl.value = s.label || '';
    });
  }
  draw();
  scheduleSaveDraft();
  toast('Kit "' + name + '" aplicado');
}
async function deleteBrandKit() {
  const sel = document.getElementById('brandKitSelect');
  const name = sel.value; if (!name) return;
  if (!confirm('Apagar o kit "' + name + '"?')) return;
  const kits = (await idbGet('kits').catch(() => null)) || {};
  delete kits[name];
  await idbSet('kits', kits);
  await refreshBrandKitSelect();
  toast('Kit apagado');
}

// [I18N extraído para src/data/i18n.js — ver ficheiro]

// ═══════════════════════════════════════════════════════════════
//  TEXTOS DA INTERFACE — traduzidos nos 6 idiomas suportados.
//  Diferente do I18N (que traduz o CONTEÚDO gerado — posts, legendas),
//  isto traduz a própria interface de edição. Aplicado por applyUIStrings()
//  sempre que o idioma ativo muda — a app deixa de "falar só português"
//  para quem trabalha noutra língua.
// ═══════════════════════════════════════════════════════════════
// [UI_STRINGS extraído para src/data/i18n.js — ver ficheiro]
function uiT(key) {
  const dict = UI_STRINGS[state.lang] || UI_STRINGS.en;
  return (key in dict) ? dict[key] : (UI_STRINGS.en[key] || '');
}
function applyUIStrings() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = uiT(key);
    if (val) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    const val = uiT(key);
    if (val) el.innerHTML = val;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.dataset.i18nPh;
    const val = uiT(key);
    if (val) el.placeholder = val;
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.dataset.i18nAria;
    const val = uiT(key);
    if (val) el.setAttribute('aria-label', val);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    const val = uiT(key);
    if (val) el.title = val;
  });
}

// Junta a chamada-para-ação traduzida ao telefone da marca (se estiver definido) — nunca fixo a uma marca específica.
function ctaFor(lang) {
  const base = (I18N[lang] || I18N.pt).cta;
  return state.brand.phone ? base + '\n📞 ' + state.brand.phone : base;
}

const imgCache = {};
function loadImg(url) {
  if (imgCache[url]) return imgCache[url];
  imgCache[url] = new Promise(res => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { res(img); precomputeFaceBoost(img); };
    img.onerror = () => res(null);
    img.src = url;
  });
  return imgCache[url];
}
// Deteção de rostos nativa do browser (Chrome/Edge em alguns SO) — reforça o recorte
// inteligente sem acrescentar nenhuma biblioteca externa. Onde não existe, o recorte
// continua a funcionar pela heurística de contraste + tom de pele já existente.
const faceBoostCache = new WeakMap();
async function precomputeFaceBoost(img) {
  if (!img || !('FaceDetector' in window) || faceBoostCache.has(img)) return;
  faceBoostCache.set(img, null); // marca como "em curso" para não repetir o pedido
  try {
    const fd = new FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
    const faces = await fd.detect(img);
    if (!faces || !faces.length) return;
    const AW = 120, AH = Math.max(1, Math.round(AW * img.height / img.width));
    const boost = new Float32Array(AW * AH);
    faces.forEach(f => {
      const bb = f.boundingBox;
      const x0 = Math.max(0, Math.floor((bb.x / img.width) * AW));
      const x1 = Math.min(AW, Math.ceil(((bb.x + bb.width) / img.width) * AW));
      const y0 = Math.max(0, Math.floor((bb.y / img.height) * AH));
      const y1 = Math.min(AH, Math.ceil(((bb.y + bb.height) / img.height) * AH));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) boost[y * AW + x] += 260;
    });
    faceBoostCache.set(img, boost);
    saliencyCache.delete(img); // força recalcular o mapa de interesse já com o reforço
    if (state.img === img) draw(); // refresca o preview se é a imagem atualmente visível
  } catch (e) { /* silencioso — cai para a heurística de contraste/tom de pele */ }
}
// ═══ CARREGAMENTO ═══
async function loadAll() {
  await loadDraftIfAny(); // recupera fotos/textos de uma sessão anterior, se existirem (só neste dispositivo)
  syncUI(); // sincroniza a UI com o estado inicial (sem chamadas de rede)
}

// ═══ SLIDES (carrossel) ═══
function buildSlides(goto) {
  // capa (arte completa) + slides de foto para as restantes fotos do carrossel
  const extra = state.photos.filter(u => state.carPhotos.includes(u) && u !== state.photo);
  state.slides = [{ type: 'cover' }, ...extra.map(u => ({ type: 'photo', url: u }))];
  state.slideIdx = Math.min(goto ?? state.slideIdx, state.slides.length - 1);
  updateCarouselUI();
  syncSlide();
  buildCaption();
}

function updateCarouselUI() {
  const multi = state.slides.length > 1;
  document.getElementById('slideNav').classList.toggle('on', multi);
  document.getElementById('btnCarousel').classList.toggle('hide', !multi);
  document.getElementById('btnGridView').classList.toggle('hide', !multi);
}

function syncSlide() {
  document.getElementById('slideCounter').textContent = (state.slideIdx + 1) + ' / ' + Math.max(state.slides.length, 1);
  draw();
}
function stepSlide(d) {
  if (!state.slides.length) return;
  state.slideIdx = (state.slideIdx + d + state.slides.length) % state.slides.length;
  syncSlide();
}
function onEditBadge(v) {
  state.badge = v;
  draw();
}
function onEditTitle(v) {
  state.title = v;
  draw();
}
// ═══ SINCRONIZAÇÃO DA INTERFACE ═══
// Não há vários "modos" — a app trabalha sempre a partir de Upload. Esta função
// só existe para (re)sincronizar a UI com o estado (chamada no arranque e depois
// de recuperar um rascunho).
function syncUI() {
  state.slides = state.slides || []; state.slideIdx = state.slideIdx || 0;
  document.getElementById('fTitle').value = state.title;
  document.getElementById('fPrice').value = state.price;
  document.getElementById('fLoc').value = state.loc;
  document.getElementById('fBadge').value = state.badge;
  document.getElementById('fCategory').value = state.category || 'generico';
  state.spec.forEach((s, i) => {
    const lbl = document.getElementById('specLabel' + i), val = document.getElementById('specValue' + i);
    if (lbl) lbl.value = s.label || ''; if (val) val.value = s.value || '';
  });
  renderPhotoGrid();
  renderBadgeChips();
  renderCategoryExtras();
  syncCropAdjustUI();
  if (state.photo) loadImg(state.photo).then(img => { state.img = img; buildSlides(0); });
  else { state.img = null; buildSlides(0); }
  buildCaption();
}

function renderPhotoGrid() {
  const grid = document.getElementById('photoGrid');
  grid.innerHTML = state.photos.map((u, idx) => `
    <div class="ph ${u === state.photo ? 'sel' : ''} ${state.carPhotos.includes(u) ? 'incar' : ''}" draggable="true"
         ondragstart="onPhotoDragStart(event, ${idx})" ondragover="onPhotoDragOver(event)" ondrop="onPhotoDrop(event, ${idx})" ondragend="onPhotoDragEnd(event)">
      <img src="${u}" loading="lazy" onclick="pickPhoto('${encodeURI(u)}')">
      <button class="tick" onclick="toggleCarPhoto('${encodeURI(u)}')" aria-label="Incluir no carrossel">✓</button>
      <button class="ph-remove" onclick="event.stopPropagation(); removePhoto('${encodeURI(u)}')" aria-label="Eliminar esta foto" title="Eliminar esta foto">✕</button>
    </div>`).join('');
  updateProgressiveDisclosure();
  }
async function removePhoto(url) {
  const u = decodeURI(url);
  const idx = state.photos.indexOf(u);
  if (idx === -1) return;
  state.photos = state.photos.filter(x => x !== u);
  state.carPhotos = state.carPhotos.filter(x => x !== u);
  delete state.cropAdjust[u];
  try { URL.revokeObjectURL(u); } catch (e) {}
  if (state.photo === u) {
    const next = state.photos[0] || null;
    state.photo = next;
    if (next) {
      state.img = await loadImg(next);
      if (!state.carPhotos.includes(next)) state.carPhotos.unshift(next);
    } else {
      state.img = null;
    }
    syncCropAdjustUI();
  }
  renderPhotoGrid();
  buildSlides(0);
  await draw();
  scheduleSaveDraft();
}
// ═══════════════════════════════════════════════════════════════
//  REVELAÇÃO PROGRESSIVA — a primeira vista mostra só "carrega uma
//  foto"; formato/template/fundo e as ferramentas de foto (recorte,
//  filtro) só aparecem depois de haver alguma coisa para trabalhar,
//  ou se a pessoa pedir explicitamente para os ver já.
// ═══════════════════════════════════════════════════════════════
function updateProgressiveDisclosure() {
  const advOptions = document.getElementById('advancedOptions');
  const photoTools = document.getElementById('photoToolsPanel');
  const toggleRow = document.getElementById('advancedToggleRow');
  if (!advOptions) return; // ainda a carregar o HTML
  const hasContent = state._advancedForced || (state.photos || []).length > 0;
  advOptions.classList.toggle('hide', !hasContent);
  if (photoTools) photoTools.classList.toggle('hide', !((state.photos || []).length > 0 || state._advancedForced));
  if (toggleRow) toggleRow.classList.toggle('hide', hasContent);
}
function forceShowAdvanced() {
  state._advancedForced = true;
  updateProgressiveDisclosure();
}
// Arrastar para reordenar (desktop) — a ordem do grid define a ordem do carrossel.
let _dragFromIdx = null;
function onPhotoDragStart(e, idx) { _dragFromIdx = idx; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function onPhotoDragOver(e) { e.preventDefault(); }
function onPhotoDrop(e, idx) {
  e.preventDefault();
  if (_dragFromIdx === null || _dragFromIdx === idx) return;
  const arr = state.photos.slice();
  const [moved] = arr.splice(_dragFromIdx, 1);
  arr.splice(idx, 0, moved);
  state.photos = arr;
  // mantém a Colagem/carrossel sincronizados com a nova ordem — arrastar aqui
  // é como se edita a posição das fotos numa colagem, sem precisar de outra UI
  state.carPhotos = state.photos.filter(x => state.carPhotos.includes(x));
  renderPhotoGrid();
  buildSlides(state.slideIdx);
  scheduleSaveDraft();
}
function onPhotoDragEnd(e) { e.currentTarget.classList.remove('dragging'); _dragFromIdx = null; }

function pickPhoto(url) {
  state.photo = decodeURI(url);
  if (!state.carPhotos.includes(state.photo)) state.carPhotos.unshift(state.photo);
  renderPhotoGrid();
  syncCropAdjustUI(); // cada foto pode ter o seu próprio ajuste de enquadramento
  loadImg(state.photo).then(img => { state.img = img; buildSlides(0); });
}

function toggleCarPhoto(url) {
  const u = decodeURI(url);
  if (state.carPhotos.includes(u)) {
    if (u === state.photo) return; // a capa fica sempre no carrossel
    state.carPhotos = state.carPhotos.filter(x => x !== u);
  } else {
    state.carPhotos = state.photos.filter(x => x === state.photo || state.carPhotos.includes(x) || x === u);
  }
  renderPhotoGrid();
  buildSlides(state.slideIdx);
}

// ═══════════════════════════════════════════════════════════════
//  UPLOAD DIRETO — fotos do telemóvel, máquina fotográfica ou pasta,
//  para quem não tem (ou não quer usar) uma base de dados ligada.
// ═══════════════════════════════════════════════════════════════
function onDropZoneDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag'); }
function onDropZoneDragLeave(e) { e.currentTarget.classList.remove('drag'); }
function onDropZoneDrop(e) {
  e.preventDefault(); e.currentTarget.classList.remove('drag');
  handleUploadFiles(e.dataTransfer.files);
}
// Extrai um fotograma de um vídeo (ficheiro) e devolve como se fosse uma foto normal —
// não gera vídeo, só uma capa a partir dele. Gerar publicações em vídeo fica para depois.
function extractVideoFrame(file, atFraction) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url; video.muted = true; video.playsInline = true; video.preload = 'metadata';
    const cleanup = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => {
      const t = Math.max(0, Math.min((video.duration || 1) * (atFraction ?? 0.15), Math.max(0, (video.duration || 1) - 0.05)));
      video.currentTime = t;
    };
    video.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = video.videoWidth || 1280; c.height = video.videoHeight || 720;
        c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
        c.toBlob(blob => {
          cleanup();
          if (!blob) { reject(new Error('sem fotograma')); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '-frame.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.9);
      } catch (e) { cleanup(); reject(e); }
    };
    video.onerror = () => { cleanup(); reject(new Error('vídeo inválido ou formato não suportado')); };
  });
}
// Limites de upload — sensatos, mas configuráveis num único sítio.
// A app tem de falhar bem em dispositivos com pouca memória, não travar.
const UPLOAD_LIMITS = { maxFileMB: 25, maxFilesPerBatch: 30, maxTotalPhotos: 60 };
async function handleUploadFiles(fileList) {
  const all = [...fileList];
  const oversized = all.filter(f => f.size > UPLOAD_LIMITS.maxFileMB * 1024 * 1024);
  const withinSize = all.filter(f => f.size <= UPLOAD_LIMITS.maxFileMB * 1024 * 1024);
  const batch = withinSize.slice(0, UPLOAD_LIMITS.maxFilesPerBatch);
  if (oversized.length) toast(oversized.length + ' ficheiro(s) acima de ' + UPLOAD_LIMITS.maxFileMB + 'MB foram ignorados');
  if (withinSize.length > UPLOAD_LIMITS.maxFilesPerBatch) toast('Só as primeiras ' + UPLOAD_LIMITS.maxFilesPerBatch + ' fotos deste carregamento foram usadas');
  const imageFiles = batch.filter(f => f.type.startsWith('image/'));
  const videoFiles = batch.filter(f => f.type.startsWith('video/'));
  if (!imageFiles.length && !videoFiles.length) return;
  let fromVideo = [];
  if (videoFiles.length) {
    toast('A extrair fotograma de ' + videoFiles.length + ' vídeo(s)…');
    const attempts = await Promise.allSettled(videoFiles.map(f => extractVideoFrame(f)));
    fromVideo = attempts.filter(a => a.status === 'fulfilled').map(a => a.value);
    const failed = attempts.length - fromVideo.length;
    if (failed) toast(failed + ' vídeo(s) não puderam ser processados (formato não suportado pelo browser)');
  }
  let files = [...imageFiles, ...fromVideo];
  const spaceLeft = UPLOAD_LIMITS.maxTotalPhotos - (state.photos || []).length;
  if (files.length > spaceLeft) {
    toast('Limite de ' + UPLOAD_LIMITS.maxTotalPhotos + ' fotos por sessão atingido — só foram adicionadas ' + Math.max(0, spaceLeft));
    files = files.slice(0, Math.max(0, spaceLeft));
  }
  if (!files.length) { toast('Não foi possível carregar nenhum ficheiro.'); return; }
  const urls = files.map(f => URL.createObjectURL(f));
  state.photos = [...new Set([...(state.photos || []), ...urls])];
  state.photoFiles = [...(state.photoFiles || []), ...files]; // mesma ordem — guardado para o rascunho local
  if (!state.carPhotos) state.carPhotos = [];
  state.carPhotos = [...new Set([...state.carPhotos, ...urls])].slice(0, 10);
  if (!state.photo) state.photo = state.photos[0];
  if (!state.carPhotos.includes(state.photo)) state.carPhotos.unshift(state.photo);
  renderPhotoGrid();
  syncCropAdjustUI();
  const img = await loadImg(state.photo);
  state.img = img;
  buildSlides(0);
  buildCaption();
  toast(files.length + ' ficheiro(s) carregado(s)' + (fromVideo.length ? ' (' + fromVideo.length + ' de vídeo)' : ''));
  const input = document.getElementById('uploadInput');
  if (input) input.value = '';
  scheduleSaveDraft();
}
// Escolher uma pasta local ou sincronizada (Google Drive/Dropbox/OneDrive no computador).
// Não liga a nenhuma conta cloud — lê os ficheiros que já estão sincronizados no disco.
// Disponível no Chrome/Edge (File System Access API); sem suporte no Safari/Firefox.
async function pickLocalFolder() {
  // Não existe equivalente nativo sensato para "escolher uma pasta do
  // computador sincronizada com a cloud" — é um conceito de ambiente de
  // trabalho, não de telemóvel. Em contexto nativo, dizemos isso claramente
  // em vez de tentar simular algo que não faz sentido no telemóvel.
  if (IS_NATIVE_PLATFORM) {
    toast('Escolher pasta é uma funcionalidade só para computador — no telemóvel, usa "Carregar fotos".');
    return;
  }
  if (!window.showDirectoryPicker) {
    toast('O teu browser não suporta escolher pastas diretamente — usa "arrastar ficheiros" ou o botão de escolher ficheiros.');
    return;
  }
  let dirHandle;
  try { dirHandle = await window.showDirectoryPicker(); }
  catch (e) { return; } // utilizador cancelou
  const btn = document.getElementById('btnFolderPicker');
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'A ler a pasta…';
  try {
    const found = [];
    const MAX = 60;
    async function walk(handle, depth) {
      if (found.length >= MAX || depth > 4) return;
      for await (const [name, entry] of handle.entries()) {
        if (found.length >= MAX) break;
        if (entry.kind === 'file') {
          if (/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(name) || /\.(mp4|mov|webm|m4v)$/i.test(name)) {
            found.push(entry);
          }
        } else if (entry.kind === 'directory') {
          await walk(entry, depth + 1);
        }
      }
    }
    await walk(dirHandle, 0);
    if (!found.length) { toast('Não encontrei fotos ou vídeos nessa pasta.'); return; }
    const files = await Promise.all(found.map(h => h.getFile()));
    await handleUploadFiles(files);
  } catch (e) {
    console.error(e);
    toast('Não foi possível ler a pasta — ' + (e.message || '').slice(0, 80));
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}
async function clearDraft() {
  if (!confirm('Apagar o rascunho guardado neste dispositivo (fotos, textos e marca)? Não afeta nada publicado.')) return;
  _draftGeneration++; // invalida qualquer gravação automática já em curso, mesmo a meio da compressão
  clearTimeout(_saveDraftTimer);
  await Promise.all([
    idbDelete('meta').catch(() => {}),
    idbDelete('photos').catch(() => {}),
    idbDelete('logo').catch(() => {})
  ]);
  // liberta explicitamente os blob URLs das fotos antes de os largar — sem isto,
  // o browser mantém os ficheiros na memória até a página recarregar
  (state.photos || []).forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
  state.photos = []; state.carPhotos = []; state.photo = null; state.photoFiles = []; state.img = null;
  state.title = ''; state.price = ''; state.loc = ''; state.badge = '';
  state.spec = [ { label: '', value: '' }, { label: '', value: '' }, { label: '', value: '' }, { label: '', value: '' } ];
  state.energyRating = ''; state.starRating = 0; state.allergens = []; state.sizes = [];
  state.financeMonths = 60; state.financeDownPct = 20; state.financeAPR = 7.9;
  state.cropAdjust = {}; // as fotos foram todas apagadas — os ajustes de enquadramento delas também
  state._styleCustomized = false; // a próxima categoria escolhida volta a sugerir paleta automaticamente
  renderPhotoGrid();
  document.getElementById('fTitle').value = ''; document.getElementById('fPrice').value = '';
  document.getElementById('fLoc').value = ''; document.getElementById('fBadge').value = '';
  for (let i = 0; i < 4; i++) {
    document.getElementById('specLabel' + i).value = ''; document.getElementById('specValue' + i).value = '';
  }
  renderCategoryExtras();
  syncCropAdjustUI();
  buildSlides(0); buildCaption();
  toast('Rascunho apagado');
}

function setFormat(f) {
  state.format = f;
  document.querySelectorAll('#formatSeg button').forEach(b => b.classList.toggle('active', b.dataset.fmt === f));
  const [w, h] = FORMATS[f];
  const c = document.getElementById('preview'); c.width = w; c.height = h;
  draw();
  scheduleSaveDraft();
}
function setTemplate(t) {
  state.template = t;
  document.querySelectorAll('#tplSeg button').forEach(b => b.classList.toggle('active', b.dataset.tpl === t));
  draw();
  scheduleSaveDraft();
}
function setBg(bg) {
  state.bg = bg;
  document.querySelectorAll('#bgSeg button').forEach(b => b.classList.toggle('active', b.dataset.bg === bg));
  draw();
  scheduleSaveDraft();
}
// Só chamado a partir do clique da pessoa nos botões — marca como personalizado.
// setBg() sozinho fica disponível para uso interno (ex.: sugestão automática por categoria)
// sem interferir com essa marcação.
function onBgButtonClick(bg) {
  state._styleCustomized = true;
  setBg(bg);
}
// Paleta do post consoante o fundo (claro segue o site; degradé usa o champanhe --gold-pale)
// ── Auxiliares de cor: permitem derivar uma paleta inteira a partir de UMA
// cor de destaque (usado pela paleta automática por categoria, abaixo) ──
function hexToRgb(hex) {
  hex = String(hex || '#B8935A').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16) || 0xB8935A;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
// Define a cor de destaque E a sua versão RGB (para o CSS controlar opacidade —
// usado pelo brilho ambiente atrás da pré-visualização, que reage à categoria ativa)
function setGoldVar(hex) {
  document.documentElement.style.setProperty('--gold', hex);
  const [r, g, b] = hexToRgb(hex);
  document.documentElement.style.setProperty('--gold-rgb', `${r},${g},${b}`);
}
// desloca uma cor em direção ao branco (amt>0) ou ao preto (amt<0), amt entre -1 e 1
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  return rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
}
function rgbaStr(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
// Lê um número escrito à portuguesa/europeia ("295.000€", "16,50€", "24.900€")
// e devolve o valor numérico — usado pelos cálculos automáticos (€/m², mensalidade).
function parseEuroNumber(str) {
  if (!str) return NaN;
  let s = String(str).replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  // PT/FR/ES/DE/IT usam vírgula como separador decimal e ponto (ou espaço,
  // já removido acima) como separador de milhares. O inglês é o único dos
  // 6 idiomas suportados que faz o oposto — sem isto, "16.50" em modo EN
  // era lido como 1650 (confirmado como bug real na auditoria).
  if (state.lang === 'en') {
    s = s.replace(/,/g, ''); // vírgula = separador de milhares em EN — remove
    // o ponto, se existir, já é o separador decimal correto — não mexer
  } else if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/\./g, '');
  }
  return parseFloat(s);
}

function pal() {
  const accent = (state.brand.accent || '#B8935A');
  // a cor por defeito mantém exatamente a paleta original, byte a byte —
  // só entra no cálculo dinâmico quando a cor é mesmo diferente da base
  if (accent.toUpperCase() === '#B8935A') {
    if (state.bg === 'light') return {
      bg:'#F8F8F6', ink:'#0A0A0A', muted:'rgba(10,10,10,0.62)', faint:'rgba(10,10,10,0.42)',
      gold:'#8B6B3A', goldBig:'#B8935A', gradRGB:'248,248,246', badgeInk:'#FFFFFF', badgeBg:'#B8935A',
      rule:'rgba(139,107,58,0.55)', overPhoto:'#8B6B3A' };
    if (state.bg === 'grad') return {
      bg:'#EDE0C4', gradTop:'#F5EDD8', gradBottom:'#D9BF95',
      ink:'#1A1208', muted:'rgba(26,18,8,0.66)', faint:'rgba(26,18,8,0.45)',
      gold:'#8B6B3A', goldBig:'#8B6B3A', gradRGB:'237,224,196', badgeInk:'#F5EDD8', badgeBg:'#8B6B3A',
      rule:'rgba(139,107,58,0.6)', overPhoto:'#8B6B3A' };
    return {
      bg:'#0A0A0A', ink:'#FFFFFF', muted:'rgba(255,255,255,0.65)', faint:'rgba(255,255,255,0.35)',
      gold:'#B8935A', goldBig:'#D4AF7A', gradRGB:'10,10,10', badgeInk:'#0A0A0A', badgeBg:'#B8935A',
      rule:'rgba(184,147,90,0.5)', overPhoto:'#D4AF7A' };
  }
  // qualquer outra cor de destaque (manual ou sugerida pela categoria) —
  // deriva a paleta toda a partir dela, com a mesma lógica tonal do original
  const darker = shade(accent, -0.28);
  if (state.bg === 'light') return {
    bg:'#F8F8F6', ink:'#0A0A0A', muted:'rgba(10,10,10,0.62)', faint:'rgba(10,10,10,0.42)',
    gold: darker, goldBig: accent, gradRGB:'248,248,246', badgeInk:'#FFFFFF', badgeBg: accent,
    rule: rgbaStr(darker, 0.55), overPhoto: darker };
  if (state.bg === 'grad') {
    const top = shade(accent, 0.86), bottom = shade(accent, 0.58);
    return { bg: top, gradTop: top, gradBottom: bottom,
      ink:'#1A1208', muted:'rgba(26,18,8,0.66)', faint:'rgba(26,18,8,0.45)',
      gold: darker, goldBig: darker, gradRGB: hexToRgb(top).join(','), badgeInk: top, badgeBg: darker,
      rule: rgbaStr(darker, 0.6), overPhoto: darker };
  }
  return {
    bg:'#0A0A0A', ink:'#FFFFFF', muted:'rgba(255,255,255,0.65)', faint:'rgba(255,255,255,0.35)',
    gold: accent, goldBig: shade(accent, 0.32), gradRGB:'10,10,10', badgeInk:'#0A0A0A', badgeBg: accent,
    rule: rgbaStr(accent, 0.5), overPhoto: shade(accent, 0.32) };
}
// Preenche o fundo: sólido ou degradé vertical champanhe
function fillBg(ctx, W, H, P, y0, y1) {
  if (P.gradTop) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.gradTop); g.addColorStop(1, P.gradBottom);
    ctx.fillStyle = g;
  } else ctx.fillStyle = P.bg;
  ctx.fillRect(0, y0 ?? 0, W, (y1 ?? H) - (y0 ?? 0));
}
function setLang(l) {
  l = SUPPORTED_UI_LANGS.includes(l) ? l : 'en';
  state.lang = l;

  const languageSelector = document.getElementById('langSwitch');
  if (languageSelector) languageSelector.value = l;

  document.documentElement.lang = l;
  applyUIStrings(); // a interface muda de idioma junto com o conteúdo — não só o post gerado
  renderBadgeChips();
  renderCategoryExtras();
  buildCaption();
  draw();
}

// ═══ HELPERS DE DESENHO ═══
function coverDraw(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s, ih = img.height * s;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  RECORTE INTELIGENTE + OTIMIZAÇÃO AUTOMÁTICA DE IMAGEM
//  Em vez de recortar sempre o centro da foto, analisa uma versão
//  reduzida da imagem (mapa de "interesse" por contraste/detalhe +
//  leve preferência pelo centro) e escolhe a janela do recorte que
//  captura mais desse interesse. Corre inteiramente no browser,
//  sem pedir nada a nenhuma API.
// ═══════════════════════════════════════════════════════════════
const saliencyCache = new WeakMap();
function analyzeSaliency(img) {
  if (saliencyCache.has(img)) return saliencyCache.get(img);
  const AW = 120;
  const AH = Math.max(1, Math.round(AW * img.height / img.width));
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const actx = c.getContext('2d');
  let data;
  try { actx.drawImage(img, 0, 0, AW, AH); data = actx.getImageData(0, 0, AW, AH).data; }
  catch (e) { data = null; } // imagem sem CORS — cai para recorte centrado
  const interest = new Float32Array(AW * AH);
  if (data) {
    const lum = new Float32Array(AW * AH);
    for (let i = 0; i < AW * AH; i++) lum[i] = 0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2];
    for (let y = 0; y < AH; y++) {
      for (let x = 0; x < AW; x++) {
        const i = y*AW + x;
        const gx = (x > 0 && x < AW-1) ? Math.abs(lum[i+1] - lum[i-1]) : 0;
        const gy = (y > 0 && y < AH-1) ? Math.abs(lum[i+AW] - lum[i-AW]) : 0;
        const cx = (x/(AW-1)) - 0.5, cy = (y/(AH-1)) - 0.5;
        const centerBias = 1 - Math.min(1, Math.sqrt(cx*cx + cy*cy)) * 0.35;
        // deteção aproximada de tom de pele (regra RGB clássica) — dá mais peso a
        // rostos/pessoas no recorte, útil sobretudo em fotos de agentes e retratos.
        const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
        const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
        const isSkin = r > 95 && g > 40 && b > 20 && (maxc - minc) > 15 && Math.abs(r - g) > 15 && r > g && r > b;
        interest[i] = (gx + gy + (isSkin ? 40 : 0)) * centerBias;
      }
    }
  }
  // se já houver um resultado de deteção de rostos para esta imagem, reforça essas zonas
  const faceBoost = faceBoostCache.get(img);
  if (faceBoost) for (let i = 0; i < interest.length; i++) interest[i] += faceBoost[i];
  const result = { AW, AH, interest };
  saliencyCache.set(img, result);
  return result;
}
// Devolve, em fração (0..1), o centro ideal da janela de recorte ao longo de um eixo.
function bestAxisCenter(img, axis, cropFrac) {
  const { AW, AH, interest } = analyzeSaliency(img);
  if (cropFrac >= 0.999) return 0.5;
  if (axis === 'x') {
    const win = Math.max(1, Math.round(AW * cropFrac));
    const colSum = new Float32Array(AW);
    for (let x = 0; x < AW; x++) { let s = 0; for (let y = 0; y < AH; y++) s += interest[y*AW+x]; colSum[x] = s; }
    let best = 0, bestScore = -1, running = 0;
    for (let x = 0; x < AW; x++) {
      running += colSum[x];
      if (x >= win) running -= colSum[x - win];
      if (x >= win - 1 && running > bestScore) { bestScore = running; best = x - win + 1; }
    }
    return Math.min(1, Math.max(0, (best + win / 2) / AW));
  } else {
    const win = Math.max(1, Math.round(AH * cropFrac));
    const rowSum = new Float32Array(AH);
    for (let y = 0; y < AH; y++) { let s = 0; for (let x = 0; x < AW; x++) s += interest[y*AW+x]; rowSum[y] = s; }
    let best = 0, bestScore = -1, running = 0;
    for (let y = 0; y < AH; y++) {
      running += rowSum[y];
      if (y >= win) running -= rowSum[y - win];
      if (y >= win - 1 && running > bestScore) { bestScore = running; best = y - win + 1; }
    }
    return Math.min(1, Math.max(0, (best + win / 2) / AH));
  }
}
// Substituto de coverDraw: recorta pelo ponto de maior interesse (se ativo) e aplica
// o filtro de imagem escolhido (ver PHOTO_FILTERS).
const PHOTO_FILTERS = {
  none:  { label: 'Original', css: 'none' },
  auto:  { label: 'Automático', css: 'contrast(1.07) saturate(1.1) brightness(1.03)' },
  warm:  { label: 'Quente', css: 'contrast(1.05) saturate(1.25) brightness(1.04) sepia(0.14)' },
  cool:  { label: 'Frio', css: 'contrast(1.05) saturate(1.05) brightness(1.02) hue-rotate(-8deg)' },
  bw:    { label: 'Preto e branco', css: 'grayscale(1) contrast(1.1)' },
  vivid: { label: 'Vívido', css: 'saturate(1.45) contrast(1.12) brightness(1.02)' },
  soft:  { label: 'Suave', css: 'contrast(0.94) brightness(1.06) saturate(0.92)' }
};
function smartCoverDraw(ctx, img, x, y, w, h, applyManualAdjust) {
  if (!img) return;
  const targetAR = w / h, srcAR = img.width / img.height;
  let sx, sy, sw, sh;
  const adj = applyManualAdjust ? getCropAdjust(state.photo) : null;
  if (adj && (adj.zoom > 1.001 || adj.panX !== 0.5 || adj.panY !== 0.5)) {
    // ajuste manual — a pessoa corrigiu o enquadramento à mão
    const zoom = Math.max(1, Math.min(3, adj.zoom || 1));
    let baseW, baseH;
    if (srcAR > targetAR) { baseH = img.height; baseW = baseH * targetAR; }
    else { baseW = img.width; baseH = baseW / targetAR; }
    sw = baseW / zoom; sh = baseH / zoom;
    const freeW = Math.max(0, img.width - sw), freeH = Math.max(0, img.height - sh);
    sx = freeW * (adj.panX ?? 0.5); sy = freeH * (adj.panY ?? 0.5);
  } else if (state.smartCrop) {
    if (srcAR > targetAR) {
      sh = img.height; sw = sh * targetAR;
      const centerFrac = bestAxisCenter(img, 'x', sw / img.width);
      sx = Math.min(img.width - sw, Math.max(0, centerFrac * img.width - sw / 2)); sy = 0;
    } else {
      sw = img.width; sh = sw / targetAR;
      const centerFrac = bestAxisCenter(img, 'y', sh / img.height);
      sy = Math.min(img.height - sh, Math.max(0, centerFrac * img.height - sh / 2)); sx = 0;
    }
  } else {
    if (srcAR > targetAR) { sh = img.height; sw = sh * targetAR; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = sw / targetAR; sy = (img.height - sh) / 2; sx = 0; }
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.filter = (PHOTO_FILTERS[state.filter] || PHOTO_FILTERS.auto).css;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.filter = 'none';
  ctx.restore();
}
// Devolve o ajuste manual de enquadramento de uma foto (ou o valor neutro se
// nunca tiver sido ajustada). url=null (fotos da Colagem/Antes-Depois, que não
// são "a capa") nunca têm ajuste manual — só a foto principal pode ser ajustada.
function getCropAdjust(url) {
  if (!url || !state.cropAdjust || !state.cropAdjust[url]) return { panX: 0.5, panY: 0.5, zoom: 1 };
  return state.cropAdjust[url];
}
function onCropAdjustChange(field, value) {
  if (!state.photo) return;
  if (!state.cropAdjust[state.photo]) state.cropAdjust[state.photo] = { panX: 0.5, panY: 0.5, zoom: 1 };
  state.cropAdjust[state.photo][field] = value;
  draw();
  scheduleSaveDraft();
}
function resetCropAdjust() {
  if (!state.photo) return;
  delete state.cropAdjust[state.photo];
  syncCropAdjustUI();
  draw();
  scheduleSaveDraft();
}
// Cada foto guarda o seu próprio ajuste — ao trocar de capa, os controlos
// têm de refletir o que ESTA foto já tem guardado (ou o neutro, se nenhum).
function syncCropAdjustUI() {
  const adj = getCropAdjust(state.photo);
  const z = document.getElementById('cropZoom'), px = document.getElementById('cropPanX'), py = document.getElementById('cropPanY');
  if (z) z.value = Math.round(adj.zoom * 100);
  if (px) px.value = Math.round(adj.panX * 100);
  if (py) py.value = Math.round(adj.panY * 100);
}
// Marca: sem logótipo por defeito (imagem, fundo transparente) — dá para
// substituir por outro em "Marca & Idiomas". Se a imagem falhar, cai numa letra genérica.
function brandInitial() {
  const n = (state.brand.name || 'My Studio').trim();
  return (n.charAt(0) || 'Z').toUpperCase();
}
function footerLine() {
  return [state.brand.site, state.brand.sub].filter(Boolean).join('  ·  ');
}
function watermark(fn) { if (state.brand.showWatermark) fn(); }

let brandLogoImg = null, brandLogoImgSrc = null;
function ensureBrandLogoLoaded() {
  const src = state.brand.logoUrl;
  if (!src) { brandLogoImg = null; brandLogoImgSrc = null; return; }
  if (brandLogoImgSrc === src) return;
  brandLogoImgSrc = src;
  const img = new Image();
  img.onload = () => { brandLogoImg = img; draw(); };
  img.onerror = () => { brandLogoImg = null; };
  img.src = src;
}

function drawLogo(ctx, cx, y, scale, color) {
  const t = I18N[state.lang] || I18N.pt;
  watermark(() => {
    const gold = color || state.brand.accent || '#B8935A';
    ctx.textAlign = 'center';
    if (brandLogoImg) {
      const h = 92 * scale;
      const w = h * (brandLogoImg.width / brandLogoImg.height);
      const top = y - h * 0.66;
      ctx.drawImage(brandLogoImg, cx - w / 2, top, w, h);
      ctx.font = `300 ${13*scale}px "DM Sans", sans-serif`;
      ctx.fillStyle = gold;
      spaced(ctx, t.poweredBy + ' MY STUDIO', cx, top + h + 22*scale, 4.5*scale);
      return;
    }
    // Reserva — sem imagem carregada: letra + "POWERED BY MY STUDIO" (traduzido)
    ctx.fillStyle = gold;
    ctx.font = `500 ${86*scale}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText(brandInitial(), cx, y);
    ctx.strokeStyle = gold; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2*scale;
    ctx.beginPath(); ctx.moveTo(cx - 60*scale, y + 14*scale); ctx.lineTo(cx + 60*scale, y + 14*scale); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = `300 ${15*scale}px "DM Sans", sans-serif`;
    ctx.fillStyle = gold;
    spaced(ctx, t.poweredBy + ' MY STUDIO', cx, y + 40*scale, 6*scale);
  });
}
function spaced(ctx, txt, cx, y, ls) {
  const widths = [...txt].map(ch => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + ls * (txt.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  [...txt].forEach((ch, i) => { ctx.fillText(ch, x, y); x += widths[i] + ls; });
  ctx.textAlign = 'center';
}
// Variante alinhada à esquerda de spaced() — a original trata sempre o 3º
// parâmetro como CENTRO do texto (cx), nunca como margem esquerda. Usar a
// original com um valor de margem (ex. 64*FS) para texto comprido empurra
// o início para coordenadas negativas, cortando as primeiras letras fora
// do canvas — foi exatamente o bug encontrado no selo do template
// Minimalista ("OPORTUNIDADE" a aparecer como "ORTUNIDADE").
function spacedLeft(ctx, txt, x0, y, ls) {
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let x = x0;
  [...txt].forEach((ch, i) => { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + ls; });
  ctx.textAlign = prevAlign;
}
function fitText(ctx, txt, maxW, font, minSize, maxSize) {
  let size = maxSize;
  do { ctx.font = font.replace('SIZE', size); if (ctx.measureText(txt).width <= maxW) break; size -= 2; } while (size > minSize);
  return size;
}
function wrapN(ctx, txt, maxW, maxLines) {
  const words = String(txt).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur); cur = w;
      if (lines.length === maxLines) { lines[maxLines-1] = lines[maxLines-1].replace(/\s?\S*$/, '…'); return lines; }
    } else cur = test;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}
// Ficha de produto — universal: até 4 pares rótulo/valor, com presets por categoria
// (imóveis, carros, viagens, moda, cosmética) ou totalmente livre. O resto fica na legenda.
// ── Dados extra por categoria (certificado energético, estrelas, alergénios,
// tamanhos) — texto/emoji sobre o sistema de specsLine() já existente e
// testado, sem precisar de desenho novo no canvas ──
// [ENERGY_*/SIZE_LIST/ALLERGEN_*/CATEGORY_* extraídos para src/data/categories.js — ver ficheiro]
function renderBadgeChips() {
  const wrap = document.getElementById('badgeChips');
  if (!wrap) return;
  const dict = CATEGORY_BADGES[state.lang] || CATEGORY_BADGES.pt;
  const chips = dict[state.category] || dict.generico;
  wrap.innerHTML = chips.map(c => `<button type="button" class="chip" onclick="pickBadgeChip('${c.replace(/'/g, "\\'")}')">${c}</button>`).join('');
}
function pickBadgeChip(text) {
  state.badge = text;
  document.getElementById('fBadge').value = text;
  draw();
  scheduleSaveDraft();
}
// Extras específicos por categoria — Certificado Energético + €/m² (Imóveis),
// estrelas (Viagens), alergénios (Gastronomia), tamanhos (Moda), simulador de
// financiamento (Carros). Só aparecem quando fazem sentido para a categoria ativa.
function renderCategoryExtras() {
  const wrap = document.getElementById('categoryExtras');
  if (!wrap) return;
  const t = I18N[state.lang] || I18N.pt;
  let html = '';

  if (state.category === 'imoveis') {
    html += `<label class="f" style="margin-top:14px;">${uiT('energyRatingLabel')}</label>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">${ENERGY_LEVELS.map(l =>
        `<button type="button" class="chip${state.energyRating === l ? ' active' : ''}" onclick="pickEnergyRating('${l}')">${ENERGY_EMOJI[l]} ${l}</button>`).join('')}</div>`;
    const areaNum = parseEuroNumber(state.spec[0] && state.spec[0].value);
    const priceNum = parseEuroNumber(state.price);
    if (areaNum > 0 && priceNum > 0) {
      const perM2 = Math.round(priceNum / areaNum);
      html += `<div class="hint" style="margin-top:9px;">${uiT('pricePerM2Hint')}: <strong style="color:var(--gold);">≈ ${perM2.toLocaleString(state.lang)}€/m²</strong></div>`;
    }
  } else if (state.category === 'viagens') {
    html += `<label class="f" style="margin-top:14px;">${uiT('starRatingLabel')}</label>
      <div class="star-pick">${[1,2,3,4,5].map(n =>
        `<span onclick="pickStarRating(${n})" style="color:${n <= state.starRating ? 'var(--gold)' : 'var(--border)'};">★</span>`).join('')}</div>`;
  } else if (state.category === 'gastronomia') {
    const names = ALLERGEN_NAMES[state.lang] || ALLERGEN_NAMES.pt;
    html += `<label class="f" style="margin-top:14px;">${uiT('allergensLabel')}</label>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">${ALLERGEN_KEYS.map(k =>
        `<button type="button" class="chip${state.allergens.includes(k) ? ' active' : ''}" onclick="toggleAllergen('${k}')">${ALLERGEN_ICONS[k]} ${names[k]}</button>`).join('')}</div>`;
  } else if (state.category === 'moda') {
    html += `<label class="f" style="margin-top:14px;">${uiT('sizesAvailableLabel')}</label>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">${SIZE_LIST.map(s =>
        `<button type="button" class="chip${state.sizes.includes(s) ? ' active' : ''}" onclick="toggleSize('${s}')">${s}</button>`).join('')}</div>`;
  } else if (state.category === 'carros') {
    html += `<label class="f" style="margin-top:14px;">${uiT('financeCalcLabel')}</label>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
        <div><label class="f" style="margin-top:0;font-size:0.6rem;">${uiT('financeMonths')}</label><input type="number" min="1" value="${state.financeMonths}" oninput="state.financeMonths=+this.value||1; renderCategoryExtras(); scheduleSaveDraft();"></div>
        <div><label class="f" style="margin-top:0;font-size:0.6rem;">${uiT('financeDown')}</label><input type="number" min="0" max="100" value="${state.financeDownPct}" oninput="state.financeDownPct=+this.value||0; renderCategoryExtras(); scheduleSaveDraft();"></div>
        <div><label class="f" style="margin-top:0;font-size:0.6rem;">${uiT('financeAPR')}</label><input type="number" min="0" step="0.1" value="${state.financeAPR}" oninput="state.financeAPR=+this.value||0; renderCategoryExtras(); scheduleSaveDraft();"></div>
      </div>`;
    const priceNum = parseEuroNumber(state.price);
    if (priceNum > 0 && state.financeMonths > 0) {
      const principal = priceNum * (1 - state.financeDownPct / 100);
      const r = (state.financeAPR / 100) / 12;
      const n = state.financeMonths;
      const monthly = Math.round(r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -n)) : principal / n);
      html += `<div class="hint" style="margin-top:9px;">${uiT('financeEstimate')}: <strong style="color:var(--gold);">≈ ${monthly.toLocaleString(state.lang)}€/${uiT('financeMonthAbbrev')}</strong>
        <button type="button" class="btn btn-line" style="padding:4px 10px;font-size:0.6rem;margin-left:8px;vertical-align:middle;" onclick="pickBadgeChip('${uiT('financeFromBadgePrefix')} ${monthly}€/${uiT('financeMonthAbbrev')}')">${uiT('financeUseInBadge')}</button></div>`;
    }
  }
  wrap.innerHTML = html;
}
function pickEnergyRating(l) { state.energyRating = (state.energyRating === l ? '' : l); renderCategoryExtras(); draw(); scheduleSaveDraft(); }
function pickStarRating(n) { state.starRating = (state.starRating === n ? 0 : n); renderCategoryExtras(); draw(); scheduleSaveDraft(); }
function toggleAllergen(k) { const i = state.allergens.indexOf(k); if (i >= 0) state.allergens.splice(i, 1); else state.allergens.push(k); renderCategoryExtras(); draw(); scheduleSaveDraft(); }
function toggleSize(s) { const i = state.sizes.indexOf(s); if (i >= 0) state.sizes.splice(i, 1); else state.sizes.push(s); renderCategoryExtras(); draw(); scheduleSaveDraft(); }
function applyCategoryPreset(cat) {
  state.category = cat;
  const catSelect = document.getElementById('fCategory');
  if (catSelect) catSelect.value = cat; // garante que o menu mostra a categoria certa mesmo quando chamado por código, não só pelo próprio menu
  const dict = CATEGORY_PRESETS[state.lang] || CATEGORY_PRESETS.pt;
  const labels = dict[cat] || dict.generico;
  labels.forEach((lbl, i) => {
    state.spec[i].label = lbl;
    state.spec[i].value = ''; // limpa o valor ao trocar de categoria — não deixa dados de uma categoria "vazarem" para outra
    const el = document.getElementById('specLabel' + i);
    if (el) el.value = lbl;
    const elVal = document.getElementById('specValue' + i);
    if (elVal) elVal.value = '';
  });
  // idem para os campos extra específicos de categoria (certificado energético, estrelas, alergénios, tamanhos)
  state.energyRating = ''; state.starRating = 0; state.allergens = []; state.sizes = [];
  renderBadgeChips();
  renderCategoryExtras();
  if (!state._styleCustomized && CATEGORY_PALETTES[cat]) {
    const p = CATEGORY_PALETTES[cat];
    state.brand.accent = p.accent;
    document.getElementById('brandColor').value = p.accent;
    setGoldVar(p.accent);
    setBg(p.bg); // já chama draw() internamente
    toast('🎨 Estilo ajustado para esta categoria — muda em "Marca & Idiomas" se preferires outro');
  } else {
    draw();
  }
  scheduleSaveDraft();
}


// ═══ DESENHO ═══
let _drawGeneration = 0;
async function draw() {
  const myGen = ++_drawGeneration;
  await document.fonts.ready;
  if (myGen !== _drawGeneration) return; // um draw() mais recente já começou entretanto — este já não interessa
  const c = document.getElementById('preview');
  await renderTo(c);
}

async function renderTo(c, slideOverride) {
  const ctx = c.getContext('2d');
  const slide = slideOverride ?? state.slides[state.slideIdx];
  if (slide && slide.type === 'photo') {
    const img = await loadImg(slide.url);
    drawPhotoSlide(ctx, c.width, c.height, img, state.slides.indexOf(slide), state.slides.length);
    return;
  }
  await drawListing(ctx, c.width, c.height);
}

function drawPhotoSlide(ctx, W, H, img, idx, total) {
  const P = pal();
  fillBg(ctx, W, H, P);
  if (img) smartCoverDraw(ctx, img, 0, 0, W, H);
  const g = ctx.createLinearGradient(0, H * 0.72, 0, H);
  g.addColorStop(0, `rgba(${P.gradRGB},0)`); g.addColorStop(1, `rgba(${P.gradRGB},0.85)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  drawLogo(ctx, W - 110, 110, 0.6, P.overPhoto);
  ctx.textAlign = 'left';
  ctx.fillStyle = P.ink; ctx.font = '300 32px "DM Sans", sans-serif';
  ctx.fillText(wrapN(ctx, state.title, W - 320, 1)[0] || '', 64, H - 82);
  ctx.fillStyle = P.overPhoto; ctx.font = '400 26px "DM Sans", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(String(idx + 1).padStart(2, '0') + ' — ' + String(total).padStart(2, '0'), W - 64, H - 82);
  ctx.textAlign = 'left';
}

// Estado vazio (ainda sem foto) — em vez de um retângulo preto, mostra um padrão
// subtil + ícone + texto convidativo, coerente com o resto da identidade visual.
function drawPlaceholderArt(ctx, W, H, P) {
  const t = I18N[state.lang] || I18N.pt;
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = P.gold; ctx.lineWidth = 1.3;
  const step = Math.max(26, Math.round(W / 22));
  for (let x = -H; x < W + H; x += step) {
    ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke();
  }
  ctx.restore();

  const cx = W / 2, cy = H * 0.42, s = W * 0.075;
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = P.gold; ctx.lineWidth = Math.max(2, W * 0.0022);
  ctx.strokeRect(cx - s, cy - s * 0.55, s * 2, s * 1.3);
  ctx.strokeRect(cx - s * 0.32, cy - s * 0.92, s * 0.64, s * 0.38);
  ctx.beginPath(); ctx.arc(cx, cy + s * 0.1, s * 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy + s * 0.1, s * 0.24, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = P.gold; ctx.globalAlpha = 0.6;
  ctx.font = `400 ${Math.round(W * 0.026)}px "DM Sans", sans-serif`;
  ctx.fillText(t.emptyHint1, cx, cy + s * 1.9);
  ctx.globalAlpha = 0.36;
  ctx.font = `300 ${Math.round(W * 0.0175)}px "DM Sans", sans-serif`;
  ctx.fillText(t.emptyHint2, cx, cy + s * 1.9 + Math.round(W * 0.034));
  ctx.restore();
}
// Faixa de texto sólida usada pela Colagem e pelo Antes/Depois — mesma
// composição (selo, título, localização, preço, rodapé), só muda onde
// a grelha de fotos acaba (gridH).
function drawGridTextBand(ctx, W, H, P, gridH, FS, story, locLine) {
  fillBg(ctx, W, H, P, gridH, H);
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, gridH); ctx.lineTo(W, gridH); ctx.stroke();

  if (state.badge) {
    ctx.font = `400 ${22*FS}px "DM Sans", sans-serif`;
    const bw = ctx.measureText(state.badge.toUpperCase()).width + 44 * FS;
    ctx.fillStyle = P.badgeBg; ctx.fillRect(56 * FS, gridH + 22 * FS, bw, 46 * FS);
    ctx.fillStyle = P.badgeInk; ctx.textAlign = 'left';
    ctx.fillText(state.badge.toUpperCase(), 56 * FS + 20 * FS, gridH + 22 * FS + 30 * FS);
  }

  let y = gridH + (story ? 108 : 90) * FS;
  ctx.textAlign = 'left';
  ctx.fillStyle = P.ink;
  const ts = fitText(ctx, state.title, W - 128 * FS, '500 SIZEpx "Cormorant Garamond", serif', 34 * FS, 54 * FS);
  ctx.font = `500 ${ts}px "Cormorant Garamond", serif`;
  wrapN(ctx, state.title, W - 128 * FS, 1).forEach(l => { ctx.fillText(l, 56 * FS, y); y += ts + 4; });
  y += 6 * FS;
  ctx.fillStyle = P.muted; ctx.font = `300 ${22 * FS}px "DM Sans", sans-serif`;
  ctx.fillText('📍 ' + locLine, 56 * FS, y);
  ctx.textAlign = 'right'; ctx.fillStyle = P.goldBig; ctx.font = `500 ${34 * FS}px "Cormorant Garamond", serif`;
  ctx.fillText(state.price, W - 56 * FS, y);
  ctx.textAlign = 'left';
  watermark(() => {
    ctx.fillStyle = P.faint; ctx.font = `300 ${17 * FS}px "DM Sans", sans-serif`;
    ctx.fillText(footerLine(), 56 * FS, H - 22 * FS);
  });
}
async function drawListing(ctx, W, H) {
  const P = pal();
  const story = state.format === 'story';
  // Escala tipográfica só para os formatos novos (paisagem/vertical) — não muda em nada
  // o aspeto do Feed, Quadrado ou Story, que já estavam afinados ao pixel.
  const FS = (state.format === 'wide' || state.format === 'pin') ? Math.sqrt((W * H) / (1080 * 1350)) : 1;
  fillBg(ctx, W, H, P);
  if (!state.img) drawPlaceholderArt(ctx, W, H, P);
  const locLine = state.loc || '';

  if (state.template === 'classico') {
    if (state.img) smartCoverDraw(ctx, state.img, 0, 0, W, H, true);
    const g = ctx.createLinearGradient(0, H * 0.42, 0, H);
    g.addColorStop(0, `rgba(${P.gradRGB},0)`); g.addColorStop(0.6, `rgba(${P.gradRGB},0.78)`); g.addColorStop(1, `rgba(${P.gradRGB},0.97)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const gt = ctx.createLinearGradient(0, 0, 0, H * 0.24);
    gt.addColorStop(0, `rgba(${P.gradRGB},0.6)`); gt.addColorStop(1, `rgba(${P.gradRGB},0)`);
    ctx.fillStyle = gt; ctx.fillRect(0, 0, W, H * 0.24);

    if (state.badge) {
      ctx.font = `400 ${26*FS}px "DM Sans", sans-serif`; ctx.fillStyle = P.overPhoto;
      spaced(ctx, state.badge.toUpperCase(), W / 2, story ? 200 : 96, 8*FS);
    }
    if (story) drawLogo(ctx, W / 2, 130, 0.9, P.overPhoto);
    else drawLogo(ctx, W - 118*FS, 118, 0.72*FS, P.overPhoto);

    // LAYOUT DE BAIXO PARA CIMA — nunca há sobreposição no rodapé
    ctx.textAlign = 'center';
    const footerY = story ? H - 64 : H - 44;
    const specs = state.showSpecs ? specsLine() : '';
    ctx.font = `300 ${40*FS}px "DM Sans", sans-serif`;
    const tLines = wrapN(ctx, state.title, W - 180, 2);

    let cursor = footerY - (story ? 90 : 60*FS);
    let specsY = null;
    if (specs) { specsY = cursor; cursor = specsY - 84*FS; }
    const locY = cursor; cursor = locY - 58*FS;
    const titleYs = [];
    for (let i = tLines.length - 1; i >= 0; i--) { titleYs.unshift(cursor); cursor -= 52*FS; }
    const priceY = cursor - 30*FS;

    ctx.fillStyle = P.goldBig;
    const ps = fitText(ctx, state.price, W - 160, '500 SIZEpx "Cormorant Garamond", serif', 48*FS, 96*FS);
    ctx.font = `500 ${ps}px "Cormorant Garamond", serif`;
    ctx.fillText(state.price, W / 2, priceY);

    ctx.fillStyle = P.ink; ctx.font = `300 ${40*FS}px "DM Sans", sans-serif`;
    tLines.forEach((l, i) => ctx.fillText(l, W / 2, titleYs[i]));

    ctx.fillStyle = P.muted; ctx.font = `300 ${30*FS}px "DM Sans", sans-serif`;
    ctx.fillText('📍 ' + locLine, W / 2, locY);

    if (specs) {
      ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W/2 - 200*FS, specsY - 42*FS); ctx.lineTo(W/2 + 200*FS, specsY - 42*FS); ctx.stroke();
      ctx.fillStyle = P.gold;
      // a ficha universal pode ter texto bem mais comprido do que "3 quartos" — encolhe até caber
      const ss = fitText(ctx, specs, W - 140*FS, '300 SIZEpx "DM Sans", sans-serif', 15*FS, 28*FS);
      ctx.font = `300 ${ss}px "DM Sans", sans-serif`;
      ctx.fillText(specs, W / 2, specsY);
    }
    watermark(() => {
      ctx.fillStyle = P.faint; ctx.font = `300 ${22*FS}px "DM Sans", sans-serif`;
      ctx.fillText(footerLine(), W / 2, footerY);
    });

  } else if (state.template === 'minimalista') {
    const barH = (story ? 300 : 220) * FS;
    if (state.img) smartCoverDraw(ctx, state.img, 0, 0, W, H - barH, true);
    fillBg(ctx, W, H, P, H - barH, H);
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H - barH); ctx.lineTo(W, H - barH); ctx.stroke();

    if (state.badge) {
      ctx.textAlign = 'left'; ctx.fillStyle = P.gold; ctx.font = `400 ${22*FS}px "DM Sans", sans-serif`;
      spacedLeft(ctx, state.badge.toUpperCase(), 64*FS, H - barH + 46*FS, 6*FS);
    }
    ctx.textAlign = 'left'; ctx.fillStyle = P.ink;
    const ts = fitText(ctx, state.title, W - 128*FS, '500 SIZEpx "DM Sans", sans-serif', 30*FS, 44*FS);
    let y = H - barH + 100*FS;
    ctx.font = `500 ${ts}px "DM Sans", sans-serif`;
    wrapN(ctx, state.title, W - 128*FS, 2).forEach(l => { ctx.fillText(l, 64*FS, y); y += ts + 8*FS; });
    ctx.fillStyle = P.muted; ctx.font = `300 ${24*FS}px "DM Sans", sans-serif`;
    ctx.fillText('📍 ' + locLine, 64*FS, y + 8*FS);

    ctx.textAlign = 'right'; ctx.fillStyle = P.goldBig; ctx.font = `500 ${40*FS}px "Cormorant Garamond", serif`;
    ctx.fillText(state.price, W - 64*FS, H - barH + 100*FS);
    ctx.textAlign = 'left';
    watermark(() => {
      ctx.fillStyle = P.faint; ctx.font = `300 ${19*FS}px "DM Sans", sans-serif`;
      ctx.fillText(footerLine(), 64*FS, H - 28*FS);
    });

  } else if (state.template === 'colagem') {
    // Colagem — 2 a 8 fotos numa grelha, com uma faixa de texto sólida em
    // baixo. Usa as fotos marcadas com ✓ (já é o mecanismo de seleção que
    // existe) e respeita a ordem em que aparecem na grelha da barra lateral —
    // arrastar uma foto lá muda também a posição dela aqui.
    const t = I18N[state.lang] || I18N.pt;
    const photos = (state.carPhotos || []).slice(0, 8);
    if (photos.length > 8) toast('A colagem mostra só as primeiras 8 fotos marcadas');
    const barH = (story ? 300 : 230) * FS;
    const gridH = H - barH;
    const gap = Math.max(3, 5 * FS);
    if (photos.length >= 2) {
      const imgs = await Promise.all(photos.map(loadImg));
      if (photos.length === 3) {
        // caso especial: destaque à esquerda + 2 fotos empilhadas à direita
        const halfW = (W - gap) / 2, halfH = (gridH - gap) / 2;
        if (imgs[0]) smartCoverDraw(ctx, imgs[0], 0, 0, halfW, gridH);
        if (imgs[1]) smartCoverDraw(ctx, imgs[1], halfW + gap, 0, halfW, halfH);
        if (imgs[2]) smartCoverDraw(ctx, imgs[2], halfW + gap, halfH + gap, halfW, halfH);
      } else {
        // 2, 4, 5, 6, 7 ou 8 fotos — disposição em linhas, da esquerda para a
        // direita, de cima a baixo (2ª linha só existe se houver fotos para ela)
        const rowsMap = { 2: [2], 4: [2, 2], 5: [2, 3], 6: [3, 3], 7: [4, 3], 8: [4, 4] };
        const rows = rowsMap[photos.length];
        const rowH = (gridH - gap * (rows.length - 1)) / rows.length;
        let idx = 0, y = 0;
        rows.forEach(count => {
          const cellW = (W - gap * (count - 1)) / count;
          let x = 0;
          for (let c = 0; c < count; c++) {
            const im = imgs[idx++];
            if (im) smartCoverDraw(ctx, im, x, y, cellW, rowH);
            x += cellW + gap;
          }
          y += rowH + gap;
        });
      }
    } else if (state.img) {
      ctx.save();
      ctx.fillStyle = P.muted; ctx.textAlign = 'center';
      ctx.font = `300 ${25*FS}px "DM Sans", sans-serif`;
      const lines = wrapN(ctx, t.collageHint, W - 160, 3);
      const ly0 = gridH / 2 - ((lines.length - 1) * 34) / 2;
      lines.forEach((l, i) => ctx.fillText(l, W / 2, ly0 + i * 34));
      ctx.restore();
    }
    drawGridTextBand(ctx, W, H, P, gridH, FS, story, locLine);

  } else if (state.template === 'antesdepois') {
    // Antes/Depois — 2 fotos lado a lado com rótulos. Usa as 2 primeiras fotos
    // marcadas com ✓ (a ordem na grelha da barra lateral decide qual é o
    // "antes" e qual é o "depois" — arrastar lá muda a ordem aqui também).
    const t = I18N[state.lang] || I18N.pt;
    const photos = (state.carPhotos || []).slice(0, 2);
    const barH = (story ? 300 : 230) * FS;
    const gridH = H - barH;
    const gap = Math.max(3, 5 * FS);
    if (photos.length >= 2) {
      const imgs = await Promise.all(photos.map(loadImg));
      const cw = (W - gap) / 2;
      if (imgs[0]) smartCoverDraw(ctx, imgs[0], 0, 0, cw, gridH);
      if (imgs[1]) smartCoverDraw(ctx, imgs[1], cw + gap, 0, cw, gridH);
      [t.before, t.after].forEach((label, i) => {
        const x0 = i === 0 ? 0 : cw + gap;
        ctx.save();
        ctx.font = `600 ${20*FS}px "DM Sans", sans-serif`;
        const tw = ctx.measureText(label.toUpperCase()).width + 32 * FS;
        ctx.fillStyle = 'rgba(10,10,10,0.6)';
        ctx.fillRect(x0 + 16 * FS, 16 * FS, tw, 42 * FS);
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'left';
        spaced(ctx, label.toUpperCase(), x0 + 16 * FS + tw / 2, 16 * FS + 27 * FS, 2.5 * FS);
        ctx.restore();
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1.5, 2 * FS);
      ctx.beginPath(); ctx.moveTo(cw + gap / 2, 0); ctx.lineTo(cw + gap / 2, gridH); ctx.stroke();
    } else if (state.img) {
      ctx.save();
      ctx.fillStyle = P.muted; ctx.textAlign = 'center';
      ctx.font = `300 ${25*FS}px "DM Sans", sans-serif`;
      const lines = wrapN(ctx, t.beforeAfterHint, W - 160, 3);
      const ly0 = gridH / 2 - ((lines.length - 1) * 34) / 2;
      lines.forEach((l, i) => ctx.fillText(l, W / 2, ly0 + i * 34));
      ctx.restore();
    }
    drawGridTextBand(ctx, W, H, P, gridH, FS, story, locLine);

  } else {
    const photoH = story ? H * 0.6 : H * 0.62;
    if (state.img) smartCoverDraw(ctx, state.img, 0, 0, W, photoH, true);
    fillBg(ctx, W, H, P, photoH, H);
    ctx.strokeStyle = P.badgeBg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(64, photoH + 2); ctx.lineTo(W - 64, photoH + 2); ctx.stroke();

    if (state.badge) {
      ctx.font = '400 24px "DM Sans", sans-serif';
      const bw = ctx.measureText(state.badge.toUpperCase()).width + 56;
      ctx.fillStyle = P.badgeBg; ctx.fillRect(64, 64, bw, 56);
      ctx.fillStyle = P.badgeInk; ctx.textAlign = 'left';
      ctx.fillText(state.badge.toUpperCase(), 92, 100);
    }

    let y = photoH + (story ? 110 : 92);
    ctx.textAlign = 'left';
    ctx.fillStyle = P.ink;
    const ts = fitText(ctx, state.title, W - 128, '500 SIZEpx "Cormorant Garamond", serif', 44, 72);
    ctx.font = `500 ${ts}px "Cormorant Garamond", serif`;
    wrapN(ctx, state.title, W - 128, 2).forEach(l => { ctx.fillText(l, 64, y); y += ts + 6; });
    y += 4;
    ctx.fillStyle = P.muted; ctx.font = '300 29px "DM Sans", sans-serif';
    ctx.fillText('📍 ' + locLine, 64, y); y += 66;
    ctx.fillStyle = P.goldBig;
    ctx.font = '500 58px "Cormorant Garamond", serif';
    ctx.fillText(state.price, 64, y); y += 58;
    if (state.showSpecs && specsLine()) {
      ctx.fillStyle = P.muted;
      const ss2 = fitText(ctx, specsLine(), W - 128, '300 SIZEpx "DM Sans", sans-serif', 16, 27);
      ctx.font = `300 ${ss2}px "DM Sans", sans-serif`;
      ctx.fillText(specsLine(), 64, y);
    }
    drawLogo(ctx, W - 130, H - 96, 0.66, P.gold);
    ctx.textAlign = 'left';
    watermark(() => {
      ctx.fillStyle = P.faint; ctx.font = '300 22px "DM Sans", sans-serif';
      ctx.fillText(footerLine(), 64, H - 52);
    });
  }
  ctx.textAlign = 'left';
}

// ═══ LEGENDA ═══
function buildCaption() {
  const lines = [];
  const tags = [];
  lines.push('✨ ' + (state.title || ''));
  if (state.loc) lines.push('📍 ' + state.loc);
  const specLine = specsLine();
  if (specLine) lines.push('🏷️ ' + specLine);
  if (state.price) { lines.push(''); lines.push('💶 ' + state.price); }
  lines.push('');
  lines.push(ctaFor(state.lang));
  if (tags.length) { lines.push(''); lines.push(tags.join(' ')); }
  document.getElementById('caption').value = lines.join('\n');
}


// ═══════════════════════════════════════════════════════════════
//  IA — reescrita editorial para Instagram (Claude via API)
//  Os slides do site são texto de leitura; o Instagram precisa de
//  ritmo, gancho e concisão. A IA traduz um no outro, sem inventar
//  factos: recebe o texto real da página e só o pode reescrever.
// ═══════════════════════════════════════════════════════════════
// ═══ CONFIGURAÇÃO DO ENDPOINT DE IA ═══
// Em contexto web, o caminho relativo funciona (mesma origem que o backend,
// quando publicado no mesmo domínio). Em contexto Capacitor NÃO existe essa
// garantia — a app nativa corre de uma origem própria (ex.: capacitor://
// localhost), por isso precisa de um URL absoluto explícito.
const AI_API_BASE_URL_NATIVE = 'https://z-studio-platform-seven.vercel.app/api/ai'; // <-- PREENCHER antes de publicar iOS/Android, ex.: 'https://api.oteudominio.com/ai'
const IS_NATIVE_PLATFORM = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const AI_ENDPOINT = 'https://z-studio-platform-seven.vercel.app/api/ai';
if (IS_NATIVE_PLATFORM && !AI_API_BASE_URL_NATIVE) {
  console.warn('[My Studio] AI_API_BASE_URL_NATIVE não está configurado — a app nativa vai tentar um caminho relativo que não existe fora de um browser. Define-o em app/my-studio.html antes de publicar para iOS/Android.');
}

async function askAI(system, user, maxTokens) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s — evita a UI ficar pendurada para sempre
  try {
    const r = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, user, max_tokens: maxTokens || 1200 }),
      signal: controller.signal
    });
    if (!r.ok) throw new Error('IA ' + r.status + ' — ' + (await r.text()).slice(0, 120));
    const d = await r.json();
    const txt = (d.content || []).map(c => c.text || '').join('').trim();
    return txt.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('IA demorou demasiado tempo a responder (mais de 25s) — tenta outra vez.');
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

// A voz da IA adapta-se à marca configurada em "Marca & Idiomas" — funciona
// para qualquer negócio ou uso pessoal, não está presa a nenhuma marca fixa.
function voiceFor(lang) {
  const who = state.brand.name || 'My Studio';
  const ctxLine = state.brand.sub ? ` (${state.brand.sub})` : '';
  const MAP = {
    pt: `Escreves em português europeu para o Instagram de ${who}${ctxLine}.`,
    en: `You write in British English for the Instagram of ${who}${ctxLine}.`,
    fr: `Tu écris en français pour l'Instagram de ${who}${ctxLine}.`,
    es: `Escribes en español para el Instagram de ${who}${ctxLine}.`,
    de: `Du schreibst auf Deutsch für den Instagram-Account von ${who}${ctxLine}.`,
    it: `Scrivi in italiano per l'Instagram di ${who}${ctxLine}.`
  };
  return MAP[lang] || MAP.pt;
}
const RULES = `Tom: sóbrio, informado, confiante. Elegância, nunca hype. Proibido: "imperdível", "oportunidade única", emojis a mais, superlativos vazios, exclamações múltiplas.
REGRA ABSOLUTA: só podes usar factos que estejam no texto fornecido. Não inventes números, datas, nomes nem características. Se um facto não estiver lá, não existe.`;

async function generateCaptionFor(lang) {
  const prevLang = state.lang;
  state.lang = lang;
  try {
    if (!state.title && !state.loc) throw new Error('Escreve pelo menos um título');
    const specLine = specsLine();
    const categoryLabel = (CATEGORY_PRESETS[state.category] ? state.category : 'generico');
    let ctx = `Categoria: ${categoryLabel}\nTítulo: ${state.title}\nLocal: ${state.loc}\nPreço/Valor: ${state.price}`
      + (specLine ? `\nCaracterísticas: ${specLine}` : '');
    let link = state.brand.site || '';
    const system = `${voiceFor(lang)}\n${RULES}\nEscreves legendas de Instagram que fazem parar o scroll sem gritar.`;
    const user = `${ctx}

Escreve a legenda:
1. Primeira linha: um gancho de uma frase, concreto (um facto, um número, uma tensão real). Nunca "Descubra este produto incrível" nem clichés genéricos.
2. 2 a 4 linhas curtas com o que realmente interessa a quem está a decidir. Parágrafos separados por linha em branco.
3. Fecho com chamada à ação discreta e o link: ${link}
4. Última linha: 8 a 12 hashtags relevantes, em minúsculas, no idioma da legenda (${lang}).

Máximo 900 caracteres no total. Responde apenas com a legenda, sem aspas nem explicações.`;
    return await askAI(system, user, 900);
  } finally {
    state.lang = prevLang;
  }
}
async function aiCaption() {
  const btn = document.getElementById('btnAICaption');
  const old = btn.textContent; btn.disabled = true; btn.textContent = '…';
  try {
    const out = await generateCaptionFor(state.lang);
    document.getElementById('caption').value = out;
    toast('✨ Legenda gerada — revê antes de publicar');
  } catch (e) {
    console.error(e);
    toast((e.message || 'IA indisponível').slice(0, 80));
  } finally { btn.disabled = false; btn.textContent = old; }
}
// Gera a legenda nos vários idiomas ativos de uma só vez, mostrando cada uma num
// painel próprio para copiar — sem substituir a legenda principal.
async function aiCaptionAllLangs() {
  const langs = ['pt', ...[...state.brand.langs].filter(l => l !== 'pt')];
  const btn = document.getElementById('btnAICaptionAll');
  const old = btn.textContent; btn.disabled = true;
  const results = {};
  try {
    for (const l of langs) {
      btn.textContent = 'A gerar ' + (LANG_LABELS[l] || l) + '…';
      try { results[l] = await generateCaptionFor(l); } catch (e) { results[l] = '⚠ ' + (e.message || 'falhou'); }
    }
    renderCaptionAllModal(results, langs);
  } finally { btn.disabled = false; btn.textContent = old; }
}
function renderCaptionAllModal(results, langs) {
  const wrap = document.getElementById('captionAllWrap');
  wrap.innerHTML = langs.map(l => `
    <div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <strong style="color:var(--gold);font-size:0.75rem;letter-spacing:.08em;text-transform:uppercase;">${LANG_LABELS[l] || l}</strong>
        <button class="btn btn-line" style="padding:4px 10px;font-size:0.66rem;" onclick="copyCaptionLang('${l}')">Copiar</button>
      </div>
      <textarea readonly id="captionAll_${l}" style="width:100%;min-height:110px;font-size:0.8rem;line-height:1.5;">${(results[l] || '').replace(/</g,'&lt;')}</textarea>
    </div>`).join('');
  document.getElementById('captionAllOverlay').classList.remove('hide');
}
function copyCaptionLang(l) {
  const el = document.getElementById('captionAll_' + l);
  if (!el) return;
  navigator.clipboard.writeText(el.value).then(() => toast('Copiado (' + (LANG_LABELS[l] || l) + ')')).catch(() => toast('Não foi possível copiar'));
}
function closeCaptionAll() { document.getElementById('captionAllOverlay').classList.add('hide'); }


// ═══════════════════════════════════════════════════════════════
//  PRODUÇÃO EM MASSA — gera a capa de várias fotos de uma vez
//  (recorte inteligente + otimização automática incluídos). Cada
//  foto pode ter o seu próprio título/preço — útil para um catálogo
//  com vários produtos diferentes, não só o mesmo produto em vários
//  ângulos — e entrega tudo num único ZIP.
// ═══════════════════════════════════════════════════════════════
const bulkState = { fmt: 'feed45', tpl: 'classico', sel: new Set(), all: [], itemData: {} };

function openBulk() {
  document.getElementById('bulkOverlay').classList.remove('hide');
  renderBulkList();
}
function closeBulk() { document.getElementById('bulkOverlay').classList.add('hide'); }
function setBulkFmt(f) {
  bulkState.fmt = f;
  document.querySelectorAll('#bulkFmtSeg button').forEach(b => b.classList.toggle('active', b.dataset.fmt === f));
}
function setBulkTpl(t) {
  bulkState.tpl = t;
  document.querySelectorAll('#bulkTplSeg button').forEach(b => b.classList.toggle('active', b.dataset.tpl === t));
}
function renderBulkList() {
  const all = (state.photos || []).map((url, i) => ({ id: 'u' + i, photoUrl: url, label: uiT('bulkPhotoLabel') + ' ' + (i + 1) }));
  bulkState.all = all;
  all.forEach(x => {
    if (!bulkState.itemData[x.id]) bulkState.itemData[x.id] = { title: state.title || '', price: state.price || '' };
  });
  const list = document.getElementById('bulkList');
  list.innerHTML = ''; // limpar é seguro — o que se segue é construído por DOM, não por string
  if (!all.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:14px;color:#888;font-size:0.8rem;';
    empty.textContent = uiT('bulkEmptyMsg');
    list.appendChild(empty);
    return;
  }
  // Constrói por createElement/textContent/value, não por template string em innerHTML —
  // title/price aqui são texto escrito livremente pela pessoa (produção em massa por item);
  // uma vulnerabilidade real, confirmada e corrigida numa auditoria de segurança.
  all.forEach(x => {
    const d = bulkState.itemData[x.id];
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:2px;';

    const label = document.createElement('label');
    label.className = 'check'; label.style.cssText = 'margin:0;flex:0 0 auto;';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = bulkState.sel.has(x.id);
    checkbox.addEventListener('change', () => toggleBulkItem(x.id, checkbox.checked));
    const span = document.createElement('span');
    span.style.cssText = 'font-size:0.68rem;color:var(--text3);white-space:nowrap;';
    span.textContent = x.label;
    label.appendChild(checkbox); label.appendChild(span);

    const titleInput = document.createElement('input');
    titleInput.type = 'text'; titleInput.value = d.title || ''; titleInput.placeholder = uiT('titleLabel');
    titleInput.setAttribute('aria-label', uiT('titleLabel'));
    titleInput.style.cssText = 'flex:1;min-width:0;padding:5px 8px;font-size:0.74rem;';
    titleInput.addEventListener('input', () => { bulkState.itemData[x.id].title = titleInput.value; });

    const priceInput = document.createElement('input');
    priceInput.type = 'text'; priceInput.value = d.price || ''; priceInput.placeholder = uiT('priceLabel');
    priceInput.setAttribute('aria-label', uiT('priceLabel'));
    priceInput.style.cssText = 'width:90px;flex:0 0 auto;padding:5px 8px;font-size:0.74rem;';
    priceInput.addEventListener('input', () => { bulkState.itemData[x.id].price = priceInput.value; });

    row.appendChild(label); row.appendChild(titleInput); row.appendChild(priceInput);
    list.appendChild(row);
  });
  updateBulkCount();
}
function toggleBulkItem(id, on) { on ? bulkState.sel.add(id) : bulkState.sel.delete(id); updateBulkCount(); }
function toggleBulkAll(on) { bulkState.sel = new Set(on ? bulkState.all.map(x => x.id) : []); renderBulkList(); }
function updateBulkCount() { document.getElementById('bulkCount').textContent = bulkState.sel.size + ' ' + uiT('bulkCountSuffix'); }

async function runBulkGenerate() {
  const ids = [...bulkState.sel];
  if (!ids.length) { toast('Seleciona pelo menos uma foto'); return; }
  const btn = document.getElementById('btnBulkGen');
  const status = document.getElementById('bulkStatus');
  btn.disabled = true;
  await document.fonts.ready;
  const [W, H] = FORMATS[bulkState.fmt];
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const octx = off.getContext('2d');
  const zip = (typeof JSZip !== 'undefined') ? new JSZip() : null;
  // guarda o estado atual para restaurar no fim, sem perder o que o utilizador tinha aberto
  const snapshot = { title: state.title, price: state.price, loc: state.loc, badge: state.badge,
    template: state.template, format: state.format, img: state.img, photo: state.photo, spec: state.spec };
  let ok = 0;
  try {
    for (let i = 0; i < ids.length; i++) {
      const entry = bulkState.all.find(x => x.id === ids[i]);
      if (!entry) continue;
      const d = bulkState.itemData[entry.id] || {};
      status.textContent = 'A gerar ' + (i + 1) + ' / ' + ids.length + ' — ' + (d.title || entry.label);
      state.photo = entry.photoUrl;
      state.title = d.title || state.title; state.price = d.price || state.price;
      state.template = bulkState.tpl; state.format = bulkState.fmt;
      state.img = null;
      if (state.photo) state.img = await loadImg(state.photo);
      await drawListing(octx, W, H);
      const b = await canvasBlob(off);
      if (!b) { console.warn('Falhou: ' + entry.label + ' (imagem sem CORS?)'); continue; }
      const name = 'my-studio-massa-' + slugify(d.title || entry.label) + '.png';
      if (zip) zip.file(name, b);
      else { saveBlob(b, name); await new Promise(r => setTimeout(r, 400)); }
      ok++;
    }
    if (zip && ok) {
      status.textContent = 'A comprimir…';
      const zb = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      saveBlob(zb, 'my-studio-producao-massa-' + ok + '.zip');
    }
    status.textContent = ok + ' de ' + ids.length + ' gerados' + (zip ? ' — ZIP descarregado.' : '.');
  } catch (e) {
    console.error(e);
    status.textContent = 'Erro após ' + ok + ' — vê a consola.';
  } finally {
    Object.assign(state, snapshot);
    draw();
    btn.disabled = false;
  }
}

// ═══ EXPORT ═══
function slugify(s) {
  return (s || 'post').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0, 40);
}
function canvasBlob(c) { return new Promise(res => c.toBlob(res, 'image/png')); }
// [Funções de saveBlob (web/nativo) extraídas para src/platform/storage.js — ver ficheiro]
async function downloadPNG() {
  const c = document.getElementById('preview');
  try {
    const b = await canvasBlob(c);
    const multi = state.slides.length > 1;
    const base = slugify(state.title) + (multi ? '-' + String(state.slideIdx + 1).padStart(2,'0') : '');
    saveBlob(b, 'z-' + state.format + '-' + base + '.png');
    toast('PNG descarregado (' + c.width + '×' + c.height + ')');
  } catch (e) { console.error(e); toast('Erro no export — a imagem pode não permitir CORS.'); }
}

// Partilha direta (telemóvel) — abre o menu nativo do sistema (Instagram, WhatsApp, etc.)
// em vez de só descarregar o ficheiro. Cai para o download normal se o browser não suportar.
// ═══ platform/web vs platform/capacitor — partilhar ═══
// ═══════════════════════════════════════════════════════════════
//  VÍDEO CURTO (Stories / Reels / TikTok) — 100% no browser, sem
//  servidor nenhum. Anima a foto de capa com um Ken Burns ligeiro
//  (reaproveita o próprio sistema de ajuste de enquadramento que já
//  existe, só que animado) e o texto a entrar em cascata. Grava com
//  MediaRecorder + canvas.captureStream() — testado e confirmado a
//  produzir MP4/H.264 real (verificado com ffprobe), o mesmo formato
//  que o Safari no iOS já escreve nativamente desde 2021.
// ═══════════════════════════════════════════════════════════════
function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
function fadeProgress(tMs, startMs, durMs) { return Math.max(0, Math.min(1, (tMs - startMs) / durMs)); }

async function generateVideoClip() {
  if (!state.img) { toast(uiT('videoNeedsPhotoMsg')); return; }
  if (!window.MediaRecorder || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    toast(uiT('videoUnsupportedMsg'));
    return;
  }
  const mimeCandidates = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mimeType = mimeCandidates.find(t => MediaRecorder.isTypeSupported(t));
  if (!mimeType) { toast(uiT('videoUnsupportedMsg')); return; }

  const btn = document.getElementById('btnVideo');
  const originalLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = uiT('videoRecordingLabel'); }

  const DURATION_MS = 6000;
  const FPS = 30;
  const W = 1080, H = 1920; // vertical — Stories/Reels/TikTok usam todos este formato
  const FS = Math.sqrt((W * H) / (1080 * 1350));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // guarda o ajuste de enquadramento atual desta foto — o vídeo usa o MESMO
  // mecanismo (getCropAdjust/smartCoverDraw), só que o zoom vai animado.
  // Repõe exatamente como estava no fim, para não alterar nada do que a
  // pessoa já tinha ajustado à mão.
  const savedAdjust = state.cropAdjust[state.photo] ? { ...state.cropAdjust[state.photo] } : null;
  const locLine = state.loc || '';

  function drawVideoFrame(tMs) {
    const p = Math.min(1, tMs / DURATION_MS);
    state.cropAdjust[state.photo] = { panX: 0.5, panY: 0.5, zoom: 1.0 + 0.12 * easeOutCubic(p) };
    const P = pal();

    smartCoverDraw(ctx, state.img, 0, 0, W, H, true);
    const g = ctx.createLinearGradient(0, H * 0.42, 0, H);
    g.addColorStop(0, `rgba(${P.gradRGB},0)`); g.addColorStop(0.6, `rgba(${P.gradRGB},0.78)`); g.addColorStop(1, `rgba(${P.gradRGB},0.97)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const gt = ctx.createLinearGradient(0, 0, 0, H * 0.24);
    gt.addColorStop(0, `rgba(${P.gradRGB},0.6)`); gt.addColorStop(1, `rgba(${P.gradRGB},0)`);
    ctx.fillStyle = gt; ctx.fillRect(0, 0, W, H * 0.24);

    const badgeP = fadeProgress(tMs, 200, 500);
    if (state.badge && badgeP > 0) {
      ctx.save(); ctx.globalAlpha = badgeP;
      ctx.font = `400 ${26*FS}px "DM Sans", sans-serif`; ctx.fillStyle = P.overPhoto;
      spaced(ctx, state.badge.toUpperCase(), W / 2, 200, 8*FS);
      ctx.restore();
    }
    drawLogo(ctx, W / 2, 130, 0.9, P.overPhoto);

    const textP = fadeProgress(tMs, 700, 600);
    if (textP > 0) {
      ctx.save();
      ctx.globalAlpha = textP;
      ctx.translate(0, (1 - textP) * 24);
      ctx.textAlign = 'center';
      const footerY = H - 64;
      const specs = state.showSpecs ? specsLine() : '';
      ctx.font = `300 ${40*FS}px "DM Sans", sans-serif`;
      const tLines = wrapN(ctx, state.title, W - 180, 2);

      let cursor = footerY - 90;
      let specsY = null;
      if (specs) { specsY = cursor; cursor = specsY - 84*FS; }
      const locY = cursor; cursor = locY - 58*FS;
      const titleYs = [];
      for (let i = tLines.length - 1; i >= 0; i--) { titleYs.unshift(cursor); cursor -= 52*FS; }
      const priceY = cursor - 30*FS;

      ctx.fillStyle = P.goldBig;
      const ps = fitText(ctx, state.price, W - 160, '500 SIZEpx "Cormorant Garamond", serif', 48*FS, 96*FS);
      ctx.font = `500 ${ps}px "Cormorant Garamond", serif`;
      ctx.fillText(state.price, W / 2, priceY);

      ctx.fillStyle = P.ink; ctx.font = `300 ${40*FS}px "DM Sans", sans-serif`;
      tLines.forEach((l, i) => ctx.fillText(l, W / 2, titleYs[i]));

      ctx.fillStyle = P.muted; ctx.font = `300 ${30*FS}px "DM Sans", sans-serif`;
      ctx.fillText('📍 ' + locLine, W / 2, locY);

      if (specs) {
        ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(W/2 - 200*FS, specsY - 42*FS); ctx.lineTo(W/2 + 200*FS, specsY - 42*FS); ctx.stroke();
        ctx.fillStyle = P.gold;
        const ss = fitText(ctx, specs, W - 140*FS, '300 SIZEpx "DM Sans", sans-serif', 15*FS, 28*FS);
        ctx.font = `300 ${ss}px "DM Sans", sans-serif`;
        ctx.fillText(specs, W / 2, specsY);
      }
      watermark(() => {
        ctx.fillStyle = P.faint; ctx.font = `300 ${22*FS}px "DM Sans", sans-serif`;
        ctx.fillText(footerLine(), W / 2, footerY);
      });
      ctx.restore();
    }
  }

  try {
    const stream = canvas.captureStream(FPS);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const recordedDone = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();

    const t0 = performance.now();
    await new Promise(resolve => {
      function tick() {
        const elapsed = performance.now() - t0;
        drawVideoFrame(elapsed);
        if (elapsed < DURATION_MS) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
    recorder.stop();
    await recordedDone;

    const blob = new Blob(chunks, { type: mimeType });
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    await saveBlob(blob, 'my-studio-video-' + Date.now() + '.' + ext);
  } catch (e) {
    console.error('[vídeo] falha ao gravar:', e);
    toast(uiT('videoErrorMsg'));
  } finally {
    // repõe o ajuste de enquadramento exatamente como estava — o vídeo não
    // pode deixar rasto no que a pessoa já tinha ajustado à mão
    if (savedAdjust) state.cropAdjust[state.photo] = savedAdjust;
    else delete state.cropAdjust[state.photo];
    draw();
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
  }
}

async function sharePNG() {
  const c = document.getElementById('preview');
  try {
    const b = await canvasBlob(c);
    const filename = 'z-' + state.format + '.png';

    if (IS_NATIVE_PLATFORM && window.Capacitor?.Plugins?.Share && window.Capacitor?.Plugins?.Filesystem) {
      try {
        const { Filesystem, Directory, Share } = window.Capacitor.Plugins;
        const base64 = await blobToBase64(b);
        const written = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
        await Share.share({
          title: state.title || 'My Studio',
          text: (document.getElementById('caption').value || '').slice(0, 200),
          url: written.uri,
        });
        return;
      } catch (e) {
        if (e.message && e.message.includes('cancel')) return; // pessoa cancelou a folha de partilha nativa
        console.error('[platform/capacitor] Share falhou, a usar fallback web:', e);
      }
    }

    const file = new File([b], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: state.title || 'My Studio', text: (document.getElementById('caption').value || '').slice(0, 200) });
    } else {
      toast('Este browser não suporta partilha direta — a descarregar.');
      downloadPNG();
    }
  } catch (e) {
    if (e.name !== 'AbortError') { console.error(e); toast('Não foi possível partilhar.'); }
  }
}

// Exportação em PDF — útil como flyer para imprimir ou anexar a um email.
async function downloadPDF() {
  if (typeof window.jspdf === 'undefined') { toast('Biblioteca de PDF ainda a carregar — tenta de novo em 1-2 segundos.'); return; }
  try {
    const { jsPDF } = window.jspdf;
    const c = document.getElementById('preview');
    const imgData = c.toDataURL('image/jpeg', 0.92);
    const orient = c.width >= c.height ? 'l' : 'p';
    const pdf = new jsPDF({ orientation: orient, unit: 'px', format: [c.width, c.height] });
    pdf.addImage(imgData, 'JPEG', 0, 0, c.width, c.height);
    pdf.save('z-' + state.format + '-' + slugify(state.title) + '.pdf');
    toast('PDF descarregado');
  } catch (e) { console.error(e); toast('Erro ao gerar o PDF.'); }
}

// Vista em grelha — todos os slides do carrossel de uma vez, para escolher rapidamente.
async function toggleSlideGrid() {
  const ov = document.getElementById('slideGridOverlay');
  const opening = ov.classList.contains('hide');
  ov.classList.toggle('hide');
  if (!opening) return;
  const wrap = document.getElementById('slideGridWrap');
  wrap.innerHTML = '<div style="padding:20px;color:#888;">A gerar miniaturas…</div>';
  await document.fonts.ready;
  const [W, H] = FORMATS[state.format];
  const thumbW = 160, thumbH = Math.round(thumbW * H / W);
  const cells = [];
  for (let i = 0; i < state.slides.length; i++) {
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    await renderTo(off, state.slides[i]);
    const c2 = document.createElement('canvas'); c2.width = thumbW; c2.height = thumbH;
    c2.getContext('2d').drawImage(off, 0, 0, thumbW, thumbH);
    c2.style.display = 'block'; c2.style.width = '100%';
    const cell = document.createElement('div');
    cell.style.cssText = 'cursor:pointer;border:2px solid ' + (i === state.slideIdx ? 'var(--gold)' : 'transparent') + ';border-radius:4px;overflow:hidden;';
    cell.appendChild(c2);
    cell.onclick = () => { state.slideIdx = i; syncSlide(); toggleSlideGrid(); };
    cells.push(cell);
  }
  wrap.innerHTML = '';
  cells.forEach(c => wrap.appendChild(c));
}

async function downloadCarousel() {
  if (state.slides.length < 2) return;
  const btn = document.getElementById('btnCarousel');
  btn.disabled = true;
  await document.fonts.ready;
  const [W, H] = FORMATS[state.format];
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const base = slugify(state.title);
  let ok = 0;
  const zip = (typeof JSZip !== 'undefined') ? new JSZip() : null;
  try {
    for (let i = 0; i < state.slides.length; i++) {
      btn.textContent = 'A gerar ' + (i + 1) + ' / ' + state.slides.length + '…';
      await renderTo(off, state.slides[i]);
      const b = await canvasBlob(off);
      if (!b) { console.warn('Slide ' + (i + 1) + ' falhou (imagem sem CORS?)'); continue; }
      const name = 'z-carrossel-' + base + '-' + String(i + 1).padStart(2, '0') + '.png';
      if (zip) { zip.file(name, b); }
      else { saveBlob(b, name); await new Promise(r => setTimeout(r, 500)); }
      ok++;
    }
    if (zip && ok) {
      btn.textContent = 'A comprimir…';
      const zb = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      saveBlob(zb, 'z-carrossel-' + base + '.zip');
    }
    toast(ok === state.slides.length
      ? (zip ? 'ZIP com ' + ok + ' slides descarregado' : ok + ' slides descarregados')
      : ok + ' de ' + state.slides.length + ' slides — vê a consola');
  } catch (e) {
    console.error(e);
    toast('Erro no carrossel após ' + ok + ' slide(s) — vê a consola.');
  } finally {
    btn.disabled = false;
    btn.textContent = '↓ Carrossel completo';
  }
}

async function downloadAllFormats() {
  const btn = document.getElementById('btnAllFormats');
  btn.disabled = true;
  await document.fonts.ready;
  const base = slugify(state.title);
  const originalFormat = state.format;
  const zip = (typeof JSZip !== 'undefined') ? new JSZip() : null;
  let ok = 0;
  const keys = Object.keys(FORMATS);
  try {
    for (let i = 0; i < keys.length; i++) {
      const fmt = keys[i];
      const [W, H] = FORMATS[fmt];
      btn.textContent = 'A gerar ' + (i + 1) + ' / ' + keys.length + ' — ' + fmt + '…';
      state.format = fmt; // alguns layouts (ex. Story) dependem de state.format, não só de W/H
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      await renderTo(off);
      const b = await canvasBlob(off);
      if (!b) { console.warn('Formato ' + fmt + ' falhou (imagem sem CORS?)'); continue; }
      const name = 'z-' + fmt + '-' + base + '.png';
      if (zip) zip.file(name, b);
      else { saveBlob(b, name); await new Promise(r => setTimeout(r, 400)); }
      ok++;
    }
    if (zip && ok) {
      btn.textContent = 'A comprimir…';
      const zb = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      saveBlob(zb, 'z-todos-formatos-' + base + '.zip');
    }
    toast(ok === keys.length
      ? (zip ? 'ZIP com ' + ok + ' formatos descarregado' : ok + ' formatos descarregados')
      : ok + ' de ' + keys.length + ' formatos — vê a consola');
  } catch (e) {
    console.error(e);
    toast('Erro ao gerar todos os formatos — vê a consola.');
  } finally {
    state.format = originalFormat;
    btn.disabled = false;
    btn.textContent = '↓ Todos os formatos (.zip)';
  }
}

function copyCaption() {
  navigator.clipboard.writeText(document.getElementById('caption').value)
    .then(() => toast('Legenda copiada'))
    .catch(() => toast('Não foi possível copiar'));
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

// ═══════════════════════════════════════════════════════════════
//  MARCA & IDIOMAS — torna o My Studio universal: qualquer nome,
//  cor, site, com ou sem marca de água, e até 6 idiomas ativos.
// ═══════════════════════════════════════════════════════════════
function toggleBrandPanel() {
  const p = document.getElementById('brandPanel');
  p.classList.toggle('hide');
}
function onBrandChange(field, value) {
  state.brand[field] = value;
  if (field === 'accent') {
    setGoldVar(value);
    state._styleCustomized = true; // a pessoa escolheu a cor à mão — a categoria já não a sobrepõe
  }
  draw();
  scheduleSaveDraft();
}
function handleBrandLogoUpload(files) {
  const f = files && files[0]; if (!f) return;
  const url = URL.createObjectURL(f);
  state.brand.logoUrl = url;
  state._customLogoFile = f;
  // nota: o cabeçalho da app mantém sempre o logótipo ZOS — o logótipo do
  // cliente é usado no post gerado (watermark), não na barra da própria app.
  ensureBrandLogoLoaded();
  draw();
  scheduleSaveDraft();
}
function toggleLangActive(l) {
  if (l === 'pt') return; // pt é sempre a base do estúdio
  if (state.brand.langs.has(l)) state.brand.langs.delete(l); else state.brand.langs.add(l);
  document.querySelectorAll('#langsSeg button').forEach(b => b.classList.toggle('active', state.brand.langs.has(b.dataset.l)));
  renderLangSwitch();
  scheduleSaveDraft();
}
const LANG_LABELS = { en:'EN', pt:'PT', fr:'FR', es:'ES', de:'DE', it:'IT' };
const SUPPORTED_UI_LANGS = ['en', 'pt', 'fr', 'es', 'de', 'it'];

function renderLangSwitch() {
  const el = document.getElementById('langSwitch');
  if (!el) return;

  const activeLang = SUPPORTED_UI_LANGS.includes(state.lang)
    ? state.lang
    : 'en';

  state.lang = activeLang;

  el.replaceChildren(
    ...SUPPORTED_UI_LANGS.map(lang => {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = LANG_LABELS[lang];
      return option;
    })
  );

  el.value = activeLang;
  document.documentElement.lang = activeLang;
}
renderLangSwitch();
// Sem logótipo por defeito — drawLogo() usa a inicial do nome da marca até
// a pessoa carregar o seu próprio logótipo em "Marca & Idiomas".

// Guarda rascunho automaticamente ao editar qualquer campo de texto/checkbox da barra lateral
document.querySelector('.controls').addEventListener('input', scheduleSaveDraft);
document.querySelector('.controls').addEventListener('change', scheduleSaveDraft);
document.getElementById('caption').addEventListener('input', scheduleSaveDraft);
// Histórico para desfazer/refazer (Ctrl/Cmd+Z) — só nos campos de texto principais
document.getElementById('fTitle').addEventListener('input', pushHistory);
document.getElementById('fPrice').addEventListener('input', pushHistory);
document.getElementById('fLoc').addEventListener('input', pushHistory);
document.getElementById('fBadge').addEventListener('input', pushHistory);
document.getElementById('caption').addEventListener('input', pushHistory);
refreshBrandKitSelect();
applyUIStrings(); // traduz a interface logo no arranque, antes de qualquer interação

// Regista o service worker (instalabilidade em Android/Chrome) — nunca bloqueia
// o arranque da app se falhar (ex.: em file:// ou sem HTTPS, onde não é suportado).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

loadAll();
