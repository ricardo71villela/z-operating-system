'use strict';

/* ============================================================
   Z FIND — SPRINT 1.12 VERIFICATION
   Safe Public Property Verification Read Path
   ============================================================

   This sprint establishes the safe PUBLIC boundary only.

   It deliberately does NOT:
   - expose verification_assessments directly to anon;
   - seed any public verification_kind;
   - render Verification in the Property UI yet;
   - derive Trust Score / Trust Level;
   - read partners.trust_level;
   - add a second automatic request to Property loading.

   Public Verification is opt-in by kind and returned only through
   zfind_public_property_verification(uuid).
   ============================================================ */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '../../..');

const MIGRATION_PATH = path.join(
  ROOT,
  'supabase/migrations/0019_public_property_verification_projection.sql'
);

const SERVICE_PATH = path.join(
  ROOT,
  'apps/zfind-web/src/services/public-verification.js'
);

const BUILD_PATH = path.join(
  ROOT,
  'apps/zfind-web/scripts/build.js'
);

const VIEWMODELS_PATH = path.join(
  ROOT,
  'apps/zfind-web/src/viewmodels.js'
);

const FILE_URL =
  'file://' +
  path.resolve(
    ROOT,
    'apps/zfind-web/dist/z-find-prototype.html'
  );

const migration = fs.readFileSync(
  MIGRATION_PATH,
  'utf8'
);

const service = fs.readFileSync(
  SERVICE_PATH,
  'utf8'
);

const build = fs.readFileSync(
  BUILD_PATH,
  'utf8'
);

const viewmodels = fs.readFileSync(
  VIEWMODELS_PATH,
  'utf8'
);

let pass = 0;
let fail = 0;

function check(condition, label) {
  if (condition) {
    pass += 1;
    console.log('  ✅', label);
    return;
  }

  fail += 1;
  console.log('  ❌', label);
}

function propertyMapperSection() {
  const start = viewmodels.indexOf(
    'function mapSupabasePropertyRowToDetailViewModel'
  );

  const end = viewmodels.indexOf(
    '/** Sprint 1.4:',
    start
  );

  assert(
    start >= 0,
    'Property mapper start not found'
  );

  assert(
    end > start,
    'Property mapper end not found'
  );

  return viewmodels.slice(start, end);
}

function propertyLoaderSection() {
  const start = viewmodels.indexOf(
    'async function loadPropertyDetail'
  );

  const end = viewmodels.indexOf(
    '/* ---------------- Sprint 1.8:',
    start
  );

  assert(
    start >= 0,
    'Property loader start not found'
  );

  assert(
    end > start,
    'Property loader end not found'
  );

  return viewmodels.slice(start, end);
}

console.log(
  '\n============================================================'
);
console.log(
  '  Z FIND — SPRINT 1.12 VERIFICATION'
);
console.log(
  '============================================================'
);

console.log(
  '\n=== 1. CANONICAL VERIFICATION TABLE STAYS PRIVATE ==='
);

check(
  !/grant[^;]*verification_assessments[^;]*to\s+anon/i.test(
    migration
  ),
  'No anon grant is introduced on verification_assessments'
);

check(
  /revoke\s+all\s+on\s+verification_assessments\s+from\s+anon\s*;/i.test(
    migration
  ),
  'Migration explicitly revokes anon access to verification_assessments'
);

console.log(
  '\n=== 2. PUBLICATION POLICY IS EXPLICIT OPT-IN ==='
);

check(
  /create\s+table\s+verification_publication_rules/i.test(
    migration
  ),
  'Explicit verification_publication_rules table exists'
);

check(
  /is_public\s+boolean\s+not\s+null\s+default\s+false/i.test(
    migration
  ),
  'Verification kinds are private by default'
);

check(
  !/insert\s+into\s+verification_publication_rules/i.test(
    migration
  ),
  'Migration invents/seeds zero public verification kinds'
);

check(
  /admin:\s+full\s+access\s+to\s+verification_publication_rules/i.test(
    migration
  ),
  'Publication rules are controlled by the existing admin boundary'
);

check(
  /revoke\s+all\s+on\s+verification_publication_rules\s+from\s+anon\s*;/i.test(
    migration
  ),
  'anon cannot directly read the publication policy table'
);

console.log(
  '\n=== 3. SAFE RPC SECURITY CONTRACT ==='
);

const functionStart = migration.indexOf(
  'create function public.zfind_public_property_verification'
);

const functionEnd = migration.indexOf(
  'comment on function public.zfind_public_property_verification',
  functionStart
);

const functionRegion = migration.slice(
  functionStart,
  functionEnd
);

check(
  functionStart >= 0,
  'Public Verification RPC exists'
);

check(
  /security\s+definer/i.test(
    functionRegion
  ),
  'RPC is SECURITY DEFINER'
);

check(
  /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i.test(
    functionRegion
  ),
  'RPC pins search_path to public with pg_temp explicitly last'
);

check(
  /from\s+public\.verification_assessments\s+va/i.test(
    functionRegion
  ) &&
  /join\s+public\.verification_publication_rules\s+vpr/i.test(
    functionRegion
  ) &&
  /from\s+public\.representations\s+r/i.test(
    functionRegion
  ) &&
  /join\s+public\.listings\s+l/i.test(
    functionRegion
  ),
  'SECURITY DEFINER relation references are schema-qualified'
);

check(
  /revoke\s+all[\s\S]*zfind_public_property_verification\(uuid\)[\s\S]*from\s+public/i.test(
    functionRegion
  ),
  'Default PUBLIC function execution privilege is revoked'
);

check(
  /grant\s+execute[\s\S]*zfind_public_property_verification\(uuid\)[\s\S]*to\s+anon,\s*authenticated/i.test(
    functionRegion
  ),
  'Only deliberate anon/authenticated EXECUTE grant is added'
);

console.log(
  '\n=== 4. MARKETPLACE VISIBILITY GATE ==='
);

check(
  /r\.target_type\s*=\s*'property'/i.test(
    functionRegion
  ),
  'RPC explicitly scopes Representation to Property'
);

check(
  /r\.property_id\s*=\s*p_property_id/i.test(
    functionRegion
  ),
  'RPC explicitly binds Representation to requested Property'
);

check(
  /r\.status\s*=\s*'active'/i.test(
    functionRegion
  ),
  'RPC requires active Representation'
);

check(
  /l\.representation_id\s*=\s*r\.id/i.test(
    functionRegion
  ),
  'RPC links Listing through the Representation'
);

check(
  /l\.status\s*=\s*'published'/i.test(
    functionRegion
  ),
  'RPC requires a published Listing'
);

console.log(
  '\n=== 5. LATEST / POSITIVE / CURRENT SEMANTICS ==='
);

check(
  /partition\s+by\s+va\.verification_kind/i.test(
    functionRegion
  ),
  'Assessments are grouped by verification kind'
);

check(
  /order\s+by\s+va\.assessed_at\s+desc,\s*va\.id\s+desc/i.test(
    functionRegion
  ),
  'Latest assessment wins deterministically'
);

check(
  /latest\.rn\s*=\s*1/i.test(
    functionRegion
  ),
  'Only the latest assessment for each kind can project'
);

check(
  /latest\.outcome\s+in\s*\(\s*'verified'\s*,\s*'partially_verified'\s*\)/i.test(
    functionRegion
  ),
  'Only positive Verification outcomes can project'
);

check(
  /latest\.expires_at\s+is\s+null[\s\S]*latest\.expires_at\s*>\s*now\(\)/i.test(
    functionRegion
  ),
  'Expired positive assessments are excluded'
);

console.log(
  '\n=== 6. PUBLIC RETURN SHAPE ==='
);

const returnsMatch = migration.match(
  /returns\s+table\s*\(([\s\S]*?)\)\s*language\s+sql/i
);

check(
  !!returnsMatch,
  'RPC RETURNS TABLE signature found'
);

if (returnsMatch) {
  const returnsBlock = returnsMatch[1];

  const required = [
    'verification_kind',
    'outcome',
    'assessed_at',
    'expires_at'
  ];

  for (const field of required) {
    check(
      new RegExp(
        `\\b${field}\\b`,
        'i'
      ).test(returnsBlock),
      `Safe public return contains ${field}`
    );
  }

  const forbidden = [
    'id',
    'confidence',
    'source_reference',
    'evidence',
    'assessor_profile_id',
    'partner_id',
    'representation_id',
    'property_id',
    'development_id'
  ];

  for (const field of forbidden) {
    check(
      !new RegExp(
        `\\b${field}\\b`,
        'i'
      ).test(returnsBlock),
      `Public return does not leak ${field}`
    );
  }
}

console.log(
  '\n=== 7. PUBLIC WEB ADAPTER BOUNDARY ==='
);

check(
  /client\.rpc\s*\(\s*['"]zfind_public_property_verification['"]/i.test(
    service
  ),
  'Public adapter reads through the safe RPC'
);

check(
  !/\.from\s*\(\s*['"]verification_assessments['"]\s*\)/i.test(
    service
  ),
  'Public adapter never queries verification_assessments directly'
);

check(
  /return\s*\{\s*listPublicPropertyVerification\s*\}\s*;/m.test(
    service
  ),
  'Public adapter exports exactly its read operation'
);

const executableService = service
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

for (const forbidden of [
  'trust_level',
  'trustScore',
  'confidence',
  'source_reference',
  'evidence',
  'assessor_profile_id'
]) {
  check(
    !executableService.includes(forbidden),
    `Executable public adapter does not consume ${forbidden}`
  );
}

console.log(
  '\n=== 8. BUILD + VIEWMODEL SEPARATION ==='
);

check(
  build.includes(
    "const publicVerificationService = read('services/public-verification.js');"
  ),
  'Public Verification service is read by the Web builder'
);

const serviceBundlePos = build.indexOf(
  "+ publicVerificationService + '\\n'"
);

const viewmodelsBundlePos = build.indexOf(
  "+ geography + '\\n' + i18n + '\\n' + viewmodels"
);

check(
  serviceBundlePos >= 0 &&
  viewmodelsBundlePos > serviceBundlePos,
  'Public Verification adapter is bundled before viewmodels'
);

const mapper = propertyMapperSection();

check(
  mapper.includes(
    'verification: null'
  ),
  'Property view-model has an explicit Verification boundary'
);

check(
  mapper.includes(
    'trust: null'
  ),
  'Trust remains separately null'
);

check(
  !/trustScore|TRUST_SCORE|TRUST_LEVELS/.test(
    mapper
  ),
  'Property mapper derives no Trust Score'
);

const loader = propertyLoaderSection();

check(
  !loader.includes(
    'listPublicPropertyVerification'
  ),
  'Property detail does not automatically add a Verification RPC yet'
);

console.log(
  '\n=== 9. BROWSER RUNTIME CONTRACT ==='
);

async function browserContract() {
  const browser = await chromium.launch(
    process.env.LOCAL_SANDBOX_CHROMIUM_PATH
      ? {
          executablePath:
            process.env.LOCAL_SANDBOX_CHROMIUM_PATH
        }
      : {}
  );

  try {
    const page = await browser.newPage();

    const pageErrors = [];
    const rpcRequests = [];

    page.on(
      'pageerror',
      error => {
        pageErrors.push(
          error.message
        );
      }
    );

    await page.route(
      '**/rest/v1/rpc/zfind_public_property_verification**',
      route => {
        let body = {};

        try {
          body = JSON.parse(
            route.request().postData() || '{}'
          );
        } catch (error) {}

        rpcRequests.push({
          method: route.request().method(),
          body
        });

        const isEmptyScenario =
          body.p_property_id ===
          '22222222-2222-2222-2222-222222222222';

        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            isEmptyScenario
              ? []
              : [
                  {
                    verification_kind:
                      'ownership_document',
                    outcome:
                      'verified',
                    assessed_at:
                      '2026-08-12T10:00:00Z',
                    expires_at:
                      null
                  }
                ]
          )
        });
      }
    );

    // Simulator is deliberately used as a neutral host route.
    // Sprint 1.12 does not wire Verification into Property rendering.
    await page.goto(
      FILE_URL + '#/en/simulator'
    );

    await page.waitForTimeout(250);

    const exports = await page.evaluate(
      () =>
        Object.keys(
          window.ZFindServices.publicVerification || {}
        ).sort()
    );

    check(
      JSON.stringify(exports) ===
        JSON.stringify([
          'listPublicPropertyVerification'
        ]),
      'Built runtime registers exactly one public Verification operation'
    );

    const positive = await page.evaluate(
      async () =>
        window.ZFindServices.publicVerification
          .listPublicPropertyVerification(
            '11111111-1111-1111-1111-111111111111'
          )
    );

    check(
      rpcRequests.length === 1,
      'One adapter call performs exactly one RPC request'
    );

    check(
      rpcRequests[0] &&
      rpcRequests[0].method === 'POST',
      'Supabase RPC is called with POST'
    );

    check(
      rpcRequests[0] &&
      rpcRequests[0].body &&
      rpcRequests[0].body.p_property_id ===
        '11111111-1111-1111-1111-111111111111',
      'RPC receives the requested Property id'
    );

    check(
      positive &&
      positive.error === null &&
      Array.isArray(positive.data) &&
      positive.data.length === 1,
      'Positive safe projection is returned successfully'
    );

    const projectedKeys =
      positive &&
      positive.data &&
      positive.data[0]
        ? Object.keys(
            positive.data[0]
          ).sort()
        : [];

    check(
      JSON.stringify(projectedKeys) ===
        JSON.stringify([
          'assessed_at',
          'expires_at',
          'outcome',
          'verification_kind'
        ]),
      'Browser receives only the four approved public fields'
    );

    const emptyResult = await page.evaluate(
      async () =>
        window.ZFindServices.publicVerification
          .listPublicPropertyVerification(
            '22222222-2222-2222-2222-222222222222'
          )
    );

    check(
      emptyResult &&
      emptyResult.error === null &&
      Array.isArray(emptyResult.data) &&
      emptyResult.data.length === 0,
      'Zero public Verification rows is a valid empty result, not an error'
    );

    const requestsBeforeInvalid =
      rpcRequests.length;

    const invalid = await page.evaluate(
      async () =>
        window.ZFindServices.publicVerification
          .listPublicPropertyVerification('')
    );

    check(
      invalid &&
      invalid.error &&
      invalid.error.type ===
        'validation_error',
      'Missing Property id returns validation_error'
    );

    check(
      rpcRequests.length ===
        requestsBeforeInvalid,
      'Invalid Property id is rejected before any RPC call'
    );

    check(
      pageErrors.length === 0,
      `No browser page errors (${JSON.stringify(pageErrors)})`
    );

    await page.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  await browserContract();

  console.log(
    '\n============================================================'
  );
  console.log(
    `RESULT: ${pass} passed, ${fail} failed`
  );
  console.log(
    '============================================================'
  );

  if (fail > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
