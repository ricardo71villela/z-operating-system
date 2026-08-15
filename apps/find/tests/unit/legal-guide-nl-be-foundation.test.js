const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');

const paths = {
  nl: 'content/legal/NL/ZFind_MasterPack_Netherlands_EN.md',
  be: 'content/legal/BE/ZFind_MasterPack_Belgique_FR.md',
  body: 'apps/zfind-web/src/body.html',
  app: 'apps/zfind-web/src/app.js',
  pkg: 'package.json',
  staticTest: 'tests/unit/static-view-routing-contract.test.js',
};

function full(p) {
  return path.join(ROOT, p);
}

function read(p) {
  return fs.readFileSync(full(p), 'utf8');
}

function sha(p) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(full(p)))
    .digest('hex');
}

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL: ${name}`);
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function section(body, route) {
  const token = `<section class="view" id="view-${route}">`;
  const start = body.indexOf(token);

  if (start < 0) return '';

  const end = body.indexOf('</section>', start);

  if (end < 0) return '';

  return body.slice(
    start,
    end + '</section>'.length
  );
}

const nl = read(paths.nl);
const be = read(paths.be);
const body = read(paths.body);
const app = read(paths.app);
const pkg = JSON.parse(read(paths.pkg));
const staticTest = read(paths.staticTest);

console.log('');
console.log('=== NL + BE LEGAL JURISDICTION FOUNDATION ===');

check(
  'NL canonical Master hash exact',
  sha(paths.nl) ===
    '904cb8f615423b6ab9029d3ba1ee081f511b9f941903e985f6824d149c26cd6d'
);

check(
  'BE canonical Master hash exact',
  sha(paths.be) ===
    '15e317952d326416e5d70a6b3ebbcdd8585ef684be2d83f57e4356dfb3c498d3'
);

for (const [label, master] of [
  ['NL', nl],
  ['BE', be],
]) {
  check(
    `${label} research remains DRAFT`,
    master.includes('**review_status:** DRAFT')
  );

  check(
    `${label} authority mode is PRIMARY_OFFICIAL`,
    master.includes('**authority_mode:** PRIMARY_OFFICIAL')
  );

  check(
    `${label} re-audit horizon exact`,
    master.includes('**research_date:** 2026-08-15')
      && master.includes(
        '**rules_checked_through:** 2026-08-15'
      )
      && master.includes('**official_reaudit_scope:**')
  );
}

check(
  'NL corrected startersvrijstelling retained',
  nl.includes(
    "does **not** have to be the buyer's first-ever home"
  )
);

check(
  'NL six-month rule is not a blanket exemption',
  nl.includes('not a blanket exemption')
);

check(
  'NL Box 3 actual-return correction retained',
  nl.includes('actual-return counterevidence')
);

check(
  'NL own-use rule uses economic rental value',
  nl.includes('economic rental value')
);

check(
  'NL 2028 reform status retains 12 February 2026',
  nl.includes('12 February 2026')
);

check(
  'NL indefinite tenancy norm retained',
  nl.includes(
    'Indefinite residential tenancies are the norm since 1 July 2024'
  )
    && nl.includes('**indefinite-term contract**')
);

check(
  'BE Wallonia 3% correction retained',
  be.includes('**3%**')
);

check(
  'BE Flanders 2% correction retained',
  be.includes('**2%**')
);

check(
  'BE Brussels dual lease registration retained',
  be.includes('Irisrent') && be.includes('MyRent')
);

check(
  'BE Flemish tourist register retained',
  be.includes('Toerisme Vlaanderen')
);

check(
  'BE Walloon tourist register retained',
  be.includes('Tourisme Wallonie')
);

check(
  'BE 90-day figure is not an annual cap',
  be.includes(
    'Il ne constitue **pas un plafond annuel de 90 nuitées**'
  )
);

const newRoutes = [
  'legal-netherlands',
  'tourist-rental-netherlands',
  'legal-belgium',
  'tourist-rental-belgium',
];

for (const route of newRoutes) {
  check(
    `${route} public view exists exactly once`,
    occurrences(
      body,
      `id="view-${route}"`
    ) === 1
  );

  check(
    `${route} router case exists exactly once`,
    occurrences(
      app,
      `case '${route}': break;`
    ) === 1
  );

  check(
    `${route} is present in central static routing test`,
    staticTest.includes(`'${route}'`)
  );
}

const nlLegal = section(body, 'legal-netherlands');
const nlTourist = section(
  body,
  'tourist-rental-netherlands'
);
const beLegal = section(body, 'legal-belgium');
const beTourist = section(
  body,
  'tourist-rental-belgium'
);

check(
  'NL public legal surface contains €555,000 threshold',
  nlLegal.includes('€555,000')
);

check(
  'NL public legal surface contains 6.00% Box 3 marker',
  nlLegal.includes('6.00%')
);

check(
  'NL public legal surface contains economic rental value',
  nlLegal.includes('economic rental value')
);

check(
  'NL public legal surface contains indefinite tenancy norm',
  nlLegal.includes('indefinite-term tenancy is the statutory norm')
);

check(
  'NL tourist surface contains Amsterdam 15-night rule',
  nlTourist.includes('15 nights')
    && nlTourist.includes('1 April 2026')
);

check(
  'NL tourist surface scopes Amsterdam rule to named neighbourhoods',
  nlTourist.includes('Haarlemmerbuurt')
    && nlTourist.includes('Oude Pijp')
);

check(
  'BE public legal surface contains Wallonia 3%',
  beLegal.includes('3 %')
);

check(
  'BE public legal surface contains Flanders 2%',
  beLegal.includes('2 %')
);

check(
  'BE public legal surface contains Irisrent + MyRent',
  beLegal.includes('Irisrent')
    && beLegal.includes('MyRent')
);

check(
  'BE tourist surface contains Brussels 1-90 consecutive-day distinction',
  beTourist.includes('1 à 90 jours consécutifs')
    && beTourist.includes(
      'ne constitue pas un plafond annuel'
    )
);

check(
  'BE tourist surface contains Flemish regional registration',
  beTourist.includes('Vlaams Logiesdecreet')
    && beTourist.includes('Toerisme Vlaanderen')
);

check(
  'BE tourist surface contains Walloon regional registration',
  beTourist.includes('Code wallon du Tourisme')
    && beTourist.includes('Tourisme Wallonie')
);

check(
  'NL public surfaces retain local-counsel disclaimer',
  nlLegal.includes(
    'Consulting this information does not replace advice from a qualified local legal professional.'
  )
    && nlTourist.includes(
      'Consulting this information does not replace advice from a qualified local legal professional.'
    )
);

check(
  'BE public surfaces retain local-jurist disclaimer',
  beLegal.includes(
    'ne dispense pas de consulter un juriste local qualifié'
  )
    && beTourist.includes(
      'ne dispense pas de consulter un juriste local qualifié'
    )
);

check(
  'NL authority horizon visible',
  nlLegal.includes('15 August 2026')
);

check(
  'BE authority horizon visible',
  beLegal.includes('15 août 2026')
);

const legalRoutes = [
  'legal',
  'legal-es',
  'legal-fr',
  'legal-de',
  'legal-it',
  'legal-ie',
  'legal-england',
  'legal-scotland',
  'legal-wales',
  'legal-northern-ireland',
  'legal-netherlands',
  'legal-belgium',
];

const touristRoutes = [
  'al-manual',
  'al-manual-es',
  'tourist-rental-fr',
  'tourist-rental-de',
  'tourist-rental-it',
  'tourist-rental-ie',
  'tourist-rental-england',
  'tourist-rental-scotland',
  'tourist-rental-wales',
  'tourist-rental-northern-ireland',
  'tourist-rental-netherlands',
  'tourist-rental-belgium',
];

for (const route of legalRoutes) {
  const s = section(body, route);

  check(
    `${route} jurisdiction selector exposes Netherlands`,
    route === 'legal-netherlands'
      ? s.includes(
          'class="btn btn-gold" type="button" disabled>Netherlands</button>'
        )
      : s.includes("navigate('legal-netherlands')")
  );

  check(
    `${route} jurisdiction selector exposes Belgium`,
    route === 'legal-belgium'
      ? s.includes(
          'class="btn btn-gold" type="button" disabled>Belgique</button>'
        )
      : s.includes("navigate('legal-belgium')")
  );
}

for (const route of touristRoutes) {
  const s = section(body, route);

  check(
    `${route} tourist selector exposes Netherlands`,
    route === 'tourist-rental-netherlands'
      ? s.includes(
          'class="btn btn-gold" type="button" disabled>Netherlands</button>'
        )
      : s.includes(
          "navigate('tourist-rental-netherlands')"
        )
  );

  check(
    `${route} tourist selector exposes Belgium`,
    route === 'tourist-rental-belgium'
      ? s.includes(
          'class="btn btn-gold" type="button" disabled>Belgique</button>'
        )
      : s.includes(
          "navigate('tourist-rental-belgium')"
        )
  );
}

const coupled = app
  .split('\n')
  .some(
    line =>
      line.includes('state.lang')
      && /legal-netherlands|tourist-rental-netherlands|legal-belgium|tourist-rental-belgium/.test(
        line
      )
  );

check(
  'NL/BE jurisdiction is not inferred from UI locale',
  !coupled
);

check(
  'NL/BE regression is registered',
  pkg.scripts[
    'test:legal-guide-nl-be-foundation'
  ] ===
    'node tests/unit/legal-guide-nl-be-foundation.test.js'
);

check(
  'NL/BE regression participates in package check',
  pkg.scripts.check.includes(
    'npm run test:legal-guide-nl-be-foundation'
  )
);

for (const [label, s] of [
  ['NL legal', nlLegal],
  ['NL tourist', nlTourist],
  ['BE legal', beLegal],
  ['BE tourist', beTourist],
]) {
  check(
    `${label} does not leak source ledger`,
    !s.includes('TABLE OF SOURCES')
      && !s.includes('TABLEAU DES SOURCES')
      && !s.includes('STRUCTURED JSON')
      && !s.includes('VERSION STRUCTURÉE EN JSON')
  );

  check(
    `${label} does not falsely claim legal approval`,
    !s.includes('LEGAL_REVIEW_APPROVED=true')
      && !s.includes('qualified legal review completed')
  );
}

console.log('');

if (failed) {
  console.error(
    `NL/BE LEGAL FOUNDATION: ${passed} PASSED, ${failed} FAILED`
  );
  process.exit(1);
}

console.log(
  `NL/BE LEGAL FOUNDATION: ${passed}/${passed} PASSED`
);
