/* ============================================================
   Z FASHION PARTNER — access decision tests
   ============================================================
   Covers every branch of access.js without a server, a database or
   Supabase: the three findings of the 2026-10-14 launch audit
   (open Partner approval, client accounts addressed by URL only,
   silent fail-open when auth is not configured).
   ============================================================ */

const assert = require('assert');
const { isAuthRequired, loadAdminUserIds, decideAccess } = require('../src/access');

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

(async () => {
  // --- isAuthRequired: fail-closed by default in Postgres mode
  assert.strictEqual(isAuthRequired({ usingPostgres: false, env: {} }), false);
  assert.strictEqual(isAuthRequired({ usingPostgres: true, env: {} }), true);
  assert.strictEqual(isAuthRequired({ usingPostgres: true, env: { FASHION_ALLOW_UNAUTHENTICATED: '1' } }), false);
  assert.strictEqual(isAuthRequired({ usingPostgres: true, env: { FASHION_ALLOW_UNAUTHENTICATED: 'true' } }), true,
    'only the exact value "1" opts out');

  // --- loadAdminUserIds
  assert.deepStrictEqual(loadAdminUserIds({}), []);
  assert.deepStrictEqual(loadAdminUserIds({ FASHION_ADMIN_USER_IDS: ` ${ALICE} , ,${BOB}` }), [ALICE, BOB]);

  const allowAll = () => true;
  const msg = 'forbidden';

  // --- in-memory mode stays open (dev + tests/api.test.js)
  let d = await decideAccess({ usingPostgres: false, authRequired: false, authUserId: undefined, isAllowed: allowAll, forbiddenMessage: msg });
  assert.strictEqual(d.ok, true);

  // --- finding 3: Postgres mode + auth not configured => 503, never open
  d = await decideAccess({ usingPostgres: true, authRequired: true, authUserId: undefined, isAllowed: allowAll, forbiddenMessage: msg });
  assert.deepStrictEqual(d, { ok: false, status: 503, error: 'authentication is not configured on this server' });

  // explicit local opt-out still works
  d = await decideAccess({ usingPostgres: true, authRequired: false, authUserId: undefined, isAllowed: allowAll, forbiddenMessage: msg });
  assert.strictEqual(d.ok, true);

  // --- missing / invalid token => 401
  d = await decideAccess({ usingPostgres: true, authRequired: true, authUserId: null, isAllowed: allowAll, forbiddenMessage: msg });
  assert.deepStrictEqual(d, { ok: false, status: 401, error: 'authentication required' });

  // --- finding 2: a client may only act on their own account
  const sameClient = (clientId) => (userId) => userId === clientId;
  d = await decideAccess({ usingPostgres: true, authRequired: true, authUserId: ALICE, isAllowed: sameClient(ALICE), forbiddenMessage: msg });
  assert.deepStrictEqual(d, { ok: true, userId: ALICE });
  d = await decideAccess({ usingPostgres: true, authRequired: true, authUserId: ALICE, isAllowed: sameClient(BOB), forbiddenMessage: msg });
  assert.deepStrictEqual(d, { ok: false, status: 403, error: msg });

  // --- finding 1: Partner approval needs an admin; empty list = nobody
  const admins = (list) => (userId) => list.includes(userId);
  d = await decideAccess({ usingPostgres: true, authRequired: true, authUserId: ALICE, isAllowed: admins([ALICE]), forbiddenMessage: msg });
  assert.strictEqual(d.ok, true);
  d = await decideAccess({ usingPostgres: true, authRequired: true, authUserId: BOB, isAllowed: admins([ALICE]), forbiddenMessage: msg });
  assert.strictEqual(d.status, 403);
  d = await decideAccess({ usingPostgres: true, authRequired: true, authUserId: ALICE, isAllowed: admins([]), forbiddenMessage: msg });
  assert.strictEqual(d.status, 403);

  // --- async isAllowed (partner lookup) is awaited
  d = await decideAccess({ usingPostgres: true, authRequired: true, authUserId: ALICE, isAllowed: async () => false, forbiddenMessage: msg });
  assert.strictEqual(d.status, 403);

  console.log('fashion-partner access: all decision checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
