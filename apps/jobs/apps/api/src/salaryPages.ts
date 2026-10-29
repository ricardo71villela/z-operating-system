// apps/api/src/salaryPages.ts
//
// Pages « salaire brut en net » de zjobs.online, rendues par l'API (réécritures
// de la montra) et indexables :
//
//   /salaire-brut-net                    France : calculateur, tableau, FAQ
//   /salaire-brut-net/<montant>-euros    un montant brut mensuel (et /smic)
//   /salaire-brut-net-belgique           Belgique (employé, isolé, revenus 2026)
//   /salaire-brut-net-luxembourg         Luxembourg (classe 1, 2026)
//   /en/gross-to-net-salary-{france,belgium,luxembourg}   versions anglaises
//
// Calculs :
//   - France : net avant impôt = brut − cotisations salariales, aux taux
//     usuels de 22 % (non-cadre) et 25 % (cadre). L'impôt prélevé à la
//     source dépend du taux personnel du foyer : il n'est pas estimé ici.
//   - Belgique et Luxembourg : les moteurs du domaine (netSalarySimulator.ts),
//     déjà utilisés par le simulateur de /outils et par l'API.
// Aucun chiffre inventé ; chaque page dit ce qu'elle calcule et ce qu'elle
// laisse de côté.

import { calculateBelgianNetSalary, calculateLuxembourgNetSalary, BE_WORK_BONUS_CEILING_ANNUAL } from '../../../packages/domain/src/rules/netSalarySimulator';
import { CITY_STYLE, SITE, esc, head, navHtml, shortText, sitePath, type PageLocale } from './publicPages';

export const FR_RATES = Object.freeze({ nonCadre: 0.22, cadre: 0.25 });
export const SMIC_MONTHLY_2026 = 1867.06; // 12,31 €/h × 151,67 h, depuis le 1er juin 2026
export const SMIC_HOURLY_2026 = 12.31;
export const LU_SSM_2026 = 2771.33; // salaire social minimum non qualifié, indice 992,24
const HOURS = 151.67;

export const AMOUNTS: readonly number[] = Object.freeze([
  ...Array.from({ length: 32 }, (_, i) => 1900 + i * 100), // 1 900 … 5 000 €
  5500, 6000, 7000, 8000, 9000, 10000,
]);

export type SalaryCountry = 'france' | 'belgique' | 'luxembourg';
const PATHS: Record<SalaryCountry, { fr: string; en: string }> = {
  france: { fr: '/salaire-brut-net', en: '/en/gross-to-net-salary-france' },
  belgique: { fr: '/salaire-brut-net-belgique', en: '/en/gross-to-net-salary-belgium' },
  luxembourg: { fr: '/salaire-brut-net-luxembourg', en: '/en/gross-to-net-salary-luxembourg' },
};
export function countryPath(c: SalaryCountry, locale: PageLocale): string { return PATHS[c][locale]; }
export function amountPath(amount: number | 'smic'): string { return `/salaire-brut-net/${amount === 'smic' ? 'smic' : `${amount}-euros`}`; }

/** « france », « france/2500-euros », « france/smic », « belgique »… → route, ou null. */
export function parseSalaryRoute(slug: string): { country: SalaryCountry; amount: number | 'smic' | null } | null {
  const parts = String(slug ?? '').toLowerCase().split('/').filter(Boolean);
  const country = parts[0] as SalaryCountry;
  if (!(country in PATHS)) return null;
  if (parts.length === 1) return { country, amount: null };
  if (parts.length !== 2 || country !== 'france') return null;
  if (parts[1] === 'smic') return { country, amount: 'smic' };
  const m = parts[1].match(/^(\d{3,6})-euros$/);
  if (!m || !AMOUNTS.includes(Number(m[1]))) return null;
  return { country, amount: Number(m[1]) };
}

export function frNet(grossMonthly: number) {
  return {
    nonCadre: grossMonthly * (1 - FR_RATES.nonCadre),
    cadre: grossMonthly * (1 - FR_RATES.cadre),
  };
}

const nfFr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nfFr2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfEn = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
function eur(v: number, locale: PageLocale): string { return locale === 'en' ? `€${nfEn.format(Math.round(v))}` : `${nfFr.format(Math.round(v))} €`; }
function eur2(v: number): string { return `${nfFr2.format(v)} €`; }

const STYLE = `
  .sal-calc{ margin-top:8px; padding:26px; border:1px solid var(--zj-line); background:#fff; }
  .sal-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; }
  .sal-grid label{ display:block; font-size:12px; color:var(--zj-muted); margin-bottom:6px; }
  .sal-grid input,.sal-grid select{ width:100%; padding:11px 12px; border:1px solid var(--zj-line); font:inherit; font-size:15px; background:#fff; }
  .sal-out{ margin-top:18px; padding:18px 20px; background:var(--zj-bg-soft,#F6F7F9); border:1px solid var(--zj-line); }
  .sal-big{ font-family:'Cormorant Garamond',Georgia,serif; font-size:34px; color:var(--zj-blue); margin:0; line-height:1.15; }
  .sal-lines{ list-style:none; padding:0; margin:10px 0 0; font-size:14px; }
  .sal-lines li{ display:flex; justify-content:space-between; gap:16px; padding:6px 0; border-bottom:1px dashed var(--zj-line); }
  .sal-table{ width:100%; border-collapse:collapse; font-size:14px; font-variant-numeric:tabular-nums; }
  .sal-table th,.sal-table td{ padding:10px 12px; border-bottom:1px solid var(--zj-line); text-align:right; white-space:nowrap; }
  .sal-table th:first-child,.sal-table td:first-child{ text-align:left; }
  .sal-table thead th{ font-size:12px; color:var(--zj-muted); font-weight:600; }
  .sal-wrap{ overflow-x:auto; }
  .sal-note{ font-size:12.5px; color:var(--zj-muted); }
  .sal-amounts{ display:flex; flex-wrap:wrap; gap:6px 14px; padding:0; list-style:none; }
  .sal-amounts a{ color:var(--zj-blue); }
`;

// Formules du navigateur : mêmes calculs que le domaine (outils.html utilise les mêmes).
const ENGINE = `
var ZJ={nfFr:new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}),nfEn:new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}),
eur:function(v,l){return l==='en'?'€'+ZJ.nfEn.format(Math.round(v)):ZJ.nfFr.format(Math.round(v))+' €';},
num:function(f,n){var el=f.querySelector('[name="'+n+'"]');return el?Number(String(el.value).replace(/[\\s€]/g,'').replace(/,(?=\\d{3}\\b)/g,'').replace(',','.'))||0:0;},
val:function(f,n){var el=f.querySelector('[name="'+n+'"]');return el?el.value:'';},
prog:function(t,b){var x=0;for(var i=0;i<b.length;i++){if(t<=b[i][0])break;var u=b[i][1]===null?t:Math.min(t,b[i][1]);x+=Math.max(0,u-b[i][0])*b[i][2];}return x;},
be:function(g){if(g<=${BE_WORK_BONUS_CEILING_ANNUAL})return null;var B=[[0,16720,0.25],[16720,29510,0.40],[29510,51070,0.45],[51070,null,0.50]];var s=g*0.1307,t=g-s-Math.min((g-s)*0.30,6070);var fed=Math.max(0,ZJ.prog(t,B)-ZJ.prog(11550,B));var tax=fed*1.07;return {social:s,tax:tax,net:g-s-tax};},
lu:function(g){var B=[[0,13230,0],[13230,15435,0.08],[15435,17640,0.09],[17640,19845,0.10],[19845,22050,0.11],[22050,24255,0.12],[24255,26550,0.14],[26550,28845,0.16],[28845,31140,0.18],[31140,33435,0.20],[33435,35730,0.22],[35730,38025,0.24],[38025,40320,0.26],[40320,42615,0.28],[42615,44910,0.30],[44910,47205,0.32],[47205,49500,0.34],[49500,51795,0.36],[51795,54090,0.38],[54090,117450,0.39],[117450,176160,0.40],[176160,234870,0.41],[234870,null,0.42]];
var ph=Math.min(g,12*13856.63)*0.1155,s=ph+0.014*Math.max(0,g-12*692.83),t=Math.max(0,g-ph-540-480);
var cr=(g<936||g>=80000)?0:((g<=11265?300+(g-936)*0.029:g<=40000?600:600-(g-40000)*0.015)+(g<=40000?216:216-(g-40000)*0.0054));
var tax=ZJ.prog(t,B)*(t>150000?1.09:1.07)-cr;return {social:s,tax:tax,net:g-s-tax};},
lines:function(a){return '<ul class="sal-lines">'+a.map(function(x){return '<li><span>'+x[0]+'</span><b>'+x[1]+'</b></li>';}).join('')+'</ul>';},
bind:function(id,fn){var f=document.getElementById(id);if(!f)return;var run=function(){f.querySelector('[data-out]').innerHTML=fn(f);};f.addEventListener('input',run);f.addEventListener('change',run);f.addEventListener('submit',function(e){e.preventDefault();run();});run();}};`;

function faqHtml(faq: { q: string; a: string }[], title: string): string {
  return `<section class="city-section city-faq"><h2>${esc(title)}</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>`;
}
function ld(locale: PageLocale, name: string, url: string, crumbs: { name: string; url: string }[], faq: { q: string; a: string }[]): unknown[] {
  return [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) },
    { '@context': 'https://schema.org', '@type': 'WebApplication', name, url, inLanguage: locale, applicationCategory: 'FinanceApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } },
    ...(faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
  ];
}

function page(opts: { locale: PageLocale; path: string; alternates?: { fr: string; en: string }; title: string; description: string; h1: string; lead: string; crumbs: { name: string; path: string }[]; body: string; faq: { q: string; a: string }[]; faqTitle: string; script: string; appName: string }): string {
  const { locale } = opts;
  const q = locale === 'en' ? '?lang=en' : '';
  const canonical = SITE + opts.path;
  const crumbsAbs = opts.crumbs.map((c) => ({ name: c.name, url: SITE + c.path }));
  return `${head({ locale, title: opts.title, description: shortText(opts.description, 158), canonical, alternates: opts.alternates ? { fr: SITE + opts.alternates.fr, en: SITE + opts.alternates.en } : undefined, robots: 'index,follow', jsonLd: ld(locale, opts.appName, canonical, crumbsAbs, opts.faq) })
    .replace('</style>', CITY_STYLE + STYLE + '</style>')}
<body>
${navHtml(locale, opts.alternates ? opts.alternates.fr : opts.path, opts.alternates ? opts.alternates.en : opts.path)}
<main id="contenu">
<header class="city-hero hero"><div class="wrap">
  <p class="crumbs">${opts.crumbs.map((c, i) => i === opts.crumbs.length - 1 ? esc(c.name) : `<a href="${esc(c.path === '/' ? sitePath('/', q) : c.path)}">${esc(c.name)}</a><span>›</span>`).join('')}</p>
  <h1>${esc(opts.h1)}</h1>
  <p>${esc(opts.lead)}</p>
</div></header>
<div class="wrap">
${opts.body}
${faqHtml(opts.faq, opts.faqTitle)}
</div>
</main>
<footer></footer>
<script>${ENGINE}</script>
<script>${opts.script}</script>
</body>
</html>
`;
}

function table(headCells: string[], rows: string[][]): string {
  return `<div class="sal-wrap"><table class="sal-table"><thead><tr>${headCells.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const FR_TABLE = [SMIC_MONTHLY_2026, 2000, 2200, 2500, 2800, 3000, 3500, 4000, 4500, 5000, 6000];
const BE_TABLE = [3400, 3600, 4000, 4500, 5000, 5500, 6000, 7000, 8000];
const LU_TABLE = [LU_SSM_2026, 3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 10000];

// ------------------------------------------------------------------ France
function franceCountry(locale: PageLocale): string {
  const en = locale === 'en';
  const smic = frNet(SMIC_MONTHLY_2026);
  const rows = FR_TABLE.map((g) => {
    const n = frNet(g);
    const label = g === SMIC_MONTHLY_2026 ? `${en ? `€${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2 }).format(g)}` : eur2(g)} ${en ? '(minimum wage)' : '(SMIC)'}` : eur(g, locale);
    const link = !en ? `<a href="${g === SMIC_MONTHLY_2026 ? amountPath('smic') : amountPath(g)}">${label}</a>` : label;
    return [link, eur(n.nonCadre, locale), eur(n.cadre, locale), eur(n.nonCadre * 12, locale)];
  });
  const faq = en
    ? [
        { q: 'How do I convert a French gross salary to net?', a: `Deduct the employee social contributions: about ${FR_RATES.nonCadre * 100}% for a non-executive employee and ${FR_RATES.cadre * 100}% for an executive (cadre). A gross salary of €2,500 a month gives about ${eur(frNet(2500).nonCadre, 'en')} net before income tax.` },
        { q: 'What is the French minimum wage in 2026?', a: `€${SMIC_HOURLY_2026} gross an hour since 1 June 2026, i.e. €${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2 }).format(SMIC_MONTHLY_2026)} gross a month for 35 hours a week — about ${eur(smic.nonCadre, 'en')} net before tax.` },
        { q: 'And income tax?', a: 'In France income tax is withheld at source at the household’s personal rate, shown on the payslip. It depends on the whole household’s income: use the official simulator on impots.gouv.fr.' },
      ]
    : [
        { q: 'Comment calculer un salaire net à partir du brut ?', a: `Retirez les cotisations salariales : environ ${FR_RATES.nonCadre * 100} % pour un salarié non-cadre et ${FR_RATES.cadre * 100} % pour un cadre. 2 500 € bruts par mois donnent environ ${eur(frNet(2500).nonCadre, 'fr')} nets avant impôt.` },
        { q: 'Quel est le SMIC net en 2026 ?', a: `${String(SMIC_HOURLY_2026).replace('.', ',')} € bruts de l’heure depuis le 1er juin 2026, soit ${eur2(SMIC_MONTHLY_2026)} bruts par mois pour 35 heures par semaine : environ ${eur(smic.nonCadre, 'fr')} nets avant impôt.` },
        { q: 'Et l’impôt sur le revenu ?', a: 'Il est prélevé à la source au taux personnel du foyer, indiqué sur la fiche de paie. Il dépend des revenus de tout le foyer : utilisez le simulateur officiel d’impots.gouv.fr.' },
        { q: 'Pourquoi un cadre a-t-il moins de net pour le même brut ?', a: 'Le cadre cotise davantage, notamment à la retraite complémentaire (Agirc-Arrco) et à l’APEC : environ 25 % de cotisations salariales contre 22 % pour un non-cadre.' },
      ];
  const body = `<section class="city-section"><h2>${en ? 'Calculate my net salary' : 'Calculer mon salaire net'}</h2>
  <form class="sal-calc" id="sal-fr" novalidate><div class="sal-grid">
    <div><label for="f-g">${en ? 'Gross salary (€)' : 'Salaire brut (€)'}</label><input id="f-g" name="g" inputmode="decimal" value="2500"></div>
    <div><label for="f-p">${en ? 'Period' : 'Période'}</label><select id="f-p" name="p"><option value="m">${en ? 'per month' : 'par mois'}</option><option value="y">${en ? 'per year' : 'par an'}</option><option value="h">${en ? 'per hour' : 'de l’heure'}</option></select></div>
    <div><label for="f-s">${en ? 'Status' : 'Statut'}</label><select id="f-s" name="s"><option value="nc">${en ? 'Non-executive (22%)' : 'Non-cadre (22 %)'}</option><option value="c">${en ? 'Executive / cadre (25%)' : 'Cadre (25 %)'}</option></select></div>
  </div><div class="sal-out" data-out aria-live="polite"></div></form>
  <p class="sal-note">${en ? 'Net before income tax, full-time (151.67 hours a month). Contribution rates are the usual averages; your payslip may differ slightly (mutual insurance, overtime, sector).' : 'Net avant impôt, temps plein (151,67 heures par mois). Taux de cotisations usuels ; votre fiche de paie peut légèrement différer (mutuelle, heures supplémentaires, secteur).'}</p></section>
<section class="city-section"><h2>${en ? 'Gross to net: table' : 'Tableau brut → net'}</h2>${table(en ? ['Gross / month', 'Net non-executive', 'Net executive', 'Net / year (non-exec.)'] : ['Brut mensuel', 'Net non-cadre', 'Net cadre', 'Net annuel (non-cadre)'], rows)}</section>
${en ? '' : `<section class="city-section"><h2>Un montant précis</h2><ul class="sal-amounts"><li><a href="${amountPath('smic')}">SMIC</a></li>${AMOUNTS.map((a) => `<li><a href="${amountPath(a)}">${nfFr.format(a)} € brut</a></li>`).join('')}</ul></section>`}
<section class="city-section"><h2>${en ? 'Working across the border?' : 'Vous travaillez de l’autre côté de la frontière ?'}</h2><ul class="city-links"><li><a href="${countryPath('belgique', locale)}">${en ? 'Gross to net in Belgium' : 'Salaire brut en net en Belgique'}</a></li><li><a href="${countryPath('luxembourg', locale)}">${en ? 'Gross to net in Luxembourg' : 'Salaire brut en net au Luxembourg'}</a></li><li><a href="${sitePath('/outils', en ? '?lang=en' : '')}#legislation">${en ? 'Labour law FR, BE, LU' : 'Droit du travail FR, BE, LU'}</a></li><li><a href="${sitePath('/', en ? '?lang=en' : '')}#recherche">${en ? 'Jobs with the salary shown' : 'Offres avec le salaire affiché'}</a></li></ul></section>`;
  const script = `ZJ.bind('sal-fr',function(f){var g=ZJ.num(f,'g'),p=ZJ.val(f,'p'),r=ZJ.val(f,'s')==='c'?${FR_RATES.cadre}:${FR_RATES.nonCadre},L='${locale}';if(!(g>0))return '<p>${en ? 'Enter a gross salary.' : 'Indiquez un salaire brut.'}</p>';var m=p==='y'?g/12:p==='h'?g*${HOURS}:g;var n=m*(1-r);return '<p class="sal-big">'+ZJ.eur(n,L)+' ${en ? 'net / month' : 'nets / mois'}</p>'+ZJ.lines([['${en ? 'Gross / month' : 'Brut mensuel'}',ZJ.eur(m,L)],['${en ? 'Employee contributions' : 'Cotisations salariales'}','−'+ZJ.eur(m*r,L)],['${en ? 'Net / year' : 'Net annuel'}',ZJ.eur(n*12,L)],['${en ? 'Net / hour' : 'Net horaire'}',(L==='en'?'€'+(n/${HOURS}).toFixed(2):(n/${HOURS}).toFixed(2).replace('.',',')+' €')]]);});`;
  return page({
    locale, path: countryPath('france', locale), alternates: PATHS.france,
    title: en ? 'French gross to net salary calculator 2026 (executive, non-executive) | Z Jobs' : 'Salaire brut en net 2026 : calcul gratuit (cadre, non-cadre) | Z Jobs',
    description: en ? `Convert a French gross salary to net in 2026: about 22% of employee contributions (non-executive), 25% (executive). €2,500 gross ≈ ${eur(frNet(2500).nonCadre, 'en')} net a month. Table and minimum wage.` : `Calculez votre salaire net à partir du brut en 2026 : environ 22 % de cotisations (non-cadre), 25 % (cadre). 2 500 € brut ≈ ${eur(frNet(2500).nonCadre, 'fr')} net par mois. Tableau et SMIC net.`,
    h1: en ? 'French gross to net salary calculator' : 'Salaire brut en net : le calcul 2026',
    lead: en ? 'Monthly, yearly or hourly, executive or not: your net salary before income tax, from the usual contribution rates.' : 'Mensuel, annuel ou horaire, cadre ou non-cadre : votre salaire net avant impôt, aux taux de cotisations usuels.',
    crumbs: [{ name: 'Z Jobs', path: '/' }, { name: en ? 'Gross to net — France' : 'Salaire brut en net', path: countryPath('france', locale) }],
    body, faq, faqTitle: en ? 'Questions' : 'Questions fréquentes', script, appName: en ? 'French gross to net salary calculator' : 'Simulateur salaire brut en net',
  });
}

function franceAmount(amount: number | 'smic'): string {
  const g = amount === 'smic' ? SMIC_MONTHLY_2026 : amount;
  const n = frNet(g);
  const label = amount === 'smic' ? 'SMIC' : `${nfFr.format(g)} € brut`;
  const ratio = g / SMIC_MONTHLY_2026;
  const be = calculateBelgianNetSalary(g * 12);
  const lu = calculateLuxembourgNetSalary(g * 12);
  const idx = amount === 'smic' ? -1 : AMOUNTS.indexOf(amount);
  const neighbours = (amount === 'smic' ? AMOUNTS.slice(0, 4) : AMOUNTS.slice(Math.max(0, idx - 3), idx).concat(AMOUNTS.slice(idx + 1, idx + 4)));
  const h1 = amount === 'smic' ? 'SMIC brut en net : combien en 2026 ?' : `${nfFr.format(g)} € brut en net : combien en 2026 ?`;
  const faq = [
    { q: `Combien font ${amount === 'smic' ? 'le SMIC' : `${nfFr.format(g)} € brut`} en net ?`, a: `Environ ${eur(n.nonCadre, 'fr')} nets par mois avant impôt pour un salarié non-cadre (22 % de cotisations) et ${eur(n.cadre, 'fr')} pour un cadre (25 %), soit ${eur(n.nonCadre * 12, 'fr')} et ${eur(n.cadre * 12, 'fr')} par an.` },
    { q: 'Et après l’impôt sur le revenu ?', a: 'Le prélèvement à la source dépend du taux personnel du foyer (fiche de paie, espace impots.gouv.fr). Une personne seule sans autre revenu paie en général peu ou pas d’impôt au niveau du SMIC.' },
    { q: `Quel salaire horaire pour ${amount === 'smic' ? 'le SMIC' : `${nfFr.format(g)} € brut par mois`} ?`, a: `${eur2(g / HOURS)} bruts de l’heure, soit environ ${eur2(n.nonCadre / HOURS)} nets (non-cadre), sur la base de 35 heures par semaine (151,67 heures par mois).` },
  ];
  const body = `<section class="city-section"><h2>Le net en un coup d’œil</h2>
  ${table(['', 'Non-cadre (22 %)', 'Cadre (25 %)'], [
    ['Net mensuel avant impôt', `<b>${eur(n.nonCadre, 'fr')}</b>`, `<b>${eur(n.cadre, 'fr')}</b>`],
    ['Net annuel', eur(n.nonCadre * 12, 'fr'), eur(n.cadre * 12, 'fr')],
    ['Net horaire (35 h)', eur2(n.nonCadre / HOURS), eur2(n.cadre / HOURS)],
    ['Brut annuel', eur(g * 12, 'fr'), eur(g * 12, 'fr')],
    ['Cotisations salariales / mois', eur(g * FR_RATES.nonCadre, 'fr'), eur(g * FR_RATES.cadre, 'fr')],
  ])}
  <p class="sal-note">${amount === 'smic' ? `Le SMIC est de ${String(SMIC_HOURLY_2026).replace('.', ',')} € bruts de l’heure depuis le 1er juin 2026.` : `C’est ${ratio >= 1 ? `${ratio.toFixed(2).replace('.', ',')} fois le SMIC` : 'moins que le SMIC à temps plein'} (${eur2(SMIC_MONTHLY_2026)} bruts par mois).`} Taux de cotisations usuels ; la fiche de paie peut légèrement différer.</p></section>
<section class="city-section"><h2>Le même brut en Belgique et au Luxembourg</h2>
  ${table(['Pays', 'Net mensuel estimé', 'Base'], [
    ['France', eur(n.nonCadre, 'fr'), 'avant impôt, non-cadre'],
    ['Belgique', be ? eur(be.netMonthly, 'fr') : '—', be ? 'après impôt, employé isolé' : 'bonus à l’emploi : voir Tax-Calc'],
    ['Luxembourg', eur(lu.netMonthly, 'fr'), 'après impôt, classe 1'],
  ])}
  <p class="sal-note">Belgique et Luxembourg : impôt compris (barèmes 2026), ce qui n’est pas le cas du chiffre français. <a href="${countryPath('belgique', 'fr')}">Détail Belgique</a> · <a href="${countryPath('luxembourg', 'fr')}">Détail Luxembourg</a></p></section>
<section class="city-section"><h2>Calculer un autre montant</h2><ul class="sal-amounts">${amount === 'smic' ? '' : `<li><a href="${amountPath('smic')}">SMIC</a></li>`}${neighbours.map((a) => `<li><a href="${amountPath(a)}">${nfFr.format(a)} € brut</a></li>`).join('')}<li><a href="${countryPath('france', 'fr')}">Simulateur complet →</a></li></ul></section>
<section class="city-section"><h2>Trouver un emploi à ce salaire</h2><p>Sur Z Jobs, chaque offre affiche son salaire, comparé au minimum légal et aux grilles des conventions collectives.</p><ul class="city-links"><li><a href="/#recherche">Voir les offres</a></li><li><a href="/emploi/paris-75056">Emploi à Paris</a></li><li><a href="/emploi/lyon-69123">Emploi à Lyon</a></li></ul></section>`;
  const path = amountPath(amount);
  return page({
    locale: 'fr', path,
    title: amount === 'smic' ? `SMIC net 2026 : ${eur(n.nonCadre, 'fr')} par mois (brut ${eur2(SMIC_MONTHLY_2026)}) | Z Jobs` : `${nfFr.format(g)} € brut en net 2026 : ${eur(n.nonCadre, 'fr')} par mois | Z Jobs`,
    description: `${label} par mois = environ ${eur(n.nonCadre, 'fr')} nets avant impôt (non-cadre), ${eur(n.cadre, 'fr')} (cadre). Net annuel, horaire, et le même brut en Belgique et au Luxembourg.`,
    h1, lead: `${label} par mois, c’est environ ${eur(n.nonCadre, 'fr')} nets avant impôt pour un salarié non-cadre et ${eur(n.cadre, 'fr')} pour un cadre.`,
    crumbs: [{ name: 'Z Jobs', path: '/' }, { name: 'Salaire brut en net', path: countryPath('france', 'fr') }, { name: label, path }],
    body, faq, faqTitle: 'Questions fréquentes', script: '', appName: h1,
  });
}

// ------------------------------------------------------------------ Belgique / Luxembourg
function belgium(locale: PageLocale): string {
  const en = locale === 'en';
  const ceilingMonthly = BE_WORK_BONUS_CEILING_ANNUAL / 12;
  const rows = BE_TABLE.map((g) => { const r = calculateBelgianNetSalary(g * 12)!; return [eur(g, locale), eur(r.socialContributions / 12, locale), eur(r.incomeTax / 12, locale), `<b>${eur(r.netMonthly, locale)}</b>`]; });
  const ex = calculateBelgianNetSalary(4000 * 12)!;
  const faq = en
    ? [
        { q: 'How is net salary calculated in Belgium?', a: `Social security (13.07%) is deducted from gross pay, then a flat-rate deduction for professional expenses (30%, capped at €6,070 a year), then income tax on the 25/40/45/50% scale after the €11,550 tax-free allowance, plus an average municipal surcharge of 7%. €4,000 gross a month gives about ${eur(ex.netMonthly, 'en')} net.` },
        { q: 'Why no result below €3,337 gross a month?', a: 'Below that amount the work bonus (bonus à l’emploi / werkbonus) reduces social security and tax significantly; it is not modelled here. Use the FPS Finance Tax-Calc.' },
      ]
    : [
        { q: 'Comment est calculé le salaire net en Belgique ?', a: `On retire l’ONSS (13,07 %), puis des frais professionnels forfaitaires (30 %, au plus 6 070 € par an), puis l’impôt au barème 25/40/45/50 % après la quotité exemptée de 11 550 €, et une taxe communale moyenne de 7 %. 4 000 € bruts par mois donnent environ ${eur(ex.netMonthly, 'fr')} nets.` },
        { q: `Pourquoi pas de résultat sous ${eur(ceilingMonthly, 'fr')} bruts par mois ?`, a: 'En dessous, le bonus à l’emploi réduit fortement l’ONSS et l’impôt ; il n’est pas modélisé ici. Utilisez Tax-Calc du SPF Finances.' },
        { q: 'Le simulateur tient-il compte de ma situation familiale ?', a: 'Non : il calcule pour une personne isolée sans enfant. Les enfants à charge et le conjoint augmentent la quotité exemptée et donc le net.' },
      ];
  const body = `<section class="city-section"><h2>${en ? 'Calculate my net salary in Belgium' : 'Calculer mon salaire net en Belgique'}</h2>
  <form class="sal-calc" id="sal-be" novalidate><div class="sal-grid">
    <div><label for="f-g">${en ? 'Gross salary (€)' : 'Salaire brut (€)'}</label><input id="f-g" name="g" inputmode="decimal" value="4000"></div>
    <div><label for="f-p">${en ? 'Period' : 'Période'}</label><select id="f-p" name="p"><option value="m">${en ? 'per month' : 'par mois'}</option><option value="y">${en ? 'per year' : 'par an'}</option></select></div>
  </div><div class="sal-out" data-out aria-live="polite"></div></form>
  <p class="sal-note">${en ? 'Private-sector employee, single, no children, 2026 income. Special social security contribution not included. Not a substitute for the FPS Finance Tax-Calc.' : 'Employé du secteur privé, personne isolée sans enfant, revenus 2026. Cotisation spéciale de sécurité sociale non incluse. Ne remplace pas Tax-Calc du SPF Finances.'}</p></section>
<section class="city-section"><h2>${en ? 'Gross to net: table' : 'Tableau brut → net'}</h2>${table(en ? ['Gross / month', 'Social security', 'Income tax', 'Net / month'] : ['Brut mensuel', 'ONSS', 'Impôt', 'Net mensuel'], rows)}</section>
<section class="city-section"><h2>${en ? 'Other countries' : 'Les autres pays'}</h2><ul class="city-links"><li><a href="${countryPath('france', locale)}">${en ? 'France' : 'France'}</a></li><li><a href="${countryPath('luxembourg', locale)}">Luxembourg</a></li><li><a href="${sitePath('/outils', en ? '?lang=en' : '')}#legislation">${en ? 'Labour law FR, BE, LU' : 'Droit du travail FR, BE, LU'}</a></li></ul></section>`;
  const script = `ZJ.bind('sal-be',function(f){var g=ZJ.num(f,'g'),L='${locale}';if(!(g>0))return '<p>${en ? 'Enter a gross salary.' : 'Indiquez un salaire brut.'}</p>';var y=ZJ.val(f,'p')==='y'?g:g*12;var r=ZJ.be(y);if(!r)return '<p>${en ? 'Below €3,337 gross a month the work bonus applies: use the FPS Finance Tax-Calc.' : 'Sous 3 337 € bruts par mois, le bonus à l’emploi s’applique : utilisez Tax-Calc du SPF Finances.'}</p>';return '<p class="sal-big">'+ZJ.eur(r.net/12,L)+' ${en ? 'net / month' : 'nets / mois'}</p>'+ZJ.lines([['${en ? 'Gross / year' : 'Brut annuel'}',ZJ.eur(y,L)],['${en ? 'Social security (13.07%)' : 'ONSS (13,07 %)'}','−'+ZJ.eur(r.social,L)],['${en ? 'Income tax' : 'Impôt (fédéral + communal)'}','−'+ZJ.eur(r.tax,L)],['${en ? 'Net / year' : 'Net annuel'}',ZJ.eur(r.net,L)]]);});`;
  return page({
    locale, path: countryPath('belgique', locale), alternates: PATHS.belgique,
    title: en ? 'Belgium gross to net salary calculator 2026 | Z Jobs' : 'Salaire brut en net en Belgique 2026 : calcul gratuit | Z Jobs',
    description: en ? `Belgian net salary in 2026: social security 13.07%, professional expenses, tax scale and municipal surcharge. €4,000 gross ≈ ${eur(ex.netMonthly, 'en')} net a month.` : `Salaire net en Belgique en 2026 : ONSS 13,07 %, frais professionnels, barème de l’impôt et taxe communale. 4 000 € brut ≈ ${eur(ex.netMonthly, 'fr')} net par mois.`,
    h1: en ? 'Belgium gross to net salary calculator' : 'Salaire brut en net en Belgique',
    lead: en ? 'Your net pay in Belgium after social security and income tax, on the 2026 scales.' : 'Votre salaire net en Belgique après ONSS et impôt, aux barèmes 2026.',
    crumbs: [{ name: 'Z Jobs', path: '/' }, { name: en ? 'Gross to net — Belgium' : 'Salaire brut en net — Belgique', path: countryPath('belgique', locale) }],
    body, faq, faqTitle: en ? 'Questions' : 'Questions fréquentes', script, appName: en ? 'Belgium gross to net salary calculator' : 'Simulateur salaire brut en net Belgique',
  });
}

function luxembourg(locale: PageLocale): string {
  const en = locale === 'en';
  const rows = LU_TABLE.map((g) => { const r = calculateLuxembourgNetSalary(g * 12); return [g === LU_SSM_2026 ? `${en ? `€${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2 }).format(g)}` : eur2(g)} ${en ? '(minimum wage)' : '(SSM)'}` : eur(g, locale), eur(r.socialContributions / 12, locale), eur(r.incomeTax / 12, locale), `<b>${eur(r.netMonthly, locale)}</b>`]; });
  const ex = calculateLuxembourgNetSalary(5000 * 12);
  const faq = en
    ? [
        { q: 'How is net salary calculated in Luxembourg?', a: `Contributions (pension 8.50%, health 3.05%, long-term care 1.40%) are deducted, then income tax on the art. 118 LIR scale with the 7% employment-fund surcharge, minus the 2026 CIS and CI-CO2 tax credits. €5,000 gross a month in tax class 1 gives about ${eur(ex.netMonthly, 'en')} net.` },
        { q: 'I am a cross-border worker from France or Belgium: does this apply?', a: 'Yes for the Luxembourg payslip: your salary is taxed in Luxembourg (class 1 if single). Your tax class can change with your household; the ACD calculator gives the exact figure.' },
      ]
    : [
        { q: 'Comment est calculé le salaire net au Luxembourg ?', a: `On retire les cotisations (pension 8,50 %, maladie 3,05 %, dépendance 1,40 %), puis l’impôt au barème de l’art. 118 LIR majoré de 7 % pour le fonds pour l’emploi, diminué des crédits d’impôt CIS et CI-CO2 2026. 5 000 € bruts par mois en classe 1 donnent environ ${eur(ex.netMonthly, 'fr')} nets.` },
        { q: 'Je suis frontalier français ou belge : cela s’applique-t-il ?', a: 'Oui pour la fiche de paie luxembourgeoise : votre salaire est imposé au Luxembourg (classe 1 pour une personne seule). La classe d’impôt peut changer selon le foyer ; le calcul de l’ACD donne le chiffre exact.' },
        { q: 'Quel est le salaire social minimum en 2026 ?', a: `${eur2(LU_SSM_2026)} bruts par mois pour un salarié non qualifié de 18 ans et plus (indice 992,24, 1er juin 2026), 20 % de plus pour un salarié qualifié.` },
      ];
  const body = `<section class="city-section"><h2>${en ? 'Calculate my net salary in Luxembourg' : 'Calculer mon salaire net au Luxembourg'}</h2>
  <form class="sal-calc" id="sal-lu" novalidate><div class="sal-grid">
    <div><label for="f-g">${en ? 'Gross salary (€)' : 'Salaire brut (€)'}</label><input id="f-g" name="g" inputmode="decimal" value="5000"></div>
    <div><label for="f-p">${en ? 'Period' : 'Période'}</label><select id="f-p" name="p"><option value="m">${en ? 'per month' : 'par mois'}</option><option value="y">${en ? 'per year' : 'par an'}</option></select></div>
  </div><div class="sal-out" data-out aria-live="polite"></div></form>
  <p class="sal-note">${en ? 'Tax class 1 (single), 2026. Standard minimum deductions only. Not a substitute for the ACD’s own calculation.' : 'Classe d’impôt 1 (personne seule), 2026. Minima forfaitaires seulement. Ne remplace pas le calcul de l’ACD.'}</p></section>
<section class="city-section"><h2>${en ? 'Gross to net: table' : 'Tableau brut → net'}</h2>${table(en ? ['Gross / month', 'Contributions', 'Income tax', 'Net / month'] : ['Brut mensuel', 'Cotisations', 'Impôt', 'Net mensuel'], rows)}</section>
<section class="city-section"><h2>${en ? 'Other countries' : 'Les autres pays'}</h2><ul class="city-links"><li><a href="${countryPath('france', locale)}">France</a></li><li><a href="${countryPath('belgique', locale)}">${en ? 'Belgium' : 'Belgique'}</a></li><li><a href="${sitePath('/outils', en ? '?lang=en' : '')}#legislation">${en ? 'Labour law FR, BE, LU' : 'Droit du travail FR, BE, LU'}</a></li></ul></section>`;
  const script = `ZJ.bind('sal-lu',function(f){var g=ZJ.num(f,'g'),L='${locale}';if(!(g>0))return '<p>${en ? 'Enter a gross salary.' : 'Indiquez un salaire brut.'}</p>';var y=ZJ.val(f,'p')==='y'?g:g*12;var r=ZJ.lu(y);return '<p class="sal-big">'+ZJ.eur(r.net/12,L)+' ${en ? 'net / month' : 'nets / mois'}</p>'+ZJ.lines([['${en ? 'Gross / year' : 'Brut annuel'}',ZJ.eur(y,L)],['${en ? 'Contributions' : 'Cotisations sociales'}','−'+ZJ.eur(r.social,L)],['${en ? 'Income tax (after credits)' : 'Impôt (après crédits)'}',(r.tax<0?'+':'−')+ZJ.eur(Math.abs(r.tax),L)],['${en ? 'Net / year' : 'Net annuel'}',ZJ.eur(r.net,L)]]);});`;
  return page({
    locale, path: countryPath('luxembourg', locale), alternates: PATHS.luxembourg,
    title: en ? 'Luxembourg gross to net salary calculator 2026 (tax class 1) | Z Jobs' : 'Salaire brut en net au Luxembourg 2026 : calcul classe 1 | Z Jobs',
    description: en ? `Luxembourg net salary in 2026, tax class 1: contributions, income tax, CIS and CI-CO2 credits. €5,000 gross ≈ ${eur(ex.netMonthly, 'en')} net a month. For cross-border workers too.` : `Salaire net au Luxembourg en 2026, classe 1 : cotisations, impôt, crédits CIS et CI-CO2. 5 000 € brut ≈ ${eur(ex.netMonthly, 'fr')} net par mois. Aussi pour les frontaliers.`,
    h1: en ? 'Luxembourg gross to net salary calculator' : 'Salaire brut en net au Luxembourg',
    lead: en ? 'Your Luxembourg net pay after contributions and tax, tax class 1, on the 2026 scales — for residents and cross-border workers.' : 'Votre salaire net au Luxembourg après cotisations et impôt, classe 1, aux barèmes 2026 — résidents et frontaliers.',
    crumbs: [{ name: 'Z Jobs', path: '/' }, { name: en ? 'Gross to net — Luxembourg' : 'Salaire brut en net — Luxembourg', path: countryPath('luxembourg', locale) }],
    body, faq, faqTitle: en ? 'Questions' : 'Questions fréquentes', script, appName: en ? 'Luxembourg gross to net salary calculator' : 'Simulateur salaire brut en net Luxembourg',
  });
}

export function renderSalaryPage(route: { country: SalaryCountry; amount: number | 'smic' | null }, locale: PageLocale): string {
  if (route.amount != null) return franceAmount(route.amount);
  if (route.country === 'belgique') return belgium(locale);
  if (route.country === 'luxembourg') return luxembourg(locale);
  return franceCountry(locale);
}

export function salarySitemapPaths(): string[] {
  return (['france', 'belgique', 'luxembourg'] as SalaryCountry[]).flatMap((c) => [PATHS[c].fr, PATHS[c].en])
    .concat([amountPath('smic')], AMOUNTS.map((a) => amountPath(a)));
}

export function renderSalarySitemap(): string {
  const alt = new Map<string, { fr: string; en: string }>();
  for (const c of Object.values(PATHS)) { alt.set(c.fr, c); alt.set(c.en, c); }
  const urls = salarySitemapPaths().map((p) => {
    const a = alt.get(p);
    return `  <url><loc>${esc(SITE + p)}</loc>${a ? `<xhtml:link rel="alternate" hreflang="fr" href="${esc(SITE + a.fr)}"/><xhtml:link rel="alternate" hreflang="en" href="${esc(SITE + a.en)}"/>` : ''}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}
