/* ============================================================
   Z FIND — tratamento das fotografias dos anúncios (servidor, sharp)

   Toda fotografia guardada pelo Z Find passa por aqui, qualquer que
   seja a origem (carregamento manual Partner / Admin, importação por
   links, fluxo automático) :

     1. leitura segura : JPEG, PNG, WebP, AVIF, GIF (1.ª imagem), TIFF ;
        no máximo 100 megapixels (protege contra « bombas » de imagem) ;
     2. orientação aplicada (EXIF) e cores convertidas para sRGB, para
        que a foto apareça como no telemóvel, em qualquer ecrã ;
     3. metadados retirados : localização GPS, modelo do aparelho, data…
        (privacidade do proprietário e do fotógrafo) ;
     4. « display » : lado maior ≤ 2560 px, WebP qualidade 82 — a versão
        da página do anúncio, nítida mesmo em ecrã retina ;
        « card » : lado maior ≤ 800 px, WebP qualidade 78 — as grelhas
        de pesquisa, o portefeuille, os e-mails ;
     5. nunca aumenta uma imagem pequena.

   WebP a estas qualidades é visualmente idêntico ao original numa
   fotografia de imóvel, e pesa tipicamente 5 a 15 vezes menos que a
   foto de um telemóvel (ver tests/unit/photo-pipeline.test.js).
   ============================================================ */
'use strict';

const DISPLAY = Object.freeze({ edge: 2560, quality: 82 });
const CARD = Object.freeze({ edge: 800, quality: 78 });
const MAX_INPUT_PIXELS = 100 * 1000 * 1000;
const MAX_PER_OWNER = 20;
const INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif']);

let sharpModule;
function sharp() {
  if (sharpModule === undefined) {
    try { sharpModule = require('sharp'); } catch (_) { sharpModule = null; }
  }
  return sharpModule;
}

class PhotoError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

function encode(lib, buffer, spec) {
  return lib(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS, animated: false })
    .rotate() // orientação EXIF aplicada aos píxeis
    .toColourspace('srgb')
    .resize({ width: spec.edge, height: spec.edge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: spec.quality, effort: 5, smartSubsample: true })
    .toBuffer({ resolveWithObject: true }); // sem withMetadata : EXIF / GPS / XMP retirados
}

/** buffer (qualquer formato aceite) → { display, card, input } ; lança PhotoError. */
async function processPhoto(buffer) {
  const lib = sharp();
  if (!lib) throw new PhotoError('unavailable', 'Traitement d’image indisponible.');
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new PhotoError('empty', 'Fichier vide.');
  let meta;
  try {
    meta = await lib(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch (e) {
    if (/pixel limit/i.test(String(e.message))) throw new PhotoError('too_large', 'Image trop grande (plus de 100 mégapixels).');
    throw new PhotoError('unreadable', 'Ce fichier n’est pas une image lisible.');
  }
  if (!INPUT_FORMATS.has(meta.format)) throw new PhotoError('format', 'Format non pris en charge : envoyez une photo JPEG, PNG ou WebP.');
  if (meta.format === 'heif' && !/av1/i.test(String(meta.compression || ''))) {
    throw new PhotoError('heic', 'Format HEIC (iPhone) : envoyez la photo depuis l’iPhone (elle est alors convertie automatiquement) ou exportez-la en JPEG.');
  }
  if ((meta.width || 0) < 200 || (meta.height || 0) < 200) throw new PhotoError('too_small', 'Photo trop petite (moins de 200 pixels de côté).');
  try {
    const [d, c] = await Promise.all([encode(lib, buffer, DISPLAY), encode(lib, buffer, CARD)]);
    return {
      input: { bytes: buffer.length, format: meta.format, width: meta.width, height: meta.height },
      display: { buffer: d.data, type: 'image/webp', ext: 'webp', width: d.info.width, height: d.info.height, bytes: d.data.length },
      card: { buffer: c.data, type: 'image/webp', ext: 'webp', width: c.info.width, height: c.info.height, bytes: c.data.length }
    };
  } catch (e) {
    throw new PhotoError('unreadable', 'Cette image est abîmée ou incomplète.');
  }
}

module.exports = { processPhoto, PhotoError, DISPLAY, CARD, MAX_PER_OWNER, MAX_INPUT_PIXELS, _sharp: sharp };
