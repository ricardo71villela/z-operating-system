/* ============================================================
   Z FIND — services/image-optimize.js
   ============================================================
   Real problem this addresses: partner-uploaded photos go straight to
   storage as-is today — a 20MB photo straight off a phone stays
   20MB, forever, slowing every page that shows it and wasting
   storage. media_assets.width/height have also always been null —
   nothing ever measured the image.

   Deliberate architecture choice, not an oversight: this optimizes
   client-side, BEFORE upload, using the Canvas API — not a
   server-side pipeline (no Supabase Edge Function deployed for this;
   that would be the more complete answer, populating
   media_variants with multiple real derived sizes, but requires
   infrastructure this session cannot deploy and verify end-to-end).
   What this DOES solve, fully: the single biggest cost — an
   oversized original never gets uploaded or stored in the first
   place. What it does NOT solve: multiple responsive sizes for
   different screen widths — that's the honest scope boundary,
   recorded here rather than implied to be more complete than it is.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ZFindServices = root.ZFindServices || {}; root.ZFindServices.imageOptimize = factory(); }
})(typeof window !== 'undefined' ? window : this, function () {

const MAX_DIMENSION = 2400; // long edge — comfortably more than any real display needs, including retina hero images; never upscales
const JPEG_QUALITY = 0.82;  // visually near-lossless for real estate photography at this resolution, meaningfully smaller than 0.9+

/** Resizes (if needed) and recompresses an image File/Blob before
    upload. Returns { blob, width, height, skipped } — skipped is true
    when the input wasn't a recognisable image (passed through
    unchanged, never blocks an upload on a format this can't read) or
    was already small enough that re-encoding would only cost quality
    for no real size benefit. Never throws — a failure to optimize
    falls back to the original file, since an unoptimized upload is
    always better than a blocked one. */
async function optimizeImage(file) {
  if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return { blob: file, width: null, height: null, skipped: true };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    // Format this browser can't decode (rare, e.g. some HEIC cases) —
    // pass the original through rather than blocking the upload.
    return { blob: file, width: null, height: null, skipped: true };
  }

  const { width: origWidth, height: origHeight } = bitmap;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(origWidth, origHeight)); // never upscales
  const targetWidth = Math.round(origWidth * scale);
  const targetHeight = Math.round(origHeight * scale);

  // Already small AND already a compressed format — re-encoding would
  // only lose quality for no real size win. Still report real
  // dimensions, since media_assets.width/height should never stay
  // null just because optimization was skipped.
  if (scale === 1 && file.size < 400 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/webp')) {
    bitmap.close();
    return { blob: file, width: origWidth, height: origHeight, skipped: true };
  }

  const canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(targetWidth, targetHeight) : document.createElement('canvas');
  if (!(canvas instanceof OffscreenCanvas)) { canvas.width = targetWidth; canvas.height = targetHeight; }
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const blob = await new Promise(resolve => {
    if (canvas.convertToBlob) canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY }).then(resolve);
    else canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
  });

  if (!blob) return { blob: file, width: origWidth, height: origHeight, skipped: true }; // encoding failed — fall back, never block

  return { blob, width: targetWidth, height: targetHeight, skipped: false };
}

return { optimizeImage, MAX_DIMENSION, JPEG_QUALITY };

});
