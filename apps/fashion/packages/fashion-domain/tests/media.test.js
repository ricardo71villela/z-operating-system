const assert = require('assert');
const m = require('../src/media');

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]);
const gif = Buffer.from('GIF89a......');
const html = Buffer.from('<html><script>alert(1)</script></html>');

// --- recognised by content
assert.strictEqual(m.sniffImageType(jpeg), 'image/jpeg');
assert.strictEqual(m.sniffImageType(png), 'image/png');
assert.strictEqual(m.sniffImageType(webp), 'image/webp');
assert.strictEqual(m.sniffImageType(gif), null);
assert.strictEqual(m.sniffImageType(html), null);
assert.strictEqual(m.sniffImageType(Buffer.from([0xff, 0xd8])), null, 'too short');

// --- upload validation
assert.deepStrictEqual(m.validateImageUpload({ declaredType: 'image/jpeg', bytes: jpeg }), { ok: true, contentType: 'image/jpeg', extension: 'jpg', byteSize: jpeg.length });
assert.strictEqual(m.validateImageUpload({ declaredType: 'image/webp; charset=binary', bytes: webp }).extension, 'webp');
assert.strictEqual(m.validateImageUpload({ declaredType: '', bytes: png }).contentType, 'image/png', 'type taken from content when not declared');
assert.deepStrictEqual(m.validateImageUpload({ declaredType: 'image/png', bytes: jpeg }), { ok: false, code: 'type_mismatch' });
assert.deepStrictEqual(m.validateImageUpload({ declaredType: 'image/jpeg', bytes: html }), { ok: false, code: 'unsupported_type' }, 'renamed HTML refused');
assert.deepStrictEqual(m.validateImageUpload({ declaredType: 'image/gif', bytes: gif }), { ok: false, code: 'unsupported_type' });
assert.deepStrictEqual(m.validateImageUpload({ declaredType: 'image/jpeg', bytes: Buffer.alloc(0) }), { ok: false, code: 'empty' });
const big = Buffer.concat([jpeg, Buffer.alloc(m.MAX_IMAGE_BYTES)]);
assert.deepStrictEqual(m.validateImageUpload({ declaredType: 'image/jpeg', bytes: big }), { ok: false, code: 'too_large' });

// --- paths built from ids only
const P = '11111111-1111-1111-1111-111111111111', R = '22222222-2222-2222-2222-222222222222', I = '33333333-3333-3333-3333-333333333333';
assert.strictEqual(m.productImagePath(P, R, I, 'jpg'), `partners/${P}/products/${R}/${I}.jpg`);
assert.strictEqual(m.logoPath(P, I, 'png'), `partners/${P}/logo/${I}.png`);
assert.throws(() => m.productImagePath('../x', R, I, 'jpg'), /partnerId/);
assert.throws(() => m.productImagePath(P, 'a/b', I, 'jpg'), /productId/);
assert.throws(() => m.productImagePath(P, R, I, 'svg'), /extension/);
assert.throws(() => m.logoPath(P, 'x y', 'png'), /imageId/);

// --- reorder
assert.ok(m.isValidImageOrder(['a', 'b', 'c'], ['c', 'a', 'b']));
assert.ok(!m.isValidImageOrder(['a', 'b'], ['a']), 'missing one');
assert.ok(!m.isValidImageOrder(['a', 'b'], ['a', 'a']), 'duplicate');
assert.ok(!m.isValidImageOrder(['a', 'b'], ['a', 'z']), 'foreign id');
assert.ok(!m.isValidImageOrder(['a'], 'a'), 'not a list');
assert.strictEqual(m.MAX_IMAGES_PER_PRODUCT, 8);

console.log('media.js: all invariant checks passed.');
