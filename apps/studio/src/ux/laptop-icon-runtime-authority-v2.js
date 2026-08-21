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

  function isStudioMobileViewport() {
    return mobileQuery.matches;
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
    const maxCanvasHeight = Math.max(260, Math.min(viewportHeight * 0.58, 520) - frameChromeY);

    const intrinsicWidth = Math.max(1, Number(preview.width) || 1080);
    const intrinsicHeight = Math.max(1, Number(preview.height) || 1350);
    let scale = Math.min(maxCanvasWidth / intrinsicWidth, maxCanvasHeight / intrinsicHeight);
    const mode = typeof resolveStudioPreviewState === 'function' ? resolveStudioPreviewState() : 'ready';
    if (mode !== 'ready') scale *= 0.88;
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
    applyStudioMobileIcons();
    syncStudioMobileAssistantEmptyState();
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
      mobileMutationObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
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
    fit: fitStudioMobilePreview,
    refresh: refreshStudioMobileRuntime,
    isMobile: isStudioMobileViewport
  });
})();
