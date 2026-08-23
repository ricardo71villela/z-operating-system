/* Run with: DATABASE_URL=postgres://claude:claude@localhost:5432/zos_test node apps/fashion/apps/fashion-partner/tests/db.test.js
   Requires the local Postgres instance with the integrated Fashion schema applied.
   This is a real database round-trip, not a mock — proves db.js's SQL
   actually matches the real table shape and onboarding state machine. */

const assert = require('assert');
const { createPool, insertPartner, updatePartnerStatus, getPartner } = require('../src/db');

async function advanceToApproved(pool, partnerId) {
  await updatePartnerStatus(pool, partnerId, { onboardingStatus: 'under_review' });
  return updatePartnerStatus(pool, partnerId, { onboardingStatus: 'approved' });
}

async function run() {
  const pool = createPool();

  const partner = await insertPartner(pool, {
    legalName: 'Atelier du Marais',
    countryIso: 'FR',
    locales: ['fr'],
    categories: ['accessories_leather_goods'],
    ageSegments: ['adults'],
    minorSafeDataAcknowledged: false,
  });
  assert.strictEqual(partner.legalName, 'Atelier du Marais');
  assert.strictEqual(partner.onboardingStatus, 'applied');

  const fetched = await getPartner(pool, partner.id);
  assert.strictEqual(fetched.legalName, 'Atelier du Marais');

  // The integrated state machine requires applied -> under_review -> approved
  // before activation. Reach the legitimate activation boundary first so this
  // check proves the independent database feed-tier constraint rather than
  // being rejected earlier by transition ordering.
  const approved = await advanceToApproved(pool, partner.id);
  assert.strictEqual(approved.onboardingStatus, 'approved');

  // Activating without a feed reliability tier fails at the DATABASE level
  // (fashion_partners_active_requires_feed_tier), independently of JS.
  await assert.rejects(
    () => updatePartnerStatus(pool, partner.id, { onboardingStatus: 'active' }),
    /fashion_partners_active_requires_feed_tier/
  );

  // With a feed tier, the permitted approved -> active transition succeeds.
  const activated = await updatePartnerStatus(pool, partner.id, {
    onboardingStatus: 'active', feedReliabilityTier: 'live',
  });
  assert.strictEqual(activated.onboardingStatus, 'active');
  assert.strictEqual(activated.feedReliabilityTier, 'live');

  // A children-segment Partner without the minor-safe acknowledgment must also
  // traverse the real state machine before the activation constraint is tested.
  const kidsPartner = await insertPartner(pool, {
    legalName: 'Petits Pas', countryIso: 'FR', locales: ['fr'],
    categories: ['clothing'], ageSegments: ['children'],
    minorSafeDataAcknowledged: false,
  });
  await advanceToApproved(pool, kidsPartner.id);
  await assert.rejects(
    () => updatePartnerStatus(pool, kidsPartner.id, { onboardingStatus: 'active', feedReliabilityTier: 'live' }),
    /fashion_partners_minor_safe_gate/
  );

  await pool.end();
  console.log('db.js: real Postgres round-trip checks passed.');
}

run().catch((err) => { console.error(err); process.exit(1); });
