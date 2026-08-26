const fs = require('fs');
const path = require('path');

const studio = path.resolve(__dirname, '..');
const templatePath = path.join(studio, 'src', 'template.html');
const i18nPath = path.join(studio, 'src', 'data', 'i18n.js');

const template = fs.readFileSync(templatePath, 'utf8');
const i18n = fs.readFileSync(i18nPath, 'utf8');

let failures = 0;

function check(name, pass) {
  if (pass) {
    console.log('PASS: ' + name);
  } else {
    failures += 1;
    console.error('FAIL: ' + name);
  }
}

check(
  'UX information architecture authority marker',
  template.includes('ZSTUDIO_UX_INFORMATION_ARCHITECTURE_V1')
);

check(
  'global Brand settings remain explicit',
  (template.match(/id="brandStep"/g) || []).length === 1
);

check(
  'Media is explicit workflow step 1',
  (template.match(/id="mediaStep"/g) || []).length === 1 &&
  template.includes('data-i18n="mediaStepLabel"')
);

check(
  'Text is explicit workflow step 2',
  (template.match(/id="textStep"/g) || []).length === 1 &&
  template.includes('data-i18n="textStepLabel"')
);

check(
  'Format and Style remain explicit advanced step',
  (template.match(/id="advancedOptions"/g) || []).length === 1 &&
  template.includes('data-i18n="formatStyleLabel"')
);

check(
  'editor ordering contract is explicit',
  template.includes('#brandStep { order:0; }') &&
  template.includes('#mediaStep { order:1; }') &&
  template.includes('#textStep { order:2; }') &&
  template.includes('#advancedOptions { order:3; }')
);

check(
  'Media step is translated in all six interface languages',
  (i18n.match(/mediaStepLabel:/g) || []).length === 6
);

check(
  'Text remains workflow step 2 in all six languages',
  (i18n.match(/textStepLabel:\s*'2 ·/g) || []).length === 6
);

check(
  'Format and Style is workflow step 3 in all six languages',
  (i18n.match(/formatStyleLabel:\s*'3 ·/g) || []).length === 6
);

const generated = [
  path.join(studio, 'app', 'index.html'),
  path.join(studio, 'app', 'my-studio.html'),
  path.join(studio, 'native', 'www', 'index.html'),
];

for (const file of generated) {
  check(
    path.relative(studio, file) + ' carries UX authority',
    fs.existsSync(file) &&
    fs.readFileSync(file, 'utf8')
      .includes('ZSTUDIO_UX_INFORMATION_ARCHITECTURE_V1')
  );
}

if (generated.every(fs.existsSync)) {
  const bodies = generated.map(file => fs.readFileSync(file, 'utf8'));

  check(
    'generated web/native HTML authority remains byte-identical',
    bodies[0] === bodies[1] && bodies[0] === bodies[2]
  );
}

if (failures) {
  console.error(
    '\nZ Studio UX information architecture: '
    + failures + ' failure(s)'
  );
  process.exit(1);
}

console.log('\nZ_STUDIO_UX_INFORMATION_ARCHITECTURE=PASS');
