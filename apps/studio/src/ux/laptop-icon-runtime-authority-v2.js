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
