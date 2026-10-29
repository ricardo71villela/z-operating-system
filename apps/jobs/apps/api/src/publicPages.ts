// apps/api/src/publicPages.ts
//
// Pages publiques des offres Z Jobs, rendues côté serveur pour que Google
// (et Google pour l'emploi) les lise sans JavaScript :
//   zjobs.online/offres/<titre-ville>-<uuid>   (rewrite du site public vers
//   l'API : GET /public/offres/<slug>)
//   zjobs.online/sitemap-offres.xml            (GET /public/sitemap-offres.xml)
//
// Chaque page porte les données structurées JobPosting de schema.org
// (https://developers.google.com/search/docs/appearance/structured-data/job-posting),
// avec le salaire, le lieu, la date limite et l'employeur — les mêmes
// informations que la page visible, jamais davantage.
//
// Fonctions pures : aucune base de données ici (voir server.ts et
// pgStore.getPublicOffer). Le style vient de la charte commune du site
// public (/zjobs-site.css, /zjobs-chrome.js), servie par le même domaine.

import type { PublicOfferPage, PublicOfferRecord } from './store';

export type PageLocale = 'fr' | 'en';

export const SITE = 'https://zjobs.online';
export const PORTAL_URL = 'https://z-jobs-app.vercel.app/';

const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function slugify(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[œ]/gi, 'oe')
    .replace(/[æ]/gi, 'ae')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** "/offres/developpeur-backend-lyon-<uuid>" */
export function offerPath(offer: { id: string; title: string; location?: { city?: string | null } | null; city?: string | null }): string {
  const city = offer.location?.city ?? offer.city ?? '';
  const words = slugify([offer.title, city].filter(Boolean).join(' '));
  return `/offres/${words ? words + '-' : ''}${offer.id}`;
}

/** The uuid at the end of an offer slug, or null. */
export function offerIdFromSlug(slug: string): string | null {
  const m = String(slug ?? '').toLowerCase().match(UUID);
  return m ? m[1] : null;
}

export function pageLocale(value: string | null | undefined): PageLocale {
  return value === 'en' ? 'en' : 'fr';
}

// ------------------------------------------------------------------ copy
const COPY = {
  fr: {
    offers: 'Offres',
    apply: 'Postuler sur Z Jobs',
    applyNote: 'Candidature avec votre compte Z Jobs, gratuit pour les candidats. Première réponse de l’employeur attendue sous 14 jours.',
    save: 'Enregistrer l’offre',
    salary: 'Salaire',
    contract: 'Contrat',
    place: 'Lieu',
    regime: 'Mode de travail',
    hours: 'Durée du travail',
    hoursValue: '{n} h par semaine',
    deadline: 'Date limite de candidature',
    start: 'Début souhaité',
    published: 'Publiée le',
    verified: 'Employeur vérifié',
    unverified: 'Vérification en cours',
    employerPage: 'Voir l’entreprise',
    description: 'Le poste',
    responsibilities: 'Missions',
    required: 'Profil recherché',
    preferred: 'Atouts appréciés',
    benefits: 'Avantages',
    variable: 'Rémunération variable',
    duration: 'Durée du contrat',
    process: 'Déroulement du recrutement',
    languages: 'Langues',
    questions: 'Questions de l’employeur',
    questionsIntro: 'Vous y répondrez en postulant. Les réponses aident l’employeur à lire votre candidature ; elles ne la rejettent jamais automatiquement.',
    optional: 'facultatif',
    similar: 'Offres similaires',
    allOffers: 'Toutes les offres',
    salaryShown: 'Salaire affiché par l’employeur, comparé aux grilles officielles des conventions collectives.',
    goneTitle: 'Cette offre n’est plus disponible',
    goneBody: 'L’offre a été pourvue, retirée, ou sa date limite est passée. D’autres offres vérifiées, avec le salaire affiché, vous attendent.',
    goneCta: 'Rechercher une offre',
    remoteFrom: 'Télétravail',
    titleSuffix: 'Z Jobs',
    metaSalary: 'Salaire',
  },
  en: {
    offers: 'Jobs',
    apply: 'Apply on Z Jobs',
    applyNote: 'Apply with your Z Jobs account, free for candidates. The employer’s first answer is expected within 14 days.',
    save: 'Save this job',
    salary: 'Salary',
    contract: 'Contract',
    place: 'Location',
    regime: 'Work arrangement',
    hours: 'Working hours',
    hoursValue: '{n} h per week',
    deadline: 'Application deadline',
    start: 'Expected start',
    published: 'Posted on',
    verified: 'Verified employer',
    unverified: 'Verification in progress',
    employerPage: 'See the company',
    description: 'The role',
    responsibilities: 'Responsibilities',
    required: 'What we are looking for',
    preferred: 'Nice to have',
    benefits: 'Benefits',
    variable: 'Variable pay',
    duration: 'Contract length',
    process: 'Hiring process',
    languages: 'Languages',
    questions: 'Questions from the employer',
    questionsIntro: 'You will answer them when you apply. The answers help the employer read your application; they never reject it automatically.',
    optional: 'optional',
    similar: 'Similar jobs',
    allOffers: 'All jobs',
    salaryShown: 'Salary shown by the employer, compared with the official collective-agreement scales.',
    goneTitle: 'This job is no longer available',
    goneBody: 'The position has been filled or withdrawn, or its deadline has passed. Other verified jobs with the salary shown are waiting for you.',
    goneCta: 'Search jobs',
    remoteFrom: 'Remote',
    titleSuffix: 'Z Jobs',
    metaSalary: 'Salary',
  },
} as const;

const CONTRACT: Record<PageLocale, Record<string, string>> = {
  fr: {
    permanent: 'CDI', fixed_term: 'CDD', temporary_agency: 'Intérim (entreprise de travail temporaire)', interim: 'Mission intérimaire',
    project_based: 'Contrat de chantier ou de projet', seasonal: 'Saisonnier', paid_internship: 'Stage rémunéré',
    trainee_program: 'Programme de formation (graduate)', replacement_contract: 'Contrat de remplacement', other: 'Autre contrat',
  },
  en: {
    permanent: 'Permanent contract', fixed_term: 'Fixed-term contract', temporary_agency: 'Temporary agency work', interim: 'Interim assignment',
    project_based: 'Project-based contract', seasonal: 'Seasonal', paid_internship: 'Paid internship',
    trainee_program: 'Graduate programme', replacement_contract: 'Replacement contract', other: 'Other contract',
  },
};
const REGIME: Record<PageLocale, Record<string, string>> = {
  fr: { on_site: 'Sur site', hybrid: 'Hybride', remote: 'Télétravail' },
  en: { on_site: 'On site', hybrid: 'Hybrid', remote: 'Remote' },
};
const PERIOD: Record<PageLocale, Record<string, string>> = {
  fr: { hourly: 'par heure', daily: 'par jour', monthly: 'par mois', yearly: 'par an' },
  en: { hourly: 'per hour', daily: 'per day', monthly: 'per month', yearly: 'per year' },
};
const COUNTRY: Record<PageLocale, Record<string, string>> = {
  fr: { FR: 'France', BE: 'Belgique', LU: 'Luxembourg' },
  en: { FR: 'France', BE: 'Belgium', LU: 'Luxembourg' },
};
const LANGUAGE: Record<PageLocale, Record<string, string>> = {
  fr: { fr: 'Français', en: 'Anglais', de: 'Allemand', nl: 'Néerlandais', lb: 'Luxembourgeois', it: 'Italien', es: 'Espagnol', pt: 'Portugais' },
  en: { fr: 'French', en: 'English', de: 'German', nl: 'Dutch', lb: 'Luxembourgish', it: 'Italian', es: 'Spanish', pt: 'Portuguese' },
};

// ------------------------------------------------------------------ helpers
export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** JSON for a <script type="application/ld+json"> block (no "</script>" breakout). */
function ldJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/** Plain text → paragraphs; lines starting with "-", "•" or "*" become a list. */
export function textToHtml(text: string | null | undefined): string {
  const blocks = String(text ?? '').replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).filter((b) => b.trim());
  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0 && lines.every((l) => /^[-•*]\s+/.test(l))) {
      return '<ul>' + lines.map((l) => `<li>${esc(l.replace(/^[-•*]\s+/, ''))}</li>`).join('') + '</ul>';
    }
    return `<p>${lines.map(esc).join('<br>')}</p>`;
  }).join('\n');
}

function fmtMoney(n: number, currency: string, locale: PageLocale): string {
  try {
    return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

export function salaryText(o: Pick<PublicOfferRecord, 'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salaryPeriod'>, locale: PageLocale): string {
  const min = fmtMoney(o.salaryMin, o.salaryCurrency, locale);
  const range = o.salaryMax && o.salaryMax > o.salaryMin ? `${min} – ${fmtMoney(o.salaryMax, o.salaryCurrency, locale)}` : min;
  return `${range} ${PERIOD[locale][o.salaryPeriod] ?? ''}`.trim();
}

function fmtDate(iso: string | null | undefined, locale: PageLocale): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(d);
}

export function placeText(o: { location?: PublicOfferRecord['location']; workRegime?: string }, locale: PageLocale): string {
  const loc = o.location;
  if (!loc) return o.workRegime === 'remote' ? COPY[locale].remoteFrom : '';
  const country = COUNTRY[locale][loc.countryCode] ?? loc.countryCode;
  const dept = loc.postalCode && loc.countryCode === 'FR' ? ` (${String(loc.postalCode).slice(0, 2)})` : '';
  return loc.city ? `${loc.city}${dept}, ${country}` : country;
}

const EMPLOYMENT_TYPE: Record<string, string> = {
  permanent: 'FULL_TIME', fixed_term: 'TEMPORARY', temporary_agency: 'TEMPORARY', interim: 'TEMPORARY',
  project_based: 'CONTRACTOR', seasonal: 'TEMPORARY', paid_internship: 'INTERN', trainee_program: 'INTERN',
  replacement_contract: 'TEMPORARY', other: 'OTHER',
};
const UNIT_TEXT: Record<string, string> = { hourly: 'HOUR', daily: 'DAY', monthly: 'MONTH', yearly: 'YEAR' };

function absoluteUrl(path: string, locale: PageLocale): string {
  return SITE + path + (locale === 'en' ? '?lang=en' : '');
}

/** schema.org JobPosting for Google for Jobs — only facts shown on the page. */
export function jobPostingJsonLd(o: PublicOfferPage, locale: PageLocale): Record<string, unknown> {
  const types = new Set<string>();
  types.add(o.weeklyHours !== null && o.weeklyHours > 0 && o.weeklyHours < 30 ? 'PART_TIME' : 'FULL_TIME');
  const contractType = EMPLOYMENT_TYPE[o.contractType] ?? 'OTHER';
  if (contractType !== 'FULL_TIME') types.add(contractType);
  const description = [
    textToHtml(o.description),
    o.responsibilities ? `<h3>${esc(COPY[locale].responsibilities)}</h3>${textToHtml(o.responsibilities)}` : '',
    o.requiredQualifications ? `<h3>${esc(COPY[locale].required)}</h3>${textToHtml(o.requiredQualifications)}` : '',
    o.preferredQualifications ? `<h3>${esc(COPY[locale].preferred)}</h3>${textToHtml(o.preferredQualifications)}` : '',
    o.benefits ? `<h3>${esc(COPY[locale].benefits)}</h3>${textToHtml(o.benefits)}` : '',
  ].filter(Boolean).join('\n');

  const org: Record<string, unknown> = { '@type': 'Organization', name: o.employer.displayName };
  if (o.employer.website && /^https?:\/\//.test(o.employer.website)) org.sameAs = o.employer.website;
  if (o.employer.logoUrl && /^https:\/\//.test(o.employer.logoUrl)) org.logo = o.employer.logoUrl;

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: o.title,
    description,
    identifier: { '@type': 'PropertyValue', name: 'Z Jobs', value: o.id },
    datePosted: o.publishedAt.slice(0, 10),
    employmentType: [...types],
    hiringOrganization: org,
    directApply: false,
    url: absoluteUrl(offerPath(o), locale),
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: o.salaryCurrency || 'EUR',
      value: {
        '@type': 'QuantitativeValue',
        ...(o.salaryMax && o.salaryMax > o.salaryMin ? { minValue: o.salaryMin, maxValue: o.salaryMax } : { value: o.salaryMin }),
        unitText: UNIT_TEXT[o.salaryPeriod] ?? 'MONTH',
      },
    },
  };
  const validThrough = o.applicationDeadline ? `${o.applicationDeadline}T23:59:59+01:00` : o.expiresAt;
  if (validThrough) ld.validThrough = validThrough;
  if (o.location) {
    const address: Record<string, unknown> = { '@type': 'PostalAddress', addressCountry: o.location.countryCode };
    if (o.location.city) address.addressLocality = o.location.city;
    if (o.location.postalCode) address.postalCode = o.location.postalCode;
    if (o.location.adminArea) address.addressRegion = o.location.adminArea;
    ld.jobLocation = { '@type': 'Place', address };
  }
  if (o.workRegime === 'remote') {
    ld.jobLocationType = 'TELECOMMUTE';
    ld.applicantLocationRequirements = { '@type': 'Country', name: o.location?.countryCode ?? 'FR' };
  }
  if (o.weeklyHours) ld.workHours = `${o.weeklyHours} h/week`;
  if (o.expectedStartDate) ld.jobStartDate = o.expectedStartDate;
  return ld;
}

// ------------------------------------------------------------------ layout
const PAGE_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:wght@300;400;500;600&display=swap');
  *{box-sizing:border-box;} html{scroll-behavior:smooth;}
  body{ margin:0; font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased; }
  a{ color:inherit; }
  .wrap{ max-width:1120px; margin:0 auto; padding:0 28px; }
  nav{ position:sticky; top:0; z-index:20; }
  .brand{ display:flex; align-items:center; gap:12px; }
  .brand img{ width:46px; height:46px; }
  .locales{ display:flex; gap:6px; font-size:11px; letter-spacing:.06em; }
  .locales a{ padding:5px 9px; border:1px solid var(--zj-line); border-radius:2px; color:var(--zj-muted); text-decoration:none; }
  .locales a[aria-current="true"]{ background:var(--zj-slate); border-color:var(--zj-slate); color:#fff; font-weight:600; }
  .navlinks a{ text-decoration:none; }
  .crumbs{ font-size:12.5px; color:var(--zj-muted); margin:0 0 22px; }
  .crumbs a{ color:var(--zj-muted); text-decoration:none; } .crumbs a:hover{ color:var(--zj-blue); }
  .crumbs span{ margin:0 8px; color:#B4BCC7; }
  .offer-hero{ padding:44px 0 36px; }
  .offer-hero h1{ font-size:clamp(32px,4.4vw,48px); line-height:1.08; margin:0 0 16px; max-width:820px; }
  .offer-employer{ display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px; font-size:15px; color:var(--zj-text); margin:0; }
  .offer-employer a{ color:var(--zj-text); text-underline-offset:3px; }
  .seal{ font-size:11px; letter-spacing:.06em; text-transform:uppercase; padding:3px 9px; border-radius:2px; background:#E6F2EC; color:#1F6B51; }
  .seal.pending{ background:var(--zj-blue-pale); color:var(--zj-blue-dark); }
  .offer-salary{ font-family:'Cormorant Garamond',Georgia,serif; font-size:30px; color:var(--zj-blue); margin:18px 0 0; }
  .offer-layout{ display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:48px; align-items:start; padding-top:40px; padding-bottom:72px; }
  .offer-body h2{ font-size:26px; margin:34px 0 10px; } .offer-body h2:first-child{ margin-top:0; }
  .offer-body p, .offer-body li{ color:var(--zj-text); font-size:15.5px; }
  .offer-body ul, .offer-body ol{ padding-left:20px; }
  .offer-body small{ color:var(--zj-muted); }
  .offer-aside{ position:sticky; top:104px; border:1px solid var(--zj-line); background:#fff; padding:26px; box-shadow:0 18px 50px rgba(58,66,80,.06); }
  .facts{ margin:0; display:grid; gap:12px; }
  .facts div{ display:grid; gap:2px; padding-bottom:12px; border-bottom:1px solid var(--zj-line); }
  .facts dt{ font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--zj-muted); }
  .facts dd{ margin:0; font-size:15px; color:var(--zj-text); }
  .apply{ display:block; text-align:center; margin-top:22px; padding:14px 18px; background:var(--zj-blue); color:#fff; text-decoration:none; font-weight:600; font-size:12.5px; letter-spacing:.08em; text-transform:uppercase; border-radius:2px; }
  .apply:hover{ background:var(--zj-blue-dark); }
  .apply.secondary{ background:#fff; color:var(--zj-blue); border:1px solid var(--zj-blue); margin-top:10px; }
  .apply.secondary:hover{ background:var(--zj-blue-pale); }
  .apply-note, .salary-note{ font-size:12.5px; color:var(--zj-muted); margin:14px 0 0; }
  .similar{ padding:56px 0 64px; }
  .similar h2{ font-size:28px; margin:0 0 22px; }
  .similar ul{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:16px; }
  .similar li a{ display:block; height:100%; border:1px solid var(--zj-line); background:#fff; padding:20px; text-decoration:none; }
  .similar li a:hover{ border-color:var(--zj-blue); }
  .similar b{ display:block; font-family:'Cormorant Garamond',Georgia,serif; font-weight:500; font-size:20px; color:var(--zj-text); line-height:1.25; }
  .similar span{ display:block; font-size:13px; color:var(--zj-muted); margin-top:6px; }
  .similar em{ display:block; font-style:normal; font-size:14px; color:var(--zj-blue); margin-top:8px; font-weight:600; }
  .gone{ padding:90px 0 110px; max-width:680px; }
  .gone h1{ font-size:clamp(30px,4vw,44px); margin:0 0 16px; }
  .gone p{ color:var(--zj-muted); }
  .gone .apply{ display:inline-block; }
  @media (max-width:900px){ .offer-layout{ grid-template-columns:1fr; gap:28px; } .offer-aside{ position:static; order:-1; } }
  @media (max-width:520px){ .wrap{ padding:0 18px; } .offer-hero{ padding:30px 0 24px; } }
`;

/* Pages statiques de la montra : la version anglaise vit sous /en/… (q = '?lang=en'). */
function sitePath(path: string, q: string): string {
  if (!q) return path;
  return path === '/' ? '/en' : `/en${path}`;
}

function head(opts: { locale: PageLocale; title: string; description: string; canonical: string; alternates?: { fr: string; en: string }; robots: string; jsonLd: unknown[] }): string {
  const { locale } = opts;
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}" />
<meta name="robots" content="${esc(opts.robots)}" />
<link rel="canonical" href="${esc(opts.canonical)}" />
${opts.alternates ? `<link rel="alternate" hreflang="fr" href="${esc(opts.alternates.fr)}" />
<link rel="alternate" hreflang="en" href="${esc(opts.alternates.en)}" />
<link rel="alternate" hreflang="x-default" href="${esc(opts.alternates.fr)}" />` : ''}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Z Jobs" />
<meta property="og:title" content="${esc(opts.title)}" />
<meta property="og:description" content="${esc(opts.description)}" />
<meta property="og:url" content="${esc(opts.canonical)}" />
<meta property="og:locale" content="${locale === 'en' ? 'en_GB' : 'fr_FR'}" />
<meta name="twitter:card" content="summary" />
${opts.jsonLd.map((ld) => `<script type="application/ld+json">${ldJson(ld)}</script>`).join('\n')}
<style>${PAGE_STYLE}</style>
<link rel="stylesheet" href="/zjobs-site.css" />
<link rel="icon" type="image/png" href="/zjobs-logo.png" />
<script src="/zjobs-chrome.js" defer></script>
</head>`;
}

function navHtml(locale: PageLocale, frHref: string, enHref: string): string {
  const L = locale === 'en'
    ? { home: 'Home', offers: 'Jobs', cand: 'For candidates', emp: 'For employers', tools: 'Legislation & tools', publish: 'Post a job', signin: 'Sign in' }
    : { home: 'Accueil', offers: 'Offres', cand: 'Pour les candidats', emp: 'Pour les employeurs', tools: 'Législation et outils', publish: 'Publier une offre', signin: 'Se connecter' };
  const q = locale === 'en' ? '?lang=en' : '';
  return `<nav>
  <div class="wrap nav-top">
    <a class="brand" href="${sitePath('/', q)}" aria-label="Z Jobs"><img src="/zjobs-logo.png" alt="Z Jobs" width="46" height="46" /><span>Z Jobs</span></a>
    <div class="navlinks"><a href="${sitePath('/', q)}#recherche" aria-current="page">${L.offers}</a>
    <a href="${sitePath('/candidats', q)}">${L.cand}</a>
    <a href="${sitePath('/employeurs', q)}">${L.emp}</a>
    <a href="${sitePath('/outils', q)}">${L.tools}</a>
    </div>
    <div class="zj-nav-actions">
      <div class="locales"><a href="${esc(frHref)}" lang="fr" hreflang="fr" aria-current="${locale === 'fr'}">FR</a><a href="${esc(enHref)}" lang="en" hreflang="en" aria-current="${locale === 'en'}">EN</a></div>
      <a class="zj-nav-publish" href="${sitePath('/employeurs', q)}" data-zj="publish">${L.publish}</a>
      <a class="nav-cta" href="${PORTAL_URL}" data-zj-app data-zj="signin">${L.signin}</a>
    </div>
  </div>
</nav>`;
}

function shortText(text: string, max: number): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).trim() + '…';
}

// ------------------------------------------------------------------ pages
export function renderOfferPage(o: PublicOfferPage, similar: PublicOfferRecord[], locale: PageLocale, questions: { label: string; kind: string; required: boolean }[] = []): string {
  const c = COPY[locale];
  const path = offerPath(o);
  const frUrl = absoluteUrl(path, 'fr');
  const enUrl = absoluteUrl(path, 'en');
  const q = locale === 'en' ? '?lang=en' : '';
  const place = placeText(o, locale);
  const salary = salaryText(o, locale);
  const contract = CONTRACT[locale][o.contractType] ?? CONTRACT[locale].other;
  const verified = /verified$/.test(o.employer.verificationStatus);
  const applyUrl = `${PORTAL_URL}?offre=${encodeURIComponent(o.id)}&lang=${locale}`;
  const employerUrl = companyPath({ id: o.organizationId, displayName: o.employer?.displayName ?? 'entreprise' }) + (locale === 'en' ? '?lang=en' : '');

  const title = `${o.title}${o.location?.city ? ' — ' + o.location.city : ''} · ${o.employer.displayName} | ${c.titleSuffix}`;
  const description = shortText(`${contract} · ${salary}${place ? ' · ' + place : ''}. ${o.employer.displayName} — ${o.description}`, 158);

  const facts: [string, string][] = [
    [c.salary, salary],
    [c.contract, contract],
    [c.place, place],
    [c.regime, REGIME[locale][o.workRegime] ?? ''],
    [c.hours, o.weeklyHours ? c.hoursValue.replace('{n}', String(o.weeklyHours).replace('.', locale === 'en' ? '.' : ',')) : ''],
    [c.start, fmtDate(o.expectedStartDate, locale)],
    [c.deadline, fmtDate(o.applicationDeadline, locale)],
    [c.published, fmtDate(o.publishedAt, locale)],
  ];
  const sections: [string, string | null][] = [
    [c.description, o.description],
    [c.responsibilities, o.responsibilities],
    [c.required, o.requiredQualifications],
    [c.preferred, o.preferredQualifications],
    [c.duration, o.contractDurationNotes],
    [c.variable, o.variableCompensationNotes ?? null],
    [c.benefits, o.benefits],
    [c.process, o.applicationProcessNotes],
  ];
  const languages = o.languageRequirements.map((code) => LANGUAGE[locale][String(code).slice(0, 2).toLowerCase()] ?? code).join(', ');

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Z Jobs', item: SITE + '/' + q },
      { '@type': 'ListItem', position: 2, name: c.offers, item: SITE + '/' + q + '#recherche' },
      { '@type': 'ListItem', position: 3, name: o.title, item: locale === 'en' ? enUrl : frUrl },
    ],
  };

  const similarHtml = similar.length
    ? `<section class="similar section-light"><div class="wrap">
  <h2>${esc(c.similar)}</h2>
  <ul>${similar.map((s) => `<li><a href="${esc(offerPath(s) + q)}"><b>${esc(s.title)}</b><span>${esc(s.employer?.displayName ?? '')}${placeText(s, locale) ? ' · ' + esc(placeText(s, locale)) : ''}</span><em>${esc(salaryText(s, locale))}</em></a></li>`).join('')}</ul>
</div></section>`
    : '';

  return `${head({
    locale, title, description,
    canonical: locale === 'en' ? enUrl : frUrl,
    alternates: { fr: frUrl, en: enUrl },
    robots: 'index,follow,max-snippet:-1',
    jsonLd: [jobPostingJsonLd(o, locale), breadcrumb],
  })}
<body>
${navHtml(locale, path, path + '?lang=en')}
<main id="contenu">
<header class="offer-hero hero">
  <div class="wrap">
    <p class="crumbs"><a href="${sitePath('/', q)}">Z Jobs</a><span>›</span><a href="${sitePath('/', q)}#recherche">${esc(c.offers)}</a><span>›</span>${esc(o.title)}</p>
    <h1>${esc(o.title)}</h1>
    <p class="offer-employer"><a href="${esc(employerUrl)}">${esc(o.employer.displayName)}</a>${verified ? `<span class="seal">${esc(c.verified)}</span>` : `<span class="seal pending">${esc(c.unverified)}</span>`}${place ? `<span>${esc(place)}</span>` : ''}<span>${esc(contract)}</span></p>
    <p class="offer-salary">${esc(salary)}</p>
  </div>
</header>
<div class="wrap offer-layout">
  <article class="offer-body">
${sections.filter(([, text]) => text && String(text).trim()).map(([h, text]) => `    <h2>${esc(h)}</h2>\n    ${textToHtml(text)}`).join('\n')}
${languages ? `    <h2>${esc(c.languages)}</h2>\n    <p>${esc(languages)}</p>` : ''}
${questions.length ? `    <h2>${esc(c.questions)}</h2>\n    <p>${esc(c.questionsIntro)}</p>\n    <ol>${questions.map((q) => `<li>${esc(q.label)}${q.required ? '' : ` <small>(${esc(c.optional)})</small>`}</li>`).join('')}</ol>` : ''}
  </article>
  <aside class="offer-aside" aria-label="${esc(c.apply)}">
    <dl class="facts">
${facts.filter(([, v]) => v).map(([k, v]) => `      <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
    </dl>
    <a class="apply" href="${esc(applyUrl)}" rel="nofollow">${esc(c.apply)}</a>
    <a class="apply secondary" href="${esc(applyUrl)}" rel="nofollow">${esc(c.save)}</a>
    <p class="apply-note">${esc(c.applyNote)}</p>
    <p class="salary-note">${esc(c.salaryShown)}</p>
    <p class="salary-note"><a href="${esc(employerUrl)}">${esc(c.employerPage)} →</a></p>
  </aside>
</div>
${similarHtml}
</main>
<footer></footer>
</body>
</html>
`;
}

export function renderGonePage(locale: PageLocale, slug: string): string {
  const c = COPY[locale];
  const q = locale === 'en' ? '?lang=en' : '';
  const path = '/offres/' + slugify(slug);
  return `${head({
    locale, title: `${c.goneTitle} | Z Jobs`, description: c.goneBody,
    canonical: SITE + path + q, robots: 'noindex,follow', jsonLd: [],
  })}
<body>
${navHtml(locale, path, path + '?lang=en')}
<main id="contenu">
  <div class="wrap gone">
    <h1>${esc(c.goneTitle)}</h1>
    <p>${esc(c.goneBody)}</p>
    <a class="apply" href="${sitePath('/', q)}#recherche">${esc(c.goneCta)}</a>
  </div>
</main>
<footer></footer>
</body>
</html>
`;
}

export function renderOffersSitemap(offers: { id: string; title: string; city: string | null; updatedAt: string }[]): string {
  const urls = offers.map((o) => {
    const path = offerPath({ id: o.id, title: o.title, city: o.city });
    return `  <url><loc>${esc(SITE + path)}</loc><lastmod>${esc(o.updatedAt.slice(0, 10))}</lastmod><xhtml:link rel="alternate" hreflang="fr" href="${esc(SITE + path)}"/><xhtml:link rel="alternate" hreflang="en" href="${esc(SITE + path + '?lang=en')}"/></url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

// ------------------------------------------------------------------ city pages
// zjobs.online/emploi/<ville>-<code INSEE> (rewrite → GET /public/emploi/…).
// Indexées pour les 6 grandes villes de France dès maintenant, et pour toute
// ville qui a au moins MIN_CITY_OFFERS offres publiées ; sinon noindex.

export const MIN_CITY_OFFERS = 3;
export const TIER1_CITIES = Object.freeze(['FR-75056', 'FR-13055', 'FR-69123', 'FR-31555', 'FR-06088', 'FR-44109']);

export interface PublicCity { officialCode: string; city: string; countryCode: string; adminArea: string | null; postalCode: string | null; population: number | null }

/** 'FR-69123' + 'Lyon' → '/emploi/lyon-69123' ; 'BE-21004' → '/emploi/bruxelles-be-21004'. */
export function cityPath(c: { officialCode: string; city: string }): string {
  const code = c.officialCode.toLowerCase().replace(/^fr-/, '');
  return `/emploi/${slugify(c.city)}-${code}`;
}

/** 'lyon-69123' → 'FR-69123' ; 'bruxelles-be-21004' → 'BE-21004'. */
export function officialCodeFromCitySlug(slug: string): string | null {
  const s = String(slug ?? '').toLowerCase();
  const other = s.match(/^.*?-(be|lu)-([a-z0-9-]+)$/);
  if (other) return `${other[1].toUpperCase()}-${other[2]}`;
  const fr = s.match(/(?:^|-)((?:2a|2b|\d{2})\d{3}|97[1-6]\d{2})$/);
  return fr ? `FR-${fr[1].toUpperCase()}` : null;
}

function aVille(name: string): string {
  const m = String(name).match(/^(Le|Les) (.*)$/);
  if (m) return `${m[1] === 'Le' ? 'au' : 'aux'} ${m[2]}`;
  return `à ${name}`;
}

const CITY_STYLE = `
  .city-hero{ padding:44px 0 30px; }
  .city-hero h1{ font-size:clamp(34px,4.6vw,50px); line-height:1.06; margin:0 0 14px; }
  .city-hero p{ color:var(--zj-muted); max-width:760px; margin:0; }
  .city-section{ padding:34px 0; border-top:1px solid var(--zj-line); }
  .city-section h2{ font-size:28px; margin:0 0 14px; }
  .city-section p{ color:var(--zj-text); max-width:800px; }
  .city-offers{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px; }
  .city-offers a{ display:block; height:100%; border:1px solid var(--zj-line); background:#fff; padding:20px; text-decoration:none; }
  .city-offers a:hover{ border-color:var(--zj-blue); }
  .city-offers b{ display:block; font-family:'Cormorant Garamond',Georgia,serif; font-weight:500; font-size:21px; color:var(--zj-text); line-height:1.25; }
  .city-offers span{ display:block; font-size:13px; color:var(--zj-muted); margin-top:6px; }
  .city-offers em{ display:block; font-style:normal; font-size:14px; color:var(--zj-blue); margin-top:8px; font-weight:600; }
  .city-empty{ padding:22px; border:1px dashed var(--zj-line); background:var(--zj-bg-soft); }
  .city-ctas{ display:flex; flex-wrap:wrap; gap:12px; margin-top:22px; }
  .city-ctas a{ display:inline-block; padding:12px 18px; border:1px solid var(--zj-blue); color:var(--zj-blue); text-decoration:none; font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; }
  .city-ctas a.primary{ background:var(--zj-blue); color:#fff; }
  .city-links{ display:flex; flex-wrap:wrap; gap:8px 20px; padding:0; list-style:none; }
  .city-links a{ color:var(--zj-blue); }
  .city-faq details{ padding:12px 0; border-bottom:1px solid var(--zj-line); }
  .city-faq summary{ cursor:pointer; font-weight:500; }
`;

export function renderCityPage(city: PublicCity, offers: PublicOfferRecord[], others: { officialCode: string; city: string }[], locale: PageLocale): { indexable: boolean; html: string } {
  const en = locale === 'en';
  const q = en ? '?lang=en' : '';
  const path = cityPath(city);
  const frUrl = SITE + path;
  const enUrl = SITE + path + '?lang=en';
  const name = city.city;
  const indexable = TIER1_CITIES.includes(city.officialCode) || offers.length >= MIN_CITY_OFFERS;
  const n = offers.length;
  const isFr = city.countryCode === 'FR';
  const insee = city.officialCode.replace(/^FR-/, '');
  const zfindHousing = isFr ? `https://zfind.online/fr/immobilier/${slugify(name)}-${insee.toLowerCase()}` : null;
  const t = en
    ? {
        h1: `Jobs in ${name}`,
        lead: n ? `${n} job${n > 1 ? 's' : ''} from verified employers in ${name}, always with the salary shown and an answer expected within 14 days.` : `Z Jobs is opening in ${name}: the first verified employers are arriving. Every job shows its salary and an answer is expected within 14 days.`,
        offers: `Jobs in ${name}`, empty: `No job published in ${name} yet. Create an alert to be told about the first ones.`,
        alert: 'Create a job alert', post: 'Post a job', all: 'All jobs',
        salary: 'Salaries and net pay', salaryP: `Every Z Jobs offer shows its salary, compared with the minimum wage and the collective-agreement scales. Work out your net pay from a gross salary with the free simulator.`,
        sim: 'Gross → net simulator', law: 'Labour law FR, BE, LU',
        housing: `Living in ${name}`, housingP: `Prices per m², homes for sale and to rent, notary fees: see the property market of ${name} on Z Find, the property portal of the same Z Operating System.`,
        housingCta: `Property in ${name} on Z Find`,
        employers: `Hiring in ${name}?`, employersP: 'Your first offer is free for a verified employer. Screening questions, application sorting and Z Desk and Z Studio included.',
        othersH: 'Jobs in other cities', faqH: 'Questions',
        f1q: `How many jobs are there in ${name} on Z Jobs?`, f1a: n ? `${n} published job${n > 1 ? 's' : ''}, all from verified employers with the salary shown.` : `None yet: Z Jobs is opening in ${name}. Create an alert to be told about the first jobs.`,
        f2q: 'Is the salary always shown?', f2a: 'Yes: a job cannot be published on Z Jobs without a fixed salary, compared with the official collective-agreement scales.',
        title: `Jobs in ${name}: verified employers, salary shown | Z Jobs`,
        desc: `${n ? `${n} jobs` : 'Jobs'} in ${name} from verified employers, always with the salary shown and an answer within 14 days. Free for candidates.`,
      }
    : {
        h1: `Emploi ${aVille(name)}`,
        lead: n ? `${n} offre${n > 1 ? 's' : ''} d’employeurs vérifiés ${aVille(name)}, toujours avec le salaire affiché et une première réponse attendue sous 14 jours.` : `Z Jobs ouvre ${aVille(name)} : les premiers employeurs vérifiés arrivent. Chaque offre affiche son salaire, et une première réponse est attendue sous 14 jours.`,
        offers: `Offres d’emploi ${aVille(name)}`, empty: `Aucune offre publiée ${aVille(name)} pour le moment. Créez une alerte pour être prévenu des premières.`,
        alert: 'Créer une alerte emploi', post: 'Publier une offre', all: 'Toutes les offres',
        salary: 'Salaires et salaire net', salaryP: 'Chaque offre Z Jobs affiche son salaire, comparé au salaire minimum et aux grilles des conventions collectives. Calculez votre salaire net à partir du brut avec le simulateur gratuit.',
        sim: 'Simulateur brut → net', law: 'Droit du travail FR, BE, LU',
        housing: `Se loger ${aVille(name)}`, housingP: `Prix au m², biens à vendre et à louer, frais de notaire : le marché immobilier ${aVille(name)} sur Z Find, le portail immobilier du même Z Operating System.`,
        housingCta: `Immobilier ${aVille(name)} sur Z Find`,
        employers: `Vous recrutez ${aVille(name)} ?`, employersP: 'La première offre est gratuite pour un employeur vérifié. Questions de pré-sélection, tri des candidatures, Z Desk et Z Studio inclus.',
        othersH: 'Emploi dans les autres villes', faqH: 'Questions fréquentes',
        f1q: `Combien d’offres d’emploi ${aVille(name)} sur Z Jobs ?`, f1a: n ? `${n} offre${n > 1 ? 's' : ''} publiée${n > 1 ? 's' : ''}, toutes d’employeurs vérifiés et avec le salaire affiché.` : `Aucune pour le moment : Z Jobs ouvre ${aVille(name)}. Créez une alerte pour être prévenu des premières offres.`,
        f2q: 'Le salaire est-il toujours affiché ?', f2a: 'Oui : une offre ne peut pas être publiée sur Z Jobs sans salaire fixe, comparé aux grilles officielles des conventions collectives.',
        title: `Emploi ${aVille(name)} : offres d’employeurs vérifiés, salaire affiché | Z Jobs`,
        desc: `${n ? `${n} offres d’emploi` : 'Offres d’emploi'} ${aVille(name)} d’employeurs vérifiés, toujours avec le salaire affiché et une réponse sous 14 jours. Gratuit pour les candidats.`,
      };
  const faq = [{ q: t.f1q, a: t.f1a }, { q: t.f2q, a: t.f2a }];
  const ld: unknown[] = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Z Jobs', item: SITE + '/' + q },
      { '@type': 'ListItem', position: 2, name: t.h1, item: en ? enUrl : frUrl },
    ] },
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: t.title, url: en ? enUrl : frUrl, inLanguage: locale, about: { '@type': 'City', name, ...(city.adminArea ? { containedInPlace: { '@type': 'AdministrativeArea', name: city.adminArea } } : {}) } },
  ];
  if (indexable) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  const searchHref = `${sitePath('/', q)}#recherche`;
  const offersHtml = n
    ? `<ul class="city-offers">${offers.slice(0, 30).map((o) => `<li><a href="${esc(offerPath(o) + q)}"><b>${esc(o.title)}</b><span>${esc(o.employer?.displayName ?? '')} · ${esc(CONTRACT[locale][o.contractType] ?? '')}</span><em>${esc(salaryText(o, locale))}</em></a></li>`).join('')}</ul>`
    : `<div class="city-empty"><p style="margin:0">${esc(t.empty)}</p></div>`;
  const html = `${head({ locale, title: t.title, description: shortText(t.desc, 158), canonical: en ? enUrl : frUrl, alternates: { fr: frUrl, en: enUrl }, robots: indexable ? 'index,follow' : 'noindex,follow', jsonLd: ld })
    .replace('</style>', CITY_STYLE + '</style>')}
<body>
${navHtml(locale, path, path + '?lang=en')}
<main id="contenu">
<header class="city-hero hero"><div class="wrap">
  <p class="crumbs"><a href="${sitePath('/', q)}">Z Jobs</a><span>›</span>${esc(t.h1)}</p>
  <h1>${esc(t.h1)}</h1>
  <p>${esc(t.lead)}</p>
  <div class="city-ctas"><a class="primary" href="${PORTAL_URL}?lang=${locale}">${esc(t.alert)}</a><a href="${esc(searchHref)}">${esc(t.all)}</a><a href="${sitePath('/employeurs', q)}">${esc(t.post)}</a></div>
</div></header>
<div class="wrap">
  <section class="city-section"><h2>${esc(t.offers)}</h2>${offersHtml}</section>
  <section class="city-section"><h2>${esc(t.salary)}</h2><p>${esc(t.salaryP)}</p><ul class="city-links"><li><a href="${sitePath('/outils', q)}#simulateur">${esc(t.sim)}</a></li><li><a href="${sitePath('/outils', q)}#legislation">${esc(t.law)}</a></li></ul></section>
  ${zfindHousing ? `<section class="city-section"><h2>${esc(t.housing)}</h2><p>${esc(t.housingP)}</p><ul class="city-links"><li><a href="${esc(zfindHousing)}">${esc(t.housingCta)} →</a></li></ul></section>` : ''}
  <section class="city-section"><h2>${esc(t.employers)}</h2><p>${esc(t.employersP)}</p><ul class="city-links"><li><a href="${sitePath('/employeurs', q)}">${esc(t.post)} →</a></li></ul></section>
  ${others.length ? `<section class="city-section"><h2>${esc(t.othersH)}</h2><ul class="city-links">${others.map((o) => `<li><a href="${esc(cityPath(o) + q)}">${esc(o.city)}</a></li>`).join('')}</ul></section>` : ''}
  <section class="city-section city-faq"><h2>${esc(t.faqH)}</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>
</div>
</main>
<footer></footer>
</body>
</html>
`;
  return { indexable, html };
}

export function renderCitySitemap(cities: { officialCode: string; city: string }[]): string {
  const urls = cities.map((c) => `  <url><loc>${esc(SITE + cityPath(c))}</loc><xhtml:link rel="alternate" hreflang="fr" href="${esc(SITE + cityPath(c))}"/><xhtml:link rel="alternate" hreflang="en" href="${esc(SITE + cityPath(c) + '?lang=en')}"/></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

// ------------------------------------------------------------------ entreprises
/** Données publiques d'une entreprise (mêmes champs que GET /organizations/:id/public-profile). */
export interface PublicCompany {
  id: string;
  displayName: string;
  verificationStatus: string;
  badges: string[];
  metrics: { publishedOffersCount: number; confirmedComplaintsCount: number };
  profile: {
    description: string | null; cultureNotes: string | null; remotePolicyNotes: string | null; inclusionPolicyNotes: string | null;
    website: string | null; employeeCount: number | null; countryCode: string | null;
    nace: { code: string; labelEn: string | null } | null;
    headquarters: { city: string; postalCode: string | null; countryCode: string } | null;
  };
  offers: PublicOfferRecord[];
  offersTotal: number;
}

export function companyPath(c: { id: string; displayName: string }): string {
  return `/entreprise/${slugify(c.displayName) || 'entreprise'}-${c.id}`;
}
export function companyIdFromSlug(slug: string): string | null {
  const m = String(slug ?? '').toLowerCase().match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
  return m ? m[1] : null;
}
export function isVerifiedCompany(status: string | null | undefined): boolean {
  return status === 'verified' || status === 'enhanced_verified';
}

export function renderCompanyPage(c: PublicCompany, locale: PageLocale): { indexable: boolean; html: string } {
  const en = locale === 'en';
  const q = en ? '?lang=en' : '';
  const path = companyPath(c);
  const frUrl = SITE + path;
  const enUrl = SITE + path + '?lang=en';
  const p = c.profile;
  const n = c.offersTotal;
  const description = String(p.description ?? '').trim();
  const indexable = isVerifiedCompany(c.verificationStatus) && (n > 0 || description.length >= 80);
  const hq = p.headquarters ? [p.headquarters.city, p.headquarters.postalCode].filter(Boolean).join(' ') : null;
  const size = p.employeeCount ? (en ? `${p.employeeCount} employees` : `${p.employeeCount} salariés`) : null;
  const t = en
    ? {
        title: `${c.displayName}: jobs and company profile${hq ? ` (${p.headquarters!.city})` : ''} | Z Jobs`,
        desc: `${c.displayName} on Z Jobs: ${n ? `${n} open job${n > 1 ? 's' : ''} with the salary shown` : 'company profile'}, verified employer${hq ? `, based in ${p.headquarters!.city}` : ''}.`,
        verified: 'Verified employer', jobs: `Open jobs at ${c.displayName}`, none: 'No open job right now. Create an alert to be told about the next one.',
        about: 'About', culture: 'Culture', remote: 'Remote work', inclusion: 'Inclusion', facts: 'Key facts', hq: 'Head office', sizeL: 'Size', sector: 'Sector', site: 'Website',
        alert: 'Create a job alert', crumbs: 'Employers',
      }
    : {
        title: `${c.displayName} : offres d’emploi et présentation${hq ? ` (${p.headquarters!.city})` : ''} | Z Jobs`,
        desc: `${c.displayName} sur Z Jobs : ${n ? `${n} offre${n > 1 ? 's' : ''} en cours avec le salaire affiché` : 'présentation de l’entreprise'}, employeur vérifié${hq ? `, basé à ${p.headquarters!.city}` : ''}.`,
        verified: 'Employeur vérifié', jobs: `Offres de ${c.displayName}`, none: 'Aucune offre en cours. Créez une alerte pour être prévenu de la prochaine.',
        about: 'Présentation', culture: 'Culture', remote: 'Télétravail', inclusion: 'Inclusion', facts: 'En bref', hq: 'Siège', sizeL: 'Effectif', sector: 'Secteur', site: 'Site',
        alert: 'Créer une alerte emploi', crumbs: 'Employeurs',
      };
  const factsList = [[t.hq, hq], [t.sizeL, size], [t.sector, p.nace ? `NACE ${p.nace.code}${p.nace.labelEn && en ? ` — ${p.nace.labelEn}` : ''}` : null]]
    .filter((f) => f[1]) as [string, string][];
  const offersHtml = n
    ? `<ul class="city-offers">${c.offers.slice(0, 50).map((o) => `<li><a href="${esc(offerPath(o) + q)}"><b>${esc(o.title)}</b><span>${esc([placeText(o, locale), CONTRACT[locale][o.contractType] ?? ''].filter(Boolean).join(' · '))}</span><em>${esc(salaryText(o, locale))}</em></a></li>`).join('')}</ul>`
    : `<div class="city-empty"><p style="margin:0">${esc(t.none)}</p></div>`;
  const notes = [[t.about, p.description], [t.culture, p.cultureNotes], [t.remote, p.remotePolicyNotes], [t.inclusion, p.inclusionPolicyNotes]]
    .filter((x) => String(x[1] ?? '').trim()) as [string, string][];
  const site = p.website && /^https?:\/\//i.test(p.website) ? p.website : null;
  const ld: unknown[] = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Z Jobs', item: SITE + sitePath('/', q) },
      { '@type': 'ListItem', position: 2, name: c.displayName, item: en ? enUrl : frUrl },
    ] },
    { '@context': 'https://schema.org', '@type': 'Organization', name: c.displayName, url: en ? enUrl : frUrl,
      ...(site ? { sameAs: [site] } : {}),
      ...(description ? { description: shortText(description, 300) } : {}),
      ...(p.employeeCount ? { numberOfEmployees: { '@type': 'QuantitativeValue', value: p.employeeCount } } : {}),
      ...(p.headquarters ? { address: { '@type': 'PostalAddress', addressLocality: p.headquarters.city, ...(p.headquarters.postalCode ? { postalCode: p.headquarters.postalCode } : {}), addressCountry: p.headquarters.countryCode } } : {}) },
  ];
  const html = `${head({ locale, title: t.title, description: shortText(t.desc, 158), canonical: en ? enUrl : frUrl, alternates: { fr: frUrl, en: enUrl }, robots: indexable ? 'index,follow' : 'noindex,follow', jsonLd: ld }).replace('</style>', CITY_STYLE + '.city-facts li{ list-style:none; } .city-facts b{ font-weight:600; }</style>')}
<body>
${navHtml(locale, frUrl.replace(SITE, ''), enUrl.replace(SITE, ''))}
<main id="contenu">
<header class="city-hero hero"><div class="wrap">
  <p class="crumbs"><a href="${sitePath('/', q)}">Z Jobs</a><span>›</span>${esc(c.displayName)}</p>
  <h1>${esc(c.displayName)}</h1>
  <p>${isVerifiedCompany(c.verificationStatus) ? `<span class="seal">${esc(t.verified)}</span> ` : ''}${esc([hq, size].filter(Boolean).join(' · '))}</p>
  <div class="city-ctas"><a class="primary" href="${PORTAL_URL}?lang=${locale}">${esc(t.alert)}</a>${site ? `<a href="${esc(site)}" rel="noopener nofollow">${esc(t.site)} ↗</a>` : ''}</div>
</div></header>
<div class="wrap">
  <section class="city-section"><h2>${esc(t.jobs)}${n ? ` (${n})` : ''}</h2>${offersHtml}</section>
  ${notes.map(([h, txt]) => `<section class="city-section"><h2>${esc(h)}</h2>${String(txt).split(/\n{2,}/).map((para) => `<p>${esc(para.trim())}</p>`).join('')}</section>`).join('\n  ')}
  ${factsList.length ? `<section class="city-section"><h2>${esc(t.facts)}</h2><ul class="city-links city-facts">${factsList.map(([k, v]) => `<li>${esc(k)} : <b>${esc(v)}</b></li>`).join('')}</ul></section>` : ''}
</div>
</main>
<footer></footer>
</body>
</html>
`;
  return { indexable, html };
}

export function renderCompanySitemap(companies: { id: string; displayName: string; updatedAt?: string | null }[]): string {
  const urls = companies.map((c) => {
    const loc = SITE + companyPath(c);
    return `  <url><loc>${esc(loc)}</loc>${c.updatedAt ? `<lastmod>${esc(String(c.updatedAt).slice(0, 10))}</lastmod>` : ''}<xhtml:link rel="alternate" hreflang="fr" href="${esc(loc)}"/><xhtml:link rel="alternate" hreflang="en" href="${esc(loc + '?lang=en')}"/></url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}
