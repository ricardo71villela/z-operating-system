#!/usr/bin/env node
/* ============================================================
   Z FIND ADMIN — BUILD SCRIPT
   ============================================================
   Genuinely reuses zfind-web's existing architecture — vendor SDK,
   config template and services are read directly from zfind-web.

   The Admin source predates the six-language public contract and has
   a historical three-locale authoring constant. The deterministic
   build upgrades that single legacy declaration to the canonical
   persisted locale set without duplicating the Admin application.

   Usage: node scripts/build.js
   Output: dist/z-find-admin.html
   ============================================================ */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const WEB_SRC = path.join(__dirname, '..', '..', 'zfind-web', 'src');
const DIST = path.join(__dirname, '..', 'dist');

function read(fullPath, label) {
  if (!fs.existsSync(fullPath)) {
    throw new Error(`BUILD FAILED: required source artifact missing: ${label} (expected at ${fullPath})`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}
function readAdmin(file) { return read(path.join(SRC, file), file); }
function readWeb(file) { return read(path.join(WEB_SRC, file), 'zfind-web/src/' + file + ' (reused)'); }

function resolvePlaceholders(text, replacements, sourceLabel) {
  let resolved = text;
  for (const [placeholder, value] of Object.entries(replacements)) {
    const count = (resolved.match(new RegExp(placeholder, 'g')) || []).length;
    if (count === 0) throw new Error(`BUILD FAILED: no ${placeholder} placeholder found in ${sourceLabel}.`);
    resolved = resolved.split(placeholder).join(value);
  }
  return resolved;
}

function sixLanguageAdminApp(source) {
  const legacy = "const LOCALES = ['en', 'pt', 'fr'];";
  const canonical = "const LOCALES = ['fr', 'en', 'pt-PT', 'es', 'de', 'it'];";
  if (!source.includes(legacy)) {
    throw new Error('BUILD FAILED: Z Find Admin legacy locale declaration changed unexpectedly; review six-language authoring convergence.');
  }
  const resolved = source.replace(legacy, canonical);
  if (resolved.includes(legacy)) {
    throw new Error('BUILD FAILED: Z Find Admin locale convergence was only partially applied.');
  }
  return resolved;
}

function build() {
  const head = readAdmin('head.txt');
  const css = readAdmin('css.txt');
  const body = readAdmin('body.html');
  const appJs = sixLanguageAdminApp(readAdmin('app.js'));

  const vendorSupabase = readWeb('vendor-supabase.js');
  const configTemplate = readWeb('config.template.js');
  const supabaseClient = readWeb('services/supabaseClient.js');
  const propertyTaxonomyService = readWeb('services/property-taxonomy.js');
  const authService = readWeb('services/auth.js');
  const identityService = readWeb('services/identity.js');
  const registryService = readWeb('services/registry.js');
  const verificationService = readWeb('services/verification.js');
  const observationService = readWeb('services/observation.js');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const missing = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  if (missing.length) throw new Error(`BUILD FAILED: missing required environment variable(s): ${missing.join(', ')}.`);

  const resolvedConfig = resolvePlaceholders(configTemplate, { '__SUPABASE_URL__': supabaseUrl, '__SUPABASE_ANON_KEY__': supabaseAnonKey }, 'config.template.js');

  const html = head
    + '<style>\n' + css + '\n</style>\n'
    + body
    + '\n<script>\n'
    + vendorSupabase + '\n'
    + resolvedConfig + '\n'
    + supabaseClient + '\n'
    + propertyTaxonomyService + '\n'
    + authService + '\n'
    + identityService + '\n'
    + registryService + '\n'
    + verificationService + '\n'
    + observationService + '\n'
    + readWeb('services/image-optimize.js') + '\n'
    + readWeb('services/admin.js') + '\n'
    + readWeb('services/field-forms.js') + '\n'
    + appJs
    + '\n</script>\n</body>\n</html>\n';

  fs.mkdirSync(DIST, { recursive: true });
  const outPath = path.join(DIST, 'z-find-admin.html');
  fs.writeFileSync(outPath, html);
  console.log('Built:', outPath);
  console.log('Size:', Buffer.byteLength(html, 'utf8'), 'bytes');
  console.log('Supabase config placeholders: resolved, 0 remaining');
  console.log('Listing authoring locales: fr, en, pt-PT, es, de, it');
  return { outPath };
}

if (require.main === module) build();
module.exports = { build, sixLanguageAdminApp };
