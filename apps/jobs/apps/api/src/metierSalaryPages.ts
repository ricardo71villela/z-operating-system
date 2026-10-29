// apps/api/src/metierSalaryPages.ts
//
// Pages « salaire par métier » de zjobs.online (réécritures de la montra), en
// français, à partir de l'Insee (Base Tous salariés 2023, fichier détail Postes,
// échantillon au 1/12 ; src/data/inseeMetiers2023.ts, généré par
// apps/jobs/tools/build-insee-metiers.mjs) :
//
//   /salaire                                         toutes les professions
//   /salaire/<métier>-<pcs>                          une profession (France)
//   /salaire/<métier>-<pcs>/<département>-<code>     une profession dans un département
//   /salaire/departement/<département>-<code>        les professions d'un département
//
// Champ : postes à temps complet, présents toute l'année, emplois ordinaires.
// L'Insee ne diffuse que des tranches de salaire brut annuel : les quartiles
// sont interpolés dans la tranche, et au-delà de 50 000 € (tranche ouverte) la
// page dit « 50 000 € ou plus » au lieu d'inventer un chiffre. Le net est une
// estimation aux taux usuels (22 % non-cadre, 25 % cadre), annoncée comme telle.
// Pas de version anglaise : la nomenclature des professions (PCS) est française.

import { METIER_ALL, METIER_CELLS, METIER_DEPARTMENTS, METIER_GROUPS, METIER_PROFESSIONS } from './data/inseeMetiers2023';
import { CITY_STYLE, SITE, esc, head, navHtml, shortText, slugify } from './publicPages';
import { FR_RATES } from './salaryPages';

const YEAR = 2023;
export const METIER_SOURCE_URL = 'https://www.insee.fr/fr/statistiques/8730395';
/** Bornes des tranches TRBRUTT 00 … 23 (salaire brut annuel, €). */
export const TRBRUTT_BOUNDS = Object.freeze([0, 200, 500, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000, 26000, 28000, 30000, 35000, 40000, 50000, Infinity]);
export const OPEN_FROM = 50000;

type Hist = number[];
const parse = (s: string): Hist => s.split(',').map(Number);
const total = (h: Hist) => h.reduce((a, x) => a + x, 0);

/** Quantile p du salaire brut annuel ; null si dans la tranche ouverte (≥ 50 000 €). */
export function quantile(h: Hist, p: number): number | null {
  const target = p * total(h);
  let cum = 0;
  for (let i = 0; i < h.length; i++) {
    if (h[i] && cum + h[i] >= target) {
      const lo = TRBRUTT_BOUNDS[i], hi = TRBRUTT_BOUNDS[i + 1];
      if (!Number.isFinite(hi)) return null;
      return lo + ((target - cum) / h[i]) * (hi - lo);
    }
    cum += h[i];
  }
  return null;
}
function shareFrom(h: Hist, from: number): number { const i = TRBRUTT_BOUNDS.indexOf(from); return total(h.slice(i)) / total(h); }

export interface Profession { pcs: string; label: string; hist: Hist; n: number; median: number | null; q1: number | null; q3: number | null }
function profession(pcs: string, label: string, s: string): Profession {
  const hist = parse(s);
  return { pcs, label, hist, n: total(hist), median: quantile(hist, 0.5), q1: quantile(hist, 0.25), q3: quantile(hist, 0.75) };
}
const PROFESSIONS: Profession[] = METIER_PROFESSIONS.map(([p, l, s]) => profession(p, l, s));
const BY_PCS = new Map(PROFESSIONS.map((p) => [p.pcs, p]));
const GROUPS = new Map(METIER_GROUPS);
const DEPTS = new Map(METIER_DEPARTMENTS.map(([c, l, s]) => [c, { code: c, name: l, hist: parse(s) }]));
const ALL = parse(METIER_ALL);
const CELLS = new Map<string, Hist>(METIER_CELLS.map(([p, d, s]) => [`${p}|${d}`, parse(s)]));
/** Cases qui ont leur propre page : médiane connue (sinon tout est « 50 000 € ou plus » et la page n'apprendrait rien). */
const CELL_PAGES = new Set([...CELLS].filter(([, h]) => quantile(h, 0.5) != null).map(([k]) => k));
const hasCellPage = (pcs: string, dep: string) => CELL_PAGES.has(`${pcs}|${dep}`);
const CELLS_BY_PCS = new Map<string, string[]>();
const CELLS_BY_DEP = new Map<string, string[]>();
for (const [p, d] of METIER_CELLS) {
  (CELLS_BY_PCS.get(p) ?? CELLS_BY_PCS.set(p, []).get(p)!).push(d);
  (CELLS_BY_DEP.get(d) ?? CELLS_BY_DEP.set(d, []).get(d)!).push(p);
}

export function isCadre(pcs: string): boolean { return pcs.startsWith('3') || pcs.startsWith('23'); }
function netRate(pcs: string): number { return isCadre(pcs) ? FR_RATES.cadre : FR_RATES.nonCadre; }

// ------------------------------------------------------------------ adresses
function shortSlug(label: string): string {
  const s = slugify(label);
  if (s.length <= 70) return s;
  const cut = s.slice(0, 70);
  return cut.slice(0, cut.lastIndexOf('-') > 30 ? cut.lastIndexOf('-') : 70);
}
export const METIER_HUB = '/salaire';
export function professionPath(p: { pcs: string; label: string }): string { return `/salaire/${shortSlug(p.label)}-${p.pcs.toLowerCase()}`; }
export function professionDepPath(p: { pcs: string; label: string }, d: { code: string; name: string }): string { return `${professionPath(p)}/${slugify(d.name)}-${d.code.toLowerCase()}`; }
export function metierDepartmentPath(d: { code: string; name: string }): string { return `/salaire/departement/${slugify(d.name)}-${d.code.toLowerCase()}`; }
/** Page « professions du département » si l'Insee y a au moins une case diffusable. */
export function metierDepartmentLink(code: string): string | null {
  const d = DEPTS.get(code.toUpperCase());
  return d && CELLS_BY_DEP.get(d.code)?.length ? metierDepartmentPath(d) : null;
}

export type MetierRoute =
  | { kind: 'hub' }
  | { kind: 'profession'; p: Profession }
  | { kind: 'cell'; p: Profession; dep: string }
  | { kind: 'department'; dep: string };

const PCS_RE = /(?:^|-)(\d{3}[a-z])$/;
const DEP_RE = /(?:^|-)(2a|2b|97\d|\d{2})$/;

/** Chemin après /salaire → route et adresse canonique, ou null. */
export function parseMetierRoute(slug: string): { route: MetierRoute; canonical: string } | null {
  const parts = String(slug ?? '').toLowerCase().replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (!parts.length) return { route: { kind: 'hub' }, canonical: METIER_HUB };
  if (parts[0] === 'departement') {
    if (parts.length !== 2) return null;
    const m = parts[1].match(DEP_RE);
    const d = m ? DEPTS.get(m[1].toUpperCase()) : null;
    if (!d || !CELLS_BY_DEP.get(d.code)?.length) return null;
    return { route: { kind: 'department', dep: d.code }, canonical: metierDepartmentPath(d) };
  }
  if (parts.length > 2) return null;
  const m = parts[0].match(PCS_RE);
  const p = m ? BY_PCS.get(m[1].toUpperCase()) : null;
  if (!p) return null;
  if (parts.length === 1) return { route: { kind: 'profession', p }, canonical: professionPath(p) };
  const dm = parts[1].match(DEP_RE);
  const d = dm ? DEPTS.get(dm[1].toUpperCase()) : null;
  if (!d || !hasCellPage(p.pcs, d.code)) return null;
  return { route: { kind: 'cell', p, dep: d.code }, canonical: professionDepPath(p, d) };
}

// ------------------------------------------------------------------ formats
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const sp = (s: string) => s.replace(/[  ]/g, ' ');
const round = (v: number, step: number) => Math.round(v / step) * step;
function eurY(v: number | null): string { return v == null ? `${sp(nf0.format(OPEN_FROM))} € ou plus` : `${sp(nf0.format(round(v, 100)))} €`; }
function eurM(v: number | null): string { return v == null ? `${sp(nf0.format(round(OPEN_FROM / 12, 10)))} € ou plus` : `${sp(nf0.format(round(v / 12, 10)))} €`; }
function netM(v: number | null, pcs: string): string { return v == null ? `${sp(nf0.format(round((OPEN_FROM / 12) * (1 - netRate(pcs)), 10)))} € ou plus` : `${sp(nf0.format(round((v / 12) * (1 - netRate(pcs)), 10)))} €`; }
function pctTxt(x: number): string { const r = Math.round(x * 100); return r < 1 && x > 0 ? '< 1 %' : `${r} %`; }
function lc(label: string): string { return /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1); }
function des(label: string): string { return `des ${lc(label)}`; }
function depLabel(code: string): string { const d = DEPTS.get(code)!; return `${d.name} (${d.code})`; }
function cmp(v: number | null, ref: number | null): string {
  if (v == null || ref == null) return '';
  const r = Math.round((v / ref - 1) * 100);
  return r === 0 ? 'au niveau de' : r > 0 ? `${r} % au-dessus de` : `${-r} % en dessous de`;
}

const STYLE = `
  .met-big{ font-family:'Cormorant Garamond',Georgia,serif; font-size:44px; color:var(--zj-blue); margin:18px 0 0; line-height:1.1; }
  .met-big small{ font-family:'DM Sans',sans-serif; font-size:15px; color:var(--zj-muted); margin-left:8px; }
  .met-table{ width:100%; border-collapse:collapse; font-size:14.5px; font-variant-numeric:tabular-nums; }
  .met-table th,.met-table td{ padding:10px 12px; border-bottom:1px solid var(--zj-line); text-align:right; white-space:nowrap; }
  .met-table th:first-child,.met-table td:first-child{ text-align:left; white-space:normal; }
  .met-table thead th{ font-size:12px; color:var(--zj-muted); font-weight:600; }
  .met-table td a{ color:var(--zj-blue); }
  .met-wrap{ overflow-x:auto; }
  .met-dist{ list-style:none; padding:0; margin:6px 0 0; display:grid; gap:10px; max-width:760px; }
  .met-dist li{ display:grid; grid-template-columns:170px 1fr 70px; gap:12px; align-items:center; font-size:14px; }
  .met-dist .bar{ height:12px; background:var(--zj-bg-soft,#F2F4F7); position:relative; }
  .met-dist .bar i{ position:absolute; left:0; top:0; bottom:0; background:var(--zj-blue); }
  .met-dist span:last-child{ text-align:right; font-variant-numeric:tabular-nums; }
  .met-note{ font-size:12.5px; color:var(--zj-muted); max-width:820px; }
  .met-groups h3{ font-size:20px; margin:26px 0 10px; }
  @media (max-width:620px){ .met-dist li{ grid-template-columns:1fr 60px; } .met-dist .bar{ grid-column:1 / -1; order:3; } }
`;

function table(headCells: string[], rows: string[][]): string {
  return `<div class="met-wrap"><table class="met-table"><thead><tr>${headCells.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** Répartition par tranches regroupées. */
const DIST = [[0, 16000, 'Moins de 16 000 €'], [16000, 20000, '16 000 à 20 000 €'], [20000, 24000, '20 000 à 24 000 €'], [24000, 28000, '24 000 à 28 000 €'], [28000, 30000, '28 000 à 30 000 €'], [30000, 35000, '30 000 à 35 000 €'], [35000, 40000, '35 000 à 40 000 €'], [40000, 50000, '40 000 à 50 000 €'], [50000, Infinity, '50 000 € ou plus']] as const;
function distribution(h: Hist): string {
  const n = total(h);
  const parts = DIST.map(([lo, hi, label]) => {
    let s = 0;
    for (let i = 0; i < h.length; i++) if (TRBRUTT_BOUNDS[i] >= lo && TRBRUTT_BOUNDS[i] < hi) s += h[i];
    return { label, share: s / n };
  });
  const max = Math.max(...parts.map((x) => x.share)) || 1;
  return `<ul class="met-dist">${parts.map((x) => `<li><span>${esc(x.label)}</span><span class="bar" aria-hidden="true"><i style="width:${((x.share / max) * 100).toFixed(1)}%"></i></span><span>${esc(pctTxt(x.share))}</span></li>`).join('')}</ul>
  <p class="met-note">Part des postes à temps plein toute l’année, selon le salaire brut annuel.</p>`;
}

function sourceNote(): string {
  return `<p class="met-note">Source : Insee, Base Tous salariés ${YEAR}, fichier détail des postes (échantillon au 1/12 diffusé par l’Insee). Champ : postes à temps complet occupés toute l’année, emplois ordinaires (hors apprentis, stagiaires, emplois aidés), privé et public ; département du lieu de travail. L’Insee diffuse le salaire brut annuel par tranches : les quartiles sont interpolés dans la tranche, et la tranche la plus haute (50 000 € ou plus) n’a pas de borne supérieure. Le salaire brut annuel comprend primes et heures supplémentaires ; le mensuel est l’annuel divisé par 12. Le net est estimé aux taux usuels de cotisations (${FR_RATES.nonCadre * 100} % non-cadre, ${FR_RATES.cadre * 100} % cadre), avant impôt. Calculs Z Jobs. <a href="${METIER_SOURCE_URL}" rel="noopener">Données Insee</a></p>`;
}

function faqHtml(faq: { q: string; a: string }[]): string {
  return `<section class="city-section city-faq"><h2>Questions fréquentes</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>`;
}

function page(opts: { path: string; title: string; description: string; h1: string; lead: string; big?: { median: number | null; pcs: string }; crumbs: { name: string; path: string }[]; body: string; faq: { q: string; a: string }[]; occupation?: unknown }): string {
  const url = SITE + opts.path;
  const ld: unknown[] = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: opts.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE + c.path })) },
    ...(opts.occupation ? [opts.occupation] : []),
    { '@context': 'https://schema.org', '@type': 'Dataset', name: opts.h1, description: shortText(opts.description, 300), url, inLanguage: 'fr', temporalCoverage: String(YEAR), isBasedOn: METIER_SOURCE_URL, creator: { '@type': 'Organization', name: 'Insee', url: 'https://www.insee.fr' }, license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/' },
    ...(opts.faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: opts.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
  ];
  const big = !opts.big ? '' : opts.big.median == null
    ? `<p class="met-big">50 000 € +<small style="display:block;margin:6px 0 0">brut / an pour plus de la moitié des postes — la tranche la plus haute diffusée par l’Insee</small></p>`
    : `<p class="met-big">${esc(eurM(opts.big.median))}<small>brut / mois (médiane) · environ ${esc(netM(opts.big.median, opts.big.pcs))} net · ${esc(eurY(opts.big.median))} brut / an</small></p>`;
  return `${head({ locale: 'fr', title: opts.title, description: shortText(opts.description, 158), canonical: url, robots: 'index,follow', jsonLd: ld })
    .replace('</style>', CITY_STYLE + STYLE + '</style>')}
<body>
${navHtml('fr', opts.path, '/en')}
<main id="contenu">
<header class="city-hero hero"><div class="wrap">
  <p class="crumbs">${opts.crumbs.map((c, i) => i === opts.crumbs.length - 1 ? esc(c.name) : `<a href="${esc(c.path)}">${esc(c.name)}</a><span>›</span>`).join('')}</p>
  <h1>${esc(opts.h1)}</h1>
  <p>${esc(opts.lead)}</p>
  ${big}
</div></header>
<div class="wrap">
${opts.body}
${faqHtml(opts.faq)}
</div>
</main>
<footer></footer>
</body>
</html>
`;
}

function linksSection(extra: string[] = []): string {
  return `<section class="city-section"><h2>Du brut au net, et les offres</h2><ul class="city-links">${extra.join('')}<li><a href="/salaire-brut-net">Simulateur salaire brut en net</a></li><li><a href="/outils#grilles">Grilles des conventions collectives</a></li><li><a href="/#recherche">Offres avec le salaire affiché</a></li></ul></section>`;
}

function occupationLd(p: Profession, h: Hist, place?: string): unknown {
  const q1 = quantile(h, 0.25), q3 = quantile(h, 0.75), med = quantile(h, 0.5);
  return {
    '@context': 'https://schema.org', '@type': 'Occupation', name: p.label, occupationalCategory: `PCS-ESE ${p.pcs}`,
    occupationLocation: [place ? { '@type': 'AdministrativeArea', name: place } : { '@type': 'Country', name: 'France' }],
    ...(med != null ? { estimatedSalary: [{ '@type': 'MonetaryAmountDistribution', name: 'base', currency: 'EUR', duration: 'P1Y', ...(q1 != null ? { percentile25: Math.round(q1) } : {}), median: Math.round(med), ...(q3 != null ? { percentile75: Math.round(q3) } : {}) }] } : {}),
  };
}

function quartileTable(h: Hist, pcs: string, refs: { label: string; h: Hist }[] = []): string {
  const rows = ([['Premier quartile (25 %)', 0.25], ['Médiane', 0.5], ['Troisième quartile (75 %)', 0.75]] as const).map(([label, q]) => {
    const v = quantile(h, q);
    return [label === 'Médiane' ? `<b>${label}</b>` : label, eurY(v), eurM(v), netM(v, pcs), ...refs.map((r) => eurY(quantile(r.h, q)))];
  });
  return table(['', 'Brut annuel', 'Brut mensuel', 'Net mensuel estimé', ...refs.map((r) => r.label)], rows);
}

// ------------------------------------------------------------------ profession (France)
function professionPage(p: Profession): string {
  const path = professionPath(p);
  const deps = (CELLS_BY_PCS.get(p.pcs) ?? []).map((d) => ({ d, h: CELLS.get(`${p.pcs}|${d}`)! })).map((x) => ({ ...x, med: quantile(x.h, 0.5) }))
    .sort((a, b) => (b.med ?? Infinity) - (a.med ?? Infinity));
  const group = p.pcs.slice(0, 2);
  const siblings = PROFESSIONS.filter((x) => x.pcs !== p.pcs && x.pcs.slice(0, 2) === group);
  const allMed = quantile(ALL, 0.5);
  const above50 = shareFrom(p.hist, OPEN_FROM);
  const name = des(p.label);
  const vs = cmp(p.median, allMed);
  const faq = [
    { q: `Quel est le salaire ${name} ?`, a: p.median == null ? `Plus de la moitié des postes à temps plein ${name} sont payés 50 000 € bruts par an ou plus en ${YEAR} (plus de ${eurM(OPEN_FROM)} bruts par mois) : c’est la tranche la plus haute que diffuse l’Insee, sans montant au-delà. Le premier quartile est de ${eurY(p.q1)}.` : `Le salaire brut annuel médian ${name} à temps plein est de ${eurY(p.median)} en ${YEAR}, soit ${eurM(p.median)} bruts par mois et environ ${netM(p.median, p.pcs)} nets avant impôt. La moitié gagne plus, la moitié gagne moins.` },
    { q: `Quelle fourchette de salaire ${name} ?`, a: `La moitié des postes se situe entre ${eurY(p.q1)} et ${eurY(p.q3)} bruts par an (premier et troisième quartiles) ; ${pctTxt(above50)} des postes dépassent 50 000 € bruts par an.` },
    ...(deps.length ? [{ q: `Où les ${lc(p.label)} sont-ils le mieux payés ?`, a: `Parmi les ${deps.length} départements où l’échantillon de l’Insee est suffisant, la médiane la plus haute est en ${depLabel(deps[0].d)} (${eurY(deps[0].med)} bruts par an).` }] : []),
    { q: 'D’où viennent ces chiffres ?', a: `De l’Insee (Base Tous salariés ${YEAR}), pour les postes à temps plein occupés toute l’année. L’Insee diffuse des tranches de salaire : les montants sont interpolés dans la tranche.` },
  ];
  const depRows = deps.map((x) => [hasCellPage(p.pcs, x.d) ? `<a href="${professionDepPath(p, DEPTS.get(x.d)!)}">${esc(depLabel(x.d))}</a>` : esc(depLabel(x.d)), eurY(quantile(x.h, 0.25)), `<b>${eurY(x.med)}</b>`, eurY(quantile(x.h, 0.75)), pctTxt(shareFrom(x.h, OPEN_FROM))]);
  const body = `<section class="city-section"><h2>Fourchette de salaire</h2>${quartileTable(p.hist, p.pcs, [{ label: 'Tous métiers (brut annuel)', h: ALL }])}
  <p>${vs ? `La médiane est ${vs} celle de l’ensemble des salariés à temps plein (${eurY(allMed)}).` : ''} ${isCadre(p.pcs) ? 'Profession de cadre : net estimé avec 25 % de cotisations.' : 'Net estimé avec 22 % de cotisations (non-cadre).'}</p></section>
<section class="city-section"><h2>Répartition des salaires</h2>${distribution(p.hist)}</section>
${deps.length ? `<section class="city-section"><h2>Salaire ${esc(name)} par département (${deps.length})</h2>${table(['Département (lieu de travail)', 'Q1 brut annuel', 'Médiane', 'Q3', '50 000 € ou plus'], depRows)}</section>` : ''}
${siblings.length ? `<section class="city-section"><h2>${esc(GROUPS.get(group) ?? 'Professions proches')}</h2><ul class="city-links">${siblings.map((x) => `<li><a href="${professionPath(x)}">${esc(x.label)}</a> <small>${esc(eurM(x.median))}</small></li>`).join('')}</ul></section>` : ''}
<section class="city-section"><h2>Méthode et source</h2>${sourceNote()}</section>
${linksSection([`<li><a href="${METIER_HUB}">Toutes les professions</a></li>`])}`;
  return page({
    path,
    title: p.median == null ? `Salaire ${name} : plus de 50 000 € brut par an pour la moitié (Insee ${YEAR}) | Z Jobs` : `Salaire ${name} : ${eurM(p.median)} brut par mois (médiane Insee ${YEAR}) | Z Jobs`,
    description: `Salaire ${name} en France : médiane ${eurY(p.median)} brut par an à temps plein (${eurM(p.median)} par mois, ≈ ${netM(p.median, p.pcs)} net), fourchette ${eurY(p.q1)} – ${eurY(p.q3)}. Par département — Insee ${YEAR}.`,
    h1: `Salaire ${name}`,
    lead: `Ce que gagnent les ${lc(p.label)} salariés à temps plein en France : médiane, fourchette et écarts entre départements, d’après les données de l’Insee (${YEAR}).`,
    big: { median: p.median, pcs: p.pcs },
    crumbs: [{ name: 'Z Jobs', path: '/' }, { name: 'Salaire par métier', path: METIER_HUB }, { name: p.label, path }],
    body, faq, occupation: occupationLd(p, p.hist),
  });
}

// ------------------------------------------------------------------ profession × département
function cellPage(p: Profession, dep: string): string {
  const d = DEPTS.get(dep)!;
  const h = CELLS.get(`${p.pcs}|${dep}`)!;
  const path = professionDepPath(p, d);
  const med = quantile(h, 0.5), q1 = quantile(h, 0.25), q3 = quantile(h, 0.75);
  const name = des(p.label);
  const label = depLabel(dep);
  const vsFr = cmp(med, p.median);
  const others = (CELLS_BY_PCS.get(p.pcs) ?? []).filter((x) => x !== dep && hasCellPage(p.pcs, x)).map((x) => DEPTS.get(x)!);
  const depOthers = (CELLS_BY_DEP.get(dep) ?? []).filter((x) => x !== p.pcs && x.slice(0, 2) === p.pcs.slice(0, 2) && hasCellPage(x, dep)).map((x) => BY_PCS.get(x)!).filter(Boolean);
  const faq = [
    { q: `Quel est le salaire ${name} — ${label} ?`, a: `Médiane de ${eurY(med)} bruts par an à temps plein en ${YEAR} pour les postes situés dans le département, soit ${eurM(med)} bruts par mois et environ ${netM(med, p.pcs)} nets.${vsFr ? ` C’est ${vsFr} la médiane nationale de la profession (${eurY(p.median)}).` : ''}` },
    { q: 'Quelle fourchette ?', a: `La moitié des postes se situe entre ${eurY(q1)} et ${eurY(q3)} bruts par an.` },
  ];
  const body = `<section class="city-section"><h2>Fourchette de salaire</h2>${quartileTable(h, p.pcs, [{ label: 'France (brut annuel)', h: p.hist }])}
  <p>${vsFr ? `La médiane du département est ${vsFr} la médiane nationale de la profession.` : ''}</p></section>
<section class="city-section"><h2>Répartition des salaires</h2>${distribution(h)}</section>
${depOthers.length ? `<section class="city-section"><h2>Autres professions proches — ${esc(label)}</h2><ul class="city-links">${depOthers.map((x) => `<li><a href="${professionDepPath(x, d)}">${esc(x.label)}</a></li>`).join('')}</ul></section>` : ''}
${others.length ? `<section class="city-section"><h2>Salaire ${esc(name)} dans les autres départements</h2><ul class="city-links">${others.map((x) => `<li><a href="${professionDepPath(p, x)}">${esc(depLabel(x.code))}</a></li>`).join('')}</ul></section>` : ''}
<section class="city-section"><h2>Méthode et source</h2>${sourceNote()}</section>
${linksSection([`<li><a href="${professionPath(p)}">Salaire ${esc(name)} en France</a></li>`, `<li><a href="${metierDepartmentPath(d)}">Toutes les professions — ${esc(label)}</a></li>`])}`;
  return page({
    path,
    title: med == null ? `Salaire ${name} — ${label} : plus de 50 000 € brut par an | Z Jobs` : `Salaire ${name} — ${label} : ${eurM(med)} brut par mois | Z Jobs`,
    description: `Salaire ${name} dans le département ${label} : médiane ${eurY(med)} brut par an à temps plein (≈ ${netM(med, p.pcs)} net par mois), fourchette ${eurY(q1)} – ${eurY(q3)}. Comparaison France — Insee ${YEAR}.`,
    h1: `Salaire ${name} — ${label}`,
    lead: `Postes à temps plein situés dans le département ${label} : médiane et fourchette de salaire, comparées à la France, d’après l’Insee (${YEAR}).`,
    big: { median: med, pcs: p.pcs },
    crumbs: [{ name: 'Z Jobs', path: '/' }, { name: 'Salaire par métier', path: METIER_HUB }, { name: p.label, path: professionPath(p) }, { name: label, path }],
    body, faq, occupation: occupationLd(p, h, label),
  });
}

// ------------------------------------------------------------------ département
function departmentPage(dep: string): string {
  const d = DEPTS.get(dep)!;
  const path = metierDepartmentPath(d);
  const label = depLabel(dep);
  const list = (CELLS_BY_DEP.get(dep) ?? []).map((pcs) => ({ p: BY_PCS.get(pcs)!, h: CELLS.get(`${pcs}|${dep}`)! })).filter((x) => x.p)
    .map((x) => ({ ...x, med: quantile(x.h, 0.5) })).sort((a, b) => (b.med ?? Infinity) - (a.med ?? Infinity));
  const depMed = quantile(d.hist, 0.5);
  const allMed = quantile(ALL, 0.5);
  const rows = list.map((x) => [hasCellPage(x.p.pcs, dep) ? `<a href="${professionDepPath(x.p, d)}">${esc(x.p.label)}</a>` : `<a href="${professionPath(x.p)}">${esc(x.p.label)}</a>`, eurY(quantile(x.h, 0.25)), `<b>${eurY(x.med)}</b>`, eurY(quantile(x.h, 0.75)), eurM(x.med)]);
  const faq = [
    { q: `Quel est le salaire médian — ${label} ?`, a: `${eurY(depMed)} bruts par an pour l’ensemble des postes à temps plein situés dans le département (${eurM(depMed)} par mois), contre ${eurY(allMed)} en France.` },
    ...(list.length ? [{ q: 'Quels métiers paient le plus ?', a: `Parmi les ${list.length} professions où l’échantillon de l’Insee est suffisant : ${list.slice(0, 3).map((x) => `${lc(x.p.label)} (${eurY(x.med)})`).join(', ')}.` }] : []),
  ];
  const body = `<section class="city-section"><h2>Ensemble des salariés à temps plein</h2>${quartileTable(d.hist, '40', [{ label: 'France (brut annuel)', h: ALL }])}</section>
<section class="city-section"><h2>Salaire par profession (${list.length})</h2>${table(['Profession', 'Q1 brut annuel', 'Médiane', 'Q3', 'Médiane brut / mois'], rows)}</section>
<section class="city-section"><h2>Méthode et source</h2>${sourceNote()}</section>
${linksSection([`<li><a href="${METIER_HUB}">Toutes les professions en France</a></li>`])}`;
  return page({
    path,
    title: `Salaire par métier — ${label} : ${list.length} professions (Insee ${YEAR}) | Z Jobs`,
    description: `Salaires dans le département ${label} pour ${list.length} professions : médiane et fourchette à temps plein, brut et net estimé. Ensemble des salariés : ${eurY(depMed)} brut par an — Insee ${YEAR}.`,
    h1: `Salaire par métier — ${label}`,
    lead: `Médiane et fourchette de salaire des postes à temps plein situés dans le département, profession par profession, d’après l’Insee (${YEAR}).`,
    big: { median: depMed, pcs: '40' },
    crumbs: [{ name: 'Z Jobs', path: '/' }, { name: 'Salaire par métier', path: METIER_HUB }, { name: label, path }],
    body, faq,
  });
}

// ------------------------------------------------------------------ toutes les professions
function hubPage(): string {
  const allMed = quantile(ALL, 0.5);
  const byGroup = new Map<string, Profession[]>();
  for (const p of PROFESSIONS) (byGroup.get(p.pcs.slice(0, 2)) ?? byGroup.set(p.pcs.slice(0, 2), []).get(p.pcs.slice(0, 2))!).push(p);
  const deps = [...DEPTS.values()].filter((d) => CELLS_BY_DEP.get(d.code)?.length);
  const faq = [
    { q: 'Quel est le salaire médian en France ?', a: `${eurY(allMed)} bruts par an pour un poste à temps plein occupé toute l’année en ${YEAR}, soit ${eurM(allMed)} bruts par mois (environ ${netM(allMed, '40')} nets pour un non-cadre).` },
    { q: 'Pourquoi une médiane plutôt qu’une moyenne ?', a: 'La médiane partage les salariés en deux moitiés égales : elle n’est pas tirée vers le haut par quelques très hauts salaires, et l’Insee diffuse des tranches qui permettent de la calculer.' },
  ];
  const body = `<section class="city-section met-groups"><h2>${PROFESSIONS.length} professions</h2>
${[...byGroup].map(([g, ps]) => `<h3>${esc(GROUPS.get(g) ?? g)}</h3><ul class="city-links">${ps.map((p) => `<li><a href="${professionPath(p)}">${esc(p.label)}</a> <small>${esc(eurM(p.median))}</small></li>`).join('')}</ul>`).join('\n')}
</section>
<section class="city-section"><h2>Par département</h2><ul class="city-links">${deps.map((d) => `<li><a href="${metierDepartmentPath(d)}">${esc(depLabel(d.code))}</a></li>`).join('')}</ul></section>
<section class="city-section"><h2>Méthode et source</h2>${sourceNote()}</section>
${linksSection([`<li><a href="/salaire-moyen">Salaire moyen par ville</a></li>`])}`;
  return page({
    path: METIER_HUB,
    title: `Salaire par métier en France : ${PROFESSIONS.length} professions (Insee ${YEAR}) | Z Jobs`,
    description: `Salaire médian, fourchette et net estimé de ${PROFESSIONS.length} professions en France et par département, à temps plein, d’après l’Insee (${YEAR}). Médiane tous métiers : ${eurM(allMed)} brut par mois.`,
    h1: 'Salaire par métier en France',
    lead: `Combien gagne-t-on dans votre métier ? Médiane et fourchette pour ${PROFESSIONS.length} professions, en France et dans votre département — chiffres officiels de l’Insee (${YEAR}).`,
    big: { median: allMed, pcs: '40' },
    crumbs: [{ name: 'Z Jobs', path: '/' }, { name: 'Salaire par métier', path: METIER_HUB }],
    body, faq,
  });
}

export function renderMetierPage(route: MetierRoute): string {
  if (route.kind === 'profession') return professionPage(route.p);
  if (route.kind === 'cell') return cellPage(route.p, route.dep);
  if (route.kind === 'department') return departmentPage(route.dep);
  return hubPage();
}

export function metierSitemapPaths(): string[] {
  const out = [METIER_HUB];
  for (const p of PROFESSIONS) out.push(professionPath(p));
  for (const d of DEPTS.values()) if (CELLS_BY_DEP.get(d.code)?.length) out.push(metierDepartmentPath(d));
  for (const [p, d] of METIER_CELLS) { const pr = BY_PCS.get(p); if (pr && hasCellPage(p, d)) out.push(professionDepPath(pr, DEPTS.get(d)!)); }
  return out;
}

export function renderMetierSitemap(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${metierSitemapPaths().map((p) => `  <url><loc>${esc(SITE + p)}</loc></url>`).join('\n')}
</urlset>
`;
}
