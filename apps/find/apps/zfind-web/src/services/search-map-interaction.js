/* ============================================================
   Z FIND — SEARCH MAP INTERACTION CONTRACT V1
   Pure provider-neutral card/list/pin/viewport interaction state.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./search-map-viewport.js'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.searchMapInteraction = factory(
      root.ZFindServices.searchMapViewport
    );
  }
})(typeof window !== 'undefined' ? window : this, function (viewport) {
  'use strict';

  const SELECTION_ORIGINS = Object.freeze(['card', 'pin', 'keyboard']);
  const VIEWPORT_CAUSES = Object.freeze(['user', 'programmatic']);

  function normalizeBounds(bounds) {
    return viewport && typeof viewport.normalizeBounds === 'function'
      ? viewport.normalizeBounds(bounds)
      : null;
  }

  function normalizeId(value) {
    if (value == null) return null;
    const id = String(value).trim();
    return id || null;
  }

  function normalizeIdList(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const ids = [];

    values.forEach(value => {
      const id = normalizeId(value);
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });

    return ids;
  }

  function copyBounds(bounds) {
    return bounds
      ? {
          south: bounds.south,
          west: bounds.west,
          north: bounds.north,
          east: bounds.east
        }
      : null;
  }

  function boundsSignature(bounds) {
    const normalized = normalizeBounds(bounds);
    if (!normalized) return null;
    return [
      normalized.south,
      normalized.west,
      normalized.north,
      normalized.east
    ].map(value => Number(value).toFixed(7)).join('|');
  }

  function sameBounds(left, right) {
    const leftSignature = boundsSignature(left);
    const rightSignature = boundsSignature(right);
    return leftSignature != null && leftSignature === rightSignature;
  }

  function freezeState(state) {
    const frozen = {
      ...state,
      viewportBounds: copyBounds(state.viewportBounds),
      committedBounds: copyBounds(state.committedBounds),
      visibleIds: Object.freeze([...(state.visibleIds || [])]),
      clusterMemberIds: Object.freeze([...(state.clusterMemberIds || [])]),
      intent: state.intent
        ? Object.freeze({
            ...state.intent,
            bounds: copyBounds(state.intent.bounds),
            memberIds: state.intent.memberIds
              ? Object.freeze([...state.intent.memberIds])
              : undefined
          })
        : null
    };
    if (frozen.viewportBounds) Object.freeze(frozen.viewportBounds);
    if (frozen.committedBounds) Object.freeze(frozen.committedBounds);
    return Object.freeze(frozen);
  }

  function createInteractionState(options) {
    const input = options && typeof options === 'object' ? options : {};
    const visibleIds = normalizeIdList(input.visibleIds);
    const viewportBounds = normalizeBounds(input.viewportBounds);
    const committedBounds = normalizeBounds(input.committedBounds);
    const requestedSelectedId = normalizeId(input.selectedId);
    const requestedHighlightedId = normalizeId(input.highlightedId);

    return freezeState({
      viewportBounds,
      committedBounds,
      visibleIds,
      selectedId: requestedSelectedId && visibleIds.includes(requestedSelectedId)
        ? requestedSelectedId
        : null,
      highlightedId: requestedHighlightedId && visibleIds.includes(requestedHighlightedId)
        ? requestedHighlightedId
        : null,
      activeClusterId: null,
      clusterMemberIds: [],
      pendingSearchArea: false,
      lastOrigin: null,
      intent: null
    });
  }

  function selectListing(state, listingId, origin) {
    const current = state || createInteractionState();
    const id = normalizeId(listingId);
    const selectionOrigin = SELECTION_ORIGINS.includes(origin) ? origin : null;

    if (!id || !selectionOrigin || !current.visibleIds.includes(id)) {
      return current;
    }

    return freezeState({
      ...current,
      selectedId: id,
      activeClusterId: null,
      clusterMemberIds: [],
      lastOrigin: selectionOrigin,
      intent: {
        type: selectionOrigin === 'pin' ? 'reveal-card' : 'reveal-pin',
        id,
        origin: selectionOrigin
      }
    });
  }

  function highlightListing(state, listingId, origin) {
    const current = state || createInteractionState();
    const id = normalizeId(listingId);
    const highlightOrigin = SELECTION_ORIGINS.includes(origin) ? origin : null;

    if (!id || !highlightOrigin || !current.visibleIds.includes(id)) {
      return current;
    }

    return freezeState({
      ...current,
      highlightedId: id,
      lastOrigin: highlightOrigin,
      intent: null
    });
  }

  function clearHighlight(state) {
    const current = state || createInteractionState();
    if (current.highlightedId == null) return current;
    return freezeState({ ...current, highlightedId: null, intent: null });
  }

  function selectCluster(state, cluster) {
    const current = state || createInteractionState();
    if (!cluster || typeof cluster !== 'object') return current;

    const clusterId = normalizeId(cluster.id);
    const members = normalizeIdList(cluster.memberIds)
      .filter(id => current.visibleIds.includes(id))
      .sort();

    if (!clusterId || members.length < 2) return current;

    return freezeState({
      ...current,
      selectedId: null,
      highlightedId: null,
      activeClusterId: clusterId,
      clusterMemberIds: members,
      lastOrigin: 'cluster',
      intent: {
        type: 'fit-cluster',
        clusterId,
        memberIds: members
      }
    });
  }

  function changeViewport(state, bounds, cause) {
    const current = state || createInteractionState();
    const nextBounds = normalizeBounds(bounds);
    const viewportCause = VIEWPORT_CAUSES.includes(cause) ? cause : null;

    if (!nextBounds || !viewportCause) return current;

    const pendingSearchArea = viewportCause === 'user'
      ? !sameBounds(nextBounds, current.committedBounds)
      : current.pendingSearchArea;

    return freezeState({
      ...current,
      viewportBounds: nextBounds,
      activeClusterId: viewportCause === 'user' ? null : current.activeClusterId,
      clusterMemberIds: viewportCause === 'user' ? [] : current.clusterMemberIds,
      pendingSearchArea,
      lastOrigin: 'map',
      intent: null
    });
  }

  function commitSearchArea(state) {
    const current = state || createInteractionState();
    const viewportBounds = normalizeBounds(current.viewportBounds);
    if (!viewportBounds) return current;

    return freezeState({
      ...current,
      committedBounds: viewportBounds,
      pendingSearchArea: false,
      activeClusterId: null,
      clusterMemberIds: [],
      lastOrigin: 'search-area',
      intent: {
        type: 'run-search-area',
        bounds: viewportBounds
      }
    });
  }

  function syncVisibleResults(state, visibleIds) {
    const current = state || createInteractionState();
    const nextVisibleIds = normalizeIdList(visibleIds);
    const selectedId = current.selectedId && nextVisibleIds.includes(current.selectedId)
      ? current.selectedId
      : null;
    const highlightedId = current.highlightedId && nextVisibleIds.includes(current.highlightedId)
      ? current.highlightedId
      : null;
    const clusterMemberIds = current.clusterMemberIds
      .filter(id => nextVisibleIds.includes(id));
    const activeClusterId = clusterMemberIds.length >= 2
      ? current.activeClusterId
      : null;

    return freezeState({
      ...current,
      visibleIds: nextVisibleIds,
      selectedId,
      highlightedId,
      activeClusterId,
      clusterMemberIds: activeClusterId ? clusterMemberIds : [],
      intent: null
    });
  }

  function clearIntent(state) {
    const current = state || createInteractionState();
    if (current.intent == null) return current;
    return freezeState({ ...current, intent: null });
  }

  return Object.freeze({
    SELECTION_ORIGINS,
    VIEWPORT_CAUSES,
    boundsSignature,
    sameBounds,
    createInteractionState,
    selectListing,
    highlightListing,
    clearHighlight,
    selectCluster,
    changeViewport,
    commitSearchArea,
    syncVisibleResults,
    clearIntent
  });
});
