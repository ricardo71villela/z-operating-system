#!/usr/bin/env node
/* ============================================================
   Writes zfashion-config.js into a built site folder from the
   FASHION_API_BASE_URL environment variable (set in the hosting
   project, e.g. https://api.zfashion.online).

     node apps/fashion/scripts/write-zfashion-config.js <outDir>

   - unset or empty  -> apiBaseUrl '' (public site: demonstration
                        catalogue; panels: sign-in works, data refused)
   - set             -> must be https://host[:port], no path, no
                        trailing slash; anything else fails the build
   Used by the Vercel builds of fashion-web, fashion-partner/public and
   fashion-admin, so the committed file stays empty and the address
   lives in the hosting settings.
   ============================================================ */

const fs = require('fs');
const path = require('path');

function apiBaseUrlFrom(raw) {
  const value = String(raw || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  if (!/^https:\/\/[a-z0-9.-]+(:\d{2,5})?$/i.test(value)) {
    throw new Error(`FASHION_API_BASE_URL must look like https://api.example.com (got "${value}")`);
  }
  return value;
}

function configSource(apiBaseUrl) {
  return [
    '// Generated at build time by apps/fashion/scripts/write-zfashion-config.js',
    '// from FASHION_API_BASE_URL. Do not edit in the build output.',
    'window.__ZFASHION_CONFIG__ = {',
    `  apiBaseUrl: ${JSON.stringify(apiBaseUrl)},`,
    '};',
    '',
  ].join('\n');
}

if (require.main === module) {
  const outDir = process.argv[2];
  if (!outDir) { console.error('usage: write-zfashion-config.js <outDir>'); process.exit(2); }
  try {
    const url = apiBaseUrlFrom(process.env.FASHION_API_BASE_URL);
    fs.writeFileSync(path.join(outDir, 'zfashion-config.js'), configSource(url));
    console.log(url ? `zfashion-config.js -> ${url}` : 'zfashion-config.js -> (no API address: demonstration / sign-in only)');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { apiBaseUrlFrom, configSource };
