/* ============================================================
   Z FIND — MARKET RUNTIME CONTEXT
   ============================================================
   Small runtime adapter loaded after app.js.

   Responsibilities:
   1) hydrate shared Home / Country Market Featured cards with the same
      source-backed media URL resolver already used by organic Search;
   2) render those resolved cover images in the shared card component;
   3) persist the visitor's active marketplace context across SPA views;
   4) make the acquisition-cost simulator default to that market's
      country without ever applying Portugal tax rules to another country.

   This adapter deliberately does NOT add tax rules. The fiscal engine
   remains authoritative: simulator.supportedCountries() is the only
   source of countries for which a calculation may actually run.
   ============================================================ */

(function (root) {
  'use strict';

  if (!root || !root.document) return;

  const services = root.ZFindServices || {};
  const registry = services.marketRegistry;
  const simulator = services.simulator;

  if (!registry || !simulator) {
    throw new Error(
      'Z Find market runtime context requires marketRegistry and simulator.'
    );
  }

  const document = root.document;
  const MARKET_STORAGE_KEY = 'zfind_market';

  const unavailableCopy = Object.freeze({
    fr: label => `Le simulateur de frais d’acquisition pour ${label} sera disponible dès que les règles fiscales propres à ce pays auront été validées. Aucun calcul portugais n’est appliqué à ${label}.`,
    en: label => `The acquisition-cost simulator for ${label} will be available once that country’s own tax rules have been validated. Portuguese tax rules are never applied to ${label}.`,
    pt: label => `O simulador de custos de aquisição para ${label} ficará disponível quando as regras fiscais próprias desse país estiverem validadas. As regras fiscais portuguesas nunca são aplicadas a ${label}.`,
    es: label => `El simulador de costes de adquisición para ${label} estará disponible cuando se validen las reglas fiscales propias de ese país. Las reglas fiscales portuguesas nunca se aplican a ${label}.`,
    de: label => `Der Erwerbskosten-Simulator für ${label} wird verfügbar, sobald die landeseigenen Steuerregeln validiert sind. Portugiesische Steuerregeln werden niemals auf ${label} angewendet.`,
    it: label => `Il simulatore dei costi di acquisto per ${label} sarà disponibile quando saranno convalidate le regole fiscali specifiche del paese. Le regole fiscali portoghesi non vengono mai applicate a ${label}.`
  });

  function knownMarketKey(marketKey) {
    return typeof marketKey === 'string' && !!registry.getMarket(marketKey);
  }

  function marketKeyFromHash() {
    const hash = String(root.location && root.location.hash || '')
      .replace(/^#\/?/, '');
    const path = hash.split('?')[0];
    const parts = path.split('/').filter(Boolean);

    if (parts[1] !== 'market') return null;
    return knownMarketKey(parts[2]) ? parts[2] : null;
  }

  function storedMarketKey() {
    try {
      const stored = root.localStorage.getItem(MARKET_STORAGE_KEY);
      return knownMarketKey(stored) ? stored : null;
    } catch (_) {
      return null;
    }
  }

  function rememberMarket(marketKey) {
    if (!knownMarketKey(marketKey)) return false;

    try {
      root.localStorage.setItem(MARKET_STORAGE_KEY, marketKey);
      return true;
    } catch (_) {
      return false;
    }
  }

  function currentMarketKey() {
    return marketKeyFromHash() || storedMarketKey();
  }

  function marketCountryIso(marketKey) {
    const market = knownMarketKey(marketKey)
      ? registry.getMarket(marketKey)
      : null;

    if (!market || !market.geography) return null;

    if (
      market.geography.kind === 'country' &&
      typeof market.geography.code === 'string'
    ) {
      return market.geography.code;
    }

    return typeof market.geography.parentCountryIso === 'string'
      ? market.geography.parentCountryIso
      : null;
  }

  function supportedSimulatorCountries() {
    return new Set(
      simulator.supportedCountries()
        .map(country => country && country.iso)
        .filter(Boolean)
    );
  }

  function countryMarketForIso(countryIso) {
    return registry.listMarkets().find(market =>
      market &&
      market.geography &&
      market.geography.kind === 'country' &&
      market.geography.code === countryIso
    ) || null;
  }

  function countryLabel(countryIso, lang) {
    const market = countryMarketForIso(countryIso);

    if (market) {
      return registry.marketLabel(market.key, lang);
    }

    const supported = simulator.supportedCountries()
      .find(country => country.iso === countryIso);

    return supported ? supported.label : countryIso;
  }

  function selectorCountries(lang) {
    const countries = [];
    const seen = new Set();
    const supported = supportedSimulatorCountries();

    registry.listMarkets().forEach(market => {
      if (
        !market ||
        !market.geography ||
        market.geography.kind !== 'country' ||
        !market.geography.code ||
        seen.has(market.geography.code)
      ) {
        return;
      }

      const iso = market.geography.code;
      seen.add(iso);
      countries.push({
        iso,
        label: registry.marketLabel(market.key, lang),
        supported: supported.has(iso)
      });
    });

    simulator.supportedCountries().forEach(country => {
      if (!country || !country.iso || seen.has(country.iso)) return;
      seen.add(country.iso);
      countries.push({
        iso: country.iso,
        label: country.label,
        supported: true
      });
    });

    return countries;
  }

  function firstListing(row) {
    const representation =
      row && Array.isArray(row.representations)
        ? row.representations[0]
        : null;

    return representation && Array.isArray(representation.listings)
      ? representation.listings[0]
      : null;
  }

  async function resolveCardImage(associations) {
    if (typeof root.resolveSearchCardImageUrl !== 'function') {
      return null;
    }

    return root.resolveSearchCardImageUrl(
      services,
      Array.isArray(associations) ? associations : []
    );
  }

  async function propertyCardFromRow(row, lang) {
    const card = root.mapSupabasePropertyRowToCard(row, lang);
    const listing = firstListing(row);
    const imageUrl = await resolveCardImage(
      listing && Array.isArray(listing.listing_media)
        ? listing.listing_media
        : []
    );

    return Object.assign({}, card, { imageUrl });
  }

  async function developmentCardFromRow(row, lang) {
    const card = root.mapSupabaseDevelopmentRowToCard(row, lang);
    const listing = firstListing(row);
    const ownMedia = row && Array.isArray(row.development_media)
      ? row.development_media
      : [];
    const listingMedia = listing && Array.isArray(listing.listing_media)
      ? listing.listing_media
      : [];
    const imageUrl = await resolveCardImage(
      ownMedia.length ? ownMedia : listingMedia
    );

    return Object.assign({}, card, { imageUrl });
  }

  if (
    typeof root.loadFeaturedCandidateCards === 'function' &&
    typeof root.mapSupabasePropertyRowToCard === 'function' &&
    typeof root.mapSupabaseDevelopmentRowToCard === 'function'
  ) {
    root.loadFeaturedCandidateCards = async function (lang) {
      if (
        !services.search ||
        typeof services.search.listPublished !== 'function' ||
        !services.developments
      ) {
        return {
          cards: [],
          error: {
            type: 'malformed_response',
            message: 'Published inventory services not loaded.'
          }
        };
      }

      const [propertiesResult, developmentsResult] = await Promise.all([
        services.search.listPublished(),
        services.developments.listPublished()
      ]);

      if (
        propertiesResult.error &&
        propertiesResult.error.type !== 'empty_result'
      ) {
        return { cards: [], error: propertiesResult.error };
      }

      if (
        developmentsResult.error &&
        developmentsResult.error.type !== 'empty_result'
      ) {
        return { cards: [], error: developmentsResult.error };
      }

      const propertyCards = await Promise.all(
        (propertiesResult.data || [])
          .map(row => propertyCardFromRow(row, lang))
      );

      const developmentCards = await Promise.all(
        (developmentsResult.data || [])
          .map(row => developmentCardFromRow(row, lang))
      );

      return {
        cards: propertyCards.concat(developmentCards),
        error: null
      };
    };
  }

  if (
    typeof root.loadHomeCards === 'function' &&
    typeof root.mapSupabasePropertyRowToCard === 'function' &&
    typeof root.mapSupabaseDevelopmentRowToCard === 'function'
  ) {
    root.loadHomeCards = async function (lang) {
      if (!services.search || !services.developments) {
        return {
          properties: [],
          developments: [],
          error: {
            type: 'malformed_response',
            message: 'Supabase services not loaded.'
          }
        };
      }

      const [propertiesResult, developmentsResult] = await Promise.all([
        services.search.search({}),
        services.developments.listPublished()
      ]);

      if (
        propertiesResult.error &&
        propertiesResult.error.type !== 'empty_result'
      ) {
        return {
          properties: [],
          developments: [],
          error: propertiesResult.error
        };
      }

      if (
        developmentsResult.error &&
        developmentsResult.error.type !== 'empty_result'
      ) {
        return {
          properties: [],
          developments: [],
          error: developmentsResult.error
        };
      }

      const propertyCards = await Promise.all(
        (propertiesResult.data || [])
          .map(row => propertyCardFromRow(row, lang))
      );

      const developmentCards = await Promise.all(
        (developmentsResult.data || [])
          .map(row => developmentCardFromRow(row, lang))
      );

      return {
        properties: propertyCards,
        developments: developmentCards,
        error: null
      };
    };
  }

  if (typeof root.cardHTML === 'function') {
    const originalCardHTML = root.cardHTML;

    root.cardHTML = function (viewModel, searchOrigin) {
      const html = originalCardHTML(viewModel, searchOrigin);
      const imageUrl =
        viewModel && typeof viewModel.imageUrl === 'string'
          ? viewModel.imageUrl.trim()
          : '';

      const state = imageUrl ? 'resolved' : 'placeholder';
      const marker = `<div class="thumb" data-card-image-state="${state}">`;

      if (!imageUrl) {
        return html.replace('<div class="thumb">', marker);
      }

      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = '';
      const safeSrc = image.getAttribute('src') || '';

      return html.replace(
        '<div class="thumb">',
        marker +
          `<img src="${safeSrc.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;">`
      );
    };
  }

  if (typeof root.navigateMarket === 'function') {
    const originalNavigateMarket = root.navigateMarket;

    root.navigateMarket = function (marketKey) {
      rememberMarket(marketKey);
      return originalNavigateMarket(marketKey);
    };
  }

  if (typeof root.syncMarketSelects === 'function') {
    const originalSyncMarketSelects = root.syncMarketSelects;

    root.syncMarketSelects = function () {
      originalSyncMarketSelects();

      const marketKey = currentMarketKey();
      if (!marketKey) return;

      document
        .querySelectorAll('[data-market-select]')
        .forEach(select => {
          const hasOption = Array.from(select.options)
            .some(option => option.value === marketKey);

          if (hasOption) select.value = marketKey;
        });
    };
  }

  function ensureSimulatorCountries(select, lang) {
    const countries = selectorCountries(lang);

    select.replaceChildren();

    countries.forEach(country => {
      const option = document.createElement('option');
      option.value = country.iso;
      option.textContent = country.label;
      option.dataset.simulatorSupported = country.supported ? '1' : '0';
      select.appendChild(option);
    });
  }

  function simulatorUnavailableMessage(countryIso) {
    const lang =
      typeof state !== 'undefined' && state.lang
        ? state.lang
        : 'en';
    const factory = unavailableCopy[lang] || unavailableCopy.en;
    return factory(countryLabel(countryIso, lang));
  }

  function syncSimulatorCountryContext() {
    const select = document.getElementById('sim-country');
    const result = document.getElementById('sim-result');
    const costs = document.getElementById('sim-tab-costs');

    if (!select || !result || !costs) return;

    const countryIso = select.value;
    const supported = supportedSimulatorCountries().has(countryIso);
    const hpp = document.getElementById('sim-hpp');
    const resident = document.getElementById('sim-resident');
    const calculate = costs.querySelector('button.btn-gold');
    const subtitle = costs.querySelector('h1 + p');

    [hpp, resident].forEach(input => {
      const wrapper = input && input.closest('div');
      if (wrapper) wrapper.style.display = countryIso === 'PT' ? '' : 'none';
    });

    if (calculate) {
      calculate.disabled = !supported;
      calculate.style.opacity = supported ? '' : '0.45';
      calculate.style.cursor = supported ? '' : 'not-allowed';
    }

    if (supported) {
      if (
        subtitle &&
        typeof state !== 'undefined' &&
        typeof root.t === 'function'
      ) {
        subtitle.textContent = root.t(state.lang, 'simulator.subtitle');
      }
      result.replaceChildren();
      return;
    }

    const message = simulatorUnavailableMessage(countryIso);
    if (subtitle) subtitle.textContent = message;

    result.replaceChildren();
    const notice = document.createElement('div');
    notice.dataset.simulatorCountryState = 'rules-pending';
    notice.style.padding = '14px 16px';
    notice.style.background = 'var(--gray-50)';
    notice.style.border = '1px solid var(--gray-200)';
    notice.style.borderRadius = '6px';
    notice.style.fontSize = '0.85rem';
    notice.style.color = 'var(--gray-700)';
    notice.textContent = message;
    result.appendChild(notice);
  }

  if (typeof root.renderSimulator === 'function') {
    const originalRenderSimulator = root.renderSimulator;

    root.renderSimulator = function () {
      originalRenderSimulator();

      const select = document.getElementById('sim-country');
      if (!select) return;

      const lang =
        typeof state !== 'undefined' && state.lang
          ? state.lang
          : 'en';

      ensureSimulatorCountries(select, lang);

      const marketIso = marketCountryIso(currentMarketKey());
      if (
        marketIso &&
        Array.from(select.options)
          .some(option => option.value === marketIso)
      ) {
        select.value = marketIso;
      }

      select.addEventListener('change', syncSimulatorCountryContext);
      syncSimulatorCountryContext();
    };
  }

  if (typeof root.runSimulator === 'function') {
    const originalRunSimulator = root.runSimulator;

    root.runSimulator = function () {
      const select = document.getElementById('sim-country');

      if (
        select &&
        !supportedSimulatorCountries().has(select.value)
      ) {
        syncSimulatorCountryContext();
        return;
      }

      return originalRunSimulator();
    };
  }

  function syncMarketFromRoute() {
    const marketKey = marketKeyFromHash();
    if (marketKey) rememberMarket(marketKey);
  }

  document.addEventListener('DOMContentLoaded', function () {
    root.setTimeout(function () {
      syncMarketFromRoute();
      if (typeof root.syncMarketSelects === 'function') {
        root.syncMarketSelects();
      }
    }, 0);
  });

  root.addEventListener('hashchange', function () {
    root.setTimeout(function () {
      syncMarketFromRoute();
      if (typeof root.syncMarketSelects === 'function') {
        root.syncMarketSelects();
      }
    }, 0);
  });

  services.marketRuntimeContext = Object.freeze({
    MARKET_STORAGE_KEY,
    currentMarketKey,
    rememberMarket,
    marketCountryIso,
    selectorCountries,
    syncSimulatorCountryContext
  });
})(typeof window !== 'undefined' ? window : this);
