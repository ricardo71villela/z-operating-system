/* ============================================================
   Z FIND — PROPERTY DETAIL HOTFIX V1
   Presentation-only normalization for the public Property hero.
   Removes nullish typology text and adjacent duplicate geography
   labels without changing canonical asset/geography data.
   ============================================================ */

(function () {
  'use strict';

  const ROOT_ID = 'property-root';
  const OBSERVER_FLAG = 'zfindPropertyDetailHotfixObserved';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function isNullishLabel(value) {
    const normalized = clean(value).toLowerCase();
    return !normalized || normalized === 'null' || normalized === 'undefined';
  }

  function dedupeAdjacentLocationLabels(value) {
    const parts = clean(value)
      .split(',')
      .map(clean)
      .filter(Boolean);

    const result = [];

    for (const part of parts) {
      const previous = result[result.length - 1];
      if (previous && previous.toLocaleLowerCase() === part.toLocaleLowerCase()) {
        continue;
      }
      result.push(part);
    }

    return result.join(', ');
  }

  function normalizePropertyEyebrow() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    const eyebrow = root.querySelector('.detail-hero .eyebrow');
    if (!eyebrow) return;

    const raw = clean(eyebrow.textContent);
    if (!raw) return;

    const separatorIndex = raw.indexOf('·');
    let next = raw;

    if (separatorIndex >= 0) {
      const typology = clean(raw.slice(0, separatorIndex));
      const location = dedupeAdjacentLocationLabels(
        raw.slice(separatorIndex + 1)
      );

      next = isNullishLabel(typology)
        ? location
        : [typology, location].filter(Boolean).join(' · ');
    } else {
      next = dedupeAdjacentLocationLabels(raw);
    }

    if (next && next !== raw) {
      eyebrow.textContent = next;
    }
  }

  function attach() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    normalizePropertyEyebrow();

    if (root.dataset[OBSERVER_FLAG] === 'true') return;

    const observer = new MutationObserver(() => {
      normalizePropertyEyebrow();
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });

    root.dataset[OBSERVER_FLAG] = 'true';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach, { once: true });
  } else {
    attach();
  }

  window.addEventListener('hashchange', () => {
    queueMicrotask(attach);
  });
})();
