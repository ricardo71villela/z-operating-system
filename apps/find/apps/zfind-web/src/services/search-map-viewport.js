/* ============================================================
   Z FIND — SEARCH MAP VIEWPORT V1
   Pure provider-neutral viewport/list synchronization foundation.

   - no network request or map SDK dependency;
   - supports ordinary bounds and antimeridian-crossing bounds;
   - computes the smallest deterministic longitude arc for valid pins;
   - preserves source pin objects when filtering visible inventory;
   - does not mutate input pins or bounds.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.searchMapViewport = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function finiteNumber(value) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validLatitude(value) {
    const latitude = finiteNumber(value);
    return latitude != null && latitude >= -90 && latitude <= 90 ? latitude : null;
  }

  function validLongitude(value) {
    const longitude = finiteNumber(value);
    return longitude != null && longitude >= -180 && longitude <= 180 ? longitude : null;
  }

  function normalizeBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') return null;
    const south = validLatitude(bounds.south);
    const north = validLatitude(bounds.north);
    const west = validLongitude(bounds.west);
    const east = validLongitude(bounds.east);
    if (south == null || north == null || west == null || east == null) return null;
    if (south > north) return null;
    return { south, west, north, east };
  }

  function pointInBounds(latitude, longitude, bounds) {
    const normalized = normalizeBounds(bounds);
    const lat = validLatitude(latitude);
    const lon = validLongitude(longitude);
    if (!normalized || lat == null || lon == null) return false;
    if (lat < normalized.south || lat > normalized.north) return false;
    if (normalized.west <= normalized.east) return lon >= normalized.west && lon <= normalized.east;
    return lon >= normalized.west || lon <= normalized.east;
  }

  function filterPinsInBounds(pins, bounds) {
    const normalized = normalizeBounds(bounds);
    if (!normalized || !Array.isArray(pins)) return [];
    return pins.filter(pin => pin && pointInBounds(pin.latitude, pin.longitude, normalized));
  }

  function toCircleLongitude(longitude) {
    return ((longitude % 360) + 360) % 360;
  }

  function validPinCoordinates(pins) {
    if (!Array.isArray(pins)) return [];
    return pins.reduce((rows, pin) => {
      if (!pin) return rows;
      const latitude = validLatitude(pin.latitude);
      const longitude = validLongitude(pin.longitude);
      if (latitude == null || longitude == null) return rows;
      rows.push({ latitude, longitude });
      return rows;
    }, []);
  }

  function computeBoundsForPins(pins) {
    const coordinates = validPinCoordinates(pins);
    if (!coordinates.length) return null;
    const south = Math.min(...coordinates.map(point => point.latitude));
    const north = Math.max(...coordinates.map(point => point.latitude));
    if (coordinates.length === 1) {
      const longitude = coordinates[0].longitude;
      return { south, west: longitude, north, east: longitude };
    }
    const longitudes = coordinates
      .map(point => ({ circle: toCircleLongitude(point.longitude), original: point.longitude }))
      .sort((a, b) => a.circle - b.circle || a.original - b.original);
    let largestGap = -1;
    let largestGapIndex = 0;
    for (let index = 0; index < longitudes.length; index += 1) {
      const current = longitudes[index].circle;
      const next = index === longitudes.length - 1 ? longitudes[0].circle + 360 : longitudes[index + 1].circle;
      const gap = next - current;
      if (gap > largestGap) {
        largestGap = gap;
        largestGapIndex = index;
      }
    }
    const arcStartIndex = (largestGapIndex + 1) % longitudes.length;
    const arcEndIndex = largestGapIndex;
    const west = longitudes[arcStartIndex].original;
    const east = longitudes[arcEndIndex].original;
    return { south, west, north, east };
  }

  function buildViewportState(pins, bounds, selectedId) {
    const normalized = normalizeBounds(bounds);
    const sourcePins = Array.isArray(pins) ? pins : [];
    const visiblePins = normalized ? filterPinsInBounds(sourcePins, normalized) : [];
    const visibleIds = visiblePins
      .filter(pin => pin && pin.id != null && String(pin.id).trim() !== '')
      .map(pin => String(pin.id));
    const requestedSelection = selectedId == null ? null : String(selectedId);
    const visibleSelectedId = requestedSelection && visibleIds.includes(requestedSelection) ? requestedSelection : null;
    return {
      bounds: normalized,
      totalPinCount: sourcePins.length,
      visiblePinCount: visiblePins.length,
      visiblePins,
      visibleIds,
      selectedId: visibleSelectedId
    };
  }

  return Object.freeze({ normalizeBounds, pointInBounds, filterPinsInBounds, computeBoundsForPins, buildViewportState });
});
