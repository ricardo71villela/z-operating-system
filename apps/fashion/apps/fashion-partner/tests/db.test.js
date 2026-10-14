/* Run with: DATABASE_URL=postgres://claude:claude@localhost:5432/zos_test node apps/fashion/apps/fashion-partner/tests/db.test.js
   Requires the local Postgres instance with the integrated Fashion schema applied.
   This is a real database round-trip, not a mock — proves db.js's SQL
   actually matches the real table shape and onboarding state machine. */

const assert = require('assert');
const {
  createPool, insertPartner, updatePartnerStatus, getPartner,
  getAuthUserEmail, getPartnerOfferPg, submitPartnerApplicationPg, resolveFashionPartnerIdsForAuthUser,
} = require('../src/db');

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
  assert.deepStrictEqual(fetched.categories, ['accessories_leather_goods'], 'enum arrays come back as arrays');
  assert.deepStrictEqual(fetched.ageSegments, ['adults']);

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

  // --- Store adhesion: one transaction links the applicant to the new store.
  const offer = await getPartnerOfferPg(pool);
  assert.strictEqual(offer.monthlySubscriptionFeeMinorUnits, 3500);
  assert.strictEqual(offer.commissionRatesPercent.accessories_leather_goods, 15);
  assert.ok(offer.volumeDiscountTiers.length >= 1);

  const applicant = (await pool.query(
    `insert into auth.users (email) values ('adhesion-' || gen_random_uuid() || '@example.fr') returning id, email`
  )).rows[0];
  const other = (await pool.query(
    `insert into auth.users (email) values ('other-' || gen_random_uuid() || '@example.fr') returning id`
  )).rows[0];
  assert.strictEqual(await getAuthUserEmail(pool, applicant.id), applicant.email);
  assert.deepStrictEqual(await resolveFashionPartnerIdsForAuthUser(pool, applicant.id), [], 'manages nothing before applying');

  const siret = String(Date.now()).slice(-13).padStart(13, '7');
  let validSiret = null;
  for (let d = 0; d <= 9 && !validSiret; d += 1) {
    const { isValidSiret } = require('../../../packages/fashion-domain/src/partner-application');
    if (isValidSiret(siret + d)) validSiret = siret + d;
  }
  const application = {
    tradeName: 'Maison Léman', legalName: 'Maison Léman SARL', countryIso: 'FR',
    registrationNumber: validSiret, vatNumber: null, addressLine1: '12 rue Nationale', postalCode: '74200',
    city: 'Thonon-les-Bains', contactEmail: applicant.email, contactPhone: '+33450000000', website: null,
    categories: ['clothing', 'footwear'], ageSegments: ['adults', 'children'], minorSafeDataAcknowledged: true,
    locales: ['fr'], termsVersion: 'pt-2027-01',
  };
  const created = await submitPartnerApplicationPg(pool, applicant.id, application, { ...offer, termsUrl: 'https://x.test/terms' });
  assert.ok(created.partnerId && created.organisationId && created.applicationId);

  assert.deepStrictEqual(await resolveFashionPartnerIdsForAuthUser(pool, applicant.id), [created.partnerId],
    'the applicant now manages the new store through ZOS membership + binding');
  const storedPartner = await getPartner(pool, created.partnerId);
  assert.strictEqual(storedPartner.onboardingStatus, 'applied');
  assert.deepStrictEqual(storedPartner.ageSegments.sort(), ['adults', 'children']);
  const stored = (await pool.query(
    `select terms_version, terms_accepted_at, offer_snapshot, contact_email from fashion.partner_applications where id = $1`,
    [created.applicationId]
  )).rows[0];
  assert.strictEqual(stored.terms_version, 'pt-2027-01');
  assert.ok(stored.terms_accepted_at instanceof Date);
  assert.strictEqual(stored.offer_snapshot.monthlySubscriptionFeeMinorUnits, 3500);
  assert.strictEqual(stored.contact_email, applicant.email);

  await assert.rejects(
    () => submitPartnerApplicationPg(pool, applicant.id, { ...application, registrationNumber: '00000000000000' }, offer),
    (err) => err.code === 'fashion_application_pending'
  );
  await assert.rejects(
    () => submitPartnerApplicationPg(pool, other.id, { ...application, contactEmail: 'o@example.fr' }, offer),
    (err) => err.code === 'fashion_application_duplicate'
  );
  assert.deepStrictEqual(await resolveFashionPartnerIdsForAuthUser(pool, other.id), [], 'refused applicant is linked to nothing');

  // Once rejected, the same SIRET may apply again (and the applicant too).
  await updatePartnerStatus(pool, created.partnerId, { onboardingStatus: 'under_review' });
  await updatePartnerStatus(pool, created.partnerId, { onboardingStatus: 'rejected' });
  const again = await submitPartnerApplicationPg(pool, other.id, { ...application, contactEmail: 'o@example.fr' }, offer);
  assert.ok(again.partnerId);

  // Not callable by API roles other than the privileged connection.
  const grants = (await pool.query(`select
      has_function_privilege('anon', 'platform_internal.fashion_submit_partner_application(uuid,jsonb,jsonb)', 'execute') as anon,
      has_function_privilege('authenticated', 'platform_internal.fashion_submit_partner_application(uuid,jsonb,jsonb)', 'execute') as auth,
      has_function_privilege('service_role', 'platform_internal.fashion_submit_partner_application(uuid,jsonb,jsonb)', 'execute') as service`)).rows[0];
  assert.deepStrictEqual(grants, { anon: false, auth: false, service: false });

  await pool.end();
  console.log('db.js: real Postgres round-trip checks passed.');
}

run().catch((err) => { console.error(err); process.exit(1); });
