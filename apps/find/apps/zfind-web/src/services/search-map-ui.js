/* ============================================================
   Z FIND — SEARCH MAP (V2: « Carte » view of the search)

   The visitor switches the results between « Liste » and « Carte ».
   In « Carte »:
   - every result of the search is on the map, not only one page;
   - a listing with a published position is shown where it is; a listing
     without one is shown at the centre of its commune (zones_lite
     latitude / longitude, migration 20261008120000) with a dashed pin and
     « position approximative » — no geocoding, nothing invented: a
     listing whose commune has no known centre is simply not on the map;
   - pins carry the price; nearby pins merge into a cluster with a count
     (search-map-clustering.js), a click on a cluster zooms in;
   - the list beside the map shows the results inside the visible area and
     follows every move or zoom (search-map-viewport.js).
   Leaflet is self-hosted (/vendor), OpenStreetMap tiles.
   The map only renders when the app asks for it (showMap / hideMap):
   no DOM observer, so it can never redraw itself in a loop.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./search-map-clustering'), require('./search-map-viewport'), null);
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.searchMapUi = factory(
      root.ZFindServices.searchMapClustering,
      root.ZFindServices.searchMapViewport,
      root.ZFindServices.supabaseClient,
      root
    );
  }
})(typeof window !== 'undefined' ? window : this, function (clustering, viewport, supabaseClientModule, rootRef) {
  'use strict';

  const LEAFLET_VERSION = '1.9.4';
  // Served by zfind.online itself (public/vendor), never by a third-party CDN.
  const LEAFLET_JS = `/vendor/leaflet-${LEAFLET_VERSION}/leaflet.js`;
  const LEAFLET_CSS = `/vendor/leaflet-${LEAFLET_VERSION}/leaflet.css`;
  const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ROOT_ID = 'zfind-search-map';
  const CELL_PX = 70;
  const LIST_MAX = 60;

  const COPY = Object.freeze({
    fr: { list:'Liste', map:'Carte', viewLabel:'Affichage des résultats', inZone:'biens dans cette zone', inZoneOne:'bien dans cette zone', fit:'Voir tous les résultats', open:'Voir le bien', none:'Aucun bien dans cette zone : dézoomez ou déplacez la carte.', more:'Zoomez pour voir les {n} autres biens de la zone.', approx:'Position approximative (centre de la commune)', approxNote:'Les biens en pointillés sont placés au centre de leur commune : l’adresse exacte est donnée par l’agence.', noPoint:'{n} résultat(s) sans localisation ne figurent pas sur la carte.', empty:'Aucun résultat à afficher sur la carte.', zoomIn:'Zoomer', attribution:'Données cartographiques © les contributeurs d’OpenStreetMap' },
    en: { list:'List', map:'Map', viewLabel:'Results view', inZone:'listings in this area', inZoneOne:'listing in this area', fit:'Show all results', open:'View listing', none:'No listing in this area: zoom out or move the map.', more:'Zoom in to see the {n} other listings of the area.', approx:'Approximate position (centre of the municipality)', approxNote:'Dashed pins are placed at the centre of their municipality: the agency gives the exact address.', noPoint:'{n} result(s) without a location are not on the map.', empty:'No result to show on the map.', zoomIn:'Zoom in', attribution:'Map data © OpenStreetMap contributors' },
    pt: { list:'Lista', map:'Mapa', viewLabel:'Vista dos resultados', inZone:'imóveis nesta zona', inZoneOne:'imóvel nesta zona', fit:'Ver todos os resultados', open:'Ver imóvel', none:'Nenhum imóvel nesta zona: afaste ou desloque o mapa.', more:'Aproxime para ver os outros {n} imóveis da zona.', approx:'Posição aproximada (centro do município)', approxNote:'Os imóveis a tracejado estão no centro do seu município: a morada exata é dada pela agência.', noPoint:'{n} resultado(s) sem localização não aparecem no mapa.', empty:'Nenhum resultado para mostrar no mapa.', zoomIn:'Aproximar', attribution:'Dados cartográficos © contribuidores OpenStreetMap' },
    es: { list:'Lista', map:'Mapa', viewLabel:'Vista de resultados', inZone:'inmuebles en esta zona', inZoneOne:'inmueble en esta zona', fit:'Ver todos los resultados', open:'Ver anuncio', none:'Ningún inmueble en esta zona: aleje o mueva el mapa.', more:'Acerque para ver los otros {n} inmuebles de la zona.', approx:'Posición aproximada (centro del municipio)', approxNote:'Los inmuebles con borde discontinuo están en el centro de su municipio: la agencia da la dirección exacta.', noPoint:'{n} resultado(s) sin ubicación no aparecen en el mapa.', empty:'Ningún resultado que mostrar en el mapa.', zoomIn:'Acercar', attribution:'Datos cartográficos © colaboradores de OpenStreetMap' },
    de: { list:'Liste', map:'Karte', viewLabel:'Ergebnisansicht', inZone:'Angebote in diesem Bereich', inZoneOne:'Angebot in diesem Bereich', fit:'Alle Ergebnisse zeigen', open:'Objekt ansehen', none:'Kein Angebot in diesem Bereich: Karte verkleinern oder verschieben.', more:'Vergrößern, um die {n} weiteren Angebote zu sehen.', approx:'Ungefähre Lage (Gemeindemitte)', approxNote:'Gestrichelte Markierungen liegen in der Gemeindemitte: die genaue Adresse nennt die Agentur.', noPoint:'{n} Ergebnis(se) ohne Ortsangabe fehlen auf der Karte.', empty:'Kein Ergebnis für die Karte.', zoomIn:'Vergrößern', attribution:'Kartendaten © OpenStreetMap-Mitwirkende' },
    it: { list:'Elenco', map:'Mappa', viewLabel:'Vista dei risultati', inZone:'immobili in questa zona', inZoneOne:'immobile in questa zona', fit:'Mostra tutti i risultati', open:'Vedi annuncio', none:'Nessun immobile in questa zona: allontana o sposta la mappa.', more:'Avvicina per vedere gli altri {n} immobili della zona.', approx:'Posizione approssimativa (centro del comune)', approxNote:'Gli immobili tratteggiati sono al centro del loro comune: l’indirizzo esatto lo dà l’agenzia.', noPoint:'{n} risultato/i senza posizione non compaiono sulla mappa.', empty:'Nessun risultato da mostrare sulla mappa.', zoomIn:'Avvicina', attribution:'Dati cartografici © collaboratori OpenStreetMap' }
  });

  function normalizeLang(value) {
    return Object.prototype.hasOwnProperty.call(COPY, value) ? value : 'fr';
  }

  function targetForKind(kind) {
    if (kind === 'Development') return 'development';
    if (kind === 'Land') return 'land';
    return 'property';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function numberIn(lang, value, digits) {
    const locale = { fr:'fr-FR', en:'en-GB', pt:'pt-PT', es:'es-ES', de:'de-DE', it:'it-IT' }[normalizeLang(lang)];
    return new Intl.NumberFormat(locale, { maximumFractionDigits: digits || 0 }).format(value);
  }

  /* Pin label: « 420 k€ », « 1,25 M€ », « 1 200 € » for a rent. */
  function shortPrice(value, transactionType, lang, currencyIso) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '—';
    const cur = !currencyIso || currencyIso === 'EUR' ? '€' : currencyIso;
    if (transactionType === 'rent' || n < 10000) return `${numberIn(lang, Math.round(n))} ${cur}`;
    if (n >= 1000000) return `${numberIn(lang, Math.round(n / 10000) / 100, 2)} M${cur}`;
    return `${numberIn(lang, Math.round(n / 1000))} k${cur}`;
  }

  function fill(text, n) { return String(text).replace('{n}', n); }

  /* Card → map point: published position first, else the centre of its zone (commune). */
  function pinsFromCards(cards, zoneCentres) {
    const centres = zoneCentres || {};
    const pins = [];
    (Array.isArray(cards) ? cards : []).forEach(card => {
      if (!card || card.assetId == null) return;
      const exact = pointOf(card.latitude, card.longitude);
      const centre = !exact && card.zoneLiteId ? centres[String(card.zoneLiteId)] : null;
      const point = exact || (centre ? pointOf(centre.latitude, centre.longitude) : null);
      if (!point) return;
      pins.push({ id: String(card.assetId), latitude: point.latitude, longitude: point.longitude, approximate: !exact, card });
    });
    return pins;
  }

  function pointOf(latitude, longitude) {
    if (latitude == null || longitude == null || latitude === '' || longitude === '') return null;
    const lat = Number(latitude); const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { latitude: lat, longitude: lon };
  }

  /* The results inside the visible area, in the order of the search. */
  function pinsInBounds(pins, bounds) {
    if (!bounds) return pins.slice();
    return pins.filter(pin => viewport.pointInBounds(pin.latitude, pin.longitude, bounds));
  }

  /* Groups pins closer than `radiusPx` on screen (greedy, stable order), so that
     price labels and bubbles never overlap. `project(lat, lng)` → {x, y} in pixels
     at the current zoom (Leaflet's map.project); defaults to Web Mercator. */
  function features(pins, zoom, project, radiusPx) {
    const r = radiusPx || CELL_PX;
    const proj = project || ((lat, lng) => clustering.projectWebMercator(lat, lng, zoom));
    const groups = [];
    pins.slice().sort((a, b) => a.id.localeCompare(b.id)).forEach(pin => {
      const pt = proj(pin.latitude, pin.longitude);
      if (!pt) return;
      let best = null; let bestD = Infinity;
      groups.forEach(g => { const d = Math.hypot(g.x - pt.x, g.y - pt.y); if (d < r && d < bestD) { best = g; bestD = d; } });
      if (best) {
        best.members.push(pin); best.points.push(pt);
        best.x = best.points.reduce((sum, p) => sum + p.x, 0) / best.points.length;
        best.y = best.points.reduce((sum, p) => sum + p.y, 0) / best.points.length;
      } else {
        groups.push({ x: pt.x, y: pt.y, members: [pin], points: [pt] });
      }
    });
    return groups.map(g => {
      const ids = g.members.map(m => m.id);
      const lat = g.members.reduce((s, m) => s + m.latitude, 0) / g.members.length;
      const lng = g.members.reduce((s, m) => s + m.longitude, 0) / g.members.length;
      return g.members.length === 1
        ? { type: 'pin', id: ids[0], latitude: g.members[0].latitude, longitude: g.members[0].longitude, count: 1, memberIds: ids }
        : { type: 'cluster', id: 'cluster:' + ids.join(','), latitude: lat, longitude: lng, count: ids.length, memberIds: ids };
    });
  }

  function toggleHTML(lang, mode) {
    const copy = COPY[normalizeLang(lang)];
    const btn = (m, label, icon) => `<button type="button" class="smap-toggle-btn${mode === m ? ' is-active' : ''}" data-search-view="${m}" aria-pressed="${mode === m}" onclick="setSearchViewMode('${m}')"><span aria-hidden="true">${icon}</span>${escapeHtml(label)}</button>`;
    return `<div class="smap-toggle" role="group" aria-label="${escapeHtml(copy.viewLabel)}">${btn('list', copy.list, '☰')}${btn('map', copy.map, '⌖')}</div>`;
  }

  function listItemHTML(pin, lang, active) {
    const card = pin.card || {};
    const copy = COPY[normalizeLang(lang)];
    const img = typeof card.imageUrl === 'string' && card.imageUrl.trim()
      ? `<img src="${escapeHtml(card.imageUrl)}" alt="" loading="lazy" decoding="async">` : '';
    const meta = Array.isArray(card.meta) ? card.meta.filter(Boolean).map(escapeHtml).join(' · ') : '';
    return `<article class="smap-item${active ? ' is-active' : ''}" data-map-asset-id="${escapeHtml(pin.id)}" tabindex="0" role="link" aria-label="${escapeHtml([card.title, card.priceLabel].filter(Boolean).join(' — '))}">
      <div class="smap-item-thumb">${img}</div>
      <div class="smap-item-body">
        <div class="smap-item-price">${escapeHtml(card.priceLabel || '')}</div>
        <div class="smap-item-title">${escapeHtml(card.title || '')}</div>
        <div class="smap-item-loc">${escapeHtml(card.locationLabel || '')}${pin.approximate ? ` <span class="smap-approx-tag" title="${escapeHtml(copy.approx)}">≈</span>` : ''}</div>
        ${meta ? `<div class="smap-item-meta">${meta}</div>` : ''}
      </div>
    </article>`;
  }

  /* ---------------- browser ---------------- */
  const state = { map: null, layer: null, pins: [], pinsById: new Map(), lang: 'fr', activeId: null, signature: '', opts: {}, centreCache: new Map(), leafletPromise: null, renderToken: 0, markers: new Map() };

  function documentRef() { return rootRef && rootRef.document; }

  function ensureLeaflet() {
    const doc = documentRef();
    if (rootRef.L && rootRef.L.map) return Promise.resolve(rootRef.L);
    if (state.leafletPromise) return state.leafletPromise;
    state.leafletPromise = new Promise((resolve, reject) => {
      if (!doc.querySelector('link[data-zfind-leaflet]')) {
        const link = doc.createElement('link');
        link.rel = 'stylesheet'; link.href = LEAFLET_CSS; link.dataset.zfindLeaflet = 'css';
        doc.head.appendChild(link);
      }
      const script = doc.createElement('script');
      script.src = LEAFLET_JS; script.async = true; script.dataset.zfindLeaflet = 'js';
      script.onload = () => rootRef.L ? resolve(rootRef.L) : reject(new Error('Leaflet unavailable after load.'));
      script.onerror = reject;
      doc.head.appendChild(script);
    });
    return state.leafletPromise;
  }

  /* Centres of the zones of the results (public table zones_lite). Tolerant:
     before the migration (no columns) the map simply shows exact positions only. */
  async function zoneCentres(cards) {
    const ids = Array.from(new Set((cards || []).map(c => c && c.zoneLiteId).filter(Boolean).map(String)))
      .filter(id => !state.centreCache.has(id));
    if (ids.length && supabaseClientModule && typeof supabaseClientModule.getSupabaseClient === 'function') {
      for (let i = 0; i < ids.length; i += 150) {
        const chunk = ids.slice(i, i + 150);
        try {
          const { data, error } = await supabaseClientModule.getSupabaseClient().from('zones_lite').select('id, latitude, longitude').in('id', chunk);
          if (error) break;
          (data || []).forEach(z => state.centreCache.set(String(z.id), { latitude: z.latitude, longitude: z.longitude }));
          chunk.forEach(id => { if (!state.centreCache.has(id)) state.centreCache.set(id, null); });
        } catch (_) { break; }
      }
    }
    const out = {};
    state.centreCache.forEach((v, k) => { if (v) out[k] = v; });
    return out;
  }

  function mountSurface(host) {
    const doc = documentRef();
    let node = doc.getElementById(ROOT_ID);
    if (node && node.parentNode !== host) { node.remove(); node = null; }
    if (node) return node;
    node = doc.createElement('section');
    node.id = ROOT_ID;
    node.className = 'smap';
    node.innerHTML = `
      <div class="smap-head">
        <strong class="smap-count" aria-live="polite"></strong>
        <button type="button" class="smap-fit" data-map-fit></button>
      </div>
      <div class="smap-layout">
        <div class="smap-canvas" data-map-canvas role="region"></div>
        <div class="smap-list" data-map-list></div>
      </div>
      <p class="smap-note" data-map-note></p>
      <p class="smap-attribution" data-map-attribution></p>`;
    host.insertBefore(node, host.firstChild);
    node.querySelector('[data-map-fit]').addEventListener('click', () => fitAll());
    return node;
  }

  function surface() { const doc = documentRef(); return doc ? doc.getElementById(ROOT_ID) : null; }

  function currentBounds() {
    if (!state.map) return null;
    const b = state.map.getBounds();
    return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  }

  function fitAll() {
    if (!state.map || !state.pins.length) return;
    const b = viewport.computeBoundsForPins(state.pins);
    if (!b) return;
    if (b.south === b.north && b.west === b.east) { state.map.setView([b.south, b.west], 13); return; }
    const east = b.west > b.east ? b.east + 360 : b.east;
    state.map.fitBounds(rootRef.L.latLngBounds([b.south, b.west], [b.north, east]).pad(0.15), { maxZoom: 14 });
  }

  function open(pin) {
    if (!pin || !pin.card) return;
    if (state.opts && typeof state.opts.onOpen === 'function') state.opts.onOpen(targetForKind(pin.card.kind), String(pin.card.assetId));
  }

  function select(id, scroll) {
    state.activeId = id == null ? null : String(id);
    const node = surface();
    if (!node) return;
    node.querySelectorAll('[data-map-asset-id]').forEach(el => el.classList.toggle('is-active', el.getAttribute('data-map-asset-id') === state.activeId));
    state.markers.forEach((marker, key) => {
      const el = marker.getElement && marker.getElement();
      if (el) el.classList.toggle('is-active', key.split(',').includes(state.activeId));
    });
    if (scroll) {
      const item = node.querySelector(`[data-map-asset-id="${state.activeId}"]`);
      if (item && item.scrollIntoView) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function popupHTML(pins) {
    const copy = COPY[state.lang];
    return `<div class="smap-popup">${pins.slice(0, 8).map(pin => {
      const c = pin.card || {};
      return `<button type="button" class="smap-popup-item" data-popup-open="${escapeHtml(pin.id)}"><strong>${escapeHtml(c.priceLabel || '')}</strong><span>${escapeHtml(c.title || '')}</span><em>${escapeHtml(c.locationLabel || '')}${pin.approximate ? ' · ' + escapeHtml(copy.approx) : ''}</em><u>${escapeHtml(copy.open)}</u></button>`;
    }).join('')}${pins.length > 8 ? `<p class="smap-popup-more">${escapeHtml(fill(copy.more, pins.length - 8))}</p>` : ''}</div>`;
  }

  function bindPopup(marker, pins) {
    marker.bindPopup(popupHTML(pins), { maxWidth: 280, minWidth: 220, autoPanPadding: [24, 24] });
    marker.on('popupopen', e => {
      const el = e.popup.getElement();
      if (!el) return;
      el.querySelectorAll('[data-popup-open]').forEach(btn => btn.addEventListener('click', () => open(state.pinsById.get(btn.getAttribute('data-popup-open')))));
    });
  }

  function drawMarkers() {
    const L = rootRef.L;
    if (!state.map || !L) return;
    if (state.layer) state.layer.remove();
    state.layer = L.layerGroup().addTo(state.map);
    state.markers = new Map();
    const zoom = state.map.getZoom();
    const maxZoom = state.map.getMaxZoom ? Math.min(state.map.getMaxZoom(), 17) : 17;
    const project = (lat, lng) => state.map.project([lat, lng], zoom);
    features(state.pins, zoom, project, CELL_PX).forEach(f => {
      const members = f.memberIds.map(id => state.pinsById.get(id)).filter(Boolean);
      if (!members.length) return;
      const approx = members.every(p => p.approximate);
      let html;
      if (f.type === 'pin') {
        const c = members[0].card || {};
        html = `<span class="smap-pin${approx ? ' approx' : ''}">${escapeHtml(shortPrice(c.priceValue, c.transactionType, state.lang, c.currencyIso))}</span>`;
      } else {
        html = `<span class="smap-cluster${approx ? ' approx' : ''}">${f.count}</span>`;
      }
      const icon = L.divIcon({ className: 'smap-marker', html, iconSize: null });
      const marker = L.marker([f.latitude, f.longitude], { icon, title: members.length === 1 ? (members[0].card.title || '') : String(f.count), riseOnHover: true, keyboard: true });
      const samePlace = members.every(p => p.latitude === members[0].latitude && p.longitude === members[0].longitude);
      if (f.type === 'pin' || samePlace || zoom >= maxZoom) {
        bindPopup(marker, members);
        marker.on('click', () => select(members[0].id, true));
      } else {
        marker.on('click', () => {
          const b = viewport.computeBoundsForPins(members);
          if (b) state.map.fitBounds(L.latLngBounds([b.south, b.west], [b.north, b.east]).pad(0.25), { maxZoom });
        });
      }
      marker.addTo(state.layer);
      state.markers.set(f.memberIds.join(','), marker);
    });
    select(state.activeId, false);
  }

  function renderList() {
    const node = surface();
    if (!node) return;
    const copy = COPY[state.lang];
    const visible = pinsInBounds(state.pins, currentBounds());
    node.querySelector('.smap-count').textContent = `${numberIn(state.lang, visible.length)} ${visible.length === 1 ? copy.inZoneOne : copy.inZone}`;
    const list = node.querySelector('[data-map-list]');
    const shown = visible.slice(0, LIST_MAX);
    list.innerHTML = shown.length
      ? shown.map(pin => listItemHTML(pin, state.lang, pin.id === state.activeId)).join('') + (visible.length > shown.length ? `<p class="smap-more">${escapeHtml(fill(copy.more, visible.length - shown.length))}</p>` : '')
      : `<div class="smap-empty">${escapeHtml(state.pins.length ? copy.none : copy.empty)}</div>`;
    list.querySelectorAll('[data-map-asset-id]').forEach(el => {
      const id = el.getAttribute('data-map-asset-id');
      el.addEventListener('mouseenter', () => select(id, false));
      el.addEventListener('focus', () => select(id, false));
      el.addEventListener('click', () => open(state.pinsById.get(id)));
      el.addEventListener('keydown', e => { if (e.key === 'Enter') open(state.pinsById.get(id)); });
    });
    // Photos: signed only for the cards actually shown, once.
    const missing = shown.map(p => p.card).filter(c => c && c.imageUrl === undefined && Array.isArray(c.imageMedia) && c.imageMedia.length);
    if (missing.length && typeof state.opts.resolveImages === 'function') {
      const token = state.renderToken;
      Promise.resolve(state.opts.resolveImages(missing)).then(() => {
        if (token !== state.renderToken) return;
        missing.forEach(c => {
          const thumb = list.querySelector(`[data-map-asset-id="${String(c.assetId)}"] .smap-item-thumb`);
          if (thumb && typeof c.imageUrl === 'string' && c.imageUrl && !thumb.querySelector('img')) thumb.innerHTML = `<img src="${escapeHtml(c.imageUrl)}" alt="" loading="lazy" decoding="async">`;
        });
      }).catch(() => {});
    }
  }

  function onViewChange() { drawMarkers(); renderList(); }

  /* Shows every result of the search on the map, inside `host`. */
  async function showMap(host, cards, options) {
    const token = ++state.renderToken;
    state.opts = options || {};
    state.lang = normalizeLang(state.opts.lang);
    const copy = COPY[state.lang];
    const node = mountSurface(host);
    node.querySelector('[data-map-fit]').textContent = copy.fit;
    node.querySelector('[data-map-attribution]').textContent = copy.attribution;
    const centres = await zoneCentres(cards);
    if (token !== state.renderToken) return;
    state.pins = pinsFromCards(cards, centres);
    state.pinsById = new Map(state.pins.map(p => [p.id, p]));
    const unplaced = (cards || []).length - state.pins.length;
    const notes = [];
    if (state.pins.some(p => p.approximate)) notes.push(copy.approxNote);
    if (unplaced > 0) notes.push(fill(copy.noPoint, unplaced));
    node.querySelector('[data-map-note]').textContent = notes.join(' ');
    const L = await ensureLeaflet();
    if (token !== state.renderToken || !surface()) return;
    const signature = state.pins.map(p => `${p.id}@${p.latitude},${p.longitude}`).join('|');
    if (!state.map || state.map.getContainer() !== node.querySelector('[data-map-canvas]')) {
      if (state.map) state.map.remove();
      state.map = L.map(node.querySelector('[data-map-canvas]'), { scrollWheelZoom: true, zoomControl: true, attributionControl: true, worldCopyJump: true });
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0)' }).addTo(state.map);
      state.map.setView([46.6, 2.5], 5);
      state.map.on('moveend', onViewChange);
      state.signature = '';
    }
    if (signature !== state.signature) {
      state.signature = signature;
      fitAll();
    }
    onViewChange();
    rootRef.setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 0);
  }

  function hideMap() {
    state.renderToken++;
    if (state.map) { state.map.remove(); state.map = null; state.layer = null; state.markers = new Map(); }
    const node = surface();
    if (node) node.remove();
    state.signature = '';
  }

  return Object.freeze({
    COPY, ROOT_ID, normalizeLang, targetForKind, escapeHtml, shortPrice, pinsFromCards, pinsInBounds, features, toggleHTML, listItemHTML,
    showMap, hideMap, isOpen: () => Boolean(surface()), _state: state
  });
});
