/* Run with: node apps/fashion/packages/fashion-domain/tests/onboarding.test.js */

const assert = require('assert');
const { createApplication, transition } = require('../src/onboarding');
const { createPartner } = require('../src/partner');

const partner = createPartner({
  id: 'partner_atelier', legalName: 'Atelier du Marais', countryId: 'country_fr',
  locales: ['fr'], categories: ['accessories_leather_goods'],
});

let app = createApplication('partner_atelier');
assert.strictEqual(app.status, 'applied');

// Skipping a state is rejected — applied cannot jump straight to active.
assert.throws(
  () => transition(app, 'active', { partner, feedReliabilityTier: 'live' }),
  /cannot move from "applied" to "active"/
);

app = transition(app, 'under_review');
app = transition(app, 'approved');

// Activating without a declared feed reliability tier is rejected —
// never silently defaults to "live".
assert.throws(
  () => transition(app, 'active', { partner }),
  /without a declared feed reliability tier/
);

app = transition(app, 'active', { partner, feedReliabilityTier: 'degraded' });
assert.strictEqual(app.status, 'active');
assert.strictEqual(app.feedReliabilityTier, 'degraded');
assert.strictEqual(app.history.length, 4);

// A rejected application is terminal — no further transitions.
let app2 = transition(createApplication('partner_x'), 'under_review');
app2 = transition(app2, 'rejected');
assert.throws(
  () => transition(app2, 'under_review'),
  /terminal state/
);

// A Partner declaring children eligibility cannot activate without the
// minor-safe acknowledgment — re-checked at activation, not just creation.
const kidsPartner = createPartner({
  id: 'partner_kids', legalName: 'Petits Pas', countryId: 'country_fr',
  locales: ['fr'], categories: ['clothing'], ageSegments: ['children'],
  minorSafeDataAcknowledged: true,
});
let kidsApp = transition(createApplication('partner_kids'), 'under_review');
kidsApp = transition(kidsApp, 'approved');
kidsApp = transition(kidsApp, 'active', { partner: kidsPartner, feedReliabilityTier: 'live' });
assert.strictEqual(kidsApp.status, 'active');

console.log('onboarding.js: all invariant checks passed.');
