// ZSTUDIO_LAPTOP_ICON_RUNTIME_AUTHORITY_V2
// Keeps the laptop SVG icon layer authoritative after every UI-language refresh.
// The existing icon renderer in layout-guards.js remains the single icon source;
// this module guarantees deterministic re-application after i18n/runtime updates.
//
// ZSTUDIO_LAPTOP_CENTER_BALANCE_RUNTIME_V1
// The no-photo canvas placeholder is also refined here because it is rendered
// inside the canvas, not by CSS. This keeps the approved post renderer intact
// while giving the laptop empty state a calmer, optically centred composition.

(function installStudioLaptopRuntimeAuthority() {
  if (typeof window === 'undefined') return;

  function refreshStudioLaptopIcons() {
    if (!window.matchMedia || !window.matchMedia('(min-width:981px)').matches) return;
    if (typeof applyStudioIconSystem === 'function') applyStudioIconSystem();
  }

  function installBalancedPlaceholderArt() {
    if (typeof drawPlaceholderArt !== 'function' || drawPlaceholderArt.__zstudioCenterBalanceV1) return;

    const balancedPlaceholder = function balancedStudioPlaceholderArt(ctx, W, H, P) {
      const t = I18N[state.lang] || I18N.pt;
      ctx.save();
      ctx.globalAlpha = 0.035;
      ctx.strokeStyle = P.gold;
      ctx.lineWidth = 1.15;
      const step = Math.max(30, Math.round(W / 20));
      for (let x = -H; x < W + H; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x + H, 0);
        ctx.stroke();
      }
      ctx.restore();

      const cx = W / 2;
      const cy = H * 0.37;
      const s = Math.max(46, Math.min(W, H) * 0.064);

      ctx.save();
      ctx.globalAlpha = 0.36;
      ctx.strokeStyle = P.gold;
      ctx.lineWidth = Math.max(1.8, Math.min(W, H) * 0.0018);
      ctx.strokeRect(cx - s, cy - s * 0.55, s * 2, s * 1.3);
      ctx.strokeRect(cx - s * 0.32, cy - s * 0.92, s * 0.64, s * 0.38);
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.1, s * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.1, s * 0.24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const firstLineY = cy + s * 1.72;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = P.gold;
      ctx.globalAlpha = 0.78;
      ctx.font = `400 ${Math.max(18, Math.round(W * 0.024))}px "DM Sans", sans-serif`;
      ctx.fillText(t.emptyHint1, cx, firstLineY);
      ctx.globalAlpha = 0.52;
      ctx.font = `300 ${Math.max(13, Math.round(W * 0.0155))}px "DM Sans", sans-serif`;
      ctx.fillText(t.emptyHint2, cx, firstLineY + Math.max(28, Math.round(W * 0.031)));
      ctx.restore();
    };

    balancedPlaceholder.__zstudioCenterBalanceV1 = true;
    drawPlaceholderArt = balancedPlaceholder;
  }

  function refreshStudioLaptopRuntime() {
    installBalancedPlaceholderArt();
    refreshStudioLaptopIcons();
  }

  if (typeof applyUIStrings === 'function' && !applyUIStrings.__zstudioIconRuntimeV2) {
    const baseApplyUIStrings = applyUIStrings;
    const wrappedApplyUIStrings = function wrappedStudioApplyUIStrings() {
      const result = baseApplyUIStrings.apply(this, arguments);
      queueMicrotask(refreshStudioLaptopRuntime);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(refreshStudioLaptopRuntime);
      return result;
    };
    wrappedApplyUIStrings.__zstudioIconRuntimeV2 = true;
    applyUIStrings = wrappedApplyUIStrings;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshStudioLaptopRuntime, { once: true });
  } else {
    refreshStudioLaptopRuntime();
  }

  window.addEventListener('load', refreshStudioLaptopRuntime, { once: true });

  // Cover late draft restoration / asynchronous runtime hydration without polling.
  queueMicrotask(refreshStudioLaptopRuntime);
  setTimeout(refreshStudioLaptopRuntime, 80);
  setTimeout(refreshStudioLaptopRuntime, 450);
})();

// ZSTUDIO_MOBILE_RUNTIME_AUTHORITY_V1
// Responsive counterpart to the laptop UX authority. It intentionally reuses
// the existing icon/assistant sources and preview state machine rather than
// creating parallel product logic. Mobile keeps natural document scrolling.
(function installStudioMobileRuntimeAuthority() {
  if (typeof window === 'undefined' || !window.matchMedia) return;

  const mobileQuery = window.matchMedia('(max-width:620px)');
  let mobileFitObserver = null;
  let mobileMutationObserver = null;
  let applyingMobileIcons = false;
  let syncingMobileFlow = false;

  const mobileFlowCopy = Object.freeze({
    pt: Object.freeze({
      uploadLabel: 'Adicione fotos ou vídeos do seu telemóvel',
      uploadTitle: 'Escolher fotos ou vídeos',
      uploadSub: 'Fototeca · Câmara · Ficheiros',
      details: 'Detalhes adicionais',
      previewAction: 'Adicionar foto ou vídeo'
    }),
    en: Object.freeze({
      uploadLabel: 'Add photos or videos from your phone',
      uploadTitle: 'Choose photos or videos',
      uploadSub: 'Photo Library · Camera · Files',
      details: 'Additional details',
      previewAction: 'Add photo or video'
    }),
    fr: Object.freeze({
      uploadLabel: 'Ajoutez des photos ou vidéos depuis votre téléphone',
      uploadTitle: 'Choisir des photos ou vidéos',
      uploadSub: 'Photothèque · Appareil photo · Fichiers',
      details: 'Détails supplémentaires',
      previewAction: 'Ajouter une photo ou vidéo'
    }),
    es: Object.freeze({
      uploadLabel: 'Añade fotos o vídeos desde tu teléfono',
      uploadTitle: 'Elegir fotos o vídeos',
      uploadSub: 'Fotos · Cámara · Archivos',
      details: 'Detalles adicionales',
      previewAction: 'Añadir foto o vídeo'
    }),
    de: Object.freeze({
      uploadLabel: 'Fotos oder Videos vom Smartphone hinzufügen',
      uploadTitle: 'Fotos oder Videos auswählen',
      uploadSub: 'Fotomediathek · Kamera · Dateien',
      details: 'Weitere Details',
      previewAction: 'Foto oder Video hinzufügen'
    }),
    it: Object.freeze({
      uploadLabel: 'Aggiungi foto o video dal telefono',
      uploadTitle: 'Scegli foto o video',
      uploadSub: 'Libreria foto · Fotocamera · File',
      details: 'Dettagli aggiuntivi',
      previewAction: 'Aggiungi foto o video'
    })
  });

  function isStudioMobileViewport() {
    return mobileQuery.matches;
  }

  function getMobileFlowCopy() {
    const lang = (typeof state === 'object' && state && state.lang) || 'en';
    return mobileFlowCopy[lang] || mobileFlowCopy.en;
  }

  function installMobileFlowStyles() {
    if (document.getElementById('zstudioMobileInformationFlowV2Styles')) return;
    const style = document.createElement('style');
    style.id = 'zstudioMobileInformationFlowV2Styles';
    style.textContent = `
      .zs-mobile-text-details-toggle{display:none}
      .zs-mobile-text-details{display:contents}
      @media (max-width:620px){
        header{min-height:60px;padding:10px 12px!important;gap:8px!important;flex-wrap:nowrap!important}
        header .brand{display:flex!important;align-items:center!important;gap:8px!important;min-width:104px;flex:0 0 auto}
        #headerLogo{width:25px!important;height:25px!important;flex:0 0 25px!important}
        header .brand .tag{display:block!important;border:0!important;padding:0!important;font-size:0!important;line-height:1!important;min-width:0!important}
        header .brand .tag::before{content:'Z Studio';display:block;font-family:'Cormorant Garamond',serif;font-style:normal;font-weight:600;font-size:1.12rem;line-height:1;letter-spacing:.012em;color:#f5f3ed;white-space:nowrap}
        header .brand .tag [data-i18n="headerTagline"]{display:none!important}
        .header-actions{margin-left:auto!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:5px!important;min-width:0!important;flex:1 1 auto!important}
        #btnHeaderBulk{width:36px!important;min-width:36px!important;height:36px!important;min-height:36px!important;padding:0!important;font-size:0!important;letter-spacing:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
        #btnHeaderBulk .zs-icon{width:14px!important;height:14px!important;flex-basis:14px!important;margin:0!important}
        #zstudioAuthButton{min-width:0!important;max-width:78px!important;height:36px!important;padding:7px 9px!important;font-size:.61rem!important;letter-spacing:.055em!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .lang-select{width:48px!important;min-width:48px!important;height:36px!important;padding:4px 3px 4px 6px!important}

        .layout{grid-template-columns:1fr!important}
        .controls{order:0!important;padding:18px 24px 26px!important;border-bottom:1px solid var(--border)!important}
        .stage{order:1!important}
        html[data-zstudio-preview-state="ready"] .stage{order:-1!important}
        html:not([data-zstudio-preview-state="ready"]) .stage .export-row,
        html:not([data-zstudio-preview-state="ready"]) .stage .caption-box{display:none!important}
        html:not([data-zstudio-preview-state="ready"]) .stage{padding-top:8px!important;padding-bottom:18px!important}
        html:not([data-zstudio-preview-state="ready"]) .canvas-frame{cursor:pointer}

        #brandStep{margin-bottom:18px!important}
        #mediaStep{margin-bottom:24px!important}
        #textStep{margin-bottom:10px!important}
        #btnFolderPicker,#btnFolderPicker + .hint{display:none!important}
        #mediaStep>label.f{font-size:.78rem!important;line-height:1.45!important;margin-bottom:8px!important}
        #mediaStep .dropzone{min-height:132px!important;padding:20px 16px!important}
        .zs-mobile-upload-title{font-size:.85rem;line-height:1.35;color:var(--text);margin-top:1px}
        .zs-mobile-upload-sub{font-size:.68rem;line-height:1.4;color:var(--text3);margin-top:5px}

        .zs-mobile-text-details-toggle{display:flex;width:100%;min-height:38px;margin-top:15px;padding:9px 11px;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,.004);border:1px solid var(--border);border-radius:4px;color:var(--text2);font-family:'DM Sans',sans-serif;font-size:.67rem;letter-spacing:.075em;text-transform:uppercase}
        .zs-mobile-text-details-toggle::after{content:'＋';font-size:.92rem;line-height:1;color:var(--text2)}
        .zs-mobile-text-details-toggle[aria-expanded="true"]::after{content:'−'}
        .zs-mobile-text-details{display:none}
        .zs-mobile-text-details.open{display:block}
        .zs-mobile-text-details>label.f:first-child{margin-top:13px!important}

        .zs-assistant-empty-state{padding:18px 16px 17px!important}
        .zs-assistant-empty-icon{width:36px!important;height:36px!important;margin-bottom:10px!important}
        .zs-assistant-empty-kicker{margin-bottom:6px!important}
        .zs-assistant-empty-title{font-size:1.18rem!important;max-width:235px!important}
        .zs-assistant-empty-body{margin-top:7px!important;line-height:1.48!important;max-width:270px!important}
        .zs-assistant-empty-actions{margin-top:13px!important;gap:6px!important}
        .zs-assistant-empty-actions .btn{min-height:35px!important}

        #brandStep .step-label.zs-iconized,#advancedOptions>.step-label.zs-iconized{justify-content:flex-start!important}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureMobileTextDetails() {
    const textStep = document.getElementById('textStep');
    const category = document.getElementById('fCategory');
    if (!textStep || !category) return null;

    let wrapper = document.getElementById('zsMobileTextDetails');
    let toggle = document.getElementById('zsMobileTextDetailsToggle');
    if (!wrapper) {
      const categoryLabel = textStep.querySelector('label[for="fCategory"]');
      if (!categoryLabel) return null;
      wrapper = document.createElement('div');
      wrapper.id = 'zsMobileTextDetails';
      wrapper.className = 'zs-mobile-text-details';
      textStep.insertBefore(wrapper, categoryLabel);

      const nodes = [];
      let node = categoryLabel;
      while (node) {
        const next = node.nextSibling;
        nodes.push(node);
        node = next;
      }
      nodes.forEach(item => wrapper.appendChild(item));
    }

    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = 'zsMobileTextDetailsToggle';
      toggle.className = 'zs-mobile-text-details-toggle';
      toggle.setAttribute('aria-controls', 'zsMobileTextDetails');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        const open = !wrapper.classList.contains('open');
        wrapper.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      textStep.insertBefore(toggle, wrapper);
    }

    toggle.textContent = getMobileFlowCopy().details;
    return { wrapper, toggle };
  }

  function renderMobileUploadCopy() {
    const uploadLabel = document.querySelector('#mediaStep > label.f');
    if (uploadLabel) uploadLabel.textContent = getMobileFlowCopy().uploadLabel;

    const dropzone = document.getElementById('dropZone');
    if (!dropzone) return;
    const icon = dropzone.querySelector(':scope > .zs-icon');
    Array.from(dropzone.childNodes).forEach(node => {
      if (node !== icon) node.remove();
    });
    let title = dropzone.querySelector(':scope > .zs-mobile-upload-title');
    if (!title) {
      title = document.createElement('div');
      title.className = 'zs-mobile-upload-title';
      dropzone.appendChild(title);
    }
    let sub = dropzone.querySelector(':scope > .zs-mobile-upload-sub');
    if (!sub) {
      sub = document.createElement('div');
      sub.className = 'zs-mobile-upload-sub';
      dropzone.appendChild(sub);
    }
    title.textContent = getMobileFlowCopy().uploadTitle;
    sub.textContent = getMobileFlowCopy().uploadSub;
    dropzone.setAttribute('aria-label', getMobileFlowCopy().uploadTitle);
  }

  function syncMobileHeaderIdentity() {
    const bulk = document.getElementById('btnHeaderBulk');
    if (bulk && !bulk.getAttribute('aria-label')) {
      bulk.setAttribute('aria-label', stripStudioIconPrefix(bulk.textContent) || 'Bulk generation');
    }
  }

  function syncMobilePreviewAction() {
    const frame = document.querySelector('.canvas-frame');
    const upload = document.getElementById('uploadInput');
    if (!frame || !upload) return;
    const ready = typeof resolveStudioPreviewState === 'function' && resolveStudioPreviewState() === 'ready';
    if (!ready) {
      frame.setAttribute('role', 'button');
      frame.setAttribute('tabindex', '0');
      frame.setAttribute('aria-label', getMobileFlowCopy().previewAction);
      frame.dataset.zsMobileEmptyAction = 'true';
      if (frame.dataset.zsMobileEmptyActionObserved !== 'true') {
        frame.dataset.zsMobileEmptyActionObserved = 'true';
        frame.addEventListener('click', () => {
          if (typeof resolveStudioPreviewState === 'function' && resolveStudioPreviewState() !== 'ready') upload.click();
        });
        frame.addEventListener('keydown', event => {
          if ((event.key === 'Enter' || event.key === ' ') && typeof resolveStudioPreviewState === 'function' && resolveStudioPreviewState() !== 'ready') {
            event.preventDefault();
            upload.click();
          }
        });
      }
    } else {
      frame.removeAttribute('role');
      frame.removeAttribute('tabindex');
      frame.removeAttribute('aria-label');
      delete frame.dataset.zsMobileEmptyAction;
    }
  }

  function syncStudioMobileInformationFlow() {
    if (!isStudioMobileViewport() || syncingMobileFlow) return;
    syncingMobileFlow = true;
    try {
      installMobileFlowStyles();
      ensureMobileTextDetails();
      renderMobileUploadCopy();
      syncMobileHeaderIdentity();
      syncMobilePreviewAction();
      document.documentElement.setAttribute('data-zstudio-mobile-flow', 'v2');
    } finally {
      syncingMobileFlow = false;
    }
  }

  function fitStudioMobilePreview() {
    if (!isStudioMobileViewport()) return false;
    const stage = document.querySelector('.stage');
    const frame = document.querySelector('.canvas-frame');
    const preview = document.getElementById('preview');
    if (!stage || !frame || !preview) return false;

    const stageStyle = getComputedStyle(stage);
    const frameStyle = getComputedStyle(frame);
    const stagePaddingX = (parseFloat(stageStyle.paddingLeft) || 0) + (parseFloat(stageStyle.paddingRight) || 0);
    const frameChromeX =
      (parseFloat(frameStyle.paddingLeft) || 0) +
      (parseFloat(frameStyle.paddingRight) || 0) +
      (parseFloat(frameStyle.borderLeftWidth) || 0) +
      (parseFloat(frameStyle.borderRightWidth) || 0);
    const frameChromeY =
      (parseFloat(frameStyle.paddingTop) || 0) +
      (parseFloat(frameStyle.paddingBottom) || 0) +
      (parseFloat(frameStyle.borderTopWidth) || 0) +
      (parseFloat(frameStyle.borderBottomWidth) || 0);

    const viewportWidth = Math.max(280, window.innerWidth || document.documentElement.clientWidth || 390);
    const viewportHeight = Math.max(520, window.innerHeight || document.documentElement.clientHeight || 844);
    const stageWidth = Math.max(280, stage.clientWidth || viewportWidth);
    const maxFrameWidth = Math.max(240, Math.min(stageWidth - stagePaddingX, viewportWidth - 24));
    const maxCanvasWidth = Math.max(220, maxFrameWidth - frameChromeX);
    const mode = typeof resolveStudioPreviewState === 'function' ? resolveStudioPreviewState() : 'ready';
    const heightBudget = mode === 'ready'
      ? Math.min(viewportHeight * 0.58, 520)
      : Math.min(viewportHeight * 0.36, 330);
    const maxCanvasHeight = Math.max(220, heightBudget - frameChromeY);

    const intrinsicWidth = Math.max(1, Number(preview.width) || 1080);
    const intrinsicHeight = Math.max(1, Number(preview.height) || 1350);
    let scale = Math.min(maxCanvasWidth / intrinsicWidth, maxCanvasHeight / intrinsicHeight);
    scale = Math.max(0.10, scale);

    const renderWidth = Math.max(150, Math.floor(intrinsicWidth * scale));
    const renderHeight = Math.max(150, Math.floor(intrinsicHeight * scale));

    preview.style.width = renderWidth + 'px';
    preview.style.height = renderHeight + 'px';
    preview.style.maxWidth = 'none';
    preview.style.maxHeight = 'none';
    frame.style.width = Math.min(maxFrameWidth, renderWidth + frameChromeX) + 'px';
    frame.style.height = (renderHeight + frameChromeY) + 'px';
    frame.style.maxWidth = '100%';
    frame.style.maxHeight = 'none';

    document.documentElement.setAttribute('data-zstudio-preview-fit', 'mobile-runtime-v1');
    return true;
  }

  if (typeof fitStudioPreviewToWorkspace === 'function' && !fitStudioPreviewToWorkspace.__zstudioMobileWrapped) {
    const baseFitStudioPreviewToWorkspace = fitStudioPreviewToWorkspace;
    const responsiveFit = function responsiveStudioPreviewFit() {
      if (isStudioMobileViewport()) return fitStudioMobilePreview();
      return baseFitStudioPreviewToWorkspace.apply(this, arguments);
    };
    responsiveFit.__zstudioMobileWrapped = true;
    fitStudioPreviewToWorkspace = responsiveFit;
  }

  function applyStudioMobileIcons() {
    if (!isStudioMobileViewport() || applyingMobileIcons) return;
    if (typeof decorateStudioIconTarget !== 'function' || typeof decorateStudioDropzone !== 'function') return;
    if (typeof ZSTUDIO_ICON_TARGETS === 'undefined') return;
    applyingMobileIcons = true;
    try {
      ZSTUDIO_ICON_TARGETS.forEach(([selector, icon]) => {
        document.querySelectorAll(selector).forEach(el => decorateStudioIconTarget(el, icon));
      });
      document.querySelectorAll('#brandStep .step-label, #advancedOptions > .step-label').forEach(el => decorateStudioIconTarget(el, 'settings'));
      decorateStudioDropzone();
    } finally {
      applyingMobileIcons = false;
    }
  }

  if (typeof applyStudioIconSystem === 'function' && !applyStudioIconSystem.__zstudioMobileWrapped) {
    const baseApplyStudioIconSystem = applyStudioIconSystem;
    const responsiveIconSystem = function responsiveStudioIconSystem() {
      const result = baseApplyStudioIconSystem.apply(this, arguments);
      applyStudioMobileIcons();
      return result;
    };
    responsiveIconSystem.__zstudioMobileWrapped = true;
    applyStudioIconSystem = responsiveIconSystem;
  }

  function syncStudioMobileAssistantEmptyState() {
    if (!isStudioMobileViewport() || typeof ensureStudioAssistantEmptyState !== 'function') return;
    const caption = document.getElementById('caption');
    const box = caption && caption.closest('.caption-box');
    const empty = ensureStudioAssistantEmptyState();
    if (!caption || !box || !empty) return;

    const authored = typeof zstudioAssistantAuthored !== 'undefined' && zstudioAssistantAuthored;
    const manual = typeof zstudioAssistantManualMode !== 'undefined' && zstudioAssistantManualMode;
    const showEmpty = !authored && !manual;
    box.classList.toggle('zs-assistant-empty-active', showEmpty);
    empty.setAttribute('aria-hidden', showEmpty ? 'false' : 'true');
    document.documentElement.setAttribute('data-zstudio-assistant-state', showEmpty ? 'empty' : 'editor');
  }

  if (typeof syncStudioAssistantEmptyState === 'function' && !syncStudioAssistantEmptyState.__zstudioMobileWrapped) {
    const baseSyncStudioAssistantEmptyState = syncStudioAssistantEmptyState;
    const responsiveAssistantSync = function responsiveStudioAssistantSync() {
      const result = baseSyncStudioAssistantEmptyState.apply(this, arguments);
      syncStudioMobileAssistantEmptyState();
      return result;
    };
    responsiveAssistantSync.__zstudioMobileWrapped = true;
    syncStudioAssistantEmptyState = responsiveAssistantSync;
  }

  function refreshStudioMobileRuntime() {
    if (!isStudioMobileViewport()) return;
    syncStudioMobileInformationFlow();
    applyStudioMobileIcons();
    renderMobileUploadCopy();
    syncStudioMobileAssistantEmptyState();
    syncMobilePreviewAction();
    if (typeof queueStudioPreviewFit === 'function') queueStudioPreviewFit();
    else fitStudioMobilePreview();
  }

  function startStudioMobileRuntime() {
    if (!isStudioMobileViewport()) return;

    if (typeof installStudioUxHooks === 'function') installStudioUxHooks();
    if (typeof ensureStudioAssistantEmptyState === 'function') ensureStudioAssistantEmptyState();
    if (typeof observeStudioCaptionAuthoring === 'function') observeStudioCaptionAuthoring();

    const langSwitch = document.getElementById('langSwitch');
    if (langSwitch && langSwitch.dataset.zsMobileUxObserved !== 'true') {
      langSwitch.dataset.zsMobileUxObserved = 'true';
      langSwitch.addEventListener('change', () => queueMicrotask(refreshStudioMobileRuntime));
    }

    const stage = document.querySelector('.stage');
    if (stage && typeof ResizeObserver === 'function' && !mobileFitObserver) {
      mobileFitObserver = new ResizeObserver(() => {
        if (typeof queueStudioPreviewFit === 'function') queueStudioPreviewFit();
      });
      mobileFitObserver.observe(stage);
    }

    if (document.body && typeof MutationObserver === 'function' && !mobileMutationObserver) {
      mobileMutationObserver = new MutationObserver(() => queueMicrotask(refreshStudioMobileRuntime));
      mobileMutationObserver.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-zstudio-preview-state'] });
    }

    refreshStudioMobileRuntime();
    requestAnimationFrame(refreshStudioMobileRuntime);
    setTimeout(refreshStudioMobileRuntime, 80);
    setTimeout(refreshStudioMobileRuntime, 450);
  }

  window.addEventListener('resize', refreshStudioMobileRuntime, { passive: true });
  window.addEventListener('orientationchange', refreshStudioMobileRuntime, { passive: true });
  mobileQuery.addEventListener?.('change', () => {
    if (isStudioMobileViewport()) startStudioMobileRuntime();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startStudioMobileRuntime, { once: true });
  } else {
    startStudioMobileRuntime();
  }
  window.addEventListener('load', startStudioMobileRuntime, { once: true });

  window.ZStudioMobileRuntime = Object.freeze({
    authority: 'ZSTUDIO_MOBILE_RUNTIME_AUTHORITY_V1',
    flowAuthority: 'ZSTUDIO_MOBILE_INFORMATION_FLOW_V2',
    fit: fitStudioMobilePreview,
    refresh: refreshStudioMobileRuntime,
    isMobile: isStudioMobileViewport
  });
})();
