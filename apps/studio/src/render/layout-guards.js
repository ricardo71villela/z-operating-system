// Z STUDIO — Renderer layout guards v1
// Stabilization module loaded after src/main.js. It deliberately overrides
// drawLogo() and drawGridTextBand() while the legacy renderer is progressively
// modularized. The helpers are also exposed to the Electron regression contract.
// ZSTUDIO_LAYOUT_GUARDS_V1

function measureSpacedTextWidth(ctx, txt, letterSpacing) {
  const chars = [...String(txt || '')];
  if (!chars.length) return 0;
  const widths = chars.map(ch => ctx.measureText(ch).width);
  return widths.reduce((a, b) => a + b, 0) + letterSpacing * Math.max(0, chars.length - 1);
}

function getLogoSafeLayout(ctx, requestedCx, requestedScale) {
  const t = I18N[state.lang] || I18N.pt;
  const text = t.poweredBy + ' MY STUDIO';
  const W = ctx.canvas.width;
  const baseMargin = Math.max(12, 16 * requestedScale);

  function dimensions(scale) {
    const previousFont = ctx.font;
    const fontSize = (brandLogoImg ? 13 : 15) * scale;
    const spacing = (brandLogoImg ? 4.5 : 6) * scale;
    ctx.font = `300 ${fontSize}px "DM Sans", sans-serif`;
    const textWidth = measureSpacedTextWidth(ctx, text, spacing);
    ctx.font = previousFont;

    let artWidth = 120 * scale;
    if (brandLogoImg && brandLogoImg.height) {
      const h = 92 * scale;
      artWidth = h * (brandLogoImg.width / brandLogoImg.height);
    }
    return { textWidth, artWidth, halfWidth: Math.max(textWidth, artWidth) / 2 };
  }

  let scale = requestedScale;
  let d = dimensions(scale);
  const available = Math.max(1, W - 2 * baseMargin);
  if (d.halfWidth * 2 > available) {
    scale *= available / (d.halfWidth * 2);
    d = dimensions(scale);
  }

  const margin = Math.max(12, 16 * scale);
  if (d.halfWidth * 2 + margin * 2 >= W) {
    return { cx: W / 2, scale, halfWidth: d.halfWidth, margin };
  }

  const minCx = d.halfWidth + margin;
  const maxCx = W - d.halfWidth - margin;
  const cx = Math.max(minCx, Math.min(maxCx, requestedCx));
  return { cx, scale, halfWidth: d.halfWidth, margin };
}

function drawLogo(ctx, cx, y, scale, color) {
  const t = I18N[state.lang] || I18N.pt;
  watermark(() => {
    const safe = getLogoSafeLayout(ctx, cx, scale);
    cx = safe.cx;
    scale = safe.scale;

    const gold = color || state.brand.accent || '#B8935A';
    ctx.textAlign = 'center';
    if (brandLogoImg) {
      const h = 92 * scale;
      const w = h * (brandLogoImg.width / brandLogoImg.height);
      const top = y - h * 0.66;
      ctx.drawImage(brandLogoImg, cx - w / 2, top, w, h);
      ctx.font = `300 ${13 * scale}px "DM Sans", sans-serif`;
      ctx.fillStyle = gold;
      spaced(ctx, t.poweredBy + ' MY STUDIO', cx, top + h + 22 * scale, 4.5 * scale);
      return;
    }

    ctx.fillStyle = gold;
    ctx.font = `500 ${86 * scale}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText(brandInitial(), cx, y);
    ctx.strokeStyle = gold;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    ctx.moveTo(cx - 60 * scale, y + 14 * scale);
    ctx.lineTo(cx + 60 * scale, y + 14 * scale);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = `300 ${15 * scale}px "DM Sans", sans-serif`;
    ctx.fillStyle = gold;
    spaced(ctx, t.poweredBy + ' MY STUDIO', cx, y + 40 * scale, 6 * scale);
  });
}

function getGridTextBandLayout(ctx, W, H, gridH, FS, story) {
  const hasBadge = !!state.badge;
  const extraBand = (hasBadge ? (story ? 64 : 56) : 0) * FS;
  const bandTop = Math.max(0, gridH - extraBand);

  const badgeTop = bandTop + 18 * FS;
  const badgeHeight = 42 * FS;
  const badgeBottom = hasBadge ? badgeTop + badgeHeight : bandTop;

  const titleSize = fitText(
    ctx,
    state.title,
    W - 128 * FS,
    '500 SIZEpx "Cormorant Garamond", serif',
    34 * FS,
    54 * FS
  );

  let titleBaseline = bandTop + (hasBadge ? (story ? 130 : 120) : (story ? 98 : 84)) * FS;
  const minimumTitleTop = badgeBottom + 12 * FS;
  const estimatedAscent = titleSize * 0.92;
  if (titleBaseline - estimatedAscent < minimumTitleTop) {
    titleBaseline = minimumTitleTop + estimatedAscent;
  }

  const titleTop = titleBaseline - estimatedAscent;
  const locationY = titleBaseline + titleSize + 14 * FS;
  const footerY = H - 22 * FS;

  return {
    bandTop,
    badgeTop,
    badgeHeight,
    badgeBottom,
    titleSize,
    titleBaseline,
    titleTop,
    locationY,
    footerY,
    gap: titleTop - badgeBottom
  };
}

function drawGridTextBand(ctx, W, H, P, gridH, FS, story, locLine) {
  const layout = getGridTextBandLayout(ctx, W, H, gridH, FS, story);
  fillBg(ctx, W, H, P, layout.bandTop, H);
  ctx.strokeStyle = P.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, layout.bandTop);
  ctx.lineTo(W, layout.bandTop);
  ctx.stroke();

  if (state.badge) {
    ctx.font = `400 ${20 * FS}px "DM Sans", sans-serif`;
    const bw = ctx.measureText(state.badge.toUpperCase()).width + 40 * FS;
    ctx.fillStyle = P.badgeBg;
    ctx.fillRect(56 * FS, layout.badgeTop, bw, layout.badgeHeight);
    ctx.fillStyle = P.badgeInk;
    ctx.textAlign = 'left';
    ctx.fillText(state.badge.toUpperCase(), 56 * FS + 18 * FS, layout.badgeTop + 28 * FS);
  }

  let y = layout.titleBaseline;
  ctx.textAlign = 'left';
  ctx.fillStyle = P.ink;
  ctx.font = `500 ${layout.titleSize}px "Cormorant Garamond", serif`;
  wrapN(ctx, state.title, W - 128 * FS, 1).forEach(line => {
    ctx.fillText(line, 56 * FS, y);
    y += layout.titleSize + 4 * FS;
  });

  y += 10 * FS;
  ctx.fillStyle = P.muted;
  ctx.font = `300 ${22 * FS}px "DM Sans", sans-serif`;
  if (locLine) ctx.fillText('📍 ' + locLine, 56 * FS, y);

  ctx.textAlign = 'right';
  ctx.fillStyle = P.goldBig;
  ctx.font = `500 ${34 * FS}px "Cormorant Garamond", serif`;
  ctx.fillText(state.price, W - 56 * FS, y);
  ctx.textAlign = 'left';

  watermark(() => {
    ctx.fillStyle = P.faint;
    ctx.font = `300 ${17 * FS}px "DM Sans", sans-serif`;
    ctx.fillText(footerLine(), 56 * FS, layout.footerY);
  });
}

// ZSTUDIO_ASSISTANT_EMPTY_STATE_V1
// Laptop-only UX layer. It does not change the editor/canvas/export authority;
// it turns the caption rail into a deliberate assistant state until a useful
// caption exists, and replaces provisional emoji UI glyphs with one coherent
// inline icon language. Mobile keeps the existing shell untouched.

const ZSTUDIO_ASSISTANT_COPY = Object.freeze({
  pt: {
    kicker: 'ASSISTENTE Z AI',
    title: 'Crie a legenda do seu conteúdo',
    body: 'A Z AI pode escrever a primeira versão, adaptá-la ao seu conteúdo e prepará-la para tradução.',
    generate: 'Gerar com Z AI',
    write: 'Escrever manualmente'
  },
  en: {
    kicker: 'Z AI ASSISTANT',
    title: 'Create a caption for your content',
    body: 'Z AI can write the first version, adapt it to your content and prepare it for translation.',
    generate: 'Generate with Z AI',
    write: 'Write manually'
  },
  fr: {
    kicker: 'ASSISTANT Z AI',
    title: 'Créez la légende de votre contenu',
    body: 'Z AI peut rédiger une première version, l’adapter à votre contenu et la préparer à la traduction.',
    generate: 'Générer avec Z AI',
    write: 'Écrire manuellement'
  },
  es: {
    kicker: 'ASISTENTE Z AI',
    title: 'Crea el texto de tu contenido',
    body: 'Z AI puede redactar una primera versión, adaptarla a tu contenido y prepararla para traducir.',
    generate: 'Generar con Z AI',
    write: 'Escribir manualmente'
  },
  de: {
    kicker: 'Z AI ASSISTENT',
    title: 'Erstelle den Text für deinen Inhalt',
    body: 'Z AI kann eine erste Version schreiben, an deinen Inhalt anpassen und für Übersetzungen vorbereiten.',
    generate: 'Mit Z AI erstellen',
    write: 'Manuell schreiben'
  },
  it: {
    kicker: 'ASSISTENTE Z AI',
    title: 'Crea la didascalia del tuo contenuto',
    body: 'Z AI può scrivere una prima versione, adattarla al contenuto e prepararla per la traduzione.',
    generate: 'Genera con Z AI',
    write: 'Scrivi manualmente'
  }
});

const ZSTUDIO_ICON_PATHS = Object.freeze({
  sparkles: '<path d="M12 3l1.15 3.1L16 7.25l-2.85 1.15L12 11.5l-1.15-3.1L8 7.25l2.85-1.15L12 3Z"/><path d="M18.2 12.8l.75 2.05L21 15.6l-2.05.75-.75 2.05-.75-2.05-2.05-.75 2.05-.75.75-2.05Z"/><path d="M5.4 12.2l.55 1.5 1.5.55-1.5.55-.55 1.5-.55-1.5-1.5-.55 1.5-.55.55-1.5Z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.8 12h16.4M12 3.5c2.1 2.2 3.2 5 3.2 8.5S14.1 18.3 12 20.5M12 3.5c-2.1 2.2-3.2 5-3.2 8.5s1.1 6.3 3.2 8.5"/>',
  folder: '<path d="M3.5 6.8h6l1.6 1.8h9.4v8.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.8Z"/><path d="M3.5 9h17"/>',
  trash: '<path d="M5.5 7.5h13M9 7.5V5.2h6v2.3M7.2 7.5l.7 11h8.2l.7-11M10.2 10.5v5.2M13.8 10.5v5.2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.8v2M12 18.2v2M3.8 12h2M18.2 12h2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4"/>',
  bulk: '<path d="M6 7.2 12 4l6 3.2-6 3.2-6-3.2Z"/><path d="m6 11.2 6 3.2 6-3.2M6 15.2l6 3.2 6-3.2"/>',
  download: '<path d="M12 4.5v10M8.5 11l3.5 3.5 3.5-3.5M5 18.5h14"/>',
  share: '<circle cx="17.5" cy="6.5" r="2"/><circle cx="6.5" cy="12" r="2"/><circle cx="17.5" cy="17.5" r="2"/><path d="m8.3 11 7.4-3.6M8.3 13l7.4 3.6"/>',
  video: '<rect x="4" y="5.5" width="12" height="13" rx="2"/><path d="m16 10 4-2.2v8.4L16 14"/>',
  file: '<path d="M7 3.8h7l3 3v13.4H7V3.8Z"/><path d="M14 3.8v3h3M9.5 11h5M9.5 14h5"/>',
  copy: '<rect x="8" y="8" width="10" height="10" rx="1.5"/><path d="M6 15H5.5A1.5 1.5 0 0 1 4 13.5v-8A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V6"/>',
  camera: '<path d="M4 8h3l1.4-2h7.2L17 8h3v10H4V8Z"/><circle cx="12" cy="13" r="3.2"/>',
  pencil: '<path d="m5 18.5 1-4 9.2-9.2 3.5 3.5-9.2 9.2-4 .5Z"/><path d="m13.8 6.7 3.5 3.5"/>'
});

function createStudioIcon(name, extraClass) {
  const span = document.createElement('span');
  span.className = 'zs-icon' + (extraClass ? ' ' + extraClass : '');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + (ZSTUDIO_ICON_PATHS[name] || ZSTUDIO_ICON_PATHS.sparkles) + '</svg>';
  return span;
}

function stripStudioIconPrefix(text) {
  return String(text || '')
    .replace(/^\s*(?:✨|🌐|📁|📂|🗑️?|⚙️?|📦|📤|🎬|📄|📋|⬇️?|↓)\s*/u, '')
    .trim();
}

const ZSTUDIO_ICON_TARGETS = Object.freeze([
  ['#btnAICaption', 'sparkles'],
  ['#btnAICaptionAll', 'globe'],
  ['#btnFolderPicker', 'folder'],
  ['#draftHint button[data-i18n="clearDraftBtn"]', 'trash'],
  ['#advancedToggleRow', 'settings'],
  ['#btnHeaderBulk', 'bulk'],
  ['[data-i18n="downloadPngBtn"]', 'download'],
  ['[data-i18n="allFormatsBtn"]', 'download'],
  ['[data-i18n="shareBtn"]', 'share'],
  ['[data-i18n="videoBtn"]', 'video'],
  ['[data-i18n="pdfBtn"]', 'file'],
  ['[data-i18n="copyCaptionBtn"]', 'copy']
]);

let zstudioApplyingIcons = false;
function decorateStudioIconTarget(el, iconName) {
  if (!el || el.querySelector('.zs-icon')) return;
  const label = stripStudioIconPrefix(el.textContent);
  el.textContent = '';
  el.classList.add('zs-iconized');
  el.appendChild(createStudioIcon(iconName));
  el.appendChild(document.createTextNode(label));
}

function decorateStudioDropzone() {
  const el = document.querySelector('.dropzone');
  if (!el || el.querySelector(':scope > .zs-icon')) return;
  const textNode = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE && String(node.nodeValue || '').trim());
  if (textNode) textNode.nodeValue = String(textNode.nodeValue || '').replace(/^\s*📷\s*/u, '');
  el.classList.add('zs-dropzone-iconized');
  el.prepend(createStudioIcon('camera', 'zs-dropzone-icon'));
}

function applyStudioIconSystem() {
  if (!window.matchMedia || !window.matchMedia('(min-width:981px)').matches) return;
  if (zstudioApplyingIcons) return;
  zstudioApplyingIcons = true;
  try {
    ZSTUDIO_ICON_TARGETS.forEach(([selector, icon]) => {
      document.querySelectorAll(selector).forEach(el => decorateStudioIconTarget(el, icon));
    });
    decorateStudioDropzone();
  } finally {
    zstudioApplyingIcons = false;
  }
}

let zstudioAssistantManualMode = false;
function zstudioAssistantCaptionIsMeaningful(value) {
  const ctas = new Set(Object.values(typeof I18N === 'object' && I18N ? I18N : {}).map(t => String(t && t.cta || '').trim()).filter(Boolean));
  const decorative = new Set(['✨', '✦', '✧']);
  const lines = String(value || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
  return lines.some(line => !decorative.has(line) && !ctas.has(line));
}

function zstudioAssistantStrings() {
  return ZSTUDIO_ASSISTANT_COPY[state && state.lang] || ZSTUDIO_ASSISTANT_COPY.en;
}

function renderStudioAssistantCopy() {
  const copy = zstudioAssistantStrings();
  document.querySelectorAll('[data-zs-assistant-copy]').forEach(el => {
    const key = el.getAttribute('data-zs-assistant-copy');
    if (copy[key]) el.textContent = copy[key];
  });
}

function ensureStudioAssistantEmptyState() {
  const body = document.getElementById('captionMobileBody');
  const caption = document.getElementById('caption');
  if (!body || !caption) return null;
  let empty = document.getElementById('zsAssistantEmptyState');
  if (!empty) {
    empty = document.createElement('section');
    empty.id = 'zsAssistantEmptyState';
    empty.className = 'zs-assistant-empty-state';
    empty.setAttribute('aria-live', 'polite');

    const iconWrap = document.createElement('div');
    iconWrap.className = 'zs-assistant-empty-icon';
    iconWrap.appendChild(createStudioIcon('sparkles'));

    const kicker = document.createElement('div');
    kicker.className = 'zs-assistant-empty-kicker';
    kicker.setAttribute('data-zs-assistant-copy', 'kicker');

    const title = document.createElement('h3');
    title.className = 'zs-assistant-empty-title';
    title.setAttribute('data-zs-assistant-copy', 'title');

    const bodyText = document.createElement('p');
    bodyText.className = 'zs-assistant-empty-body';
    bodyText.setAttribute('data-zs-assistant-copy', 'body');

    const actions = document.createElement('div');
    actions.className = 'zs-assistant-empty-actions';

    const generate = document.createElement('button');
    generate.type = 'button';
    generate.id = 'zsAssistantGenerate';
    generate.className = 'btn zs-assistant-primary zs-iconized';
    generate.appendChild(createStudioIcon('sparkles'));
    const generateText = document.createElement('span');
    generateText.setAttribute('data-zs-assistant-copy', 'generate');
    generate.appendChild(generateText);
    generate.addEventListener('click', () => {
      zstudioAssistantManualMode = false;
      if (typeof aiCaption === 'function') aiCaption();
    });

    const write = document.createElement('button');
    write.type = 'button';
    write.id = 'zsAssistantWrite';
    write.className = 'btn btn-line zs-assistant-secondary zs-iconized';
    write.appendChild(createStudioIcon('pencil'));
    const writeText = document.createElement('span');
    writeText.setAttribute('data-zs-assistant-copy', 'write');
    write.appendChild(writeText);
    write.addEventListener('click', () => {
      if (!zstudioAssistantCaptionIsMeaningful(caption.value)) caption.value = '';
      zstudioAssistantManualMode = true;
      syncStudioAssistantEmptyState();
      requestAnimationFrame(() => caption.focus());
    });

    actions.append(generate, write);
    empty.append(iconWrap, kicker, title, bodyText, actions);
    caption.before(empty);
  }
  renderStudioAssistantCopy();
  return empty;
}

function syncStudioAssistantEmptyState() {
  if (!window.matchMedia || !window.matchMedia('(min-width:1200px)').matches) return;
  const caption = document.getElementById('caption');
  const box = caption && caption.closest('.caption-box');
  const empty = ensureStudioAssistantEmptyState();
  if (!caption || !box || !empty) return;
  const meaningful = zstudioAssistantCaptionIsMeaningful(caption.value);
  if (meaningful) zstudioAssistantManualMode = false;
  const showEmpty = !meaningful && !zstudioAssistantManualMode;
  box.classList.toggle('zs-assistant-empty-active', showEmpty);
  empty.setAttribute('aria-hidden', showEmpty ? 'false' : 'true');
}

function observeStudioCaptionValue() {
  const caption = document.getElementById('caption');
  if (!caption || caption.dataset.zsValueObserved === 'true') return;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  if (descriptor && descriptor.get && descriptor.set) {
    Object.defineProperty(caption, 'value', {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() { return descriptor.get.call(this); },
      set(value) {
        descriptor.set.call(this, value);
        queueMicrotask(syncStudioAssistantEmptyState);
      }
    });
    caption.dataset.zsValueObserved = 'true';
  }
  caption.addEventListener('input', () => {
    if (String(caption.value || '').trim()) zstudioAssistantManualMode = true;
    syncStudioAssistantEmptyState();
  });
  caption.addEventListener('blur', () => {
    if (!String(caption.value || '').trim()) zstudioAssistantManualMode = false;
    syncStudioAssistantEmptyState();
  });
}

let zstudioUxRefreshQueued = false;
function queueStudioUxRefresh() {
  if (zstudioUxRefreshQueued) return;
  zstudioUxRefreshQueued = true;
  queueMicrotask(() => {
    zstudioUxRefreshQueued = false;
    applyStudioIconSystem();
    renderStudioAssistantCopy();
    syncStudioAssistantEmptyState();
  });
}

function initStudioAssistantAndIcons() {
  if (!window.matchMedia || !window.matchMedia('(min-width:981px)').matches) return;
  ensureStudioAssistantEmptyState();
  observeStudioCaptionValue();
  applyStudioIconSystem();
  syncStudioAssistantEmptyState();

  const langSwitch = document.getElementById('langSwitch');
  if (langSwitch) langSwitch.addEventListener('change', queueStudioUxRefresh);

  const observer = new MutationObserver(queueStudioUxRefresh);
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
}

initStudioAssistantAndIcons();
