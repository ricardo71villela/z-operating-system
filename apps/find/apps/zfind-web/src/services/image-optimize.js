/* ============================================================
   Z FIND — services/image-optimize.js  (navigateur)
   ============================================================
   Depuis le 30/10/2026, le traitement DÉFINITIF de chaque photo est fait
   par le serveur (api/_lib/photo-pipeline.js : WebP ≤ 2560 px + vignette
   800 px, métadonnées et position GPS retirées) — le résultat ne dépend
   plus du navigateur ni du téléphone.

   Ici, seulement une préparation légère avant l'envoi, pour qu'un
   téléphone envoie vite une photo de 10 ou 20 Mo :
     * photo de plus de 3200 px de côté ou de plus de 6 Mo : réduite à
       3200 px et réencodée en JPEG qualité 0,92 (sans perte visible ; le
       serveur la réduira encore à 2560 px) ;
     * sinon : envoyée telle quelle (aucune double compression) ;
     * format que le navigateur ne sait pas lire (HEIC sur un ordinateur,
       par exemple) : envoyé tel quel, le serveur répond clairement.
   Ne bloque jamais un envoi : en cas d'échec, le fichier d'origine part.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ZFindServices = root.ZFindServices || {}; root.ZFindServices.imageOptimize = factory(); }
})(typeof window !== 'undefined' ? window : this, function () {

const PREPARE_EDGE = 3200;
const PREPARE_QUALITY = 0.92;
const PREPARE_ABOVE_BYTES = 6 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // limite du stockage (migration 20261030090000)
const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif';

function extOf(file) {
  const t = String(file && file.type || '').toLowerCase();
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif', 'image/tiff': 'tif' };
  if (map[t]) return map[t];
  const m = /\.([a-z0-9]{2,5})$/i.exec(String(file && file.name || ''));
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

/** Décide s'il faut préparer (pure, testable). */
function needsPreparation(width, height, bytes) {
  return Math.max(width || 0, height || 0) > PREPARE_EDGE || (bytes || 0) > PREPARE_ABOVE_BYTES;
}

/** File → { blob, type, ext, width, height, prepared }. Ne lève jamais. */
async function prepareForUpload(file) {
  const passthrough = { blob: file, type: file && file.type || 'application/octet-stream', ext: extOf(file), width: null, height: null, prepared: false };
  if (!file || (file.type && !file.type.startsWith('image/')) || file.type === 'image/svg+xml') return passthrough;
  if (typeof createImageBitmap !== 'function') return passthrough;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (_) {
    return passthrough; // HEIC sur ordinateur, etc. : le serveur répondra
  }
  const w = bitmap.width, h = bitmap.height;
  if (!needsPreparation(w, h, file.size)) { bitmap.close(); return Object.assign(passthrough, { width: w, height: h }); }
  try {
    const scale = Math.min(1, PREPARE_EDGE / Math.max(w, h));
    const tw = Math.round(w * scale), th = Math.round(h * scale);
    const canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(tw, th) : document.createElement('canvas');
    if (!(typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas)) { canvas.width = tw; canvas.height = th; }
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, tw, th);
    bitmap.close();
    const blob = await new Promise(resolve => {
      if (canvas.convertToBlob) canvas.convertToBlob({ type: 'image/jpeg', quality: PREPARE_QUALITY }).then(resolve, () => resolve(null));
      else canvas.toBlob(resolve, 'image/jpeg', PREPARE_QUALITY);
    });
    if (!blob || blob.type !== 'image/jpeg') return Object.assign(passthrough, { width: w, height: h });
    return { blob, type: 'image/jpeg', ext: 'jpg', width: tw, height: th, prepared: true };
  } catch (_) {
    try { bitmap.close(); } catch (__) { /* déjà fermée */ }
    return Object.assign(passthrough, { width: w, height: h });
  }
}

/* Compatibilité : ancien nom (ne compresse plus définitivement). */
async function optimizeImage(file) {
  const p = await prepareForUpload(file);
  return { blob: p.blob, width: p.width, height: p.height, skipped: !p.prepared, type: p.type, ext: p.ext };
}

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v >= 1024 * 1024) return (v / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
  return Math.max(1, Math.round(v / 1024)) + ' Ko';
}

return { prepareForUpload, optimizeImage, needsPreparation, formatBytes, extOf, PREPARE_EDGE, PREPARE_QUALITY, PREPARE_ABOVE_BYTES, MAX_UPLOAD_BYTES, ACCEPT };

});
