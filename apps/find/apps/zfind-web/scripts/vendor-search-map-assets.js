#!/usr/bin/env node
'use strict';

/*
 * Z FIND — Search Map Presentation V1 vendor step
 *
 * MapLibre GL JS is downloaded at build time from one exact, pinned
 * upstream version and emitted into dist/vendor. The browser therefore
 * loads MapLibre JS/CSS from the Z Find deployment origin, never from a
 * third-party CDN. OpenFreeMap remains the map-data provider and is only
 * contacted after the visitor activates the Map surface.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const VERSION = '5.24.0';
const DIST = path.join(__dirname, '..', 'dist', 'vendor');
const ASSETS = Object.freeze([
  {
    url: `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.js`,
    file: 'maplibre-gl.js',
    minBytes: 900000,
    marker: 'maplibre'
  },
  {
    url: `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.css`,
    file: 'maplibre-gl.css',
    minBytes: 50000,
    marker: '.maplibregl-map'
  }
]);

function download(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Z-Find-build/1.0',
        'Accept': '*/*'
      }
    }, response => {
      const status = response.statusCode || 0;
      const location = response.headers.location;

      if (status >= 300 && status < 400 && location) {
        response.resume();
        if (redirectsLeft <= 0) {
          reject(new Error(`Too many redirects while fetching ${url}`));
          return;
        }
        resolve(download(new URL(location, url).toString(), redirectsLeft - 1));
        return;
      }

      if (status !== 200) {
        response.resume();
        reject(new Error(`HTTP ${status} while fetching ${url}`));
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(DIST, { recursive: true });

  for (const asset of ASSETS) {
    const body = await download(asset.url);
    const textProbe = body.toString('utf8', 0, Math.min(body.length, 250000));

    if (body.length < asset.minBytes || !textProbe.toLowerCase().includes(asset.marker.toLowerCase())) {
      throw new Error(
        `BUILD FAILED: pinned MapLibre ${VERSION} asset validation failed for ${asset.file}.`
      );
    }

    fs.writeFileSync(path.join(DIST, asset.file), body);
    console.log(`Vendored MapLibre ${VERSION}: dist/vendor/${asset.file} (${body.length} bytes)`);
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
