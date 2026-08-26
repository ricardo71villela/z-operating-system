const fs = require('fs');
const path = require('path');

const studio = path.resolve(__dirname, '..');
const catalogPath = path.join(
  studio,
  'commercial',
  'store-products.v1.json'
);

const catalog = JSON.parse(
  fs.readFileSync(catalogPath, 'utf8')
);

let failures = 0;

function check(name, pass) {
  if (pass) {
    console.log('PASS: ' + name);
  } else {
    failures += 1;
    console.error('FAIL: ' + name);
  }
}

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

const expectedPlans = {
  weekly: {
    priceMinor: 599,
    appleProductId:
      'com.zoperatingsystem.zstudio.subscription.weekly',
    googleBasePlanId: 'weekly'
  },
  monthly: {
    priceMinor: 1499,
    appleProductId:
      'com.zoperatingsystem.zstudio.subscription.monthly',
    googleBasePlanId: 'monthly'
  },
  annual: {
    priceMinor: 11999,
    appleProductId:
      'com.zoperatingsystem.zstudio.subscription.annual',
    googleBasePlanId: 'annual'
  }
};

check(
  'store product authority marker',
  catalog.authority === 'ZSTUDIO_STORE_PRODUCT_AUTHORITY_V1'
);

check(
  'canonical native app id',
  catalog.appId === 'com.zoperatingsystem.zstudio'
);

check(
  'commercial target currency is EUR',
  catalog.commercialTargetCurrency === 'EUR'
);

check(
  'commercial trial is exactly 3 days',
  catalog.trialDays === 3
);

check(
  'canonical plans are exactly weekly/monthly/annual',
  exactKeys(catalog.plans, ['weekly', 'monthly', 'annual'])
);

check(
  'permanent free plan does not exist',
  !Object.prototype.hasOwnProperty.call(catalog.plans, 'free')
);

const appleProductIds = [];
const appleGroups = [];
const appleLevels = [];

const googleProductIds = [];
const googleCompositeIds = [];
const googleBasePlanIds = [];

const applePlanMap = new Map();
const googlePlanMap = new Map();

for (const [planCode, expected] of Object.entries(expectedPlans)) {
  const plan = catalog.plans[planCode];

  check(
    `${planCode}: plan exists`,
    Boolean(plan)
  );

  if (!plan) {
    continue;
  }

  check(
    `${planCode}: billing cadence matches plan`,
    plan.billingCadence === planCode
  );

  check(
    `${planCode}: commercial target price`,
    plan.commercialTargetPriceMinor === expected.priceMinor &&
      Number.isInteger(plan.commercialTargetPriceMinor) &&
      plan.commercialTargetPriceMinor > 0
  );

  check(
    `${planCode}: Apple product id exact`,
    plan.apple &&
      plan.apple.productId === expected.appleProductId
  );

  check(
    `${planCode}: Apple subscription group exact`,
    plan.apple &&
      plan.apple.subscriptionGroupKey === 'zstudio_access'
  );

  check(
    `${planCode}: Apple subscriptions share level 1`,
    plan.apple &&
      plan.apple.subscriptionLevel === 1
  );

  check(
    `${planCode}: Apple introductory offer is 3-day free trial`,
    plan.apple &&
      plan.apple.introOffer &&
      plan.apple.introOffer.type === 'free_trial' &&
      plan.apple.introOffer.durationDays === 3
  );

  check(
    `${planCode}: Google subscription product exact`,
    plan.google &&
      plan.google.productId === 'zstudio.access'
  );

  check(
    `${planCode}: Google base plan maps exactly to plan`,
    plan.google &&
      plan.google.basePlanId === expected.googleBasePlanId &&
      plan.google.basePlanId === planCode
  );

  check(
    `${planCode}: Google trial offer exact`,
    plan.google &&
      plan.google.offerId === 'trial-3d' &&
      plan.google.offerType === 'free_trial' &&
      plan.google.trialDurationDays === 3
  );

  check(
    `${planCode}: Google trial eligibility prevents repeat subscription trial`,
    plan.google &&
      plan.google.eligibility === 'never_had_subscription'
  );

  appleProductIds.push(plan.apple.productId);
  appleGroups.push(plan.apple.subscriptionGroupKey);
  appleLevels.push(plan.apple.subscriptionLevel);

  googleProductIds.push(plan.google.productId);
  googleBasePlanIds.push(plan.google.basePlanId);

  const googleComposite =
    `${plan.google.productId}:${plan.google.basePlanId}`;

  googleCompositeIds.push(googleComposite);

  applePlanMap.set(plan.apple.productId, planCode);
  googlePlanMap.set(googleComposite, planCode);
}

check(
  'Apple product IDs are unique',
  new Set(appleProductIds).size === 3
);

check(
  'Apple subscriptions use one group',
  new Set(appleGroups).size === 1 &&
    appleGroups[0] === 'zstudio_access'
);

check(
  'Apple subscriptions use one access level',
  new Set(appleLevels).size === 1 &&
    appleLevels[0] === 1
);

check(
  'Google uses exactly one subscription product',
  new Set(googleProductIds).size === 1 &&
    googleProductIds[0] === 'zstudio.access'
);

check(
  'Google base plan IDs are exactly weekly/monthly/annual',
  JSON.stringify([...new Set(googleBasePlanIds)].sort()) ===
    JSON.stringify(['annual', 'monthly', 'weekly'])
);

check(
  'Google sellable identity requires productId plus basePlanId',
  new Set(googleCompositeIds).size === 3 &&
    new Set(googleProductIds).size === 1
);

check(
  'Apple exact IDs resolve without fallback',
  applePlanMap.get(
    'com.zoperatingsystem.zstudio.subscription.weekly'
  ) === 'weekly' &&
    applePlanMap.get(
      'com.zoperatingsystem.zstudio.subscription.monthly'
    ) === 'monthly' &&
    applePlanMap.get(
      'com.zoperatingsystem.zstudio.subscription.annual'
    ) === 'annual' &&
    applePlanMap.get(
      'com.zoperatingsystem.zstudio.subscription.unknown'
    ) === undefined
);

check(
  'Google exact composite IDs resolve without fallback',
  googlePlanMap.get('zstudio.access:weekly') === 'weekly' &&
    googlePlanMap.get('zstudio.access:monthly') === 'monthly' &&
    googlePlanMap.get('zstudio.access:annual') === 'annual' &&
    googlePlanMap.get('zstudio.access:unknown') === undefined &&
    googlePlanMap.get('unknown:weekly') === undefined
);

check(
  'Google productId alone is deliberately insufficient to choose plan',
  new Set(googleProductIds).size === 1 &&
    googlePlanMap.get('zstudio.access') === undefined
);

const serialized = JSON.stringify(catalog).toLowerCase();

check(
  'no unlimited commercial authority',
  !serialized.includes('unlimited')
);

if (failures) {
  console.error(
    '\nZ Studio store product authority: ' +
      failures +
      ' failure(s)'
  );
  process.exit(1);
}

console.log(
  '\nZSTUDIO_STORE_PRODUCT_AUTHORITY_V1_PASS'
);
