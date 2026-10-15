/* Supabase Storage adapter against a fake fetch: exact URLs, headers and
   bodies the real Storage API expects; errors surface; no key, no uploads. */
const assert = require('assert');
const { supabaseStorage, createMediaStorage, publicUrlFor } = require('../src/media-storage');

(async () => {
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, text: async () => '' }; };
  const s = supabaseStorage({ projectUrl: 'https://abc.supabase.co/', secretKey: 'sb_secret_x', fetchImpl: fakeFetch });
  const bytes = Buffer.from([1, 2, 3]);

  await s.put('partners/p/products/r/i.jpg', bytes, 'image/jpeg');
  assert.strictEqual(calls[0].url, 'https://abc.supabase.co/storage/v1/object/zfashion-media/partners/p/products/r/i.jpg');
  assert.strictEqual(calls[0].init.method, 'POST');
  assert.strictEqual(calls[0].init.headers.apikey, 'sb_secret_x');
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer sb_secret_x');
  assert.strictEqual(calls[0].init.headers['Content-Type'], 'image/jpeg');
  assert.strictEqual(calls[0].init.headers['x-upsert'], 'false', 'never silently overwrites');
  assert.strictEqual(calls[0].init.body, bytes);

  await s.remove('partners/p/products/r/i.jpg');
  assert.strictEqual(calls[1].url, 'https://abc.supabase.co/storage/v1/object/zfashion-media');
  assert.strictEqual(calls[1].init.method, 'DELETE');
  assert.deepStrictEqual(JSON.parse(calls[1].init.body), { prefixes: ['partners/p/products/r/i.jpg'] });

  assert.strictEqual(s.publicUrl('partners/p/logo/i.png'), 'https://abc.supabase.co/storage/v1/object/public/zfashion-media/partners/p/logo/i.png');

  const failing = supabaseStorage({ projectUrl: 'https://abc.supabase.co', secretKey: 'k', fetchImpl: async () => ({ ok: false, status: 400, text: async () => 'Bucket not found' }) });
  await assert.rejects(() => failing.put('a/b.jpg', bytes, 'image/jpeg'), (err) => err.code === 'storage_failed' && /Bucket not found/.test(err.message));

  // Database mode without the secret key: no storage (uploads refused), but public URLs still resolve.
  assert.strictEqual(createMediaStorage({ usingPostgres: true, env: { SUPABASE_URL: 'https://abc.supabase.co' } }), null);
  assert.strictEqual(createMediaStorage({ usingPostgres: true, env: { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' } }).kind, 'supabase');
  assert.strictEqual(createMediaStorage({ usingPostgres: true, env: { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'k', FASHION_MEDIA_BUCKET: 'other' } }).bucket, 'other');
  assert.strictEqual(publicUrlFor({ usingPostgres: true, env: { SUPABASE_URL: 'https://abc.supabase.co' }, storage: null, path: 'partners/p/logo/i.png' }),
    'https://abc.supabase.co/storage/v1/object/public/zfashion-media/partners/p/logo/i.png');
  assert.strictEqual(createMediaStorage({ usingPostgres: false, publicBaseUrl: 'http://x' }).kind, 'memory');

  console.log('fashion-partner media storage: all checks passed.');
})().catch((err) => { console.error(err); process.exit(1); });
