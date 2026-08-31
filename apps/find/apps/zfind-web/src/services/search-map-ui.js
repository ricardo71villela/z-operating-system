/* ============================================================
   Z FIND — SEARCH MAP UI V1
   Progressive enhancement for Search results.

   - source-backed publisher-authored coordinates only
   - no geocoding or inferred coordinates
   - OpenStreetMap tiles + Leaflet, loaded only when pins exist
   - viewport-synchronised compact list
   - organic Search remains authoritative and unchanged
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null, null, { autoInstall: false });
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.searchMapUi = factory(
      root.ZFindServices.search,
      root.ZFindServices.searchMapViewport,
      { autoInstall: true, root }
    );
  }
})(typeof window !== 'undefined' ? window : this, function (searchService, viewportService, options) {
  'use strict';

  const LEAFLET_VERSION = '1.9.4';
  const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
  const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
  const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ROOT_ID = 'zfind-search-map-v1';

  const COPY = Object.freeze({
    fr: { title:'Carte des résultats', visible:'biens visibles', open:'Voir le bien', unavailable:'Aucun résultat de cette page ne dispose de coordonnées publiées.', attribution:'Données cartographiques © OpenStreetMap contributors' },
    en: { title:'Results map', visible:'visible listings', open:'View listing', unavailable:'No result on this page has published coordinates.', attribution:'Map data © OpenStreetMap contributors' },
    pt: { title:'Mapa dos resultados', visible:'imóveis visíveis', open:'Ver imóvel', unavailable:'Nenhum resultado desta página tem coordenadas publicadas.', attribution:'Dados cartográficos © OpenStreetMap contributors' },
    es: { title:'Mapa de resultados', visible:'anuncios visibles', open:'Ver anuncio', unavailable:'Ningún resultado de esta página tiene coordenadas publicadas.', attribution:'Datos cartográficos © OpenStreetMap contributors' },
    de: { title:'Ergebniskarte', visible:'sichtbare Angebote', open:'Objekt ansehen', unavailable:'Kein Ergebnis auf dieser Seite hat veröffentlichte Koordinaten.', attribution:'Kartendaten © OpenStreetMap-Mitwirkende' },
    it: { title:'Mappa dei risultati', visible:'annunci visibili', open:'Vedi annuncio', unavailable:'Nessun risultato di questa pagina dispone di coordinate pubblicate.', attribution:'Dati cartografici © collaboratori OpenStreetMap' }
  });

  function normalizeLang(value) {
    return Object.prototype.hasOwnProperty.call(COPY, value) ? value : 'fr';
  }

  function targetForKind(kind) {
    if (kind === 'Development') return 'development';
    if (kind === 'Land') return 'land';
    return 'property';
  }

  function cardIndex(cards) {
    const index = new Map();
    (Array.isArray(cards) ? cards : []).forEach(card => {
      if (!card || card.assetId == null) return;
      index.set(String(card.assetId), card);
    });
    return index;
  }

  function currentPageIds(documentRef) {
    if (!documentRef) return [];
    return Array.from(documentRef.querySelectorAll('#search-grid [data-search-result-asset-id]'))
      .map(node => String(node.getAttribute('data-search-result-asset-id') || '').trim())
      .filter(Boolean);
  }

  function pinsForPage(allPins, cards, pageIds) {
    const ids = new Set(Array.isArray(pageIds) ? pageIds.map(String) : []);
    const cardsById = cardIndex(cards);
    return (Array.isArray(allPins) ? allPins : [])
      .filter(pin => pin && ids.has(String(pin.id)) && cardsById.has(String(pin.id)))
      .map(pin => Object.assign({}, pin, { card: cardsById.get(String(pin.id)) }));
  }

  function visiblePinsForBounds(pins, bounds, viewport) {
    if (!viewport || typeof viewport.filterPinsInBounds !== 'function') return [];
    return viewport.filterPinsInBounds(pins, bounds);
  }

  function listLabel(card) {
    if (!card) return '';
    return [card.title, card.locationLabel].filter(Boolean).join(' — ');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function installBrowser(rootRef, search, viewport) {
    if (!rootRef || !rootRef.document || !search || !viewport) return null;
    const documentRef = rootRef.document;
    let inventoryPinsPromise = null;
    let leafletPromise = null;
    let map = null;
    let markerLayer = null;
    let markerById = new Map();
    let activeAssetId = null;
    let renderToken = 0;

    function routeLang() {
      const full = rootRef.location.hash.replace(/^#\/?/, '');
      return normalizeLang(full.split('/').filter(Boolean)[0]);
    }

    function onSearchRoute() {
      const full = rootRef.location.hash.replace(/^#\/?/, '');
      return full.split('?')[0].split('/').filter(Boolean)[1] === 'search';
    }

    function pageCardsFromDom() {
      return Array.from(documentRef.querySelectorAll('#search-grid [data-search-result-asset-id]')).map(node => ({
        assetId: String(node.getAttribute('data-search-result-asset-id') || ''),
        kind: node.getAttribute('data-search-result-kind') || 'Property',
        title: (node.querySelector('.search-result-title') || {}).textContent || '',
        locationLabel: (node.querySelector('.loc') || {}).textContent || '',
        priceLabel: (node.querySelector('.price') || {}).textContent || ''
      })).filter(card => card.assetId);
    }

    function ensureInventoryPins() {
      if (inventoryPinsPromise) return inventoryPinsPromise;
      inventoryPinsPromise = search.listPublished().then(result => {
        if (!result || result.error) return [];
        return search.buildMapPins(result.data || []);
      }).catch(() => []);
      return inventoryPinsPromise;
    }

    function ensureLeaflet() {
      if (rootRef.L && rootRef.L.map) return Promise.resolve(rootRef.L);
      if (leafletPromise) return leafletPromise;
      leafletPromise = new Promise((resolve, reject) => {
        if (!documentRef.querySelector('link[data-zfind-leaflet]')) {
          const link = documentRef.createElement('link');
          link.rel = 'stylesheet';
          link.href = LEAFLET_CSS;
          link.dataset.zfindLeaflet = 'css';
          documentRef.head.appendChild(link);
        }
        const existing = documentRef.querySelector('script[data-zfind-leaflet]');
        if (existing) {
          existing.addEventListener('load', () => resolve(rootRef.L), { once:true });
          existing.addEventListener('error', reject, { once:true });
          return;
        }
        const script = documentRef.createElement('script');
        script.src = LEAFLET_JS;
        script.async = true;
        script.defer = true;
        script.dataset.zfindLeaflet = 'js';
        script.onload = () => rootRef.L ? resolve(rootRef.L) : reject(new Error('Leaflet unavailable after load.'));
        script.onerror = reject;
        documentRef.head.appendChild(script);
      });
      return leafletPromise;
    }

    function removeSurface() {
      if (map) {
        map.remove();
        map = null;
        markerLayer = null;
        markerById = new Map();
      }
      const existing = documentRef.getElementById(ROOT_ID);
      if (existing) existing.remove();
    }

    function mountSurface() {
      const grid = documentRef.getElementById('search-grid');
      if (!grid || !grid.parentNode) return null;
      let rootNode = documentRef.getElementById(ROOT_ID);
      if (rootNode) return rootNode;
      rootNode = documentRef.createElement('section');
      rootNode.id = ROOT_ID;
      rootNode.className = 'search-map-v1';
      rootNode.dataset.searchMapState = 'loading';
      rootNode.innerHTML = `
        <div class="search-map-v1-head">
          <div>
            <span class="eyebrow" data-map-copy="title"></span>
            <strong class="search-map-v1-count" aria-live="polite"></strong>
          </div>
          <button type="button" class="search-map-v1-fit" data-map-fit aria-label="Fit map to results">↗</button>
        </div>
        <div class="search-map-v1-layout">
          <div class="search-map-v1-canvas" data-map-canvas role="region"></div>
          <div class="search-map-v1-list" data-map-list></div>
        </div>
        <p class="search-map-v1-attribution" data-map-copy="attribution"></p>`;
      grid.parentNode.insertBefore(rootNode, grid);
      rootNode.querySelector('[data-map-fit]').addEventListener('click', fitAllPins);
      return rootNode;
    }

    function applyCopy(rootNode, lang) {
      const copy = COPY[lang];
      rootNode.querySelector('[data-map-copy="title"]').textContent = copy.title;
      rootNode.querySelector('[data-map-copy="attribution"]').textContent = copy.attribution;
    }

    function compactListHtml(pins, lang) {
      const copy = COPY[lang];
      if (!pins.length) return `<div class="search-map-v1-empty">${copy.unavailable}</div>`;
      return pins.map(pin => {
        const card = pin.card || {};
        const id = String(pin.id);
        return `<button type="button" class="search-map-v1-item${activeAssetId === id ? ' is-active' : ''}" data-map-asset-id="${id}">
          <span class="search-map-v1-item-title">${escapeHtml(listLabel(card))}</span>
          <span class="search-map-v1-item-price">${escapeHtml(card.priceLabel || '')}</span>
          <span class="search-map-v1-item-open">${copy.open}</span>
        </button>`;
      }).join('');
    }

    function navigateCard(card) {
      if (!card || typeof rootRef.navigateSearchOriginDetail !== 'function') return;
      rootRef.navigateSearchOriginDetail(targetForKind(card.kind), String(card.assetId));
    }

    function selectAsset(id, options) {
      activeAssetId = id == null ? null : String(id);
      const rootNode = documentRef.getElementById(ROOT_ID);
      if (rootNode) {
        rootNode.querySelectorAll('[data-map-asset-id]').forEach(node => {
          node.classList.toggle('is-active', node.getAttribute('data-map-asset-id') === activeAssetId);
        });
      }
      documentRef.querySelectorAll('#search-grid [data-search-result-asset-id]').forEach(node => {
        node.classList.toggle('map-selected', node.getAttribute('data-search-result-asset-id') === activeAssetId);
      });
      const marker = markerById.get(activeAssetId);
      if (marker && options && options.openPopup) marker.openPopup();
    }

    function currentMapBounds() {
      if (!map) return null;
      const b = map.getBounds();
      return { south:b.getSouth(), west:b.getWest(), north:b.getNorth(), east:b.getEast() };
    }

    function updateVisibleList(pagePins) {
      const rootNode = documentRef.getElementById(ROOT_ID);
      if (!rootNode) return;
      const lang = routeLang();
      const bounds = currentMapBounds();
      const visible = bounds ? visiblePinsForBounds(pagePins, bounds, viewport) : pagePins;
      rootNode.querySelector('.search-map-v1-count').textContent = `${visible.length} ${COPY[lang].visible}`;
      const list = rootNode.querySelector('[data-map-list]');
      list.innerHTML = compactListHtml(visible, lang);
      list.querySelectorAll('[data-map-asset-id]').forEach(button => {
        const id = button.getAttribute('data-map-asset-id');
        button.addEventListener('mouseenter', () => selectAsset(id, { openPopup:false }));
        button.addEventListener('focus', () => selectAsset(id, { openPopup:false }));
        button.addEventListener('click', () => {
          const pin = pagePins.find(row => String(row.id) === id);
          navigateCard(pin && pin.card);
        });
      });
    }

    let currentPins = [];

    function fitAllPins() {
      if (!map || !currentPins.length) return;
      const bounds = viewport.computeBoundsForPins(currentPins);
      if (!bounds) return;
      const east = bounds.west > bounds.east ? bounds.east + 360 : bounds.east;
      const leafletBounds = rootRef.L.latLngBounds(
        [bounds.south, bounds.west],
        [bounds.north, east]
      );
      map.fitBounds(leafletBounds.pad(0.18), { maxZoom:15 });
    }

    function renderMarkers(L, pagePins) {
      if (!map) return;
      if (markerLayer) markerLayer.remove();
      markerLayer = L.layerGroup().addTo(map);
      markerById = new Map();
      pagePins.forEach(pin => {
        const card = pin.card || {};
        const marker = L.marker([pin.latitude, pin.longitude], {
          title: listLabel(card)
        });
        marker.bindPopup(`<strong>${escapeHtml(card.title || '')}</strong><br>${escapeHtml(card.locationLabel || '')}<br><b>${escapeHtml(card.priceLabel || '')}</b>`);
        marker.on('click', () => selectAsset(String(pin.id), { openPopup:false }));
        marker.addTo(markerLayer);
        markerById.set(String(pin.id), marker);
      });
    }

    async function renderSurface() {
      const token = ++renderToken;
      if (!onSearchRoute()) {
        removeSurface();
        return;
      }
      const pageIds = currentPageIds(documentRef);
      if (!pageIds.length) {
        removeSurface();
        return;
      }
      const allPins = await ensureInventoryPins();
      if (token !== renderToken || !onSearchRoute()) return;
      const pagePins = pinsForPage(allPins, pageCardsFromDom(), pageIds);
      if (!pagePins.length) {
        removeSurface();
        return;
      }
      currentPins = pagePins;
      const rootNode = mountSurface();
      if (!rootNode) return;
      const lang = routeLang();
      applyCopy(rootNode, lang);
      rootNode.dataset.searchMapState = 'ready';
      const L = await ensureLeaflet();
      if (token !== renderToken || !documentRef.getElementById(ROOT_ID)) return;
      const canvas = rootNode.querySelector('[data-map-canvas]');
      if (!map) {
        map = L.map(canvas, { scrollWheelZoom:true, zoomControl:true, attributionControl:true });
        L.tileLayer(TILE_URL, {
          maxZoom:19,
          attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
        }).addTo(map);
        map.on('moveend zoomend', () => updateVisibleList(currentPins));
      }
      renderMarkers(L, pagePins);
      fitAllPins();
      updateVisibleList(pagePins);
      rootRef.setTimeout(() => map && map.invalidateSize(), 0);

      documentRef.querySelectorAll('#search-grid [data-search-result-asset-id]').forEach(row => {
        if (row.dataset.mapSyncBound === 'true') return;
        row.dataset.mapSyncBound = 'true';
        const id = row.getAttribute('data-search-result-asset-id');
        row.addEventListener('mouseenter', () => selectAsset(id, { openPopup:true }));
        row.addEventListener('focusin', () => selectAsset(id, { openPopup:true }));
      });
    }

    let renderQueued = false;
    function scheduleRender() {
      if (renderQueued) return;
      renderQueued = true;
      rootRef.queueMicrotask(() => {
        renderQueued = false;
        renderSurface().catch(error => console.error('Search Map UI failed:', error));
      });
    }

    const observer = new rootRef.MutationObserver(scheduleRender);
    observer.observe(documentRef.documentElement, { subtree:true, childList:true });
    rootRef.addEventListener('hashchange', scheduleRender);
    scheduleRender();

    return { scheduleRender, removeSurface, destroy:() => { observer.disconnect(); removeSurface(); } };
  }

  const api = Object.freeze({
    normalizeLang,
    targetForKind,
    cardIndex,
    currentPageIds,
    pinsForPage,
    visiblePinsForBounds,
    listLabel,
    escapeHtml,
    installBrowser
  });

  if (options && options.autoInstall && options.root) {
    installBrowser(options.root, searchService, viewportService);
  }

  return api;
});