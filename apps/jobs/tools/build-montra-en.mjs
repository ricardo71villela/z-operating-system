#!/usr/bin/env node
/* ============================================================
   Z JOBS — pages anglaises indexables de la montra (/en/...)

   Les pages statiques de zjobs.online sont écrites en français et
   traduites dans le navigateur (TRANSLATIONS de chaque page). Pour que
   Google indexe la version anglaise sous sa propre adresse, ce script
   produit apps/montra/en/<page>.html à partir de la page française :
     - <html lang="en">, title et description anglais ;
     - canonical /en/<page>, hreflang fr ↔ en, og:url et og:locale ;
     - textes data-i18n / data-i18n-html / data-i18n-placeholder déjà
       remplacés par l'anglais dans le HTML (lisible sans script) ;
     - liens internes vers les pages anglaises ;
     - langue forcée à l'anglais dans le script de la page.

   node apps/jobs/tools/build-montra-en.mjs          écrit les pages
   node apps/jobs/tools/build-montra-en.mjs --check  échoue si elles ne
                                                     sont pas à jour (CI)
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MONTRA = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'montra');
const SITE = 'https://zjobs.online';
export const PAGES = ['index', 'candidats', 'employeurs', 'outils', 'mentions-legales'];
const STATIC = ['/candidats', '/employeurs', '/outils', '/mentions-legales'];

const EN_DESCRIPTION = {
  index: 'Jobs in France, Belgium and Luxembourg with the salary shown and a verified employer. Salaries compared with official pay scales. Always free for candidates.',
  candidats: 'Check your CV and cover letter for free: the impact of your experience, a letter written for the job. Free tools for candidates, no sign-up.',
  employeurs: 'Post verified job offers in France, Belgium and Luxembourg. Trust labels computed from real data, never for sale. Free verification until your first hire.',
  outils: 'Minimum wage, collective agreement pay scales, net salary simulator, probation and notice periods in France, Belgium and Luxembourg — official figures, sources cited.',
  'mentions-legales': 'Legal notice for zjobs.online: publisher, publication director, hosting.'
};

export function frPath(page) { return page === 'index' ? '/' : `/${page}`; }
export function enPath(page) { return page === 'index' ? '/en' : `/en/${page}`; }

const escText = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = v => escText(v).replace(/"/g, '&quot;');

/* « var TRANSLATIONS = { … }; » : l'objet littéral, évalué. */
function translationsOf(html) {
  const start = html.indexOf('var TRANSLATIONS = {');
  if (start < 0) throw new Error('TRANSLATIONS introuvable');
  let i = html.indexOf('{', start), depth = 0, quote = null;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (quote) { if (ch === '\\') { i++; continue; } if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) break; }
  }
  const literal = html.slice(html.indexOf('{', start), i + 1);
  return new Function(`return (${literal});`)();
}

/* Remplace le contenu de chaque élément portant attr="clé" (balises imbriquées comprises). */
function replaceInner(html, attr, dict, asHtml) {
  const re = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)\\b([^>]*?)\\s${attr}="([^"]+)"([^>]*)>`, 'g');
  let out = '', last = 0, m;
  while ((m = re.exec(html))) {
    const [open, tag, , key] = m;
    const value = dict[key];
    const innerStart = m.index + open.length;
    // Fin de l'élément : balise fermante du même nom, imbrications comptées.
    const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
    tagRe.lastIndex = innerStart;
    let depth = 1, t, innerEnd = -1, closeEnd = -1;
    while ((t = tagRe.exec(html))) {
      if (t[0].endsWith('/>')) continue;
      depth += t[1] ? -1 : 1;
      if (depth === 0) { innerEnd = t.index; closeEnd = t.index + t[0].length; break; }
    }
    if (innerEnd < 0 || value == null || value === '') continue;
    out += html.slice(last, innerStart) + (asHtml ? value : escText(value));
    last = innerEnd;
    re.lastIndex = closeEnd;
  }
  return out + html.slice(last);
}

export function buildEnglish(page, frHtml) {
  const dict = translationsOf(frHtml).en || {};
  const fr = SITE + (page === 'index' ? '/' : frPath(page));
  const en = SITE + enPath(page);
  let h = frHtml;
  h = h.replace(/<html lang="fr">/, '<html lang="en">');
  h = h.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${en}" />`);
  h = h.replace(/<link rel="alternate" hreflang="en" href="[^"]*" \/>/, `<link rel="alternate" hreflang="en" href="${en}" />`);
  h = h.replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${en}" />`);
  h = h.replace(/<meta property="og:locale" content="fr_FR" \/>/, '<meta property="og:locale" content="en_GB" />');
  h = h.replace(/<meta property="og:locale:alternate" content="en_GB" \/>/, '<meta property="og:locale:alternate" content="fr_FR" />');
  if (dict.page_title) {
    h = h.replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escAttr(dict.page_title)}" />`);
  }
  if (EN_DESCRIPTION[page]) {
    h = h.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escAttr(EN_DESCRIPTION[page])}" />`);
    h = h.replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escAttr(EN_DESCRIPTION[page])}" />`);
  }
  // Fil d'Ariane JSON-LD : adresses anglaises.
  h = h.replace(/("item": ")https:\/\/zjobs\.online\/([a-z-]*)(")/g, (all, a, p, b) => {
    if (!p) return `${a}${SITE}/en${b}`;
    return PAGES.includes(p) ? `${a}${SITE}/en/${p}${b}` : all;
  });
  // Textes traduits directement dans le HTML.
  h = replaceInner(h, 'data-i18n', dict, false);
  h = replaceInner(h, 'data-i18n-html', dict, true);
  h = h.replace(/(<[^>]*\sdata-i18n-placeholder="([^"]+)"[^>]*>)/g, (tag, all, key) => {
    if (!dict[key]) return tag;
    return /\splaceholder="/.test(tag.replace(/data-i18n-placeholder="[^"]*"/, ''))
      ? tag.replace(/(\s)placeholder="[^"]*"/, `$1placeholder="${escAttr(dict[key])}"`)
      : tag;
  });
  // Liens internes vers les pages anglaises (pas les ressources ni les pages de l'API).
  h = h.replace(/href="(\/(?:candidats|employeurs|outils|mentions-legales)?)((?:#[^"]*)?)"/g, (all, p, hash) => {
    if (p === '/') return `href="/en${hash}"`;
    return STATIC.includes(p) ? `href="/en${p}${hash}"` : all;
  });
  // Pages « salaire brut en net » : leur version anglaise.
  h = h.replace(/href="\/salaire-brut-net(-belgique|-luxembourg)?"/g, (all, c) => `href="/en/gross-to-net-salary-${c === '-belgique' ? 'belgium' : c === '-luxembourg' ? 'luxembourg' : 'france'}"`);
  // Langue : toujours l'anglais sur cette adresse.
  h = h.replace(/locale = asked \|\| saved \|\| \(browser === 'en' \? 'en' : 'fr'\);/, "locale = 'en';");
  h = h.replace(/locale = asked === 'en' \? 'en' : 'fr';/, "locale = 'en';");
  return `<!-- Généré par apps/jobs/tools/build-montra-en.mjs à partir de ../${page}.html — ne pas modifier à la main. -->\n${h}`;
}

/* Page française : hreflang anglais vers /en/…, et la langue suit l'adresse
   (Google rend les pages avec un navigateur réglé en anglais : la langue du
   navigateur ne doit jamais changer la langue d'une adresse française). */
export function fixFrench(page, frHtml) {
  let h = frHtml.replace(/<link rel="alternate" hreflang="en" href="[^"]*" \/>/, `<link rel="alternate" hreflang="en" href="${SITE}${enPath(page)}" />`);
  h = h.replace(/locale = asked \|\| saved \|\| \(browser === 'en' \? 'en' : 'fr'\);/, "locale = asked === 'en' ? 'en' : 'fr';");
  return h;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const stale = [];
  mkdirSync(join(MONTRA, 'en'), { recursive: true });
  for (const page of PAGES) {
    const frFile = join(MONTRA, `${page}.html`);
    const fr = readFileSync(frFile, 'utf8');
    const fixed = fixFrench(page, fr);
    const enFile = join(MONTRA, 'en', `${page}.html`);
    const en = buildEnglish(page, fixed);
    if (check) {
      if (fixed !== fr) stale.push(`${page}.html`);
      if (!existsSync(enFile) || readFileSync(enFile, 'utf8') !== en) stale.push(`en/${page}.html`);
    } else {
      if (fixed !== fr) writeFileSync(frFile, fixed);
      writeFileSync(enFile, en);
    }
  }
  if (check && stale.length) {
    console.error(`Pages anglaises à régénérer (node apps/jobs/tools/build-montra-en.mjs) : ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log(check ? 'Montra EN : à jour' : `Montra EN : ${PAGES.length} pages écrites`);
}
