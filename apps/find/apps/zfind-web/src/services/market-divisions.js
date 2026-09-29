/* ============================================================
   Z FIND — MARKET DIVISIONS (public market pages FR / BE / LU)

   "Explore by region" on each launch market page: a drill-down through
   the official administrative divisions, with the official price of
   every level and a link to the properties of each commune.
     FR  région → département → commune (Paris/Lyon/Marseille: arrondissements)
     BE  région → province → arrondissement → commune (Bruxelles: no province)
     LU  canton → commune

   Data: static files in /geo (apps/find/scripts/geography/
   build_public_divisions.py), built from the ZOS reference geography and
   joined with the official price files in /market-data.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.marketDivisions = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const BASE = '/geo/';
  const SUPPORTED = Object.freeze(['FR', 'BE', 'LU']);
  const MAX_ROWS = 400;

  const COPY = Object.freeze({
    fr: Object.freeze({
      title: 'Explorer par région',
      loading: 'Chargement…',
      error: 'Les divisions de ce marché sont momentanément indisponibles.',
      filter: 'Filtrer par commune ou code postal',
      noMatch: 'Aucune commune ne correspond à ce filtre.',
      seeProperties: 'Voir les biens',
      communes: n => `${n} commune${n > 1 ? 's' : ''}`,
      departments: n => `${n} département${n > 1 ? 's' : ''}`,
      provinces: n => `${n} province${n > 1 ? 's' : ''}`,
      arrondissements: 'Arrondissements',
      overseas: 'Outre-mer',
      apartments: 'Appart.',
      houses: 'Maisons',
      perM2: '/m²',
      frLead: 'Choisissez une région, puis un département, pour voir toutes ses communes et leurs prix au m² (médiane des ventes).',
      beLead: 'Choisissez une région, puis une province, pour voir toutes ses communes et leurs prix de vente médians.',
      luLead: 'Choisissez un canton pour voir ses communes, leurs localités et leurs prix au m².',
      flandersNote: 'Le site est pour l’instant disponible en français et en anglais ; les noms officiels néerlandais sont indiqués.',
      priceNote: '— : pas assez de ventes publiées pour un prix fiable.'
    }),
    en: Object.freeze({
      title: 'Explore by region',
      loading: 'Loading…',
      error: 'The divisions of this market are temporarily unavailable.',
      filter: 'Filter by municipality or postcode',
      noMatch: 'No municipality matches this filter.',
      seeProperties: 'See properties',
      communes: n => `${n} municipalit${n > 1 ? 'ies' : 'y'}`,
      departments: n => `${n} department${n > 1 ? 's' : ''}`,
      provinces: n => `${n} province${n > 1 ? 's' : ''}`,
      arrondissements: 'Arrondissements',
      overseas: 'Overseas',
      apartments: 'Apts',
      houses: 'Houses',
      perM2: '/m²',
      frLead: 'Choose a region, then a department, to see all its municipalities and their price per m² (median of sales).',
      beLead: 'Choose a region, then a province, to see all its municipalities and their median sale prices.',
      luLead: 'Choose a canton to see its municipalities, their localities and their price per m².',
      flandersNote: 'The site is currently available in French and English; official Dutch names are shown.',
      priceNote: '—: not enough published sales for a reliable price.'
    })
  });

  const COUNTRY = Object.freeze({ FR: { fr: 'France', en: 'France' }, BE: { fr: 'Belgique', en: 'Belgium' }, LU: { fr: 'Luxembourg', en: 'Luxembourg' } });

  function copyFor(lang) { return COPY[lang] || COPY.en; }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(value, lang, suffix) {
    if (value == null) return '—';
    const n = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { maximumFractionDigits: 0 }).format(value);
    return lang === 'fr' ? `${n} €${suffix || ''}` : `€${n}${suffix || ''}`;
  }

  function fold(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  const cache = new Map();
  function load(path) {
    if (!cache.has(path)) {
      cache.set(path, fetch(BASE + path, { credentials: 'omit' }).then(r => {
        if (!r.ok) throw new Error('geo ' + r.status);
        return r.json();
      }).catch(err => { cache.delete(path); throw err; }));
    }
    return cache.get(path);
  }

  /* Hash link to the market's search, scoped to one place. */
  function searchHref(lang, marketKey, place) {
    const usp = new URLSearchParams({ market: marketKey, transactionType: 'sale', q: place });
    return `#/${lang}/search?${usp.toString()}`;
  }

  function prices(item, lang, c, unit) {
    const suffix = unit === 'eur_m2' ? c.perM2 : '';
    return `<span class="md-prices"><span>${c.apartments} <strong>${money(item.pa, lang, suffix)}</strong></span><span>${c.houses} <strong>${money(item.pm, lang, suffix)}</strong></span></span>`;
  }

  function card(key, title, meta, item, lang, c, unit) {
    return `<button type="button" class="md-card" data-md-go="${esc(key)}">
      <span class="md-card-title">${esc(title)}</span>
      ${meta ? `<span class="md-card-meta">${esc(meta)}</span>` : ''}
      ${item ? prices(item, lang, c, unit) : ''}
    </button>`;
  }

  function communeRow(x, lang, c, unit, marketKey, extra) {
    const cp = (x.cp || []).slice(0, 4).join(', ') + ((x.cp || []).length > 4 ? '…' : '');
    const sub = [cp, extra].filter(Boolean).join(' · ');
    return `<li class="md-row">
      <div class="md-row-main"><strong>${esc(x.n)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
      ${prices(x, lang, c, unit)}
      <a class="md-link" href="${esc(searchHref(lang, marketKey, x.n))}">${c.seeProperties}</a>
    </li>`;
  }

  function matches(x, q) {
    if (!q) return true;
    if (fold(x.n).includes(q) || (x.nl && fold(x.nl).includes(q))) return true;
    if ((x.cp || []).some(cp => cp.startsWith(q))) return true;
    return (x.loc || []).some(l => fold(l).includes(q));
  }

  /* Generic drill-down: `levels` describes the path; the last level lists communes. */
  function mount(root, marketKey, lang, c, lead, note, buildLevel, options) {
    const opts = options || {};
    const path = []; // [{key, label}]
    let restored = !(opts.keys && opts.keys.length);
    root.innerHTML = `
      <div class="block-head"><div><span class="eyebrow">${c.title}</span></div></div>
      <div class="market-divisions" data-market-divisions="${marketKey}">
        <p class="md-lead">${lead}</p>
        <nav class="md-crumbs" aria-label="${c.title}" data-md-crumbs></nav>
        <div data-md-body></div>
        <p class="md-note">${c.priceNote}${note ? ' ' + note : ''}</p>
      </div>`;
    const crumbs = root.querySelector('[data-md-crumbs]');
    const body = root.querySelector('[data-md-body]');

    async function draw() {
      const country = COUNTRY[marketKey][lang] || COUNTRY[marketKey].en;
      if (!restored) {
        // Opened from a link (?div=84.74): rebuild the breadcrumb labels.
        restored = true;
        try {
          const labels = await opts.resolveLabels(opts.keys);
          for (let i = 0; i < opts.keys.length && labels[i]; i += 1) path.push({ key: opts.keys[i], label: labels[i] });
        } catch (_) { path.length = 0; }
      }
      crumbs.innerHTML = [`<button type="button" data-md-crumb="0">${esc(country)}</button>`]
        .concat(path.map((p, i) => i === path.length - 1
          ? `<span aria-current="page">${esc(p.label)}</span>`
          : `<button type="button" data-md-crumb="${i + 1}">${esc(p.label)}</button>`))
        .join('<span class="md-sep" aria-hidden="true">›</span>');
      body.innerHTML = `<p class="md-loading">${c.loading}</p>`;
      if (typeof opts.onPath === 'function') opts.onPath(path.map(p => p.key), path.map(p => p.label));
      try {
        const level = await buildLevel(path.map(p => p.key));
        body.innerHTML = level.html;
        body.querySelectorAll('[data-md-go]').forEach(btn => btn.addEventListener('click', () => {
          const label = btn.querySelector('.md-card-title').textContent;
          path.push({ key: btn.getAttribute('data-md-go'), label });
          draw();
          root.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }));
        const filter = body.querySelector('[data-md-filter]');
        if (filter && level.rows) {
          const list = body.querySelector('[data-md-list]');
          const redraw = () => {
            const q = fold(filter.value.trim());
            const html = level.rows.filter(r => matches(r.item, q)).slice(0, MAX_ROWS).map(r => r.html).join('');
            list.innerHTML = html || `<li class="md-empty">${c.noMatch}</li>`;
          };
          filter.addEventListener('input', redraw);
          redraw();
        }
      } catch (_) {
        body.innerHTML = `<p class="md-error">${c.error}</p>`;
      }
    }

    crumbs.addEventListener('click', event => {
      const btn = event.target.closest('[data-md-crumb]');
      if (!btn) return;
      path.length = Number(btn.getAttribute('data-md-crumb'));
      draw();
    });
    draw();
  }

  function communeList(c, rows, groups) {
    return {
      html: `<input type="search" class="md-filter" data-md-filter placeholder="${c.filter}" aria-label="${c.filter}">
             ${groups || ''}<ul class="md-list" data-md-list></ul>`,
      rows
    };
  }

  /* ---------------- France ---------------- */
  function france(root, lang, c, options) {
    const resolveLabels = async keys => {
      const index = await load('fr/index.json');
      const name = r => (lang === 'fr' ? r.n : r.en || r.n);
      const region = index.regions.find(r => r.c === keys[0]);
      const dep = region && keys[1] ? region.deps.find(d => d.c === keys[1]) : null;
      return [region && name(region), dep && `${dep.c} — ${name(dep)}`].slice(0, keys.length);
    };
    mount(root, 'FR', lang, c, c.frLead, '', async keys => {
      const index = await load('fr/index.json');
      const unit = index.priceUnit;
      const name = r => (lang === 'fr' ? r.n : r.en || r.n);
      if (keys.length === 0) {
        const cards = list => list.map(r => card(r.c, name(r), c.departments(r.deps.length), null, lang, c, unit)).join('');
        const metro = index.regions.filter(r => !r.overseas);
        const dom = index.regions.filter(r => r.overseas);
        return { html: `<div class="md-grid">${cards(metro)}</div>
          <h3 class="md-subtitle">${c.overseas}</h3><div class="md-grid">${cards(dom)}</div>` };
      }
      const region = index.regions.find(r => r.c === keys[0]);
      if (keys.length === 1) {
        return { html: `<div class="md-grid">${region.deps.map(d =>
          card(d.c, `${d.c} — ${name(d)}`, c.communes(d.count), d, lang, c, unit)).join('')}</div>` };
      }
      const dep = await load(`fr/dep/${encodeURIComponent(keys[1])}.json`);
      const rows = [];
      dep.communes.forEach(x => {
        rows.push({ item: x, html: communeRow(x, lang, c, unit, 'FR') });
        (x.arr || []).forEach(a => rows.push({ item: a, html: communeRow(a, lang, c, unit, 'FR', x.n) }));
      });
      return communeList(c, rows);
    }, Object.assign({ resolveLabels }, options));
  }

  /* ---------------- Belgium ---------------- */
  function belgium(root, lang, c, options) {
    const resolveLabels = async keys => {
      const data = await load('be.json');
      const name = r => (lang === 'fr' ? r.n : r.en || r.n);
      const region = data.regions.find(r => r.c === keys[0]);
      const province = region && keys[1] ? region.provinces.find(p => p.c === keys[1]) : null;
      return [region && name(region), province && name(province)].slice(0, keys.length);
    };
    mount(root, 'BE', lang, c, c.beLead, c.flandersNote, async keys => {
      const data = await load('be.json');
      const unit = data.priceUnit;
      const name = r => (lang === 'fr' ? r.n : r.en || r.n);
      const communeRows = arrs => arrs.flatMap(a => a.communes.map(x => ({
        item: x,
        html: communeRow(x, lang, c, unit, 'BE', [x.nl && x.nl !== x.n ? x.nl : '',
          arrs.length > 1 ? a.n.replace(/^Arrondissement (de |d’|d')/, '') : ''].filter(Boolean).join(' · '))
      })));
      if (keys.length === 0) {
        return { html: `<div class="md-grid">${data.regions.map(r => {
          const n = r.provinces.filter(p => p.c).length;
          return card(r.c, name(r), n ? c.provinces(n) : c.communes(r.provinces[0].arrondissements[0].communes.length), r, lang, c, unit);
        }).join('')}</div>` };
      }
      const region = data.regions.find(r => r.c === keys[0]);
      // Brussels-Capital has no province: go straight to its communes.
      if (keys.length === 1 && region.provinces.length === 1 && !region.provinces[0].c) {
        return communeList(c, communeRows(region.provinces[0].arrondissements));
      }
      if (keys.length === 1) {
        return { html: `<div class="md-grid">${region.provinces.map(p => {
          const n = p.arrondissements.reduce((s, a) => s + a.communes.length, 0);
          return card(p.c, name(p), c.communes(n), p, lang, c, unit);
        }).join('')}</div>` };
      }
      const province = region.provinces.find(p => p.c === keys[1]);
      return communeList(c, communeRows(province.arrondissements));
    }, Object.assign({ resolveLabels }, options));
  }

  /* ---------------- Luxembourg ---------------- */
  function luxembourg(root, lang, c, options) {
    const resolveLabels = async keys => {
      const data = await load('lu.json');
      const canton = data.cantons.find(k => k.c === keys[0]);
      return [canton && canton.n].slice(0, keys.length);
    };
    mount(root, 'LU', lang, c, c.luLead, '', async keys => {
      const data = await load('lu.json');
      const unit = data.priceUnit;
      if (keys.length === 0) {
        return { html: `<div class="md-grid">${data.cantons.map(k =>
          card(k.c, k.n, c.communes(k.communes.length), null, lang, c, unit)).join('')}</div>` };
      }
      const canton = data.cantons.find(k => k.c === keys[0]);
      const rows = [];
      canton.communes.forEach(x => {
        const extra = x.n === 'Luxembourg' ? (data.districts || []).join(', ') : (x.loc || []).join(', ');
        rows.push({ item: Object.assign({}, x, { loc: x.n === 'Luxembourg' ? data.districts : x.loc }),
                    html: communeRow(Object.assign({}, x, { cp: [] }), lang, c, unit, 'LU', extra) });
      });
      return communeList(c, rows);
    }, Object.assign({ resolveLabels }, options));
  }

  /* Division path from the URL (?div=84.74): only codes, at most three levels. */
  function parsePath(value) {
    return String(value || '').split('.').filter(k => /^[A-Za-z0-9-]{1,20}$/.test(k)).slice(0, 3);
  }

  function render(root, marketKey, lang, options) {
    if (!root || !SUPPORTED.includes(marketKey)) {
      if (root) root.innerHTML = '';
      return false;
    }
    const c = copyFor(lang);
    const opts = Object.assign({}, options || {}, { keys: parsePath(options && options.path) });
    if (marketKey === 'FR') france(root, lang, c, opts);
    else if (marketKey === 'BE') belgium(root, lang, c, opts);
    else luxembourg(root, lang, c, opts);
    return true;
  }

  return Object.freeze({ SUPPORTED, COPY, render, _internals: Object.freeze({ esc, fold, matches, searchHref, parsePath }) });
});
