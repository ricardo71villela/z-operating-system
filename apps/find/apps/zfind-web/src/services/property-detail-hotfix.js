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

/* ============================================================
   Z FIND — PROPERTY DETAIL MAP V1
   Optional, publisher-authored public location map.

   - no geocoding
   - no inferred coordinates
   - no API key / paid map SDK
   - absent or invalid coordinates => no map
   - OpenStreetMap is loaded lazily only when a public point exists
   ============================================================ */

(function () {
  'use strict';

  const ROOT_ID = 'property-root';
  const MAP_ID = 'zfind-property-map-v1';
  const PROPERTY_VIEW = 'property';
  const rowCache = new Map();
  const inFlight = new Map();
  let observer = null;
  let scheduled = false;

  const COPY = Object.freeze({
    fr: {
      title: 'Localisation',
      note: 'Le point affiché correspond à la localisation fournie pour la publication de l’annonce.',
      open: 'Ouvrir la carte',
      frame: 'Carte de localisation du bien'
    },
    en: {
      title: 'Location',
      note: 'The displayed point reflects the location supplied for public listing display.',
      open: 'Open map',
      frame: 'Property location map'
    },
    pt: {
      title: 'Localização',
      note: 'O ponto apresentado corresponde à localização fornecida para exibição pública do anúncio.',
      open: 'Abrir mapa',
      frame: 'Mapa de localização do imóvel'
    },
    es: {
      title: 'Ubicación',
      note: 'El punto mostrado corresponde a la ubicación facilitada para la publicación del anuncio.',
      open: 'Abrir mapa',
      frame: 'Mapa de ubicación del inmueble'
    },
    de: {
      title: 'Lage',
      note: 'Der angezeigte Punkt entspricht dem für die öffentliche Anzeige angegebenen Standort.',
      open: 'Karte öffnen',
      frame: 'Karte zur Lage der Immobilie'
    },
    it: {
      title: 'Posizione',
      note: 'Il punto mostrato corrisponde alla posizione fornita per la pubblicazione dell’annuncio.',
      open: 'Apri mappa',
      frame: 'Mappa della posizione dell’immobile'
    }
  });

  function parseRoute() {
    const full = window.location.hash.replace(/^#\/?/, '');
    const path = full.split('?')[0];
    const parts = path.split('/').filter(Boolean);
    return {
      lang: COPY[parts[0]] ? parts[0] : 'fr',
      view: parts[1] || 'home',
      id: parts[2] || null
    };
  }

  function coordinatePresent(value) {
    return value !== null
      && value !== undefined
      && String(value).trim() !== '';
  }

  function normalizeCoordinates(latitude, longitude) {
    if (!coordinatePresent(latitude) || !coordinatePresent(longitude)) {
      return null;
    }

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

    return { latitude: lat, longitude: lon };
  }

  function openStreetMapEmbedUrl(latitude, longitude) {
    const point = normalizeCoordinates(latitude, longitude);
    if (!point) return null;

    const latDelta = 0.006;
    const lonDelta = 0.009;
    const bbox = [
      point.longitude - lonDelta,
      point.latitude - latDelta,
      point.longitude + lonDelta,
      point.latitude + latDelta
    ].map(value => value.toFixed(6)).join(',');

    const marker = `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;

    return 'https://www.openstreetmap.org/export/embed.html'
      + '?bbox=' + encodeURIComponent(bbox)
      + '&layer=mapnik'
      + '&marker=' + encodeURIComponent(marker);
  }

  function openStreetMapPageUrl(latitude, longitude) {
    const point = normalizeCoordinates(latitude, longitude);
    if (!point) return null;

    const lat = point.latitude.toFixed(6);
    const lon = point.longitude.toFixed(6);

    return 'https://www.openstreetmap.org/'
      + '?mlat=' + encodeURIComponent(lat)
      + '&mlon=' + encodeURIComponent(lon)
      + '#map=16/' + encodeURIComponent(lat) + '/' + encodeURIComponent(lon);
  }

  function removeMap() {
    const existing = document.getElementById(MAP_ID);
    if (existing) existing.remove();
  }

  function renderMap(row, options) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;

    const point = normalizeCoordinates(
      row && row.latitude,
      row && row.longitude
    );

    if (!point) {
      removeMap();
      return false;
    }

    const facts = root.querySelector('.detail-layout > div:first-child .facts-grid');
    if (!facts) return false;

    removeMap();

    const lang = options && COPY[options.lang]
      ? options.lang
      : 'fr';
    const copy = COPY[lang];
    const embedUrl = openStreetMapEmbedUrl(point.latitude, point.longitude);
    const pageUrl = openStreetMapPageUrl(point.latitude, point.longitude);

    const section = document.createElement('section');
    section.id = MAP_ID;
    section.className = 'property-map-v1';
    section.setAttribute('aria-label', copy.title);

    const heading = document.createElement('div');
    heading.className = 'section-title property-map-v1-title';
    heading.textContent = copy.title;

    const frameWrap = document.createElement('div');
    frameWrap.className = 'property-map-v1-frame-wrap';

    const iframe = document.createElement('iframe');
    iframe.className = 'property-map-v1-frame';
    iframe.src = embedUrl;
    iframe.title = copy.frame;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer';
    iframe.setAttribute('allowfullscreen', '');

    frameWrap.appendChild(iframe);

    const footer = document.createElement('div');
    footer.className = 'property-map-v1-footer';

    const note = document.createElement('p');
    note.className = 'property-map-v1-note';
    note.textContent = copy.note;

    const link = document.createElement('a');
    link.className = 'property-map-v1-link';
    link.href = pageUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer nofollow';
    link.textContent = copy.open;

    footer.appendChild(note);
    footer.appendChild(link);
    section.appendChild(heading);
    section.appendChild(frameWrap);
    section.appendChild(footer);

    facts.insertAdjacentElement('afterend', section);
    return true;
  }

  async function loadRow(propertyId, lang) {
    if (rowCache.has(propertyId)) {
      return rowCache.get(propertyId);
    }

    if (inFlight.has(propertyId)) {
      return inFlight.get(propertyId);
    }

    const promise = (async () => {
      const services = window.ZFindServices;
      if (!services || !services.properties || typeof services.properties.getPropertyById !== 'function') {
        return null;
      }

      const result = await services.properties.getPropertyById(propertyId, lang);
      const row = result && !result.error ? result.data : null;
      rowCache.set(propertyId, row);
      return row;
    })().finally(() => {
      inFlight.delete(propertyId);
    });

    inFlight.set(propertyId, promise);
    return promise;
  }

  async function ensureMap() {
    const route = parseRoute();
    if (route.view !== PROPERTY_VIEW || !route.id) {
      removeMap();
      return false;
    }

    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    if (!root.querySelector('.detail-layout > div:first-child .facts-grid')) return false;
    if (document.getElementById(MAP_ID)) return true;

    const row = await loadRow(route.id, route.lang);

    const current = parseRoute();
    if (current.view !== PROPERTY_VIEW || current.id !== route.id) return false;

    return renderMap(row, { lang: current.lang });
  }

  function scheduleEnsure() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      ensureMap().catch(() => {
        // Map is progressive enhancement. Never break Property detail.
      });
    });
  }

  function install() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    if (!observer) {
      observer = new MutationObserver(scheduleEnsure);
      observer.observe(root, { childList: true, subtree: true });
    }

    window.addEventListener('hashchange', scheduleEnsure);
    scheduleEnsure();
  }

  window.ZFindServices = window.ZFindServices || {};
  window.ZFindServices.propertyMap = Object.freeze({
    normalizeCoordinates,
    openStreetMapEmbedUrl,
    openStreetMapPageUrl,
    renderMap,
    ensureMap
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
