/* ============================================================
   Z FIND — MARKET PRICES (public market pages FR / BE / LU)

   Reads the static market-data files published with the site
   (apps/zfind-web/public/market-data, built by
   apps/find/scripts/market-data/build_market_data.py) and renders an
   official price section on the market page:
     FR  DVF (DGFiP) — median €/m² by department and commune
     BE  Statbel — median sale price by province and commune
     LU  Observatoire de l'Habitat — €/m² by commune (registered and
         advertised) and Luxembourg-City districts (advertised)

   Aggregated official statistics only: no individual sale is shown.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.marketPrices = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const BASE = '/market-data/';
  const SUPPORTED = Object.freeze(['FR', 'BE', 'LU']);
  const MAX_ROWS = 60;

  const COPY = Object.freeze({
    fr: Object.freeze({
      title: 'Prix de l’immobilier',
      loading: 'Chargement des prix…',
      error: 'Les prix de ce marché sont momentanément indisponibles.',
      filter: 'Filtrer par commune',
      chooseDep: 'Choisir un département',
      chooseProv: 'Choisir une province ou région',
      commune: 'Commune',
      apartments: 'Appartements',
      houses: 'Maisons',
      sales: 'ventes',
      adverts: 'annonces',
      noData: '—',
      frLead: year => `Prix de vente au m² constatés en ${year} (médiane), d’après les ventes enregistrées par l’administration fiscale.`,
      frNational: 'France entière',
      frMissing: 'Les ventes du Bas-Rhin, du Haut-Rhin, de la Moselle et de Mayotte ne figurent pas dans la base DVF.',
      beLead: year => `Prix de vente médians en ${year}, d’après les actes de vente enregistrés (prix total, pas au m²).`,
      beNational: 'Belgique',
      beSemester: s => `Dernier semestre publié : ${s}`,
      luLead: 'Prix au m² sur les 12 derniers mois : ventes enregistrées (actes notariés) et prix annoncés.',
      luExisting: 'Appart. existants (ventes)',
      luNew: 'Appart. neufs VEFA (ventes)',
      luAskA: 'Appart. (annonces)',
      luAskM: 'Maisons (annonces)',
      luDistricts: 'Luxembourg-Ville — prix annoncés par quartier',
      district: 'Quartier',
      perM2: '/m²',
      medianM2: 'm² médian',
      median: 'médiane',
      source: 'Source',
      colon: ' : ',
      period: 'Période',
      median12: '12 mois'
    }),
    en: Object.freeze({
      title: 'Property prices',
      loading: 'Loading prices…',
      error: 'Prices for this market are temporarily unavailable.',
      filter: 'Filter by municipality',
      chooseDep: 'Choose a department',
      chooseProv: 'Choose a province or region',
      commune: 'Municipality',
      apartments: 'Apartments',
      houses: 'Houses',
      sales: 'sales',
      adverts: 'adverts',
      noData: '—',
      frLead: year => `Median sale price per m² in ${year}, from sales recorded by the French tax administration.`,
      frNational: 'All of France',
      frMissing: 'Sales in Bas-Rhin, Haut-Rhin, Moselle and Mayotte are not included in the DVF database.',
      beLead: year => `Median sale prices in ${year}, from registered deeds of sale (total price, not per m²).`,
      beNational: 'Belgium',
      beSemester: s => `Latest published half-year: ${s}`,
      luLead: 'Price per m² over the last 12 months: registered sales (notarial deeds) and advertised prices.',
      luExisting: 'Existing apartments (sales)',
      luNew: 'New-build apartments (sales)',
      luAskA: 'Apartments (adverts)',
      luAskM: 'Houses (adverts)',
      luDistricts: 'Luxembourg City — advertised prices by district',
      district: 'District',
      perM2: '/m²',
      medianM2: 'median m²',
      median: 'median',
      source: 'Source',
      colon: ': ',
      period: 'Period',
      median12: '12 months'
    })
  });

  function copyFor(lang) {
    return COPY[lang] || COPY.en;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(value, lang) {
    if (value == null) return null;
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { maximumFractionDigits: 0 }).format(value);
  }

  function money(value, lang, suffix) {
    const n = fmt(value, lang);
    return n == null ? null : (lang === 'fr' ? `${n} €${suffix || ''}` : `€${n}${suffix || ''}`);
  }

  const cache = new Map();
  function load(path) {
    if (!cache.has(path)) {
      cache.set(path, fetch(BASE + path, { credentials: 'omit' }).then(r => {
        if (!r.ok) throw new Error('market-data ' + r.status);
        return r.json();
      }).catch(err => { cache.delete(path); throw err; }));
    }
    return cache.get(path);
  }

  function cell(entry, lang, c, unitSuffix, countLabel) {
    if (!entry || entry[2] == null) return `<td class="mp-num mp-empty">${c.noData}</td>`;
    const count = entry[0] != null ? `<small>${fmt(entry[0], lang)} ${countLabel}</small>` : '';
    return `<td class="mp-num"><strong>${money(entry[2], lang, unitSuffix)}</strong>${count}</td>`;
  }

  function sourceLine(c, source, period) {
    return `<p class="mp-source">${c.source}${c.colon}${esc(source)}${period ? ` · ${c.period}${c.colon}${esc(period)}` : ''}</p>`;
  }

  function shell(root, c, inner) {
    root.innerHTML = `
      <div class="block-head"><div><span class="eyebrow">${c.title}</span></div></div>
      <div class="market-prices" data-market-prices>${inner}</div>`;
  }

  /* ---------------- France ---------------- */
  function pickFr(values, latest) {
    if (values && values[latest] && values[latest][2] != null) return values[latest];
    return values ? values['2024-2025'] || null : null;
  }

  async function renderFrance(root, lang, c) {
    const index = await load('fr/index.json');
    const latest = index.latest;
    const deps = Object.entries(index.departments)
      .map(([code, d]) => ({ code, name: d.name }))
      .sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
    const nat = index.national || {};
    shell(root, c, `
      <p class="mp-lead">${c.frLead(esc(latest))}</p>
      <div class="mp-summary">
        <div><span>${c.frNational} · ${c.apartments}</span><strong>${money((nat.A && nat.A[latest] || [])[2], lang, c.perM2) || c.noData}</strong></div>
        <div><span>${c.frNational} · ${c.houses}</span><strong>${money((nat.M && nat.M[latest] || [])[2], lang, c.perM2) || c.noData}</strong></div>
      </div>
      <div class="mp-controls">
        <select data-mp-dep aria-label="${c.chooseDep}">
          <option value="">${c.chooseDep}</option>
          ${deps.map(d => `<option value="${esc(d.code)}">${esc(d.code)} — ${esc(d.name)}</option>`).join('')}
        </select>
        <input type="search" data-mp-filter placeholder="${c.filter}" aria-label="${c.filter}" disabled>
      </div>
      <div data-mp-results></div>
      <p class="mp-note">${c.frMissing}</p>
      ${sourceLine(c, index.source, latest)}`);

    const select = root.querySelector('[data-mp-dep]');
    const filter = root.querySelector('[data-mp-filter]');
    const results = root.querySelector('[data-mp-results]');
    let communes = [];

    function draw() {
      const q = (filter.value || '').trim().toLowerCase();
      const dep = index.departments[select.value];
      const rows = communes
        // Paris is both a department and a commune: the department row already shows it.
        .filter(x => !(select.value === '75' && x.c === '75056'))
        .filter(x => !q || x.n.toLowerCase().includes(q))
        .sort((a, b) => ((pickFr(b.A, latest) || [0])[0] + (pickFr(b.M, latest) || [0])[0]) -
                        ((pickFr(a.A, latest) || [0])[0] + (pickFr(a.M, latest) || [0])[0]))
        .slice(0, MAX_ROWS);
      results.innerHTML = `
        <table class="mp-table">
          <thead><tr><th>${c.commune}</th><th>${c.apartments} · ${c.medianM2}</th><th>${c.houses} · ${c.medianM2}</th></tr></thead>
          <tbody>
            ${dep ? `<tr class="mp-total"><td>${esc(dep.name)}</td>${cell(dep.A[latest], lang, c, c.perM2, c.sales)}${cell(dep.M[latest], lang, c, c.perM2, c.sales)}</tr>` : ''}
            ${rows.map(x => `<tr><td>${esc(x.n)}</td>${cell(pickFr(x.A, latest), lang, c, c.perM2, c.sales)}${cell(pickFr(x.M, latest), lang, c, c.perM2, c.sales)}</tr>`).join('')}
          </tbody>
        </table>`;
    }

    select.addEventListener('change', async () => {
      communes = [];
      filter.value = '';
      filter.disabled = !select.value;
      if (!select.value) { results.innerHTML = ''; return; }
      results.innerHTML = `<p class="mp-loading">${c.loading}</p>`;
      try {
        communes = (await load(`fr/dep/${encodeURIComponent(select.value)}.json`)).communes || [];
      } catch (_) {
        communes = [];
      }
      draw();
    });
    filter.addEventListener('input', draw);
  }

  /* ---------------- Belgium ---------------- */
  async function renderBelgium(root, lang, c) {
    const data = await load('be/index.json');
    const year = data.latestYear;
    const levels = data.levels || {};
    const groups = [...(levels.province || []), ...(levels.region || []).filter(r => r.c === '4000')];
    const nat = (levels.pays || [])[0];
    shell(root, c, `
      <p class="mp-lead">${c.beLead(esc(year))}</p>
      <div class="mp-summary">
        <div><span>${c.beNational} · ${c.houses}</span><strong>${money(nat && nat.M[year] && nat.M[year][2], lang) || c.noData}</strong></div>
        <div><span>${c.beNational} · ${c.apartments}</span><strong>${money(nat && nat.A[year] && nat.A[year][2], lang) || c.noData}</strong></div>
      </div>
      <div class="mp-controls">
        <select data-mp-prov aria-label="${c.chooseProv}">
          <option value="">${c.chooseProv}</option>
          ${groups.map(g => `<option value="${esc(g.c)}">${esc(g.n)}</option>`).join('')}
        </select>
        <input type="search" data-mp-filter placeholder="${c.filter}" aria-label="${c.filter}" disabled>
      </div>
      <div data-mp-results></div>
      ${data.latestSemester ? `<p class="mp-note">${c.beSemester(esc(data.latestSemester))}</p>` : ''}
      ${sourceLine(c, data.source, year)}`);

    const select = root.querySelector('[data-mp-prov]');
    const filter = root.querySelector('[data-mp-filter]');
    const results = root.querySelector('[data-mp-results]');
    const arrParent = Object.fromEntries((levels.arrondissement || []).map(a => [a.c, a.p]));

    function inGroup(commune, group) {
      const arr = commune.p;
      return arr === group || arrParent[arr] === group;
    }

    function draw() {
      const group = select.value;
      if (!group) { results.innerHTML = ''; return; }
      const q = (filter.value || '').trim().toLowerCase();
      const head = groups.find(g => g.c === group);
      const rows = (levels.commune || [])
        .filter(x => inGroup(x, group) && (!q || x.n.toLowerCase().includes(q)))
        .slice(0, 400);
      results.innerHTML = `
        <table class="mp-table">
          <thead><tr><th>${c.commune}</th><th>${c.houses} · ${c.median}</th><th>${c.apartments} · ${c.median}</th></tr></thead>
          <tbody>
            ${head ? `<tr class="mp-total"><td>${esc(head.n)}</td>${cell(head.M[year], lang, c, '', c.sales)}${cell(head.A[year], lang, c, '', c.sales)}</tr>` : ''}
            ${rows.map(x => `<tr><td>${esc(x.n)}</td>${cell(x.M[year], lang, c, '', c.sales)}${cell(x.A[year], lang, c, '', c.sales)}</tr>`).join('')}
          </tbody>
        </table>`;
    }

    select.addEventListener('change', () => {
      filter.value = '';
      filter.disabled = !select.value;
      draw();
    });
    filter.addEventListener('input', draw);
  }

  /* ---------------- Luxembourg ---------------- */
  function last12(values) {
    if (!values) return null;
    const key = Object.keys(values).find(k => !/^\d{4}$/.test(k));
    return key ? values[key] : null;
  }

  function luCell(entry, lang, c, countLabel) {
    if (!entry || entry[1] == null) return `<td class="mp-num mp-empty">${c.noData}</td>`;
    const count = entry[0] != null ? `<small>${fmt(entry[0], lang)} ${countLabel}</small>` : '';
    return `<td class="mp-num"><strong>${money(entry[1], lang, c.perM2)}</strong>${count}</td>`;
  }

  async function renderLuxembourg(root, lang, c) {
    const data = await load('lu/index.json');
    const communes = Object.values(data.communes || {})
      .sort((a, b) => ((last12(b.reg.A) || [0])[0] || 0) - ((last12(a.reg.A) || [0])[0] || 0));
    const nat = (data.national || {}).LU || { reg: {}, ask: {} };
    const districts = Object.entries(data.districts || {}).sort((a, b) => a[0].localeCompare(b[0], 'fr'));
    shell(root, c, `
      <p class="mp-lead">${c.luLead}</p>
      <div class="mp-summary">
        <div><span>Luxembourg · ${c.luExisting}</span><strong>${money((last12(nat.reg.A) || [])[1], lang, c.perM2) || c.noData}</strong></div>
        <div><span>Luxembourg · ${c.luNew}</span><strong>${money((last12(nat.reg.N) || [])[1], lang, c.perM2) || c.noData}</strong></div>
      </div>
      <div class="mp-controls">
        <input type="search" data-mp-filter placeholder="${c.filter}" aria-label="${c.filter}">
      </div>
      <div data-mp-results></div>
      ${districts.length ? `
        <h3 class="mp-subtitle">${c.luDistricts}</h3>
        <table class="mp-table">
          <thead><tr><th>${c.district}</th><th>${c.luAskA}</th><th>${c.luAskM}</th></tr></thead>
          <tbody>${districts.map(([name, d]) => `<tr><td>${esc(name)}</td>${luCell(last12(d.ask.A), lang, c, c.adverts)}${luCell(last12(d.ask.M), lang, c, c.adverts)}</tr>`).join('')}</tbody>
        </table>` : ''}
      ${sourceLine(c, data.source, c.median12)}`);

    const filter = root.querySelector('[data-mp-filter]');
    const results = root.querySelector('[data-mp-results]');
    function draw() {
      const q = (filter.value || '').trim().toLowerCase();
      const rows = communes.filter(x => !q || x.n.toLowerCase().includes(q)).slice(0, 100);
      results.innerHTML = `
        <table class="mp-table">
          <thead><tr><th>${c.commune}</th><th>${c.luExisting}</th><th>${c.luNew}</th><th>${c.luAskA}</th><th>${c.luAskM}</th></tr></thead>
          <tbody>${rows.map(x => `<tr><td>${esc(x.n)}</td>${luCell(last12(x.reg.A), lang, c, c.sales)}${luCell(last12(x.reg.N), lang, c, c.sales)}${luCell(last12(x.ask.A), lang, c, c.adverts)}${luCell(last12(x.ask.M), lang, c, c.adverts)}</tr>`).join('')}</tbody>
        </table>`;
    }
    filter.addEventListener('input', draw);
    draw();
  }

  async function render(root, marketKey, lang) {
    if (!root || !SUPPORTED.includes(marketKey)) {
      if (root) root.innerHTML = '';
      return false;
    }
    const c = copyFor(lang);
    root.dataset.marketPricesKey = marketKey;
    shell(root, c, `<p class="mp-loading">${c.loading}</p>`);
    try {
      if (marketKey === 'FR') await renderFrance(root, lang, c);
      else if (marketKey === 'BE') await renderBelgium(root, lang, c);
      else await renderLuxembourg(root, lang, c);
      return true;
    } catch (_) {
      if (root.dataset.marketPricesKey === marketKey) {
        shell(root, c, `<p class="mp-error">${c.error}</p>`);
      }
      return false;
    }
  }

  return Object.freeze({ SUPPORTED, COPY, render, _internals: Object.freeze({ esc, pickFr, last12 }) });
});
