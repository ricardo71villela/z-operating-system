/* ============================================================
   Z FASHION PARTNER — media storage
   ============================================================
   Where product photos and store logos are written.

   - Database mode: Supabase Storage, public bucket (default
     "zfashion-media", FASHION_MEDIA_BUCKET to override), written with a
     server-side secret key (SUPABASE_SECRET_KEY, or the legacy
     SUPABASE_SERVICE_ROLE_KEY). That key never leaves this server; no
     browser ever writes to Storage. Without the key, uploads are
     refused with 503 rather than half-working.
   - In-memory mode (local development, tests): files kept in memory and
     served by this API at /media/<path>.

   Both expose the same three operations: put, remove, publicUrl.
   ============================================================ */

const DEFAULT_BUCKET = 'zfashion-media';

function supabaseStorage({ projectUrl, secretKey, bucket = DEFAULT_BUCKET, fetchImpl = globalThis.fetch }) {
  const base = String(projectUrl).replace(/\/+$/, '');
  const headers = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };
  const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');
  return {
    kind: 'supabase',
    bucket,
    async put(path, bytes, contentType) {
      const res = await fetchImpl(`${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodePath(path)}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' },
        body: bytes,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`storage upload failed (${res.status}) ${text.slice(0, 200)}`);
        err.code = 'storage_failed';
        throw err;
      }
    },
    async remove(path) {
      const res = await fetchImpl(`${base}/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [path] }),
      });
      if (!res.ok) {
        const err = new Error(`storage delete failed (${res.status})`);
        err.code = 'storage_failed';
        throw err;
      }
    },
    publicUrl(path) {
      return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodePath(path)}`;
    },
  };
}

function memoryStorage({ publicBaseUrl = '' } = {}) {
  const files = new Map();
  return {
    kind: 'memory',
    files,
    async put(path, bytes, contentType) {
      if (files.has(path)) throw new Error('already exists');
      files.set(path, { bytes: Buffer.from(bytes), contentType });
    },
    async remove(path) { files.delete(path); },
    publicUrl(path) { return `${publicBaseUrl}/media/${path}`; },
    get(path) { return files.get(path) || null; },
  };
}

/** Storage for this process, or null when database mode lacks the secret key. */
function createMediaStorage({ usingPostgres, env = process.env, publicBaseUrl }) {
  if (!usingPostgres) return memoryStorage({ publicBaseUrl });
  const projectUrl = env.SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!projectUrl || !secretKey) return null;
  return supabaseStorage({ projectUrl, secretKey, bucket: env.FASHION_MEDIA_BUCKET || DEFAULT_BUCKET });
}

/** Public URL of a stored path even when uploads are not configured (reads only need the project URL). */
function publicUrlFor({ usingPostgres, env = process.env, storage, path }) {
  if (storage) return storage.publicUrl(path);
  if (usingPostgres && env.SUPABASE_URL) {
    return supabaseStorage({ projectUrl: env.SUPABASE_URL, secretKey: '', bucket: env.FASHION_MEDIA_BUCKET || DEFAULT_BUCKET }).publicUrl(path);
  }
  return null;
}

module.exports = { DEFAULT_BUCKET, supabaseStorage, memoryStorage, createMediaStorage, publicUrlFor };
