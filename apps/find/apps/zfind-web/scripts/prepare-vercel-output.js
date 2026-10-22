#!/usr/bin/env node
/* ============================================================
   Z FIND — VERCEL OUTPUT ASSEMBLY
   ============================================================
   The existing build (npm run build:zfind) produces a single file
   (dist/z-find-prototype.html) — correct for local testing, but not
   the directory structure Vercel needs to serve three different
   things at the right URLs:

   1. The SPA itself — needs to be reachable at "/" AND as a fallback
      for any path that isn't a real static file (hash-routing lives
      entirely client-side, so any path Vercel doesn't recognise must
      still serve the SPA, which then reads the URL fragment).
   2. Real static SEO pages (dist/seo/{locale}/{kind}/{id}.html) — need
      to be served at their exact clean URL (e.g. /en/property/xyz,
      no .html, no hash) so a crawler gets real, indexable HTML.
   3. Static assets (public/zones/*.jpg, public/brand/*) — served as-is
      at the root.

   This script copies all three into vercel-output/, which
   apps/zfind-web/vercel.json points Vercel's build at. Run via
   `npm run build:vercel` — never part of the plain `build:zfind`
   (same reasoning as build:seo-pages: this assumes a real deploy
   target, not every local build).
   ============================================================ */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'vercel-output');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}


// Moves the page's one large inline <style> and one large inline <script>
// into content-hashed files under /assets/. The browser then caches them for
// a year (see the /assets/ header in vercel.json) instead of downloading
// ~1 MB again on every visit; a new build gets new file names, so a deploy is
// never served stale code. The single-file dist/z-find-prototype.html stays
// as it is for the local browser tests.
const STYLE_OPEN = '<style>\n';
const STYLE_CLOSE = '\n</style>\n</head>\n<body>\n';
const SCRIPT_OPEN = '\n<script>\n';
const SCRIPT_CLOSE = '\n</script>\n</body>\n</html>\n';

function writeHashedAsset(dir, name, ext, content) {
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
  const file = `${name}.${hash}.${ext}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), content);
  return `/assets/${file}`;
}

function externalizeShellAssets(html, outDir) {
  const styleEnd = html.indexOf(STYLE_CLOSE);
  const styleStart = styleEnd === -1 ? -1 : html.lastIndexOf(STYLE_OPEN, styleEnd);
  if (styleStart === -1) throw new Error('BUILD FAILED: main <style> block not found in the SPA.');
  if (!html.endsWith(SCRIPT_CLOSE)) throw new Error('BUILD FAILED: SPA does not end with the main <script> block.');
  const scriptEnd = html.length - SCRIPT_CLOSE.length;
  const scriptStart = html.lastIndexOf(SCRIPT_OPEN, scriptEnd);
  if (scriptStart === -1 || scriptStart < styleEnd) throw new Error('BUILD FAILED: main <script> block not found in the SPA.');

  const css = html.slice(styleStart + STYLE_OPEN.length, styleEnd);
  const js = html.slice(scriptStart + SCRIPT_OPEN.length, scriptEnd);
  if (/<\/script/i.test(js)) throw new Error('BUILD FAILED: main script unexpectedly contains a closing script tag.');
  const assets = path.join(outDir, 'assets');
  const cssUrl = writeHashedAsset(assets, 'zfind', 'css', css);
  const jsUrl = writeHashedAsset(assets, 'zfind', 'js', js);

  // A classic (non-deferred) script at the end of <body> runs at the same
  // moment the inline one did, so inline onclick handlers keep working.
  return html.slice(0, styleStart)
    + `<link rel="stylesheet" href="${cssUrl}">\n</head>\n<body>\n`
    + html.slice(styleEnd + STYLE_CLOSE.length, scriptStart)
    + `\n<script src="${jsUrl}"></script>\n</body>\n</html>\n`;
}

function main() {
  const spaFile = path.join(ROOT, 'dist', 'z-find-prototype.html');
  if (!fs.existsSync(spaFile)) {
    throw new Error('BUILD FAILED: dist/z-find-prototype.html not found — run `npm run build:zfind` first.');
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 1. SPA as index.html (served at "/"), its CSS and JS as cached files
  const spa = fs.readFileSync(spaFile, 'utf8');
  const shell = externalizeShellAssets(spa, OUT);
  fs.writeFileSync(path.join(OUT, 'index.html'), shell);
  console.log('SPA shell:', Buffer.byteLength(spa), 'bytes inline ->', Buffer.byteLength(shell), 'bytes + cached /assets/');

  // 2. Static assets (public/zones/*, public/brand/*) at root
  copyRecursive(path.join(ROOT, 'public'), OUT);

  // 3. Real static SEO pages, at their clean URL path (Vercel's
  // cleanUrls setting in vercel.json strips the .html when matching
  // an incoming request, e.g. a request for /en/property/xyz matches
  // this file on disk without needing the extension in the URL).
  const seoSrc = path.join(ROOT, 'dist', 'seo');

  if (!fs.existsSync(seoSrc)) {
    throw new Error(
      'BUILD FAILED: dist/seo/ not found — run SEO generation before assembling a Vercel deployment.'
    );
  }

  for (const requiredFile of ['robots.txt', 'sitemap.xml']) {
    const requiredPath = path.join(
      seoSrc,
      requiredFile
    );

    if (!fs.existsSync(requiredPath)) {
      throw new Error(
        `BUILD FAILED: dist/seo/${requiredFile} is missing.`
      );
    }
  }

  copyRecursive(
    seoSrc,
    OUT
  );

  console.log(
    'Static SEO pages and indexing artifacts included in Vercel output.'
  );

  console.log('Vercel output assembled at:', OUT);
}

if (require.main === module) main();
module.exports = { externalizeShellAssets };
