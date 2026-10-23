// Supabase Storage adapter against a minimal local stand-in of the Storage API.
// Runs with: npx tsx apps/jobs/apps/api/src/fileStorageService.test.ts
import http from 'node:http';
import assert from 'node:assert/strict';
import { SupabaseStorageFileStorageService } from './fileStorageService';
const files = new Map<string, Buffer>(); const log: string[] = [];
const srv = http.createServer((req, res) => {
  const chunks: Buffer[] = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    const body = Buffer.concat(chunks); log.push(`${req.method} ${req.url} auth=${(req.headers.authorization || '').slice(0, 14)} apikey=${req.headers.apikey ? 'yes' : 'no'}`);
    const m = req.url!.match(/^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/?(.*)$/);
    if (!m) { res.writeHead(400); return res.end('{}'); }
    const key = decodeURIComponent(m[2]);
    if (req.method === 'POST') { files.set(key, body); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ Key: `${m[1]}/${key}` })); }
    if (req.method === 'GET') { const f = files.get(key); if (!f) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' })); } res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(f); }
    if (req.method === 'DELETE') { const { prefixes } = JSON.parse(body.toString()); for (const p of prefixes) files.delete(p); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('[]'); }
    res.writeHead(405); res.end();
  });
}).listen(4399, async () => {
  try {
    const s = new SupabaseStorageFileStorageService('http://127.0.0.1:4399', 'sb_secret_test', 'jobs-candidate-documents');
    const stored = await s.store('user-1', 'Mon CV (2026).pdf', Buffer.from('%PDF-1.4 hello').toString('base64'));
    assert.match(stored.storagePath, /^user-1\/[0-9a-f-]{36}-Mon_CV__2026_.pdf$/);
    assert.equal(stored.sizeBytes, 14);
    assert.equal((await s.retrieve(stored.storagePath))!.toString(), '%PDF-1.4 hello');
    await s.delete(stored.storagePath);
    assert.equal(await s.retrieve(stored.storagePath), null);
    await assert.rejects(() => s.retrieve('../etc/passwd'));
    await assert.rejects(() => s.store('u', 'big', Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64')));
    console.log('STORAGE ADAPTER OK');
  } catch (e) { console.error(log.join('\n')); console.error(e); process.exitCode = 1; } finally { srv.close(); }
});
