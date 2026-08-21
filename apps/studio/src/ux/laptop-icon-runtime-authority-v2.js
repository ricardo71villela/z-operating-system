// ZSTUDIO_LAPTOP_ICON_RUNTIME_AUTHORITY_V2
// Keeps the laptop SVG icon layer authoritative after every UI-language refresh.
// The existing icon renderer in layout-guards.js remains the single icon source;
// this module only guarantees deterministic re-application after i18n/runtime updates.

(function installStudioLaptopIconRuntimeAuthority() {
  if (typeof window === 'undefined') return;

  function refreshStudioLaptopIcons() {
    if (!window.matchMedia || !window.matchMedia('(min-width:981px)').matches) return;
    if (typeof applyStudioIconSystem === 'function') applyStudioIconSystem();
  }

  if (typeof applyUIStrings === 'function' && !applyUIStrings.__zstudioIconRuntimeV2) {
    const baseApplyUIStrings = applyUIStrings;
    const wrappedApplyUIStrings = function wrappedStudioApplyUIStrings() {
      const result = baseApplyUIStrings.apply(this, arguments);
      queueMicrotask(refreshStudioLaptopIcons);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(refreshStudioLaptopIcons);
      return result;
    };
    wrappedApplyUIStrings.__zstudioIconRuntimeV2 = true;
    applyUIStrings = wrappedApplyUIStrings;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshStudioLaptopIcons, { once: true });
  } else {
    refreshStudioLaptopIcons();
  }

  window.addEventListener('load', refreshStudioLaptopIcons, { once: true });

  // Cover late draft restoration / asynchronous runtime hydration without polling.
  queueMicrotask(refreshStudioLaptopIcons);
  setTimeout(refreshStudioLaptopIcons, 80);
  setTimeout(refreshStudioLaptopIcons, 450);
})();
