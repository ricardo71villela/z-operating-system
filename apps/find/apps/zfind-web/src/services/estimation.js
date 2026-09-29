/* ============================================================
   Z FIND — PROPERTY ESTIMATION ENGINE (France, Belgique, Luxembourg)

   One engine for the public estimation page and for the e-mail report
   function (api/estimation.js), so the visitor and the report always get
   the same figures. It only uses the official aggregated statistics
   published with the site (public/market-data):

     FR  DVF (DGFiP) — median €/m² and quartiles by commune, by type,
         falling back to the department when a commune has too few sales.
     BE  Statbel — median TOTAL sale price and quartiles by commune and
         type (apartment, house 2-3 façades, house 4+ façades); falling
         back to arrondissement → province → region. Statbel publishes no
         €/m², so the size of the property is taken into account against a
         reference surface per type (documented assumption, lower confidence).
     LU  Observatoire de l'Habitat — registered €/m² of existing and new
         (VEFA) apartments by commune; houses from advertised €/m² corrected
         by the advertised→sold ratio measured on apartments in the data.

   The result is an indicative range, never an appraisal: adjustments are
   few, published with the result and capped.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.estimation = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const MARKETS = Object.freeze(['FR', 'BE', 'LU']);
  const TYPES = Object.freeze({
    FR: Object.freeze(['apartment', 'house']),
    BE: Object.freeze(['apartment', 'house_closed', 'house_open']),
    LU: Object.freeze(['apartment', 'house'])
  });

  /* Adjustments (share of the base value). Published with every result. */
  const ADJUSTMENTS = Object.freeze({
    condition: Object.freeze({ to_renovate: -0.12, standard: 0, good: 0.04, renovated: 0.08 }),
    energy: Object.freeze({ A: 0.05, B: 0.05, C: 0, D: 0, E: -0.03, F: -0.10, G: -0.10 }),
    balcony: 0.02,
    terrace: 0.04,
    garden_apartment: 0.05,
    outdoor_cap: 0.06,
    parking: 0.03,
    pool: 0.05,
    view: 0.03,
    ground_floor: -0.05,
    high_floor_no_lift: -0.07
  });
  const TOTAL_ADJUSTMENT = Object.freeze({ min: -0.25, max: 0.20 });

  /* Half-width of the range by confidence: [minimum, maximum]. */
  const SPREAD = Object.freeze({ high: [0.07, 0.15], medium: [0.09, 0.18], low: [0.12, 0.22] });
  const QUARTILE_SHRINK = 0.6; // quartiles describe all properties; the adjustments already position this one

  /* Belgium: reference surfaces (m²) of a typical sold property, and elasticity of price to size. */
  const BE_REFERENCE_M2 = Object.freeze({ apartment: 85, house_closed: 135, house_open: 185 });
  const BE_SIZE_ELASTICITY = 0.75;
  const BE_TYPE_KEY = Object.freeze({ apartment: 'A', house_closed: 'M23', house_open: 'M4' });

  const MIN_SALES = 10;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round(v, step) { return Math.round(v / step) * step; }
  function median(values) {
    const s = values.filter(isNum).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* ---------------- Validation ---------------- */
  function validate(input) {
    const errors = [];
    const x = input || {};
    if (!MARKETS.includes(x.market)) errors.push('market');
    if (typeof x.communeCode !== 'string' || !x.communeCode) errors.push('commune');
    if (!MARKETS.includes(x.market) || !TYPES[x.market].includes(x.type)) errors.push('type');
    if (!isNum(x.surface) || x.surface < 9 || x.surface > 2000) errors.push('surface');
    if (x.askingPrice != null && (!isNum(x.askingPrice) || x.askingPrice < 10000 || x.askingPrice > 50000000)) errors.push('askingPrice');
    return errors;
  }

  /* ---------------- Adjustments ---------------- */
  function adjustments(input) {
    const list = [];
    const isApartment = input.type === 'apartment';
    const add = (key, pct) => { if (pct) list.push({ key, pct }); };

    // Luxembourg new-build apartments are priced from the VEFA statistic, not adjusted.
    const newBuildLu = input.market === 'LU' && isApartment && input.newBuild === true;
    if (!newBuildLu) add('condition', ADJUSTMENTS.condition[input.condition] || 0);
    add('energy', ADJUSTMENTS.energy[String(input.energy || '').toUpperCase()] || 0);

    const f = input.features || {};
    let outdoor = 0;
    if (isApartment) {
      if (f.balcony) outdoor += ADJUSTMENTS.balcony;
      if (f.terrace) outdoor += ADJUSTMENTS.terrace;
      if (f.garden) outdoor += ADJUSTMENTS.garden_apartment;
      add('outdoor', Math.min(outdoor, ADJUSTMENTS.outdoor_cap));
      if (f.parking) add('parking', ADJUSTMENTS.parking);
      // Floor is optional: only a real number counts (null / '' must not read as ground floor).
      const floor = typeof input.floor === 'number' && isFinite(input.floor) ? input.floor : null;
      if (floor === 0) add('ground_floor', ADJUSTMENTS.ground_floor);
      else if (floor >= 3 && input.lift === false) add('high_floor_no_lift', ADJUSTMENTS.high_floor_no_lift);
    } else {
      if (f.pool) add('pool', ADJUSTMENTS.pool);
      if (f.parking) add('parking', ADJUSTMENTS.parking);
    }
    if (f.view) add('view', ADJUSTMENTS.view);

    const raw = list.reduce((s, a) => s + a.pct, 0);
    const total = clamp(raw, TOTAL_ADJUSTMENT.min, TOTAL_ADJUSTMENT.max);
    return { list, total, capped: total !== raw };
  }

  function spreadFrom(p25, p50, p75, confidence) {
    const [lo, hi] = SPREAD[confidence];
    const down = isNum(p25) && isNum(p50) && p50 > 0 ? (1 - p25 / p50) * QUARTILE_SHRINK : lo;
    const up = isNum(p75) && isNum(p50) && p50 > 0 ? (p75 / p50 - 1) * QUARTILE_SHRINK : lo;
    return { down: clamp(down, lo, hi), up: clamp(up, lo, hi) };
  }

  /* ---------------- France ---------------- */
  function frDepartmentOf(code) { return /^97/.test(code) ? code.slice(0, 3) : code.slice(0, 2); }

  function frPick(values, latest) {
    for (const period of [latest, '2024-2025']) {
      const e = values && values[period];
      if (e && isNum(e[2]) && e[0] >= MIN_SALES) return { period, n: e[0], p25: e[1], p50: e[2], p75: e[3] };
    }
    return null;
  }

  async function baseFrance(input, load) {
    const index = await load('market-data/fr/index.json');
    const dep = frDepartmentOf(input.communeCode);
    if ((index.notUnderDvf || []).includes(dep)) return { unavailable: 'not_under_dvf' };
    const key = input.type === 'apartment' ? 'A' : 'M';
    let commune = null;
    try {
      const file = await load(`market-data/fr/dep/${dep}.json`);
      commune = (file.communes || []).find(c => c.c === input.communeCode) || null;
    } catch (_) { commune = null; }
    const depInfo = index.departments && index.departments[dep];
    if (!depInfo && !commune) return { unavailable: index.notUnderDvf && index.notUnderDvf.includes(dep) ? 'not_under_dvf' : 'no_data' };

    let pick = commune && frPick(commune[key], index.latest);
    let level = 'commune';
    let name = commune && commune.n;
    if (!pick && depInfo) {
      pick = frPick(depInfo[key], index.latest);
      level = 'department';
      name = depInfo.name;
    }
    if (!pick) return { unavailable: 'no_data' };
    const confidence = level === 'department' ? 'low' : pick.n >= 30 ? 'high' : 'medium';
    return {
      unit: 'eur_m2', perM2: pick.p50, p25: pick.p25, p50: pick.p50, p75: pick.p75,
      basis: { level, name, n: pick.n, period: pick.period, source: index.source },
      confidence,
      value: pick.p50 * input.surface
    };
  }

  /* ---------------- Belgium ---------------- */
  function bePick(entry, typeKey, year) {
    const e = entry && entry[typeKey] && entry[typeKey][year];
    return e && isNum(e[2]) ? { n: e[0], p25: e[1], p50: e[2], p75: e[3] } : null;
  }

  async function baseBelgium(input, load) {
    const data = await load('market-data/be/index.json');
    const byCode = new Map();
    Object.values(data.levels || {}).forEach(level => level.forEach(x => byCode.set(x.c, x)));
    const typeKey = BE_TYPE_KEY[input.type];
    const year = data.latestYear;
    const levelNames = ['commune', 'arrondissement', 'province', 'region'];

    let node = byCode.get(input.communeCode);
    if (!node) return { unavailable: 'no_data' };
    let pick = null;
    let level = null;
    let depth = 0;
    while (node && !pick) {
      pick = bePick(node, typeKey, year);
      if (!pick) { node = byCode.get(node.p); depth += 1; } else { level = levelNames[Math.min(depth, 3)]; }
    }
    if (!pick) return { unavailable: 'no_data' };

    const reference = BE_REFERENCE_M2[input.type];
    const sizeFactor = clamp(Math.pow(input.surface / reference, BE_SIZE_ELASTICITY), 0.5, 2.2);
    const confidence = level === 'commune' && pick.n >= 50 ? 'medium' : 'low';
    return {
      unit: 'eur_total', p25: pick.p25, p50: pick.p50, p75: pick.p75,
      sizeFactor, referenceSurface: reference,
      basis: { level, name: node.n, n: pick.n, period: String(year), source: data.source },
      confidence,
      value: pick.p50 * sizeFactor
    };
  }

  /* ---------------- Luxembourg ---------------- */
  function luLatest(values) {
    if (!values) return null;
    const keys = Object.keys(values);
    const rolling = keys.find(k => !/^\d{4}$/.test(k));
    // Only recent figures: the rolling 12 months and the last two calendar years.
    const years = keys.filter(k => /^\d{4}$/.test(k)).sort().reverse();
    const recent = years.filter(y => Number(y) >= Number(years[0]) - 1);
    const ordered = (rolling ? [rolling] : []).concat(recent);
    for (const k of ordered) {
      const e = values[k];
      if (e && isNum(e[1]) && (e[0] == null || e[0] >= MIN_SALES)) return { period: k, n: e[0], m2: e[1], lo: e[3], hi: e[4] };
    }
    return null;
  }

  function luAskToSoldRatio(data) {
    const ratios = [];
    Object.values(data.communes || {}).forEach(c => {
      const sold = luLatest(c.reg && c.reg.A);
      const asked = luLatest(c.ask && c.ask.A);
      if (sold && asked && sold.n >= 20 && sold.m2 && asked.m2) ratios.push(sold.m2 / asked.m2);
    });
    return clamp(median(ratios) || 0.85, 0.6, 1);
  }

  async function baseLuxembourg(input, load) {
    const data = await load('market-data/lu/index.json');
    const commune = (data.communes || {})[input.communeCode];
    if (!commune) return { unavailable: 'no_data' };
    const siblings = Object.values(data.communes).filter(c => c.canton === commune.canton);

    if (input.type === 'apartment') {
      const seg = input.newBuild ? 'N' : 'A';
      let pick = luLatest(commune.reg && commune.reg[seg]);
      let level = 'commune';
      let name = commune.n;
      if (!pick) {
        const m2 = median(siblings.map(c => (luLatest(c.reg && c.reg[seg]) || {}).m2));
        if (isNum(m2)) { pick = { period: '12 mois', n: null, m2, lo: null, hi: null }; level = 'canton'; name = commune.canton; }
      }
      if (!pick) {
        const nat = luLatest(data.national && data.national.LU && data.national.LU.reg && data.national.LU.reg[seg]);
        if (nat) { pick = nat; level = 'country'; name = 'Luxembourg'; }
      }
      if (!pick) return { unavailable: 'no_data' };
      const confidence = level === 'commune' ? (pick.n >= 30 ? 'high' : 'medium') : 'low';
      return {
        unit: 'eur_m2', perM2: pick.m2,
        // The Observatoire range is the spread of all transactions; use it like quartiles.
        p25: isNum(pick.lo) ? pick.m2 - (pick.m2 - pick.lo) / 2 : null,
        p50: pick.m2,
        p75: isNum(pick.hi) ? pick.m2 + (pick.hi - pick.m2) / 2 : null,
        basis: { level, name, n: pick.n, period: pick.period, source: data.source, segment: seg === 'N' ? 'new_build' : 'existing' },
        confidence,
        value: pick.m2 * input.surface
      };
    }

    // Houses: advertised €/m² × advertised→sold ratio measured on apartments.
    const ratio = luAskToSoldRatio(data);
    let asked = luLatest(commune.ask && commune.ask.M);
    let level = 'commune';
    let name = commune.n;
    if (!asked) {
      const m2 = median(siblings.map(c => (luLatest(c.ask && c.ask.M) || {}).m2));
      if (isNum(m2)) { asked = { period: '12 mois', n: null, m2 }; level = 'canton'; name = commune.canton; }
    }
    if (!asked) return { unavailable: 'no_data' };
    const perM2 = asked.m2 * ratio;
    return {
      unit: 'eur_m2', perM2, p25: null, p50: perM2, p75: null, askToSold: ratio,
      basis: { level, name, n: asked.n, period: asked.period, source: data.source, segment: 'advertised_houses' },
      confidence: level === 'commune' ? 'medium' : 'low',
      value: perM2 * input.surface
    };
  }

  /* Human period label: "12 mois au 2026T2" → "12 months to Q2 2026" / "12 mois jusqu’au T2 2026". */
  function formatPeriod(period, lang) {
    const p = String(period || '');
    let m = p.match(/^12 mois au (\d{4})T([1-4])$/);
    if (m) return lang === 'fr' ? `12 mois jusqu’au T${m[2]} ${m[1]}` : `12 months to Q${m[2]} ${m[1]}`;
    m = p.match(/^12 mois \((\d{2}\/\d{4})-(\d{2}\/\d{4})\)$/);
    if (m) return lang === 'fr' ? `12 mois (${m[1]} – ${m[2]})` : `12 months (${m[1]} – ${m[2]})`;
    if (p === '12 mois') return lang === 'fr' ? '12 derniers mois' : 'last 12 months';
    return p;
  }

  /* ---------------- Public API ---------------- */
  function buyerPosition(askingPrice, low, central, high) {
    if (!isNum(askingPrice)) return null;
    const deltaPct = (askingPrice - central) / central;
    let position = 'within';
    if (askingPrice < low) position = 'below';
    else if (askingPrice > high) position = 'above';
    return { askingPrice, deltaPct, position };
  }

  async function estimate(input, load) {
    const errors = validate(input);
    if (errors.length) return { ok: false, errors };
    const base = input.market === 'FR' ? await baseFrance(input, load)
      : input.market === 'BE' ? await baseBelgium(input, load)
      : await baseLuxembourg(input, load);
    if (base.unavailable) return { ok: false, errors: [base.unavailable] };

    const adj = adjustments(input);
    const central = base.value * (1 + adj.total);
    const spread = spreadFrom(base.p25, base.p50, base.p75, base.confidence);
    const step = central >= 1000000 ? 10000 : 5000;
    const result = {
      ok: true,
      market: input.market,
      central: round(central, step),
      low: round(central * (1 - spread.down), step),
      high: round(central * (1 + spread.up), step),
      perM2: Math.round(central / input.surface),
      confidence: base.confidence,
      basis: base.basis,
      unit: base.unit,
      adjustments: adj.list,
      adjustmentTotal: adj.total,
      adjustmentCapped: adj.capped,
      model: {
        sizeFactor: base.sizeFactor || null,
        referenceSurface: base.referenceSurface || null,
        askToSold: base.askToSold || null,
        baseValue: Math.round(base.value)
      }
    };
    result.buyer = buyerPosition(input.askingPrice, result.low, result.central, result.high);
    return result;
  }

  return Object.freeze({
    MARKETS, TYPES, ADJUSTMENTS, TOTAL_ADJUSTMENT, SPREAD, BE_REFERENCE_M2, BE_SIZE_ELASTICITY,
    validate, estimate, formatPeriod,
    _internals: Object.freeze({ adjustments, spreadFrom, buyerPosition, luAskToSoldRatio, frDepartmentOf, median })
  });
});
