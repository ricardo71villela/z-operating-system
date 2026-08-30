/* ============================================================
   Z FIND — SEARCH MAP CLUSTERING V1
   Pure provider-neutral clustering foundation for future Search map UI.

   Inputs are already-public map pins. This module:
   - performs no network request;
   - performs no geocoding or coordinate inference;
   - does not mutate input pins;
   - uses deterministic Web Mercator pixel-grid grouping;
   - returns stable pin/cluster features independent of input order.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.searchMapClustering = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const TILE_SIZE = 256;
  const MAX_MERCATOR_LAT = 85.05112878;
  const DEFAULT_CELL_SIZE_PX = 64;
  const MIN_CELL_SIZE_PX = 24;
  const MAX_CELL_SIZE_PX = 256;
  const MIN_ZOOM = 0;
  const MAX_ZOOM = 22;

  function finiteNumber(value) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeZoom(value) {
    const zoom = finiteNumber(value);
    if (zoom == null || !Number.isInteger(zoom)) return null;
    if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) return null;
    return zoom;
  }

  function normalizeCellSize(value) {
    if (value == null) return DEFAULT_CELL_SIZE_PX;
    const size = finiteNumber(value);
    if (size == null || size < MIN_CELL_SIZE_PX || size > MAX_CELL_SIZE_PX) {
      return null;
    }
    return size;
  }

  function normalizePin(pin) {
    if (!pin || pin.id == null || String(pin.id).trim() === '') return null;

    const latitude = finiteNumber(pin.latitude);
    const longitude = finiteNumber(pin.longitude);
    if (latitude == null || longitude == null) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return null;
    }

    return {
      id: String(pin.id),
      latitude,
      longitude
    };
  }

  function projectWebMercator(latitude, longitude, zoom) {
    const z = normalizeZoom(zoom);
    const lat = finiteNumber(latitude);
    const lon = finiteNumber(longitude);

    if (z == null || lat == null || lon == null) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

    const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
    const scale = TILE_SIZE * Math.pow(2, z);
    const sin = Math.sin(clampedLat * Math.PI / 180);

    return {
      x: ((lon + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
    };
  }

  function stableUniquePins(pins) {
    if (!Array.isArray(pins)) return [];

    const candidates = pins
      .map(normalizePin)
      .filter(Boolean)
      .sort((a, b) => {
        const idOrder = a.id.localeCompare(b.id);
        if (idOrder) return idOrder;
        if (a.latitude !== b.latitude) return a.latitude - b.latitude;
        return a.longitude - b.longitude;
      });

    const unique = [];
    let previousId = null;
    for (const pin of candidates) {
      if (pin.id === previousId) continue;
      unique.push(pin);
      previousId = pin.id;
    }
    return unique;
  }

  function clusterMapPins(pins, options) {
    const opts = options || {};
    const zoom = normalizeZoom(opts.zoom);
    const cellSizePx = normalizeCellSize(opts.cellSizePx);

    if (zoom == null || cellSizePx == null) return [];

    const groups = new Map();

    for (const pin of stableUniquePins(pins)) {
      const point = projectWebMercator(pin.latitude, pin.longitude, zoom);
      if (!point) continue;

      const cellX = Math.floor(point.x / cellSizePx);
      const cellY = Math.floor(point.y / cellSizePx);
      const key = `${cellX}:${cellY}`;

      if (!groups.has(key)) {
        groups.set(key, { cellX, cellY, pins: [] });
      }
      groups.get(key).pins.push(pin);
    }

    return Array.from(groups.values())
      .sort((a, b) => a.cellY - b.cellY || a.cellX - b.cellX)
      .map(group => {
        const members = group.pins.slice().sort((a, b) => a.id.localeCompare(b.id));
        const memberIds = members.map(pin => pin.id);

        if (members.length === 1) {
          const pin = members[0];
          return {
            type: 'pin',
            id: pin.id,
            latitude: pin.latitude,
            longitude: pin.longitude,
            count: 1,
            memberIds
          };
        }

        const latitude = members.reduce((sum, pin) => sum + pin.latitude, 0) / members.length;
        const longitude = members.reduce((sum, pin) => sum + pin.longitude, 0) / members.length;

        return {
          type: 'cluster',
          id: `cluster:${zoom}:${group.cellX}:${group.cellY}`,
          latitude,
          longitude,
          count: members.length,
          memberIds
        };
      });
  }

  return Object.freeze({
    TILE_SIZE,
    MAX_MERCATOR_LAT,
    DEFAULT_CELL_SIZE_PX,
    normalizeZoom,
    normalizeCellSize,
    projectWebMercator,
    clusterMapPins
  });
});
