/* ============================================================
   Z FASHION — MEDIA (bounded context: fashion-domain)
   ============================================================
   Rules for product photos and store logos. Pure: no I/O.

   - Accepted formats: JPEG, PNG, WebP — recognised from the file's
     own first bytes, never from its name or the declared type alone
     (a renamed file or a wrong Content-Type is refused).
   - At most 5 MB per file. The Partner console scales photos down to
     2000 px before sending, so real photos stay well under it.
   - At most 8 photos per product; the first one is the cover shown on
     listings.
   - Storage paths are built here from ids only, never from a file
     name the store chose: partners/<partnerId>/products/<productId>/
     <imageId>.<ext> and partners/<partnerId>/logo/<imageId>.<ext>.
   ============================================================ */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES_PER_PRODUCT = 8;

const FORMATS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Real image type from the first bytes, or null. */
function sniffImageType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

/**
 * @param {{ declaredType: string, bytes: Uint8Array }} upload
 * @returns {{ ok: true, contentType: string, extension: string, byteSize: number } | { ok: false, code: string }}
 *   codes: empty, too_large, unsupported_type, type_mismatch
 */
function validateImageUpload({ declaredType, bytes }) {
  if (!bytes || bytes.length === 0) return { ok: false, code: 'empty' };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, code: 'too_large' };
  const declared = String(declaredType || '').split(';')[0].trim().toLowerCase();
  const actual = sniffImageType(bytes);
  if (!actual) return { ok: false, code: 'unsupported_type' };
  if (declared && declared !== actual) return { ok: false, code: 'type_mismatch' };
  return { ok: true, contentType: actual, extension: FORMATS[actual], byteSize: bytes.length };
}

function assertSafeId(name, value) {
  if (typeof value !== 'string' || !(UUID_RE.test(value) || SAFE_ID_RE.test(value))) {
    throw new Error(`${name} must be an id (letters, digits, - or _)`);
  }
}

function productImagePath(partnerId, productId, imageId, extension) {
  assertSafeId('partnerId', partnerId); assertSafeId('productId', productId); assertSafeId('imageId', imageId);
  if (!Object.values(FORMATS).includes(extension)) throw new Error('unsupported extension');
  return `partners/${partnerId}/products/${productId}/${imageId}.${extension}`;
}

function logoPath(partnerId, imageId, extension) {
  assertSafeId('partnerId', partnerId); assertSafeId('imageId', imageId);
  if (!Object.values(FORMATS).includes(extension)) throw new Error('unsupported extension');
  return `partners/${partnerId}/logo/${imageId}.${extension}`;
}

/** A new order must name exactly the product's current images, once each. */
function isValidImageOrder(currentIds, requestedIds) {
  if (!Array.isArray(requestedIds) || requestedIds.length !== currentIds.length) return false;
  const want = new Set(currentIds);
  const seen = new Set();
  for (const id of requestedIds) {
    if (!want.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_PRODUCT,
  FORMATS,
  sniffImageType,
  validateImageUpload,
  productImagePath,
  logoPath,
  isValidImageOrder,
};
