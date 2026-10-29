// apps/api/src/averageSalaryPages.ts
//
// Pages « salaire moyen » de zjobs.online, rendues par l'API (réécritures de la
// montra) et indexables, à partir des chiffres officiels de l'Insee :
//
//   /salaire-moyen                                 France : départements, extrêmes
//   /salaire-moyen/departement/<nom>-<code>        un département et ses communes
//   /salaire-moyen/<commune>-<code INSEE>          une commune
//   (?lang=en pour l'anglais, comme les pages /emploi/…)
//
// Source : Insee, Base Tous salariés 2022 — salaire net horaire moyen selon la
// catégorie socioprofessionnelle, le sexe et l'âge, salariés au lieu de
// RÉSIDENCE, hors agriculture (src/data/inseeSalaires2022.ts, généré par
// apps/jobs/tools/build-insee-salaires.mjs). Aucun chiffre n'est estimé : la page
// affiche le salaire net horaire publié et son équivalent mensuel à temps plein
// (× 151,67 heures), et dit ce que ce chiffre mesure.

import { INSEE_COMMUNES_2022, INSEE_DEPARTMENTS_2022, INSEE_FRANCE_2022, type InseeRow } from './data/inseeSalaires2022';
import { metierDepartmentLink } from './metierSalaryPages';
import { CITY_STYLE, SITE, esc, head, navHtml, shortText, sitePath, slugify, type PageLocale } from './publicPages';

const HOURS = 151.67;
const YEAR = 2022;
export const INSEE_SOURCE_URL = 'https://www.insee.fr/fr/statistiques/8629963';

/** Valeurs d'une zone, dans l'ordre de SALARY_FIELDS. */
export interface SalaryArea {
  code: string; name: string;
  all: number; cadres: number | null; intermediaires: number | null; employes: number | null; ouvriers: number | null;
  femmes: number | null; hommes: number | null; age18_25: number | null; age26_50: number | null; age50plus: number | null;
}
function area(r: InseeRow | (number | null)[], code = 'FR', name = 'France'): SalaryArea {
  const v = (typeof r[0] === 'string' ? r.slice(2) : r) as (number | null)[];
  const c = typeof r[0] === 'string' ? String(r[0]) : code;
  const n = typeof r[0] === 'string' ? String(r[1]) : name;
  return { code: c, name: n, all: v[0] as number, cadres: v[1], intermediaires: v[2], employes: v[3], ouvriers: v[4], femmes: v[5], hommes: v[6], age18_25: v[7], age26_50: v[8], age50plus: v[9] };
}

export const FRANCE: SalaryArea = area(INSEE_FRANCE_2022);
const DEPARTMENTS: SalaryArea[] = INSEE_DEPARTMENTS_2022.map((r) => area(r));
const COMMUNES: SalaryArea[] = INSEE_COMMUNES_2022.map((r) => area(r));
const DEP_BY_CODE = new Map(DEPARTMENTS.map((d) => [d.code, d]));
const COM_BY_CODE = new Map(COMMUNES.map((c) => [c.code, c]));

export function departmentOf(communeCode: string): string { return communeCode.startsWith('97') ? communeCode.slice(0, 3) : communeCode.slice(0, 2); }
/** Arrondissements municipaux de Paris, Lyon et Marseille (pas de page /emploi ni Z Find à eux). */
export function isArrondissement(code: string): boolean { return /^(751\d\d|6938\d|132\d\d)$/.test(code); }

export function communePath(c: { code: string; name: string }): string { return `/salaire-moyen/${slugify(c.name)}-${c.code.toLowerCase()}`; }
export function departmentPath(d: { code: string; name: string }): string { return `/salaire-moyen/departement/${slugify(d.name)}-${d.code.toLowerCase()}`; }
export const HUB_PATH = '/salaire-moyen';

export function getCommuneSalary(code: string): SalaryArea | null { return COM_BY_CODE.get(code.toUpperCase()) ?? null; }
export function getDepartmentSalary(code: string): SalaryArea | null { return DEP_BY_CODE.get(code.toUpperCase()) ?? null; }

export type AverageSalaryRoute = { kind: 'hub' } | { kind: 'department'; area: SalaryArea } | { kind: 'commune'; area: SalaryArea };

/** '' → hub ; 'departement/haute-savoie-74' → département ; 'thonon-les-bains-74281' → commune ; sinon null. */
export function parseAverageSalaryRoute(slug: string): { route: AverageSalaryRoute; canonical: string } | null {
  const s = String(slug ?? '').toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!s) return { route: { kind: 'hub' }, canonical: HUB_PATH };
  const dep = s.match(/^departement\/(?:.*-)?((?:2a|2b|97\d|\d{2}))$/);
  if (dep) {
    const d = getDepartmentSalary(dep[1]);
    return d ? { route: { kind: 'department', area: d }, canonical: departmentPath(d) } : null;
  }
  if (s.includes('/')) return null;
  const com = s.match(/(?:^|-)((?:2a|2b|\d{2})\d{3}|97\d{3})$/);
  const c = com ? getCommuneSalary(com[1]) : null;
  return c ? { route: { kind: 'commune', area: c }, canonical: communePath(c) } : null;
}

// ------------------------------------------------------------------ formats
const nf2Fr = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf2En = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0Fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf0En = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const sp = (s: string) => s.replace(/[  ]/g, ' ');
function hourly(v: number | null, L: PageLocale): string { if (v == null) return '—'; return L === 'en' ? `€${nf2En.format(v)}` : `${sp(nf2Fr.format(v))} €`; }
function monthly(v: number | null, L: PageLocale): string { if (v == null) return '—'; const m = v * HOURS; return L === 'en' ? `€${nf0En.format(m)}` : `${sp(nf0Fr.format(Math.round(m)))} €`; }
/** « 2 197 € » / « €2,197 » : équivalent mensuel net à temps plein. */
export function averageMonthlyText(v: number, L: PageLocale): string { return monthly(v, L); }
function pct(v: number | null, ref: number | null, L: PageLocale): string {
  if (v == null || ref == null) return '—';
  const p = (v / ref - 1) * 100;
  const r = Math.round(p);
  if (r === 0) return L === 'en' ? 'same as France' : 'comme la France';
  return `${r > 0 ? '+' : '−'}${Math.abs(r)} %`.replace(' %', L === 'en' ? '%' : ' %');
}
function gap(f: number | null, h: number | null): number | null { return f == null || h == null || !h ? null : Math.round((1 - f / h) * 100); }

/** « à Thonon-les-Bains », « au Mans », « aux Sables-d'Olonne ». */
function aCommune(name: string): string {
  const m = String(name).match(/^(Le|Les) (.*)$/);
  if (m) return `${m[1] === 'Le' ? 'au' : 'aux'} ${m[2]}`;
  return `à ${name}`;
}
function depLabel(d: SalaryArea): string { return `${d.name} (${d.code})`; }

const STYLE = `
  .avg-big{ font-family:'Cormorant Garamond',Georgia,serif; font-size:44px; color:var(--zj-blue); margin:18px 0 0; line-height:1.1; }
  .avg-big small{ font-family:'DM Sans',sans-serif; font-size:15px; color:var(--zj-muted); margin-left:8px; }
  .avg-table{ width:100%; border-collapse:collapse; font-size:14.5px; font-variant-numeric:tabular-nums; }
  .avg-table th,.avg-table td{ padding:10px 12px; border-bottom:1px solid var(--zj-line); text-align:right; white-space:nowrap; }
  .avg-table th:first-child,.avg-table td:first-child{ text-align:left; white-space:normal; }
  .avg-table thead th{ font-size:12px; color:var(--zj-muted); font-weight:600; }
  .avg-table td a{ color:var(--zj-blue); }
  .avg-wrap{ overflow-x:auto; }
  .avg-bars{ list-style:none; padding:0; margin:6px 0 0; display:grid; gap:12px; max-width:760px; }
  .avg-bars li{ display:grid; grid-template-columns:200px 1fr 90px; gap:12px; align-items:center; font-size:14px; }
  .avg-bars .bar{ height:12px; background:var(--zj-bg-soft,#F2F4F7); position:relative; }
  .avg-bars .bar i{ position:absolute; left:0; top:0; bottom:0; background:var(--zj-blue); }
  .avg-bars .bar b{ position:absolute; top:-3px; bottom:-3px; width:2px; background:#3A4250; }
  .avg-bars span:last-child{ text-align:right; font-variant-numeric:tabular-nums; }
  .avg-legend{ font-size:12.5px; color:var(--zj-muted); margin-top:10px; }
  .avg-note{ font-size:12.5px; color:var(--zj-muted); max-width:800px; }
  @media (max-width:620px){ .avg-bars li{ grid-template-columns:1fr 80px; } .avg-bars .bar{ grid-column:1 / -1; order:3; } }
`;

function table(headCells: string[], rows: string[][]): string {
  return `<div class="avg-wrap"><table class="avg-table"><thead><tr>${headCells.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** Barres : valeur de la zone (bleu) et repère France (trait). */
function bars(items: { label: string; v: number | null; ref: number | null }[], L: PageLocale): string {
  const max = Math.max(...items.flatMap((i) => [i.v ?? 0, i.ref ?? 0])) * 1.05 || 1;
  return `<ul class="avg-bars">${items.map((i) => `<li><span>${esc(i.label)}</span><span class="bar" aria-hidden="true">${i.v != null ? `<i style="width:${((i.v / max) * 100).toFixed(1)}%"></i>` : ''}${i.ref != null ? `<b style="left:${((i.ref / max) * 100).toFixed(1)}%"></b>` : ''}</span><span>${esc(hourly(i.v, L))}</span></li>`).join('')}</ul>
  <p class="avg-legend">${L === 'en' ? 'Bar: net hourly pay here · line: France average.' : 'Barre : salaire net horaire ici · trait : moyenne France.'}</p>`;
}

function categories(L: PageLocale) {
  return L === 'en'
    ? { cadres: 'Executives & higher professions', intermediaires: 'Intermediate professions', employes: 'Clerical & service workers', ouvriers: 'Manual workers', femmes: 'Women', hommes: 'Men', age18_25: '18 to 25', age26_50: '26 to 50', age50plus: 'Over 50' }
    : { cadres: 'Cadres et professions supérieures', intermediaires: 'Professions intermédiaires', employes: 'Employés', ouvriers: 'Ouvriers', femmes: 'Femmes', hommes: 'Hommes', age18_25: '18 à 25 ans', age26_50: '26 à 50 ans', age50plus: 'Plus de 50 ans' };
}
type Key = 'cadres' | 'intermediaires' | 'employes' | 'ouvriers' | 'femmes' | 'hommes' | 'age18_25' | 'age26_50' | 'age50plus';
const CSP: Key[] = ['cadres', 'intermediaires', 'employes', 'ouvriers'];
const SEX: Key[] = ['femmes', 'hommes'];
const AGE: Key[] = ['age18_25', 'age26_50', 'age50plus'];

function detailTable(a: SalaryArea, refs: { label: string; area: SalaryArea }[], L: PageLocale): string {
  const C = categories(L);
  const rows = [['all', L === 'en' ? 'All employees' : 'Ensemble des salariés'] as const, ...[...CSP, ...SEX, ...AGE].map((k) => [k, C[k]] as const)].map(([k, label]) => {
    const v = (a as any)[k] as number | null;
    return [k === 'all' ? `<b>${esc(label)}</b>` : esc(label), hourly(v, L), monthly(v, L), ...refs.map((r) => hourly((r.area as any)[k], L))];
  });
  return table([L === 'en' ? 'Employees' : 'Salariés', L === 'en' ? 'Net / hour' : 'Net / heure', L === 'en' ? 'Net / month (full time)' : 'Net / mois (temps plein)', ...refs.map((r) => r.label)], rows);
}

function sourceNote(L: PageLocale): string {
  return L === 'en'
    ? `<p class="avg-note">Source: Insee, Base Tous salariés ${YEAR} (latest published edition) — mean net hourly wage of employees by place of <b>residence</b>, excluding agriculture; 1 January 2024 geography. “Net” means after employee social contributions and before income tax. The monthly figure is the hourly wage × 151.67 hours (full-time equivalent), not an average payslip: part-time work is not counted in it. Cross-border workers employed in Switzerland, Luxembourg, Belgium or Germany are not counted: their pay is not declared in France. Some cells are not published by Insee (statistical confidentiality). <a href="${INSEE_SOURCE_URL}" rel="noopener">Insee dataset</a></p>`
    : `<p class="avg-note">Source : Insee, Base Tous salariés ${YEAR} (dernière édition publiée) — salaire net horaire moyen des salariés selon leur lieu de <b>résidence</b>, hors agriculture ; géographie au 1er janvier 2024. « Net » : après cotisations salariales, avant impôt sur le revenu. Le mensuel est le salaire horaire × 151,67 heures (équivalent temps plein), pas une fiche de paie moyenne : le temps partiel n’y pèse pas. Les frontaliers employés en Suisse, au Luxembourg, en Belgique ou en Allemagne ne sont pas comptés : leur salaire n’est pas déclaré en France. Certaines cases ne sont pas diffusées par l’Insee (secret statistique). <a href="${INSEE_SOURCE_URL}" rel="noopener">Données Insee</a></p>`;
}

function faqHtml(faq: { q: string; a: string }[], L: PageLocale): string {
  return `<section class="city-section city-faq"><h2>${L === 'en' ? 'Questions' : 'Questions fréquentes'}</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>`;
}

function page(opts: { locale: PageLocale; path: string; title: string; description: string; h1: string; lead: string; big: number; crumbs: { name: string; path: string }[]; body: string; faq: { q: string; a: string }[]; about?: unknown }): string {
  const L = opts.locale;
  const en = L === 'en';
  const q = en ? '?lang=en' : '';
  const frUrl = SITE + opts.path;
  const enUrl = SITE + opts.path + '?lang=en';
  const ld: unknown[] = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: opts.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE + (c.path === '/' ? sitePath('/', q) : c.path + q) })) },
    { '@context': 'https://schema.org', '@type': 'Dataset', name: opts.h1, description: shortText(opts.description, 300), url: en ? enUrl : frUrl, inLanguage: L, temporalCoverage: String(YEAR), isBasedOn: INSEE_SOURCE_URL, creator: { '@type': 'Organization', name: 'Insee', url: 'https://www.insee.fr' }, license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/', ...(opts.about ? { spatialCoverage: opts.about } : {}) },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: opts.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
  ];
  return `${head({ locale: L, title: opts.title, description: shortText(opts.description, 158), canonical: en ? enUrl : frUrl, alternates: { fr: frUrl, en: enUrl }, robots: 'index,follow', jsonLd: ld })
    .replace('</style>', CITY_STYLE + STYLE + '</style>')}
<body>
${navHtml(L, opts.path, opts.path + '?lang=en')}
<main id="contenu">
<header class="city-hero hero"><div class="wrap">
  <p class="crumbs">${opts.crumbs.map((c, i) => i === opts.crumbs.length - 1 ? esc(c.name) : `<a href="${esc(c.path === '/' ? sitePath('/', q) : c.path + q)}">${esc(c.name)}</a><span>›</span>`).join('')}</p>
  <h1>${esc(opts.h1)}</h1>
  <p>${esc(opts.lead)}</p>
  <p class="avg-big">${esc(monthly(opts.big, L))}<small>${en ? `net / month full time · ${hourly(opts.big, L)} / hour` : `nets / mois à temps plein · ${hourly(opts.big, L)} / heure`}</small></p>
</div></header>
<div class="wrap">
${opts.body}
${faqHtml(opts.faq, L)}
</div>
</main>
<footer></footer>
</body>
</html>
`;
}

function moreLinks(L: PageLocale, extra: string[] = []): string {
  const en = L === 'en';
  const q = en ? '?lang=en' : '';
  return `<section class="city-section"><h2>${en ? 'From gross to net, and jobs' : 'Du brut au net, et les offres'}</h2><ul class="city-links">${extra.join('')}<li><a href="${en ? '/en/gross-to-net-salary-france' : '/salaire-brut-net'}">${en ? 'Gross to net salary calculator' : 'Simulateur salaire brut en net'}</a></li><li><a href="${sitePath('/outils', q)}#legislation">${en ? 'Minimum wage and pay scales' : 'SMIC et grilles de salaires'}</a></li><li><a href="${sitePath('/', q)}#recherche">${en ? 'Jobs with the salary shown' : 'Offres avec le salaire affiché'}</a></li></ul></section>`;
}

// ------------------------------------------------------------------ commune
function communePage(c: SalaryArea, L: PageLocale): string {
  const en = L === 'en';
  const q = en ? '?lang=en' : '';
  const C = categories(L);
  const d = getDepartmentSalary(departmentOf(c.code));
  const path = communePath(c);
  const name = c.name;
  const vsFr = pct(c.all, FRANCE.all, L);
  const g = gap(c.femmes, c.hommes);
  // Communes voisines dans l'ordre du code : même département, autour de celle-ci.
  const same = COMMUNES.filter((x) => departmentOf(x.code) === departmentOf(c.code));
  const i = same.findIndex((x) => x.code === c.code);
  const near = same.slice(Math.max(0, i - 8), i).concat(same.slice(i + 1, i + 9));
  const higher = d ? same.filter((x) => x.all > c.all).length : 0;
  const rank = higher + 1;
  const refs = [...(d ? [{ label: d.name, area: d }] : []), { label: 'France', area: FRANCE }];
  const cadre = c.cadres;
  const faq = en
    ? [
        { q: `What is the average salary in ${name}?`, a: `In ${YEAR}, employees living in ${name} earned on average ${hourly(c.all, L)} net an hour, i.e. ${monthly(c.all, L)} net a month on a full-time basis — ${vsFr === 'same as France' ? 'the same as' : `${vsFr} compared with`} the French average (${hourly(FRANCE.all, L)}).` },
        ...(cadre != null ? [{ q: `How much does an executive earn in ${name}?`, a: `${hourly(cadre, L)} net an hour on average for executives and higher professions (${monthly(cadre, L)} a month full time), against ${hourly(c.employes, L)} for clerical and service workers and ${hourly(c.ouvriers, L)} for manual workers.` }] : []),
        ...(g != null ? [{ q: `What is the gender pay gap in ${name}?`, a: `Women earn ${hourly(c.femmes, L)} net an hour on average and men ${hourly(c.hommes, L)}: a gap of ${g}% of the men's hourly wage (${gap(FRANCE.femmes, FRANCE.hommes)}% in France). The gap partly reflects different jobs and positions.` }] : []),
        { q: 'Where do these figures come from?', a: `From Insee, the French national statistics office (Base Tous salariés ${YEAR}). They cover employees who live in ${name}, wherever they work, excluding agriculture. Net means after employee contributions and before income tax.` },
      ]
    : [
        { q: `Quel est le salaire moyen ${aCommune(name)} ?`, a: `En ${YEAR}, les salariés qui habitent ${aCommune(name)} gagnaient en moyenne ${hourly(c.all, L)} nets de l’heure, soit ${monthly(c.all, L)} nets par mois à temps plein — ${vsFr === 'comme la France' ? 'autant que' : `${vsFr} par rapport à`} la moyenne française (${hourly(FRANCE.all, L)}).` },
        ...(cadre != null ? [{ q: `Combien gagne un cadre ${aCommune(name)} ?`, a: `${hourly(cadre, L)} nets de l’heure en moyenne pour les cadres et professions supérieures (${monthly(cadre, L)} par mois à temps plein), contre ${hourly(c.employes, L)} pour les employés et ${hourly(c.ouvriers, L)} pour les ouvriers.` }] : []),
        ...(g != null ? [{ q: `Quel est l’écart de salaire entre femmes et hommes ${aCommune(name)} ?`, a: `Les femmes gagnent en moyenne ${hourly(c.femmes, L)} nets de l’heure et les hommes ${hourly(c.hommes, L)} : un écart de ${g} % du salaire horaire masculin (${gap(FRANCE.femmes, FRANCE.hommes)} % en France). Il tient en partie à des métiers et des postes différents.` }] : []),
        { q: 'D’où viennent ces chiffres ?', a: `De l’Insee (Base Tous salariés ${YEAR}). Ils portent sur les salariés qui résident ${aCommune(name)}, quel que soit leur lieu de travail, hors agriculture. Net : après cotisations salariales, avant impôt sur le revenu.` },
      ];
  const t = en
    ? {
        title: `Average salary in ${name}: ${monthly(c.all, L)} net a month (Insee ${YEAR}) | Z Jobs`,
        desc: `Average net salary of employees living in ${name}: ${hourly(c.all, L)} an hour, ${monthly(c.all, L)} a month full time (${vsFr} vs France). By job category, gender and age — Insee figures.`,
        h1: `Average salary in ${name}`,
        lead: `Employees living in ${name}${d ? `, ${depLabel(d)}` : ''}, earned ${hourly(c.all, L)} net an hour on average in ${YEAR} — ${vsFr === 'same as France' ? 'the same as the French average' : `${vsFr} compared with the French average`}. Official Insee figures.`,
        cat: 'By job category', sex: 'Women and men', age: 'By age', detail: 'All figures', rankH: d ? `${name} in ${d.name}` : '',
        rankP: d ? `${name} ranks ${rank} of ${same.length} municipalities published in ${depLabel(d)} for the average net hourly wage (department: ${hourly(d.all, L)}).` : '',
        nearH: d ? `Other municipalities in ${d.name}` : '', depLink: d ? `Average salary in ${depLabel(d)}` : '',
        jobs: `Jobs in ${name}`, housing: `Property in ${name} on Z Find`,
      }
    : {
        title: `Salaire moyen ${aCommune(name)} : ${monthly(c.all, L)} nets par mois (Insee ${YEAR}) | Z Jobs`,
        desc: `Salaire net moyen des salariés qui habitent ${aCommune(name)} : ${hourly(c.all, L)} de l’heure, ${monthly(c.all, L)} par mois à temps plein (${vsFr} vs France). Par catégorie, sexe et âge — chiffres Insee.`,
        h1: `Salaire moyen ${aCommune(name)}`,
        lead: `Les salariés qui habitent ${aCommune(name)}${d ? ` (${d.name}, ${d.code})` : ''} gagnaient en moyenne ${hourly(c.all, L)} nets de l’heure en ${YEAR} — ${vsFr === 'comme la France' ? 'autant que la moyenne française' : `${vsFr} par rapport à la moyenne française`}. Chiffres officiels de l’Insee.`,
        cat: 'Selon la catégorie socioprofessionnelle', sex: 'Femmes et hommes', age: 'Selon l’âge', detail: 'Tous les chiffres', rankH: d ? `${name} dans le département` : '',
        rankP: d ? `${name} est ${rank === 1 ? '1re' : `${rank}e`} sur ${same.length} communes publiées dans le département ${depLabel(d)} pour le salaire net horaire moyen (département : ${hourly(d.all, L)}).` : '',
        nearH: d ? `Autres communes — ${depLabel(d)}` : '', depLink: d ? `Salaire moyen — ${depLabel(d)}` : '',
        jobs: `Emploi ${aCommune(name)}`, housing: `Immobilier ${aCommune(name)} sur Z Find`,
      };
  const arr = isArrondissement(c.code);
  const jobsLink = arr ? '' : `<li><a href="/emploi/${slugify(name)}-${c.code.toLowerCase()}${q}">${esc(t.jobs)}</a></li>`;
  const housingLink = arr ? '' : `<li><a href="https://zfind.online/${en ? 'en' : 'fr'}/immobilier/${slugify(name)}-${c.code.toLowerCase()}">${esc(t.housing)} →</a></li>`;
  const body = `<section class="city-section"><h2>${esc(t.cat)}</h2>${bars(CSP.map((k) => ({ label: C[k], v: (c as any)[k], ref: (FRANCE as any)[k] })), L)}</section>
<section class="city-section"><h2>${esc(t.sex)}</h2>${bars(SEX.map((k) => ({ label: C[k], v: (c as any)[k], ref: (FRANCE as any)[k] })), L)}${g != null ? `<p>${en ? `Gender gap: ${g}% of the men's hourly wage (France: ${gap(FRANCE.femmes, FRANCE.hommes)}%).` : `Écart femmes-hommes : ${g} % du salaire horaire masculin (France : ${gap(FRANCE.femmes, FRANCE.hommes)} %).`}</p>` : ''}</section>
<section class="city-section"><h2>${esc(t.age)}</h2>${bars(AGE.map((k) => ({ label: C[k], v: (c as any)[k], ref: (FRANCE as any)[k] })), L)}</section>
<section class="city-section"><h2>${esc(t.detail)}</h2>${detailTable(c, refs, L)}${sourceNote(L)}</section>
${d ? `<section class="city-section"><h2>${esc(t.rankH)}</h2><p>${esc(t.rankP)}</p><ul class="city-links"><li><a href="${departmentPath(d)}${q}">${esc(t.depLink)} →</a></li></ul></section>` : ''}
${near.length ? `<section class="city-section"><h2>${esc(t.nearH)}</h2><ul class="city-links">${near.map((x) => `<li><a href="${communePath(x)}${q}">${esc(x.name)}</a> <small>${esc(hourly(x.all, L))}</small></li>`).join('')}</ul></section>` : ''}
${moreLinks(L, [jobsLink, housingLink])}`;
  return page({
    locale: L, path, title: t.title, description: t.desc, h1: t.h1, lead: t.lead, big: c.all,
    crumbs: [{ name: 'Z Jobs', path: '/' }, { name: en ? 'Average salary' : 'Salaire moyen', path: HUB_PATH }, ...(d ? [{ name: d.name, path: departmentPath(d) }] : []), { name, path }],
    body, faq, about: { '@type': 'City', name, ...(d ? { containedInPlace: { '@type': 'AdministrativeArea', name: depLabel(d) } } : {}) },
  });
}

// ------------------------------------------------------------------ département
function departmentPage(d: SalaryArea, L: PageLocale): string {
  const en = L === 'en';
  const q = en ? '?lang=en' : '';
  const C = categories(L);
  const path = departmentPath(d);
  const communes = COMMUNES.filter((x) => departmentOf(x.code) === d.code).sort((a, b) => b.all - a.all);
  const vsFr = pct(d.all, FRANCE.all, L);
  const rank = DEPARTMENTS.filter((x) => x.all > d.all).length + 1;
  const top = communes[0];
  const bottom = communes[communes.length - 1];
  const g = gap(d.femmes, d.hommes);
  const label = depLabel(d);
  const faq = en
    ? [
        { q: `What is the average salary in ${label}?`, a: `${hourly(d.all, L)} net an hour in ${YEAR} for employees living in the department, i.e. ${monthly(d.all, L)} net a month full time (${vsFr} vs France). It ranks ${rank} of ${DEPARTMENTS.length} departments.` },
        ...(top && bottom && communes.length > 1 ? [{ q: `Where are salaries highest in ${d.name}?`, a: `Among the ${communes.length} municipalities published by Insee, ${top.name} has the highest average (${hourly(top.all, L)} an hour) and ${bottom.name} the lowest (${hourly(bottom.all, L)}).` }] : []),
        ...(g != null ? [{ q: `What is the gender pay gap in ${d.name}?`, a: `${g}% of the men's hourly wage: ${hourly(d.femmes, L)} for women, ${hourly(d.hommes, L)} for men.` }] : []),
      ]
    : [
        { q: `Quel est le salaire moyen dans le département ${label} ?`, a: `${hourly(d.all, L)} nets de l’heure en ${YEAR} pour les salariés qui habitent le département, soit ${monthly(d.all, L)} nets par mois à temps plein (${vsFr} vs France). Il est ${rank === 1 ? '1er' : `${rank}e`} sur ${DEPARTMENTS.length} départements.` },
        ...(top && bottom && communes.length > 1 ? [{ q: `Où les salaires sont-ils les plus élevés — ${d.name} ?`, a: `Parmi les ${communes.length} communes publiées par l’Insee, ${top.name} a la moyenne la plus haute (${hourly(top.all, L)} de l’heure) et ${bottom.name} la plus basse (${hourly(bottom.all, L)}).` }] : []),
        ...(g != null ? [{ q: `Quel est l’écart de salaire femmes-hommes — ${d.name} ?`, a: `${g} % du salaire horaire masculin : ${hourly(d.femmes, L)} pour les femmes, ${hourly(d.hommes, L)} pour les hommes.` }] : []),
      ];
  const rows = communes.map((x) => [`<a href="${communePath(x)}${q}">${esc(x.name)}</a>`, hourly(x.all, L), monthly(x.all, L), hourly(x.cadres, L), hourly(x.employes, L), hourly(x.ouvriers, L)]);
  const body = `<section class="city-section"><h2>${en ? 'By job category' : 'Selon la catégorie socioprofessionnelle'}</h2>${bars(CSP.map((k) => ({ label: C[k], v: (d as any)[k], ref: (FRANCE as any)[k] })), L)}</section>
<section class="city-section"><h2>${en ? 'All figures' : 'Tous les chiffres'}</h2>${detailTable(d, [{ label: 'France', area: FRANCE }], L)}</section>
<section class="city-section"><h2>${en ? `Average salary by municipality (${communes.length})` : `Salaire moyen par commune (${communes.length})`}</h2>
${table(en ? ['Municipality', 'Net / hour', 'Net / month FT', 'Executives', 'Clerical', 'Manual'] : ['Commune', 'Net / heure', 'Net / mois TP', 'Cadres', 'Employés', 'Ouvriers'], rows)}
${sourceNote(L)}</section>
${moreLinks(L, [`<li><a href="${HUB_PATH}${q}">${en ? 'All departments' : 'Tous les départements'}</a></li>`, ...(metierDepartmentLink(d.code) ? [`<li><a href="${metierDepartmentLink(d.code)}">${en ? 'Salary by occupation in the department (French)' : 'Salaire par métier dans le département'}</a></li>`] : [])])}`;
  return page({
    locale: L, path,
    title: en ? `Average salary in ${label}: ${monthly(d.all, L)} net a month, by municipality | Z Jobs` : `Salaire moyen ${label} : ${monthly(d.all, L)} nets par mois, par commune | Z Jobs`,
    description: en ? `Average net salary in ${label}: ${hourly(d.all, L)} an hour (${vsFr} vs France), and for each of its ${communes.length} municipalities. Executives, clerical, manual workers — Insee ${YEAR}.` : `Salaire net moyen dans le département ${label} : ${hourly(d.all, L)} de l’heure (${vsFr} vs France), et dans chacune de ses ${communes.length} communes. Cadres, employés, ouvriers — Insee ${YEAR}.`,
    h1: en ? `Average salary in ${label}` : `Salaire moyen : ${label}`,
    lead: en ? `${hourly(d.all, L)} net an hour on average in ${YEAR} for employees living in the department — ${vsFr === 'same as France' ? 'the French average' : `${vsFr} compared with France`}, ${rank === 1 ? '1st' : `${rank}th`} of ${DEPARTMENTS.length} departments.` : `${hourly(d.all, L)} nets de l’heure en moyenne en ${YEAR} pour les salariés qui habitent le département — ${vsFr === 'comme la France' ? 'la moyenne française' : `${vsFr} par rapport à la France`}, ${rank === 1 ? '1er' : `${rank}e`} sur ${DEPARTMENTS.length} départements.`,
    big: d.all,
    crumbs: [{ name: 'Z Jobs', path: '/' }, { name: en ? 'Average salary' : 'Salaire moyen', path: HUB_PATH }, { name: d.name, path }],
    body, faq, about: { '@type': 'AdministrativeArea', name: label },
  });
}

// ------------------------------------------------------------------ France
const BIG_CITIES = ['75056', '13055', '69123', '31555', '06088', '44109', '67482', '34172', '33063', '59350', '35238', '51454', '83137', '42218', '76351', '38185', '21231', '49007', '30189', '74010'];

function hubPage(L: PageLocale): string {
  const en = L === 'en';
  const q = en ? '?lang=en' : '';
  const C = categories(L);
  const deps = [...DEPARTMENTS].sort((a, b) => b.all - a.all);
  const sorted = [...COMMUNES].filter((x) => !isArrondissement(x.code)).sort((a, b) => b.all - a.all);
  const topC = sorted.slice(0, 10);
  const lowC = sorted.slice(-10).reverse();
  const big = BIG_CITIES.map((c) => getCommuneSalary(c)).filter((x): x is SalaryArea => !!x);
  const g = gap(FRANCE.femmes, FRANCE.hommes);
  const faq = en
    ? [
        { q: 'What is the average salary in France?', a: `${hourly(FRANCE.all, L)} net an hour in ${YEAR} for private and public employees (excluding agriculture), i.e. ${monthly(FRANCE.all, L)} net a month on a full-time basis.` },
        { q: 'Which department has the highest salaries?', a: `${deps[0].name} (${hourly(deps[0].all, L)} an hour), followed by ${deps[1].name} and ${deps[2].name}. The lowest is ${deps[deps.length - 1].name} (${hourly(deps[deps.length - 1].all, L)}).` },
        { q: 'How big is the gender pay gap?', a: `Women earn ${hourly(FRANCE.femmes, L)} net an hour on average, men ${hourly(FRANCE.hommes, L)}: ${g}% less.` },
        { q: 'Why an hourly wage?', a: 'Insee publishes the hourly wage so that part-time and full-time work can be compared. Multiplied by 151.67 hours it gives a full-time monthly equivalent.' },
      ]
    : [
        { q: 'Quel est le salaire moyen en France ?', a: `${hourly(FRANCE.all, L)} nets de l’heure en ${YEAR} pour les salariés du privé et du public (hors agriculture), soit ${monthly(FRANCE.all, L)} nets par mois à temps plein.` },
        { q: 'Quel département a les salaires les plus élevés ?', a: `${deps[0].name} (${hourly(deps[0].all, L)} de l’heure), devant ${deps[1].name} et ${deps[2].name}. Le plus bas : ${deps[deps.length - 1].name} (${hourly(deps[deps.length - 1].all, L)}).` },
        { q: 'Quel est l’écart de salaire entre femmes et hommes ?', a: `Les femmes gagnent en moyenne ${hourly(FRANCE.femmes, L)} nets de l’heure, les hommes ${hourly(FRANCE.hommes, L)} : ${g} % de moins.` },
        { q: 'Pourquoi un salaire horaire ?', a: 'L’Insee publie le salaire horaire pour comparer temps partiel et temps plein. Multiplié par 151,67 heures, il donne l’équivalent mensuel à temps plein.' },
      ];
  const depRows = deps.map((d) => [`<a href="${departmentPath(d)}${q}">${esc(depLabel(d))}</a>`, hourly(d.all, L), monthly(d.all, L), hourly(d.cadres, L), hourly(d.employes, L), hourly(d.ouvriers, L)]);
  const list = (xs: SalaryArea[]) => `<ul class="city-links">${xs.map((x) => `<li><a href="${communePath(x)}${q}">${esc(x.name)}</a> <small>${esc(hourly(x.all, L))}</small></li>`).join('')}</ul>`;
  const body = `<section class="city-section"><h2>${en ? 'By job category' : 'Selon la catégorie socioprofessionnelle'}</h2>${table([en ? 'Employees' : 'Salariés', en ? 'Net / hour' : 'Net / heure', en ? 'Net / month (full time)' : 'Net / mois (temps plein)'], ['all', ...CSP, ...SEX, ...AGE].map((k) => [k === 'all' ? `<b>${en ? 'All employees' : 'Ensemble des salariés'}</b>` : esc(C[k as Key]), hourly((FRANCE as any)[k], L), monthly((FRANCE as any)[k], L)]))}</section>
<section class="city-section"><h2>${en ? 'Large cities' : 'Grandes villes'}</h2>${list(big)}</section>
<section class="city-section"><h2>${en ? 'Highest average salaries' : 'Les salaires moyens les plus élevés'}</h2>${list(topC)}</section>
<section class="city-section"><h2>${en ? 'Lowest average salaries' : 'Les salaires moyens les plus bas'}</h2>${list(lowC)}</section>
<section class="city-section"><h2>${en ? `By department (${deps.length})` : `Par département (${deps.length})`}</h2>
${table(en ? ['Department', 'Net / hour', 'Net / month FT', 'Executives', 'Clerical', 'Manual'] : ['Département', 'Net / heure', 'Net / mois TP', 'Cadres', 'Employés', 'Ouvriers'], depRows)}
${sourceNote(L)}</section>
${moreLinks(L, [`<li><a href="/salaire">${en ? 'Salary by occupation (French)' : 'Salaire par métier'}</a></li>`])}`;
  return page({
    locale: L, path: HUB_PATH,
    title: en ? `Average salary in France by department and city (Insee ${YEAR}) | Z Jobs` : `Salaire moyen en France par département et par ville (Insee ${YEAR}) | Z Jobs`,
    description: en ? `Average net salary in France: ${hourly(FRANCE.all, L)} an hour, ${monthly(FRANCE.all, L)} a month full time. By department, for ${COMMUNES.length.toLocaleString('en-GB')} municipalities, by job category, gender and age — Insee.` : `Salaire net moyen en France : ${hourly(FRANCE.all, L)} de l’heure, ${monthly(FRANCE.all, L)} par mois à temps plein. Par département et pour ${sp(nf0Fr.format(COMMUNES.length))} communes, par catégorie, sexe et âge — Insee.`,
    h1: en ? 'Average salary in France, by department and city' : 'Salaire moyen en France, par département et par ville',
    lead: en ? `${hourly(FRANCE.all, L)} net an hour on average in ${YEAR}. Find the figure for your department and your municipality — official Insee data, by job category, gender and age.` : `${hourly(FRANCE.all, L)} nets de l’heure en moyenne en ${YEAR}. Trouvez le chiffre de votre département et de votre commune — données officielles de l’Insee, par catégorie, sexe et âge.`,
    big: FRANCE.all,
    crumbs: [{ name: 'Z Jobs', path: '/' }, { name: en ? 'Average salary' : 'Salaire moyen', path: HUB_PATH }],
    body, faq, about: { '@type': 'Country', name: 'France' },
  });
}

export function renderAverageSalaryPage(route: AverageSalaryRoute, locale: PageLocale): string {
  if (route.kind === 'commune') return communePage(route.area, locale);
  if (route.kind === 'department') return departmentPage(route.area, locale);
  return hubPage(locale);
}

export function averageSalarySitemapPaths(): string[] {
  return [HUB_PATH, ...DEPARTMENTS.map(departmentPath), ...COMMUNES.map(communePath)];
}

export function renderAverageSalarySitemap(): string {
  const urls = averageSalarySitemapPaths().map((p) => `  <url><loc>${esc(SITE + p)}</loc><xhtml:link rel="alternate" hreflang="fr" href="${esc(SITE + p)}"/><xhtml:link rel="alternate" hreflang="en" href="${esc(SITE + p + '?lang=en')}"/></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}
