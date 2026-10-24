#!/bin/sh
# Vercel build of the public site (vercel.json buildCommand; Vercel
# limits that field to 256 characters, so the steps live here).
set -e
rm -rf public && mkdir -p public
cp ./*.html ./*.css ./*.js public/
cp robots.txt sitemap.xml public/
cp launch.html public/index.html
# Old preview pages stay in the repository for their own tests only.
rm -f public/fr.html public/polished.html
cp -R brand public/brand
node ../../scripts/write-zfashion-config.js public
echo Z_FASHION_STATIC_PREVIEW_BUILD=PASS
