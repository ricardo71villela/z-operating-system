// ZSTUDIO_PREVIEW_STATE_MACHINE_V1
// Laptop preview authority injected immediately before loadAll().
// It separates EMPTY / LOADING / READY / ERROR rendering, makes restored
// draft media deterministic, gates media exports until a decoded image exists,
// and fits the canvas to the real creative-column space instead of viewport
// subtraction constants.

const ZSTUDIO_PREVIEW_STATES = Object.freeze({
  EMPTY: 'empty',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error'
});

const ZSTUDIO_PREVIEW_COPY = Object.freeze({
  pt: Object.freeze({ loading: 'A recuperar o seu conteúdo…', error: 'Não foi possível abrir esta imagem.' }),
  en: Object.freeze({ loading: 'Restoring your content…', error: 'This image could not be opened.' }),
  fr: Object.freeze({ loading: 'Récupération de votre contenu…', error: 'Impossible d’ouvrir cette image.' }),
  es: Object.freeze({ loading: 'Recuperando tu contenido…', error: 'No se pudo abrir esta imagen.' }),
  de: Object.freeze({ loading: 'Inhalt wird wiederhergestellt…', error: 'Dieses Bild konnte nicht geöffnet werden.' }),
  it: Object.freeze({ loading: 'Ripristino dei contenuti…', error: 'Impossibile aprire questa immagine.' })
});

let zstudioPreviewState = ZSTUDIO_PREVIEW_STATES.EMPTY;
let zstudioPreviewReason = 'boot';
let zstudioPreviewFitQueued = false;
let zstudioPreviewResizeObserver = null;

function getStudioPreviewState() {
  return zstudioPreviewState;
}

function isStudioPreviewReady() {
  return zstudioPreviewState === ZSTUDIO_PREVIEW_STATES.READY && !!state.img;
}

function resolveStudioPreviewState() {
  if (state.img) return ZSTUDIO_PREVIEW_STATES.READY;
  if (zstudioPreviewState === ZSTUDIO_PREVIEW_STATES.ERROR) return ZSTUDIO_PREVIEW_STATES.ERROR;
  if (zstudioPreviewState === ZSTUDIO_PREVIEW_STATES.LOADING) return ZSTUDIO_PREVIEW_STATES.LOADING;
  if ((state.photos && state.photos.length) || state.photo) return ZSTUDIO_PREVIEW_STATES.LOADING;
  return ZSTUDIO_PREVIEW_STATES.EMPTY;
}

function studioPreviewExportTargets() {
  return [
    ...document.querySelectorAll('[data-i18n="downloadPngBtn"]'),
    ...document.querySelectorAll('#btnCarousel'),
    ...document.querySelectorAll('[data-i18n="allFormatsBtn"]'),
    ...document.querySelectorAll('[data-i18n="shareBtn"]'),
    ...document.querySelectorAll('[data-i18n="videoBtn"]'),
    ...document.querySelectorAll('[data-i18n="pdfBtn"]'),
    ...document.querySelectorAll('.export-more-toggle')
  ];
}

function syncStudioPreviewAvailability() {
  const mode = resolveStudioPreviewState();
  const ready = mode === ZSTUDIO_PREVIEW_STATES.READY && !!state.img;
  const root = document.documentElement;
  const stage = document.querySelector('.stage');
  const preview = document.getElementById('preview');
  const slideNav = document.querySelector('.slide-nav');

  root.setAttribute('data-zstudio-preview-state', mode);
  if (stage) stage.setAttribute('data-preview-state', mode);
  if (preview) {
    preview.setAttribute('aria-busy', mode === ZSTUDIO_PREVIEW_STATES.LOADING ? 'true' : 'false');
    preview.setAttribute('data-preview-ready', ready ? 'true' : 'false');
  }

  studioPreviewExportTargets().forEach(el => {
    if ('disabled' in el) el.disabled = !ready;
    el.setAttribute('aria-disabled', ready ? 'false' : 'true');
    el.classList.toggle('zs-media-disabled', !ready);
  });

  if (!ready && slideNav) slideNav.classList.remove('on');
  queueStudioPreviewFit();
}

function setStudioPreviewState(next, reason) {
  if (!Object.values(ZSTUDIO_PREVIEW_STATES).includes(next)) {
    throw new Error('Unknown Z Studio preview state: ' + next);
  }
  zstudioPreviewState = next;
  zstudioPreviewReason = String(reason || 'unspecified');
  syncStudioPreviewAvailability();
}

function studioPreviewCopy(key) {
  const lang = state && state.lang;
  const dict = ZSTUDIO_PREVIEW_COPY[lang] || ZSTUDIO_PREVIEW_COPY.en;
  return dict[key] || '';
}

function renderStudioPreviewStateCanvas(ctx, W, H, mode) {
  const P = pal();
  fillBg(ctx, W, H, P);

  if (mode === ZSTUDIO_PREVIEW_STATES.EMPTY) {
    drawPlaceholderArt(ctx, W, H, P);
    return;
  }

  // Loading/error are intentionally neutral preview states. They never enter
  // the production template renderer and therefore can never overlap title,
  // price, badge or location with placeholder content.
  const cx = W / 2;
  const cy = H * 0.46;
  const radius = Math.max(22, Math.min(W, H) * 0.032);
  ctx.save();
  ctx.strokeStyle = P.gold;
  ctx.globalAlpha = mode === ZSTUDIO_PREVIEW_STATES.ERROR ? 0.52 : 0.32;
  ctx.lineWidth = Math.max(1.5, W * 0.0016);
  ctx.beginPath();
  ctx.arc(cx, cy - radius * 0.45, radius, 0, Math.PI * 2);
  ctx.stroke();
  if (mode === ZSTUDIO_PREVIEW_STATES.LOADING) {
    ctx.beginPath();
    ctx.globalAlpha = 0.78;
    ctx.arc(cx, cy - radius * 0.45, radius, -Math.PI / 2, Math.PI * 0.15);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = P.gold;
  ctx.globalAlpha = 0.72;
  ctx.font = `400 ${Math.round(W * 0.021)}px "DM Sans", sans-serif`;
  ctx.fillText(
    studioPreviewCopy(mode === ZSTUDIO_PREVIEW_STATES.ERROR ? 'error' : 'loading'),
    cx,
    cy + radius * 1.45
  );
  ctx.restore();
}

function studioPreviewCenterColumnWidth(stage, caption, style) {
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const columnGap = parseFloat(style.columnGap) || 0;
  const captionVisible = caption && caption.offsetParent !== null;
  const captionWidth = captionVisible ? caption.getBoundingClientRect().width : 0;
  return Math.max(280, stage.clientWidth - paddingLeft - paddingRight - captionWidth - (captionVisible ? columnGap : 0));
}

function fitStudioPreviewToWorkspace() {
  if (!window.matchMedia || !window.matchMedia('(min-width:981px)').matches) return;
  const stage = document.querySelector('.stage');
  const frame = document.querySelector('.canvas-frame');
  const preview = document.getElementById('preview');
  const actions = document.querySelector('.actions');
  const nav = document.querySelector('.slide-nav');
  const caption = document.querySelector('.caption-box');
  if (!stage || !frame || !preview || !actions) return;

  const style = getComputedStyle(stage);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const rowGap = parseFloat(style.rowGap || style.gap) || 0;
  const navVisible = nav && nav.classList.contains('on') && getComputedStyle(nav).display !== 'none';
  const navHeight = navVisible ? nav.getBoundingClientRect().height : 0;
  const actionsHeight = actions.getBoundingClientRect().height || 42;
  const gapCount = navVisible ? 2 : 1;
  const centerWidth = studioPreviewCenterColumnWidth(stage, caption, style);
  const centerHeight = Math.max(
    260,
    stage.clientHeight - paddingTop - paddingBottom - navHeight - actionsHeight - rowGap * gapCount
  );

  const frameChrome = 24;
  const maxCanvasWidth = Math.max(240, centerWidth - frameChrome - 10);
  const maxCanvasHeight = Math.max(240, centerHeight - frameChrome - 8);
  const intrinsicWidth = Math.max(1, Number(preview.width) || 1080);
  const intrinsicHeight = Math.max(1, Number(preview.height) || 1350);
  let scale = Math.min(maxCanvasWidth / intrinsicWidth, maxCanvasHeight / intrinsicHeight);

  // Empty/loading states should invite content, not dominate the workspace.
  const mode = resolveStudioPreviewState();
  if (mode !== ZSTUDIO_PREVIEW_STATES.READY) scale *= 0.84;
  scale = Math.max(0.12, scale);

  const renderWidth = Math.max(180, Math.floor(intrinsicWidth * scale));
  const renderHeight = Math.max(180, Math.floor(intrinsicHeight * scale));
  preview.style.width = renderWidth + 'px';
  preview.style.height = renderHeight + 'px';
  preview.style.maxWidth = 'none';
  preview.style.maxHeight = 'none';
  frame.style.width = Math.min(centerWidth, renderWidth + frameChrome) + 'px';
  frame.style.height = Math.min(centerHeight, renderHeight + frameChrome) + 'px';
  frame.style.maxWidth = '100%';
  frame.style.maxHeight = '100%';

  document.documentElement.setAttribute('data-zstudio-preview-fit', 'runtime-v1');
}

function queueStudioPreviewFit() {
  if (zstudioPreviewFitQueued) return;
  zstudioPreviewFitQueued = true;
  requestAnimationFrame(() => {
    zstudioPreviewFitQueued = false;
    fitStudioPreviewToWorkspace();
  });
}

async function hydrateStudioActivePhoto(reason) {
  if (!state.photo && state.photos && state.photos.length) state.photo = state.photos[0];
  if (!state.photo) {
    state.img = null;
    setStudioPreviewState(ZSTUDIO_PREVIEW_STATES.EMPTY, reason || 'no-media');
    return null;
  }

  setStudioPreviewState(ZSTUDIO_PREVIEW_STATES.LOADING, reason || 'hydrate');
  try {
    const decoded = await loadImg(state.photo);
    if (!decoded) throw new Error('Decoded image is empty');
    state.img = decoded;
    setStudioPreviewState(ZSTUDIO_PREVIEW_STATES.READY, reason || 'hydrated');
    return decoded;
  } catch (error) {
    state.img = null;
    setStudioPreviewState(ZSTUDIO_PREVIEW_STATES.ERROR, reason || 'decode-failed');
    console.warn('Z Studio preview image decode failed:', error);
    return null;
  }
}

// ── Renderer state isolation ────────────────────────────────────────────────
const zstudioBaseDrawListing = drawListing;
drawListing = async function zstudioStateAwareDrawListing(ctx, W, H) {
  const mode = resolveStudioPreviewState();
  if (mode !== ZSTUDIO_PREVIEW_STATES.READY || !state.img) {
    renderStudioPreviewStateCanvas(ctx, W, H, mode);
    return;
  }
  return zstudioBaseDrawListing(ctx, W, H);
};

// ── Deterministic draft hydration ──────────────────────────────────────────
const zstudioBaseLoadDraftIfAny = loadDraftIfAny;
loadDraftIfAny = async function zstudioStateAwareLoadDraftIfAny() {
  setStudioPreviewState(ZSTUDIO_PREVIEW_STATES.LOADING, 'draft-start');
  await zstudioBaseLoadDraftIfAny();
  if (state.photo || (state.photos && state.photos.length)) {
    await hydrateStudioActivePhoto('draft-restored');
    if (state.img) buildSlides(0);
  } else {
    setStudioPreviewState(ZSTUDIO_PREVIEW_STATES.EMPTY, 'draft-empty');
  }
};

// Any canonical slide rebuild after media decode reasserts READY. When the
// collection is empty it reasserts EMPTY. This covers fresh uploads/removals.
const zstudioBaseBuildSlides = buildSlides;
buildSlides = function zstudioStateAwareBuildSlides() {
  const result = zstudioBaseBuildSlides.apply(this, arguments);
  if (state.img) setStudioPreviewState(ZSTUDIO_PREVIEW_STATES.READY, 'slides-ready');
  else if (!(state.photos && state.photos.length) && !state.photo) {
    setStudioPreviewState(ZSTUDIO_PREVIEW_STATES.EMPTY, 'slides-empty');
  }
  queueStudioPreviewFit();
  return result;
};

if (typeof pickPhoto === 'function') {
  const zstudioBasePickPhoto = pickPhoto;
  pickPhoto = function zstudioStateAwarePickPhoto() {
    setStudioPreviewState(ZSTUDIO_PREVIEW_STATES.LOADING, 'photo-switch');
    const result = zstudioBasePickPhoto.apply(this, arguments);
    draw();
    return result;
  };
}

if (typeof clearDraft === 'function') {
  const zstudioBaseClearDraft = clearDraft;
  clearDraft = async function zstudioStateAwareClearDraft() {
    const result = await zstudioBaseClearDraft.apply(this, arguments);
    state.img = null;
    setStudioPreviewState(ZSTUDIO_PREVIEW_STATES.EMPTY, 'draft-cleared');
    draw();
    return result;
  };
}

if (typeof setFormat === 'function') {
  const zstudioBaseSetFormat = setFormat;
  setFormat = function zstudioStateAwareSetFormat() {
    const result = zstudioBaseSetFormat.apply(this, arguments);
    queueStudioPreviewFit();
    return result;
  };
}

function installStudioPreviewFitObservers() {
  if (!window.matchMedia || !window.matchMedia('(min-width:981px)').matches) return;
  const stage = document.querySelector('.stage');
  if (stage && typeof ResizeObserver === 'function' && !zstudioPreviewResizeObserver) {
    zstudioPreviewResizeObserver = new ResizeObserver(queueStudioPreviewFit);
    zstudioPreviewResizeObserver.observe(stage);
  }
  window.addEventListener('resize', queueStudioPreviewFit, { passive: true });
  queueStudioPreviewFit();
}

window.ZStudioPreviewRuntime = Object.freeze({
  authority: 'ZSTUDIO_PREVIEW_STATE_MACHINE_V1',
  states: ZSTUDIO_PREVIEW_STATES,
  getState: getStudioPreviewState,
  isReady: isStudioPreviewReady,
  hydrateActivePhoto: hydrateStudioActivePhoto,
  fit: fitStudioPreviewToWorkspace,
  syncAvailability: syncStudioPreviewAvailability,
  getReason: () => zstudioPreviewReason
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installStudioPreviewFitObservers, { once: true });
} else {
  installStudioPreviewFitObservers();
}

setStudioPreviewState(
  state.img ? ZSTUDIO_PREVIEW_STATES.READY : ZSTUDIO_PREVIEW_STATES.EMPTY,
  'runtime-installed'
);
