#!/usr/bin/env node
/* ============================================================
   Z FIND — DETERMINISTIC BUILD SCRIPT
   ============================================================
   Replaces the ad hoc, manually-run Python concatenation used in
   every prior phase (see docs/architecture/CHANGE-SUMMARY.md and
   the Sprint A technical debt register). This script is the single,
   repeatable, versioned way to produce the distributable prototype
   from source — run it, do not hand-assemble the HTML again.

   Sprint 1.1: now also injects the Supabase configuration (Project
   URL + publishable key) at build time, using the exact same
   placeholder-substitution + hard-fail discipline already proven for
   __PATH_D__ (the logo). This build now REQUIRES SUPABASE_URL and
   SUPABASE_ANON_KEY to be set in the builder's environment — it will
   refuse to produce output otherwise.

   Usage: node scripts/build.js
   Output: dist/z-find-prototype.html
   ============================================================ */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const PUBLIC = path.join(__dirname, '..', 'public');
const DIST = path.join(__dirname, '..', 'dist');
const APPROVED_REFERENCE = process.env.ZFIND_APPROVED_REFERENCE || null;

function read(file) {
  const fullPath = path.join(SRC, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`BUILD FAILED: required source artifact missing: ${file} (expected at ${fullPath})`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`BUILD FAILED: required asset directory missing: ${src}`);
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const source = path.join(src, entry.name);
    const target = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirectoryRecursive(source, target);
    else fs.copyFileSync(source, target);
  }
}

function resolvePlaceholders(text, replacements, sourceLabel) {
  let resolved = text;
  for (const [placeholder, value] of Object.entries(replacements)) {
    const count = (resolved.match(new RegExp(placeholder, 'g')) || []).length;
    if (count === 0) {
      throw new Error(`BUILD FAILED: no ${placeholder} placeholder found in ${sourceLabel} — expected at least one occurrence.`);
    }
    resolved = resolved.split(placeholder).join(value);
  }
  for (const placeholder of Object.keys(replacements)) {
    const remaining = (resolved.match(new RegExp(placeholder, 'g')) || []).length;
    if (remaining !== 0) {
      throw new Error(`BUILD FAILED: ${remaining} unresolved ${placeholder} placeholder(s) remain in ${sourceLabel} after replacement. Partial replacement is never acceptable — refusing to continue.`);
    }
  }
  return resolved;
}

function build() {
  const headTop = read('head_top.txt');
  const css = read('css_block.txt');
  const legalGuideReadingSurface = read('legal-guide-reading-surface.css');
  const mobileUxPolish = read('mobile-ux-polish-v1.css');
  const mobileUxBalanceV3 = read('mobile-ux-balance-v3.css');
  const body = read('body.html');
  const pathD = read('path_data.txt');
  const vendorSupabase = read('vendor-supabase.js');
  const configTemplate = read('config.template.js');
  const publicLocalesService = read('services/public-locales.js');
  const publicRoutesService = read('services/public-routes.js');
  const marketRegistryService = read('services/market-registry.js');
  const marketFeaturedService = read('services/market-featured.js');
  const searchPaginationService = read('services/search-pagination.js');
  const marketSearchScopeService = read('services/market-search-scope.js');
  const supabaseClient = read('services/supabaseClient.js');
  const propertiesService = read('services/properties.js');
  const publicVerificationService = read('services/public-verification.js');
  const developmentsService = read('services/developments.js');
  const partnersService = read('services/partners.js');
  const searchService = read('services/search.js');
  const authService = read('services/auth.js');
  const identityService = read('services/identity.js');
  const leadsService = read('services/leads.js');
  const simulatorService = read('services/simulator.js');
  const zonesService = read('services/zones.js');
  const zoneImagesService = read('services/zone-images.js');
  const rentabilityService = read('services/rentability.js');
  const geography = read('geography.js');
  const i18n = read('i18n.js');
  const i18nPhase4 = read('i18n-phase4.js');
  const sixLanguageMenu = read('six-language-menu.js');
  const viewmodels = read('viewmodels.js');
  const app = read('app.js');
  const internationalWelcomeService = read('services/international-welcome.js');
  const internationalWelcomeRouteSyncService = read('services/international-welcome-route-sync.js');
  const marketRuntimeContextService = read('services/market-runtime-context.js');
  const zosEcosystemFooterService = read('services/zos-ecosystem-footer.js');

  const resolvedBody = resolvePlaceholders(body, { '__PATH_D__': pathD }, 'body.html');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const missingEnv = [];
  if (!supabaseUrl) missingEnv.push('SUPABASE_URL');
  if (!supabaseAnonKey) missingEnv.push('SUPABASE_ANON_KEY');
  if (missingEnv.length) {
    throw new Error(`BUILD FAILED: missing required environment variable(s) for Supabase config injection: ${missingEnv.join(', ')}. Set them in the builder's environment before running this build.`);
  }
  const resolvedConfig = resolvePlaceholders(
    configTemplate,
    { '__SUPABASE_URL__': supabaseUrl, '__SUPABASE_ANON_KEY__': supabaseAnonKey },
    'config.template.js'
  );

  const html = headTop
    + '<style>\n' + css + '\n' + legalGuideReadingSurface + '\n' + mobileUxPolish + '\n' + mobileUxBalanceV3 + '\n</style>\n</head>\n<body>\n'
    + resolvedBody
    + '\n<script>\n'
    + vendorSupabase + '\n'
    + resolvedConfig + '\n'
    + publicLocalesService + '\n'
    + publicRoutesService + '\n'
    + marketRegistryService + '\n'
    + marketFeaturedService + '\n'
    + searchPaginationService + '\n'
    + marketSearchScopeService + '\n'
    + supabaseClient + '\n'
    + propertiesService + '\n'
    + publicVerificationService + '\n'
    + developmentsService + '\n'
    + partnersService + '\n'
    + searchService + '\n'
    + authService + '\n'
    + identityService + '\n'
    + leadsService + '\n'
    + simulatorService + '\n'
    + zonesService + '\n'
    + zoneImagesService + '\n'
    + rentabilityService + '\n'
    + geography + '\n'
    + i18n + '\n'
    + i18nPhase4 + '\n'
    + sixLanguageMenu + '\n'
    + viewmodels + '\n'
    + app
    + '\n' + internationalWelcomeService
    + '\n' + internationalWelcomeRouteSyncService
    + '\n' + marketRuntimeContextService
    + '\n' + zosEcosystemFooterService
    + '\n</script>\n</body>\n</html>\n';

  fs.mkdirSync(DIST, { recursive: true });

  const heroAsset = path.join(PUBLIC, 'brand', 'zfind-atlantic-hero.webp');
  if (!fs.existsSync(heroAsset)) {
    throw new Error('BUILD FAILED: approved hero asset missing: public/brand/zfind-atlantic-hero.webp');
  }

  const distBrand = path.join(DIST, 'brand');
  fs.mkdirSync(distBrand, { recursive: true });
  fs.copyFileSync(heroAsset, path.join(distBrand, 'zfind-atlantic-hero.webp'));

  const marketMapSource = path.join(PUBLIC, 'brand', 'markets');
  const marketMapDest = path.join(distBrand, 'markets');
  copyDirectoryRecursive(marketMapSource, marketMapDest);

  const outPath = path.join(DIST, 'z-find-prototype.html');
  fs.writeFileSync(outPath, html);

  const report = { outPath, sizeBytes: Buffer.byteLength(html, 'utf8') };
  console.log('Built:', report.outPath);
  console.log('Size:', report.sizeBytes, 'bytes');
  console.log('Logo path placeholder: resolved, 0 remaining');
  console.log('Supabase config placeholders: resolved, 0 remaining');
  console.log('Six-language UI: fr, en, pt, es, de, it');
  console.log('Hero visual asset: copied to dist/brand/zfind-atlantic-hero.webp');
  console.log('Market map assets: copied to dist/brand/markets');
  console.log('Mobile UX polish: mobile-ux-polish-v1.css injected');
  console.log('Mobile UX balance: mobile-ux-balance-v3.css injected');

  if (APPROVED_REFERENCE) {
    if (!fs.existsSync(APPROVED_REFERENCE)) {
      throw new Error(`BUILD FAILED: approved reference file not found at ${APPROVED_REFERENCE}`);
    }
    const approved = fs.readFileSync(APPROVED_REFERENCE, 'utf8');
    if (approved !== html) {
      throw new Error('BUILD FAILED: generated output differs from the approved reference file. Refusing to continue — see diff.');
    }
    console.log('Byte-for-byte identical to approved reference:', APPROVED_REFERENCE);
  }

  return report;
}

if (require.main === module) build();
module.exports = { build };
