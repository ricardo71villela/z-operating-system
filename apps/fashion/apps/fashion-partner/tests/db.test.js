/* Run with: DATABASE_URL=postgres://claude:claude@localhost:5432/zos_test node apps/fashion/apps/fashion-partner/tests/db.test.js
   Requires the local Postgres instance with the fashion schema applied
   (infrastructure/supabase/migrations/
   20260821090000_z_fashion_database_foundation_v1.sql already run).
   This is a real database round-trip, not a mock — proves db.js's SQL
   actually matches the real table shape, not just what I intended it to. */

const assert = require('assert');
const { createPool, insertPartner, updatePartnerStatus, getPartner } = require('../src/db');

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

  // Respect the database-owned lifecycle before testing the activation gate:
  // applied -> under_review -> approved -> active.
  await updatePartnerStatus(pool, partner.id, { onboardingStatus: 'under_review' });
  await updatePartnerStatus(pool, partner.id, { onboardingStatus: 'approved' });

  // Activating from approved without a feed reliability tier fails at the
  // DATABASE level (fashion_partners_active_requires_feed_tier CHECK), not
  // at the lifecycle trigger. This isolates the contract this assertion owns.
  await assert.rejects(
    () => updatePartnerStatus(pool, partner.id, { onboardingStatus: 'active' }),
    /fashion_partners_active_requires_feed_tier/
  );

  // With a feed tier, the valid approved -> active transition succeeds.
  const activated = await updatePartnerStatus(pool, partner.id, {
    onboardingStatus: 'active', feedReliabilityTier: 'live',
  });
  assert.strictEqual(activated.onboardingStatus, 'active');
  assert.strictEqual(activated.feedReliabilityTier, 'live');

  // A children-segment Partner without the minor-safe acknowledgment
  // fails to activate at the DATABASE level too — the same gate, enforced
  // twice independently (app + schema), each catching the other's bugs.
  const kidsPartner = await insertPartner(pool, {
    legalName: 'Petits Pas', countryIso: 'FR', locales: ['fr'],
    categories: ['clothing'], ageSegments: ['children'],
    minorSafeDataAcknowledged: false,
  });
  await updatePartnerStatus(pool, kidsPartner.id, { onboardingStatus: 'under_review' });
  await updatePartnerStatus(pool, kidsPartner.id, { onboardingStatus: 'approved' });
  await assert.rejects(
    () => updatePartnerStatus(pool, kidsPartner.id, { onboardingStatus: 'active', feedReliabilityTier: 'live' }),
    /fashion_partners_minor_safe_gate/
  );

  await pool.end();
  console.log('db.js: real Postgres round-trip checks passed.');
}

run().catch((err) => { console.error(err); process.exit(1); });
