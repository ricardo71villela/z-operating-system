#!/usr/bin/env node
/* ============================================================
   Z FIND PARTNER — BUILD SCRIPT
   ============================================================
   Same pattern as zfind-admin/scripts/build.js: genuinely reuses
   zfind-web's vendor SDK, config template, and services/*.js files
   directly, never copies them.

   Usage: node scripts/build.js
   Output: dist/z-find-partner.html
   ============================================================ */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const WEB_SRC = path.join(__dirname, '..', '..', 'zfind-web', 'src'); // genuine reuse, not a copy
const DIST = path.join(__dirname, '..', 'dist');

function read(fullPath, label) {
  if (!fs.existsSync(fullPath)) {
    throw new Error(`BUILD FAILED: required source artifact missing: ${label} (expected at ${fullPath})`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}
function readPartner(file) { return read(path.join(SRC, file), file); }
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

function build() {
  const head = readPartner('head.txt');
  const css = readPartner('css.txt');
  const body = readPartner('body.html');
  const appJs = readPartner('app.js');

  // Genuinely reused, not copied:
  const vendorSupabase = readWeb('vendor-supabase.js');
  const configTemplate = readWeb('config.template.js');
  const supabaseClient = readWeb('services/supabaseClient.js');
  const propertyTaxonomyService = readWeb('services/property-taxonomy.js');
  const authService = readWeb('services/auth.js');
  const identityService = readWeb('services/identity.js');
  const partnerDashboardService = readWeb('services/partner-dashboard.js');
  const adminService = readWeb('services/admin.js');
  const fieldFormsService = readWeb('services/field-forms.js');
  const imageOptimizeService = readWeb('services/image-optimize.js');

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
    + partnerDashboardService + '\n'
    + imageOptimizeService + '\n'
    + adminService + '\n'
    + fieldFormsService + '\n'
    + appJs
    + '\n</script>\n</body>\n</html>\n';

  fs.mkdirSync(DIST, { recursive: true });
  const outPath = path.join(DIST, 'z-find-partner.html');
  fs.writeFileSync(outPath, html);
  console.log('Built:', outPath);
  console.log('Size:', Buffer.byteLength(html, 'utf8'), 'bytes');
  console.log('Supabase config placeholders: resolved, 0 remaining');
  return { outPath };
}

if (require.main === module) build();
module.exports = { build };
