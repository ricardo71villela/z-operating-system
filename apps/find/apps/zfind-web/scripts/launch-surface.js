/* ============================================================
   Z FIND — PUBLIC LAUNCH SURFACE (build-time transform of body.html)

   1. Public wording: editorial markers used while the legal guides were
      researched ("Master FR · … · audit final avant lancement",
      "LEGAL_STATUS: REQUIRES_LOCAL_CONFIRMATION", internal product rules
      for Z Find) are turned into reader-facing wording or removed.
   2. Launch scope: legal / tourist-rental views of markets outside the
      launch scope are left out of the published HTML, and jurisdiction
      selectors only link to the published guides.

   The source body.html is unchanged: masters, tests and the complete
   historical surface stay intact. Set ZFIND_LAUNCH_SCOPE=all to build
   every jurisdiction (step 2 is skipped; step 1 always applies).
   ============================================================ */

'use strict';

const SECTION_START = /<section class="view"[^>]*id="view-([a-z0-9-]+)"/g;

/* Language of each guide view, for the reader-facing status labels. */
const VIEW_LANGUAGE = Object.freeze({
  'legal': 'pt', 'al-manual': 'pt',
  'legal-es': 'es', 'al-manual-es': 'es',
  'legal-fr': 'fr', 'tourist-rental-fr': 'fr',
  'legal-de': 'de', 'tourist-rental-de': 'de',
  'legal-it': 'it', 'tourist-rental-it': 'it',
  'legal-belgium': 'fr', 'tourist-rental-belgium': 'fr',
  'legal-brazil': 'pt', 'tourist-rental-brazil': 'pt',
  'legal-mexico': 'es', 'tourist-rental-mexico': 'es',
  'legal-argentina': 'es', 'tourist-rental-argentina': 'es',
  'legal-chile': 'es', 'tourist-rental-chile': 'es',
  'legal-dominican-republic': 'es', 'tourist-rental-dominican-republic': 'es'
});

const STATUS_LABELS = Object.freeze({
  REQUIRES_LOCAL_CONFIRMATION: Object.freeze({
    fr: 'À confirmer localement',
    en: 'To be confirmed locally',
    pt: 'A confirmar localmente',
    es: 'A confirmar localmente',
    de: 'Vor Ort zu bestätigen',
    it: 'Da confermare localmente'
  }),
  PROPOSED_NOT_IN_FORCE: Object.freeze({
    fr: 'Proposition — pas encore en vigueur',
    en: 'Proposal — not yet in force',
    pt: 'Proposta — ainda não em vigor',
    es: 'Propuesta — aún no vigente',
    de: 'Vorschlag — noch nicht in Kraft',
    it: 'Proposta — non ancora in vigore'
  }),
  TRANSITIONAL: Object.freeze({
    fr: 'Régime transitoire',
    en: 'Transitional arrangement',
    pt: 'Regime transitório',
    es: 'Régimen transitorio',
    de: 'Übergangsregelung',
    it: 'Regime transitorio'
  })
});

const HORIZON_LABELS = Object.freeze({
  'Horizon d’autorité :': 'Mise à jour :',
  "Horizon d'autorité :": 'Mise à jour :'
});

/* Portuguese guide: internal product rules addressed to the Z Find team. */
const INTERNAL_PASSAGES = Object.freeze([
  // "10. Regra de produto para o Z Find" heading and its body, up to the next heading.
  /<h3>\s*\d+\.\s*Regra de produto para o Z Find\s*<\/h3>[\s\S]*?(?=<h[23][\s>]|<\/div>\s*<\/section>|<section)/g
]);

const TEXT_FIXES = Object.freeze([
  ['à la date de cette guide', 'à la date de ce guide'],
  ['Ne jamais équivaloir automatiquement', 'Ne jamais assimiler automatiquement'],
  ['Não deve ser publicada no Z Find uma “taxa única de mais-valias imobiliárias” para pessoas singulares, porque',
   'Não existe uma “taxa única de mais-valias imobiliárias” para pessoas singulares:'],
  ['Para efeitos deste Master Pack prevaleceu', 'Neste guia prevaleceu'],
  ['À data de corte deste Master Pack', 'À data de referência deste guia']
]);

function splitViews(body) {
  const starts = [];
  let match;
  SECTION_START.lastIndex = 0;
  while ((match = SECTION_START.exec(body)) !== null) {
    starts.push({ index: match.index, view: match[1] });
  }
  if (!starts.length) throw new Error('LAUNCH SURFACE: no views found in body.html');

  const parts = [{ view: null, html: body.slice(0, starts[0].index) }];
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : body.length;
    parts.push({ view: start.view, html: body.slice(start.index, end) });
  });
  return parts;
}

function isGuideView(view) {
  return !!view && (
    view === 'legal' || view === 'al-manual' ||
    view.startsWith('legal-') || view.startsWith('al-manual-') ||
    view.startsWith('tourist-rental-')
  );
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function publicWording(html, language) {
  let out = html;

  // "Master FR · règles vérifiées jusqu’en août 2026 · audit final avant lancement."
  //   -> "Règles vérifiées jusqu’en août 2026."
  out = out.replace(
    /Master [A-Z]{2}(?:-[A-Z]{2,3})? · ([^·<]+?)(?:\s*·[^<]*)?(?=\s*<)/g,
    (_, horizon) => capitalize(horizon.trim().replace(/[.\s]+$/, '')) + '.'
  );

  // "LEGAL_STATUS: TRANSITIONAL / REQUIRES_LOCAL_CONFIRMATION" -> "Régime transitoire · À confirmer localement"
  out = out.replace(/LEGAL_STATUS:\s*([A-Z_]+(?:\s*\/\s*[A-Z_]+)*)/g, (_, tokens) =>
    tokens.split('/').map(token => {
      const labels = STATUS_LABELS[token.trim()];
      if (!labels) throw new Error(`LAUNCH SURFACE: unknown legal status marker ${token.trim()}`);
      return labels[language] || labels.en;
    }).join(' · ')
  );

  for (const [from, to] of Object.entries(HORIZON_LABELS)) {
    out = out.split(from).join(to);
  }

  for (const pattern of INTERNAL_PASSAGES) {
    out = out.replace(pattern, '');
  }

  for (const [from, to] of TEXT_FIXES) {
    out = out.split(from).join(to);
  }

  return out;
}

function removeLinksTo(html, hiddenRoutes) {
  let out = html;
  for (const route of hiddenRoutes) {
    const escaped = route.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    out = out.replace(
      new RegExp(`<button\\b[^>]*onclick="navigate\\('${escaped}'\\)"[^>]*>[\\s\\S]*?<\\/button>\\s*`, 'g'),
      ''
    );
  }
  return out;
}

/* Language menu: buttons of locales outside the launch are left out of the
   published HTML (the source keeps all six; the runtime skips missing ones). */
function removeNonLaunchLanguageButtons(html, options) {
  const launchLocales = (options && options.launchLocales) || ['fr', 'en'];
  return html.replace(/[ \t]*<button type="button" data-lang="([a-z]{2})"[^>]*>[\s\S]*?<\/button>\n?/g,
    (button, locale) => (launchLocales.includes(locale) ? button : ''));
}

/**
 * @param {string} body            source body.html
 * @param {object} options
 * @param {'launch'|'all'} options.scope
 * @param {Set<string>} options.publicGuideRoutes  guide views kept in launch scope
 * @param {{legal:string, rental:string}} options.defaultGuideRoutes  static footer targets
 */
function buildPublicBody(body, options) {
  const scope = options && options.scope === 'all' ? 'all' : 'launch';
  const keepRoutes = (options && options.publicGuideRoutes) || new Set();
  const defaults = (options && options.defaultGuideRoutes) || {};

  const parts = splitViews(body);
  const allGuideViews = parts.map(p => p.view).filter(isGuideView);
  const hiddenRoutes = scope === 'launch'
    ? allGuideViews.filter(view => !keepRoutes.has(view))
    : [];

  const report = { scope, keptGuides: [], removedGuides: [] };

  const html = parts.map(part => {
    if (isGuideView(part.view)) {
      if (scope === 'launch' && !keepRoutes.has(part.view)) {
        report.removedGuides.push(part.view);
        return '';
      }
      report.keptGuides.push(part.view);
      const language = VIEW_LANGUAGE[part.view] || 'en';
      return removeLinksTo(publicWording(part.html, language), hiddenRoutes);
    }
    if (scope === 'launch' && defaults.legal && defaults.rental) {
      // Static footer fallbacks point at the Portuguese guides; the footer
      // runtime retargets them per market, the static default follows launch.
      return part.html
        .split(`onclick="navigate('legal');return false;" data-i18n="footer.legalGuide"`)
        .join(`onclick="navigate('${defaults.legal}');return false;" data-i18n="footer.legalGuide"`)
        .split(`onclick="navigate('al-manual');return false;" data-i18n="footer.alManual"`)
        .join(`onclick="navigate('${defaults.rental}');return false;" data-i18n="footer.alManual"`);
    }
    return part.html;
  }).join('');

  const publicHtml = scope === 'launch' ? removeNonLaunchLanguageButtons(html, options) : html;

  if (/LEGAL_STATUS|Master [A-Z]{2}(?:-[A-Z]{2,3})? ·|Regra de produto para o Z Find/.test(publicHtml)) {
    throw new Error('LAUNCH SURFACE: internal editorial markers remain in the public HTML.');
  }

  return { html: publicHtml, report };
}

module.exports = { buildPublicBody, splitViews, isGuideView };
