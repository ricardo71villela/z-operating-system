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

function main() {
  const spaFile = path.join(ROOT, 'dist', 'z-find-prototype.html');
  if (!fs.existsSync(spaFile)) {
    throw new Error('BUILD FAILED: dist/z-find-prototype.html not found — run `npm run build:zfind` first.');
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 1. SPA as index.html (served at "/")
  fs.copyFileSync(spaFile, path.join(OUT, 'index.html'));

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

main();
