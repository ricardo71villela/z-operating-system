#!/usr/bin/env node
/* ============================================================
   Z FIND — VERCEL OUTPUT ASSEMBLY
   ============================================================
   Assembles the SPA, static SEO pages, public assets and build-vendored
   Search Map assets into vercel-output/.
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

  // 3. Build-vendored MapLibre assets. The browser requests these as
  // /vendor/* from the Z Find origin; no CDN request is made at runtime.
  const vendorSrc = path.join(ROOT, 'dist', 'vendor');
  const requiredVendor = ['maplibre-gl.js', 'maplibre-gl.css'];
  for (const file of requiredVendor) {
    if (!fs.existsSync(path.join(vendorSrc, file))) {
      throw new Error(`BUILD FAILED: dist/vendor/${file} missing — Search Map same-origin asset contract would be broken.`);
    }
  }
  copyRecursive(vendorSrc, path.join(OUT, 'vendor'));

  // 4. Real static SEO pages, at their clean URL path.
  const seoSrc = path.join(ROOT, 'dist', 'seo');

  if (!fs.existsSync(seoSrc)) {
    throw new Error(
      'BUILD FAILED: dist/seo/ not found — run SEO generation before assembling a Vercel deployment.'
    );
  }

  for (const requiredFile of ['robots.txt', 'sitemap.xml']) {
    const requiredPath = path.join(seoSrc, requiredFile);
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`BUILD FAILED: dist/seo/${requiredFile} is missing.`);
    }
  }

  copyRecursive(seoSrc, OUT);

  console.log('Static SEO pages and indexing artifacts included in Vercel output.');
  console.log('Same-origin Search Map vendor assets included in Vercel output.');
  console.log('Vercel output assembled at:', OUT);
}

main();
