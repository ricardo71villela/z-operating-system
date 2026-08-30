/* ============================================================
   Z FIND — SEARCH MAP PRESENTATION V1
   Runtime presentation over the validated provider-neutral #91–#94
   Search Map stack. MapLibre assets are same-origin and lazy-loaded;
   OpenFreeMap is contacted only after explicit Map activation.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.searchMapPresentation = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const MAPLIBRE_JS = '/vendor/maplibre-gl.js';
  const MAPLIBRE_CSS = '/vendor/maplibre-gl.css';
  const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  const MOBILE_QUERY = '(max-width: 1023px)';

  const COPY = Object.freeze({
    fr: Object.freeze({
      list: 'Liste', map: 'Carte', activate: 'Activer la carte',
      activateTitle: 'Carte des résultats',
      activateBody: 'La carte se charge uniquement lorsque vous choisissez de l’ouvrir.',
      searchArea: 'Rechercher dans cette zone',
      mapReady: '{{count}} bien(s) géolocalisé(s) sur la carte',
      areaReady: '{{count}} bien(s) dans cette zone',
      unavailableTitle: 'Carte momentanément indisponible',
      unavailableBody: 'La liste des résultats reste disponible.',
      noPinsTitle: 'Aucun résultat géolocalisé',
      noPinsBody: 'Ces résultats restent disponibles dans la liste.',
      open: 'Voir le bien', accessible: 'Résultats de la carte',
      coincident: 'Biens à la même position',
      hint: 'Liste et carte utilisent les mêmes résultats organiques.'
    }),
    en: Object.freeze({
      list: 'List', map: 'Map', activate: 'Activate map',
      activateTitle: 'Results map',
      activateBody: 'The map loads only when you choose to open it.',
      searchArea: 'Search this area', mapReady: '{{count}} mapped result(s)',
      areaReady: '{{count}} result(s) in this area',
      unavailableTitle: 'Map temporarily unavailable',
      unavailableBody: 'The results list remains available.',
      noPinsTitle: 'No geolocated results',
      noPinsBody: 'These results remain available in the list.',
      open: 'View property', accessible: 'Map results',
      coincident: 'Properties at the same position',
      hint: 'List and map use the same organic results.'
    }),
    pt: Object.freeze({
      list: 'Lista', map: 'Mapa', activate: 'Ativar mapa',
      activateTitle: 'Mapa dos resultados',
      activateBody: 'O mapa só é carregado quando escolhe abri-lo.',
      searchArea: 'Pesquisar nesta área', mapReady: '{{count}} resultado(s) no mapa',
      areaReady: '{{count}} resultado(s) nesta área',
      unavailableTitle: 'Mapa temporariamente indisponível',
      unavailableBody: 'A lista de resultados continua disponível.',
      noPinsTitle: 'Sem resultados geolocalizados',
      noPinsBody: 'Estes resultados continuam disponíveis na lista.',
      open: 'Ver imóvel', accessible: 'Resultados do mapa',
      coincident: 'Imóveis na mesma posição',
      hint: 'Lista e mapa usam os mesmos resultados orgânicos.'
    }),
    es: Object.freeze({
      list: 'Lista', map: 'Mapa', activate: 'Activar mapa',
      activateTitle: 'Mapa de resultados',
      activateBody: 'El mapa solo se carga cuando decide abrirlo.',
      searchArea: 'Buscar en esta zona', mapReady: '{{count}} resultado(s) en el mapa',
      areaReady: '{{count}} resultado(s) en esta zona',
      unavailableTitle: 'Mapa temporalmente no disponible',
      unavailableBody: 'La lista de resultados sigue disponible.',
      noPinsTitle: 'Sin resultados geolocalizados',
      noPinsBody: 'Estos resultados siguen disponibles en la lista.',
      open: 'Ver inmueble', accessible: 'Resultados del mapa',
      coincident: 'Inmuebles en la misma posición',
      hint: 'Lista y mapa usan los mismos resultados orgánicos.'
    }),
    de: Object.freeze({
      list: 'Liste', map: 'Karte', activate: 'Karte aktivieren',
      activateTitle: 'Ergebniskarte',
      activateBody: 'Die Karte wird erst geladen, wenn Sie sie öffnen.',
      searchArea: 'In diesem Gebiet suchen', mapReady: '{{count}} Ergebnis(se) auf der Karte',
      areaReady: '{{count}} Ergebnis(se) in diesem Gebiet',
      unavailableTitle: 'Karte vorübergehend nicht verfügbar',
      unavailableBody: 'Die Ergebnisliste bleibt verfügbar.',
      noPinsTitle: 'Keine geolokalisierten Ergebnisse',
      noPinsBody: 'Diese Ergebnisse bleiben in der Liste verfügbar.',
      open: 'Immobilie ansehen', accessible: 'Kartenergebnisse',
      coincident: 'Immobilien an derselben Position',
      hint: 'Liste und Karte verwenden dieselben organischen Ergebnisse.'
    }),
    it: Object.freeze({
      list: 'Lista', map: 'Mappa', activate: 'Attiva mappa',
      activateTitle: 'Mappa dei risultati',
      activateBody: 'La mappa viene caricata solo quando scegli di aprirla.',
      searchArea: 'Cerca in quest’area', mapReady: '{{count}} risultato/i sulla mappa',
      areaReady: '{{count}} risultato/i in quest’area',
      unavailableTitle: 'Mappa temporaneamente non disponibile',
      unavailableBody: 'L’elenco dei risultati resta disponibile.',
      noPinsTitle: 'Nessun risultato geolocalizzato',
      noPinsBody: 'Questi risultati restano disponibili nell’elenco.',
      open: 'Vedi immobile', accessible: 'Risultati della mappa',
      coincident: 'Immobili nella stessa posizione',
      hint: 'Elenco e mappa usano gli stessi risultati organici.'
    })
  });

  let map = null;
  let mapReady = false;
  let active = false;
  let failed = false;
  let shell = null;
  let cards = [];
  let allPins = [];
  let currentPins = [];
  let cardById = new Map();
  let maplibrePromise = null;
  let syncTimer = null;
  let userViewportDirty = false;
  let resizeListenerInstalled = false;

  function lang() {
    const value = document.documentElement.lang || 'fr';
    return COPY[value] ? value : 'en';
  }

  function copy() { return COPY[lang()]; }

  function interpolate(text, vars) {
    return Object.keys(vars || {}).reduce(
      (value, key) => value.replace(new RegExp('{{' + key + '}}', 'g'), String(vars[key])),
      text
    );
  }

  function isMobile() {
    return Boolean(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
  }

  function cacheCards() {
    try {
      if (
        typeof searchResultsCache !== 'undefined' &&
        searchResultsCache && searchResultsCache.result &&
        Array.isArray(searchResultsCache.result.cards)
      ) {
        return searchResultsCache.result.cards.slice();
      }
    } catch (_) {}
    return [];
  }

  function currentViewIsSearch() {
    try {
      return typeof state !== 'undefined' && state.view === 'search';
    } catch (_) {
      return Boolean(document.getElementById('view-search')?.classList.contains('active'));
    }
  }

  function setStatus(text) {
    if (!shell) return;
    const el = shell.querySelector('[data-zf-map-status]');
    if (el) el.innerHTML = text ? '<span>' + text + '</span>' : '';
  }

  function setToggle(mode) {
    if (!shell) return;
    shell.layout.dataset.zfMapMode = mode;
    shell.listButton.setAttribute('aria-pressed', mode === 'list' ? 'true' : 'false');
    shell.mapButton.setAttribute('aria-pressed', mode === 'map' ? 'true' : 'false');
  }

  function showPlaceholder(kind) {
    if (!shell) return;
    const c = copy();
    shell.canvas.hidden = true;
    shell.placeholder.hidden = false;
    shell.fallback.hidden = true;

    if (kind === 'no-pins') {
      shell.placeholder.innerHTML = '<div class="zf-map-placeholder-card"><strong>' +
        c.noPinsTitle + '</strong><p>' + c.noPinsBody + '</p></div>';
      return;
    }

    shell.placeholder.innerHTML = '<div class="zf-map-placeholder-card"><strong>' +
      c.activateTitle + '</strong><p>' + c.activateBody +
      '</p><button type="button" class="zf-map-activate" data-zf-map-activate>' +
      c.activate + '</button></div>';

    shell.placeholder.querySelector('[data-zf-map-activate]')
      ?.addEventListener('click', activateMap, { once: true });
  }

  function showFailure() {
    if (!shell) return;
    failed = true;
    const c = copy();
    destroyMap();
    shell.fallback.hidden = false;
    shell.placeholder.hidden = true;
    shell.canvas.hidden = true;
    shell.fallback.innerHTML = '<div><strong>' + c.unavailableTitle +
      '</strong><p>' + c.unavailableBody + '</p></div>';
    if (isMobile()) setMode('list');
  }

  function decorateResultCards() {
    const rows = document.querySelectorAll('#search-grid .search-result-row');
    rows.forEach(row => {
      if (!row.hasAttribute('tabindex')) row.tabIndex = 0;
      if (!row.hasAttribute('role')) row.setAttribute('role', 'button');
      if (row.dataset.zfMapKeyboard === 'ready') return;
      row.dataset.zfMapKeyboard = 'ready';
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          row.click();
        }
      });
      row.addEventListener('focus', () => {
        const id = row.dataset.searchResultAssetId;
        if (id) highlightFeature(id);
      });
    });
  }

  function accessibleList() {
    if (!shell) return;
    const c = copy();
    const source = cards;
    shell.srList.setAttribute('aria-label', c.accessible);
    shell.srList.innerHTML = source.map(card => {
      const id = String(card.assetId || '');
      const title = card.title || card.locationLabel || id;
      return '<li><button type="button" data-zf-map-a11y-id="' + escapeAttr(id) + '">' +
        escapeHtml(title) + '</button></li>';
    }).join('');

    shell.srList.querySelectorAll('[data-zf-map-a11y-id]').forEach(button => {
      button.addEventListener('click', () => selectListing(button.dataset.zfMapA11yId, true));
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escapeAttr(value) { return escapeHtml(value); }

  function buildShell() {
    if (!currentViewIsSearch()) return null;
    const layout = document.querySelector('#view-search .search-results-layout');
    if (!layout) return null;

    const current = document.getElementById('zf-search-map-panel');
    if (current && shell) return shell;

    const c = copy();
    layout.classList.add('zf-search-map-enabled');
    layout.dataset.zfMapMode = 'list';

    let toolbar = document.getElementById('zf-search-map-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'zf-search-map-toolbar';
      toolbar.className = 'zf-search-map-toolbar';
      toolbar.innerHTML = '<div class="zf-search-map-toggle" role="group" aria-label="' +
        escapeAttr(c.accessible) + '"><button type="button" data-zf-mode="list" aria-pressed="true">' +
        c.list + '</button><button type="button" data-zf-mode="map" aria-pressed="false">' + c.map +
        '</button></div><p class="zf-search-map-caption">' + c.hint + '</p>';
      layout.parentNode.insertBefore(toolbar, layout);
    }

    const panel = document.createElement('section');
    panel.id = 'zf-search-map-panel';
    panel.className = 'zf-search-map-panel';
    panel.setAttribute('aria-label', c.activateTitle);
    panel.innerHTML =
      '<div class="zf-search-map-placeholder" data-zf-map-placeholder></div>' +
      '<div id="zf-search-map-canvas" class="zf-search-map-canvas" data-zf-map-canvas hidden></div>' +
      '<button type="button" class="zf-map-search-area" data-zf-search-area hidden>' + c.searchArea + '</button>' +
      '<div class="zf-map-preview" data-zf-map-preview hidden></div>' +
      '<div class="zf-map-coincident" data-zf-map-coincident hidden></div>' +
      '<div class="zf-map-fallback" data-zf-map-fallback hidden></div>' +
      '<div class="zf-map-status" data-zf-map-status aria-live="polite"></div>' +
      '<ul class="zf-map-sr-list" data-zf-map-sr-list></ul>';

    const aside = layout.querySelector('.search-results-aside');
    layout.insertBefore(panel, aside || null);

    shell = {
      layout,
      toolbar,
      panel,
      canvas: panel.querySelector('[data-zf-map-canvas]'),
      placeholder: panel.querySelector('[data-zf-map-placeholder]'),
      fallback: panel.querySelector('[data-zf-map-fallback]'),
      searchArea: panel.querySelector('[data-zf-search-area]'),
      preview: panel.querySelector('[data-zf-map-preview]'),
      coincident: panel.querySelector('[data-zf-map-coincident]'),
      srList: panel.querySelector('[data-zf-map-sr-list]'),
      listButton: toolbar.querySelector('[data-zf-mode="list"]'),
      mapButton: toolbar.querySelector('[data-zf-mode="map"]')
    };

    shell.listButton.addEventListener('click', () => setMode('list'));
    shell.mapButton.addEventListener('click', () => setMode('map'));
    shell.searchArea.addEventListener('click', commitSearchArea);

    showPlaceholder('activate');
    decorateResultCards();
    cards = cacheCards();
    cardById = new Map(cards.map(card => [String(card.assetId), card]));
    accessibleList();

    if (!resizeListenerInstalled) {
      window.addEventListener('resize', onResize, { passive: true });
      resizeListenerInstalled = true;
    }

    return shell;
  }

  function removeShell() {
    destroyMap();
    const toolbar = document.getElementById('zf-search-map-toolbar');
    const panel = document.getElementById('zf-search-map-panel');
    if (toolbar) toolbar.remove();
    if (panel) panel.remove();
    document.querySelector('#view-search .search-results-layout')?.classList.remove('zf-search-map-enabled');
    shell = null;
    cards = [];
    cardById = new Map();
    allPins = [];
    currentPins = [];
    failed = false;
    active = false;
  }

  function onResize() {
    if (!shell) return;
    if (isMobile() && shell.layout.dataset.zfMapMode !== 'map' && map) {
      destroyMap();
    }
    if (!isMobile() && map) setTimeout(() => map && map.resize(), 0);
  }

  function setMode(mode) {
    if (!shell) buildShell();
    if (!shell) return;
    const next = mode === 'map' ? 'map' : 'list';
    setToggle(next);

    if (next === 'list') {
      // Mandatory mobile/list lifecycle: release WebGL immediately.
      if (map) destroyMap();
      return;
    }

    if (!active || !map) activateMap();
    else setTimeout(() => map && map.resize(), 0);
  }

  function loadSameOriginMapLibre() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (maplibrePromise) return maplibrePromise;

    maplibrePromise = new Promise((resolve, reject) => {
      let css = document.querySelector('link[data-zf-maplibre-css]');
      if (!css) {
        css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = MAPLIBRE_CSS;
        css.dataset.zfMaplibreCss = 'true';
        document.head.appendChild(css);
      }

      let script = document.querySelector('script[data-zf-maplibre-js]');
      if (script) {
        if (window.maplibregl) resolve(window.maplibregl);
        else script.addEventListener('load', () => resolve(window.maplibregl), { once: true });
        script.addEventListener('error', reject, { once: true });
        return;
      }

      script = document.createElement('script');
      script.src = MAPLIBRE_JS;
      script.async = true;
      script.dataset.zfMaplibreJs = 'true';
      script.onload = () => window.maplibregl ? resolve(window.maplibregl) : reject(new Error('MapLibre global unavailable'));
      script.onerror = () => reject(new Error('MapLibre same-origin asset failed to load'));
      document.head.appendChild(script);
    });

    return maplibrePromise;
  }

  async function loadOrganicPins() {
    cards = cacheCards();
    cardById = new Map(cards.map(card => [String(card.assetId), card]));
    accessibleList();

    const ids = new Set(cards
      .filter(card => card && card.kind !== 'Development' && card.assetId != null)
      .map(card => String(card.assetId)));

    const services = window.ZFindServices || {};
    if (!services.search || typeof services.search.listPublished !== 'function') return [];

    const result = await services.search.listPublished();
    if (result.error && result.error.type !== 'empty_result') throw result.error;

    const rows = (result.data || []).filter(row => ids.has(String(row.id)));
    const pins = typeof services.search.buildMapPins === 'function'
      ? services.search.buildMapPins(rows)
      : [];

    return pins.map(pin => {
      const card = cardById.get(String(pin.id)) || {};
      return Object.assign({}, pin, {
        title: card.title || '',
        locationLabel: card.locationLabel || '',
        priceLabel: card.priceLabel || ''
      });
    });
  }

  function featuresForPins(pins) {
    return {
      type: 'FeatureCollection',
      features: (pins || []).map(pin => ({
        type: 'Feature',
        id: String(pin.id),
        properties: { id: String(pin.id) },
        geometry: {
          type: 'Point',
          coordinates: [Number(pin.longitude), Number(pin.latitude)]
        }
      }))
    };
  }

  function boundsObject() {
    if (!map) return null;
    const b = map.getBounds();
    return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  }

  async function activateMap() {
    buildShell();
    if (!shell || failed || map) return;
    active = true;
    if (isMobile()) setToggle('map');

    try {
      allPins = await loadOrganicPins();
      currentPins = allPins.slice();
      if (!allPins.length) {
        showPlaceholder('no-pins');
        return;
      }

      const maplibregl = await loadSameOriginMapLibre();
      if (!currentViewIsSearch() || !shell) return;

      shell.placeholder.hidden = true;
      shell.fallback.hidden = true;
      shell.canvas.hidden = false;
      mapReady = false;
      userViewportDirty = false;

      map = new maplibregl.Map({
        container: shell.canvas,
        style: OPENFREEMAP_STYLE,
        center: [0, 20],
        zoom: 1.2,
        attributionControl: true,
        cooperativeGestures: true,
        maplibreLogo: true
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      map.once('load', () => {
        if (!map || !shell) return;
        mapReady = true;
        map.addSource('zf-organic-results', {
          type: 'geojson',
          data: featuresForPins(currentPins),
          cluster: true,
          clusterRadius: 48,
          clusterMaxZoom: 17,
          promoteId: 'id'
        });

        map.addLayer({
          id: 'zf-clusters', type: 'circle', source: 'zf-organic-results',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#171717',
            'circle-radius': ['step', ['get', 'point_count'], 20, 10, 24, 30, 30],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });
        map.addLayer({
          id: 'zf-cluster-count', type: 'symbol', source: 'zf-organic-results',
          filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
          paint: { 'text-color': '#ffffff' }
        });
        map.addLayer({
          id: 'zf-pins', type: 'circle', source: 'zf-organic-results',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': '#b8935a', 'circle-radius': 9,
            'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff'
          }
        });

        map.on('click', 'zf-pins', onPinClick);
        map.on('click', 'zf-clusters', onClusterClick);
        map.on('mouseenter', 'zf-pins', () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'zf-pins', () => { if (map) map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', 'zf-clusters', () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'zf-clusters', () => { if (map) map.getCanvas().style.cursor = ''; });

        ['dragstart', 'rotatestart', 'pitchstart'].forEach(name => map.on(name, () => { userViewportDirty = true; }));
        map.on('zoomstart', event => { if (event && event.originalEvent) userViewportDirty = true; });
        map.on('moveend', () => {
          if (!shell) return;
          shell.searchArea.hidden = !userViewportDirty;
        });

        fitAllPins();
        setStatus(interpolate(copy().mapReady, { count: allPins.length }));
      });

      map.on('error', event => {
        if (!mapReady) {
          console.error('Z Find Search Map provider failed before ready:', event && event.error ? event.error : event);
          showFailure();
        }
      });
    } catch (error) {
      console.error('Z Find Search Map activation failed:', error);
      showFailure();
    }
  }

  function fitAllPins() {
    if (!map || !allPins.length) return;
    const viewport = window.ZFindServices && window.ZFindServices.searchMapViewport;
    const bounds = viewport && viewport.computeBoundsForPins(allPins);
    if (!bounds) return;

    if (allPins.length === 1) {
      map.easeTo({ center: [allPins[0].longitude, allPins[0].latitude], zoom: 13, duration: 0 });
      return;
    }

    const sw = [bounds.west, bounds.south];
    const ne = [bounds.east, bounds.north];
    map.fitBounds([sw, ne], { padding: 54, maxZoom: 14, duration: 0 });
  }

  function onPinClick(event) {
    const feature = event && event.features && event.features[0];
    if (!feature) return;
    const id = String(feature.properties && feature.properties.id || feature.id || '');
    selectListing(id, false);
  }

  async function onClusterClick(event) {
    if (!map) return;
    const feature = event && event.features && event.features[0];
    if (!feature) return;
    const source = map.getSource('zf-organic-results');
    const clusterId = feature.properties && feature.properties.cluster_id;
    if (clusterId == null || !source) return;

    try {
      const leaves = await source.getClusterLeaves(clusterId, 100, 0);
      const coordinates = (leaves || []).map(row => row.geometry && row.geometry.coordinates).filter(Boolean);
      const coincident = coordinates.length > 1 && coordinates.every(
        point => point[0] === coordinates[0][0] && point[1] === coordinates[0][1]
      );

      if (coincident) {
        showCoincident(leaves.map(row => String(row.properties && row.properties.id || row.id || '')).filter(Boolean));
        return;
      }

      const zoom = await source.getClusterExpansionZoom(clusterId);
      map.easeTo({ center: feature.geometry.coordinates, zoom: Math.min(Number(zoom) || map.getZoom() + 2, 18) });
    } catch (error) {
      console.warn('Z Find cluster expansion failed:', error);
    }
  }

  function showCoincident(ids) {
    if (!shell) return;
    const c = copy();
    const unique = Array.from(new Set(ids));
    shell.coincident.hidden = false;
    shell.coincident.innerHTML = '<strong>' + c.coincident + '</strong><ul>' + unique.map(id => {
      const card = cardById.get(id) || {};
      return '<li><button type="button" data-zf-coincident-id="' + escapeAttr(id) + '">' +
        escapeHtml(card.title || card.locationLabel || id) + '</button></li>';
    }).join('') + '</ul>';
    shell.coincident.querySelectorAll('[data-zf-coincident-id]').forEach(button => {
      button.addEventListener('click', () => {
        shell.coincident.hidden = true;
        selectListing(button.dataset.zfCoincidentId, true);
      });
    });
  }

  function selectListing(id, fromKeyboard) {
    if (!id || !shell) return;
    const pin = allPins.find(row => String(row.id) === String(id));
    const card = cardById.get(String(id));
    if (!card) return;

    shell.preview.hidden = false;
    shell.coincident.hidden = true;
    shell.preview.innerHTML = '<strong>' + escapeHtml(card.title || '') + '</strong><p>' +
      escapeHtml([card.priceLabel, card.locationLabel].filter(Boolean).join(' · ')) +
      '</p><button type="button" class="zf-map-preview-action" data-zf-map-open>' + copy().open + '</button>';

    shell.preview.querySelector('[data-zf-map-open]')?.addEventListener('click', () => openCard(card));

    if (map && pin) {
      map.easeTo({ center: [pin.longitude, pin.latitude], zoom: Math.max(map.getZoom(), 14) });
    }

    if (fromKeyboard) shell.preview.querySelector('[data-zf-map-open]')?.focus();
  }

  function openCard(card) {
    if (!card || !card.assetId) return;
    const target = card.kind === 'Development' ? 'development' : (card.kind === 'Land' ? 'land' : 'property');
    if (typeof navigateSearchOriginDetail === 'function') navigateSearchOriginDetail(target, String(card.assetId));
  }

  function highlightFeature(id) {
    if (!mapReady || !map || !id) return;
    // Selection remains click/keyboard driven; focus only offers a visual hint.
    try {
      map.setPaintProperty('zf-pins', 'circle-radius', [
        'case', ['==', ['get', 'id'], String(id)], 12, 9
      ]);
    } catch (_) {}
  }

  function commitSearchArea() {
    if (!map || !mapReady || !shell || !userViewportDirty) return;
    const viewport = window.ZFindServices && window.ZFindServices.searchMapViewport;
    const bounds = boundsObject();
    if (!viewport || !bounds) return;

    currentPins = viewport.filterPinsInBounds(allPins, bounds);
    const source = map.getSource('zf-organic-results');
    if (source) source.setData(featuresForPins(currentPins));
    userViewportDirty = false;
    shell.searchArea.hidden = true;
    shell.preview.hidden = true;
    shell.coincident.hidden = true;
    setStatus(interpolate(copy().areaReady, { count: currentPins.length }));
  }

  function destroyMap() {
    mapReady = false;
    userViewportDirty = false;
    if (shell) {
      shell.searchArea.hidden = true;
      shell.preview.hidden = true;
      shell.coincident.hidden = true;
    }
    if (map) {
      try { map.remove(); } catch (_) {}
      map = null;
    }
    if (shell && !failed) showPlaceholder('activate');
  }

  function sync() {
    if (!currentViewIsSearch()) {
      if (shell) removeShell();
      return;
    }

    buildShell();
    if (!shell) return;
    decorateResultCards();
    const nextCards = cacheCards();
    const signature = nextCards.map(card => String(card.assetId)).join('|');
    const currentSignature = cards.map(card => String(card.assetId)).join('|');
    if (signature !== currentSignature) {
      cards = nextCards;
      cardById = new Map(cards.map(card => [String(card.assetId), card]));
      accessibleList();
      if (map) destroyMap();
    }
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 0);
  }

  function start() {
    if (typeof document === 'undefined') return;
    document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
    window.addEventListener('hashchange', () => setTimeout(scheduleSync, 0));

    const observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => {
        const target = mutation.target;
        return target && target.nodeType === 1 && (
          target.id === 'search-grid' ||
          target.closest && target.closest('#view-search')
        );
      })) scheduleSync();
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState !== 'loading') scheduleSync();
  }

  return Object.freeze({
    MAPLIBRE_JS,
    MAPLIBRE_CSS,
    OPENFREEMAP_STYLE,
    start,
    sync,
    setMode,
    activateMap,
    destroyMap,
    commitSearchArea
  });
});
