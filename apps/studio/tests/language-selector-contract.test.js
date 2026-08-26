#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const template = fs.readFileSync(
  path.join(ROOT, 'src', 'template.html'),
  'utf8'
);

const state = fs.readFileSync(
  path.join(ROOT, 'src', 'state', 'state.js'),
  'utf8'
);

const main = fs.readFileSync(
  path.join(ROOT, 'src', 'main.js'),
  'utf8'
);

const functional = fs.readFileSync(
  path.join(ROOT, 'tests', 'run-tests.js'),
  'utf8'
);

const generator = fs.readFileSync(
  path.join(ROOT, 'tests', 'visual', 'generate-goldens.js'),
  'utf8'
);

let failures = 0;

function check(name, condition) {
  if (condition) {
    console.log('PASS:', name);
  } else {
    failures += 1;
    console.error('FAIL:', name);
  }
}

check(
  'English is the first-run state authority',
  /lang:\s*'en'/.test(state)
);

check(
  'document root starts in English',
  /<html\s+lang="en"/.test(template)
);

check(
  'top language control is a native select',
  /<select[\s\S]*id="langSwitch"[\s\S]*onchange="setLang\(this\.value\)"/.test(template)
);

check(
  'English is selected in source markup',
  /<option value="en" selected>EN<\/option>/.test(template)
);

for (const lang of ['en', 'pt', 'fr', 'es', 'de', 'it']) {
  check(
    `language picker contains ${lang.toUpperCase()}`,
    template.includes(`<option value="${lang}"`)
  );
}

check(
  'language picker has compact visual authority',
  template.includes('.lang-select {') &&
  template.includes('width:58px')
);

check(
  'runtime language list contains exactly six supported languages',
  main.includes(
    "const SUPPORTED_UI_LANGS = ['en', 'pt', 'fr', 'es', 'de', 'it'];"
  )
);

check(
  'invalid language falls back to English',
  main.includes(
    "l = SUPPORTED_UI_LANGS.includes(l) ? l : 'en';"
  )
);

check(
  'saved language remains restorable',
  main.includes(
    'state.lang = meta.lang || state.lang;'
  )
);

check(
  'document language follows active UI language',
  main.includes(
    'document.documentElement.lang = l;'
  )
);

check(
  'obsolete language button runtime is absent',
  !main.includes('#langSwitch button')
);

check(
  'functional suite proves English first-run',
  functional.includes(
    "idioma first-run é inglês"
  )
);

check(
  'golden fixture pins PT explicitly',
  generator.includes(
    "setLang('pt');"
  )
);

if (failures) {
  console.error();
  console.error(
    `Z_STUDIO_LANGUAGE_SELECTOR_CONTRACT=FAIL (${failures})`
  );
  process.exit(1);
}

console.log();
console.log(
  'Z_STUDIO_LANGUAGE_SELECTOR_CONTRACT=PASS'
);
